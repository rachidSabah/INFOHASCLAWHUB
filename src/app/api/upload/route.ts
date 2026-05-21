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
    const formData = await request.formData();
    const files = formData.getAll("files") as File[];

    if (!files || files.length === 0) {
      return NextResponse.json({ error: "No files provided" }, { status: 400 });
    }

    const uploadsDir = getUploadsDir();
    const results: Array<{ id: string; name: string; path: string; mimeType: string; size: number }> = [];

    for (const file of files) {
      if (!(file instanceof File)) continue;

      const buffer = Buffer.from(await file.arrayBuffer());
      const safeName = `${Date.now()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
      const filePath = path.join(uploadsDir, safeName);

      fs.writeFileSync(filePath, buffer);

      const record = await db.uploadedFile.create({
        data: {
          name: file.name,
          path: filePath,
          mimeType: file.type || "application/octet-stream",
          size: buffer.length,
        },
      });

      results.push({
        id: record.id,
        name: record.name,
        path: safeName,
        mimeType: record.mimeType,
        size: record.size,
      });
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
