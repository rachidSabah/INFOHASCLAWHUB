import { execSync } from "child_process";
import { existsSync, readFileSync, readdirSync, statSync, copyFileSync, unlinkSync } from "fs";
import { join } from "path";
import os from "os";
import crypto from "crypto";
import { NextResponse } from "next/server";

interface TokenResult {
  browser: string; domain: string; name: string; value: string;
  decrypted?: boolean; source?: "cookie" | "localStorage" | "manual" | "bookmarklet" | "playwright" | "cdp" | "submitted"; provider?: string; error?: string;
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
    try { unlinkSync(tmpIn); } catch {}
    try { unlinkSync(tmpOut); } catch {}
  }
  return null;
}

// ─── Linux key derivation strategies ───
function getLinuxChromeKey(): Buffer {
  return crypto.pbkdf2Sync("peanuts", "saltysalt", 1, 16, "sha1");
}

function getLinuxKeyringKey(browserName: string): Buffer | null {
  const appNames: Record<string, string> = {
    "Chrome": "chrome", "Chromium": "chromium", "Brave": "brave",
    "Edge": "microsoft-edge", "Vivaldi": "vivaldi",
  };
  const app = appNames[browserName];
  if (!app) return null;

  try {
    const password = execSync(
      `secret-tool lookup application ${app} 2>/dev/null || secret-tool lookup xdg:schema chrome_libsecret_os_crypt_password_v2 application ${app} 2>/dev/null`,
      { encoding: "utf-8", timeout: 5000 }
    ).trim();

    if (password) {
      return crypto.pbkdf2Sync(password, "saltysalt", 1, 16, "sha1");
    }
  } catch {}
  return null;
}

// ─── Check if app-bound encryption is in use (Chrome v127+ on Windows) ───
function checkAppBoundEncryption(userDataPath: string): boolean {
  if (!isWin) return false;
  try {
    const localStatePath = join(userDataPath, "Local State");
    if (!existsSync(localStatePath)) return false;
    const localState = JSON.parse(readFileSync(localStatePath, "utf-8"));
    return localState?.os_crypt?.app_bound_encrypted_key !== undefined;
  } catch { return false; }
}

// ─── Decrypt Chrome v10/v11 cookie (AES-256-GCM) ───
function decryptChromeCookieGCM(encryptedValue: Buffer, masterKey: Buffer): string | null {
  try {
    if (encryptedValue.length < 15) return null;
    const prefix = encryptedValue.toString("utf-8", 0, 3);
    if (prefix !== "v10" && prefix !== "v11") return null;
    const nonce = encryptedValue.slice(3, 15);
    const ciphertext = encryptedValue.slice(15);
    const tag = ciphertext.slice(-16);
    const encrypted = ciphertext.slice(0, -16);
    const decipher = crypto.createDecipheriv("aes-256-gcm", masterKey, nonce);
    decipher.setAuthTag(tag);
    const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
    return decrypted.toString("utf-8");
  } catch { return null; }
}

// ─── Decrypt Chrome v10/v11 cookie with AES-128-CBC (Linux/macOS) ───
function decryptChromeCookieCBC(encryptedValue: Buffer, key: Buffer): string | null {
  try {
    if (encryptedValue.length < 3) return null;
    const prefix = encryptedValue.toString("utf-8", 0, 3);
    if (prefix !== "v10" && prefix !== "v11") return null;
    const encrypted = encryptedValue.slice(3);
    const iv = Buffer.alloc(16, 0x20);
    const decipher = crypto.createDecipheriv("aes-128-cbc", key, iv);
    const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
    return decrypted.toString("utf-8").replace(/\x00+$/, "");
  } catch { return null; }
}

