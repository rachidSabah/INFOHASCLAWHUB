/**
 * Smart Response Enhancer
 * Post-processes model responses to add structure, citations, and quality improvements.
 * This runs AFTER the model generates its response but BEFORE it's sent to the client.
 */

export interface ResponseEnhancement {
  /** Enhanced response text */
  enhancedText: string;
  /** Confidence level 0-1 */
  confidence: number;
  /** Detected response type */
  responseType: "explanation" | "code" | "analysis" | "creative" | "instruction" | "factual" | "mixed";
  /** Suggested follow-up questions */
  followUps: string[];
  /** Warning flags */
  warnings: string[];
  /** Key claims that could be verified */
  verifiableClaims: string[];
}

/**
 * Detect the type of response content for targeted enhancements
 */
export function detectResponseType(text: string): ResponseEnhancement["responseType"] {
  const codeIndicators = /```[\s\S]*?```/g;
  const analysisIndicators = /(?:analysis|findings|results|conclusion|summary|evaluation)/i;
  const instructionIndicators = /(?:step \d|first,|then,|next,|finally,|how to|guide)/i;
  const creativeIndicators = /(?:story|poem|imagine|creative|fiction|once upon)/i;
  const factualIndicators = /(?:according to|research shows|study found|data indicates|statistics show|reported that)/i;

  const hasCode = codeIndicators.test(text);
  const hasAnalysis = analysisIndicators.test(text);
  const hasInstructions = instructionIndicators.test(text);
  const hasCreative = creativeIndicators.test(text);
  const hasFactual = factualIndicators.test(text);

  if (hasCode && hasAnalysis) return "mixed";
  if (hasCode) return "code";
  if (hasAnalysis) return "analysis";
  if (hasInstructions) return "instruction";
  if (hasCreative) return "creative";
  if (hasFactual) return "factual";
  return "explanation";
}

/**
 * Extract verifiable claims from the response text
 */
export function extractVerifiableClaims(text: string): string[] {
  const claims: string[] = [];
  const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 20);

  // Patterns that indicate factual claims
  const claimPatterns = [
    /(?:is|are|was|were|has|have|had|can|will|would|should)\s+\d+/i,
    /(?:percent|%\s|billion|million|thousand)/i,
    /(?:according to|research shows|study found|data indicates|statistics)/i,
    /(?:first|last|only|largest|smallest|fastest|best|worst)/i,
    /(?:since|until|before|after|during)\s+\d{4}/i,
    /(?:discovered|invented|created|founded|established)\s+in/i,
  ];

  for (const sentence of sentences) {
    const trimmed = sentence.trim();
    if (claimPatterns.some(p => p.test(trimmed))) {
      claims.push(trimmed);
    }
  }

  return claims.slice(0, 5); // Limit to top 5 claims
}

/**
 * Generate follow-up questions based on the response
 */
export function generateFollowUps(text: string, originalPrompt: string): string[] {
  const followUps: string[] = [];
  const responseType = detectResponseType(text);
  const promptLower = originalPrompt.toLowerCase();

  switch (responseType) {
    case "code":
      followUps.push("Can you add error handling and edge case coverage?");
      followUps.push("How would you optimize this code for performance?");
      followUps.push("Can you add unit tests for this?");
      break;
    case "analysis":
      followUps.push("What are the limitations of this analysis?");
      followUps.push("Can you provide specific data points to support these findings?");
      followUps.push("What alternative interpretations exist?");
      break;
    case "instruction":
      followUps.push("Can you show me a practical example of this?");
      followUps.push("What are common mistakes to avoid?");
      followUps.push("How would I adapt this for a different scenario?");
      break;
    case "factual":
      followUps.push("Can you verify these claims with additional sources?");
      followUps.push("Are there any counterarguments or exceptions?");
      followUps.push("What's the latest development on this topic?");
      break;
    case "creative":
      followUps.push("Can you expand on this with more detail?");
      followUps.push("What if we approached this from a different angle?");
      break;
    default:
      if (promptLower.includes("how")) {
        followUps.push("Can you walk me through this step by step with an example?");
      }
      if (promptLower.includes("why")) {
        followUps.push("What evidence supports this explanation?");
      }
      if (promptLower.includes("best") || promptLower.includes("recommend")) {
        followUps.push("What are the trade-offs of this recommendation?");
      }
      break;
  }

  // Add context-specific follow-ups
  if (text.includes("```") && !promptLower.includes("test")) {
    followUps.push("How would you test this code?");
  }
  if (text.includes("TODO") || text.includes("FIXME") || text.includes("XXX")) {
    followUps.push("Can you resolve the TODO/FIXME items in this code?");
  }

  return followUps.slice(0, 4);
}

