import { execSync } from "child_process";
import { existsSync, readFileSync, readdirSync } from "fs";
import { join } from "path";
import os from "os";
import { NextResponse } from "next/server";

interface TokenResult {
  browser: string;
  domain: string;
  name: string;
  value: string;
  decrypted?: boolean;
  error?: string;
}

function getChromeCookiesPath(profile = "Default"): string {
  const localAppData = process.env.LOCALAPPDATA || join(os.homedir(), "AppData", "Local");
  const chromeBase = join(localAppData, "Google", "Chrome", "User Data");
  if (!existsSync(chromeBase)) return "";

  const paths = [
    join(chromeBase, profile, "Network", "Cookies"),
    join(chromeBase, profile, "Cookies"),
    join(chromeBase, "Cookies"),
  ];
  for (const p of paths) if (existsSync(p)) return p;

  // Try any profile directory
  try {
    const dirs = readdirSync(chromeBase, { withFileTypes: true })
      .filter((d) => d.isDirectory() && d.name !== "System Profile" && d.name !== "Guest Profile");
    for (const d of dirs) {
      const p = join(chromeBase, d.name, "Network", "Cookies");
      if (existsSync(p)) return p;
      const p2 = join(chromeBase, d.name, "Cookies");
      if (existsSync(p2)) return p2;
    }
  } catch {}
  return "";
}

function getEdgeCookiesPath(profile = "Default"): string {
  const localAppData = process.env.LOCALAPPDATA || join(os.homedir(), "AppData", "Local");
  const edgeBase = join(localAppData, "Microsoft", "Edge", "User Data");
  if (!existsSync(edgeBase)) return "";

  const paths = [
    join(edgeBase, profile, "Network", "Cookies"),
    join(edgeBase, profile, "Cookies"),
    join(edgeBase, "Cookies"),
  ];
  for (const p of paths) if (existsSync(p)) return p;

  try {
    const dirs = readdirSync(edgeBase, { withFileTypes: true })
      .filter((d) => d.isDirectory() && d.name !== "System Profile" && d.name !== "Guest Profile");
    for (const d of dirs) {
      const p = join(edgeBase, d.name, "Network", "Cookies");
      if (existsSync(p)) return p;
      const p2 = join(edgeBase, d.name, "Cookies");
      if (existsSync(p2)) return p2;
    }
  } catch {}
  return "";
}

function getBraveCookiesPath(profile = "Default"): string {
  const localAppData = process.env.LOCALAPPDATA || join(os.homedir(), "AppData", "Local");
  const braveBase = join(localAppData, "BraveSoftware", "Brave-Browser", "User Data");
  if (!existsSync(braveBase)) return "";

  const paths = [
    join(braveBase, profile, "Network", "Cookies"),
    join(braveBase, profile, "Cookies"),
    join(braveBase, "Cookies"),
  ];
  for (const p of paths) if (existsSync(p)) return p;

  try {
    const dirs = readdirSync(braveBase, { withFileTypes: true })
      .filter((d) => d.isDirectory() && d.name !== "System Profile" && d.name !== "Guest Profile");
    for (const d of dirs) {
      const p = join(braveBase, d.name, "Network", "Cookies");
      if (existsSync(p)) return p;
      const p2 = join(braveBase, d.name, "Cookies");
      if (existsSync(p2)) return p2;
    }
  } catch {}
  return "";
}

