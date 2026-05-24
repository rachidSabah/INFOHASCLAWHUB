import { NextRequest, NextResponse } from "next/server";
import { exportArtifact, getExportFormats, detectArtifactType } from "@/lib/artifact-system-v2";

export async function POST(req: NextRequest) {
  try {
    const { content, type, filename } = await req.json();
    
    if (!content) {
      return NextResponse.json({ error: "content is required" }, { status: 400 });
    }
    
    const artifactType = type || detectArtifactType(content).type;
    const result = exportArtifact(content, artifactType, filename);
    
    return NextResponse.json(result);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const type = searchParams.get("type") as any;
    
    if (!type) {
      return NextResponse.json({ error: "type parameter is required" }, { status: 400 });
    }
    
    const formats = getExportFormats(type);
    return NextResponse.json({ formats });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
