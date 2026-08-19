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
   * Spreads process.env to preserve Windows system variables (SystemRoot, ComSpec, PATHEXT).
   * Prepends local & parent node_modules/.bin to PATH.
   */
  private getSafeEnvironment(
    cwd?: string,
    extraEnv?: Record<string, string>,
    nodeEnv?: string
  ): NodeJS.ProcessEnv {
    const nodeBinPath = cwd ? path.join(cwd, "node_modules", ".bin") : "";
    const parentNodeBinPath = cwd ? path.join(cwd, "..", "node_modules", ".bin") : "";
    const systemPath = process.env.PATH || process.env.Path || "/usr/local/bin:/usr/bin:/bin";

    const binPaths = [nodeBinPath, parentNodeBinPath].filter(Boolean).join(path.delimiter);
    const fullPath = `${binPaths}${path.delimiter}${systemPath}`;

    const env: NodeJS.ProcessEnv = {
      ...process.env,
      PATH: fullPath,
      Path: fullPath,
      HOME: os.tmpdir(),
      USER: "cloudship-worker",
      CI: "true", // Disables interactive prompts in npm
      ...extraEnv,
    };

    // Only set NODE_ENV if explicitly requested (e.g. for build step).
    // Do NOT set NODE_ENV=production during install — npm skips devDependencies
    // (like vite, tsc, react-scripts) when NODE_ENV=production.
    if (nodeEnv) {
      env["NODE_ENV"] = nodeEnv;
    } else {
      // Remove any inherited NODE_ENV=production from parent process
      delete env["NODE_ENV"];
    }

    return env;
  }

  /**
   * Executes a command in a child process with timeout and environment isolation.
   * Cross-platform support for Windows (npm.cmd) and Linux (npm).
   */
  private async runCommand(
    file: string,
    args: string[],
    cwd: string,
    extraEnv?: Record<string, string>,
    nodeEnv?: string
  ): Promise<string> {
    const isWindows = process.platform === "win32";
    // On Windows, always use shell:true so .cmd scripts (npm.cmd, vite.cmd) resolve correctly
    const executable = isWindows ? (file === "npm" ? "npm" : file) : file;

    try {
      const { stdout, stderr } = await execFileAsync(executable, args, {
        cwd,
        timeout: BUILD_TIMEOUT_MS,
        env: this.getSafeEnvironment(cwd, extraEnv, nodeEnv),
        maxBuffer: 50 * 1024 * 1024,
        shell: isWindows, // shell:true on Windows resolves .cmd extensions automatically
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
   *  1. Explicit user specified override (if provided and valid).
   *  2. Subdirectory monorepo check (frontend/, client/, web/, app/, etc.) FIRST.
   *  3. Root package.json check.
   *  4. Fallback: static site.
   */
  private async detectBuildDir(
    sandboxDir: string,
    overrideDir?: string
  ): Promise<{ buildDir: string; isStaticSite: boolean }> {
    // ── 1. User Explicit Override ───────────────────────────────────────────
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

    // ── 2. Monorepo Subdirectories Check (Prioritized over root) ────────────
    const subDirs = [
      "frontend", "client", "app", "web", "ui",
      "webapp", "react-app", "vue-app", "site",
      "packages/frontend", "packages/web", "apps/web", "apps/client",
    ];

    for (const sub of subDirs) {
      const subPath = path.join(sandboxDir, sub);
      const subPkg = await this.readPackageJson(subPath);
      if (subPkg?.scripts?.build) {
        logger.info(`📁 [BuildExecutor] Detected monorepo structure. Building from: ${sub}/`);
        return { buildDir: subPath, isStaticSite: false };
      }
    }

    // ── 3. Root package.json Check ──────────────────────────────────────────
    const rootPkg = await this.readPackageJson(sandboxDir);
    if (rootPkg?.scripts?.build) {
      logger.info(`📁 [BuildExecutor] Root package.json has a build script — building from root`);
      return { buildDir: sandboxDir, isStaticSite: false };
    }

    // ── 4. Any Subdirectory with package.json ──────────────────────────────
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
   * Generalized build tool detection from package.json devDependencies + dependencies.
   * Returns the primary bundler so we can inject the correct relative-base flags.
   */
  private async detectBuildTool(
    buildDir: string
  ): Promise<"vite" | "cra" | "next" | "parcel" | "astro" | "gatsby" | "unknown"> {
    const pkg = await this.readPackageJson(buildDir);
    if (!pkg) return "unknown";

    const allDeps: Record<string, string> = {
      ...(pkg.dependencies || {}),
      ...(pkg.devDependencies || {}),
    };

    if (allDeps["vite"]) return "vite";
    if (allDeps["react-scripts"]) return "cra";
    if (allDeps["next"]) return "next";
    if (allDeps["gatsby"]) return "gatsby";
    if (allDeps["astro"]) return "astro";
    if (allDeps["parcel"]) return "parcel";
    return "unknown";
  }

  /**
   * Resolves build command args and env overrides so the bundler emits
   * relative asset paths — works without modifying the user's repo.
   *
   * Strategy by tool:
   *  - Vite     : npm run build -- --base=./   (Vite's --base flag)
   *  - CRA      : PUBLIC_URL=.                  (CRA respects PUBLIC_URL)
   *  - Next.js  : no universal flag; fall back to HTML rewriting
   *  - Parcel   : PUBLIC_URL=. (works for most parcel setups)
   *  - Unknown  : PUBLIC_URL=. as generic webpack/rollup fallback
   */
  private async resolveBuildCommand(
    buildDir: string
  ): Promise<{ args: string[]; envOverrides: Record<string, string> }> {
    const tool = await this.detectBuildTool(buildDir);
    logger.info(`🔍 [BuildExecutor] Detected build tool: ${tool}`);

    switch (tool) {
      case "vite":
      case "astro":
        // Vite and Astro both support --base flag passed via -- separator
        return {
          args: ["run", "build", "--", "--base=./"],
          envOverrides: {},
        };

      case "cra":
      case "gatsby":
      case "parcel":
      case "unknown":
      default:
        // CRA, Gatsby, Parcel, Webpack, and most other tools respect PUBLIC_URL
        return {
          args: ["run", "build"],
          envOverrides: { PUBLIC_URL: "." },
        };

      case "next":
        // Next.js has no simple relative-base flag; rely on the HTML rewrite fallback
        return {
          args: ["run", "build"],
          envOverrides: {},
        };
    }
  }

  /**
   * Universal HTML rewrite safety-net.
   * Rewrites ALL .html files so absolute asset paths (/assets/) become relative (./assets/).
   * Also rewrites common patterns in .css files.
   * Used as a fallback for Next.js and any bundler not covered by resolveBuildCommand.
   */
  private rewriteForProxy(content: Uint8Array, filename: string, deploymentId: string): Uint8Array {
    const isHtml = /\.html?$/i.test(filename);
    const isCss = /\.css$/i.test(filename);

    if (!isHtml && !isCss) return content;

    let text = Buffer.from(content).toString("utf-8");

    if (isHtml) {
      // Inject <base> tag so ALL relative URLs resolve under the proxy prefix
      if (!text.includes("<base")) {
        const baseTag = `<base href="/sites/${deploymentId}/">`;
        text = text.replace(/<head([^>]*)>/i, `<head$1>${baseTag}`);
      }
      // Convert absolute asset refs → relative
      // Matches: src="/assets/", href="/assets/", src='/favicon', etc.
      text = text.replace(/(["'])(\/(?:assets|static|_next|_nuxt)\/)/g, "$1./$2".replace("/", ""));
      text = text.replace(/(["'])\/(?=(?:favicon|icons?|logo|manifest|robots)[^"']*["'])/g, "$1./");
    }

    if (isCss) {
      // Fix CSS url('/assets/...')
      text = text.replace(/url\((["']?)(\/(?:assets|static)[^"')]+)(["']?)\)/g, "url($1.$2$3)");
    }

    const result = Buffer.allocUnsafe(Buffer.byteLength(text, "utf-8"));
    result.write(text, "utf-8");
    return result as unknown as Uint8Array;
  }

  /**
   * Recursively collects all files from a build output directory.
   * Applies proxy-compatibility rewrites (relative paths, <base> tag) to
   * HTML and CSS files as a universal safety-net fallback.
   */
  private async collectFiles(
    dir: string,
    baseDir: string = dir,
    deploymentId?: string
  ): Promise<DeploymentFile[]> {
    const files: DeploymentFile[] = [];
    const entries = await fs.readdir(dir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        const subFiles = await this.collectFiles(fullPath, baseDir, deploymentId);
        files.push(...subFiles);
      } else if (entry.isFile()) {
        const relativePath = path
          .relative(baseDir, fullPath)
          .replace(/\\/g, "/");
        let content: Uint8Array = await fs.readFile(fullPath) as unknown as Uint8Array;

        // Apply proxy-compatibility rewrites to HTML/CSS files
        if (deploymentId) {
          content = this.rewriteForProxy(content, entry.name, deploymentId);
        }

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
        const files = await this.collectFiles(sandboxDir, sandboxDir, deploymentId);
        if (files.length === 0) {
          throw new AppError(500, "Repository has no files to deploy");
        }
        logger.info(`✅ [BuildExecutor] Collected ${files.length} static files for upload`);
        return { files, buildDurationMs: Date.now() - startTime };
      }

      // ── 3. INSTALLING ────────────────────────────────────────────────────
      // IMPORTANT: Do NOT pass NODE_ENV=production here.
      // npm skips devDependencies (vite, tsc, etc.) when NODE_ENV=production.
      if (onStatusChange) await onStatusChange("INSTALLING");
      logger.info(`📥 [BuildExecutor] Installing npm dependencies in: ${buildDir}...`);
      await this.runCommand("npm", ["install", "--no-audit", "--include=dev"], buildDir, options?.envVars);

      // ── 4. BUILDING ──────────────────────────────────────────────────────
      // Detect build tool and inject relative-base flags (--base=./ for Vite,
      // PUBLIC_URL=. for CRA/Webpack) so bundlers emit relative asset paths.
      // This is the generalized fix — no per-project config changes needed.
      if (onStatusChange) await onStatusChange("BUILDING");
      const { args: buildArgs, envOverrides } = await this.resolveBuildCommand(buildDir);
      const buildEnv = { ...(options?.envVars || {}), ...envOverrides };
      logger.info(`⚙️ [BuildExecutor] Running: npm ${buildArgs.join(" ")} in: ${buildDir}...`);
      await this.runCommand("npm", buildArgs, buildDir, buildEnv, "production");

      // ── 5. LOCATE OUTPUT BUNDLE ──────────────────────────────────────────
      const outputDir = await this.detectOutputDir(buildDir);

      // ── 6. COLLECT FILES ──────────────────────────────────────────────────
      logger.info(`📦 [BuildExecutor] Collecting build files from: ${outputDir}`);
      const files = await this.collectFiles(outputDir, outputDir, deploymentId);

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