// ─── Get Chrome master key (cross-platform) ───
function getChromeMasterKey(userDataPath: string, browserName: string): { key: Buffer | null; reason: string } {
  const localStatePath = join(userDataPath, "Local State");
  if (!existsSync(localStatePath)) {
    return { key: null, reason: "No Local State file — browser not initialized (no login history)" };
  }

  try {
    const localState = JSON.parse(readFileSync(localStatePath, "utf-8"));
    const encryptedKeyB64 = localState?.os_crypt?.encrypted_key;
    if (!encryptedKeyB64) {
      return { key: null, reason: "No encrypted_key in Local State" };
    }
    const encryptedKey = Buffer.from(encryptedKeyB64, "base64");

    if (isWin) {
      if (checkAppBoundEncryption(userDataPath)) {
        return { key: null, reason: "Chrome v127+ app-bound encryption — use Bookmarklet or Playwright auto-extract instead" };
      }
      if (encryptedKey.length > 5 && encryptedKey.toString("utf-8", 0, 5) === "DPAPI") {
        const rawKey = encryptedKey.slice(5);
        const decrypted = dpapiDecrypt(rawKey);
        if (decrypted) return { key: decrypted, reason: "DPAPI decryption successful" };
        return { key: null, reason: "DPAPI decryption failed — use Bookmarklet auto-extract instead" };
      }
      return { key: null, reason: "Unknown encryption format on Windows" };
    }

    if (isMac) {
      if (encryptedKey.length > 3 && encryptedKey.toString("utf-8", 0, 3) === "v10") {
        try {
          const keyPassword = execSync(
            `security find-generic-password -wa "Chrome Safe Storage" 2>/dev/null`,
            { encoding: "utf-8", timeout: 5000 }
          ).trim();
          const key = crypto.pbkdf2Sync(keyPassword, "saltysalt", 1003, 16, "sha1");
          return { key, reason: "macOS Keychain key retrieved" };
        } catch {
          return { key: null, reason: "macOS Keychain access denied — use Bookmarklet auto-extract instead" };
        }
      }
    }

    if (isLinux) {
      const keyringKey = getLinuxKeyringKey(browserName);
      if (keyringKey) {
        return { key: keyringKey, reason: "Linux keyring key retrieved via secret-tool" };
      }

      try {
        const rawKey = encryptedKey;
        if (rawKey.length === 32) return { key: rawKey, reason: "Raw 32-byte key found" };
        if (rawKey.length === 16) return { key: rawKey, reason: "Raw 16-byte key found" };
        if (rawKey.length === 37) return { key: rawKey.slice(5), reason: "Key with 5-byte prefix" };
      } catch {}

      if (encryptedKey.length > 5 && encryptedKey.toString("utf-8", 0, 5) === "DPAPI") {
        return { key: null, reason: "Key uses Windows DPAPI format — use Bookmarklet auto-extract instead" };
      }

      return { key: null, reason: "No keyring access. Use Bookmarklet auto-extract (no F12 needed) or install: sudo apt install libsecret-tools" };
    }

    return { key: null, reason: "Unsupported platform" };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return { key: null, reason: `Error reading master key: ${msg.slice(0, 100)}` };
  }
}

// ─── Browser paths (cross-platform) ───
function getBrowserPaths(): { name: string; userDataPath: string; cookiePath: string; installed: boolean }[] {
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
    let installed = false;
    try {
      if (!existsSync(b.base)) return { name: b.name, userDataPath: b.base, cookiePath: "", installed: false };
      installed = true;
      const dirs = readdirSync(b.base, { withFileTypes: true }).filter(d => d.isDirectory());
      const profileOrder = ["Default", "Profile 1", "Profile 2", "Profile 3"];
      for (const profileName of profileOrder) {
        const p = join(b.base, profileName, "Network", "Cookies");
        if (existsSync(p)) { cookiePath = p; break; }
        const p2 = join(b.base, profileName, "Cookies");
        if (existsSync(p2)) { cookiePath = p2; break; }
      }
      if (!cookiePath) {
        for (const d of dirs) {
          const p = join(b.base, d.name, "Network", "Cookies");
          if (existsSync(p)) { cookiePath = p; break; }
          const p2 = join(b.base, d.name, "Cookies");
          if (existsSync(p2)) { cookiePath = p2; break; }
        }
      }
    } catch {}
    return { name: b.name, userDataPath: b.base, cookiePath, installed };
  });
}

