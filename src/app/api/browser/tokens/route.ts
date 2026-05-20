import { execSync } from "child_process";
import { existsSync, readFileSync, readdirSync } from "fs";
import { join } from "path";
import os from "os";
import { NextResponse } from "next/server";

interface TokenResult {
  browser: string; domain: string; name: string; value: string;
  decrypted?: boolean; source?: "cookie" | "localStorage";
  provider?: string;
  error?: string;
}

// ─── Cookie DB Paths ───
function findCookiesDB(basePath: string, browser: string): string {
  if (!existsSync(basePath)) return "";
  // Try Default profile first, then any profile
  const tryProfile = (p: string) => {
    for (const f of [join(basePath, p, "Network", "Cookies"), join(basePath, p, "Cookies")]) {
      if (existsSync(f)) return f;
    }
    return "";
  };
  const r = tryProfile("Default") || tryProfile("Profile 1") || tryProfile("Profile 2");
  if (r) return r;
  try {
    for (const d of readdirSync(basePath, { withFileTypes: true })) {
      if (d.isDirectory() && !d.name.includes("System") && !d.name.includes("Guest")) {
        const p = tryProfile(d.name);
        if (p) return p;
      }
    }
  } catch {}
  return "";
}

function getBrowserPaths(): { name: string; cookiePath: string; localStoragePath: string }[] {
  const local = process.env.LOCALAPPDATA || join(os.homedir(), "AppData", "Local");
  return [
    {
      name: "Chrome",
      cookiePath: findCookiesDB(join(local, "Google", "Chrome", "User Data"), "Chrome"),
      localStoragePath: join(local, "Google", "Chrome", "User Data", "Default", "Local Storage", "leveldb"),
    },
    {
      name: "Edge",
      cookiePath: findCookiesDB(join(local, "Microsoft", "Edge", "User Data"), "Edge"),
      localStoragePath: join(local, "Microsoft", "Edge", "User Data", "Default", "Local Storage", "leveldb"),
    },
    {
      name: "Brave",
      cookiePath: findCookiesDB(join(local, "BraveSoftware", "Brave-Browser", "User Data"), "Brave"),
      localStoragePath: join(local, "BraveSoftware", "Brave-Browser", "User Data", "Default", "Local Storage", "leveldb"),
    },
  ];
}

// ─── DPAPI Decrypt ───
function decryptChromeValue(encryptedValue: Buffer): string {
  if (!encryptedValue || encryptedValue.length === 0) return "";
  const prefix = encryptedValue.toString("utf-8", 0, 3);
  if (prefix === "v10" || prefix === "v11") {
    const ciphertext = encryptedValue.slice(prefix.length);
    const b64 = ciphertext.toString("base64");
    const psScript = `Add-Type -AssemblyName System.Security;$c=[Convert]::FromBase64String('${b64}');$d=[System.Security.Cryptography.ProtectedData]::Unprotect($c,$null,'CurrentUser');[Convert]::ToBase64String($d)`;
    try {
      const result = execSync(`powershell -NoProfile -NonInteractive -Command "${psScript}"`, {
        encoding: "utf-8", timeout: 5000, windowsHide: true,
      });
      return Buffer.from(result.trim(), "base64").toString("utf-8");
    } catch { throw new Error("DPAPI decrypt failed"); }
  }
  return encryptedValue.toString("utf-8");
}

// ─── Cookie Scanner ───
function scanCookies(dbPath: string, browser: string, providerDomains: string[], providerName: string): TokenResult[] {
  try {
    const Database = require("better-sqlite3");
    const db = new Database(dbPath, { readonly: true });
    const domains = providerDomains.map(d => `'${d}'`).join(",");
    const rows = db.prepare(`SELECT host_key, name, encrypted_value FROM cookies WHERE host_key IN (${domains})`).all();
    const results: TokenResult[] = [];
    for (const row of rows) {
      try {
        results.push({ browser, domain: row.host_key, name: row.name, value: decryptChromeValue(row.encrypted_value), decrypted: true, source: "cookie", provider: providerName });
      } catch {
        results.push({ browser, domain: row.host_key, name: row.name, value: "[locked]", decrypted: false, source: "cookie", provider: providerName, error: "Close browser and retry" });
      }
    }
    db.close();
    return results;
  } catch (e: any) {
    return [{ browser, domain: "", name: "", value: "", decrypted: false, error: e.message }];
  }
}

