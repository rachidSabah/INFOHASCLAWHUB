import { NextResponse } from "next/server";
import { scanForPII, redactPII } from "@/lib/federation-engine";
import type { PIICategory } from "@/lib/federation-engine";

export const dynamic = "force-dynamic";

function errorResponse(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

export async function POST(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const action = searchParams.get("action");

    const body = await req.json();
    const { content, piiTypes } = body as {
      content?: string;
      piiTypes?: PIICategory[];
    };

    if (!content) {
      return errorResponse("Missing required field: content", 400);
    }

    // Scan for PII
    const scanResults = scanForPII(content);

    // If action=redact, also redact
    if (action === "redact") {
      const typesToRedact = piiTypes ?? scanResults.map((r) => r.category);
      const redacted = redactPII(content, typesToRedact);

      return NextResponse.json({
        scanResults,
        redacted,
        piiTypes: typesToRedact,
        detectedCategories: scanResults.map((r) => r.category),
      });
    }

    // Default: scan only
    return NextResponse.json({
      scanResults,
      detectedCategories: scanResults.map((r) => r.category),
      hasPII: scanResults.length > 0,
    });
  } catch (error: unknown) {
    console.error("[FEDERATION_SCAN]", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return errorResponse(errorMessage, 500);
  }
}
