import { chromium, BrowserContext, Page } from "playwright";
import { db } from "@/lib/db";
import path from "path";
import os from "os";

interface ProviderConfig { name: string; url: string; apiPath: string; cookieDomain: string; }
interface CapturedToken { token: string; model: string; timestamp: number; headers: Record<string, string>; }
interface DiscoveredModel { id: string; name: string; provider: string; }

const PROVIDERS: ProviderConfig[] = [
  { name: "deepseek", url: "https://chat.deepseek.com", apiPath: "deepseek.com/api", cookieDomain: "chat.deepseek.com" },
  { name: "kimi", url: "https://kimi.moonshot.cn", apiPath: "moonshot.cn/api", cookieDomain: "kimi.moonshot.cn" },
  { name: "z-ai", url: "https://chat.z.ai", apiPath: "bigmodel.cn/api", cookieDomain: "chat.z.ai" },
  { name: "qwen", url: "https://chat.qwen.ai", apiPath: "dashscope.aliyuncs.com", cookieDomain: "chat.qwen.ai" },
];

const CHROME_PROFILE = path.join(os.homedir(), "AppData", "Local", "Google", "Chrome", "User Data");

class SessionEngine {
  private contexts: Map<string, { context: BrowserContext; page: Page }> = new Map();
  private tokens: CapturedToken[] = [];
  private discoveredModels: DiscoveredModel[] = [];

  async launchProvider(providerName: string): Promise<{ token?: string; models: DiscoveredModel[]; error?: string }> {
    const provider = PROVIDERS.find(p => p.name === providerName);
    if (!provider) return { models: [], error: `Unknown provider: ${providerName}` };

    try {
      console.log(`[SessionEngine] Launching ${provider.name}...`);
      const browser = await chromium.launchPersistentContext(CHROME_PROFILE, {
        headless: false,
        channel: "chrome",
        args: ["--disable-blink-features=AutomationControlled"],
      });

      const page = await browser.newPage();
      this.contexts.set(provider.name, { context: browser, page });

      // Intercept API requests to capture tokens and models
      page.on("request", async (request) => {
        const url = request.url();
        const headers = await request.allHeaders();

        if (url.includes(provider.apiPath) || url.includes("chat/completions") || url.includes("generate")) {
          const auth = headers["authorization"] || headers["Authorization"] || "";
          if (auth && auth.startsWith("Bearer ")) {
            const token = auth.replace("Bearer ", "");
            const existingModels = JSON.parse(request.postData() || "{}")?.model;
            if (token && token.length > 50) {
              this.tokens.push({
                token,
                model: existingModels || "unknown",
                timestamp: Date.now(),
                headers,
              });
              console.log(`[SessionEngine] Captured token for ${provider.name}: ${token.slice(0, 30)}...`);
            }
          }
        }

        // Discover models from API responses
        if (url.includes("/models") || url.includes("chat/completions")) {
          request.response().then(async (response) => {
            try {
              const body = await response?.text();
              if (body && body.includes("model")) {
                const data = JSON.parse(body);
                const models = data.data || data.models || [];
                for (const m of models) {
                  const modelId = typeof m === "string" ? m : m.id || m.name;
                  if (modelId && !this.discoveredModels.find(d => d.id === modelId)) {
                    this.discoveredModels.push({
                      id: modelId,
                      name: typeof m === "string" ? modelId : (m.name || modelId),
                      provider: provider.name,
                    });
                  }
                }
              }
            } catch {}
          }).catch(() => {});
        }
      });

      // Navigate to provider
      await page.goto(provider.url, { waitUntil: "domcontentloaded", timeout: 30000 });
      console.log(`[SessionEngine] ${provider.name} page loaded. Waiting for user login...`);

      // Wait for token to be captured (up to 60 seconds)
      for (let i = 0; i < 30; i++) {
        await new Promise(r => setTimeout(r, 2000));
        const captured = this.tokens.find(t => t.timestamp > Date.now() - 65000);
        if (captured) {
          const providerModels = this.discoveredModels.filter(m => m.provider === provider.name);
          console.log(`[SessionEngine] ${provider.name} token captured. Models: ${providerModels.length}`);
          return { token: captured.token, models: providerModels };
        }
        console.log(`[SessionEngine] Waiting for ${provider.name} request... (${(i + 1) * 2}s)`);
      }

      return { models: [], error: "No API requests intercepted. Try sending a message in the browser." };
    } catch (e: any) {
      console.error(`[SessionEngine] ${provider.name} error:`, e.message);
      return { models: [], error: e.message };
    }
  }

  async closeProvider(providerName: string) {
    const ctx = this.contexts.get(providerName);
    if (ctx) {
      try { await ctx.context.close(); } catch {}
      this.contexts.delete(providerName);
    }
  }

  getCapturedToken(providerName: string): CapturedToken | undefined {
    return this.tokens.reverse().find(t => t.timestamp > Date.now() - 300000);
  }

  getDiscoveredModels(providerName: string): DiscoveredModel[] {
    return this.discoveredModels.filter(m => m.provider === providerName);
  }

  async saveProviderConfig(providerName: string, baseUrl: string) {
    const token = this.getCapturedToken(providerName);
    if (!token) throw new Error("No token captured");

    const nameMap: Record<string, string> = {
      deepseek: "DeepSeek (Playwright)", kimi: "Kimi (Playwright)",
      "z-ai": "Z.AI/GLM (Playwright)", qwen: "Qwen (Playwright)",
    };

    await (db as any).provider.upsert({
      where: { name: nameMap[providerName] || providerName },
      update: { baseUrl, apiKey: token.token, isActive: true },
      create: { name: nameMap[providerName] || providerName, baseUrl, apiKey: token.token, isActive: true },
    });

    // Create model routes for discovered models
    const models = this.getDiscoveredModels(providerName);
    for (const m of models) {
      try {
        await (db as any).modelRoute.create({
          data: {
            name: m.name, taskType: "chat", model: m.id,
            priority: 1, fallbackChain: "[]",
          },
        });
      } catch {}
    }
  }
}

export const sessionEngine = new SessionEngine();
