import { NextResponse } from "next/server";
import os from "os";
import { execSync } from "child_process";
import fs from "fs";
import path from "path";

interface DoctorCheck {
  name: string;
  status: "ok" | "warning" | "error" | "running";
  message: string;
  details?: string;
}

interface DoctorSummary {
  passed: number;
  warnings: number;
  errors: number;
  total: number;
}

function execSafe(cmd: string): string | null {
  try {
    const result = execSync(cmd, {
      encoding: "utf-8",
      timeout: 15000,
      windowsHide: true,
      stdio: ["pipe", "pipe", "pipe"],
    });
    return result.trim();
  } catch {
    return null;
  }
}

function detectChromeVersion(): string | null {
  // Standard installation paths
  const paths = process.platform === "win32"
    ? [
        "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
        "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
        path.join(process.env.LOCALAPPDATA || "", "Google\\Chrome\\Application\\chrome.exe"),
      ]
    : process.platform === "darwin"
      ? ["/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"]
      : ["/usr/bin/google-chrome", "/usr/bin/chromium-browser", "/snap/bin/chromium", "/usr/bin/chromium"];

  for (const chromePath of paths) {
    try {
      if (fs.existsSync(chromePath)) {
        const result = execSync(`"${chromePath}" --version`, {
          encoding: "utf-8",
          timeout: 10000,
          windowsHide: true,
        }).trim();
        const match = result.match(/(\d+[\d.]*)/);
        return match ? match[1] : result;
      }
    } catch {
      // continue
    }
  }

  // Try PATH-based detection (works on Linux, macOS, WSL)
  const pathCommands = ["google-chrome", "google-chrome-stable", "chromium-browser", "chromium", "chrome"];
  for (const cmd of pathCommands) {
    const result = execSafe(`${cmd} --version`);
    if (result) {
      const match = result.match(/(\d+[\d.]*)/);
      return match ? match[1] : result.replace(/[^\d.]/g, "").trim();
    }
  }

  return null;
}

function detectEdgeVersion(): string | null {
  // Microsoft Edge (Chromium-based) - also works for agent-browser
  const paths = process.platform === "win32"
    ? [
        "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
        "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
        path.join(process.env.LOCALAPPDATA || "", "Microsoft\\Edge\\Application\\msedge.exe"),
      ]
    : process.platform === "darwin"
      ? ["/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge"]
      : ["/usr/bin/microsoft-edge", "/usr/bin/microsoft-edge-stable"];

  for (const edgePath of paths) {
    try {
      if (fs.existsSync(edgePath)) {
        const result = execSync(`"${edgePath}" --version`, {
          encoding: "utf-8",
          timeout: 10000,
          windowsHide: true,
        }).trim();
        const match = result.match(/(\d+[\d.]*)/);
        return match ? match[1] : result;
      }
    } catch {
      // continue
    }
  }

  // Try PATH-based detection
  const result = execSafe("microsoft-edge --version") || execSafe("microsoft-edge-stable --version");
  if (result) {
    const match = result.match(/(\d+[\d.]*)/);
    return match ? match[1] : result.replace(/[^\d.]/g, "").trim();
  }

  return null;
}

