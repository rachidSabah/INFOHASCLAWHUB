import { execSync } from "child_process";
import { existsSync, readFileSync, readdirSync, statSync } from "fs";
import { join } from "path";
import os from "os";
import crypto from "crypto";
import { NextResponse } from "next/server";

interface TokenResult {
  browser: string; domain: string; name: string; value: string;
  decrypted?: boolean; source?: "cookie" | "localStorage"; provider?: string; error?: string;
}

const isWin = process.platform === "win32";
const isLinux = process.platform === "linux";
const isMac = process.platform === "darwin";

// ─── DPAPI via temp files (Windows only) ───
function dpapiDecrypt(data: Buffer): Buffer | null {
  if (!isWin) return null;
  const tmpIn = join(os.tmpdir(), `ch_dpin_${Date.now()}.bin`);
  const tmpOut = join(os.tmpdir(), `ch_dpout_${Date.now()}.bin`);
  try {
    require("fs").writeFileSync(tmpIn, data);
    const psCmd = `Add-Type -AssemblyName System.Security;$i=[IO.File]::ReadAllBytes('${tmpIn.replace(/\\/g,"\\\\")}');$d=[Security.Cryptography.ProtectedData]::Unprotect($i,$null,'CurrentUser');[IO.File]::WriteAllBytes('${tmpOut.replace(/\\/g,"\\\\")}',$d)`;
    execSync(`powershell -NoProfile -NonInteractive -Command "${psCmd}"`, { encoding: "utf-8", timeout: 10000, windowsHide: true });
    if (existsSync(tmpOut) && statSync(tmpOut).size > 0) {
      return readFileSync(tmpOut);
    }
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[DPAPI]", msg.slice(0, 80));
  } finally {
    try { require("fs").unlinkSync(tmpIn); } catch {}
    try { require("fs").unlinkSync(tmpOut); } catch {}
  }
  return null;
}

// ─── Linux key derivation (Chrome uses PBKDF2 with "peanuts" password) ───
function getLinuxChromeKey(): Buffer {
  // Chrome on Linux (older versions) uses PBKDF2-HMAC-SHA1 with:
  //   password = "peanuts", salt = "saltysalt", iterations = 1, keylen = 16
  // This gives AES-128-CBC key for v10 cookies
  return crypto.pbkdf2Sync("peanuts", "saltysalt", 1, 16, "sha1");
}

// ─── Decrypt Chrome v10/v11 cookie (AES-256-GCM) ───
function decryptChromeCookieGCM(encryptedValue: Buffer, masterKey: Buffer): string | null {
  try {
    if (encryptedValue.length < 15) return null;
    const prefix = encryptedValue.toString("utf-8", 0, 3);
    if (prefix !== "v10" && prefix !== "v11") return null;
    const nonce = encryptedValue.slice(3, 15);  // 12 bytes
    const ciphertext = encryptedValue.slice(15);
    const tag = ciphertext.slice(-16);           // last 16 bytes = auth tag
    const encrypted = ciphertext.slice(0, -16);
    const decipher = crypto.createDecipheriv("aes-256-gcm", masterKey, nonce);
    decipher.setAuthTag(tag);
    const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
    return decrypted.toString("utf-8");
  } catch { return null; }
}

// ─── Decrypt Chrome v10 cookie with AES-128-CBC (Linux fallback) ───
function decryptChromeCookieCBC(encryptedValue: Buffer, key: Buffer): string | null {
  try {
    if (encryptedValue.length < 3) return null;
    const prefix = encryptedValue.toString("utf-8", 0, 3);
    if (prefix !== "v10" && prefix !== "v11") return null;
    // v10/v11 on Linux: strip 3-byte prefix, then AES-128-CBC with IV = 16 x 0x20
    const encrypted = encryptedValue.slice(3);
    const iv = Buffer.alloc(16, 0x20); // 16 space characters
    const decipher = crypto.createDecipheriv("aes-128-cbc", key, iv);
    const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
    return decrypted.toString("utf-8").replace(/\x00+$/, ""); // strip null padding
  } catch { return null; }
}

