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

export interface BuildOptions {
  branch?: string;
  frontendDir?: string;
  envVars?: Record<string, string>;
}

export class BuildExecutorService {
  /**
   * Safe environment variables for child processes.
   * Preserves PATH for system utilities (git, npm) on Linux and Windows.
   * Merges custom user build environment variables.
   */
  private getSafeEnvironment(extraEnv?: Record<string, string>): NodeJS.ProcessEnv {
    return {
      PATH: process.env.PATH || "/usr/local/bin:/usr/bin:/bin",
      Path: process.env.Path || process.env.PATH,
      NODE_ENV: "production",
      HOME: os.tmpdir(),
      USER: "cloudship-worker",
      CI: "true", // Disables interactive prompts
      ...extraEnv,
    };
  }

  /**
   * Executes a command in a child process with timeout and environment isolation.
   * Cross-platform support for Windows (npm.cmd) and Linux (npm).
   */
  private async runCommand(
    file: string,
    args: string[],
    cwd: string,
    extraEnv?: Record<string, string>
  ): Promise<string> {
    const isWindows = process.platform === "win32";
    const executable = isWindows && file === "npm" ? "npm.cmd" : file;

    try {
      const { stdout, stderr } = await execFileAsync(executable, args, {
        cwd,
        timeout: BUILD_TIMEOUT_MS,
        env: this.getSafeEnvironment(extraEnv),
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
   * Reads package.json from a directory safely.
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
   *  1. If explicitly provided by user and valid → use user choice.
   *  2. If root package.json has a "build" script → build from root.
   *  3. Otherwise scan known subdirectory names for package.json.
   *  4. Fallback: static site.
   */
  private async detectBuildDir(
    sandboxDir: string,
    overrideDir?: string
  ): Promise<{ buildDir: string; isStaticSite: boolean }> {
    // ── User Explicit Override ─────────────────────────────────────────────
    if (overrideDir && overrideDir !== "./" && overrideDir !== ".") {
      const cleanSub = overrideDir.replace(/^\.\//, "").trim();
      const customPath = path.join(sandboxDir, cleanSub);
      try {
        await fs.access(customPath);
        logger.info(`📁 [BuildExecutor] Using user-specified directory: ${cleanSub}/`);
        return { buildDir: customPath, isStaticSite: false };
      } catch {
        logger.warn(`⚠️ User specified directory '${cleanSub}' not found, falling back to auto-detection.`);
      }
    }

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
    for (const sub of subDirs) {
      const subPath = path.join(sandboxDir, sub);
      const subPkg = await this.readPackageJson(subPath);
      if (subPkg?.scripts?.build) {
        logger.info(`📁 [BuildExecutor] Found buildable subdirectory: ${sub}/`);
        return { buildDir: subPath, isStaticSite: false };
      }
    }
    for (const sub of subDirs) {
      const subPath = path.join(sandboxDir, sub);
      const subPkg = await this.readPackageJson(subPath);
      if (subPkg !== null) {
        logger.info(`📁 [BuildExecutor] Found frontend subdirectory (no build script): ${sub}/`);
        return { buildDir: subPath, isStaticSite: false };
      }
    }

    if (rootPkg !== null) {
      logger.info(`📁 [BuildExecutor] Root package.json found — attempting root build`);
      return { buildDir: sandboxDir, isStaticSite: false };
    }

    logger.info(`📁 [BuildExecutor] No package.json found — treating as static HTML site`);
    return { buildDir: sandboxDir, isStaticSite: true };
  }

  /**
   * Finds the output directory produced by the build.
   */
  private async detectOutputDir(buildDir: string): Promise<string> {
    const candidates = [
      "dist",
      "build",
      "out",
      ".output/public",
      ".next",
      "public",
      "_site",
      "www",
      "output",
      "storybook-static",
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
        // Continue
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
   * Executes a complete real build with custom branch, directory, and user environment variables.
   */
  async executeBuild(
    deploymentId: string,
    repoUrl: string,
    onStatusChange?: (status: string) => Promise<void>,
    options?: BuildOptions
  ): Promise<BuildResult> {
    const startTime = Date.now();
    const sandboxDir = path.join(os.tmpdir(), "cloudship-builds", deploymentId);

    try {
      await fs.mkdir(sandboxDir, { recursive: true });
      logger.info(`📁 [BuildExecutor] Created sandbox: ${sandboxDir}`);

      // ── 1. CLONING ──────────────────────────────────────────────────────────
      if (onStatusChange) await onStatusChange("CLONING");
      const branchArgs = options?.branch && options.branch !== "main" ? ["-b", options.branch] : [];
      logger.info(`📦 [BuildExecutor] Cloning ${repoUrl} (branch: ${options?.branch || "main"})...`);
      await this.runCommand("git", ["clone", "--depth", "1", ...branchArgs, repoUrl, "."], sandboxDir);

      // ── 2. DETECT BUILD DIRECTORY (smart monorepo + override support) ──────
      const { buildDir, isStaticSite } = await this.detectBuildDir(sandboxDir, options?.frontendDir);

      if (isStaticSite) {
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
      logger.info(`📥 [BuildExecutor] Installing npm dependencies...`);
      await this.runCommand("npm", ["install", "--ignore-scripts"], buildDir, options?.envVars);

      // ── 4. BUILDING ──────────────────────────────────────────────────────
      if (onStatusChange) await onStatusChange("BUILDING");
      logger.info(`⚙️ [BuildExecutor] Running npm run build...`);
      await this.runCommand("npm", ["run", "build"], buildDir, options?.envVars);

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
