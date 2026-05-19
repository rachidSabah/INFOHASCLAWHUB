import { db } from "@/lib/db";
import { NextRequest, NextResponse } from 'next/server';

let ZAI: any = null;
async function getZAI() {
  if (!ZAI) {
    const mod = await import('z-ai-web-dev-sdk');
    ZAI = mod.default;
  }
  return ZAI.create();
}



async function callAI(prompt: string) {
  try {
    const zai = await getZAI();
    const completion = await zai.chat.completions.create({
      messages: [
        { role: 'system', content: 'You are a data analytics expert. Analyze the provided event data and generate insights, trends, and recommendations. Return a JSON object with: "insights" (array of { title, description, severity }), "trends" (array of { metric, direction, change }), and "recommendations" (array of strings).' },
        { role: 'user', content: prompt }
      ],
    });
    return completion.choices[0]?.message?.content || '{}';
  } catch (error) {
    console.error('ZAI SDK error:', error);
    return '{}';
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const days = parseInt(searchParams.get('days') || '7');

    const since = new Date();
    since.setDate(since.getDate() - days);

    const events = await db.analyticsEvent.findMany({
      where: { createdAt: { gte: since } },
      orderBy: { createdAt: 'desc' },
    });

    // Compute basic stats
    const totalEvents = events.length;
    const byType: Record<string, number> = {};
    const byModel: Record<string, number> = {};
    let totalCost = 0;
    let totalTokens = 0;
    let totalDuration = 0;
    let successCount = 0;

    for (const event of events) {
      byType[event.eventType] = (byType[event.eventType] || 0) + 1;
      if (event.model) byModel[event.model] = (byModel[event.model] || 0) + 1;
      totalCost += event.cost || 0;
      totalTokens += event.tokensUsed || 0;
      totalDuration += event.duration || 0;
      if (event.success) successCount++;
    }

    const stats = {
      totalEvents,
      byType,
      byModel,
      totalCost: Math.round(totalCost * 100) / 100,
      totalTokens,
      avgDuration: totalEvents > 0 ? Math.round(totalDuration / totalEvents) : 0,
      successRate: totalEvents > 0 ? Math.round((successCount / totalEvents) * 100) : 0,
    };

    // Generate AI insights if there are events
    let insights = null;
    if (totalEvents > 0) {
      const aiResult = await callAI(
        `Analyze these analytics stats for the past ${days} days:\n\n${JSON.stringify(stats)}\n\nGenerate insights, trends, and recommendations as JSON.`
      );
      try {
        insights = JSON.parse(aiResult);
      } catch {
        insights = { insights: [], trends: [], recommendations: [aiResult] };
      }
    }

    return NextResponse.json({ period: `${days} days`, stats, insights });
  } catch (error: unknown) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unknown error' }, { status: 500 });
  }
}