async function runAllChecks(): Promise<{ checks: DoctorCheck[]; summary: DoctorSummary }> {
  const checks: DoctorCheck[] = [];

  // --- Node.js ---
  checks.push({
    name: "Node.js",
    status: "ok",
    message: `v${process.version}`,
    details: `Install path: ${process.execPath}`,
  });

  // --- npm ---
  const npmVersion = execSafe("npm --version");
  let npmCheck: DoctorCheck;
  if (npmVersion) {
    const npmGlobalCount = execSafe("npm ls -g --depth=0 2>nul | find /c \"+--\" || echo 0") || "0";
    npmCheck = {
      name: "npm",
      status: "ok",
      message: `v${npmVersion}`,
      details: `Global packages: ${npmGlobalCount.trim()} installed`,
    };
  } else {
    npmCheck = {
      name: "npm",
      status: "warning",
      message: "npm not found in PATH",
      details: "npm CLI may not be installed or not in PATH",
    };
  }
  checks.push(npmCheck);

  // --- Git ---
  const gitVersion = execSafe("git --version");
  if (gitVersion) {
    const gitUser = execSafe("git config user.name") || "not configured";
    const gitEmail = execSafe("git config user.email") || "not configured";
    checks.push({
      name: "Git",
      status: "ok",
      message: gitVersion.replace("git version ", ""),
      details: `User: ${gitUser} <${gitEmail}>`,
    });
  } else {
    checks.push({
      name: "Git",
      status: "warning",
      message: "Git not found",
      details: "Git is recommended for version control and some agent features",
    });
  }

  // --- System ---
  const sysInfo = [
    `OS: ${os.type()} ${os.release()} (${os.platform()})`,
    `Architecture: ${os.arch()}`,
    `CPUs: ${os.cpus().length} cores (${os.cpus()[0]?.model || "Unknown"})`,
    `Total Memory: ${(os.totalmem() / (1024 ** 3)).toFixed(1)} GB`,
    `Free Memory: ${(os.freemem() / (1024 ** 3)).toFixed(1)} GB`,
    `Uptime: ${Math.floor(os.uptime() / 3600)}h ${Math.floor((os.uptime() % 3600) / 60)}m`,
    `Hostname: ${os.hostname()}`,
  ].join("\n");

  checks.push({
    name: "System",
    status: "ok",
    message: `${os.type()} ${os.release()} — ${os.cpus().length} cores`,
    details: sysInfo,
  });

  // --- Database ---
  try {
    const { db } = await import("@/lib/db");
    const dbChecks: string[] = [];

    // Check schema tables
    const tables = [
      "Conversation", "Message", "Memory", "Settings",
      "UploadedFile", "Provider", "Agent", "Prompt",
      "KnowledgeDocument", "KnowledgeChunk",
    ];

    for (const table of tables) {
      try {
        const count = await (db as any)[table].count();
        dbChecks.push(`${table}: ${count} records`);
      } catch {
        dbChecks.push(`${table}: N/A`);
      }
    }

    checks.push({
      name: "Database (SQLite)",
      status: "ok",
      message: `Connected — ${tables.length} tables`,
      details: dbChecks.join("\n"),
    });
  } catch (e: any) {
    checks.push({
      name: "Database (SQLite)",
      status: "error",
      message: "Cannot connect to database",
      details: e.message || String(e),
    });
  }

  // --- Skills ---
  const skillsDir = path.join(process.cwd(), "skills");
  try {
    if (fs.existsSync(skillsDir)) {
      const entries = fs.readdirSync(skillsDir, { withFileTypes: true });
      const skillDirs = entries.filter((e) => e.isDirectory());
      const skillCount = skillDirs.length;
      const missingSkillMd: string[] = [];
      for (const dir of skillDirs) {
        const skillMdPath = path.join(skillsDir, dir.name, "SKILL.md");
        if (!fs.existsSync(skillMdPath)) {
          missingSkillMd.push(dir.name);
        }
      }

      if (missingSkillMd.length > 0) {
        checks.push({
          name: "Skills",
          status: "warning",
          message: `${skillCount} skills, ${missingSkillMd.length} missing SKILL.md`,
          details: `Missing SKILL.md in: ${missingSkillMd.join(", ")}`,
        });
      } else {
        checks.push({
          name: "Skills",
          status: "ok",
          message: `${skillCount} skills, all have SKILL.md`,
          details: `Skills directory: ${skillsDir}`,
        });
      }
    } else {
      checks.push({
        name: "Skills",
        status: "warning",
        message: "Skills directory not found",
        details: `Expected at: ${skillsDir}`,
      });
    }
  } catch (e: any) {
    checks.push({
      name: "Skills",
      status: "error",
      message: "Error reading skills directory",
      details: e.message || String(e),
    });
  }

  // --- Dependencies ---
  const nodeModulesPath = path.join(process.cwd(), "node_modules");
  try {
    if (fs.existsSync(nodeModulesPath)) {
      const pkgPath = path.join(process.cwd(), "package.json");
      if (fs.existsSync(pkgPath)) {
        const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8"));
        const deps = { ...pkg.dependencies, ...pkg.devDependencies };
        const depCount = Object.keys(deps).length;
        const installedCount = fs.readdirSync(nodeModulesPath).filter(
          (f) => !f.startsWith(".") && !f.startsWith("@")
        ).length;
        const scopedCount = fs.readdirSync(nodeModulesPath).filter(
          (f) => f.startsWith("@")
        ).length;

        checks.push({
          name: "Dependencies",
          status: "ok",
          message: `${depCount} in package.json, node_modules present`,
          details: `node_modules: ${installedCount} top-level packages (+${scopedCount} scoped)`,
        });
      } else {
        checks.push({
          name: "Dependencies",
          status: "error",
          message: "node_modules exists but package.json missing",
        });
      }
    } else {
      checks.push({
        name: "Dependencies",
        status: "error",
        message: "node_modules not found",
        details: "Run `npm install` to install dependencies",
      });
    }
  } catch (e: any) {
    checks.push({
      name: "Dependencies",
      status: "error",
      message: "Error checking dependencies",
      details: e.message || String(e),
    });
  }

  // --- Network ---
  let networkOk = false;
  try {
    // Try multiple endpoints for reliability
    for (const url of ["https://www.google.com", "https://1.1.1.1"]) {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 6000);
        const response = await fetch(url, { signal: controller.signal, method: "HEAD" });
        clearTimeout(timeout);
        if (response.ok) {
          networkOk = true;
          checks.push({
            name: "Network",
            status: "ok",
            message: "Internet connection is working",
            details: `${url} responded with status ${response.status}`,
          });
          break;
        }
      } catch {
        continue;
      }
    }
    if (!networkOk) {
      checks.push({
        name: "Network",
        status: "warning",
        message: "Internet connection may be unreliable",
        details: "Primary connectivity checks failed, GitHub API not tried",
      });
    }
  } catch {
    checks.push({
      name: "Network",
      status: "error",
      message: "Cannot reach external endpoints",
      details: "Internet connection appears to be down",
    });
  }

  // --- Disk ---
  const cwd = process.cwd();
  try {
    const stats = fs.statfsSync === undefined
      ? null
      : (() => { try { return (fs as any).statfsSync(cwd); } catch { return null; } })();

    if (stats) {
      const freeGB = ((stats.bfree * stats.bsize) / (1024 ** 3)).toFixed(1);
      const totalGB = ((stats.blocks * stats.bsize) / (1024 ** 3)).toFixed(1);
      const freePercent = stats.blocks > 0
        ? ((stats.bfree / stats.blocks) * 100).toFixed(1)
        : "N/A";

      let diskStatus: DoctorCheck["status"] = "ok";
      if (parseFloat(freePercent) < 10) diskStatus = "error";
      else if (parseFloat(freePercent) < 20) diskStatus = "warning";

      checks.push({
        name: "Disk Space",
        status: diskStatus,
        message: `${freeGB} GB free / ${totalGB} GB total (${freePercent}%)`,
        details: `Workspace: ${cwd}`,
      });
    } else {
      checks.push({
        name: "Disk Space",
        status: "ok",
        message: "Workspace directory exists",
        details: `Path: ${cwd}`,
      });
    }
  } catch (e: any) {
    checks.push({
      name: "Disk Space",
      status: "error",
      message: "Cannot check disk space",
      details: e.message || String(e),
    });
  }

  // --- Chrome / Browser ---
  const chromeVersion = detectChromeVersion();
  const edgeVersion = detectEdgeVersion();
  if (chromeVersion) {
    checks.push({
      name: "Chrome / Browser",
      status: "ok",
      message: `Chrome v${chromeVersion} installed`,
      details: "Required for agent-browser automation",
    });
  } else if (edgeVersion) {
    checks.push({
      name: "Chrome / Browser",
      status: "ok",
      message: `Microsoft Edge v${edgeVersion} installed (Chromium-based)`,
      details: "Edge is Chromium-based and fully compatible with agent-browser automation (Playwright/Puppeteer)",
    });
  } else {
    // Check if we're in WSL - Chrome might be installed on Windows side
    const isWSL = fs.existsSync("/proc/version") && fs.readFileSync("/proc/version", "utf-8").toLowerCase().includes("microsoft");
    if (isWSL) {
      checks.push({
        name: "Chrome / Browser",
        status: "warning",
        message: "No browser detected in WSL Linux paths",
        details: "WSL detected. Chrome/Edge may be installed on the Windows side. agent-browser can use the Windows browser via WSL interop. You can also install Chrome in WSL: wget -q -O - https://dl.google.com/linux/linux_signing_key.pub | sudo apt-key add - && sudo apt-get install google-chrome-stable",
      });
    } else {
      checks.push({
        name: "Chrome / Browser",
        status: "warning",
        message: "No Chromium-based browser detected",
        details: "agent-browser works with Chrome, Chromium, or Microsoft Edge. Install one: sudo apt-get install chromium-browser OR download from https://www.google.com/chrome/",
      });
    }
  }

  // --- Python ---
  const pythonVersion = execSafe("python --version") || execSafe("python3 --version") || execSafe("py --version");
  if (pythonVersion) {
    checks.push({
      name: "Python",
      status: "ok",
      message: pythonVersion,
      details: "Required for code runner and Python-based skills",
    });
  } else {
    checks.push({
      name: "Python",
      status: "warning",
      message: "Python not found in PATH",
      details: "Some skills and the code runner require Python",
    });
  }

  // Compute summary
  const passed = checks.filter((c) => c.status === "ok").length;
  const warnings = checks.filter((c) => c.status === "warning").length;
  const errors = checks.filter((c) => c.status === "error").length;

  return {
    checks,
    summary: { passed, warnings, errors, total: checks.length },
  };
}

// Cache duration: 30 seconds
let cachedResult: { checks: DoctorCheck[]; summary: DoctorSummary } | null = null;
let cacheTime = 0;
const CACHE_DURATION = 30000;

export async function GET() {
  const now = Date.now();
  if (cachedResult && now - cacheTime < CACHE_DURATION) {
    return NextResponse.json(cachedResult);
  }

  try {
    const result = await runAllChecks();
    cachedResult = result;
    cacheTime = now;
    return NextResponse.json(result);
  } catch (e: any) {
    return NextResponse.json(
      {
        checks: [
          {
            name: "Doctor",
            status: "error",
            message: "Diagnostic runner failed",
            details: e.message || String(e),
          },
        ],
        summary: { passed: 0, warnings: 0, errors: 1, total: 1 },
      },
      { status: 500 }
    );
  }
}
