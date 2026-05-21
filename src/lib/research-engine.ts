import { db } from '@/lib/db';

// ============================================================
// Types
// ============================================================

export interface Source {
  url: string;
  title: string;
  snippet: string;
  credibility: number;
  type: 'web' | 'code' | 'doc' | 'paper' | 'repo';
  hostName?: string;
  rank?: number;
  date?: string;
}

export interface CitationResult {
  id: string;
  sourceUrl?: string;
  sourceTitle: string;
  sourceType: string;
  snippet: string;
  relevanceScore: number;
  credibility: number;
}

export interface ResearchResult {
  sessionId: string;
  query: string;
  findings: string;
  citations: CitationResult[];
  sources: Source[];
  confidence: number;
}

interface HallucinationFlag {
  claim: string;
  evidence: string;
  confidence: number;
}

interface CitationGraphNode {
  id: string;
  title: string;
  type: string;
}

interface CitationGraphEdge {
  source: string;
  target: string;
  weight: number;
}

interface CitationGraph {
  nodes: CitationGraphNode[];
  edges: CitationGraphEdge[];
}

// ============================================================
// Domain reputation map for credibility scoring
// ============================================================

const HIGH_CREDIBILITY_DOMAINS = [
  '.edu', '.gov', '.ac.uk', '.ac.jp', '.ac.de', '.ac.fr',
  'nature.com', 'science.org', 'arxiv.org', 'pubmed.ncbi.nlm.nih.gov',
  'scholar.google.com', 'ieee.org', 'acm.org', 'springer.com',
  'wiley.com', 'elsevier.com', 'mit.edu', 'stanford.edu',
  'harvard.edu', 'oxford.ac.uk', 'cambridge.org',
];

const MEDIUM_CREDIBILITY_DOMAINS = [
  'wikipedia.org', 'stackoverflow.com', 'github.com', 'gitlab.com',
  'medium.com', 'towardsdatascience.com', 'hbr.org', 'reuters.com',
  'bbc.com', 'nytimes.com', 'washingtonpost.com', 'theguardian.com',
  'bloomberg.com', 'techcrunch.com', 'arstechnica.com',
  'microsoft.com', 'google.com', 'aws.amazon.com', 'docs.microsoft.com',
  'developer.mozilla.org', 'react.dev', 'nextjs.org', 'typescriptlang.org',
  'python.org', 'rust-lang.org', 'nodejs.org', 'postgresql.org',
  'openai.com', 'deepmind.com', 'anthropic.com',
];

// ============================================================
// Helper: credibility scoring
// ============================================================

function computeCredibility(url: string, hostName?: string): number {
  const domain = hostName || extractDomain(url);
  const lowerDomain = domain.toLowerCase();

  for (const high of HIGH_CREDIBILITY_DOMAINS) {
    if (lowerDomain.includes(high)) return 0.9 + Math.random() * 0.1; // 0.9–1.0
  }

  for (const med of MEDIUM_CREDIBILITY_DOMAINS) {
    if (lowerDomain.includes(med)) return 0.7 + Math.random() * 0.15; // 0.7–0.85
  }

  // Unknown domain — low credibility
  return 0.3 + Math.random() * 0.3; // 0.3–0.6
}

