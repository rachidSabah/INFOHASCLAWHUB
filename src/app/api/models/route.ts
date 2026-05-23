import { db } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = 'force-dynamic';

const FALLBACK_MODELS: Record<string, { id: string; name: string; description: string }[]> = {
  bigmodel: [
    { id: "glm-4", name: "GLM-4", description: "Zhipu's flagship high-performance model" },
    { id: "glm-4-flash", name: "GLM-4 Flash", description: "Fast, lightweight and cost-effective" },
    { id: "glm-4-air", name: "GLM-4 Air", description: "Balanced performance and speed" },
  ],
  proxima: [
    { id: "claude-3-5-sonnet", name: "Claude 3.5 Sonnet (Proxima)", description: "Anthropic's state-of-the-art model via Proxima" },
    { id: "gpt-4o", name: "GPT-4o (Proxima)", description: "OpenAI's flagship model via Proxima" },
    { id: "gemini-1.5-pro", name: "Gemini 1.5 Pro (Proxima)", description: "Google's smart model via Proxima" },
  ],
  deepseek: [
    { id: "deepseek-chat", name: "DeepSeek Chat (V3)", description: "Highly capable conversational model" },
    { id: "deepseek-reasoner", name: "DeepSeek Reasoner (R1)", description: "Advanced reasoning and problem solving" },
    { id: "deepseek-coder", name: "DeepSeek Coder", description: "Advanced code generation and reasoning" },
  ],
  "deepseek-free-web": [
    { id: "deepseek-chat", name: "DeepSeek Chat (V3)", description: "Free DeepSeek V3 via web session token" },
    { id: "deepseek-reasoner", name: "DeepSeek Reasoner (R1)", description: "Free DeepSeek R1 via web session token" },
  ],
  "ds2api-web-to-api-bridge": [
    { id: "deepseek-chat", name: "DeepSeek Chat (V3 via Web)", description: "Free DeepSeek V3 via web session token" },
    { id: "deepseek-reasoner", name: "DeepSeek Reasoner (R1 via Web)", description: "Free DeepSeek R1 via web session token" },
  ],
  qwen: [
    { id: "qwen-plus", name: "Qwen Plus", description: "Alibaba's flagship model" },
    { id: "qwen-max", name: "Qwen Max", description: "Most capable Qwen model" },
    { id: "qwen-turbo", name: "Qwen Turbo", description: "Fast and efficient" },
  ],
  "qwen-free-web": [
    { id: "qwen-plus", name: "Qwen Plus (via Web)", description: "Free Qwen Plus via web session token" },
    { id: "qwen-max", name: "Qwen Max (via Web)", description: "Free Qwen Max via web session token" },
    { id: "qwen-turbo", name: "Qwen Turbo (via Web)", description: "Free Qwen Turbo via web session token" },
  ],
  "kimi-free-web": [
    { id: "moonshot-v1-8k", name: "Moonshot v1 8K (via Web)", description: "Free via web token" },
    { id: "moonshot-v1-32k", name: "Moonshot v1 32K (via Web)", description: "Extended via web token" },
  ],
  "z-ai-glm-free-web": [
    { id: "glm-4-flash", name: "GLM-4 Flash (via Web)", description: "Fast GLM via web token" },
    { id: "glm-4-air", name: "GLM-4 Air (via Web)", description: "Balanced GLM via web token" },
    { id: "glm-4-plus", name: "GLM-4 Plus (via Web)", description: "Powerful GLM via web token" },
  ],
  "qwen-qw2api": [
    { id: "qwen-plus", name: "Qwen Plus (via qw2api)", description: "Free Qwen Plus through web-to-API bridge" },
    { id: "qwen-max", name: "Qwen Max (via qw2api)", description: "Free Qwen Max through web-to-API bridge" },
    { id: "qwen-turbo", name: "Qwen Turbo (via qw2api)", description: "Free Qwen Turbo through web-to-API bridge" },
    { id: "qwen-coder", name: "Qwen Coder (via qw2api)", description: "Free Qwen Coder through web-to-API bridge" },
  ],
  "gemini-free-web": [
    { id: "gemini-2.0-flash", name: "Gemini 2.0 Flash (Free)", description: "Google's fast free tier model" },
    { id: "gemini-2.5-pro", name: "Gemini 2.5 Pro (Free)", description: "Google's most capable model" },
    { id: "gemini-2.5-flash", name: "Gemini 2.5 Flash (Free)", description: "Fast thinking with high quality" },
  ],
  "google-gemini": [
    { id: "gemini-2.5-pro", name: "Gemini 2.5 Pro", description: "Complex tasks, long context via API" },
    { id: "gemini-2.5-flash", name: "Gemini 2.5 Flash", description: "Fast and versatile via API" },
    { id: "gemini-2.0-flash", name: "Gemini 2.0 Flash", description: "Lightweight and fast via API" },
  ],
  "gemini": [
    { id: "gemini-2.5-pro", name: "Gemini 2.5 Pro", description: "Complex tasks, long context via API" },
    { id: "gemini-2.5-flash", name: "Gemini 2.5 Flash", description: "Fast and versatile via API" },
    { id: "gemini-2.0-flash", name: "Gemini 2.0 Flash", description: "Lightweight and fast via API" },
  ],
  "kimi-moonshot": [
    { id: "kimi-latest", name: "Kimi Latest (via web bridge)", description: "Free Kimi through web-to-API bridge" },
    { id: "moonshot-v1-8k", name: "Moonshot v1 8K (via web bridge)", description: "Standard context via web bridge" },
    { id: "moonshot-v1-32k", name: "Moonshot v1 32K (via web bridge)", description: "Extended context via web bridge" },
    { id: "moonshot-v1-128k", name: "Moonshot v1 128K (via web bridge)", description: "Ultra-long context via web bridge" },
  ],
  "z-ai-glm": [
    { id: "glm-4", name: "GLM-4 (via web bridge)", description: "Free GLM-4 through web-to-API bridge" },
    { id: "glm-4-flash", name: "GLM-4 Flash (via web bridge)", description: "Fast GLM via web bridge" },
    { id: "glm-4-air", name: "GLM-4 Air (via web bridge)", description: "Balanced GLM via web bridge" },
    { id: "glm-4-long", name: "GLM-4 Long (via web bridge)", description: "Extended GLM via web bridge" },
  ],
  openrouter: [
    { id: "google/gemini-2.0-flash-thinking-exp:free", name: "Gemini 2.0 Flash Thinking (Free)", description: "Google's reasoning model via OpenRouter" },
    { id: "deepseek/deepseek-chat", name: "DeepSeek V3", description: "DeepSeek Chat via OpenRouter" },
    { id: "meta-llama/llama-3.3-70b-instruct:free", name: "Llama 3.3 70B (Free)", description: "Meta's powerful open model via OpenRouter" },
  ],
  groq: [
    { id: "llama-3.3-70b-versatile", name: "Llama 3.3 70B Versatile", description: "Meta's extremely capable model on Groq" },
    { id: "mixtral-8x7b-32768", name: "Mixtral 8x7B", description: "High quality MoE model on Groq" },
  ],
  ollama: [
    { id: "llama3.1", name: "Llama 3.1", description: "Meta's latest open model via Ollama" },
    { id: "mistral", name: "Mistral", description: "Mistral 7B via Ollama" },
    { id: "codellama", name: "Code Llama", description: "Code-specialized Llama via Ollama" },
  ],
  "lm-studio": [
    { id: "default", name: "LM Studio Default", description: "Currently loaded model in LM Studio" },
  ],
};

