import { NextRequest, NextResponse } from "next/server";
import { 
  searchMemories, saveMemory, getMemoryContext, 
  cleanupExpiredMemories, getMemoryStats,
  classifyMemoryType 
} from "@/lib/enhanced-memory";

export async function POST(req: NextRequest) {
  try {
    const { action, key, content, type, query, limit } = await req.json();
    
    switch (action) {
      case "save":
        if (!key || !content) return NextResponse.json({ error: "key and content required" }, { status: 400 });
        const result = await saveMemory(key, content, type);
        return NextResponse.json(result);
        
      case "search":
        if (!query) return NextResponse.json({ error: "query required" }, { status: 400 });
        const searchResults = await searchMemories(query, limit || 10);
        return NextResponse.json({ results: searchResults });
        
      case "context":
        if (!query) return NextResponse.json({ error: "query required" }, { status: 400 });
        const context = await getMemoryContext(query, limit || 5);
        return NextResponse.json({ context });
        
      case "cleanup":
        const deleted = await cleanupExpiredMemories();
        return NextResponse.json({ deleted });
        
      case "classify":
        if (!content) return NextResponse.json({ error: "content required" }, { status: 400 });
        const memType = classifyMemoryType(content, key || "");
        return NextResponse.json({ type: memType });
        
      case "stats":
        const stats = await getMemoryStats();
        return NextResponse.json(stats);
        
      default:
        return NextResponse.json({ error: "Unknown action. Use: save, search, context, cleanup, classify, stats" }, { status: 400 });
    }
  } catch (error) {
    return NextResponse.json({ error: "Memory operation failed" }, { status: 500 });
  }
}

export async function GET() {
  try {
    const stats = await getMemoryStats();
    return NextResponse.json(stats);
  } catch (error) {
    return NextResponse.json({ error: "Failed to get memory stats" }, { status: 500 });
  }
}
