import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";

function errorResponse(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const skillsPath = path.join(process.cwd(), "skills");
    const skillDir = path.join(skillsPath, id);

    // Security check: ensure the path is within the skills directory
    const resolvedSkillsPath = path.resolve(skillsPath);
    const resolvedSkillDir = path.resolve(skillDir);
    if (!resolvedSkillDir.startsWith(resolvedSkillsPath)) {
      return errorResponse("Forbidden", 403);
    }

    if (!fs.existsSync(skillDir)) {
      return errorResponse("Skill not found", 404);
    }

    fs.rmSync(skillDir, { recursive: true, force: true });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[SKILL_DELETE]", error);
    const errorMessage = error instanceof Error ? error.message : "Failed to delete skill";
    return errorResponse(errorMessage, 500);
  }
}
