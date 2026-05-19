import fs from "fs";
import path from "path";
import { spawn } from "child_process";

let makeWASocket: any;
let useMultiFileAuthState: any;
let DisconnectReason: any;
let jidDecode: ((jid: string | undefined) => { user: string; server: string; device?: number; domainType?: number } | undefined) | null = null;
let jidEncode: ((user: string | number | null, server: any, device?: number, agent?: number) => string) | null = null;

let serviceInitialized = false;

/**
 * Normalize a JID to ensure it has the proper WhatsApp format.
 * If the JID doesn't contain '@', append '@s.whatsapp.net'.
 * Also handles phone numbers without the JID suffix.
 */
function normalizeJid(rawJid: string): string {
  if (!rawJid || typeof rawJid !== 'string') {
    throw new Error('Invalid JID: JID must be a non-empty string');
  }

  const trimmed = rawJid.trim();
  if (!trimmed) {
    throw new Error('Invalid JID: JID cannot be empty or whitespace');
  }

  // If already contains @, validate it has proper format
  if (trimmed.includes('@')) {
    const parts = trimmed.split('@');
    if (parts.length !== 2 || !parts[0] || !parts[1]) {
      throw new Error(`Invalid JID format: "${trimmed}". Expected format: user@server (e.g., 1234567890@s.whatsapp.net)`);
    }
    // Try to decode using Baileys jidDecode for validation
    if (jidDecode) {
      const decoded = jidDecode(trimmed);
      if (!decoded || !decoded.user) {
        throw new Error(`Invalid JID: "${trimmed}" could not be decoded. Ensure it follows the format user@server`);
      }
    }
    return trimmed;
  }

  // No @ sign - treat as a phone number and append @s.whatsapp.net
  const phoneRegex = /^\d{5,15}$/;
  if (!phoneRegex.test(trimmed)) {
    throw new Error(`Invalid phone number: "${trimmed}". Phone numbers should contain 5-15 digits only. For group JIDs use format: groupId@g.us`);
  }

  return `${trimmed}@s.whatsapp.net`;
}

function generateQRDataURL(text: string): string {
  return text; // Return raw text, frontend will generate the QR
}

async function loadBaileysModules() {
  if (!serviceInitialized) {
    const baileys = await import("@whiskeysockets/baileys");
    makeWASocket = baileys.makeWASocket;
    useMultiFileAuthState = baileys.useMultiFileAuthState;
    DisconnectReason = baileys.DisconnectReason;
    // Also load jid utilities for validation
    try {
      const jidUtils = await import("@whiskeysockets/baileys/lib/WABinary/jid-utils.js");
      jidDecode = jidUtils.jidDecode;
      jidEncode = jidUtils.jidEncode;
    } catch {
      console.warn('[WhatsApp] jid-utils not available, using basic JID validation');
    }
    serviceInitialized = true;
  }
}

const MESSAGE_CALLBACKS: Array<(msg: { from: string; text: string; timestamp: number }) => void> = [];

/**
 * Check if a Baileys disconnect status code is non-retryable.
 * Based on insights from openclaw/openclaw#75773:
 * - 440 (session conflict) is non-retryable — requires operator resolution
 * - 428 (connectionClosed) is TRANSIENT and MUST stay on the retry path
 * - 401 (loggedOut) requires re-authentication (delete auth + fresh QR)
 * Only 440 should permanently stop reconnects.
 */
function isNonRetryableDisconnect(statusCode: number | undefined): boolean {
  return statusCode === 440; // Session conflict — only this is truly non-retryable
}

class WhatsAppService {
  private sock: any = null;
  private state: { connected: boolean; qr?: string } = { connected: false };
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 10;
  private reconnectBaseDelay = 3000; // Reduced from 5s for faster recovery
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private connecting = false;
  private activeQR: string | undefined;
  private qrResolve: ((qr: string) => void) | null = null;
  private botEnabled = true; // Auto-enabled on connect so bot replies immediately
  // Auto-load bot state from global
  constructor() {
    if (typeof globalThis !== "undefined") {
      const saved = (globalThis as any).__whatsapp_bot_enabled;
      if (typeof saved === "boolean") this.botEnabled = saved;
    }
  }
  private userContexts = new Map<string, { role: string; content: string }[]>();
  private botModel = "gemini-2.5-flash";
  private botSystemPrompt = "You are a helpful WhatsApp AI assistant. Keep responses concise and friendly. You can help with questions, tasks, and general conversation. Respond in the same language the user writes in.";
  private connectedNumber: string | null = null; // The WhatsApp number that's connected
  private authFolderPath = ".baileys_auth";
  private zaiInstance: any = null; // Cached z-ai-web-dev-sdk instance

