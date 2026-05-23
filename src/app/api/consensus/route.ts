import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function GET() {
  return NextResponse.json({ message: "POST with { prompt, models: string[] } to run consensus across multiple AI providers", supported: true });
}

interface ConsensusResult {
  model: string;
  content: string;
  tokens?: { prompt: number; completion: number };
  cost?: number;
  duration: number;
  error?: string;
  qualityScore?: number;
}

interface VerificationResult {
  verified: boolean;
  primaryScore: number;
  verificationScore: number;
  mergedContent?: string;
  disagreement?: string[];
}

/**
 * Score a response based on basic quality heuristics.
 * Used for comparing responses across models in consensus mode.
 */
function scoreResponse(content: string, prompt: string): number {
  let score = 50; // Base score
  
  // Length appropriateness (not too short, not excessively long)
  if (content.length > 100) score += 10;
  if (content.length > 500) score += 10;
  if (content.length > 2000) score -= 5; // Slight penalty for excessive length
  
  // Contains code examples (for technical prompts)
  if (/```[\s\S]*?```/.test(content)) score += 15;
  
  // Contains structured formatting
  if (/^#{1,6}\s/m.test(content)) score += 5; // Headers
  if (/^\s*[-*]\s/m.test(content)) score += 5; // Bullet points
  if (/^\s*\d+[.)]\s/m.test(content)) score += 5; // Numbered lists
  
  // Addresses the prompt directly
  const promptKeywords = prompt.toLowerCase().split(/\s+/).filter(w => w.length > 4);
  const contentLower = content.toLowerCase();
  const keywordCoverage = promptKeywords.filter(kw => contentLower.includes(kw)).length / Math.max(promptKeywords.length, 1);
  score += Math.round(keywordCoverage * 20);
  
  // No error patterns
  if (content.includes("I apologize") || content.includes("I'm unable")) score -= 15;
  if (content.includes("I cannot") && !content.includes("I cannot find")) score -= 10;
  
  return Math.max(0, Math.min(100, score));
}

/**
 * Compare two responses and identify disagreements.
 */
function compareResponses(primary: string, verification: string, prompt: string): { disagreements: string[]; mergedContent: string } {
  const disagreements: string[] = [];
  
  // Check for factual disagreements by comparing key claims
  const primaryClaims = extractClaims(primary);
  const verificationClaims = extractClaims(verification);
  
  // Find claims in primary that contradict verification
  for (const claim of primaryClaims) {
    if (!verificationClaims.some(vc => isSimilar(claim, vc))) {
      disagreements.push(`Primary model claims: "${claim.slice(0, 100)}" — not confirmed by verification model`);
    }
  }
  
  // Merge insights: use the higher-quality response as base, supplement with unique points from the other
  const primaryScore = scoreResponse(primary, prompt);
  const verificationScore = scoreResponse(verification, prompt);
  
  let mergedContent: string;
  if (primaryScore >= verificationScore) {
    // Add unique insights from verification
    const uniqueInsights = verificationClaims.filter(vc => 
      !primaryClaims.some(pc => isSimilar(pc, vc))
    ).slice(0, 3);
    
    mergedContent = primary;
    if (uniqueInsights.length > 0) {
      mergedContent += `\n\n---\n**Additional insights from verification model:**\n${uniqueInsights.map(i => `- ${i}`).join('\n')}`;
    }
  } else {
    const uniqueInsights = primaryClaims.filter(pc => 
      !verificationClaims.some(vc => isSimilar(vc, pc))
    ).slice(0, 3);
    
    mergedContent = verification;
    if (uniqueInsights.length > 0) {
      mergedContent += `\n\n---\n**Additional insights from primary model:**\n${uniqueInsights.map(i => `- ${i}`).join('\n')}`;
    }
  }
  
  return { disagreements, mergedContent };
}

/**
 * Extract key claims/statements from text.
 */