/**
 * Assess confidence level of the response
 */
export function assessConfidence(text: string, toolCallsCount: number, hadErrors: boolean): number {
  let confidence = 0.6; // Base confidence

  // Boost for tool usage (verified information)
  if (toolCallsCount > 0) confidence += Math.min(toolCallsCount * 0.05, 0.2);

  // Boost for specific data/citations
  if (/according to|research|study|data|statistics/i.test(text)) confidence += 0.1;
  if (/```[\s\S]*?```/g.test(text)) confidence += 0.05; // Code examples add credibility

  // Reduce for hedging language
  const hedgingPhrases = ["i think", "maybe", "perhaps", "might", "could possibly", "i'm not sure", "i believe"];
  const hedgingCount = hedgingPhrases.filter(p => text.toLowerCase().includes(p)).length;
  confidence -= hedgingCount * 0.05;

  // Reduce for errors
  if (hadErrors) confidence -= 0.15;

  // Reduce for very short responses
  if (text.length < 100) confidence -= 0.1;
  if (text.length < 50) confidence -= 0.15;

  // Boost for structured responses
  if (/^\d+[\.\)]|^-|^\*/m.test(text)) confidence += 0.05; // Has numbered/bullet lists

  return Math.max(0, Math.min(1, confidence));
}

/**
 * Detect warnings and potential issues in the response
 */
export function detectWarnings(text: string, hadErrors: boolean): string[] {
  const warnings: string[] = [];

  // Check for incomplete code blocks
  const codeBlockOpens = (text.match(/```/g) || []).length;
  if (codeBlockOpens % 2 !== 0) {
    warnings.push("Response contains an unclosed code block");
  }

  // Check for placeholder content
  if (/TODO|FIXME|XXX|PLACEHOLDER|INSERT.*HERE|YOUR.*HERE/i.test(text)) {
    warnings.push("Response contains placeholder or TODO items");
  }

  // Check for error indicators
  if (hadErrors) {
    warnings.push("Some tool operations encountered errors during execution");
  }

  // Check for truncated content
  if (text.endsWith("...") || text.endsWith(":") || text.endsWith("and more")) {
    warnings.push("Response may be truncated");
  }

  // Check for conflicting information
  const contradictionPatterns = [
    { positive: /yes[,;!]/i, negative: /no[,;!]/i },
    { positive: /correct/i, negative: /incorrect/i },
    { positive: /safe/i, negative: /unsafe|dangerous/i },
  ];
  for (const { positive, negative } of contradictionPatterns) {
    if (positive.test(text) && negative.test(text)) {
      warnings.push("Response may contain conflicting information");
      break;
    }
  }

  // Check for outdated information disclaimers
  if (/as of \d{4}|currently|at the time of/i.test(text)) {
    // Not a warning per se, but note temporal claims
  }

  return warnings;
}

/**
 * Enhance a model response with structured improvements
 */
export function enhanceResponse(
  text: string,
  originalPrompt: string,
  toolCallsCount: number = 0,
  hadErrors: boolean = false
): ResponseEnhancement {
  const responseType = detectResponseType(text);
  const confidence = assessConfidence(text, toolCallsCount, hadErrors);
  const followUps = generateFollowUps(text, originalPrompt);
  const warnings = detectWarnings(text, hadErrors);
  const verifiableClaims = extractVerifiableClaims(text);

  // Add confidence indicator for low-confidence responses
  let enhancedText = text;
  if (confidence < 0.4 && text.length > 100) {
    enhancedText = text; // Don't modify the text, just flag it
  }

  return {
    enhancedText,
    confidence,
    responseType,
    followUps,
    warnings,
    verifiableClaims,
  };
}
