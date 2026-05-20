import { execSync } from "child_process";
import { existsSync, readFileSync, readdirSync } from "fs";
import { join } from "path";
import os from "os";
import crypto from "crypto";
import { NextResponse } from "next/server";

interface TokenResult {
  browser: string; domain: string; name: string; value: string;
  decrypted?: boolean; source?: "cookie" | "localStorage"; provider?: string; error?: string;
}

// ─── DPAPI via temp files (reliable) ───
function dpapiDecrypt(data: Buffer): Buffer | null {
  const tmpIn = join(os.tmpdir(), `ch_dpin_${Date.now()}.bin`);
  const tmpOut = join(os.tmpdir(), `ch_dpout_${Date.now()}.bin`);
  try {
    require("fs").writeFileSync(tmpIn, data);
    const psCmd = `Add-Type -AssemblyName System.Security;$i=[IO.File]::ReadAllBytes('${tmpIn.replace(/\\/g,"\\\\")}');$d=[Security.Cryptography.ProtectedData]::Unprotect($i,$null,'CurrentUser');[IO.File]::WriteAllBytes('${tmpOut.replace(/\\/g,"\\\\")}',$d)`;
    execSync(`powershell -NoProfile -NonInteractive -Command "${psCmd}"`, { encoding: "utf-8", timeout: 10000, windowsHide: true });
    if (existsSync(tmpOut) && require("fs").statSync(tmpOut).size > 0) {
      return require("fs").readFileSync(tmpOut);
    }
  } catch (e: any) { console.error("[DPAPI]", e.message?.slice(0,80)); }
  finally { try { require("fs").unlinkSync(tmpIn); } catch {} try { require("fs").unlinkSync(tmpOut); } catch {} }
  return null;
}

// ─── Decrypt Chrome v10 cookie (AES-256-GCM) ───
function decryptChromeCookie(encryptedValue: Buffer, masterKey: Buffer): string | null {
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

// ─── Get Chrome master key ───
function getChromeMasterKey(userDataPath: string): Buffer | null {
  const localStatePath = join(userDataPath, "Local State");
  if (!existsSync(localStatePath)) return null;
  try {
    const localState = JSON.parse(readFileSync(localStatePath, "utf-8"));
    const encryptedKeyB64 = localState?.os_crypt?.encrypted_key;
    if (!encryptedKeyB64) return null;
    const encryptedKey = Buffer.from(encryptedKeyB64, "base64");
    // Skip "DPAPI" prefix (5 bytes)
    const rawKey = encryptedKey.slice(5);
    const decrypted = dpapiDecrypt(rawKey);
    return decrypted;
  } catch { return null; }
}

// ─── Browser paths ───
function getBrowserPaths(): { name: string; userDataPath: string; cookiePath: string }[] {
  const local = process.env.LOCALAPPDATA || join(os.homedir(), "AppData", "Local");
  const browsers: { name: string; base: string }[] = [
    { name: "Chrome", base: join(local, "Google", "Chrome", "User Data") },
    { name: "Edge", base: join(local, "Microsoft", "Edge", "User Data") },
    { name: "Brave", base: join(local, "BraveSoftware", "Brave-Browser", "User Data") },
  ];
  return browsers.map(b => {
    let cookiePath = "";
    try {
      const dirs = readdirSync(b.base, { withFileTypes: true }).filter(d => d.isDirectory());
      for (const d of dirs) {
        const p = join(b.base, d.name, "Network", "Cookies");
        if (existsSync(p)) { cookiePath = p; break; }
        const p2 = join(b.base, d.name, "Cookies");
        if (existsSync(p2)) { cookiePath = p2; break; }
      }
    } catch {}
    return { name: b.name, userDataPath: b.base, cookiePath };
  });
}

// ─── Cookie scanner ───
function scanCookies(cookiePath: string, masterKey: Buffer | null, browser: string, providerDomains: string[], providerName: string): TokenResult[] {
  try {
    const Database = require("better-sqlite3");
    const db = new Database(cookiePath, { readonly: true });
    const domains = providerDomains.map(d => `'${d}'`).join(",");
    const rows = db.prepare(`SELECT host_key, name, encrypted_value FROM cookies WHERE host_key IN (${domains})`).all();
    const r: TokenResult[] = [];
    for (const row of rows) {
      if (masterKey) {
        const val = decryptChromeCookie(row.encrypted_value, masterKey);
        if (val) { r.push({ browser, domain: row.host_key, name: row.name, value: val, decrypted: true, source: "cookie", provider: providerName }); continue; }
      }
      // Try plain DPAPI as fallback
      if (row.encrypted_value.length > 15) {
        const plain = dpapiDecrypt(row.encrypted_value.slice(15));
        if (plain) { r.push({ browser, domain: row.host_key, name: row.name, value: plain.toString("utf-8"), decrypted: true, source: "cookie", provider: providerName }); continue; }
      }
      r.push({ browser, domain: row.host_key, name: row.name, value: "[locked]", decrypted: false, source: "cookie", provider: providerName, error: "Locked" });
    }
    db.close();
    return r;
  } catch (e: any) {
    return [{ browser, domain: "", name: "", value: "", decrypted: false, error: e.message?.slice(0,80) }];
  }
}

// ─── GET Handler ───
export async function GET() {
  if (process.platform !== "win32") return NextResponse.json({ tokens: [], error: "Windows only" });
  const providers = [
    { name: "deepseek", domains: ["chat.deepseek.com", ".deepseek.com", "deepseek.com"] },
    { name: "qwen", domains: ["chat.qwen.ai", ".qwen.ai", "qwen.ai"] },
    { name: "gemini", domains: ["gemini.google.com", "aistudio.google.com"] },
    { name: "kimi", domains: ["kimi.moonshot.cn", ".moonshot.cn", "moonshot.cn"] },
    { name: "z-ai", domains: ["chat.z.ai", ".z.ai", "z.ai"] },
  ];
  const allTokens: TokenResult[] = [];
  for (const b of getBrowserPaths()) {
    if (!b.cookiePath) { allTokens.push({ browser: b.name, domain: "", name: "", value: "", decrypted: false, error: `${b.name} not found` }); continue; }
    const masterKey = getChromeMasterKey(b.userDataPath);
    console.log(`[Tokens] ${b.name}: masterKey=${!!masterKey}, cookies=${b.cookiePath}`);
    for (const p of providers) {
      allTokens.push(...scanCookies(b.cookiePath, masterKey, b.name, p.domains, p.name));
    }
  }
  const valid = allTokens.filter(t => t.decrypted);
  return NextResponse.json({ tokens: allTokens, summary: { total: allTokens.length, valid: valid.length, encrypted: allTokens.filter(t => !t.decrypted).length } });
}