function extractClaims(text: string): string[] {
  const claims: string[] = [];
  // Extract sentences that look like factual claims
  const sentences = text.split(/[.!?\n]/).map(s => s.trim()).filter(s => s.length > 20 && s.length < 200);
  for (const sentence of sentences.slice(0, 10)) {
    // Skip questions, commands, and code
    if (sentence.includes('```') || sentence.endsWith('?') || sentence.startsWith('Use ') || sentence.startsWith('Try ')) continue;
    claims.push(sentence);
  }
  return claims;
}

/**
 * Check if two text snippets are semantically similar (simple heuristic).
 */
function isSimilar(a: string, b: string): boolean {
  const aWords = new Set(a.toLowerCase().split(/\s+/).filter(w => w.length > 3));
  const bWords = new Set(b.toLowerCase().split(/\s+/).filter(w => w.length > 3));
  const intersection = [...aWords].filter(w => bWords.has(w));
  const union = new Set([...aWords, ...bWords]);
  // Jaccard similarity > 0.3
  return intersection.length / Math.max(union.size, 1) > 0.3;
}

export async function POST(req: NextRequest) {
  try {
    const { prompt, models, mode } = await req.json();
    if (!prompt || !models?.length) {
      return NextResponse.json({ error: "Prompt and models required" }, { status: 400 });
    }

    const results: ConsensusResult[] = [];

    // Run all models in parallel
    const promises = models.map(async (model: string) => {
      const start = Date.now();
      try {
        const chatRes = await fetch(`${req.nextUrl.origin}/api/gemini/chat`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            prompt,
            model,
            conversationHistory: [],
            stream: false,
          }),
          signal: AbortSignal.timeout(120000),
        });

        if (!chatRes.ok) {
          throw new Error(`HTTP ${chatRes.status}`);
        }

        // Read SSE stream response
        const reader = chatRes.body?.getReader();
        const decoder = new TextDecoder();
        let fullContent = "";
        let tokens = undefined;
        let cost = undefined;

        if (reader) {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            const text = decoder.decode(value, { stream: true });
            const lines = text.split("\n");
            for (const line of lines) {
              if (line.startsWith("data: ")) {
                try {
                  const data = JSON.parse(line.slice(6));
                  if (data.type === "chunk") {
                    fullContent += data.content;
                  } else if (data.type === "done") {
                    tokens = data.tokens;
                    cost = data.cost;
                  }
                } catch {}
              }
            }
          }
        }

        const qualityScore = scoreResponse(fullContent, prompt);

        return {
          model,
          content: fullContent || "(empty response)",
          tokens,
          cost,
          duration: Date.now() - start,
          qualityScore,
        };
      } catch (e: any) {
        return {
          model,
          content: "",
          error: e.message || "Failed",
          duration: Date.now() - start,
        };
      }
    });

    const allResults = await Promise.all(promises);

    // If mode is "verify", compare primary with best verification and return merged result
    if (mode === "verify" && allResults.length >= 2) {
      const validResults = allResults.filter(r => !r.error && r.content);
      if (validResults.length >= 2) {
        // Sort by quality score (highest first)
        validResults.sort((a, b) => (b.qualityScore || 0) - (a.qualityScore || 0));
        const primary = validResults[0];
        const verification = validResults[1];
        
        const comparison = compareResponses(primary.content, verification.content, prompt);
        
        const verificationResult: VerificationResult = {
          verified: comparison.disagreements.length === 0,
          primaryScore: primary.qualityScore || 0,
          verificationScore: verification.qualityScore || 0,
          mergedContent: comparison.mergedContent,
          disagreement: comparison.disagreements,
        };
        
        return NextResponse.json({ 
          results: allResults, 
          verification: verificationResult,
          bestModel: primary.model,
        });
      }
    }

    // If mode is "consensus" or default, return all results with rankings
    const rankedResults = [...allResults]
      .filter(r => !r.error && r.content)
      .sort((a, b) => (b.qualityScore || 0) - (a.qualityScore || 0));

    return NextResponse.json({ 
      results: allResults,
      ranked: rankedResults.map((r, i) => ({ rank: i + 1, model: r.model, score: r.qualityScore })),
      best: rankedResults[0]?.model || null,
    });
  } catch (error: unknown) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unknown error' }, { status: 500 });
  }
}
