// ============================================================
// Deep Research Mode — Iterative Multi-Step Research Engine
// (Like Perplexity Pro: multi-round search + extract + synthesize)
// ============================================================

import { db } from '@/lib/db';
import type { Source, CitationResult } from '@/lib/research-engine';

// ── Types ────────────────────────────────────────────────────

export type DeepResearchStatus =
  | 'generating_queries'
  | 'searching'
  | 'extracting'
  | 'gap_analysis'
  | 'synthesizing'
  | 'verifying'
  | 'completed'
  | 'failed';

export type ResearchDepth = 'quick' | 'standard' | 'deep';

export interface DeepResearchOptions {
  depth?: ResearchDepth;
  maxIterations?: number;
  maxSourcesPerQuery?: number;
  model?: string;
  verifyClaims?: boolean;
  onProgress?: (status: DeepResearchStatus, iteration: number, message: string) => void;
}

export interface DeepResearchFinding {
  url: string;
  title: string;
  content: string;
  snippet: string;
  credibility: number;
  sourceType: Source['type'];
  extractedAt: number;
  iteration: number;
}

export interface DeepResearchGap {
  topic: string;
  reason: string;
  suggestedQueries: string[];
  priority: 'high' | 'medium' | 'low';
}

export interface DeepResearchContradiction {
  claim: string;
  sourceA: { url: string; title: string; position: string };
  sourceB: { url: string; title: string; position: string };
  severity: 'major' | 'minor';
}

export interface DeepResearchSession {
  id: string;
  query: string;
  status: DeepResearchStatus;
  depth: ResearchDepth;
  model: string;
  currentIteration: number;
  maxIterations: number;
  searchQueries: string[];
  findings: DeepResearchFinding[];
  gaps: DeepResearchGap[];
  contradictions: DeepResearchContradiction[];
  synthesis: string | null;
  sources: Source[];
  citations: CitationResult[];
  confidence: number;
  startedAt: number;
  completedAt: number | null;
  error: string | null;
}

// ── Domain reputation map ────────────────────────────────────

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

// ── Helpers ──────────────────────────────────────────────────

function extractDomain(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

function computeCredibility(url: string, hostName?: string): number {
  const domain = (hostName || extractDomain(url)).toLowerCase();
  for (const high of HIGH_CREDIBILITY_DOMAINS) {
    if (domain.includes(high)) return 0.9 + Math.random() * 0.1;
  }
  for (const med of MEDIUM_CREDIBILITY_DOMAINS) {
    if (domain.includes(med)) return 0.7 + Math.random() * 0.15;
  }
  return 0.3 + Math.random() * 0.3;
}

function classifySourceType(url: string, hostName?: string): Source['type'] {
  const domain = (hostName || extractDomain(url)).toLowerCase();
  if (domain.includes('github.com') || domain.includes('gitlab.com') || domain.includes('bitbucket.org')) return 'repo';
  if (domain.includes('arxiv.org') || domain.includes('scholar.google') || domain.includes('pubmed') || domain.includes('nature.com') || domain.includes('science.org')) return 'paper';
  if (domain.includes('stackoverflow.com') || domain.includes('docs.') || domain.includes('developer.') || domain.includes('readthedocs') || domain.includes('mdn') || domain.endsWith('.dev')) return 'doc';
  if (url.includes('/blob/') || url.includes('/tree/') || url.includes('/src/') || url.endsWith('.py') || url.endsWith('.js') || url.endsWith('.ts')) return 'code';
  return 'web';
}

function deduplicateSources(sources: Source[]): Source[] {
  const seen = new Map<string, Source>();
  for (const src of sources) {
    const key = src.url.toLowerCase().replace(/\/+$/, '');
    if (!seen.has(key)) {
      seen.set(key, src);
    } else {
      const existing = seen.get(key)!;
      if (src.credibility > existing.credibility) seen.set(key, src);
    }
  }
  return Array.from(seen.values());
}

function deduplicateFindings(findings: DeepResearchFinding[]): DeepResearchFinding[] {
  const seen = new Map<string, DeepResearchFinding>();
  for (const f of findings) {
    const key = f.url.toLowerCase().replace(/\/+$/, '');
    if (!seen.has(key)) {
      seen.set(key, f);
    }
  }
  return Array.from(seen.values());
}

// ── Internal Chat API (SSE consumer) ─────────────────────────

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

// ── Web Search via z-ai-web-dev-sdk ──────────────────────────

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
  try {
    const { default: ZAI } = await import('z-ai-web-dev-sdk');
    const zai = await ZAI.create();
    const results = await zai.functions.invoke('web_search', { query, num });
    return Array.isArray(results) ? results : [];
  } catch (error: unknown) {
    console.error('[DeepResearch] Web search failed:', error instanceof Error ? error.message : error);
    return [];
  }
}

