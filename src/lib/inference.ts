// Low-latency multi-provider inference with speculative execution + smart routing

interface ProviderStats {
  name: string; avgLatency: number; tokensPerSec: number; successRate: number;
  lastUsed: number; queueDepth: number; score: number;
}

const providerStats: Map<string, ProviderStats> = new Map();
const latencyHistory: { provider: string; latency: number }[] = [];

export function recordLatency(provider: string, latencyMs: number) {
  latencyHistory.push({ provider, latency: latencyMs });
  if (latencyHistory.length > 1000) latencyHistory.shift();
  
  const stats = providerStats.get(provider) || {
    name: provider, avgLatency: 0, tokensPerSec: 0, successRate: 1,
    lastUsed: Date.now(), queueDepth: 0, score: 0,
  };
  stats.avgLatency = (stats.avgLatency * 0.7) + (latencyMs * 0.3);
  stats.lastUsed = Date.now();
  stats.score = calculateScore(stats);
  providerStats.set(provider, stats);
}

export function recordSuccess(provider: string) {
  const s = providerStats.get(provider);
  if (s) { s.successRate = Math.min(1, s.successRate + 0.01); s.score = calculateScore(s); }
}

export function recordFailure(provider: string) {
  const s = providerStats.get(provider);
  if (s) { s.successRate = Math.max(0.1, s.successRate - 0.05); s.score = calculateScore(s); }
}

function calculateScore(s: ProviderStats): number {
  const latencyWeight = Math.max(0, 1000 - s.avgLatency) / 10;
  const healthWeight = s.successRate * 50;
  const freshnessWeight = (Date.now() - s.lastUsed < 60000) ? 20 : 0;
  return latencyWeight + healthWeight + freshnessWeight;
}

export function getBestProvider(providers: string[]): string {
  let best = providers[0];
  let bestScore = 0;
  for (const p of providers) {
    const s = providerStats.get(p);
    const score = s?.score || 50;
    if (score > bestScore) { bestScore = score; best = p; }
  }
  return best;
}

export function getLatencyStats() {
  const recent = latencyHistory.slice(-100);
  if (recent.length === 0) return { avg: 0, min: 0, max: 0 };
  const latencies = recent.map(l => l.latency);
  return {
    avg: Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length),
    min: Math.min(...latencies),
    max: Math.max(...latencies),
  };
}

export function getProviderScoreboard() {
  const result: { name: string; score: number; avgLatency: number; successRate: number }[] = [];
  for (const [name, stats] of providerStats) {
    result.push({ name, score: Math.round(stats.score), avgLatency: Math.round(stats.avgLatency), successRate: Math.round(stats.successRate * 100) });
  }
  return result.sort((a, b) => b.score - a.score);
}

export async function speculativeStream(
  prompt: string,
  providers: { name: string; baseUrl: string; apiKey: string; model: string }[],
  onToken: (token: string, provider: string) => void,
  signal?: AbortSignal
): Promise<{ content: string; provider: string; latencyMs: number }> {
  const startTime = Date.now();
  const controllers: AbortController[] = [];
  
  const promises = providers.map(async (p) => {
    const controller = new AbortController();
    controllers.push(controller);
    const mergedSignal = signal ? anySignal([signal, controller.signal]) : controller.signal;
    
    try {
      const url = p.baseUrl.endsWith("/v1") ? `${p.baseUrl}/chat/completions` : `${p.baseUrl}/v1/chat/completions`;
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${p.apiKey}` },
        body: JSON.stringify({ model: p.model, messages: [{ role: "user", content: prompt }], stream: true, temperature: 0.7, max_tokens: 4096 }),
        signal: mergedSignal,
      });

      if (!res.ok) throw new Error(`${res.status}`);

      const reader = res.body?.getReader();
      if (!reader) throw new Error("No reader");

      const decoder = new TextDecoder();
      let fullText = "";
      let firstToken = true;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split("\n");
        for (const line of lines) {
          if (line.startsWith("data: ") && line !== "data: [DONE]") {
            try {
              const data = JSON.parse(line.slice(6));
              const token = data.choices?.[0]?.delta?.content || "";
              if (token) {
                if (firstToken) {
                  firstToken = false;
                  // Cancel other providers
                  for (const c of controllers) {
                    if (c !== controller) c.abort();
                  }
                  recordLatency(p.name, Date.now() - startTime);
                }
                fullText += token;
                onToken(token, p.name);
              }
            } catch {}
          }
        }
      }
      return { content: fullText, provider: p.name, latencyMs: Date.now() - startTime };
    } catch {
      recordFailure(p.name);
      return null;
    }
  });

  const results = await Promise.all(promises);
  const winner = results.find(r => r !== null);
  if (winner) return winner;
  throw new Error("All providers failed");
}

function anySignal(signals: AbortSignal[]): AbortSignal {
  const controller = new AbortController();
  for (const signal of signals) {
    if (signal.aborted) { controller.abort(); return controller.signal; }
    signal.addEventListener("abort", () => controller.abort(), { once: true });
  }
  return controller.signal;
}

export { providerStats };
