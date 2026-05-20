import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { generateEmbedding, cosineSimilarity } from "@/lib/embeddings";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { query, topK = 5 } = body;

    if (!query) {
      return new NextResponse("Query is required", { status: 400 });
    }

    const queryEmbedding = await generateEmbedding(query);

    const allChunks = await (db as any).knowledgeChunk.findMany({
      include: { document: true },
    });

    const results = allChunks
      .map((chunk: any) => {
        let chunkEmbedding: number[];
        try {
          chunkEmbedding = JSON.parse(chunk.embedding);
        } catch {
          chunkEmbedding = [];
        }
        const score = cosineSimilarity(queryEmbedding, chunkEmbedding);
        return {
          documentTitle: chunk.document.title,
          chunk: chunk.content,
          score,
        };
      })
      .filter((r: any) => r.score > 0)
      .sort((a: any, b: any) => b.score - a.score)
      .slice(0, topK);

    return NextResponse.json({ results });
  } catch (error) {
    console.error("[KNOWLEDGE_SEARCH]", error);
    return new NextResponse("Internal Error", { status: 500 });
  }
}