// ── Web Content Extraction via z-ai-web-dev-sdk ──────────────

async function extractContentFromUrl(url: string): Promise<{ title: string; content: string }> {
  try {
    const { default: ZAI } = await import('z-ai-web-dev-sdk');
    const zai = await ZAI.create();
    const result = await zai.functions.invoke('web_reader' as any, { url });
    if (result && typeof result === 'object') {
      const r = result as any;
      return {
        title: r.title ? String(r.title) : url,
        content: r.content ? String(r.content) : '',
      };
    }
    return { title: url, content: '' };
  } catch (error: unknown) {
    console.error('[DeepResearch] Content extraction failed for', url, error instanceof Error ? error.message : error);
    return { title: url, content: '' };
  }
}

// ── Fallback: try to use existing research API ───────────────

async function fallbackSearch(query: string): Promise<Source[]> {
  try {
    const response = await fetch('http://localhost:3000/api/research', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, depth: 'quick' }),
    });
    if (response.ok) {
      const result = await response.json();
      if (result.sources && Array.isArray(result.sources)) {
        return result.sources;
      }
    }
  } catch {
    // Silently ignore fallback failure
  }
  return [];
}

// ── Default options per depth level ──────────────────────────

const DEPTH_DEFAULTS: Record<ResearchDepth, { maxIterations: number; maxSourcesPerQuery: number }> = {
  quick: { maxIterations: 1, maxSourcesPerQuery: 5 },
  standard: { maxIterations: 2, maxSourcesPerQuery: 8 },
  deep: { maxIterations: 4, maxSourcesPerQuery: 10 },
};

// ============================================================
// DeepResearchEngine — Singleton
// ============================================================

class DeepResearchEngine {
  private sessions: Map<string, DeepResearchSession> = new Map();

