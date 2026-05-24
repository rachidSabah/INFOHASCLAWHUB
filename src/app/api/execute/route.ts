import { NextRequest, NextResponse } from "next/server";
import { exec } from "child_process";
import fs from "fs";
import path from "path";
import os from "os";

export async function POST(req: NextRequest) {
  try {
    const { language = "python", code, timeout = 30 } = await req.json();
    
    if (!code) {
      return NextResponse.json({ error: "No code provided" }, { status: 400 });
    }
    
    const maxTimeout = Math.min(timeout, 60);
    const tmpDir = os.tmpdir();
    const scriptId = `clawhub_api_exec_${Date.now()}`;
    const ext = (language === "javascript" || language === "js") ? "js" : "py";
    const scriptPath = path.join(tmpDir, `${scriptId}.${ext}`);
    
    fs.writeFileSync(scriptPath, code, "utf-8");
    
    const cmd = ext === "py" ? "python3" : "node";
    const startTime = Date.now();
    
    const result = await new Promise<any>((resolve) => {
      exec(`"${cmd}" "${scriptPath}"`, {
        timeout: maxTimeout * 1000,
        maxBuffer: 1024 * 1024,
      }, (error, stdout, stderr) => {
        try { fs.unlinkSync(scriptPath); } catch {}
        
        const duration = Date.now() - startTime;
        resolve({
          language: ext === "py" ? "python" : "javascript",
          exitCode: error ? (error as any).code || 1 : 0,
          stdout: stdout.substring(0, 50000),
          stderr: stderr.substring(0, 10000),
          duration: `${duration}ms`,
          timedOut: !!error?.killed,
          ...(error && !error.killed ? { error: error.message.substring(0, 1000) } : {}),
        });
      });
    });
    
    return NextResponse.json(result);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
