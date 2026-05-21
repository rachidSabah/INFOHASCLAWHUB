import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import fs from "fs";
import path from "path";

function getUploadsDir() {
  const dir = path.join(process.cwd(), "uploads");
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

export async function POST(request: NextRequest) {
  try {
    const uploadsDir = getUploadsDir();
    const results: Array<{ id: string; name: string; path: string; mimeType: string; size: number }> = [];

    const contentType = request.headers.get("content-type") || "";

    if (contentType.includes("multipart/form-data")) {
      const formData = await request.formData();
      let files: File[] = formData.getAll("files") as File[];

      if (files.length === 0) {
        const allFiles: File[] = [];
        for (const [, value] of formData.entries()) {
          if (value instanceof File) allFiles.push(value);
        }
        files = allFiles;
      }

      if (files.length === 0) {
        return NextResponse.json({ error: "No files provided" }, { status: 400 });
      }

      for (const file of files) {
        const buffer = Buffer.from(await file.arrayBuffer());
        const safeName = `${Date.now()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
        const filePath = path.join(uploadsDir, safeName);
        fs.writeFileSync(filePath, buffer);

        const record = await db.uploadedFile.create({
          data: { name: file.name, path: filePath, mimeType: file.type || "application/octet-stream", size: buffer.length },
        });
        results.push({ id: record.id, name: record.name, path: safeName, mimeType: record.mimeType, size: record.size });
      }
    } else {
      const buffer = Buffer.from(await request.arrayBuffer());
      if (buffer.length === 0) {
        return NextResponse.json({ error: "No file data received" }, { status: 400 });
      }
      const mimeType = contentType || "application/octet-stream";
      const ext = mimeType === "text/plain" ? ".txt" : mimeType === "application/pdf" ? ".pdf" : mimeType.includes("image") ? ".png" : ".bin";
      const safeName = `${Date.now()}-upload${ext}`;
      const filePath = path.join(uploadsDir, safeName);
      fs.writeFileSync(filePath, buffer);

      const record = await db.uploadedFile.create({
        data: { name: safeName, path: filePath, mimeType, size: buffer.length },
      });
      results.push({ id: record.id, name: record.name, path: safeName, mimeType: record.mimeType, size: record.size });
    }

    return NextResponse.json({ files: results });
  } catch (error: unknown) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Upload failed" },
      { status: 500 }
    );
  }
}

export async function GET() {
  try {
    const files = await db.uploadedFile.findMany({
      orderBy: { createdAt: "desc" },
      take: 50,
    });
    return NextResponse.json(files);
  } catch (error: unknown) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
