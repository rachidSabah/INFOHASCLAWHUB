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
  const paths = [
    join(localAppData, "Google", "Chrome", "User Data", profile, "Network", "Cookies"),
    join(localAppData, "Google", "Chrome", "User Data", profile, "Cookies"),
  ];
  for (const p of paths) if (existsSync(p)) return p;
  return "";
}

function getEdgeCookiesPath(profile = "Default"): string {
  const localAppData = process.env.LOCALAPPDATA || join(os.homedir(), "AppData", "Local");
  const paths = [
    join(localAppData, "Microsoft", "Edge", "User Data", profile, "Network", "Cookies"),
    join(localAppData, "Microsoft", "Edge", "User Data", profile, "Cookies"),
  ];
  for (const p of paths) if (existsSync(p)) return p;
  return "";
}

function getBraveCookiesPath(profile = "Default"): string {
  const localAppData = process.env.LOCALAPPDATA || join(os.homedir(), "AppData", "Local");
  const paths = [
    join(localAppData, "BraveSoftware", "Brave-Browser", "User Data", profile, "Network", "Cookies"),
    join(localAppData, "BraveSoftware", "Brave-Browser", "User Data", profile, "Cookies"),
  ];
  for (const p of paths) if (existsSync(p)) return p;
  return "";
}

function queryChromeCookies(dbPath: string, domains: string[]): TokenResult[] {
  try {
    const sqlite3 = require("better-sqlite3");
    const db = new sqlite3(dbPath, { readonly: true });

    const domainFilter = domains.map((d) => `'${d}'`).join(",");
    const rows = db
      .prepare(
        `SELECT host_key, name, encrypted_value FROM cookies WHERE host_key IN (${domainFilter}) ORDER BY host_key`
      )
      .all();

    const results: TokenResult[] = [];
    for (const row of rows) {
      const host = row.host_key || "";
      const browser = dbPath.includes("Chrome") ? "Chrome" : dbPath.includes("Edge") ? "Edge" : "Brave";
      try {
        const decrypted = decryptChromeValue(row.encrypted_value);
        results.push({
          browser,
          domain: host,
          name: row.name,
          value: decrypted,
          decrypted: true,
        });
      } catch {
        results.push({
          browser,
          domain: host,
          name: row.name,
          value: "[encrypted - close browser first]",
          decrypted: false,
          error: "Cannot decrypt. Close the browser and try again.",
        });
      }
    }
    db.close();
    return results;
  } catch (e: any) {
    if (e.code === "MODULE_NOT_FOUND") {
      return [{
        browser: "Chrome",
        domain: "",
        name: "",
        value: "",
        decrypted: false,
        error: "better-sqlite3 not available. Reading cookies requires this native module.",
      }];
    }
    return [{
      browser: "Chrome",
      domain: "",
      name: "",
      value: "",
      decrypted: false,
      error: e.message || "Failed to read cookies",
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

    const tokens = queryChromeCookies(dbPath, targetDomains);
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
