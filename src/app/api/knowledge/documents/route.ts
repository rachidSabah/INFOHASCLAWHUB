import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { generateEmbedding, chunkText } from "@/lib/embeddings";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const docs = await (db as any).knowledgeDocument.findMany({
      orderBy: { updatedAt: "desc" },
    });
    return NextResponse.json(docs);
  } catch (error) {
    console.error("[KNOWLEDGE_DOCS_GET]", error);
    return new NextResponse("Internal Error", { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { title, content } = body;

    if (!title || !content) {
      return new NextResponse("Title and content are required", { status: 400 });
    }

    const doc = await (db as any).knowledgeDocument.create({
      data: { title, content },
    });

    const chunks = chunkText(content);
    const chunkRecords: { documentId: string; content: string; embedding: string; index: number }[] = [];

    for (let i = 0; i < chunks.length; i++) {
      const embedding = await generateEmbedding(chunks[i]);
      chunkRecords.push({
        documentId: doc.id,
        content: chunks[i],
        embedding: JSON.stringify(embedding),
        index: i,
      });
    }

    if (chunkRecords.length > 0) {
      await (db as any).knowledgeChunk.createMany({
        data: chunkRecords,
      });
    }

    await (db as any).knowledgeDocument.update({
      where: { id: doc.id },
      data: { chunkCount: chunks.length },
    });

    const result = await (db as any).knowledgeDocument.findUnique({
      where: { id: doc.id },
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error("[KNOWLEDGE_DOCS_POST]", error);
    return new NextResponse("Internal Error", { status: 500 });
  }
}
