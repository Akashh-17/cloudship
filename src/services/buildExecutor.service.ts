import os from "os";
import path from "path";
import fs from "fs/promises";
import { execFile } from "child_process";
import { promisify } from "util";
import { logger } from "../logger/logger";
import { AppError } from "../utils/AppError";
import { DeploymentFile, getContentType } from "../aws/s3.service";

const execFileAsync = promisify(execFile);

const BUILD_TIMEOUT_MS = 5 * 60 * 1000; // 5-minute timeout per command

export interface BuildResult {
  files: DeploymentFile[];
  buildDurationMs: number;
}

export class BuildExecutorService {
  /**
   * Safe environment variables for child processes.
   * Strips out host AWS credentials, secrets, and system env variables.
   */
  private getSafeEnvironment(): NodeJS.ProcessEnv {
    return {
      PATH: process.env.PATH || "/usr/local/bin:/usr/bin:/bin",
      NODE_ENV: "production",
      HOME: os.tmpdir(),
      USER: "cloudship-worker",
    };
  }

  /**
   * Executes a command in a child process with timeout and environment isolation.
   */
  private async runCommand(
    file: string,
    args: string[],
    cwd: string
  ): Promise<string> {
    try {
      const { stdout, stderr } = await execFileAsync(file, args, {
        cwd,
        timeout: BUILD_TIMEOUT_MS,
        env: this.getSafeEnvironment(),
        maxBuffer: 10 * 1024 * 1024, // 10MB buffer
      });

      if (stderr) {
        logger.debug(`[BuildExecutor] ${file} stderr: ${stderr.substring(0, 500)}`);
      }

      return stdout;
    } catch (error: any) {
      if (error.killed) {
        throw new AppError(408, `Command '${file}' timed out after 5 minutes`);
      }
      throw new AppError(
        500,
        `Build process error (${file}): ${error.stderr || error.message}`
      );
    }
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
   * Executes a complete real build: git clone -> npm install -> npm build -> collect dist files.
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

      // 1. CLONING
      if (onStatusChange) await onStatusChange("CLONING");
      logger.info(`📦 [BuildExecutor] Cloning ${repoUrl}...`);
      await this.runCommand("git", ["clone", "--depth", "1", repoUrl, "."], sandboxDir);

      // 2. INSTALLING
      if (onStatusChange) await onStatusChange("INSTALLING");
      logger.info(`📥 [BuildExecutor] Installing npm dependencies...`);
      await this.runCommand("npm", ["install", "--ignore-scripts"], sandboxDir);

      // 3. BUILDING
      if (onStatusChange) await onStatusChange("BUILDING");
      logger.info(`⚙️ [BuildExecutor] Building production bundle...`);
      try {
        await this.runCommand("npm", ["run", "build"], sandboxDir);
      } catch (buildErr) {
        logger.warn(
          `⚠️ npm run build failed or not defined. Checking for static files in root...`
        );
      }

      // 4. LOCATE OUTPUT BUNDLE (dist, build, out, or fallback root)
      let outputDir = path.join(sandboxDir, "dist");
      try {
        await fs.access(outputDir);
      } catch {
        try {
          outputDir = path.join(sandboxDir, "build");
          await fs.access(outputDir);
        } catch {
          try {
            outputDir = path.join(sandboxDir, "out");
            await fs.access(outputDir);
          } catch {
            outputDir = sandboxDir; // Fallback to root directory
          }
        }
      }

      logger.info(`📦 [BuildExecutor] Collecting build files from: ${outputDir}`);
      const files = await this.collectFiles(outputDir);

      if (files.length === 0) {
        throw new AppError(500, "Build produced no output files");
      }

      return {
        files,
        buildDurationMs: Date.now() - startTime,
      };
    } finally {
      // 5. SANDBOX CLEANUP
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
