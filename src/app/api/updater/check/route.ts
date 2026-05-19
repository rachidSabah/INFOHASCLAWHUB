import { execSync } from "child_process";
import { readFileSync, existsSync } from "fs";
import { join } from "path";

const REPO_OWNER = "rachidSabah";
const REPO_NAME = "INFOHASCLAWHUB";
const COMMIT_FILE = ".current_commit";

export async function GET() {
  try {
    const projectRoot = process.cwd();
    const commitFilePath = join(projectRoot, COMMIT_FILE);

    let currentCommit = "";

    // Always use actual HEAD commit - don't trust cached file
    try {
      currentCommit = execSync("git rev-parse HEAD", {
        cwd: projectRoot, encoding: "utf-8", windowsHide: true,
      }).trim();
    } catch {
      if (existsSync(commitFilePath)) {
        currentCommit = readFileSync(commitFilePath, "utf-8").trim();
      }
    }

    if (!currentCommit || currentCommit === "unknown") {
      return Response.json({ hasUpdate: false, error: "Cannot determine current version" });
    }

    // Try GitHub API first, fall back to comparing with local git
    let latestCommit = "";
    let commitList: { sha: string; message: string; date: string }[] = [];

    try {
      const response = await fetch(
        `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/commits?per_page=5`,
        {
          headers: { Accept: "application/vnd.github.v3+json" },
          signal: AbortSignal.timeout(10000),
        }
      );

      if (response.ok) {
        const commits: { sha: string; commit: { message: string; committer: { date: string } } }[] = await response.json();
        latestCommit = commits[0]?.sha || "";
        commitList = commits.map((c) => ({
          sha: c.sha.substring(0, 7),
          message: c.commit.message.split("\n")[0],
          date: c.commit.committer.date,
        }));
      } else if (response.status === 403) {
        // Rate limited - try git ls-remote as fallback
        try {
          const remote = execSync("git ls-remote origin HEAD", {
            cwd: projectRoot, encoding: "utf-8", timeout: 10000, windowsHide: true,
          }).trim();
          latestCommit = remote.split(/\s+/)[0] || "";
        } catch {
          return Response.json({
            hasUpdate: false,
            currentCommit: currentCommit.substring(0, 7),
            error: "GitHub API rate limited. Try again later.",
          });
        }
      }
    } catch {
      // Network error - try git remote
      try {
        const remote = execSync("git ls-remote origin HEAD", {
          cwd: projectRoot, encoding: "utf-8", timeout: 10000, windowsHide: true,
        }).trim();
        latestCommit = remote.split(/\s+/)[0] || "";
      } catch {
        return Response.json({
          hasUpdate: false,
          currentCommit: currentCommit.substring(0, 7),
          error: "Cannot reach GitHub. Check your internet connection.",
        });
      }
    }

    const hasUpdate = latestCommit !== "" && currentCommit !== latestCommit;

    return Response.json({
      hasUpdate,
      currentCommit: currentCommit.substring(0, 7),
      latestCommit: latestCommit.substring(0, 7),
      commits: hasUpdate ? commitList.slice(0, 5) : [],
    });
  } catch (error: any) {
    return Response.json({
      hasUpdate: false,
      error: error.message || "Internal error",
    }, { status: 500 });
  }
}