  connect(): Promise<string> {
    return new Promise<string>(async (resolve, reject) => {
      if (this.sock) {
        // Already connected — if we have a QR, return it; otherwise return empty
        resolve(this.activeQR || "");
        return;
      }
      if (this.connecting) {
        // Wait for existing connection to produce QR
        this.qrResolve = resolve;
        return;
      }

      this.connecting = true;
      this.reconnectAttempts = 0;

      try {
        await loadBaileysModules();

        const { state, saveCreds } = await useMultiFileAuthState(this.authFolderPath);

        this.sock = makeWASocket({
          auth: state,
          printQRInTerminal: false,
        });

        this.qrResolve = resolve;

        this.sock.ev.on("connection.update", async (update: any) => {
          const { connection, qr, lastDisconnect } = update;

          if (qr) {
            try {
              const qrDataUrl = generateQRDataURL(qr);
              this.activeQR = qrDataUrl;
              this.state = { connected: false, qr: qrDataUrl };
              this.connecting = false;
              this.emit("whatsapp_status", this.state);
              if (this.qrResolve) {
                this.qrResolve(qrDataUrl);
                this.qrResolve = null;
              }
            } catch (e) {
              console.error("[WhatsApp] QR generation failed:", e);
            }
          }

          if (connection === "open") {
            this.state = { connected: true };
            this.reconnectAttempts = 0;
            this.connecting = false;
            this.activeQR = undefined;
            this.qrResolve?.("");
            this.qrResolve = null;

            // Auto-enable bot on connect so auto-reply works immediately
            this.botEnabled = true;
            console.log('[WhatsApp] Connected! Bot auto-reply is ENABLED. Messages will receive AI responses.');

            // Try to get the connected phone number
            try {
              const meId = this.sock?.user?.id;
              if (meId) {
                this.connectedNumber = meId.split('@')[0] || meId;
                console.log(`[WhatsApp] Connected as: ${this.connectedNumber}`);
              }
            } catch {}

            this.emit("whatsapp_status", this.state);
          }

          if (connection === "close") {
            const disconnectCode = lastDisconnect?.error?.output?.statusCode;
            const disconnectReason = lastDisconnect?.error?.output?.payload?.message || "unknown";

            console.log(`[WhatsApp] Connection closed. Status: ${disconnectCode}, Reason: ${disconnectReason}`);

            this.sock = null;
            this.state = { connected: false };
            this.connecting = false;
            this.qrResolve?.("");
            this.qrResolve = null;
            this.emit("whatsapp_status", this.state);

            // 401 = logged out → must delete auth and get fresh QR
            const loggedOutCode = DisconnectReason?.loggedOut ?? 401;
            if (disconnectCode === loggedOutCode) {
              console.log('[WhatsApp] Session logged out (401). Clearing auth for fresh QR on next connect.');
              this.deleteAuthFolder();
            }

            // 428 = connectionClosed (transient) — retry with reconnect policy
            // Based on openclaw/openclaw#75773: 428 must stay on the retry path
            if (disconnectCode === 428) {
              console.log(`[WhatsApp] Transient close (428). Will retry reconnect (attempt ${this.reconnectAttempts + 1}/${this.maxReconnectAttempts}).`);
            }

            // Only 440 (session conflict) is non-retryable
            const shouldReconnect = !isNonRetryableDisconnect(disconnectCode);

            if (shouldReconnect && this.reconnectAttempts < this.maxReconnectAttempts) {
              this.reconnectAttempts++;
              const delay = Math.min(this.reconnectBaseDelay * this.reconnectAttempts, 60000);
              console.log(`[WhatsApp] Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})...`);
              this.reconnectTimer = setTimeout(() => this.connect(), delay);
            } else if (!shouldReconnect) {
              console.log(`[WhatsApp] Non-retryable disconnect (${disconnectCode}). Clearing auth for fresh QR.`);
              this.deleteAuthFolder();
            }
          }
        });

      this.sock.ev.on("messages.upsert", (m: any) => {
        if (m.type !== "notify") return;
        for (const msg of m.messages) {
          if (msg.key?.fromMe) continue;
          if (!msg.message) continue;

          const text =
            msg.message.conversation ||
            msg.message.extendedTextMessage?.text ||
            msg.message.imageMessage?.caption ||
            msg.message.videoMessage?.caption ||
            "";
          if (!text) continue;

          const messageData = {
            from: msg.key.remoteJid || "",
            text,
            timestamp: (msg.messageTimestamp as number) || Date.now(),
          };

          console.log(`[WhatsApp] Incoming message from ${messageData.from}: "${text.slice(0, 60)}"`);

          for (const cb of MESSAGE_CALLBACKS) {
            try { cb(messageData); } catch {}
          }

          this.emit("whatsapp_message", messageData);

          // Auto-reply bot
          if (this.botEnabled && this.sock && this.state.connected) {
            const remoteJid = msg.key.remoteJid;
            if (remoteJid && remoteJid.includes('@')) {
              // Don't await — fire and forget, catch errors
              this.handleBotReply(remoteJid, text).catch((err) => {
                console.error('[WhatsApp Bot] Unhandled error in handleBotReply:', err);
              });
            } else {
              console.warn('[WhatsApp] Skipping bot reply - invalid remoteJid:', remoteJid);
            }
          } else {
            console.log(`[WhatsApp] Bot not replying: enabled=${this.botEnabled}, hasSocket=${!!this.sock}, connected=${this.state.connected}`);
          }
        }
      });

      this.sock.ev.on("creds.update", saveCreds);

      // Return after 30s timeout if no QR
      setTimeout(() => {
        if (this.qrResolve) {
          this.qrResolve("");
          this.qrResolve = null;
        }
      }, 30000);
    } catch (error: any) {
      this.connecting = false;
      this.sock = null;
      reject(error);
    }
    });
  }