  // ----------------------------------------------------------
  // Start a deep research session
  // ----------------------------------------------------------
  async startResearch(
    query: string,
    options: DeepResearchOptions = {}
  ): Promise<DeepResearchSession> {
    const depth = options.depth || 'standard';
    const depthDefaults = DEPTH_DEFAULTS[depth];
    const maxIterations = options.maxIterations ?? depthDefaults.maxIterations;
    const maxSourcesPerQuery = options.maxSourcesPerQuery ?? depthDefaults.maxSourcesPerQuery;
    const model = options.model || 'gemini-2.0-flash';
    const verifyClaims = options.verifyClaims ?? true;
    const onProgress = options.onProgress;

    const sessionId = `dr_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;

    const session: DeepResearchSession = {
      id: sessionId,
      query,
      status: 'generating_queries',
      depth,
      model,
      currentIteration: 0,
      maxIterations,
      searchQueries: [],
      findings: [],
      gaps: [],
      contradictions: [],
      synthesis: null,
      sources: [],
      citations: [],
      confidence: 0,
      startedAt: Date.now(),
      completedAt: null,
      error: null,
    };

    this.sessions.set(sessionId, session);

    // Persist session state to DB
    try {
      await db.researchSession.create({
        data: {
          id: sessionId,
          query,
          status: 'generating_queries',
          depth,
          model,
          sources: '[]',
          citations: '[]',
        },
      });
    } catch (dbError: unknown) {
      console.warn('[DeepResearch] DB session create failed, continuing in-memory:', dbError instanceof Error ? dbError.message : dbError);
    }

    // Run the research loop asynchronously
    this.runResearchLoop(sessionId, {
      maxIterations,
      maxSourcesPerQuery,
      model,
      verifyClaims,
      onProgress,
    }).catch((error: unknown) => {
      const s = this.sessions.get(sessionId);
      if (s) {
        s.status = 'failed';
        s.error = error instanceof Error ? error.message : 'Unknown error';
        s.completedAt = Date.now();
      }
      console.error('[DeepResearch] Research loop failed:', error instanceof Error ? error.message : error);
    });

    return session;
  }

  // ----------------------------------------------------------
  // Get current status of a research session
  // ----------------------------------------------------------
  getResearchStatus(sessionId: string): DeepResearchSession | null {
    return this.sessions.get(sessionId) ?? null;
  }

  // ----------------------------------------------------------
  // Generate search queries from a user's question using LLM
  // ----------------------------------------------------------
  async generateSearchQueries(query: string, model?: string): Promise<string[]> {
    const prompt = `You are a research query generator. Given the following research question, generate a list of 3-6 specific web search queries that together would provide comprehensive coverage of the topic.

RESEARCH QUESTION: "${query}"

IMPORTANT:
- Each query should target a different angle or sub-topic
- Use specific terminology that would return high-quality results
- Include queries for recent developments and historical context
- Some queries should seek factual data, others expert analysis

Respond with ONLY a JSON array of query strings, e.g.:
["query 1", "query 2", "query 3"]`;

    try {
      const response = await callChatAPI(prompt, model || 'gemini-2.0-flash');
      const jsonMatch = response.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        if (Array.isArray(parsed)) {
          return parsed.filter((q: unknown) => typeof q === 'string' && q.length > 0);
        }
      }
    } catch (error: unknown) {
      console.error('[DeepResearch] Query generation failed:', error instanceof Error ? error.message : error);
    }

    // Fallback: simple reformulations
    return [
      query,
      `${query} overview analysis`,
      `${query} latest research findings`,
    ];
  }

  // ----------------------------------------------------------
  // Execute a single web search query
  // ----------------------------------------------------------
  async executeSearch(
    searchQuery: string,
    maxResults: number = 10
  ): Promise<Source[]> {
    let rawResults = await performWebSearch(searchQuery, maxResults);

    // Fallback to existing research API if z-ai returns nothing
    if (rawResults.length === 0) {
      const fallback = await fallbackSearch(searchQuery);
      if (fallback.length > 0) return fallback;
    }

    return rawResults.map((r) => ({
      url: r.url,
      title: r.name,
      snippet: r.snippet,
      credibility: computeCredibility(r.url, r.host_name),
      type: classifySourceType(r.url, r.host_name),
      hostName: r.host_name,
      rank: r.rank,
      date: r.date,
    }));
  }

  // ----------------------------------------------------------
  // Extract content from a URL (read the full page)
  // ----------------------------------------------------------
  async extractContent(url: string): Promise<{ title: string; content: string }> {
    return extractContentFromUrl(url);
  }

  // ----------------------------------------------------------
  // Synthesize all findings into a comprehensive report
  // ----------------------------------------------------------
  async synthesize(
    findings: DeepResearchFinding[],
    query: string,
    model?: string
  ): Promise<string> {
    const sourcesContext = findings
      .slice(0, 30)
      .map((f, i) => `[${i + 1}] "${f.title}" (${f.url})\n    ${f.content.slice(0, 500)}`)
      .join('\n\n');

    const synthesisPrompt = `You are a rigorous deep research analyst. Synthesize the following research findings into a comprehensive, well-structured report for the query: "${query}"

IMPORTANT RULES:
1. Use citation markers [1], [2], etc. to reference sources. Each factual claim MUST be backed by at least one source.
2. Do NOT fabricate information. Only state what the sources support.
3. If sources conflict, explicitly note the disagreement and cite both sides.
4. Organize with clear headings and subheadings.
5. Start with an Executive Summary.
6. Include sections for: Background, Key Findings, Analysis, Contradictions/Debates, Gaps in Knowledge, and Conclusions.
7. At the end, provide actionable recommendations and rate your confidence (low/medium/high).

SOURCES:
${sourcesContext}

Provide your synthesis in Markdown format:`;

    try {
      return await callChatAPI(synthesisPrompt, model || 'gemini-2.0-flash');
    } catch (error: unknown) {
      console.error('[DeepResearch] Synthesis failed:', error instanceof Error ? error.message : error);
      return this.buildFallbackSynthesis(query, findings);
    }
  }

  // ----------------------------------------------------------
  // Verify claims and flag contradictions
  // ----------------------------------------------------------
  async verifyClaims(
    synthesis: string,
    sources: Source[]
  ): Promise<{ contradictions: DeepResearchContradiction[]; verified: boolean }> {
    const sourcesText = sources
      .slice(0, 20)
      .map((s, i) => `[${i + 1}] ${s.title}: ${s.snippet}`)
      .join('\n');

    const verificationPrompt = `You are a fact-checking expert. Analyze the following research synthesis and identify any contradictions between sources.

SYNTHESIS:
${synthesis}

AVAILABLE SOURCES:
${sourcesText}

For each contradiction found, provide:
1. The claim that is contradicted
2. Source A's position (url + position summary)
3. Source B's position (url + position summary)
4. Severity: "major" if fundamentally opposed, "minor" if just different framing

Respond with ONLY a JSON array:
[
  {
    "claim": "the specific claim",
    "sourceA": { "url": "...", "title": "...", "position": "..." },
    "sourceB": { "url": "...", "title": "...", "position": "..." },
    "severity": "major"
  }
]

If no contradictions found, return [].`;

    try {
      const response = await callChatAPI(verificationPrompt);
      const jsonMatch = response.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        if (Array.isArray(parsed)) {
          const contradictions: DeepResearchContradiction[] = parsed
            .filter(
              (item: unknown) =>
                typeof item === 'object' &&
                item !== null &&
                'claim' in item &&
                'sourceA' in item &&
                'sourceB' in item
            )
            .map((item: Record<string, unknown>) => ({
              claim: String(item.claim),
              sourceA: {
                url: String((item.sourceA as Record<string, unknown>)?.url ?? ''),
                title: String((item.sourceA as Record<string, unknown>)?.title ?? ''),
                position: String((item.sourceA as Record<string, unknown>)?.position ?? ''),
              },
              sourceB: {
                url: String((item.sourceB as Record<string, unknown>)?.url ?? ''),
                title: String((item.sourceB as Record<string, unknown>)?.title ?? ''),
                position: String((item.sourceB as Record<string, unknown>)?.position ?? ''),
              },
              severity: (item.severity as 'major' | 'minor') || 'minor',
            }));
          return { contradictions, verified: contradictions.length === 0 };
        }
      }
    } catch (error: unknown) {
      console.error('[DeepResearch] Claim verification failed:', error instanceof Error ? error.message : error);
    }

    return { contradictions: [], verified: true };
  }

  // ----------------------------------------------------------
  // Generate final markdown report
  // ----------------------------------------------------------
  async generateReport(sessionId: string): Promise<string> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Research session ${sessionId} not found`);
    }

    const date = new Date(session.startedAt).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });

    const confidencePercent = `${(session.confidence * 100).toFixed(1)}%`;
    const duration = session.completedAt
      ? ((session.completedAt - session.startedAt) / 1000).toFixed(1)
      : 'N/A';

    let report = `# Deep Research Report: ${session.query}\n\n`;
    report += `**Date:** ${date}\n`;
    report += `**Depth:** ${session.depth}\n`;
    report += `**Iterations:** ${session.currentIteration} / ${session.maxIterations}\n`;
    report += `**Confidence:** ${confidencePercent}\n`;
    report += `**Duration:** ${duration}s\n`;
    report += `**Sources Found:** ${session.findings.length}\n`;
    report += `**Queries Used:** ${session.searchQueries.length}\n`;
    report += `**Status:** ${session.status}\n\n`;
    report += `---\n\n`;

    // Search queries used
    report += `## Search Queries\n\n`;
    session.searchQueries.forEach((q, i) => {
      report += `${i + 1}. \`${q}\`\n`;
    });
    report += `\n---\n\n`;

    // Synthesis
    if (session.synthesis) {
      report += `## Synthesis\n\n${session.synthesis}\n\n`;
    } else {
      report += `## Synthesis\n\n*No synthesis available.*\n\n`;
    }

    report += `---\n\n`;

    // Contradictions
    if (session.contradictions.length > 0) {
      report += `## Contradictions Detected\n\n`;
      session.contradictions.forEach((c, i) => {
        const icon = c.severity === 'major' ? '🔴' : '🟡';
        report += `### ${icon} Contradiction ${i + 1}: ${c.claim}\n\n`;
        report += `- **Source A:** [${c.sourceA.title}](${c.sourceA.url}) — ${c.sourceA.position}\n`;
        report += `- **Source B:** [${c.sourceB.title}](${c.sourceB.url}) — ${c.sourceB.position}\n`;
        report += `- **Severity:** ${c.severity}\n\n`;
      });
      report += `---\n\n`;
    }

    // Knowledge gaps
    if (session.gaps.length > 0) {
      report += `## Knowledge Gaps\n\n`;
      session.gaps.forEach((g, i) => {
        const icon = g.priority === 'high' ? '🔺' : g.priority === 'medium' ? '🔸' : '🔹';
        report += `### ${icon} Gap ${i + 1}: ${g.topic}\n\n`;
        report += `**Reason:** ${g.reason}\n\n`;
        report += `**Suggested follow-up queries:**\n`;
        g.suggestedQueries.forEach((sq) => {
          report += `- \`${sq}\`\n`;
        });
        report += `\n`;
      });
      report += `---\n\n`;
    }

    // Sources
    report += `## Sources\n\n`;
    const uniqueSources = deduplicateSources(session.sources).sort(
      (a, b) => b.credibility - a.credibility
    );
    uniqueSources.forEach((source, idx) => {
      const credibilityLabel =
        source.credibility >= 0.8
          ? '🟢 High'
          : source.credibility >= 0.5
            ? '🟡 Medium'
            : '🔴 Low';
      report += `### [${idx + 1}] ${source.title}\n\n`;
      report += `- **URL:** ${source.url}\n`;
      report += `- **Type:** ${source.type}\n`;
      report += `- **Credibility:** ${credibilityLabel} (${(source.credibility * 100).toFixed(0)}%)\n`;
      if (source.date) report += `- **Date:** ${source.date}\n`;
      report += `- **Snippet:** ${source.snippet}\n\n`;
    });

    report += `---\n\n`;
    report += `*Generated by Deep Research Engine • ${date}*\n`;

    return report;
  }

  // ----------------------------------------------------------
  // Private: Main research loop
  // ----------------------------------------------------------
  private async runResearchLoop(
    sessionId: string,
    config: {
      maxIterations: number;
      maxSourcesPerQuery: number;
      model: string;
      verifyClaims: boolean;
      onProgress?: DeepResearchOptions['onProgress'];
    }
  ): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    const { maxIterations, maxSourcesPerQuery, model, verifyClaims, onProgress } = config;

    try {
      // ── Phase 1: Generate initial search queries ──────────
      session.status = 'generating_queries';
      this.updateSessionDb(session);
      onProgress?.('generating_queries', 0, 'Generating search queries from question...');

      const initialQueries = await this.generateSearchQueries(session.query, model);
      session.searchQueries.push(...initialQueries);

      // ── Iterative research loop ───────────────────────────
      for (let iteration = 0; iteration < maxIterations; iteration++) {
        session.currentIteration = iteration + 1;

        // ── Phase 2: Execute web searches ───────────────────
        session.status = 'searching';
        this.updateSessionDb(session);
        onProgress?.('searching', iteration + 1, `Iteration ${iteration + 1}: Searching the web...`);

        // Determine which queries to run this iteration
        const queriesThisRound =
          iteration === 0
            ? initialQueries
            : session.gaps
                .filter((g) => g.priority === 'high' || (g.priority === 'medium' && iteration < maxIterations - 1))
                .flatMap((g) => g.suggestedQueries.slice(0, 2));

        if (iteration > 0 && queriesThisRound.length === 0) {
          // No more gaps to fill; exit early
          break;
        }

        // Add any new queries to the list
        for (const q of queriesThisRound) {
          if (!session.searchQueries.includes(q)) {
            session.searchQueries.push(q);
          }
        }

        const allRawSources: Source[] = [];
        for (const q of queriesThisRound) {
          try {
            const results = await this.executeSearch(q, maxSourcesPerQuery);
            allRawSources.push(...results);
          } catch (error: unknown) {
            console.error('[DeepResearch] Search failed for:', q, error instanceof Error ? error.message : error);
          }
        }

        // Deduplicate and sort
        const newSources = deduplicateSources(allRawSources).sort(
          (a, b) => b.credibility - a.credibility
        );

        // Merge with existing sources
        for (const src of newSources) {
          if (!session.sources.find((s) => s.url.toLowerCase().replace(/\/+$/, '') === src.url.toLowerCase().replace(/\/+$/, ''))) {
            session.sources.push(src);
          }
        }

        // ── Phase 3: Read and extract content from top results ─
        session.status = 'extracting';
        this.updateSessionDb(session);
        onProgress?.('extracting', iteration + 1, `Iteration ${iteration + 1}: Reading top sources...`);

        const topSources = newSources.slice(0, 5);
        for (const source of topSources) {
          // Skip if already extracted
          if (session.findings.find((f) => f.url === source.url)) continue;

          try {
            const extracted = await extractContentFromUrl(source.url);
            if (extracted.content && extracted.content.length > 50) {
              session.findings.push({
                url: source.url,
                title: extracted.title || source.title,
                content: extracted.content.slice(0, 3000), // Cap content size
                snippet: source.snippet,
                credibility: source.credibility,
                sourceType: source.type,
                extractedAt: Date.now(),
                iteration: iteration + 1,
              });
            }
          } catch {
            // Continue with other sources on extraction failure
          }
        }

        // ── Phase 4: Identify gaps and generate follow-up queries ─
        if (iteration < maxIterations - 1) {
          session.status = 'gap_analysis';
          this.updateSessionDb(session);
          onProgress?.('gap_analysis', iteration + 1, `Iteration ${iteration + 1}: Analyzing knowledge gaps...`);

          const gaps = await this.identifyGaps(session.findings, session.query, model);
          session.gaps = gaps;

          if (gaps.length === 0) {
            // No gaps found — we have sufficient coverage
            break;
          }
        }
      }

      // Deduplicate findings
      session.findings = deduplicateFindings(session.findings);

      // ── Phase 6: Synthesize all findings ──────────────────
      session.status = 'synthesizing';
      this.updateSessionDb(session);
      onProgress?.('synthesizing', session.currentIteration, 'Synthesizing comprehensive report...');

      session.synthesis = await this.synthesize(session.findings, session.query, model);

      // ── Phase 7: Verify claims and flag contradictions ────
      if (verifyClaims) {
        session.status = 'verifying';
        this.updateSessionDb(session);
        onProgress?.('verifying', session.currentIteration, 'Verifying claims and detecting contradictions...');

        const verification = await this.verifyClaims(session.synthesis, session.sources);
        session.contradictions = verification.contradictions;
      }

      // Calculate confidence
      session.confidence = this.calculateDeepConfidence(session);

      // Extract citations from synthesis
      session.citations = this.extractCitationsFromText(session.synthesis, session.sources);

      // Persist citations to DB
      try {
        for (const cit of session.citations) {
          await db.citation.create({
            data: {
              researchId: sessionId,
              sourceUrl: cit.sourceUrl,
              sourceTitle: cit.sourceTitle,
              sourceType: cit.sourceType,
              snippet: cit.snippet,
              relevanceScore: cit.relevanceScore,
              credibility: cit.credibility,
            },
          });
        }
      } catch (dbError: unknown) {
        console.warn('[DeepResearch] Citation DB write failed:', dbError instanceof Error ? dbError.message : dbError);
      }

      // Mark as completed
      session.status = 'completed';
      session.completedAt = Date.now();
      this.updateSessionDb(session);
      onProgress?.('completed', session.currentIteration, 'Deep research completed!');
    } catch (error: unknown) {
      session.status = 'failed';
      session.error = error instanceof Error ? error.message : 'Unknown error';
      session.completedAt = Date.now();
      this.updateSessionDb(session);
      throw error;
    }
  }

  // ----------------------------------------------------------
  // Private: Identify knowledge gaps
  // ----------------------------------------------------------
  private async identifyGaps(
    findings: DeepResearchFinding[],
    query: string,
    model: string
  ): Promise<DeepResearchGap[]> {
    if (findings.length === 0) {
      return [
        {
          topic: 'No sources found',
          reason: 'Initial search returned no results; need alternative queries',
          suggestedQueries: [
            `${query} explained simply`,
            `${query} recent news`,
            `what is ${query}`,
          ],
          priority: 'high',
        },
      ];
    }

    const findingsSummary = findings
      .slice(0, 15)
      .map((f, i) => `[${i + 1}] ${f.title}: ${f.content.slice(0, 200)}`)
      .join('\n');

    const gapPrompt = `You are a research gap analyst. Given the research question and the current findings below, identify knowledge gaps — aspects that are NOT adequately covered.

RESEARCH QUESTION: "${query}"

CURRENT FINDINGS:
${findingsSummary}

For each gap, provide:
1. The topic/aspect that is missing
2. Why it matters for answering the question
3. 2-3 specific search queries that could fill this gap
4. Priority: "high" (critical for answer), "medium" (important context), "low" (nice-to-have)

Respond with ONLY a JSON array:
[
  {
    "topic": "the missing aspect",
    "reason": "why it matters",
    "suggestedQueries": ["query1", "query2"],
    "priority": "high"
  }
]

If the findings adequately cover the question, return [].`;

    try {
      const response = await callChatAPI(gapPrompt, model);
      const jsonMatch = response.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        if (Array.isArray(parsed)) {
          return parsed
            .filter(
              (item: unknown) =>
                typeof item === 'object' &&
                item !== null &&
                'topic' in item &&
                'suggestedQueries' in item
            )
            .map((item: Record<string, unknown>) => ({
              topic: String(item.topic),
              reason: String(item.reason || ''),
              suggestedQueries: Array.isArray(item.suggestedQueries)
                ? item.suggestedQueries.filter((q: unknown) => typeof q === 'string') as string[]
                : [],
              priority: (['high', 'medium', 'low'].includes(item.priority as string)
                ? item.priority
                : 'medium') as 'high' | 'medium' | 'low',
            }));
        }
      }
    } catch (error: unknown) {
      console.error('[DeepResearch] Gap analysis failed:', error instanceof Error ? error.message : error);
    }

    return [];
  }

  // ----------------------------------------------------------
  // Private: Calculate confidence for deep research
  // ----------------------------------------------------------
  private calculateDeepConfidence(session: DeepResearchSession): number {
    const { sources, findings, citations, contradictions } = session;

    if (sources.length === 0) return 0.05;

    // Factor 1: Source quality
    const avgCredibility = sources.reduce((sum, s) => sum + s.credibility, 0) / sources.length;

    // Factor 2: Source count (diminishing returns)
    const sourceCountFactor = Math.min(1, sources.length / 10);

    // Factor 3: Source diversity
    const uniqueTypes = new Set(sources.map((s) => s.type)).size;
    const diversityFactor = Math.min(1, uniqueTypes / 3);

    // Factor 4: Content depth (how many sources have extracted content)
    const contentDepthFactor = findings.length > 0
      ? Math.min(1, findings.length / 5)
      : 0.2;

    // Factor 5: Iteration coverage
    const iterationFactor = Math.min(1, session.currentIteration / session.maxIterations);

    // Factor 6: Contradiction penalty
    const majorContradictions = contradictions.filter((c) => c.severity === 'major').length;
    const contradictionPenalty = majorContradictions * 0.1;

    // Factor 7: Citation coverage
    const citationRatio = sources.length > 0 ? citations.length / sources.length : 0;
    const coverageFactor = Math.min(1, citationRatio * 1.5);

    const raw =
      avgCredibility * 0.2 +
      sourceCountFactor * 0.15 +
      diversityFactor * 0.1 +
      contentDepthFactor * 0.2 +
      iterationFactor * 0.1 +
      coverageFactor * 0.1 +
      0.15 -
      contradictionPenalty;

    return Math.max(0.05, Math.min(1, raw));
  }

  // ----------------------------------------------------------
  // Private: Extract citations from synthesis text
  // ----------------------------------------------------------
  private extractCitationsFromText(
    text: string,
    sources: Source[]
  ): CitationResult[] {
    const citations: CitationResult[] = [];
    const citationPattern = /\[(\d+)\]/g;
    let match: RegExpExecArray | null;
    const referencedIndices = new Set<number>();

    while ((match = citationPattern.exec(text)) !== null) {
      const idx = parseInt(match[1], 10) - 1;
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
        relevanceScore: Math.max(0.1, 1 - idx * 0.1),
        credibility: source.credibility,
      });
    }

    return citations;
  }

  // ----------------------------------------------------------
  // Private: Update session state in DB
  // ----------------------------------------------------------
  private updateSessionDb(session: DeepResearchSession): void {
    try {
      db.researchSession.update({
        where: { id: session.id },
        data: {
          status: session.status,
          sources: JSON.stringify(session.sources.slice(0, 50)),
          citations: JSON.stringify(session.citations.slice(0, 50)),
          findings: session.synthesis
            ? session.synthesis.slice(0, 10000)
            : session.findings.map((f) => `[${f.title}] ${f.snippet}`).join('\n'),
          confidence: session.confidence,
        },
      }).catch((dbError: unknown) => {
        console.warn('[DeepResearch] DB update failed:', dbError instanceof Error ? dbError.message : dbError);
      });
    } catch {
      // Silently ignore — in-memory session is the source of truth
    }
  }

  // ----------------------------------------------------------
  // Private: Build fallback synthesis when LLM is unavailable
  // ----------------------------------------------------------
  private buildFallbackSynthesis(query: string, findings: DeepResearchFinding[]): string {
    if (findings.length === 0) {
      return `## Deep Research: ${query}\n\nNo detailed content could be extracted from sources. The search may have failed or the topic may not have sufficient online coverage.\n\n*Note: AI synthesis was unavailable; this is a fallback summary.*`;
    }

    let synthesis = `## Deep Research: ${query}\n\n`;
    synthesis += `*Note: AI synthesis was unavailable; this is an auto-generated summary from extracted content.*\n\n`;
    synthesis += `### Key Findings\n\n`;

    findings.slice(0, 15).forEach((f, idx) => {
      synthesis += `[${idx + 1}] **${f.title}** — ${f.content.slice(0, 300)}...\n\n`;
    });

    synthesis += `\n### Summary\n\n`;
    synthesis += `Extracted content from ${findings.length} source(s) related to "${query}". `;
    synthesis += `The most credible sources are from `;
    synthesis += findings
      .sort((a, b) => b.credibility - a.credibility)
      .slice(0, 3)
      .map((f) => extractDomain(f.url))
      .join(', ');
    synthesis += `.\n\n`;

    return synthesis;
  }
}

// ============================================================
// Singleton via globalThis
// ============================================================

const globalForDeepResearch = globalThis as unknown as {
  deepResearchEngine: DeepResearchEngine | undefined;
};

export function getDeepResearchEngine(): DeepResearchEngine {
  if (!globalForDeepResearch.deepResearchEngine) {
    globalForDeepResearch.deepResearchEngine = new DeepResearchEngine();
  }
  return globalForDeepResearch.deepResearchEngine;
}

export { DeepResearchEngine };
