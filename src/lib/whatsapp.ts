let makeWASocket: any;
let useMultiFileAuthState: any;
let DisconnectReason: any;

let serviceInitialized = false;

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
            this.handleBotReply(msg.key.remoteJid, text).catch(console.error);
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

  async sendMessage(jid: string, text: string): Promise<void> {
    if (!this.sock || !this.state.connected) {
      throw new Error("WhatsApp not connected");
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
      console.log(`[WhatsApp Bot] Processing message from ${jid}: "${userMessage.slice(0, 50)}..."`);
      
      // Send typing indicator
      try { await this.sock.sendPresenceUpdate("composing", jid); } catch {}
      
      // Get or create conversation context
      let context = this.userContexts.get(jid) || [];
      context.push({ role: "user", content: userMessage });
      
      // Keep context manageable (last 20 messages)
      if (context.length > 20) context = context.slice(-20);

      // Try multiple possible API URLs
      const apiUrls = [
        process.env.NEXT_PUBLIC_APP_URL,
        "http://localhost:3000",
        "http://localhost:3001",
        "http://127.0.0.1:3000",
        "http://127.0.0.1:3001",
      ].filter(Boolean) as string[];

      let fullResponse = "";
      let success = false;

      for (const apiUrl of apiUrls) {
        try {
          console.log(`[WhatsApp Bot] Trying ${apiUrl}/api/gemini/chat`);
          const controller = new AbortController();
          setTimeout(() => controller.abort(), 45000);

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
            console.log(`[WhatsApp Bot] ${apiUrl} returned ${res.status}`);
            continue;
          }

          // Read SSE stream
          const reader = res.body?.getReader();
          const decoder = new TextDecoder();

          if (reader) {
            while (true) {
              const { done, value } = await reader.read();
              if (done) break;
              const text = decoder.decode(value, { stream: true });
              const lines = text.split("\n");
              for (const line of lines) {
                if (line.startsWith("data: ")) {
                  try {
                    const data = JSON.parse(line.slice(6));
                    if (data.type === "chunk") fullResponse += data.content;
                    if (data.type === "done") fullResponse = fullResponse || "";
                  } catch {}
                }
              }
            }
          }

          if (fullResponse) { success = true; break; }
        } catch (e: any) {
          console.log(`[WhatsApp Bot] ${apiUrl} failed: ${e.message}`);
          continue;
        }
      }

      if (success && fullResponse) {
        // Clean response for WhatsApp
        const cleanResponse = fullResponse
          .replace(/\*\*(.+?)\*\*/g, "*$1*")
          .replace(/```[\s\S]*?```/g, "[code]")
          .replace(/\n\n+/g, "\n\n")
          .trim()
          .slice(0, 1500);

        context.push({ role: "assistant", content: cleanResponse });
        this.userContexts.set(jid, context);
        await this.sock.sendMessage(jid, { text: cleanResponse });
        this.emit("whatsapp_message", { from: "bot", text: cleanResponse, timestamp: Date.now() });
        console.log(`[WhatsApp Bot] Reply sent to ${jid}`);
      } else {
        console.log(`[WhatsApp Bot] No response generated for ${jid}`);
      }

      // Stop typing
      try { await this.sock.sendPresenceUpdate("paused", jid); } catch {}
    } catch (error: any) {
      console.error("[WhatsApp Bot] Reply error:", error.message);
      try {
        await this.sock.sendMessage(jid, { text: "I received your message but couldn't process it. Please try again." });
      } catch {}
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
