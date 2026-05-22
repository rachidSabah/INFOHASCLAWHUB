import { NextResponse } from "next/server";
import { getSelfImprovingEngine } from "@/lib/self-improving";

export async function POST() {
  try {
    const result = await getSelfImprovingEngine().evolveTemplates();
    return NextResponse.json(result);
  } catch (error: unknown) {
    console.error("[SelfImproving/Evolve] POST error:", error instanceof Error ? error.message : "unknown");
    return NextResponse.json({ error: "Failed to evolve templates" }, { status: 500 });
  }
}
