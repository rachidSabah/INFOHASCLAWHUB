"use client";

import { useState, useEffect } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import {
  Wifi, Globe, Monitor, Copy, ExternalLink, Smartphone, Laptop,
  Loader2, CheckCircle2, XCircle,
} from "lucide-react";

interface NetworkInfo {
  hostname: string;
  localIP: string | null;
  port: number;
  lanURL: string | null;
  status: string;
  timestamp: string;
  interfaces: Array<{ name: string; ip: string; mac: string }>;
}

export default function NetworkInfoPanel({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [info, setInfo] = useState<NetworkInfo | null>(null);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (open) {
      fetchInfo();
    }
  }, [open]);

  const fetchInfo = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/network/status");
      const data = await res.json();
      setInfo(data);
    } catch {
      toast.error("Failed to fetch network info");
    } finally {
      setLoading(false);
    }
  };

  const copyURL = (url: string) => {
    navigator.clipboard.writeText(url);
    setCopied(true);
    toast.success("URL copied to clipboard");
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <Wifi className="h-4 w-4 text-blue-500" />
            Network & LAN Access
          </DialogTitle>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : info ? (
          <div className="space-y-4">
            <div className="p-4 rounded-lg border border-border bg-muted/30">
              <div className="flex items-center justify-between mb-3">
                <span className="text-sm font-medium">LAN Status</span>
                {info.status === "lan_available" ? (
                  <span className="flex items-center gap-1 text-xs text-green-500">
                    <CheckCircle2 className="h-3 w-3" /> Available
                  </span>
                ) : (
                  <span className="flex items-center gap-1 text-xs text-red-500">
                    <XCircle className="h-3 w-3" /> Localhost only
                  </span>
                )}
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">Hostname</span>
                  <span className="font-mono">{info.hostname}</span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">Local IP</span>
                  <span className="font-mono">{info.localIP || "N/A"}</span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">Port</span>
                  <span className="font-mono">{info.port}</span>
                </div>
              </div>
            </div>

            {info.lanURL && (
              <div className="p-4 rounded-lg border border-green-500/30 bg-green-500/5">
                <h4 className="text-xs font-semibold mb-2 flex items-center gap-1 text-green-600">
                  <Globe className="h-3 w-3" /> LAN Access URL
                </h4>
                <div className="flex items-center gap-2">
                  <code className="text-sm font-mono flex-1 bg-muted px-3 py-2 rounded border border-border">
                    {info.lanURL}
                  </code>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 w-8 p-0 shrink-0"
                    onClick={() => copyURL(info.lanURL!)}
                  >
                    {copied ? <CheckCircle2 className="h-3.5 w-3.5 text-green-500" /> : <Copy className="h-3.5 w-3.5" />}
                  </Button>
                </div>
                <p className="text-[10px] text-muted-foreground mt-2">
                  Other devices on your WiFi/LAN can access the dashboard using this URL.
                </p>
              </div>
            )}

            {info.interfaces.length > 0 && (
              <div>
                <h4 className="text-xs font-semibold mb-2 flex items-center gap-1">
                  <Monitor className="h-3 w-3" /> Network Interfaces
                </h4>
                <div className="space-y-1">
                  {info.interfaces.map((iface, i) => (
                    <div
                      key={i}
                      className="flex items-center justify-between text-xs px-3 py-2 rounded border border-border bg-muted/20"
                    >
                      <div className="flex items-center gap-2">
                        {iface.name.toLowerCase().includes("wi") || iface.name.toLowerCase().includes("wl") ? (
                          <Wifi className="h-3 w-3 text-blue-500" />
                        ) : (
                          <Monitor className="h-3 w-3 text-muted-foreground" />
                        )}
                        <span className="font-mono">{iface.ip}</span>
                      </div>
                      <span className="text-muted-foreground font-mono text-[10px]">{iface.name}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="flex gap-2 text-[10px] text-muted-foreground items-center justify-center pt-2 border-t border-border">
              <Smartphone className="h-3 w-3" />
              <Laptop className="h-3 w-3" />
              <span>Desktops, laptops, tablets, and phones on the same network can connect.</span>
            </div>
          </div>
        ) : (
          <div className="text-center py-8 text-sm text-muted-foreground">Unable to load network information</div>
        )}
      </DialogContent>
    </Dialog>
  );
}
