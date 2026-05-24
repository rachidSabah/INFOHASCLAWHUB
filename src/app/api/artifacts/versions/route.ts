import { NextRequest, NextResponse } from "next/server";
import { saveArtifactVersion, getArtifactVersions, rollbackArtifactVersion } from "@/lib/artifact-system-v2";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const artifactId = searchParams.get("artifactId");
    
    if (!artifactId) {
      return NextResponse.json({ error: "artifactId is required" }, { status: 400 });
    }
    
    const versions = await getArtifactVersions(artifactId);
    return NextResponse.json({ versions });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const { action, artifactId, content, message, versionId } = await req.json();
    
    switch (action) {
      case "save": {
        if (!artifactId || !content) {
          return NextResponse.json({ error: "artifactId and content are required" }, { status: 400 });
        }
        const version = await saveArtifactVersion(artifactId, content, message);
        return NextResponse.json({ saved: !!version, version });
      }
      case "rollback": {
        if (!artifactId || !versionId) {
          return NextResponse.json({ error: "artifactId and versionId are required" }, { status: 400 });
        }
        const success = await rollbackArtifactVersion(artifactId, versionId);
        return NextResponse.json({ success });
      }
      default:
        return NextResponse.json({ error: "Invalid action. Use: save, rollback" }, { status: 400 });
    }
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