/**
 * Fetch models from a provider's API with timeout and multiple endpoint support.
 */
async function fetchModelsFromProvider(
  provider: { name: string; baseUrl: string; apiKey: string },
  providerSlug: string
): Promise<{ id: string; name: string; description: string }[]> {
  const base = provider.baseUrl.replace(/\/$/, "");
  const models: { id: string; name: string; description: string }[] = [];
  const timeout = 8000; // 8 second timeout per request

  // Detect Google Gemini API — uses ?key= query param instead of Authorization header
  const isGeminiApi = base.includes("generativelanguage.googleapis.com");

  if (isGeminiApi) {
    // Google Gemini API: GET /v1beta/models?key=API_KEY
    try {
      const geminiUrl = `${base}/models?key=${provider.apiKey}`;
      const res = await fetch(geminiUrl, {
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        signal: AbortSignal.timeout(timeout),
      });

      if (res.ok) {
        const data = await res.json();
        if (data.models && Array.isArray(data.models)) {
          const filtered = data.models
            .filter((m: any) => {
              const methods: string[] = m.supportedGenerationMethods || [];
              return methods.includes("generateContent");
            })
            .map((m: any) => {
              const modelId = m.name?.replace("models/", "") || m.name || "";
              const displayName = m.displayName || modelId;
              return {
                id: `${providerSlug}/${modelId}`,
                name: displayName,
                description: m.description || `Gemini model — ${m.inputTokenLimit || "?"} input tokens`
              };
            });
          models.push(...filtered);
        }
      }
    } catch (err) {
      // Gemini API may be offline — fall through to fallback
      console.log(`[Models] Gemini API fetch failed for ${provider.name}: ${err instanceof Error ? err.message : 'unknown'}`);
    }
    return models;
  }

  // Detect Ollama — uses /api/tags endpoint, no auth
  const isOllama = base.includes("localhost:11434") || base.includes("127.0.0.1:11434") || base.includes(":11434");

  if (isOllama) {
    try {
      const ollamaUrl = `${base.replace(/\/v1$/, "")}/api/tags`;
      const res = await fetch(ollamaUrl, {
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        signal: AbortSignal.timeout(timeout),
      });

      if (res.ok) {
        const data = await res.json();
        if (data.models && Array.isArray(data.models)) {
          const ollamaModels = data.models.map((m: any) => {
            const modelId = m.name || m.model || "";
            const displayName = modelId.replace(":latest", "");
            const size = m.size ? `${(m.size / 1e9).toFixed(1)}GB` : "";
            return {
              id: `${providerSlug}/${modelId}`,
              name: displayName,
              description: `Ollama model${size ? ` — ${size}` : ""}${m.details?.family ? ` (${m.details.family})` : ""}`
            };
          });
          models.push(...ollamaModels);
        }
      }
    } catch (err) {
      console.log(`[Models] Ollama fetch failed: ${err instanceof Error ? err.message : 'unknown'}`);
    }
    // Also try the OpenAI-compatible endpoint
    if (models.length === 0) {
      try {
        const res = await fetch(`${base}/models`, {
          headers: { "Content-Type": "application/json" },
          cache: "no-store",
          signal: AbortSignal.timeout(timeout),
        });
        if (res.ok) {
          const data = await res.json();
          const fetchedModels = extractModelsFromResponse(data);
          for (const m of fetchedModels) {
            models.push({
              id: `${providerSlug}/${m.id}`,
              name: m.name,
              description: m.description || `Ollama model`
            });
          }
        }
      } catch {}
    }
    return models;
  }

  // Standard OpenAI-compatible endpoints — try multiple URL patterns
  const endpoints = [
    `${base}/models`,
    `${base}/v1/models`,
    // Handle providers where baseUrl includes /v1 already
    ...(base.endsWith("/v1") ? [] : [`${base}/v1/models`]),
    // Some providers use /api/v1
    `${base}/api/v1/models`,
  ];

  // Deduplicate endpoints
  const uniqueEndpoints = [...new Set(endpoints)];

  for (const url of uniqueEndpoints) {
    if (models.length > 0) break;

    try {
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };

      // Only add auth header if apiKey is not a placeholder
      if (provider.apiKey && provider.apiKey !== "none" && provider.apiKey !== "sk-xxx") {
        headers["Authorization"] = `Bearer ${provider.apiKey}`;
      }

      const res = await fetch(url, {
        headers,
        cache: "no-store",
        signal: AbortSignal.timeout(timeout),
      });

      if (res.ok) {
        const data = await res.json();
        const fetchedModels = extractModelsFromResponse(data);

        if (fetchedModels.length > 0) {
          for (const m of fetchedModels) {
            models.push({
              id: `${providerSlug}/${m.id}`,
              name: m.name || m.id,
              description: m.description || m.owned_by || `Model from ${provider.name}`
            });
          }
        }
      }
    } catch (err) {
      // Provider may be offline — skip silently
    }
  }

  return models;
}