// ─── Get Chrome master key (cross-platform) ───
function getChromeMasterKey(userDataPath: string): Buffer | null {
  const localStatePath = join(userDataPath, "Local State");
  if (!existsSync(localStatePath)) return null;
  try {
    const localState = JSON.parse(readFileSync(localStatePath, "utf-8"));
    const encryptedKeyB64 = localState?.os_crypt?.encrypted_key;
    if (!encryptedKeyB64) return null;
    const encryptedKey = Buffer.from(encryptedKeyB64, "base64");

    // Windows: skip "DPAPI" prefix (5 bytes), then DPAPI decrypt
    if (encryptedKey.length > 5 && encryptedKey.toString("utf-8", 0, 5) === "DPAPI") {
      const rawKey = encryptedKey.slice(5);
      const decrypted = dpapiDecrypt(rawKey);
      return decrypted;
    }

    // macOS: skip "v10" prefix (3 bytes), then keychain decrypt via `security` CLI
    if (isMac && encryptedKey.length > 3 && encryptedKey.toString("utf-8", 0, 3) === "v10") {
      try {
        const keyBase64 = execSync(
          `security find-generic-password -wa "Chrome Safe Storage" 2>/dev/null`,
          { encoding: "utf-8", timeout: 5000 }
        ).trim();
        const key = crypto.pbkdf2Sync(keyBase64, "saltysalt", 1003, 16, "sha1");
        return key; // 16-byte key for AES-128-CBC on macOS
      } catch { return null; }
    }

    // Linux: some Chrome versions store key without DPAPI wrapper — raw base64 key
    if (isLinux) {
      try {
        // Try direct key (no DPAPI wrapper on some Linux Chrome versions)
        const rawKey = encryptedKey; // no prefix to skip
        if (rawKey.length === 32 || rawKey.length === 16) return rawKey;
        // If it's 37 bytes (5 byte prefix + 32 byte key), skip prefix
        if (rawKey.length === 37) return rawKey.slice(5);
      } catch { /* fall through */ }
    }

    // Fallback: try DPAPI anyway
    if (encryptedKey.length > 5) {
      const decrypted = dpapiDecrypt(encryptedKey.slice(5));
      if (decrypted) return decrypted;
    }

    return null;
  } catch { return null; }
}

// ─── Browser paths (cross-platform) ───
function getBrowserPaths(): { name: string; userDataPath: string; cookiePath: string }[] {
  const home = os.homedir();
  const browsers: { name: string; base: string }[] = [];

  if (isWin) {
    const local = process.env.LOCALAPPDATA || join(home, "AppData", "Local");
    browsers.push(
      { name: "Chrome", base: join(local, "Google", "Chrome", "User Data") },
      { name: "Edge", base: join(local, "Microsoft", "Edge", "User Data") },
      { name: "Brave", base: join(local, "BraveSoftware", "Brave-Browser", "User Data") },
    );
  } else if (isLinux) {
    browsers.push(
      { name: "Chrome", base: join(home, ".config", "google-chrome") },
      { name: "Chromium", base: join(home, ".config", "chromium") },
      { name: "Brave", base: join(home, ".config", "BraveSoftware", "Brave-Browser") },
      { name: "Edge", base: join(home, ".config", "microsoft-edge") },
      { name: "Vivaldi", base: join(home, ".config", "vivaldi") },
    );
  } else if (isMac) {
    browsers.push(
      { name: "Chrome", base: join(home, "Library", "Application Support", "Google", "Chrome") },
      { name: "Chromium", base: join(home, "Library", "Application Support", "Chromium") },
      { name: "Brave", base: join(home, "Library", "Application Support", "BraveSoftware", "Brave-Browser") },
      { name: "Edge", base: join(home, "Library", "Application Support", "Microsoft Edge") },
    );
  }

  return browsers.map(b => {
    let cookiePath = "";
    try {
      if (!existsSync(b.base)) return { name: b.name, userDataPath: b.base, cookiePath: "" };
      const dirs = readdirSync(b.base, { withFileTypes: true }).filter(d => d.isDirectory());
      // Try profile directories in order of priority
      const profileOrder = ["Default", "Profile 1", "Profile 2", "Profile 3"];
      for (const profileName of profileOrder) {
        const p = join(b.base, profileName, "Network", "Cookies");
        if (existsSync(p)) { cookiePath = p; break; }
        const p2 = join(b.base, profileName, "Cookies");
        if (existsSync(p2)) { cookiePath = p2; break; }
      }
      // Fallback: scan all subdirectories
      if (!cookiePath) {
        for (const d of dirs) {
          const p = join(b.base, d.name, "Network", "Cookies");
          if (existsSync(p)) { cookiePath = p; break; }
          const p2 = join(b.base, d.name, "Cookies");
          if (existsSync(p2)) { cookiePath = p2; break; }
        }
      }
    } catch {}
    return { name: b.name, userDataPath: b.base, cookiePath };
  });
}