function extractDomain(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

function classifySourceType(url: string, hostName?: string): Source['type'] {
  const domain = (hostName || extractDomain(url)).toLowerCase();

  if (
    domain.includes('github.com') ||
    domain.includes('gitlab.com') ||
    domain.includes('bitbucket.org')
  ) {
    return 'repo';
  }

  if (
    domain.includes('arxiv.org') ||
    domain.includes('scholar.google') ||
    domain.includes('pubmed') ||
    domain.includes('nature.com') ||
    domain.includes('science.org')
  ) {
    return 'paper';
  }

  if (
    domain.includes('stackoverflow.com') ||
    domain.includes('docs.') ||
    domain.includes('developer.') ||
    domain.includes('readthedocs') ||
    domain.includes('mdn') ||
    domain.endsWith('.dev')
  ) {
    return 'doc';
  }

  if (
    url.includes('/blob/') ||
    url.includes('/tree/') ||
    url.includes('/src/') ||
    url.endsWith('.py') ||
    url.endsWith('.js') ||
    url.endsWith('.ts')
  ) {
    return 'code';
  }

  return 'web';
}

// ============================================================
// Helper: query reformulation
// ============================================================

function generateReformulations(query: string, depth: 'quick' | 'standard' | 'deep'): string[] {
  const queries = [query]; // always start with original

  if (depth === 'quick') return queries;

  // Standard: 2–3 total
  queries.push(`${query} overview analysis`);
  if (depth === 'standard') {
    queries.push(`${query} latest research findings`);
  }

  // Deep: 3–5 total
  if (depth === 'deep') {
    queries.push(`${query} critical review perspectives`);
    queries.push(`${query} evidence pros cons comparison`);
  }

  return queries;
}

// ============================================================
// Helper: call the internal chat API (SSE) and collect full text
// ============================================================

async function callChatAPI(
  prompt: string,
  model: string = 'gemini-2.0-flash',
  systemPrompt?: string
): Promise<string> {
  const response = await fetch('http://localhost:3000/api/gemini/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      prompt,
      model,
      conversationHistory: [],
      ...(systemPrompt ? { systemPrompt } : {}),
    }),
  });

  if (!response.ok) {
    throw new Error(`Chat API returned ${response.status}`);
  }

  // Consume SSE stream
  const reader = response.body?.getReader();
  if (!reader) throw new Error('No readable stream from chat API');

  const decoder = new TextDecoder();
  let fullText = '';
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed === 'data: [DONE]') continue;

      if (trimmed.startsWith('data: ')) {
        try {
          const data = JSON.parse(trimmed.slice(6));
          if (data.type === 'chunk' && data.content) {
            fullText += data.content;
          }
        } catch {
          // Ignore malformed SSE lines
        }
      }
    }
  }

  return fullText;
}

// ============================================================
// Helper: web search via z-ai-web-dev-sdk
// ============================================================

interface WebSearchResult {
  url: string;
  name: string;
  snippet: string;
  host_name: string;
  rank: number;
  date?: string;
  favicon?: string;
}

async function performWebSearch(query: string, num: number = 10): Promise<WebSearchResult[]> {
  const { default: ZAI } = await import('z-ai-web-dev-sdk');
  const zai = await ZAI.create();
  const results = await zai.functions.invoke('web_search', { query, num });
  return Array.isArray(results) ? results : [];
}

// ============================================================
// Helper: deduplicate sources by URL
// ============================================================

function deduplicateSources(sources: Source[]): Source[] {
  const seen = new Map<string, Source>();
  for (const src of sources) {
    const key = src.url.toLowerCase().replace(/\/+$/, '');
    if (!seen.has(key)) {
      seen.set(key, src);
    } else {
      // Keep the one with higher credibility
      const existing = seen.get(key)!;
      if (src.credibility > existing.credibility) {
        seen.set(key, src);
      }
    }
  }
  return Array.from(seen.values());
}

// ============================================================
// Helper: extract citations from synthesized text
// ============================================================

function extractCitationsFromText(
  text: string,
  sources: Source[]
): CitationResult[] {
  const citations: CitationResult[] = [];
  const citationPattern = /\[(\d+)\]/g;
  let match: RegExpExecArray | null;

  const referencedIndices = new Set<number>();

  while ((match = citationPattern.exec(text)) !== null) {
    const idx = parseInt(match[1], 10) - 1; // Convert 1-based to 0-based
    if (idx >= 0 && idx < sources.length) {
      referencedIndices.add(idx);
    }
  }

  for (const idx of Array.from(referencedIndices)) {
    const source = sources[idx];
    citations.push({
      id: `cit_${idx + 1}`,
      sourceUrl: source.url,
      sourceTitle: source.title,
      sourceType: source.type,
      snippet: source.snippet,
      relevanceScore: Math.max(0.1, 1 - idx * 0.1), // Higher for earlier sources
      credibility: source.credibility,
    });
  }

  return citations;
}

// ============================================================
// Helper: calculate overall confidence
// ============================================================

