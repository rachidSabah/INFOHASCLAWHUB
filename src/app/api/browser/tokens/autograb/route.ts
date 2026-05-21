import { NextRequest, NextResponse } from "next/server";

/**
 * POST /api/browser/tokens/autograb
 * Launches Playwright browser, navigates to the provider's login page,
 * waits for the user to log in, then automatically extracts the Bearer token
 * from localStorage, cookies, or network requests.
 *
 * This is the FULLY AUTOMATIC method — no F12 needed!
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { provider, headless } = body as {
      provider: string;
      headless?: boolean;
    };

    if (!provider) {
      return NextResponse.json(
        { ok: false, error: "Provider name required" },
        { status: 400 }
      );
    }

    // Provider config: login URL, localStorage keys, cookie names, domain patterns
    const PROVIDER_CONFIG: Record<string, {
      loginUrl: string;
      localStorageKeys: string[];
      cookieNames: string[];
      domainPattern: string;
      waitForSelector?: string;
      networkUrlPattern?: string;
    }> = {
      deepseek: {
        loginUrl: "https://chat.deepseek.com",
        localStorageKeys: ["userToken", "token", "authToken", "access_token"],
        cookieNames: ["token", "auth_token", "user_token"],
        domainPattern: "deepseek.com",
        waitForSelector: "textarea, [contenteditable], .chat-input",
        networkUrlPattern: "/api/chat",
      },
      qwen: {
        loginUrl: "https://chat.qwen.ai",
        localStorageKeys: ["token", "authToken", "access_token", "userToken"],
        cookieNames: ["token", "auth_token"],
        domainPattern: "qwen.ai",
        waitForSelector: "textarea, [contenteditable]",
        networkUrlPattern: "/api/chat",
      },
      gemini: {
        loginUrl: "https://aistudio.google.com/apikey",
        localStorageKeys: [],
        cookieNames: [],
        domainPattern: "google.com",
        waitForSelector: "input, textarea",
      },
      kimi: {
        loginUrl: "https://kimi.moonshot.cn",
        localStorageKeys: ["token", "authToken", "access_token", "userToken", "Bearer"],
        cookieNames: ["token", "access_token"],
        domainPattern: "moonshot.cn",
        waitForSelector: "textarea, [contenteditable]",
        networkUrlPattern: "/api/chat",
      },
      "z-ai": {
        loginUrl: "https://chat.z.ai",
        localStorageKeys: ["authToken", "token", "access_token", "userToken"],
        cookieNames: ["token", "auth_token"],
        domainPattern: "z.ai",
        waitForSelector: "textarea, [contenteditable]",
        networkUrlPattern: "/api/chat",
      },
    };

    const config = PROVIDER_CONFIG[provider];
    if (!config) {
      return NextResponse.json(
        { ok: false, error: `Unknown provider: ${provider}` },
        { status: 400 }
      );
    }

    // Try to use Playwright
    let chromium: any;
    try {
      const pw = await import("playwright");
      chromium = pw.chromium;
    } catch {
      return NextResponse.json({
        ok: false,
        error: "Playwright not available. Install browsers: npx playwright install chromium",
        hint: "Use the Bookmarklet method instead — it works without Playwright.",
      }, { status: 500 });
    }

    // Check if Chromium browser is installed
    const { execSync } = await import("child_process");
    try {
      execSync("npx playwright install --dry-run chromium 2>/dev/null", {
        timeout: 5000,
        encoding: "utf-8",
      });
    } catch {
      // May not be installed, try to install
    }

    const tokens: Array<{
      source: string;
      key: string;
      value: string;
    }> = [];

    // Launch browser
    const browser = await chromium.launch({
      headless: headless !== false, // default true
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-gpu",
        "--single-process",
      ],
    });

    try {
      const context = await browser.newContext({
        viewport: { width: 1280, height: 800 },
        userAgent:
          "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      });

      // Intercept network requests to capture Bearer tokens
      const capturedBearerTokens: string[] = [];
      context.on("request", (request: any) => {
        const url = request.url();
        const authHeader = request.headers()["authorization"] || request.headers()["Authorization"];
        if (authHeader && authHeader.startsWith("Bearer ")) {
          const token = authHeader.replace("Bearer ", "").trim();
          if (token.length > 20 && !capturedBearerTokens.includes(token)) {
            capturedBearerTokens.push(token);
          }
        }
        // Also check for custom headers some providers use
        const xToken = request.headers()["x-token"] || request.headers()["x-access-token"];
        if (xToken && xToken.length > 20 && !capturedBearerTokens.includes(xToken)) {
          capturedBearerTokens.push(xToken);
        }
      });

      const page = await context.newPage();

      // Navigate to the login page
      await page.goto(config.loginUrl, {
        waitUntil: "domcontentloaded",
        timeout: 30000,
      });

      if (!headless) {
        // In headed mode, wait longer for the user to log in
        // Wait up to 120 seconds for the chat interface to appear
        try {
          if (config.waitForSelector) {
            await page.waitForSelector(config.waitForSelector, {
              timeout: 120000,
            });
          } else {
            // Wait for page to be fully interactive
            await page.waitForLoadState("networkidle", { timeout: 120000 });
          }
        } catch {
          // User might not have logged in, try to extract what we can
        }
      } else {
        // In headless mode, wait a short time for existing session
        try {
          await page.waitForTimeout(3000);
        } catch {}
      }

      // Extract tokens from localStorage
      const lsTokens = await page.evaluate((keys: string[]) => {
        const results: Array<{ source: string; key: string; value: string }> = [];
        for (const k of keys) {
          try {
            const v = localStorage.getItem(k);
            if (v && v.length > 20) {
              results.push({ source: "localStorage", key: k, value: v });
            }
          } catch {}
        }
        // Also scan ALL localStorage keys for JWT-like patterns
        for (let i = 0; i < localStorage.length; i++) {
          const k = localStorage.key(i);
          if (k) {
            try {
              const v = localStorage.getItem(k);
              if (v && v.length > 50 && /^eyJ[a-zA-Z0-9]/.test(v) && !results.some((r) => r.key === k)) {
                results.push({ source: "localStorage-scan", key: k, value: v });
              }
            } catch {}
          }
        }
        return results;
      }, config.localStorageKeys);

      tokens.push(...lsTokens);

      // Extract tokens from cookies
      const cookies = await context.cookies();
      for (const cookie of cookies) {
        if (
          cookie.name.toLowerCase().includes("token") &&
          cookie.value.length > 20
        ) {
          tokens.push({
            source: "cookie",
            key: cookie.name,
            value: cookie.value,
          });
        }
        // Also check for JWT pattern in cookie values
        if (
          cookie.value.length > 50 &&
          /^eyJ[a-zA-Z0-9]/.test(cookie.value) &&
          !tokens.some((t) => t.value === cookie.value)
        ) {
          tokens.push({
            source: "cookie-jwt",
            key: cookie.name,
            value: cookie.value,
          });
        }
      }

      // Add captured Bearer tokens from network requests
      for (const bearerToken of capturedBearerTokens) {
        if (!tokens.some((t) => t.value === bearerToken)) {
          tokens.push({
            source: "network-intercept",
            key: "Authorization: Bearer",
            value: bearerToken,
          });
        }
      }

      await browser.close();

      if (tokens.length === 0) {
        return NextResponse.json({
          ok: true,
          provider,
          tokens: [],
          message: headless
            ? "No tokens found in headless mode. This usually means you need to log in first. Try with headless=false to open a visible browser window where you can log in, or use the Bookmarklet method."
            : "No tokens found. Make sure you're logged into the provider before the timeout.",
          hint: "Use the Bookmarklet method for the easiest experience — just click a bookmark in your browser!",
        });
      }

      // Save tokens to submitted-tokens
      const { writeFileSync, mkdirSync, existsSync, readFileSync } = await import("fs");
      const { join } = await import("path");
      const tokensDir = join(process.cwd(), ".submitted-tokens");
      if (!existsSync(tokensDir)) {
        mkdirSync(tokensDir, { recursive: true });
      }
      const tokenFile = join(tokensDir, `${provider}.json`);

      let existing: any[] = [];
      try {
        if (existsSync(tokenFile)) {
          existing = JSON.parse(readFileSync(tokenFile, "utf-8"));
        }
      } catch {}

      for (const t of tokens) {
        if (!existing.some((e: any) => e.token === t.value)) {
          existing.push({
            token: t.value,
            provider,
            source: `playwright-${t.source}`,
            browser: "playwright-chromium",
            key: t.key,
            timestamp: new Date().toISOString(),
          });
        }
      }
      writeFileSync(tokenFile, JSON.stringify(existing.slice(-10), null, 2));

      return NextResponse.json({
        ok: true,
        provider,
        tokens: tokens.map((t) => ({
          source: t.source,
          key: t.key,
          value: t.value,
          valuePreview: t.value.slice(0, 30) + "...",
        })),
        count: tokens.length,
        message: `${tokens.length} token(s) extracted automatically via Playwright!`,
      });
    } catch (pwError: unknown) {
      try { await browser.close(); } catch {}
      throw pwError;
    }
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json(
      {
        ok: false,
        error: `Auto-grab failed: ${msg.slice(0, 200)}`,
        hint: "Use the Bookmarklet method instead — it's more reliable and doesn't require Playwright.",
      },
      { status: 500 }
    );
  }
}
