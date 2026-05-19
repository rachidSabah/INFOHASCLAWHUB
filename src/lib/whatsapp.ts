let makeWASocket: any;
let useMultiFileAuthState: any;
let DisconnectReason: any;

let serviceInitialized = false;

function generateQRDataURL(text: string): string {
  // Use Google Charts API for reliable QR code generation
  const encoded = encodeURIComponent(text);
  return `https://chart.googleapis.com/chart?chs=250x250&cht=qr&chl=${encoded}&choe=UTF-8`;
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

  private emit(event: string, data: any) {
    import("@/lib/events").then(({ eventBus }) => eventBus.emit(event, data));
  }
}

const globalForWhatsApp = globalThis as unknown as { __whatsAppService?: WhatsAppService };

export const whatsAppService: WhatsAppService =
  globalForWhatsApp.__whatsAppService ??
  (globalForWhatsApp.__whatsAppService = new WhatsAppService());
