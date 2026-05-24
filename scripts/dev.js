#!/usr/bin/env node

/**
 * ClawHub Desktop — Dev Server with Auto-Open Browser
 *
 * Works on: Windows, WSL, macOS, Linux
 * Usage:    npm run dev          (auto-opens browser)
 *           npm run dev:no-open  (starts without opening browser)
 */

const { spawn, exec } = require("child_process");
const http = require("http");

const PORT = parseInt(process.env.PORT || "3000", 10);
const HOST = process.env.HOST || "localhost";
const URL = `http://${HOST}:${PORT}`;
const MAX_WAIT_MS = 60_000; // 60s max wait for server
const POLL_INTERVAL_MS = 500;

// ─── Detect platform ────────────────────────────────────────
function isWSL() {
  try {
    const fs = require("fs");
    if (fs.existsSync("/proc/version")) {
      const version = fs.readFileSync("/proc/version", "utf-8").toLowerCase();
      return version.includes("microsoft") || version.includes("wsl");
    }
  } catch {}
  // Fallback: check WSL_DISTRO_NAME env var
  return !!process.env.WSL_DISTRO_NAME;
}

function isWindows() {
  return process.platform === "win32";
}

function isMac() {
  return process.platform === "darwin";
}

function isLinux() {
  return process.platform === "linux";
}

// ─── Open URL in default browser ────────────────────────────
function openBrowser(url) {
  let command;

  if (isWSL()) {
    // WSL: Use Windows' cmd.exe to open the URL in the Windows default browser
    command = `cmd.exe /c start "${url}"`;
  } else if (isWindows()) {
    command = `start "" "${url}"`;
  } else if (isMac()) {
    command = `open "${url}"`;
  } else if (isLinux()) {
    // Try common Linux openers in order of preference
    const openers = ["xdg-open", "sensible-browser", "gnome-open", "x-www-browser"];
    command = `${openers[0]} "${url}"`;
  } else {
    command = `open "${url}"`;
  }

  exec(command, (error) => {
    if (error) {
      console.log(`\n  ⚠️  Could not auto-open browser. Open manually: ${url}\n`);
      if (isWSL()) {
        console.log("  💡 WSL tip: Make sure cmd.exe is accessible from your WSL session.");
        console.log("     Try: cmd.exe /c start http://localhost:3000\n");
      }
    } else {
      console.log(`\n  ✅  Browser opened: ${url}\n`);
    }
  });
}

// ─── Wait for server to be ready ────────────────────────────
function waitForServer(url) {
  return new Promise((resolve, reject) => {
    const start = Date.now();

    const check = () => {
      if (Date.now() - start > MAX_WAIT_MS) {
        reject(new Error(`Server did not start within ${MAX_WAIT_MS / 1000}s`));
        return;
      }

      const req = http.get(url, (res) => {
        if (res.statusCode >= 200 && res.statusCode < 400) {
          resolve(true);
        } else {
          setTimeout(check, POLL_INTERVAL_MS);
        }
      });

      req.on("error", () => {
        setTimeout(check, POLL_INTERVAL_MS);
      });

      req.setTimeout(2000, () => {
        req.destroy();
        setTimeout(check, POLL_INTERVAL_MS);
      });
    };

    // Give Next.js a moment before first poll
    setTimeout(check, 1500);
  });
}

// ─── Main ───────────────────────────────────────────────────
function main() {
  const shouldOpen = !process.argv.includes("--no-open") && !process.argv.includes("--noopen");

  console.log(`\n  🚀  ClawHub Desktop — Starting dev server...\n`);
  console.log(`  URL:  ${URL}`);
  console.log(`  Platform: ${isWSL() ? "WSL" : process.platform}`);
  console.log(`  Auto-open: ${shouldOpen ? "Yes" : "No"}\n`);

  // Start Next.js dev server
  const nextArgs = ["dev"];
  
  // Pass any extra args (like -H 0.0.0.0 for LAN mode)
  const extraArgs = process.argv.slice(2).filter(a => a !== "--no-open" && a !== "--noopen");
  nextArgs.push(...extraArgs);

  const nextProc = spawn("npx", ["next", ...nextArgs], {
    stdio: "inherit",
    shell: true,
    env: { ...process.env },
  });

  nextProc.on("error", (err) => {
    console.error("Failed to start Next.js:", err.message);
    process.exit(1);
  });

  nextProc.on("close", (code) => {
    process.exit(code || 0);
  });

  // Start WebSocket chat mini-service (optional — SSE fallback works without it)
  const wsChatPath = require("path").join(__dirname, "..", "mini-services", "ws-chat");
  const wsProc = spawn("bun", ["run", "index.ts"], {
    cwd: wsChatPath,
    stdio: "pipe",
    shell: true,
    env: { ...process.env },
  });

  wsProc.stdout?.on("data", (data) => {
    process.stdout.write(`[ws-chat] ${data}`);
  });

  wsProc.stderr?.on("data", (data) => {
    process.stderr.write(`[ws-chat] ${data}`);
  });

  wsProc.on("error", () => {
    // WS service is optional — don't crash if it fails to start
    console.log("  ⚠️  WebSocket chat service failed to start (SSE fallback will be used)");
  });

  // If auto-open is enabled, wait for server then open browser
  if (shouldOpen) {
    waitForServer(URL)
      .then(() => {
        // Small delay to let Next.js finish compiling the first page
        setTimeout(() => openBrowser(URL), 1000);
      })
      .catch((err) => {
        console.log(`\n  ⚠️  ${err.message}`);
        console.log(`  Open manually when ready: ${URL}\n`);
      });
  }

  // Graceful shutdown
  const shutdown = () => {
    console.log("\n  Shutting down...");
    wsProc.kill("SIGTERM");
    nextProc.kill("SIGTERM");
    setTimeout(() => {
      wsProc.kill("SIGKILL");
      nextProc.kill("SIGKILL");
    }, 5000);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main();