  /**
   * Delete the Baileys auth folder so the next connect() generates a fresh QR code.
   */
  private deleteAuthFolder() {
    try {
      const authPath = path.resolve(process.cwd(), this.authFolderPath);
      if (fs.existsSync(authPath)) {
        fs.rmSync(authPath, { recursive: true, force: true });
        console.log(`[WhatsApp] Deleted auth folder: ${authPath}`);
      }
    } catch (err) {
      console.error('[WhatsApp] Failed to delete auth folder:', err);
    }
    // Reset so modules get reloaded fresh on next connect
    serviceInitialized = false;
  }

  async disconnect(): Promise<void> {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.reconnectAttempts = this.maxReconnectAttempts; // Prevent auto-reconnect

    if (this.sock) {
      try {
        await this.sock.end();
      } catch {}
      this.sock = null;
    }
    this.state = { connected: false };
    this.connecting = false;
    this.activeQR = undefined;
    this.connectedNumber = null;

    // CRITICAL: Delete the auth folder so next connect generates a FRESH QR code
    this.deleteAuthFolder();

    this.emit("whatsapp_status", this.state);
    console.log('[WhatsApp] Disconnected. Auth cleared — next connect will generate a fresh QR code.');
  }

  getStatus(): { connected: boolean; qr?: string; botEnabled?: boolean; connectedNumber?: string | null } {
    return { ...this.state, botEnabled: this.botEnabled, connectedNumber: this.connectedNumber };
  }

  async sendMessage(rawJid: string, text: string): Promise<void> {
    if (!this.sock || !this.state.connected) {
      throw new Error("WhatsApp not connected");
    }

    // Normalize and validate JID to prevent jidDecode crash
    let jid: string;
    try {
      jid = normalizeJid(rawJid);
    } catch (err: any) {
      throw new Error(err.message || 'Invalid recipient JID');
    }

    // Double-check with Baileys' own jidDecode if available
    if (jidDecode) {
      const decoded = jidDecode(jid);
      if (!decoded || !decoded.user) {
        throw new Error(`Invalid JID "${jid}": could not decode user. Use format: 1234567890@s.whatsapp.net`);
      }
    }

    await this.sock.sendMessage(jid, { text });
  }

  onMessage(callback: (msg: { from: string; text: string; timestamp: number }) => void) {
    MESSAGE_CALLBACKS.push(callback);
  }