function calculateConfidence(sources: Source[], citations: CitationResult[]): number {
  if (sources.length === 0) return 0.1;

  // Factor 1: Source quality (average credibility)
  const avgCredibility =
    sources.reduce((sum, s) => sum + s.credibility, 0) / sources.length;

  // Factor 2: Source count — more sources = higher confidence, diminishing returns
  const sourceCountFactor = Math.min(1, sources.length / 8);

  // Factor 3: Source diversity — different types boost confidence
  const uniqueTypes = new Set(sources.map((s) => s.type)).size;
  const diversityFactor = Math.min(1, uniqueTypes / 3);

  // Factor 4: Citation coverage — how many sources are actually cited
  const citationRatio = sources.length > 0 ? citations.length / sources.length : 0;
  const coverageFactor = Math.min(1, citationRatio * 1.5);

  // Factor 5: Agreement — if top sources agree (heuristic: high-credibility sources are more reliable)
  const topSources = sources
    .slice(0, 5)
    .filter((s) => s.credibility >= 0.7);
  const agreementFactor = topSources.length >= 2 ? 0.8 : topSources.length === 1 ? 0.5 : 0.3;

  const raw =
    avgCredibility * 0.3 +
    sourceCountFactor * 0.2 +
    diversityFactor * 0.15 +
    coverageFactor * 0.15 +
    agreementFactor * 0.2;

  // Clamp to [0.05, 1.0]
  return Math.max(0.05, Math.min(1, raw));
}

// ============================================================
// ResearchEngine Class
// ============================================================

class ResearchEngine {
  // ----------------------------------------------------------
  // Start a research session
  // ----------------------------------------------------------
  async research(params: {
    query: string;
    depth?: 'quick' | 'standard' | 'deep';
    model?: string;
  }): Promise<ResearchResult> {
    const { query, depth = 'standard', model = 'gemini-2.0-flash' } = params;

    // Step 1: Create the session with status "searching"
    const session = await db.researchSession.create({
      data: {
        query,
        status: 'searching',
        depth,
        model,
        sources: '[]',
        citations: '[]',
      },
    });

    try {
      // Step 2: Generate reformulated queries
      const queries = generateReformulations(query, depth);

      // Step 3: Perform web searches
      const allRawSources: Source[] = [];

      for (const q of queries) {
        try {
          const results = await performWebSearch(q, 10);
          for (const r of results) {
            const credibility = computeCredibility(r.url, r.host_name);
            const type = classifySourceType(r.url, r.host_name);
            allRawSources.push({
              url: r.url,
              title: r.name,
              snippet: r.snippet,
              credibility,
              type,
              hostName: r.host_name,
              rank: r.rank,
              date: r.date,
            });
          }
        } catch (error: unknown) {
          console.error(
            '[ResearchEngine] Web search failed for query:',
            q,
            error instanceof Error ? error.message : error
          );
          // Continue with other queries even if one fails
        }
      }

      // Step 4: Deduplicate and sort by credibility
      const sources = deduplicateSources(allRawSources).sort(
        (a, b) => b.credibility - a.credibility
      );

      // Step 5: Update session with sources and status "analyzing"
      await db.researchSession.update({
        where: { id: session.id },
        data: {
          sources: JSON.stringify(sources),
          status: 'analyzing',
        },
      });

      // Step 6: Synthesize findings using the chat API
      const sourcesContext = sources
        .slice(0, 20) // Use top 20 sources for synthesis
        .map(
          (s, i) =>
            `[${i + 1}] "${s.title}" (${s.url})\n    ${s.snippet}`
        )
        .join('\n\n');

      const synthesisPrompt = `You are a rigorous research analyst. Synthesize the following sources into a comprehensive, well-structured analysis for the query: "${query}"

IMPORTANT RULES:
1. Use citation markers [1], [2], etc. to reference sources. Each factual claim MUST be backed by at least one source.
2. Do NOT fabricate information. Only state what the sources support.
3. If sources conflict, note the disagreement and cite both sides.
4. Organize findings with clear headings and subheadings.
5. Provide a brief summary at the beginning.
6. At the end, list key takeaways and any gaps in the available evidence.

SOURCES:
${sourcesContext}

Provide your synthesis in Markdown format:`;

      let findings: string;
      try {
        findings = await callChatAPI(synthesisPrompt, model);
      } catch (error: unknown) {
        console.error(
          '[ResearchEngine] Chat API synthesis failed:',
          error instanceof Error ? error.message : error
        );
        findings = this.buildFallbackFindings(query, sources);
      }

      // Step 7: Update status to "synthesizing"
      await db.researchSession.update({
        where: { id: session.id },
        data: {
          status: 'synthesizing',
        },
      });

      // Step 8: Extract citations from the findings
      const citations = extractCitationsFromText(findings, sources);

      // Step 9: Calculate confidence
      const confidence = calculateConfidence(sources, citations);

      // Step 10: Persist citations to the Citation table
      for (const cit of citations) {
        await db.citation.create({
          data: {
            researchId: session.id,
            sourceUrl: cit.sourceUrl,
            sourceTitle: cit.sourceTitle,
            sourceType: cit.sourceType,
            snippet: cit.snippet,
            relevanceScore: cit.relevanceScore,
            credibility: cit.credibility,
          },
        });
      }

      // Step 11: Update session to "completed"
      await db.researchSession.update({
        where: { id: session.id },
        data: {
          status: 'completed',
          findings,
          citations: JSON.stringify(citations),
          confidence,
        },
      });

      return {
        sessionId: session.id,
        query,
        findings,
        citations,
        sources,
        confidence,
      };
    } catch (error: unknown) {
      // Mark session as failed
      await db.researchSession.update({
        where: { id: session.id },
        data: {
          status: 'failed',
          findings: error instanceof Error ? `Research failed: ${error.message}` : 'Research failed due to an unknown error',
        },
      });

      throw error;
    }
  }

