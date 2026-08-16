import os from "os";
import path from "path";
import fs from "fs/promises";
import { execFile } from "child_process";
import { promisify } from "util";
import { logger } from "../logger/logger";
import { AppError } from "../utils/AppError";
import { DeploymentFile, getContentType } from "../aws/s3.service";

const execFileAsync = promisify(execFile);

const BUILD_TIMEOUT_MS = 8 * 60 * 1000; // 8-minute timeout per command

export interface BuildResult {
  files: DeploymentFile[];
  buildDurationMs: number;
}

export class BuildExecutorService {
  /**
   * Safe environment variables for child processes.
   * Preserves PATH for system utilities (git, npm) on Linux and Windows.
   */
  private getSafeEnvironment(): NodeJS.ProcessEnv {
    return {
      PATH: process.env.PATH || "/usr/local/bin:/usr/bin:/bin",
      Path: process.env.Path || process.env.PATH,
      NODE_ENV: "production",
      HOME: os.tmpdir(),
      USER: "cloudship-worker",
      CI: "true", // Disables interactive prompts in many tools
    };
  }

  /**
   * Executes a command in a child process with timeout and environment isolation.
   * Cross-platform support for Windows (npm.cmd) and Linux (npm).
   */
  private async runCommand(
    file: string,
    args: string[],
    cwd: string
  ): Promise<string> {
    const isWindows = process.platform === "win32";
    const executable = isWindows && file === "npm" ? "npm.cmd" : file;

    try {
      const { stdout, stderr } = await execFileAsync(executable, args, {
        cwd,
        timeout: BUILD_TIMEOUT_MS,
        env: this.getSafeEnvironment(),
        maxBuffer: 50 * 1024 * 1024, // 50MB buffer
        shell: isWindows,
      });

      if (stderr) {
        logger.debug(`[BuildExecutor] ${file} stderr: ${stderr.substring(0, 500)}`);
      }

      return stdout;
    } catch (error: any) {
      if (error.killed) {
        throw new AppError(408, `Command '${file}' timed out after 8 minutes`);
      }
      throw new AppError(
        500,
        `Build process error (${file}): ${error.stderr || error.message}`
      );
    }
  }

  /**
   * Detects the directory from which to run install + build.
   * Handles monorepos where the frontend/ subdirectory has its own package.json.
   */
  private async readPackageJson(dir: string): Promise<Record<string, any> | null> {
    try {
      const raw = await fs.readFile(path.join(dir, "package.json"), "utf-8");
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }

  /**
   * Smart build directory detection:
   *  1. If root package.json has a "build" script → build from root (most common case).
   *  2. Otherwise scan known subdirectory names for their own package.json with a build script.
   *  3. Fallback: any subdirectory with a package.json (even without a build script).
   *  4. Final fallback: root (static HTML site — no npm needed).
   */
  private async detectBuildDir(sandboxDir: string): Promise<{ buildDir: string; isStaticSite: boolean }> {
    // ── 1. Check root package.json ──────────────────────────────────────────
    const rootPkg = await this.readPackageJson(sandboxDir);
    if (rootPkg?.scripts?.build) {
      logger.info(`📁 [BuildExecutor] Root package.json has a build script — building from root`);
      return { buildDir: sandboxDir, isStaticSite: false };
    }

    // ── 2. Scan common frontend subdirectory names ────────────────────────
    const subDirs = [
      "frontend", "client", "app", "web", "ui",
      "webapp", "react-app", "vue-app", "site",
      "packages/frontend", "packages/web", "apps/web", "apps/client",
    ];
    // First pass: prefer subdirs that have a build script
    for (const sub of subDirs) {
      const subPath = path.join(sandboxDir, sub);
      const subPkg = await this.readPackageJson(subPath);
      if (subPkg?.scripts?.build) {
        logger.info(`📁 [BuildExecutor] Found buildable subdirectory: ${sub}/`);
        return { buildDir: subPath, isStaticSite: false };
      }
    }
    // Second pass: any subdir with a package.json (may have an implicit build via framework)
    for (const sub of subDirs) {
      const subPath = path.join(sandboxDir, sub);
      const subPkg = await this.readPackageJson(subPath);
      if (subPkg !== null) {
        logger.info(`📁 [BuildExecutor] Found frontend subdirectory (no build script): ${sub}/`);
        return { buildDir: subPath, isStaticSite: false };
      }
    }

    // ── 3. Check if root has a package.json (even without a build script) ──
    if (rootPkg !== null) {
      logger.info(`📁 [BuildExecutor] Root package.json found (no build script) — attempting root build`);
      return { buildDir: sandboxDir, isStaticSite: false };
    }

    // ── 4. Pure static site (no package.json anywhere) ────────────────────
    logger.info(`📁 [BuildExecutor] No package.json found — treating as static HTML site`);
    return { buildDir: sandboxDir, isStaticSite: true };
  }

  /**
   * Finds the output directory produced by the build.
   * Checks all common framework output directories.
   * Throws if no built output is found.
   */
  private async detectOutputDir(buildDir: string): Promise<string> {
    const candidates = [
      "dist",          // Vite, Rollup, Parcel, Astro
      "build",         // Create React App, Gatsby
      "out",           // Next.js static export (next export)
      ".output/public", // Nuxt 3
      ".next",         // Next.js (SSR — serve as static if exported)
      "public",        // Hugo, Jekyll (when output dir is public)
      "_site",         // Jekyll, Eleventy
      "www",           // Ionic, some older tools
      "output",        // Some custom configs
      "storybook-static", // Storybook
    ];
    for (const candidate of candidates) {
      const candidatePath = path.join(buildDir, candidate);
      try {
        await fs.access(candidatePath);
        const contents = await fs.readdir(candidatePath);
        if (contents.length > 0) {
          logger.info(`📦 [BuildExecutor] Found build output in: ${candidate}/`);
          return candidatePath;
        }
      } catch {
        // Not found, try next
      }
    }
    throw new AppError(
      500,
      `Build produced no recognisable output directory (dist/, build/, out/, etc.). ` +
      `Ensure your project has a valid "build" script in package.json.`
    );
  }

  /**
   * Recursively collects all files from a build output directory.
   */
  private async collectFiles(
    dir: string,
    baseDir: string = dir
  ): Promise<DeploymentFile[]> {
    const files: DeploymentFile[] = [];
    const entries = await fs.readdir(dir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        const subFiles = await this.collectFiles(fullPath, baseDir);
        files.push(...subFiles);
      } else if (entry.isFile()) {
        const relativePath = path
          .relative(baseDir, fullPath)
          .replace(/\\/g, "/");
        const content = await fs.readFile(fullPath);
        files.push({
          relativePath,
          content,
          contentType: getContentType(entry.name),
        });
      }
    }

    return files;
  }

