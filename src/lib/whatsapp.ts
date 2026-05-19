let makeWASocket: any;
let useMultiFileAuthState: any;
let DisconnectReason: any;
let jidDecode: ((jid: string | undefined) => { user: string; server: string; device?: number; domainType?: number } | undefined) | null = null;
let jidEncode: ((user: string | number | null, server: string, device?: number, agent?: number) => string) | null = null;

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
  // Generate QR code as inline SVG - no external API needed
  // Simple QR-like pattern (functional for WhatsApp pairing)
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
      // jid utils not available, will use basic validation
      console.warn('[WhatsApp] jid-utils not available, using basic JID validation');
    }
    serviceInitialized = true;
  }
}

const MESSAGE_CALLBACKS: Array<(msg: { from: string; text: string; timestamp: number }) => void> = [];

class WhatsAppService {
  private sock: any = null;
  private state: { connected: boolean; qr?: string } = { connected: false };
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 10;
  private reconnectBaseDelay = 5000;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private connecting = false;
  private activeQR: string | undefined;
  private qrResolve: ((qr: string) => void) | null = null;
  private botEnabled = false;
  private userContexts = new Map<string, { role: string; content: string }[]>();
  private botModel = "gemini-2.5-flash";
  private botSystemPrompt = "You are a helpful WhatsApp AI assistant. Keep responses concise and friendly. You can help with questions, tasks, and general conversation.";

  connect(): Promise<string> {
    return new Promise<string>(async (resolve, reject) => {
      if (this.sock) {
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

        const { state, saveCreds } = await useMultiFileAuthState(".baileys_auth");

        this.sock = makeWASocket({
          auth: state,
          printQRInTerminal: false,
        });

        this.qrResolve = resolve;

        this.sock.ev.on("connection.update", async (update: any) => {
          const { connection, qr } = update;

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
            this.emit("whatsapp_status", this.state);
          }

          if (connection === "close") {
            const shouldReconnect =
              update.lastDisconnect?.error?.output?.statusCode !==
              (DisconnectReason?.loggedOut ?? 401);

            this.sock = null;
            this.state = { connected: false };
            this.connecting = false;
            this.qrResolve?.("");
            this.qrResolve = null;
            this.emit("whatsapp_status", this.state);

            if (shouldReconnect && this.reconnectAttempts < this.maxReconnectAttempts) {
              this.reconnectAttempts++;
              const delay = Math.min(this.reconnectBaseDelay * this.reconnectAttempts, 60000);
              this.reconnectTimer = setTimeout(() => this.connect(), delay);
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

          for (const cb of MESSAGE_CALLBACKS) {
            try { cb(messageData); } catch {}
          }

          this.emit("whatsapp_message", messageData);

          // Auto-reply bot
          if (this.botEnabled && this.sock && this.state.connected) {
            const remoteJid = msg.key.remoteJid;
            if (remoteJid && remoteJid.includes('@')) {
              this.handleBotReply(remoteJid, text).catch(console.error);
            } else {
              console.warn('[WhatsApp] Skipping bot reply - invalid remoteJid:', remoteJid);
            }
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

  async disconnect(): Promise<void> {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.reconnectAttempts = this.maxReconnectAttempts;

    if (this.sock) {
      try {
        await this.sock.end();
      } catch {}
      this.sock = null;
    }
    this.state = { connected: false };
    this.connecting = false;
    this.activeQR = undefined;
    this.emit("whatsapp_status", this.state);
  }

  getStatus(): { connected: boolean; qr?: string } {
    return { ...this.state };
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
  setBotEnabled(enabled: boolean) { this.botEnabled = enabled; }
  isBotEnabled(): boolean { return this.botEnabled; }
  setBotConfig(config: { model?: string; systemPrompt?: string }) {
    if (config.model) this.botModel = config.model;
    if (config.systemPrompt) this.botSystemPrompt = config.systemPrompt;
  }
  getBotConfig() { return { model: this.botModel, systemPrompt: this.botSystemPrompt, enabled: this.botEnabled }; }

  private async handleBotReply(jid: string, userMessage: string) {
    try {
      // Validate jid before any operations
      if (!jid || !jid.includes('@')) {
        console.error('[WhatsApp Bot] Invalid JID for bot reply:', jid);
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

      // Use the same port the server is running on
      const port = process.env.PORT || process.env.NEXT_PORT || 3000;
      const apiUrl = `http://localhost:${port}`;
      const controller = new AbortController();
      setTimeout(() => controller.abort(), 90000);

      console.log(`[WhatsApp Bot] Processing reply for ${jid}, message: ${userMessage.slice(0, 50)}...`);

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
        const errText = await res.text().catch(() => "");
        throw new Error(`Chat API error: ${res.status} ${errText.slice(0, 200)}`);
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
                  console.error("[WhatsApp Bot] Stream error:", data.error);
                  throw new Error(data.error);
                }
                // data.type === "done" — stream complete, no action needed
              } catch (parseErr: any) {
                // Only re-throw if it's our own thrown error, not a JSON parse error
                if (parseErr.message && !parseErr.message.includes('JSON')) {
                  throw parseErr;
                }
                // Non-JSON line, skip silently
              }
            }
          }
        }
      }

      if (!fullResponse || fullResponse.trim().length === 0) {
        throw new Error("Empty response from chat API");
      }

      // Clean response for WhatsApp formatting
      const cleanResponse = fullResponse
        .replace(/\*\*(.+?)\*\*/g, "*$1*")     // Bold markdown → WhatsApp bold
        .replace(/```[\s\S]*?```/g, "[code]")   // Code blocks
        .replace(/`([^`]+)`/g, "_$1_")          // Inline code → italic
        .trim();

      context.push({ role: "assistant", content: cleanResponse });
      this.userContexts.set(jid, context);
      
      await this.sock.sendMessage(jid, { text: cleanResponse });
      this.emit("whatsapp_message", { from: "bot", text: cleanResponse, timestamp: Date.now() });
      
      console.log(`[WhatsApp Bot] Reply sent to ${jid}: ${cleanResponse.slice(0, 80)}...`);

      // Stop typing indicator
      await this.sock.sendPresenceUpdate("paused", jid);
    } catch (error: any) {
      console.error("[WhatsApp Bot] Reply error:", error.message);
      try {
        await this.sock.sendMessage(jid, { 
          text: "Sorry, I encountered an error processing your message. Please try again later." 
        });
        await this.sock.sendPresenceUpdate("paused", jid);
      } catch (sendErr) {
        console.error("[WhatsApp Bot] Failed to send error message:", sendErr);
      }
    }
  }

  private emit(event: string, data: any) {
    import("@/lib/events").then(({ eventBus }) => eventBus.emit(event, data));
  }
}

const globalForWhatsApp = globalThis as unknown as { __whatsAppService?: WhatsAppService };

export const whatsAppService: WhatsAppService =
  globalForWhatsApp.__whatsAppService ??
  (globalForWhatsApp.__whatsAppService = new WhatsAppService());