  // Bot methods
  setBotEnabled(enabled: boolean) {
    this.botEnabled = enabled;
    (globalThis as any).__whatsapp_bot_enabled = enabled;
    console.log(`[WhatsApp Bot] ${enabled ? 'ENABLED' : 'DISABLED'}`);
  }
  isBotEnabled(): boolean { return this.botEnabled; }
  setBotConfig(config: { model?: string; systemPrompt?: string }) {
    if (config.model) this.botModel = config.model;
    if (config.systemPrompt) this.botSystemPrompt = config.systemPrompt;
  }
  getBotConfig() { return { model: this.botModel, systemPrompt: this.botSystemPrompt, enabled: this.botEnabled, connectedNumber: this.connectedNumber }; }

  private async handleBotReply(jid: string, userMessage: string) {
    console.log(`[WhatsApp Bot] >>> Incoming message from ${jid}: "${userMessage.slice(0, 80)}"`);

    try {
      // Validate jid before any operations
      if (!jid || !jid.includes('@')) {
        console.error('[WhatsApp Bot] Invalid JID for bot reply:', jid);
        return;
      }

      // Skip group messages by default
      if (jid.endsWith('@g.us')) {
        console.log(`[WhatsApp Bot] Skipping group message from ${jid}`);
        return;
      }

      // Send typing indicator
      try {
        await this.sock.sendPresenceUpdate("composing", jid);
      } catch (e) {
        console.warn('[WhatsApp Bot] Could not send typing indicator:', e);
      }

      // Get or create conversation context
      let context = this.userContexts.get(jid) || [];
      context.push({ role: "user", content: userMessage });

      // Keep context manageable (last 20 messages)
      if (context.length > 20) context = context.slice(-20);

      let cleanResponse = "";
      let strategyUsed = "";

      // STRATEGY 0: z-ai-web-dev-sdk (most reliable, no API key configuration needed)
      try {
        cleanResponse = await this.callZAISdk(userMessage, context);
        strategyUsed = "z-ai-web-dev-sdk";
        console.log(`[WhatsApp Bot] Got response from z-ai-web-dev-sdk: "${cleanResponse.slice(0, 60)}..."`);
      } catch (err: any) {
        console.warn(`[WhatsApp Bot] z-ai-web-dev-sdk failed: ${err.message}`);

        // STRATEGY 1: Try Google Gemini REST API directly
        try {
          cleanResponse = await this.callGeminiDirectAPI(userMessage, context);
          strategyUsed = "Gemini REST API";
          console.log(`[WhatsApp Bot] Got response from Gemini REST API: "${cleanResponse.slice(0, 60)}..."`);
        } catch (directErr: any) {
          console.warn(`[WhatsApp Bot] Gemini REST API failed: ${directErr.message}`);

          // STRATEGY 2: Try OpenAI-compatible providers from the database
          try {
            cleanResponse = await this.callOpenAIProvider(userMessage, context);
            strategyUsed = "OpenAI-compatible provider";
            console.log(`[WhatsApp Bot] Got response from provider: "${cleanResponse.slice(0, 60)}..."`);
          } catch (providerErr: any) {
            console.warn(`[WhatsApp Bot] OpenAI provider failed: ${providerErr.message}`);

            // STRATEGY 3: Try local /api/gemini/chat endpoint
            try {
              cleanResponse = await this.callLocalChatAPI(userMessage, context);
              strategyUsed = "Local chat API";
              console.log(`[WhatsApp Bot] Got response from local chat API: "${cleanResponse.slice(0, 60)}..."`);
            } catch (apiErr: any) {
              console.warn(`[WhatsApp Bot] Local chat API failed: ${apiErr.message}`);

              // STRATEGY 4 (ULTIMATE): Try Gemini CLI directly via child_process
              try {
                cleanResponse = await this.callGeminiCLI(userMessage);
                strategyUsed = "Gemini CLI";
                console.log(`[WhatsApp Bot] Got response from Gemini CLI: "${cleanResponse.slice(0, 60)}..."`);
              } catch (cliErr: any) {
                console.warn(`[WhatsApp Bot] Gemini CLI failed: ${cliErr.message}`);

                // STRATEGY 5: Simple fallback response
                cleanResponse = this.generateFallbackResponse(userMessage);
                strategyUsed = "fallback";
                console.log(`[WhatsApp Bot] All AI strategies failed. Using fallback response.`);
              }
            }
          }
        }
      }

      if (!cleanResponse || cleanResponse.trim().length === 0) {
        cleanResponse = "Thanks for your message! I'm currently experiencing issues with my AI backend. Please try again later.";
        strategyUsed = "empty-fallback";
      }

      console.log(`[WhatsApp Bot] Strategy used: ${strategyUsed}`);

      // Clean response for WhatsApp formatting
      cleanResponse = cleanResponse
        .replace(/\*\*(.+?)\*\*/g, "*$1*")     // Bold markdown → WhatsApp bold
        .replace(/```[\s\S]*?```/g, "[code]")   // Code blocks
        .replace(/`([^`]+)`/g, "_$1_")          // Inline code → italic
        .trim();

      context.push({ role: "assistant", content: cleanResponse });
      this.userContexts.set(jid, context);

      await this.sock.sendMessage(jid, { text: cleanResponse });
      this.emit("whatsapp_message", { from: "bot", text: cleanResponse, timestamp: Date.now() });

      console.log(`[WhatsApp Bot] <<< Reply sent to ${jid} (via ${strategyUsed}): "${cleanResponse.slice(0, 80)}..."`);

      // Stop typing indicator
      try {
        await this.sock.sendPresenceUpdate("paused", jid);
      } catch {}
    } catch (error: any) {
      console.error(`[WhatsApp Bot] Reply FAILED for ${jid}: ${error.message}`);
      try {
        await this.sock.sendPresenceUpdate("paused", jid);
      } catch {}
    }
  }

  /**
   * STRATEGY 0: z-ai-web-dev-sdk — the most reliable strategy
   * This SDK is built into the platform and doesn't require any API key configuration.
   * It uses the platform's built-in AI model access.
   */
  /**
   * STRATEGY 4: Ultimate fallback - call Gemini CLI directly via child_process
   * This uses the same gemini CLI that the main chat works with.
   */
  private async callGeminiCLI(userMessage: string): Promise<string> {
    console.log('[WhatsApp Bot] Trying Gemini CLI...');
    
    return new Promise((resolve, reject) => {
      const proc = spawn("gemini", ["--model", this.botModel, "--no-stream"], {
        env: { ...process.env, TERM: "xterm-256color" },
        shell: true,
        stdio: ["pipe", "pipe", "pipe"],
      });

      let output = "";
      let errOutput = "";

      proc.stdout.on("data", (chunk: Buffer) => { output += chunk.toString(); });
      proc.stderr.on("data", (chunk: Buffer) => { errOutput += chunk.toString(); });

      const timeout = setTimeout(() => {
        proc.kill();
        reject(new Error("Gemini CLI timed out (30s)"));
      }, 30000);

      proc.on("close", (code) => {
        clearTimeout(timeout);
        if (code === 0 && output.trim()) {
          resolve(output.trim());
        } else {
          reject(new Error(`Gemini CLI exit ${code}: ${errOutput.slice(0, 100)}`));
        }
      });

      proc.on("error", (err) => {
        clearTimeout(timeout);
        reject(new Error(`Gemini CLI not found: ${err.message}`));
      });

      proc.stdin?.write(`${this.botSystemPrompt}\n\nUser: ${userMessage}\nAssistant:`);
      proc.stdin?.end();
    });
  }

  private async callZAISdk(userMessage: string, context: { role: string; content: string }[]): Promise<string> {
    console.log('[WhatsApp Bot] Trying z-ai-web-dev-sdk...');

    try {
      const ZAI = (await import('z-ai-web-dev-sdk')).default;

      // Create or reuse instance
      if (!this.zaiInstance) {
        this.zaiInstance = await ZAI.create();
        console.log('[WhatsApp Bot] z-ai-web-dev-sdk instance created');
      }

      const messages = [
        { role: "system" as const, content: this.botSystemPrompt },
        ...context.slice(-10).map((msg) => ({
          role: (msg.role === "user" ? "user" : "assistant") as "user" | "assistant",
          content: msg.content,
        })),
      ];

      const controller = new AbortController();
      setTimeout(() => controller.abort(), 30000);

      const completion = await this.zaiInstance.chat.completions.create({
        messages,
        temperature: 0.7,
        max_tokens: 1024,
      });

      const content = completion.choices?.[0]?.message?.content;
      if (!content || content.trim().length === 0) {
        throw new Error('Empty response from z-ai-web-dev-sdk');
      }

      return content;
    } catch (err: any) {
      // Reset instance on error so it's recreated next time
      this.zaiInstance = null;
      throw err;
    }
  }

  /**
   * STRATEGY 1: Call Google Gemini REST API directly
   * Works as long as GEMINI_API_KEY is set in env or a Gemini provider exists in the DB.
   */
  private async callGeminiDirectAPI(userMessage: string, context: { role: string; content: string }[]): Promise<string> {
    // Try to get API key from: env var → database providers → settings
    let apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;

    if (!apiKey) {
      try {
        const { db } = await import("@/lib/db");
        const providers = await db.provider.findMany({ where: { isActive: true } });
        const geminiProvider = providers.find((p: any) =>
          p.name?.toLowerCase().includes('gemini') ||
          p.name?.toLowerCase().includes('google') ||
          p.baseUrl?.includes('generativelanguage.googleapis.com')
        );
        if (geminiProvider?.apiKey) {
          apiKey = geminiProvider.apiKey;
          console.log('[WhatsApp Bot] Found Gemini API key from provider:', geminiProvider.name);
        }
      } catch (dbErr) {
        console.warn('[WhatsApp Bot] Could not check providers DB for API key:', dbErr);
      }
    } else {
      console.log('[WhatsApp Bot] Using GEMINI_API_KEY from env var');
    }

    if (!apiKey) {
      throw new Error('No Gemini API key found. Set GEMINI_API_KEY env var or add a Gemini provider in Settings.');
    }

    // Map our model names to Gemini API model names
    const modelMap: Record<string, string> = {
      "gemini-2.5-flash": "gemini-2.0-flash",
      "gemini-2.0-flash": "gemini-2.0-flash",
      "gemini-1.5-flash": "gemini-1.5-flash",
      "gemini-1.5-pro": "gemini-1.5-pro",
      "gemini-pro": "gemini-pro",
    };
    const apiModel = modelMap[this.botModel] || "gemini-2.0-flash";
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${apiModel}:generateContent?key=${apiKey}`;

    // Build the contents array for Gemini API
    const contents = context.slice(-10).map((msg) => ({
      role: msg.role === "user" ? "user" : "model",
      parts: [{ text: msg.content }],
    }));

    const body = {
      contents,
      systemInstruction: {
        parts: [{ text: this.botSystemPrompt }],
      },
      generationConfig: {
        maxOutputTokens: 1024,
        temperature: 0.7,
      },
    };

    console.log(`[WhatsApp Bot] Calling Gemini direct API with model: ${apiModel}`);

    const controller = new AbortController();
    setTimeout(() => controller.abort(), 30000);

    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      throw new Error(`Gemini API error: ${res.status} ${errText.slice(0, 200)}`);
    }