  /**
   * Executes a complete real build: git clone → npm install → npm build → collect dist files.
   */
  async executeBuild(
    deploymentId: string,
    repoUrl: string,
    onStatusChange?: (status: string) => Promise<void>
  ): Promise<BuildResult> {
    const startTime = Date.now();
    const sandboxDir = path.join(os.tmpdir(), "cloudship-builds", deploymentId);

    try {
      // Create sandbox directory
      await fs.mkdir(sandboxDir, { recursive: true });
      logger.info(`📁 [BuildExecutor] Created sandbox: ${sandboxDir}`);

      // ── 1. CLONING ──────────────────────────────────────────────────────────
      if (onStatusChange) await onStatusChange("CLONING");
      logger.info(`📦 [BuildExecutor] Cloning ${repoUrl}...`);
      await this.runCommand("git", ["clone", "--depth", "1", repoUrl, "."], sandboxDir);

      // ── 2. DETECT BUILD DIRECTORY (smart monorepo + static site detection) ─
      const { buildDir, isStaticSite } = await this.detectBuildDir(sandboxDir);

      if (isStaticSite) {
        // ── STATIC HTML SITE: no npm needed, serve root directly ────────────
        logger.info(`🌐 [BuildExecutor] Static HTML site detected — skipping npm install/build`);
        if (onStatusChange) await onStatusChange("UPLOADING");
        const files = await this.collectFiles(sandboxDir);
        if (files.length === 0) {
          throw new AppError(500, "Repository has no files to deploy");
        }
        logger.info(`✅ [BuildExecutor] Collected ${files.length} static files for upload`);
        return { files, buildDurationMs: Date.now() - startTime };
      }

      // ── 3. INSTALLING ────────────────────────────────────────────────────
      if (onStatusChange) await onStatusChange("INSTALLING");
      logger.info(`📥 [BuildExecutor] Installing npm dependencies in: ${path.relative(sandboxDir, buildDir) || "."}`);
      await this.runCommand("npm", ["install", "--ignore-scripts"], buildDir);

      // ── 4. BUILDING ──────────────────────────────────────────────────────
      if (onStatusChange) await onStatusChange("BUILDING");
      logger.info(`⚙️ [BuildExecutor] Running npm run build...`);
      await this.runCommand("npm", ["run", "build"], buildDir);
      // ⚠️  No silent swallow here — if build fails, the error propagates and
      //     the deployment is marked FAILED instead of uploading source files.

      // ── 5. LOCATE OUTPUT BUNDLE ──────────────────────────────────────────
      const outputDir = await this.detectOutputDir(buildDir);

      // ── 6. COLLECT FILES ──────────────────────────────────────────────────
      logger.info(`📦 [BuildExecutor] Collecting build files from: ${outputDir}`);
      const files = await this.collectFiles(outputDir);

      if (files.length === 0) {
        throw new AppError(500, "Build produced no output files");
      }

      logger.info(`✅ [BuildExecutor] Collected ${files.length} files for upload`);

      return {
        files,
        buildDurationMs: Date.now() - startTime,
      };
    } finally {
      // ── SANDBOX CLEANUP ────────────────────────────────────────────────────
      try {
        await fs.rm(sandboxDir, { recursive: true, force: true });
        logger.info(`🧹 [BuildExecutor] Cleaned up sandbox: ${sandboxDir}`);
      } catch (cleanupErr) {
        logger.error(cleanupErr, `Failed to delete sandbox: ${sandboxDir}`);
      }
    }
  }
}

export const buildExecutorService = new BuildExecutorService();