// ─── localStorage Scanner ───
function scanLocalStorage(basePath: string, browser: string, providerDomains: string[], providerName: string): TokenResult[] {
  try {
    if (!existsSync(basePath)) return [];
    const files = readdirSync(basePath).filter(f => f.endsWith(".log") || f.endsWith(".ldb"));
    const results: TokenResult[] = [];
    const seen = new Set<string>();
    const domainPattern = providerDomains.map(d => d.replace(/\./g, "\\.")).join("|");
    
    // Simple patterns for auth tokens
    const patterns = [
      /"(?:accessToken|userToken|bearerToken|authToken|sessionToken|chat_token|deepseek_token|qwen_token)"\s*:\s*"((?:eyJ|ya29\.|ya\.)[\w\-\.+\/=]+)"/gi,
      /token["\s:=]+((?:eyJ|ya29\.|ya\.)[\w\-\.+\/=]{50,})/gi,
    ];
    
    for (const file of files) {
      try {
        const content = readFileSync(join(basePath, file), "utf-8");
        // Only scan files that mention this provider's domain
        const hasProviderDomain = providerDomains.some(d => {
          const escaped = d.replace(/\./g, "\\.");
          return new RegExp(escaped, "i").test(content);
        });
        if (!hasProviderDomain) continue;
        
        for (const p of patterns) {
          p.lastIndex = 0; let m;
          while ((m = p.exec(content)) !== null) {
            const val = m[1] || m[0];
            if (val && val.length > 20 && !seen.has(val)) {
              seen.add(val);
              results.push({ browser, domain: "localStorage", name: "Bearer Token (JWT)", value: val, decrypted: true, source: "localStorage", provider: providerName });
            }
          }
        }
      } catch {}
    }
    return results;
  } catch { return []; }
}

// ─── GET Handler ───
export async function GET() {
  if (process.platform !== "win32") {
    return NextResponse.json({ tokens: [], error: "Windows only" });
  }

  const providers = [
    { name: "deepseek", domains: ["chat.deepseek.com", ".deepseek.com", "deepseek.com", "api.deepseek.com"] },
    { name: "qwen", domains: ["chat.qwen.ai", ".qwen.ai", "qwen.ai", "qwenlm.ai", ".qwenlm.ai", "tongyi.aliyun.com", "aplus.qwen.ai"] },
    { name: "gemini", domains: ["gemini.google.com", "aistudio.google.com", "generativelanguage.googleapis.com"] },
    { name: "kimi", domains: ["kimi.moonshot.cn", ".moonshot.cn", "moonshot.cn", "api.moonshot.cn"] },
    { name: "z-ai", domains: ["chat.z.ai", ".z.ai", "z.ai", "api.z.ai", "open.bigmodel.cn"] },
  ];

  const allTokens: TokenResult[] = [];
  const browsers = getBrowserPaths();

  for (const prov of providers) {
    for (const b of browsers) {
      if (b.cookiePath) {
        const ct = scanCookies(b.cookiePath, b.name, prov.domains, prov.name);
        allTokens.push(...ct);
      }
      const lt = scanLocalStorage(b.localStoragePath, b.name, prov.domains, prov.name);
      allTokens.push(...lt);
    }
  }

  // Add browser-not-found notes
  for (const b of browsers) {
    if (!b.cookiePath) {
      allTokens.push({ browser: b.name, domain: "", name: "", value: "", decrypted: false, error: `${b.name} not found` });
    }
  }

  const valid = allTokens.filter(t => t.decrypted && t.value && t.value !== "[locked]");
  return NextResponse.json({
    tokens: allTokens,
    summary: { total: allTokens.length, valid: valid.length, encrypted: allTokens.filter(t => !t.decrypted).length },
  });
}
