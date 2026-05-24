import { NextResponse } from "next/server";
import { getEmbeddingProviderInfo } from "@/lib/embeddings";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const info = await getEmbeddingProviderInfo();
    return NextResponse.json(info);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to get embedding provider info";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
