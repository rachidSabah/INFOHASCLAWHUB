import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import os from "os";

function resolveSafe(base: string, target: string): string {
  const resolved = path.resolve(base, target);
  if (!resolved.startsWith(base)) {
    throw new Error("Path traversal denied");
  }
  return resolved;
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const targetPath = searchParams.get("path") || os.homedir();
    const resolved = path.resolve(targetPath);

    if (!fs.existsSync(resolved)) {
      return NextResponse.json({ error: "Path does not exist" }, { status: 404 });
    }

    const stats = fs.statSync(resolved);
    if (!stats.isDirectory()) {
      const data = fs.readFileSync(resolved, "utf-8");
      return NextResponse.json({
        type: "file",
        name: path.basename(resolved),
        path: resolved,
        size: stats.size,
        content: data,
        updatedAt: stats.mtime,
      });
    }

    const entries = fs.readdirSync(resolved).map((name) => {
      const entryPath = path.join(resolved, name);
      try {
        const entryStats = fs.statSync(entryPath);
        return {
          name,
          path: entryPath,
          type: entryStats.isDirectory() ? "directory" : "file",
          size: entryStats.size,
          updatedAt: entryStats.mtime,
        };
      } catch {
        return {
          name,
          path: entryPath,
          type: "file",
          size: 0,
          updatedAt: new Date(),
        };
      }
    });

    entries.sort((a, b) => {
      if (a.type !== b.type) return a.type === "directory" ? -1 : 1;
      return a.name.localeCompare(b.name);
    });

    return NextResponse.json({
      type: "directory",
      name: path.basename(resolved),
      path: resolved,
      entries,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { action, targetPath, content } = body;

    const desktopPath = path.join(os.homedir(), "Desktop");

    if (action === "write") {
      const resolved = targetPath ? path.resolve(targetPath) : desktopPath;
      const parentDir = path.dirname(resolved);
      if (!fs.existsSync(parentDir)) {
        fs.mkdirSync(parentDir, { recursive: true });
      }
      fs.writeFileSync(resolved, content || "", "utf-8");
      return NextResponse.json({ success: true, path: resolved });
    }

    if (action === "mkdir") {
      const resolved = targetPath ? path.resolve(targetPath) : desktopPath;
      if (!fs.existsSync(resolved)) {
        fs.mkdirSync(resolved, { recursive: true });
      }
      return NextResponse.json({ success: true, path: resolved });
    }

    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const body = await req.json();
    const { targetPath } = body;

    if (!targetPath) {
      return NextResponse.json({ error: "Path is required" }, { status: 400 });
    }

    const resolved = path.resolve(targetPath);

    if (!fs.existsSync(resolved)) {
      return NextResponse.json({ error: "File not found" }, { status: 404 });
    }

    const stats = fs.statSync(resolved);
    if (!stats.isFile()) {
      return NextResponse.json({ error: "Path is not a file" }, { status: 400 });
    }

    const data = fs.readFileSync(resolved, "utf-8");
    return NextResponse.json({ content: data, path: resolved, size: stats.size, updatedAt: stats.mtime });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const targetPath = searchParams.get("path");

    if (!targetPath) {
      return NextResponse.json({ error: "Path is required" }, { status: 400 });
    }

    const resolved = path.resolve(targetPath);

    if (!fs.existsSync(resolved)) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const stats = fs.statSync(resolved);
    if (stats.isDirectory()) {
      fs.rmSync(resolved, { recursive: true, force: true });
    } else {
      fs.unlinkSync(resolved);
    }

    return NextResponse.json({ success: true, path: resolved });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