function queryChromeCookies(dbPath: string, domains: string[], browserName: string): TokenResult[] {
  try {
    const Database = require("better-sqlite3");
    const db = new Database(dbPath, { readonly: true });

    const domainFilter = domains.map((d) => `'${d}'`).join(",");
    let rows: any[];
    try {
      rows = db
        .prepare(
          `SELECT host_key, name, encrypted_value FROM cookies WHERE host_key IN (${domainFilter}) ORDER BY host_key`
        )
        .all();
    } catch (e: any) {
      db.close();
      return [{
        browser: browserName,
        domain: "",
        name: "",
        value: "",
        decrypted: false,
        error: `Cannot query cookies DB: ${e.message}. Close the browser first.`,
      }];
    }

    const results: TokenResult[] = [];
    for (const row of rows) {
      const host = row.host_key || "";
      try {
        const decrypted = decryptChromeValue(row.encrypted_value);
        results.push({
          browser: browserName,
          domain: host,
          name: row.name,
          value: decrypted,
          decrypted: true,
        });
      } catch (e: any) {
        results.push({
          browser: browserName,
          domain: host,
          name: row.name,
          value: "[encrypted]",
          decrypted: false,
          error: `Decrypt failed: ${e.message}. Close browser and retry.`,
        });
      }
    }
    db.close();
    return results;
  } catch (e: any) {
    if (e.code === "MODULE_NOT_FOUND" || e.message?.includes("better-sqlite3")) {
      return [{
        browser: browserName,
        domain: "",
        name: "",
        value: "",
        decrypted: false,
        error: "better-sqlite3 native module not available",
      }];
    }
    return [{
      browser: browserName,
      domain: "",
      name: "",
      value: "",
      decrypted: false,
      error: `Failed to read: ${e.message}`,
    }];
  }
}

function decryptChromeValue(encryptedValue: Buffer): string {
  if (!encryptedValue || encryptedValue.length === 0) return "";

  // Check if DPAPI encrypted (starts with 'v10' or 'v11' prefix)
  const prefix = encryptedValue.toString("utf-8", 0, 3);
  if (prefix === "v10" || prefix === "v11") {
    // Chrome v10/v11 format: remove prefix, then DPAPI decrypt
    const ciphertext = encryptedValue.slice(prefix.length);

    // Use PowerShell to decrypt via DPAPI
    const psScript = `
      Add-Type -AssemblyName System.Security
      $ciphertext = [Convert]::FromBase64String('${ciphertext.toString("base64")}')
      $decrypted = [System.Security.Cryptography.ProtectedData]::Unprotect($ciphertext, $null, 'CurrentUser')
      [Convert]::ToBase64String($decrypted)
    `;

    try {
      const result = execSync(
        `powershell -NoProfile -NonInteractive -Command "${psScript.replace(/"/g, '\\"')}"`,
        { encoding: "utf-8", timeout: 5000, windowsHide: true }
      );
      const decrypted = Buffer.from(result.trim(), "base64").toString("utf-8");
      return decrypted;
    } catch {
      throw new Error("DPAPI decryption failed");
    }
  }

  // Plaintext or unsupported format
  return encryptedValue.toString("utf-8");
}

export async function GET() {
  if (process.platform !== "win32") {
    return NextResponse.json({
      tokens: [],
      error: "Browser token extraction currently supports Windows only",
    });
  }

  const targetDomains = [
    "chat.deepseek.com",
    ".deepseek.com",
    "deepseek.com",
    "api.deepseek.com",
    "platform.deepseek.com",
  ];

  const results: TokenResult[] = [];
  const browsers: { name: string; getPath: (p?: string) => string }[] = [
    { name: "Chrome", getPath: getChromeCookiesPath },
    { name: "Edge", getPath: getEdgeCookiesPath },
    { name: "Brave", getPath: getBraveCookiesPath },
  ];

  for (const browser of browsers) {
    const dbPath = browser.getPath();
    if (!dbPath) {
      results.push({
        browser: browser.name,
        domain: "",
        name: "",
        value: "",
        decrypted: false,
        error: `${browser.name} not found on this system`,
      });
      continue;
    }

    const tokens = queryChromeCookies(dbPath, targetDomains, browser.name);
    if (tokens.length === 0) {
      results.push({
        browser: browser.name,
        domain: "chat.deepseek.com",
        name: "",
        value: "",
        decrypted: false,
        error: "No DeepSeek cookies found. Log into chat.deepseek.com first.",
      });
    } else {
      results.push(...tokens);
    }
  }

  const validTokens = results.filter((t) => t.decrypted && t.value);
  return NextResponse.json({
    tokens: results,
    summary: {
      total: results.length,
      valid: validTokens.length,
      encrypted: results.filter((t) => !t.decrypted).length,
    },
  });
}
