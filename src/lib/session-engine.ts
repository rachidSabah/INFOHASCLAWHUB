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

  private modelAliases: Map<string, string> = new Map(); // alias → canonical
  private sessionCache = new Map<string, { token: string; expires: number }>();

  async launchProvider(providerName: string): Promise<{ token?: string; models: DiscoveredModel[]; error?: string }> {
    const provider = PROVIDERS.find(p => p.name === providerName);
    if (!provider) return { models: [], error: `Unknown provider: ${providerName}` };

    // Check cache first
    const cached = this.sessionCache.get(providerName);
    if (cached && cached.expires > Date.now()) {
      const models = this.getDiscoveredModels(providerName);
      return { token: cached.token, models };
    }

    try {
      console.log(`[SessionEngine] Launching ${provider.name} via CDP...`);
      
      // Connect to existing Chrome via CDP instead of launching new browser
      let browser: any;
      try {
        browser = await chromium.connectOverCDP("http://localhost:9222");
        console.log("[SessionEngine] Connected to existing Chrome via CDP");
      } catch {
        // Try to launch Chrome with debugging port
        const { execSync } = await import("child_process");
        const chromePaths = [
          "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
          "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
          `${process.env.LOCALAPPDATA}\\Google\\Chrome\\Application\\chrome.exe`,
        ];
        for (const cp of chromePaths) {
          try {
            execSync(`start "" "${cp}" --remote-debugging-port=9222`, { timeout: 3000, windowsHide: true });
            console.log(`[SessionEngine] Launched Chrome at ${cp}`);
            break;
          } catch {}
        }
        await new Promise(r => setTimeout(r, 2000));
        try {
          browser = await chromium.connectOverCDP("http://localhost:9222");
          console.log("[SessionEngine] Connected to auto-launched Chrome");
        } catch {
          browser = await chromium.launchPersistentContext(CHROME_PROFILE, {
            headless: false, channel: "chrome",
            args: ["--remote-debugging-port=9222", "--disable-blink-features=AutomationControlled"],
          });
        }
      }

      const context = browser.contexts ? browser.contexts()[0] : browser;
      const page = context.pages ? await context.newPage() : await browser.newPage();
      this.contexts.set(provider.name, { context, page });

      // Websocket auth interception
      page.on("websocket", (ws) => {
        const url = ws.url();
        if (url.includes(provider.apiPath)) {
          console.log(`[SessionEngine] WS auth for ${provider.name}: ${url.slice(0, 100)}`);
        }
      });

      // Live request interception
      page.on("request", async (request) => {
        const url = request.url();
        const headers = await request.allHeaders();

        if (url.includes(provider.apiPath) || url.includes("chat/completions") || url.includes("generate") || url.includes("paas/v4")) {
          const auth = headers["authorization"] || headers["Authorization"] || "";

          // Capture Bearer token
          if (auth && auth.startsWith("Bearer ")) {
            const token = auth.replace("Bearer ", "");
            if (token.length > 20) {
              this.tokens.push({ token, model: "", timestamp: Date.now(), headers });
              // Cache with 50-minute expiry
              this.sessionCache.set(provider.name, { token, expires: Date.now() + 50 * 60 * 1000 });
              console.log(`[SessionEngine] ${provider.name} token captured: ${token.slice(0, 30)}...`);
            }
          }

          // Capture CSRF tokens
          const csrf = headers["x-csrf-token"] || headers["x-csrftoken"] || headers["csrf-token"];
          if (csrf) {
            this.tokens.push({ token: csrf, model: "csrf", timestamp: Date.now(), headers });
          }

          // Auto-refresh: re-intercept when token changes
          const responseHandler = async (response: any) => {
            try {
              const respHeaders = response?.headers() || {};
              const newAuth = respHeaders["authorization"] || respHeaders["set-authorization"] || "";
              if (newAuth && newAuth.startsWith("Bearer ")) {
                const newToken = newAuth.replace("Bearer ", "");
                if (newToken !== this.sessionCache.get(provider.name)?.token) {
                  this.sessionCache.set(provider.name, { token: newToken, expires: Date.now() + 50 * 60 * 1000 });
                  console.log(`[SessionEngine] ${provider.name} token refreshed`);
                }
              }
            } catch {}
          };
          request.response()?.then(responseHandler).catch(() => {});
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

  normalizeModel(model: string, providerName: string): string {
    // Canonical aliases from discovered models
    if (this.modelAliases.has(model)) return this.modelAliases.get(model)!;

    // Auto-learn aliases from discovered models
    const discovered = this.discoveredModels.find(m => 
      m.provider === providerName && (m.id === model || m.name === model)
    );
    if (discovered) {
      this.modelAliases.set(model, discovered.id);
      return discovered.id;
    }

    return model;
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
