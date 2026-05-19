import { execSync } from "child_process";
import { writeFileSync } from "fs";
import { join } from "path";

export async function POST() {
  try {
    const projectRoot = process.cwd();

    // Fetch latest changes using git remote
    console.log("[Updater] Fetching latest changes...");
    execSync("git fetch origin main", {
      cwd: projectRoot, encoding: "utf-8", timeout: 60000, windowsHide: true,
    });

    // Check if we're behind
    const localHash = execSync("git rev-parse HEAD", {
      cwd: projectRoot, encoding: "utf-8", windowsHide: true,
    }).trim();
    const remoteHash = execSync("git rev-parse origin/main", {
      cwd: projectRoot, encoding: "utf-8", windowsHide: true,
    }).trim();

    if (localHash === remoteHash) {
      console.log("[Updater] Already at latest version");
      return Response.json({ success: true, message: "Already up to date. No changes needed." });
    }

    // Check if branches have diverged
    try {
      execSync(`git merge-base --is-ancestor ${localHash} ${remoteHash}`, {
        cwd: projectRoot, encoding: "utf-8", windowsHide: true,
      });
      // Fast-forward possible
      console.log("[Updater] Fast-forward merge");
      execSync("git merge origin/main --ff-only", {
        cwd: projectRoot, encoding: "utf-8", timeout: 30000, windowsHide: true,
      });
    } catch {
      // Branches diverged - reset to remote (force sync)
      console.log("[Updater] Branches diverged, resetting to remote");
      execSync("git reset --hard origin/main", {
        cwd: projectRoot, encoding: "utf-8", timeout: 30000, windowsHide: true,
      });
    }

    // Install dependencies
    console.log("[Updater] Installing dependencies...");
    try {
      execSync("npm install --no-audit --no-fund --prefer-offline", {
        cwd: projectRoot, encoding: "utf-8", timeout: 120000, windowsHide: true,
      });
    } catch {
      // Try without prefer-offline
      execSync("npm install --no-audit --no-fund", {
        cwd: projectRoot, encoding: "utf-8", timeout: 120000, windowsHide: true,
      });
    }

    // Save current commit hash
    const newCommit = execSync("git rev-parse HEAD", {
      cwd: projectRoot, encoding: "utf-8", windowsHide: true,
    }).trim();

    writeFileSync(join(projectRoot, ".current_commit"), newCommit);

    console.log("[Updater] Update complete. Restart required.");
    return Response.json({
      success: true,
      message: "Update applied successfully. Please restart the application.",
    });
  } catch (error: unknown) {
    const message = error instanceof Error
      ? (error as { stderr?: string }).stderr || error.message
      : "Update failed";
    console.error("[Updater] Error:", message);
    return Response.json({
      success: false,
      message: message.includes("Authentication failed") ? "GitHub authentication failed" 
        : message.includes("Could not resolve host") ? "Network error - cannot reach GitHub"
        : message.includes("Already up to date") ? "Already up to date"
        : message.slice(0, 200),
    }, { status: 500 });
  }
}