// ─── Cookie scanner (cross-platform) ───
function scanCookies(cookiePath: string, masterKey: Buffer | null, browser: string, providerDomains: string[], providerName: string): TokenResult[] {
  try {
    // Copy the cookie DB to temp to avoid lock issues
    const tmpDbPath = join(os.tmpdir(), `ch_cookies_${Date.now()}.db`);
    try {
      const { copyFileSync } = require("fs") as typeof import("fs");
      copyFileSync(cookiePath, tmpDbPath);
    } catch {
      // If copy fails, try direct read
      return [{ browser, domain: "", name: "", value: "", decrypted: false, provider: providerName, error: "Cookie DB locked — close browser and retry" }];
    }

    const Database = require("better-sqlite3");
    const db = new Database(tmpDbPath, { readonly: true });
    const domains = providerDomains.map(d => `'${d}'`).join(",");
    let rows: { host_key: string; name: string; encrypted_value: Buffer }[];
    try {
      rows = db.prepare(`SELECT host_key, name, encrypted_value FROM cookies WHERE host_key IN (${domains})`).all();
    } catch {
      // Table might not exist or be empty
      db.close();
      try { require("fs").unlinkSync(tmpDbPath); } catch {}
      return [];
    }

    const linuxFallbackKey = isLinux ? getLinuxChromeKey() : null;
    const r: TokenResult[] = [];

    for (const row of rows) {
      const ev = Buffer.isBuffer(row.encrypted_value) ? row.encrypted_value : Buffer.from(row.encrypted_value || []);

      // Strategy 1: AES-256-GCM with master key (Windows DPAPI-decrypted key or Linux raw key)
      if (masterKey && masterKey.length === 32) {
        const val = decryptChromeCookieGCM(ev, masterKey);
        if (val) { r.push({ browser, domain: row.host_key, name: row.name, value: val, decrypted: true, source: "cookie", provider: providerName }); continue; }
      }

      // Strategy 2: AES-128-CBC with Linux fallback key (PBKDF2 "peanuts")
      if (linuxFallbackKey) {
        const val = decryptChromeCookieCBC(ev, linuxFallbackKey);
        if (val) { r.push({ browser, domain: row.host_key, name: row.name, value: val, decrypted: true, source: "cookie", provider: providerName }); continue; }
      }

      // Strategy 3: AES-128-CBC with macOS key
      if (isMac && masterKey && masterKey.length === 16) {
        const val = decryptChromeCookieCBC(ev, masterKey);
        if (val) { r.push({ browser, domain: row.host_key, name: row.name, value: val, decrypted: true, source: "cookie", provider: providerName }); continue; }
      }

      // Strategy 4: DPAPI fallback (Windows)
      if (isWin && ev.length > 15) {
        const plain = dpapiDecrypt(ev.slice(15));
        if (plain) { r.push({ browser, domain: row.host_key, name: row.name, value: plain.toString("utf-8"), decrypted: true, source: "cookie", provider: providerName }); continue; }
      }

      // Strategy 5: Plaintext (some Linux Chrome versions store cookies unencrypted)
      if (ev.length > 0 && ev[0] !== 0x76) { // not starting with 'v' (v10/v11 prefix)
        try {
          const plaintext = ev.toString("utf-8");
          if (plaintext.length > 5 && !/[\x00-\x08\x0e-\x1f]/.test(plaintext)) {
            r.push({ browser, domain: row.host_key, name: row.name, value: plaintext, decrypted: true, source: "cookie", provider: providerName });
            continue;
          }
        } catch {}
      }

      r.push({ browser, domain: row.host_key, name: row.name, value: "[locked]", decrypted: false, source: "cookie", provider: providerName, error: "Encrypted — close browser, run on desktop, or paste token manually" });
    }

    db.close();
    try { require("fs").unlinkSync(tmpDbPath); } catch {}
    return r;
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return [{ browser, domain: "", name: "", value: "", decrypted: false, provider: providerName, error: msg.slice(0, 100) }];
  }
}