// ─── Cookie scanner ───
function scanCookies(cookiePath: string, masterKey: Buffer | null, keyReason: string, browser: string, providerDomains: string[], providerName: string): TokenResult[] {
  try {
    const tmpDbPath = join(os.tmpdir(), `ch_cookies_${Date.now()}.db`);
    try {
      copyFileSync(cookiePath, tmpDbPath);
    } catch {
      return [{ browser, domain: "", name: "", value: "", decrypted: false, provider: providerName, error: "Cookie DB locked — close the browser, or use Bookmarklet auto-extract" }];
    }

    let Database: any;
    try {
      Database = require("better-sqlite3");
    } catch {
      return [{ browser, domain: "", name: "", value: "", decrypted: false, provider: providerName, error: "better-sqlite3 not available" }];
    }

    const db = new Database(tmpDbPath, { readonly: true });
    const domains = providerDomains.map(d => `'${d}'`).join(",");
    let rows: { host_key: string; name: string; encrypted_value: Buffer }[];
    try {
      rows = db.prepare(`SELECT host_key, name, encrypted_value FROM cookies WHERE host_key IN (${domains})`).all();
    } catch {
      db.close();
      try { unlinkSync(tmpDbPath); } catch {}
      return [];
    }

    const linuxFallbackKey = isLinux ? getLinuxChromeKey() : null;
    const linuxKeyringKey = isLinux ? getLinuxKeyringKey(browser) : null;
    const r: TokenResult[] = [];

    for (const row of rows) {
      const ev = Buffer.isBuffer(row.encrypted_value) ? row.encrypted_value : Buffer.from(row.encrypted_value || []);
      if (ev.length === 0) continue;

      if (masterKey && masterKey.length === 32) {
        const val = decryptChromeCookieGCM(ev, masterKey);
        if (val) { r.push({ browser, domain: row.host_key, name: row.name, value: val, decrypted: true, source: "cookie", provider: providerName }); continue; }
      }
      if (linuxKeyringKey) {
        const val = decryptChromeCookieCBC(ev, linuxKeyringKey);
        if (val) { r.push({ browser, domain: row.host_key, name: row.name, value: val, decrypted: true, source: "cookie", provider: providerName }); continue; }
      }
      if (linuxFallbackKey) {
        const val = decryptChromeCookieCBC(ev, linuxFallbackKey);
        if (val) { r.push({ browser, domain: row.host_key, name: row.name, value: val, decrypted: true, source: "cookie", provider: providerName }); continue; }
      }
      if (isMac && masterKey && masterKey.length === 16) {
        const val = decryptChromeCookieCBC(ev, masterKey);
        if (val) { r.push({ browser, domain: row.host_key, name: row.name, value: val, decrypted: true, source: "cookie", provider: providerName }); continue; }
      }
      if (isWin && ev.length > 15) {
        const plain = dpapiDecrypt(ev.slice(15));
        if (plain) { r.push({ browser, domain: row.host_key, name: row.name, value: plain.toString("utf-8"), decrypted: true, source: "cookie", provider: providerName }); continue; }
      }
      if (ev.length > 0 && ev[0] !== 0x76) {
        try {
          const plaintext = ev.toString("utf-8");
          if (plaintext.length > 5 && !/[\x00-\x08\x0e-\x1f]/.test(plaintext)) {
            r.push({ browser, domain: row.host_key, name: row.name, value: plaintext, decrypted: true, source: "cookie", provider: providerName });
            continue;
          }
        } catch {}
      }

      r.push({ browser, domain: row.host_key, name: row.name, value: "[locked]", decrypted: false, source: "cookie", provider: providerName, error: "Encrypted — use Bookmarklet or Playwright auto-extract" });
    }

    db.close();
    try { unlinkSync(tmpDbPath); } catch {}
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

// ─── Load submitted tokens (from bookmarklets, Playwright, etc.) ───
function loadSubmittedTokens(): TokenResult[] {
  const tokensDir = join(process.cwd(), ".submitted-tokens");
  if (!existsSync(tokensDir)) return [];

  const results: TokenResult[] = [];
  try {
    const files = readdirSync(tokensDir).filter(f => f.endsWith(".json"));
    for (const file of files) {
      try {
        const data = JSON.parse(readFileSync(join(tokensDir, file), "utf-8"));
        for (const entry of data) {
          results.push({
            browser: entry.browser || "external",
            domain: "auto-extracted",
            name: entry.key || "Auto-extracted Token",
            value: entry.token,
            decrypted: true,
            source: entry.source || "submitted",
            provider: entry.provider,
          });
        }
      } catch {}
    }
  } catch {}
  return results;
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

// ─── Generate bookmarklets for one-click token extraction (NO F12 NEEDED!) ───
function getBookmarklets(): Record<string, { label: string; bookmarklet: string; instructions: string }> {
  const dashboardUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

  return {
    deepseek: {
      label: "DeepSeek Token Extractor",
      bookmarklet: `javascript:void(function(){var t;var ks=['userToken','token','authToken','access_token'];for(var i=0;i<ks.length;i++){var v=localStorage.getItem(ks[i]);if(v&&v.length>20){t=v;break;}}if(!t){for(var i=0;i<localStorage.length;i++){var k=localStorage.key(i);var v=localStorage.getItem(k);if(v&&v.length>50&&/^eyJ/.test(v)){t=v;break;}}}if(!t){var cs=document.cookie.split(';');for(var i=0;i<cs.length;i++){var p=cs[i].trim().split('=');if(p[1]&&p[1].length>20&&p[0].indexOf('token')>-1){t=p[1];break;}}}if(t){navigator.clipboard.writeText(t).then(function(){fetch('${dashboardUrl}/api/browser/tokens/submit',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token:t,provider:'deepseek',source:'bookmarklet',browser:navigator.userAgent.split(' ').pop()})}).then(function(r){return r.json()}).then(function(d){alert('Token sent to WebBridge! '+d.message)}).catch(function(){alert('Token copied! Paste it in WebBridge manually.')})})}else{alert('No token found. Make sure you are logged in to chat.deepseek.com')}}())`,
      instructions: "1. Drag this link to your bookmarks bar. 2. Go to chat.deepseek.com and log in. 3. Click the bookmark — token is extracted and sent to WebBridge automatically!",
    },
    qwen: {
      label: "Qwen Token Extractor",
      bookmarklet: `javascript:void(function(){var t;var ks=['token','authToken','access_token','userToken'];for(var i=0;i<ks.length;i++){var v=localStorage.getItem(ks[i]);if(v&&v.length>20){t=v;break;}}if(!t){for(var i=0;i<localStorage.length;i++){var k=localStorage.key(i);var v=localStorage.getItem(k);if(v&&v.length>50&&/^eyJ/.test(v)){t=v;break;}}}if(t){navigator.clipboard.writeText(t).then(function(){fetch('${dashboardUrl}/api/browser/tokens/submit',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token:t,provider:'qwen',source:'bookmarklet',browser:navigator.userAgent.split(' ').pop()})}).then(function(r){return r.json()}).then(function(d){alert('Token sent to WebBridge! '+d.message)}).catch(function(){alert('Token copied! Paste it in WebBridge manually.')})})}else{alert('No token found. Make sure you are logged in to chat.qwen.ai')}}())`,
      instructions: "1. Drag this link to your bookmarks bar. 2. Go to chat.qwen.ai and log in. 3. Click the bookmark — token is auto-extracted!",
    },
    gemini: {
      label: "Gemini API Key Helper",
      bookmarklet: `javascript:void(function(){var t=prompt('Paste your Gemini API key (starts with AIza...):','');if(t&&t.length>20){fetch('${dashboardUrl}/api/browser/tokens/submit',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token:t,provider:'gemini',source:'bookmarklet',browser:'manual'})}).then(function(r){return r.json()}).then(function(d){alert('API key saved to WebBridge! '+d.message)}).catch(function(){alert('Copy this key and paste it in WebBridge manually.')})}else{alert('Visit aistudio.google.com/apikey to get your free API key first.')}}())`,
      instructions: "1. Drag this link to your bookmarks bar. 2. Click it and paste your Gemini API key. 3. Key is saved to WebBridge automatically!",
    },
    kimi: {
      label: "Kimi Token Extractor",
      bookmarklet: `javascript:void(function(){var t;var ks=['token','authToken','access_token','userToken','Bearer'];for(var i=0;i<ks.length;i++){var v=localStorage.getItem(ks[i]);if(v&&v.length>20){t=v;break;}}if(!t){for(var i=0;i<localStorage.length;i++){var k=localStorage.key(i);var v=localStorage.getItem(k);if(v&&v.length>50&&/^eyJ/.test(v)){t=v;break;}}}if(t){navigator.clipboard.writeText(t).then(function(){fetch('${dashboardUrl}/api/browser/tokens/submit',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token:t,provider:'kimi',source:'bookmarklet',browser:navigator.userAgent.split(' ').pop()})}).then(function(r){return r.json()}).then(function(d){alert('Token sent to WebBridge! '+d.message)}).catch(function(){alert('Token copied! Paste it in WebBridge manually.')})})}else{alert('No token found. Make sure you are logged in to kimi.moonshot.cn')}}())`,
      instructions: "1. Drag this link to your bookmarks bar. 2. Go to kimi.moonshot.cn and log in. 3. Click the bookmark — token is auto-extracted!",
    },
    "z-ai": {
      label: "Z.AI / GLM Token Extractor",
      bookmarklet: `javascript:void(function(){var t;var ks=['authToken','token','access_token','userToken'];for(var i=0;i<ks.length;i++){var v=localStorage.getItem(ks[i]);if(v&&v.length>20){t=v;break;}}if(!t){for(var i=0;i<localStorage.length;i++){var k=localStorage.key(i);var v=localStorage.getItem(k);if(v&&v.length>50&&/^eyJ/.test(v)){t=v;break;}}}if(t){navigator.clipboard.writeText(t).then(function(){fetch('${dashboardUrl}/api/browser/tokens/submit',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token:t,provider:'z-ai',source:'bookmarklet',browser:navigator.userAgent.split(' ').pop()})}).then(function(r){return r.json()}).then(function(d){alert('Token sent to WebBridge! '+d.message)}).catch(function(){alert('Token copied! Paste it in WebBridge manually.')})})}else{alert('No token found. Make sure you are logged in to chat.z.ai')}}())`,
      instructions: "1. Drag this link to your bookmarks bar. 2. Go to chat.z.ai and log in. 3. Click the bookmark — token is auto-extracted!",
    },
  };
}

// ─── Client-side extraction scripts (for F12 console — legacy method) ───
function getClientSideScripts(): Record<string, { label: string; script: string }> {
  return {
    deepseek: {
      label: "Extract DeepSeek Token",
      script: `// Run this in chat.deepseek.com browser console (F12)
(function() {
  const keys = ['userToken', 'token', 'authToken', 'access_token'];
  for (const k of keys) {
    const v = localStorage.getItem(k);
    if (v && v.length > 20) {
      navigator.clipboard.writeText(v).then(() => alert('Token copied! Key: ' + k));
      return;
    }
  }
  alert('No token found. Try the Bookmarklet method instead!');
})();`,
    },
    qwen: {
      label: "Extract Qwen Token",
      script: `(function() {
  const keys = ['token', 'authToken', 'access_token', 'userToken'];
  for (const k of keys) {
    const v = localStorage.getItem(k);
    if (v && v.length > 20) {
      navigator.clipboard.writeText(v).then(() => alert('Qwen token copied! Key: ' + k));
      return;
    }
  }
  alert('No token found. Try the Bookmarklet method instead!');
})();`,
    },
    gemini: {
      label: "Get Gemini API Key",
      script: `alert('Gemini uses API keys, not session tokens.\\nVisit aistudio.google.com/apikey to get yours.\\nOr use the Bookmarklet for one-click setup!');`,
    },
    kimi: {
      label: "Extract Kimi Token",
      script: `(function() {
  const keys = ['token', 'authToken', 'access_token', 'userToken', 'Bearer'];
  for (const k of keys) {
    const v = localStorage.getItem(k);
    if (v && v.length > 20) {
      navigator.clipboard.writeText(v).then(() => alert('Kimi token copied! Key: ' + k));
      return;
    }
  }
  alert('No token found. Try the Bookmarklet method instead!');
})();`,
    },
    "z-ai": {
      label: "Extract GLM Token",
      script: `(function() {
  const keys = ['authToken', 'token', 'access_token', 'userToken'];
  for (const k of keys) {
    const v = localStorage.getItem(k);
    if (v && v.length > 20) {
      navigator.clipboard.writeText(v).then(() => alert('GLM token copied! Key: ' + k));
      return;
    }
  }
  alert('No token found. Try the Bookmarklet method instead!');
})();`,
    },
  };
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
  const keyStatuses: Record<string, string> = {};
  const browserInstallStatus: Record<string, string> = {};

  for (const b of browserPaths) {
    if (!b.installed || !b.cookiePath || !existsSync(b.cookiePath)) {
      // Clear status message — NOT "locked"
      const status = !b.installed
        ? "Not installed"
        : !b.cookiePath
          ? "Installed but no profile found (not logged in)"
          : "Cookie DB not found (not logged in)";
      browserInstallStatus[b.name] = status;
      allTokens.push({
        browser: b.name,
        domain: "",
        name: "",
        value: "",
        decrypted: false,
        error: `${b.name}: ${status}`,
      });
      continue;
    }
    scannedBrowsers.push(b.name);
    const { key: masterKey, reason: keyReason } = getChromeMasterKey(b.userDataPath, b.name);
    keyStatuses[b.name] = keyReason;
    browserInstallStatus[b.name] = "Installed, cookies found";
    console.log(`[Tokens] ${b.name}: masterKey=${!!masterKey}(${masterKey?.length || 0}B), reason=${keyReason.slice(0, 60)}`);

    for (const p of providers) {
      allTokens.push(...scanCookies(b.cookiePath, masterKey, keyReason, b.name, p.domains, p.name));

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

  // Load submitted tokens (from bookmarklets, Playwright, etc.)
  const submittedTokens = loadSubmittedTokens();
  allTokens.push(...submittedTokens);

  // Scan bridge services
  const bridgeStatus = scanBridgeStatus();

  const valid = allTokens.filter(t => t.decrypted);
  const platform = isWin ? "windows" : isLinux ? "linux" : "macos";

  // Check if Playwright is available
  let playwrightAvailable = false;
  try {
    require.resolve("playwright");
    playwrightAvailable = true;
  } catch {}

  return NextResponse.json({
    tokens: allTokens,
    summary: {
      total: allTokens.length,
      valid: valid.length,
      encrypted: allTokens.filter(t => !t.decrypted && t.name).length,
      submitted: submittedTokens.length,
      browsersFound: scannedBrowsers,
      browsersInstalled: browserInstallStatus,
      keyStatuses,
      playwrightAvailable,
    },
    platform,
    bridgeStatus,
    clientScripts: getClientSideScripts(),
    bookmarklets: getBookmarklets(),
    extractionMethods: {
      bookmarklet: {
        available: true,
        label: "Bookmarklet (Recommended — No F12!)",
        description: "Drag a link to your bookmarks bar. Click it on the provider's site to auto-extract and send the token.",
      },
      playwright: {
        available: playwrightAvailable,
        label: "Playwright Auto-Login",
        description: "Launches a browser, you log in, token is captured automatically from localStorage and network requests.",
      },
      cookieScan: {
        available: scannedBrowsers.length > 0,
        label: "Cookie DB Scan",
        description: "Reads browser cookie database directly. Requires decryption key (keyring/DPAPI/Keychain).",
      },
      manual: {
        available: true,
        label: "Manual Paste",
        description: "Copy the Bearer token from F12 → Network and paste it in the input field.",
      },
    },
  });
}
