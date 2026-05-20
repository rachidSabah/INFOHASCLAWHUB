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



async function callAI(prompt: string): Promise<string> {
  try {
    const zai = await getZAI();
    const completion = await zai.chat.completions.create({
      messages: [
        { role: 'system', content: 'You are a data analytics expert. Analyze the provided event data and generate insights, trends, and recommendations. Return a JSON object with: "insights" (array of { title, description, severity }), "trends" (array of { metric, direction, change }), and "recommendations" (array of strings).' },
        { role: 'user', content: prompt }
      ],
    });
    const result = completion.choices[0]?.message?.content;
    if (result && result.trim() && result.trim() !== '{}') return result;
    // If AI returned empty, fall through to smart fallback
  } catch (error) {
    console.error('[Analytics] ZAI SDK error:', error);
    // Fall through to smart fallback
  }
  return generateInsightsFallback(prompt);
}

function generateInsightsFallback(prompt: string): string {
  // Extract stats from the prompt
  const totalMatch = prompt.match(/"totalEvents"[":\s]+(\d+)/);
  const successRateMatch = prompt.match(/"successRate"[":\s]+(\d+)/);
  const avgDurationMatch = prompt.match(/"avgDuration"[":\s]+(\d+)/);
  const totalCostMatch = prompt.match(/"totalCost"[":\s]+([\d.]+)/);
  const daysMatch = prompt.match(/past (\d+) days/);

  const totalEvents = totalMatch ? parseInt(totalMatch[1]) : 0;
  const successRate = successRateMatch ? parseInt(successRateMatch[1]) : 0;
  const avgDuration = avgDurationMatch ? parseInt(avgDurationMatch[1]) : 0;
  const totalCost = totalCostMatch ? parseFloat(totalCostMatch[1]) : 0;
  const days = daysMatch ? parseInt(daysMatch[1]) : 7;

  const insights: Array<{ title: string; description: string; severity: string }> = [];
  const trends: Array<{ metric: string; direction: string; change: string }> = [];
  const recommendations: string[] = [];

  if (totalEvents > 0) {
    insights.push({
      title: 'Event Activity Detected',
      description: `${totalEvents} events recorded in the past ${days} days.`,
      severity: 'info',
    });
  }

  if (successRate > 0 && successRate < 90) {
    insights.push({
      title: 'Below-Target Success Rate',
      description: `Success rate is ${successRate}%, which is below the recommended 90% threshold.`,
      severity: 'warning',
    });
    recommendations.push('Investigate failing events and implement error handling improvements.');
  } else if (successRate >= 90) {
    insights.push({
      title: 'Healthy Success Rate',
      description: `Success rate is ${successRate}%, which meets the recommended threshold.`,
      severity: 'success',
    });
  }

  if (avgDuration > 5000) {
    insights.push({
      title: 'High Average Duration',
      description: `Average event duration is ${avgDuration}ms, which may indicate performance issues.`,
      severity: 'warning',
    });
    recommendations.push('Profile slow operations and optimize database queries or API calls.');
  }

  if (totalCost > 0) {
    trends.push({ metric: 'cost', direction: 'tracking', change: `$${totalCost.toFixed(2)} over ${days} days` });
  }

  if (totalEvents > 0) {
    trends.push({ metric: 'volume', direction: 'stable', change: `${totalEvents} events over ${days} days` });
  }

  if (recommendations.length === 0) {
    recommendations.push(
      'Continue monitoring event patterns for anomalies.',
      'Set up alerts for sudden changes in error rates or latency.',
      'Review analytics periodically to identify optimization opportunities.'
    );
  }

  return JSON.stringify({
    insights: insights.length > 0 ? insights : [{ title: 'Analytics Data Available', description: `Data for the past ${days} days is available. AI insight generation unavailable — review stats manually.`, severity: 'info' }],
    trends,
    recommendations,
  });
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
    let insights: { insights?: unknown[]; trends?: unknown[]; recommendations?: string[] } | null = null;
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
