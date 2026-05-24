import { NextRequest, NextResponse } from "next/server";
import { semanticCacheLookup, semanticCacheStore, semanticCacheInvalidate, semanticCacheStats } from "@/lib/semantic-cache";

export async function GET() {
  try {
    const stats = semanticCacheStats();
    return NextResponse.json(stats);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const { action, query, response, model, providerId, taskType, confidence } = await req.json();
    
    switch (action) {
      case "lookup": {
        const result = semanticCacheLookup(query, taskType, model);
        return NextResponse.json(result);
      }
      case "store": {
        const entryId = semanticCacheStore(query, response, model, providerId, taskType, confidence);
        return NextResponse.json({ stored: !!entryId, entryId });
      }
      case "invalidate": {
        const count = semanticCacheInvalidate(query, taskType);
        return NextResponse.json({ invalidated: count });
      }
      default:
        return NextResponse.json({ error: "Invalid action. Use: lookup, store, invalidate" }, { status: 400 });
    }
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