    const data = await res.json();
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!text) {
      throw new Error('No text in Gemini API response');
    }

    return text;
  }

  /**
   * STRATEGY 2: Call an OpenAI-compatible provider from the database
   * This covers any custom provider (OpenAI, DeepSeek, etc.) configured in Settings.
   */
  private async callOpenAIProvider(userMessage: string, context: { role: string; content: string }[]): Promise<string> {
    let providerData: { name: string; baseUrl: string; apiKey: string } | null = null;

    try {
      const { db } = await import("@/lib/db");
      const providers = await db.provider.findMany({ where: { isActive: true } });

      // Skip Gemini providers (already tried in Strategy 1)
      const openAiProvider = providers.find((p: any) =>
        !p.name?.toLowerCase().includes('gemini') &&
        !p.name?.toLowerCase().includes('google') &&
        !p.baseUrl?.includes('generativelanguage.googleapis.com') &&
        p.apiKey &&
        p.baseUrl
      );

      if (openAiProvider) {
        providerData = {
          name: openAiProvider.name,
          baseUrl: (openAiProvider.baseUrl || "").replace(/\/$/, ""),
          apiKey: openAiProvider.apiKey || "",
        };
        console.log(`[WhatsApp Bot] Found OpenAI-compatible provider: ${providerData.name}`);
      }
    } catch (dbErr: any) {
      throw new Error(`DB lookup failed: ${dbErr.message}`);
    }

    if (!providerData) {
      throw new Error('No OpenAI-compatible provider found in database');
    }

    const url = `${providerData.baseUrl}/chat/completions`;
    const messages = [
      { role: "system", content: this.botSystemPrompt },
      ...context.slice(-10).map((msg) => ({
        role: msg.role === "user" ? "user" : "assistant",
        content: msg.content,
      })),
    ];

    console.log(`[WhatsApp Bot] Calling provider ${providerData.name} at ${url}`);

    const controller = new AbortController();
    setTimeout(() => controller.abort(), 30000);

    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${providerData.apiKey}`,
      },
      body: JSON.stringify({
        model: this.botModel.includes('/') ? this.botModel.split('/')[1] : this.botModel,
        messages,
        max_tokens: 1024,
        temperature: 0.7,
      }),
      signal: controller.signal,
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      throw new Error(`Provider API error: ${res.status} ${errText.slice(0, 200)}`);
    }

    const data = await res.json();
    const text = data?.choices?.[0]?.message?.content;

    if (!text) {
      throw new Error('No text in provider API response');
    }

    return text;
  }

  /**
   * STRATEGY 3: Call the local /api/gemini/chat endpoint
   * This is the dashboard's own chat API — complex, uses SSE streaming and gemini CLI.
   * Kept as a late fallback since it may not always be available.
   */
  private async callLocalChatAPI(userMessage: string, context: { role: string; content: string }[]): Promise<string> {
    const controller = new AbortController();
    setTimeout(() => controller.abort(), 30000); // Reduced from 60s

    const ports = [3000, 3001, 3002, 3003, 3004, 3005];
    
    for (const port of ports) {
      try {
        const apiUrl = `http://127.0.0.1:${port}`;
        console.log(`[WhatsApp Bot] Trying ${apiUrl}/api/gemini/chat`);

        const res = await fetch(`${apiUrl}/api/gemini/chat`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            prompt: userMessage,
            model: this.botModel,
            systemPrompt: this.botSystemPrompt,
            conversationHistory: context.slice(0, -1),
          }),
          signal: controller.signal,
        });

        if (!res.ok) {
          console.log(`[WhatsApp Bot] Port ${port} returned ${res.status}, trying next...`);
          continue;
        }

        // Read SSE stream to get full response
        const reader = res.body?.getReader();
        const decoder = new TextDecoder();
        let fullResponse = "";

        if (reader) {
          let buffer = "";
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split("\n");
            buffer = lines.pop() || "";

            for (const line of lines) {
              const trimmed = line.trim();
              if (!trimmed || trimmed === "data: [DONE]") continue;
              if (trimmed.startsWith("data: ")) {
                try {
                  const data = JSON.parse(trimmed.slice(6));
                  if (data.type === "chunk" && data.content) {
                    fullResponse += data.content;
                  } else if (data.type === "error") {
                    throw new Error(data.error);
                  }
                } catch (parseErr: any) {
                  if (parseErr.message && !parseErr.message.includes('JSON')) {
                    throw parseErr;
                  }
                }
              }
            }
          }
        }

        if (fullResponse && fullResponse.trim().length > 0) {
          return fullResponse;
        }
        console.log(`[WhatsApp Bot] Port ${port} returned empty response, trying next...`);
      } catch (e: any) {
        if (e.name === "AbortError") throw e;
        console.log(`[WhatsApp Bot] Port ${port} failed: ${e.message}, trying next...`);
      }
    }

    throw new Error("All local API ports failed (tried 3000-3005)");
  }

  /**
   * STRATEGY 4: Simple fallback response when all AI APIs fail
   */
  private generateFallbackResponse(userMessage: string): string {
    const lowerMsg = userMessage.toLowerCase().trim();

    // Greeting patterns
    if (/^(hi|hello|hey|salut|bonjour|bonsoir|coucou|hola|ciao)/i.test(lowerMsg)) {
      return "Hello! I'm an AI assistant on this WhatsApp number. I received your message but my AI backend is temporarily unavailable. Please try again shortly!";
    }

    // Question patterns
    if (lowerMsg.includes('?') || lowerMsg.startsWith('what') || lowerMsg.startsWith('how') || lowerMsg.startsWith('why') || lowerMsg.startsWith('when') || lowerMsg.startsWith('where') || lowerMsg.startsWith('who')) {
      return "Thanks for your question! I'm experiencing temporary connectivity issues with my AI backend. Your message has been received and I'll be able to respond properly once the connection is restored.";
    }

    // Default
    return "Thanks for your message! I'm currently experiencing connectivity issues with my AI backend. Please try again in a moment and I'll be happy to help!";
  }

  private emit(event: string, data: any) {
    import("@/lib/events").then(({ eventBus }) => eventBus.emit(event, data));
  }
}

const globalForWhatsApp = globalThis as unknown as { __whatsAppService?: WhatsAppService };

export const whatsAppService: WhatsAppService =
  globalForWhatsApp.__whatsAppService ??
  (globalForWhatsApp.__whatsAppService = new WhatsAppService());