  // ----------------------------------------------------------
  // Get a research session by ID
  // ----------------------------------------------------------
  async getSession(id: string) {
    try {
      return await db.researchSession.findUnique({
        where: { id },
      });
    } catch (error: unknown) {
      console.error(
        '[ResearchEngine] Failed to get session:',
        error instanceof Error ? error.message : error
      );
      return null;
    }
  }

  // ----------------------------------------------------------
  // Get all research sessions
  // ----------------------------------------------------------
  async getAllSessions() {
    try {
      return await db.researchSession.findMany({
        orderBy: { createdAt: 'desc' },
      });
    } catch (error: unknown) {
      console.error(
        '[ResearchEngine] Failed to get all sessions:',
        error instanceof Error ? error.message : error
      );
      return [];
    }
  }

  // ----------------------------------------------------------
  // Delete a research session
  // ----------------------------------------------------------
  async deleteSession(id: string): Promise<void> {
    try {
      // Delete associated citations first
      await db.citation.deleteMany({
        where: { researchId: id },
      });

      await db.researchSession.delete({
        where: { id },
      });
    } catch (error: unknown) {
      console.error(
        '[ResearchEngine] Failed to delete session:',
        error instanceof Error ? error.message : error
      );
      throw new Error(
        `Failed to delete session: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  // ----------------------------------------------------------
  // Verify a citation (check if the source still exists)
  // ----------------------------------------------------------
  async verifyCitation(citationId: string): Promise<{
    isValid: boolean;
    updatedSnippet?: string;
    credibilityChange: number;
  }> {
    try {
      const citation = await db.citation.findUnique({
        where: { id: citationId },
      });

      if (!citation) {
        return { isValid: false, credibilityChange: -0.5 };
      }

      if (!citation.sourceUrl) {
        return { isValid: false, credibilityChange: -0.3 };
      }

      // Attempt to fetch the source URL
      try {
        const response = await fetch(citation.sourceUrl, {
          method: 'GET',
          signal: AbortSignal.timeout(10000), // 10s timeout
          headers: {
            'User-Agent':
              'Mozilla/5.0 (compatible; ResearchBot/1.0; +https://research.local)',
          },
        });

        if (!response.ok) {
          // Source URL is not reachable
          const credibilityChange = -0.3;
          await db.citation.update({
            where: { id: citationId },
            data: {
              credibility: Math.max(0, citation.credibility + credibilityChange),
              verifiedAt: new Date(),
            },
          });
          return { isValid: false, credibilityChange };
        }

        // Try to read the page content and check if snippet is still present
        const contentType = response.headers.get('content-type') || '';
        let updatedSnippet: string | undefined;
        let snippetMatches = false;

        if (contentType.includes('text/html') || contentType.includes('text/plain')) {
          const pageText = await response.text();

          // Check if the original snippet text appears in the page
          if (citation.snippet && citation.snippet.length > 20) {
            // Normalize whitespace for comparison
            const normalizedSnippet = citation.snippet
              .toLowerCase()
              .replace(/\s+/g, ' ')
              .trim();
            const normalizedPage = pageText
              .toLowerCase()
              .replace(/\s+/g, ' ')
              .trim();

            snippetMatches = normalizedPage.includes(
              normalizedSnippet.slice(0, Math.min(80, normalizedSnippet.length))
            );
          }

          if (snippetMatches) {
            // Snippet confirmed — boost credibility slightly
            const credibilityChange = 0.05;
            await db.citation.update({
              where: { id: citationId },
              data: {
                credibility: Math.min(1, citation.credibility + credibilityChange),
                verifiedAt: new Date(),
              },
            });
            return { isValid: true, credibilityChange };
          } else {
            // Page exists but snippet may have changed
            // Extract a brief updated snippet from the page
            const textContent = pageText
              .replace(/<[^>]*>/g, ' ')
              .replace(/\s+/g, ' ')
              .trim();

            updatedSnippet = textContent.slice(0, 300);

            const credibilityChange = -0.1;
            await db.citation.update({
              where: { id: citationId },
              data: {
                snippet: updatedSnippet,
                credibility: Math.max(0, citation.credibility + credibilityChange),
                verifiedAt: new Date(),
              },
            });
            return { isValid: true, updatedSnippet, credibilityChange };
          }
        }

        // Non-HTML content — assume valid if fetch succeeded
        const credibilityChange = 0.02;
        await db.citation.update({
          where: { id: citationId },
          data: {
            credibility: Math.min(1, citation.credibility + credibilityChange),
            verifiedAt: new Date(),
          },
        });
        return { isValid: true, credibilityChange };
      } catch (fetchError: unknown) {
        // Network error — source may be down
        const credibilityChange = -0.2;
        await db.citation.update({
          where: { id: citationId },
          data: {
            credibility: Math.max(0, citation.credibility + credibilityChange),
            verifiedAt: new Date(),
          },
        });
        return {
          isValid: false,
          credibilityChange,
        };
      }
    } catch (error: unknown) {
      console.error(
        '[ResearchEngine] Citation verification failed:',
        error instanceof Error ? error.message : error
      );
      return { isValid: false, credibilityChange: 0 };
    }
  }

  // ----------------------------------------------------------
  // Detect potential hallucinations in findings
  // ----------------------------------------------------------
  async detectHallucinations(sessionId: string): Promise<{
    flagged: HallucinationFlag[];
    overallRisk: 'low' | 'medium' | 'high';
  }> {
    try {
      const session = await db.researchSession.findUnique({
        where: { id: sessionId },
      });

      if (!session || !session.findings) {
        return { flagged: [], overallRisk: 'low' };
      }

      const parsedSources: Source[] = (() => {
        try {
          return JSON.parse(session.sources || '[]');
        } catch {
          return [];
        }
      })();

      const sourcesText = parsedSources
        .slice(0, 20)
        .map((s, i) => `[${i + 1}] ${s.title}: ${s.snippet}`)
        .join('\n');

      const hallucinationPrompt = `You are a fact-checking expert. Analyze the following research findings and identify any claims that appear to lack backing from the provided sources or seem potentially fabricated.

RESEARCH FINDINGS:
${session.findings}

AVAILABLE SOURCES:
${sourcesText}

For each potentially hallucinated or unsubstantiated claim, provide:
1. The exact claim from the findings
2. Evidence (or lack thereof) from the sources
3. Your confidence that this is hallucinated (0-1, where 1 = definitely hallucinated)

Respond with ONLY a JSON array of objects:
[
  {
    "claim": "the specific claim",
    "evidence": "why this might be hallucinated or what contradicts it",
    "confidence": 0.8
  }
]

If no hallucinations are detected, return an empty array [].`;

      let responseText: string;
      try {
        responseText = await callChatAPI(
          hallucinationPrompt,
          session.model || 'gemini-2.0-flash'
        );
      } catch (error: unknown) {
        console.error(
          '[ResearchEngine] Hallucination detection chat call failed:',
          error instanceof Error ? error.message : error
        );
        return { flagged: [], overallRisk: 'medium' };
      }

      // Parse the JSON array from the response
      let flagged: HallucinationFlag[] = [];
      try {
        const jsonMatch = responseText.match(/\[[\s\S]*\]/);
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0]);
          if (Array.isArray(parsed)) {
            flagged = parsed
              .filter(
                (item: unknown) =>
                  typeof item === 'object' &&
                  item !== null &&
                  'claim' in item &&
                  'evidence' in item &&
                  'confidence' in item
              )
              .map((item: Record<string, unknown>) => ({
                claim: String(item.claim),
                evidence: String(item.evidence),
                confidence: Number(item.confidence),
              }));
          }
        }
      } catch {
        // If parsing fails, return empty flagged list with medium risk
        console.error('[ResearchEngine] Failed to parse hallucination detection response');
      }

      // Determine overall risk
      let overallRisk: 'low' | 'medium' | 'high' = 'low';

      if (flagged.length > 0) {
        const avgConfidence =
          flagged.reduce((sum, f) => sum + f.confidence, 0) / flagged.length;

        if (flagged.length >= 3 || avgConfidence >= 0.7) {
          overallRisk = 'high';
        } else if (flagged.length >= 1 || avgConfidence >= 0.4) {
          overallRisk = 'medium';
        }
      }

      return { flagged, overallRisk };
    } catch (error: unknown) {
      console.error(
        '[ResearchEngine] Hallucination detection failed:',
        error instanceof Error ? error.message : error
      );
      return { flagged: [], overallRisk: 'medium' };
    }
  }

  // ----------------------------------------------------------
  // Export research as markdown with citations
  // ----------------------------------------------------------
  async exportMarkdown(sessionId: string): Promise<string> {
    try {
      const session = await db.researchSession.findUnique({
        where: { id: sessionId },
      });

      if (!session) {
        throw new Error(`Research session ${sessionId} not found`);
      }

      // Fetch citations separately since there's no explicit Prisma relation
      const citations = await db.citation.findMany({
        where: { researchId: sessionId },
      });

      const parsedSources: Source[] = (() => {
        try {
          return JSON.parse(session.sources || '[]');
        } catch {
          return [];
        }
      })();

      const date = new Date(session.createdAt).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      });

      const confidencePercent = session.confidence
        ? `${(session.confidence * 100).toFixed(1)}%`
        : 'N/A';

      let markdown = `# Research Report: ${session.query}\n\n`;
      markdown += `**Date:** ${date}\n`;
      markdown += `**Depth:** ${session.depth}\n`;
      markdown += `**Confidence:** ${confidencePercent}\n`;
      markdown += `**Status:** ${session.status}\n\n`;
      markdown += `---\n\n`;

      // Findings
      if (session.findings) {
        markdown += `## Findings\n\n${session.findings}\n\n`;
      } else {
        markdown += `## Findings\n\n*No findings available.*\n\n`;
      }

      markdown += `---\n\n`;

      // Sources
      markdown += `## Sources\n\n`;
      if (parsedSources.length > 0) {
        parsedSources.forEach((source, idx) => {
          const credibilityLabel =
            source.credibility >= 0.8
              ? '🟢 High'
              : source.credibility >= 0.5
                ? '🟡 Medium'
                : '🔴 Low';
          markdown += `### [${idx + 1}] ${source.title}\n\n`;
          markdown += `- **URL:** ${source.url}\n`;
          markdown += `- **Type:** ${source.type}\n`;
          markdown += `- **Credibility:** ${credibilityLabel} (${(source.credibility * 100).toFixed(0)}%)\n`;
          if (source.date) {
            markdown += `- **Date:** ${source.date}\n`;
          }
          markdown += `- **Snippet:** ${source.snippet}\n\n`;
        });
      } else {
        markdown += `*No sources recorded.*\n\n`;
      }

      markdown += `---\n\n`;

      // Citations
      markdown += `## Citation Details\n\n`;
      if (citations.length > 0) {
        citations.forEach((cit, idx) => {
          markdown += `### Citation ${idx + 1}\n\n`;
          markdown += `- **Title:** ${cit.sourceTitle}\n`;
          if (cit.sourceUrl) {
            markdown += `- **URL:** ${cit.sourceUrl}\n`;
          }
          markdown += `- **Type:** ${cit.sourceType}\n`;
          markdown += `- **Relevance:** ${(cit.relevanceScore * 100).toFixed(0)}%\n`;
          markdown += `- **Credibility:** ${(cit.credibility * 100).toFixed(0)}%\n`;
          if (cit.verifiedAt) {
            markdown += `- **Verified:** ${new Date(cit.verifiedAt).toLocaleDateString()}\n`;
          }
          markdown += `- **Snippet:** ${cit.snippet}\n\n`;
        });
      } else {
        markdown += `*No detailed citations available.*\n\n`;
      }

      markdown += `---\n\n`;
      markdown += `*Generated by Research Engine • ${date}*\n`;

      return markdown;
    } catch (error: unknown) {
      console.error(
        '[ResearchEngine] Markdown export failed:',
        error instanceof Error ? error.message : error
      );
      throw new Error(
        `Failed to export markdown: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  // ----------------------------------------------------------
  // Get citation graph for a session
  // ----------------------------------------------------------
  async getCitationGraph(sessionId: string): Promise<CitationGraph> {
    try {
      const session = await db.researchSession.findUnique({
        where: { id: sessionId },
      });

      if (!session) {
        return { nodes: [], edges: [] };
      }

      const parsedSources: Source[] = (() => {
        try {
          return JSON.parse(session.sources || '[]');
        } catch {
          return [];
        }
      })();

      const dbCitations = await db.citation.findMany({
        where: { researchId: sessionId },
      });

      const nodes: CitationGraphNode[] = [];
      const edges: CitationGraphEdge[] = [];

      // Add the main query as a node
      nodes.push({
        id: `query_${sessionId}`,
        title: session.query,
        type: 'query',
      });

      // Add source nodes
      for (const source of parsedSources) {
        const sourceId = `src_${encodeURIComponent(source.url).slice(0, 50)}`;
        nodes.push({
          id: sourceId,
          title: source.title || source.url,
          type: source.type,
        });

        // Edge from query to source
        edges.push({
          source: `query_${sessionId}`,
          target: sourceId,
          weight: source.credibility,
        });
      }

      // Add citation nodes and edges
      for (const cit of dbCitations) {
        const citNodeId = `cit_${cit.id}`;
        nodes.push({
          id: citNodeId,
          title: cit.sourceTitle,
          type: `citation_${cit.sourceType}`,
        });

        // Edge from citation to its source
        if (cit.sourceUrl) {
          const sourceId = `src_${encodeURIComponent(cit.sourceUrl).slice(0, 50)}`;
          edges.push({
            source: sourceId,
            target: citNodeId,
            weight: cit.relevanceScore,
          });
        }

        // Edge from query to citation
        edges.push({
          source: `query_${sessionId}`,
          target: citNodeId,
          weight: cit.credibility,
        });
      }

      // Add cross-reference edges between sources that share domains
      for (let i = 0; i < parsedSources.length; i++) {
        for (let j = i + 1; j < parsedSources.length; j++) {
          const domainA = extractDomain(parsedSources[i].url);
          const domainB = extractDomain(parsedSources[j].url);

          if (domainA === domainB) {
            const idA = `src_${encodeURIComponent(parsedSources[i].url).slice(0, 50)}`;
            const idB = `src_${encodeURIComponent(parsedSources[j].url).slice(0, 50)}`;
            edges.push({
              source: idA,
              target: idB,
              weight: 0.3, // Same-domain cross-reference
            });
          }
        }
      }

      return { nodes, edges };
    } catch (error: unknown) {
      console.error(
        '[ResearchEngine] Citation graph generation failed:',
        error instanceof Error ? error.message : error
      );
      return { nodes: [], edges: [] };
    }
  }

  // ----------------------------------------------------------
  // Private: build fallback findings when chat API fails
  // ----------------------------------------------------------
  private buildFallbackFindings(query: string, sources: Source[]): string {
    if (sources.length === 0) {
      return `## Research: ${query}\n\nNo sources were found for this query. The search may have failed or the topic may not have sufficient online coverage.\n\n*Note: AI synthesis was unavailable; this is a fallback summary.*`;
    }

    let findings = `## Research: ${query}\n\n`;
    findings += `*Note: AI synthesis was unavailable; this is an auto-generated summary from available sources.*\n\n`;
    findings += `### Key Findings\n\n`;

    sources.slice(0, 10).forEach((source, idx) => {
      findings += `[${idx + 1}] **${source.title}** — ${source.snippet}\n\n`;
    });

    findings += `\n### Summary\n\n`;
    findings += `Found ${sources.length} source(s) related to "${query}". `;
    findings += `The most credible sources are from `;
    findings += sources
      .slice(0, 3)
      .map((s) => s.hostName || extractDomain(s.url))
      .join(', ');
    findings += `.\n\n`;

    return findings;
  }
}

// ============================================================
// Singleton via globalThis
// ============================================================

const globalForResearch = globalThis as unknown as {
  researchEngine: ResearchEngine | undefined;
};

export function getResearchEngine(): ResearchEngine {
  if (!globalForResearch.researchEngine) {
    globalForResearch.researchEngine = new ResearchEngine();
  }
  return globalForResearch.researchEngine;
}

export { ResearchEngine };