// ─── localStorage Scanner for JWT tokens ───
function scanLocalStorage(basePath: string, browser: string, providerDomains: string[], providerName: string): TokenResult[] {
  try {
    if (!existsSync(basePath)) return [];
    const files = readdirSync(basePath).filter(f => f.endsWith(".log") || f.endsWith(".ldb"));
    const results: TokenResult[] = [];
    const seen = new Set<string>();
    const jwtPattern = /eyJ[a-zA-Z0-9_\-\.+\/=]{50,}/g;

    for (const file of files) {
      try {
        const content = readFileSync(join(basePath, file), "utf-8");
        const hasProviderDomain = providerDomains.some(d => {
          try { return new RegExp(d.replace(/\./g, "\\."), "i").test(content); } catch { return false; }
        });
        if (!hasProviderDomain) continue;

        jwtPattern.lastIndex = 0;
        let m;
        while ((m = jwtPattern.exec(content)) !== null) {
          const val = m[0];
          if (val.length > 50 && !seen.has(val)) {
            seen.add(val);
            results.push({ browser, domain: "localStorage", name: "Bearer Token (JWT)", value: val, decrypted: true, source: "localStorage", provider: providerName });
          }
        }
      } catch {}
    }
    return results;
  } catch { return []; }
}

// ─── Scan bridge service status ───
function scanBridgeStatus(): Record<string, { running: boolean; url: string; models: string[] }> {
  const bridges = [
    { name: "DeepSeek (ds2api)", url: "http://localhost:8000/v1" },
    { name: "Qwen (qw2api)", url: "http://localhost:8100/v1" },
    { name: "Kimi Bridge", url: "http://localhost:8200/v1" },
    { name: "GLM/Z.AI Bridge", url: "http://localhost:8300/v1" },
  ];
  const status: Record<string, { running: boolean; url: string; models: string[] }> = {};
  for (const bridge of bridges) {
    try {
      const resp = execSync(`curl -s -m 2 "${bridge.url}/models"`, { encoding: "utf-8", timeout: 5000 });
      const data = JSON.parse(resp);
      const models = (data.data || []).map((m: { id: string }) => m.id);
      status[bridge.name] = { running: true, url: bridge.url, models };
    } catch {
      status[bridge.name] = { running: false, url: bridge.url, models: [] };
    }
  }
  return status;
}

// ─── GET Handler ───
export async function GET() {
  const providers = [
    { name: "deepseek", domains: ["chat.deepseek.com", ".deepseek.com", "deepseek.com"] },
    { name: "qwen", domains: ["chat.qwen.ai", ".qwen.ai", "qwen.ai"] },
    { name: "gemini", domains: ["gemini.google.com", "aistudio.google.com"] },
    { name: "kimi", domains: ["kimi.moonshot.cn", ".moonshot.cn", "moonshot.cn"] },
    { name: "z-ai", domains: ["chat.z.ai", ".z.ai", "z.ai"] },
  ];

  const allTokens: TokenResult[] = [];
  const browserPaths = getBrowserPaths();
  const scannedBrowsers: string[] = [];

  for (const b of browserPaths) {
    if (!b.cookiePath || !existsSync(b.cookiePath)) {
      allTokens.push({ browser: b.name, domain: "", name: "", value: "", decrypted: false, error: `${b.name} cookies not found (not installed or no login)` });
      continue;
    }
    scannedBrowsers.push(b.name);
    const masterKey = getChromeMasterKey(b.userDataPath);
    console.log(`[Tokens] ${b.name}: masterKey=${!!masterKey}(${masterKey?.length}B), cookies=${b.cookiePath}`);

    for (const p of providers) {
      allTokens.push(...scanCookies(b.cookiePath, masterKey, b.name, p.domains, p.name));

      // Also scan localStorage for JWT Bearer tokens
      const lsPath = join(b.userDataPath, "Default", "Local Storage", "leveldb");
      if (existsSync(lsPath)) {
        allTokens.push(...scanLocalStorage(lsPath, b.name, p.domains, p.name));
      } else {
        try {
          const dirs = readdirSync(b.userDataPath, { withFileTypes: true }).filter(d => d.isDirectory());
          for (const d of dirs) {
            const p2 = join(b.userDataPath, d.name, "Local Storage", "leveldb");
            if (existsSync(p2)) { allTokens.push(...scanLocalStorage(p2, b.name, p.domains, p.name)); break; }
          }
        } catch {}
      }
    }
  }

  // Scan bridge services
  const bridgeStatus = scanBridgeStatus();

  const valid = allTokens.filter(t => t.decrypted);
  const platform = isWin ? "windows" : isLinux ? "linux" : "macos";

  return NextResponse.json({
    tokens: allTokens,
    summary: {
      total: allTokens.length,
      valid: valid.length,
      encrypted: allTokens.filter(t => !t.decrypted && t.name).length,
      browsersFound: scannedBrowsers,
    },
    platform,
    bridgeStatus,
  });
}