/**
 * Extract models from various API response formats.
 */
function extractModelsFromResponse(data: any): { id: string; name: string; description: string; owned_by?: string }[] {
  let fetchedModels: any[] = [];

  if (data.data && Array.isArray(data.data)) {
    fetchedModels = data.data;
  } else if (Array.isArray(data)) {
    fetchedModels = data;
  } else if (data.models && Array.isArray(data.models)) {
    // Some providers (like Ollama OpenAI compat) use data.models
    fetchedModels = data.models;
  }

  return fetchedModels.map((m: any) => {
    if (typeof m === 'string') {
      return { id: m, name: m, description: '' };
    }
    return {
      id: m.id || m.name || m.model || '',
      name: m.name || m.id || m.model || '',
      description: m.description || '',
      owned_by: m.owned_by,
    };
  }).filter(m => m.id.length > 0);
}

export async function GET() {
  try {
    const providers = await db.provider.findMany({
      where: { isActive: true },
    });

    const results: any[] = [];

    // Fetch models from all providers in parallel for faster response
    const fetchPromises = providers.map(async (provider) => {
      const providerSlug = provider.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");

      let models: { id: string; name: string; description: string }[] = [];

      // Only attempt live fetch if baseUrl is configured
      if (provider.baseUrl) {
        models = await fetchModelsFromProvider(
          { name: provider.name, baseUrl: provider.baseUrl, apiKey: provider.apiKey || "none" },
          providerSlug
        );
      }

      // If live fetch failed, is offline, or was skipped, use fallback models
      if (models.length === 0) {
        const fallbacks = FALLBACK_MODELS[providerSlug];
        if (fallbacks) {
          models = fallbacks.map(m => ({
            id: `${providerSlug}/${m.id}`,
            name: m.name,
            description: m.description
          }));
        }
      }

      // Deduplicate models by ID
      const seenIds = new Set<string>();
      models = models.filter(m => {
        if (seenIds.has(m.id)) return false;
        seenIds.add(m.id);
        return true;
      });

      return models.length > 0 ? {
        name: provider.name,
        models: models
      } : null;
    });

    const fetchResults = await Promise.all(fetchPromises);

    for (const result of fetchResults) {
      if (result) {
        results.push(result);
      }
    }

    return NextResponse.json(results);
  } catch (error: unknown) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unknown error' }, { status: 500 });
  }
}
