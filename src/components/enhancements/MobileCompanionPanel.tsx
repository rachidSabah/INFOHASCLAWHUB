"use client";

import { PowerToolHint } from "./PowerToolHint";
import { useState, useCallback, useEffect, useRef } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Smartphone,
  QrCode,
  Wifi,
  WifiOff,
  Bell,
  BellOff,
  Send,
  Trash2,
  Loader2,
  Check,
  X,
  Activity,
  Shield,
  Zap,
  AlertCircle,
  CheckCircle2,
  Clock,
  Tablet,
  Watch,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ─── Types ──────────────────────────────────────────────────────────────────

interface MobileCompanionPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface Device {
  id: string;
  deviceToken: string;
  platform: "ios" | "android";
  deviceName: string;
  registeredAt: string;
  isActive: boolean;
}

interface NotificationSettings {
  agentComplete: boolean;
  errors: boolean;
  approvals: boolean;
  deployments: boolean;
  security: boolean;
}

interface ActivityEntry {
  id: string;
  action: string;
  device: string;
  timestamp: Date;
  status: "success" | "error" | "pending";
  details: string;
}

// ─── Component ──────────────────────────────────────────────────────────────

export function MobileCompanionPanel({ open, onOpenChange }: MobileCompanionPanelProps) {
  // ── Connection State ──
  const [devices, setDevices] = useState<Device[]>([]);
  const [loadingDevices, setLoadingDevices] = useState(false);
  const [registering, setRegistering] = useState(false);
  const [newDeviceToken, setNewDeviceToken] = useState("");
  const [newDevicePlatform, setNewDevicePlatform] = useState<"ios" | "android">("ios");
  const [newDeviceName, setNewDeviceName] = useState("");
  const [qrVisible, setQrVisible] = useState(false);

  // ── Notification Settings State ──
  const [notifSettings, setNotifSettings] = useState<NotificationSettings>({
    agentComplete: true,
    errors: true,
    approvals: false,
    deployments: true,
    security: true,
  });
  const [sendingTest, setSendingTest] = useState(false);

  // ── Activity State ──
  const [activityFeed, setActivityFeed] = useState<ActivityEntry[]>([]);

  // ── QR Code ref ──
  const qrCanvasRef = useRef<HTMLCanvasElement>(null);

  // ── Generate simulated QR ──
  const generateQRCode = useCallback(() => {
    setQrVisible(true);
    // Simple visual QR placeholder
    const canvas = qrCanvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const size = 200;
    canvas.width = size;
    canvas.height = size;

    // White background
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, size, size);

    // Generate a QR-like pattern
    const cellSize = 8;
    const grid = Math.floor(size / cellSize);

    // Create deterministic pattern from a pairing code
    const code = `CLAWHUB-${Date.now().toString(36).toUpperCase()}`;
    let seed = 0;
    for (let i = 0; i < code.length; i++) {
      seed = ((seed << 5) - seed + code.charCodeAt(i)) | 0;
    }

    const pseudoRandom = () => {
      seed = (seed * 16807) % 2147483647;
      return (seed & 1) === 1;
    };

    ctx.fillStyle = "#000000";

    // Position markers (3 corners)
    const drawMarker = (x: number, y: number) => {
      ctx.fillRect(x, y, 7 * cellSize, 7 * cellSize);
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(x + cellSize, y + cellSize, 5 * cellSize, 5 * cellSize);
      ctx.fillStyle = "#000000";
      ctx.fillRect(x + 2 * cellSize, y + 2 * cellSize, 3 * cellSize, 3 * cellSize);
    };

    drawMarker(0, 0);
    drawMarker((grid - 7) * cellSize, 0);
    drawMarker(0, (grid - 7) * cellSize);

    // Data cells
    for (let row = 0; row < grid; row++) {
      for (let col = 0; col < grid; col++) {
        // Skip marker areas
        if ((row < 8 && col < 8) || (row < 8 && col >= grid - 8) || (row >= grid - 8 && col < 8)) {
          continue;
        }
        if (pseudoRandom()) {
          ctx.fillStyle = "#000000";
          ctx.fillRect(col * cellSize, row * cellSize, cellSize, cellSize);
        }
      }
    }
  }, []);

  // ── Fetch devices ──
  const fetchDevices = useCallback(async () => {
    setLoadingDevices(true);
    try {
      const res = await fetch("/api/settings?key=mobile_device_");
      if (res.ok) {
        const data = await res.json();
        // Parse mobile device entries from settings
        if (Array.isArray(data)) {
          const parsedDevices: Device[] = data
            .filter((s: any) => s.key?.startsWith("mobile_device_"))
            .map((s: any) => {
              try {
                const val = JSON.parse(s.value);
                return {
                  id: String(s.id),
                  deviceToken: val.deviceToken || "",
                  platform: val.platform || "ios",
                  deviceName: val.deviceName || "Unknown Device",
                  registeredAt: val.registeredAt || new Date().toISOString(),
                  isActive: val.isActive ?? true,
                };
              } catch {
                return null;
              }
            })
            .filter(Boolean) as Device[];
          setDevices(parsedDevices);
        }
      }
    } catch {
      // Silently fail - devices may not exist yet
    } finally {
      setLoadingDevices(false);
    }
  }, []);

  // ── Register device ──
  const handleRegisterDevice = useCallback(async () => {
    if (!newDeviceToken.trim()) {
      toast.error("Device token is required");
      return;
    }

    setRegistering(true);
    try {
      const res = await fetch("/api/mobile/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          deviceToken: newDeviceToken.trim(),
          platform: newDevicePlatform,
          deviceName: newDeviceName.trim() || `${newDevicePlatform === "ios" ? "iPhone" : "Android"} Device`,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        toast.success(`Device registered (${data.platform})`);
        setNewDeviceToken("");
        setNewDeviceName("");
        await fetchDevices();

        // Add activity
        setActivityFeed((prev) => [
          {
            id: `act-${Date.now()}`,
            action: "Device Registered",
            device: newDeviceName || `${newDevicePlatform} Device`,
            timestamp: new Date(),
            status: "success",
            details: `New ${newDevicePlatform} device paired`,
          },
          ...prev,
        ]);
      } else {
        const data = await res.json();
        toast.error(data.error || "Registration failed");
      }
    } catch {
      toast.error("Registration request failed");
    } finally {
      setRegistering(false);
    }
  }, [newDeviceToken, newDevicePlatform, newDeviceName, fetchDevices]);

  // ── Disconnect device ──
  const handleDisconnect = useCallback(async (device: Device) => {
    try {
      const res = await fetch(`/api/settings/${device.id}`, { method: "DELETE" });
      if (res.ok) {
        toast.success(`Disconnected ${device.deviceName}`);
        await fetchDevices();

        setActivityFeed((prev) => [
          {
            id: `act-${Date.now()}`,
            action: "Device Disconnected",
            device: device.deviceName,
            timestamp: new Date(),
            status: "success",
            details: `${device.platform} device removed`,
          },
          ...prev,
        ]);
      } else {
        toast.error("Failed to disconnect device");
      }
    } catch {
      toast.error("Failed to disconnect device");
    }
  }, [fetchDevices]);

  // ── Send test notification ──
  const handleTestNotification = useCallback(async () => {
    setSendingTest(true);
    try {
      const res = await fetch("/api/mobile/notify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: "Test Notification",
          message: "This is a test push notification from ClawHub AI",
          type: "test",
        }),
      });

      if (res.ok) {
        const data = await res.json();
        toast.success(`Test notification sent to ${data.recipients} device(s)`);

        setActivityFeed((prev) => [
          {
            id: `act-${Date.now()}`,
            action: "Test Notification",
            device: "All Devices",
            timestamp: new Date(),
            status: "success",
            details: `Sent to ${data.recipients} device(s)`,
          },
          ...prev,
        ]);
      } else {
        toast.error("Failed to send test notification");
      }
    } catch {
      toast.error("Notification request failed");
    } finally {
      setSendingTest(false);
    }
  }, []);

  // ── Update notification settings ──
  const updateNotifSetting = useCallback((key: keyof NotificationSettings, value: boolean) => {
    setNotifSettings((prev) => {
      const next = { ...prev, [key]: value };
      toast.success(`${key} notifications ${value ? "enabled" : "disabled"}`);
      return next;
    });
  }, []);

  // ── Load data on open ──
  useEffect(() => {
    if (open) {
      fetchDevices();
    }
  }, [open, fetchDevices]);

  // ── Platform icon ──
  const getPlatformIcon = (platform: string) => {
    switch (platform) {
      case "ios":
        return <Smartphone className="h-4 w-4" />;
      case "android":
        return <Tablet className="h-4 w-4" />;
      default:
        return <Watch className="h-4 w-4" />;
    }
  };

  // ── Activity status icon ──
  const getStatusIcon = (status: string) => {
    switch (status) {
      case "success":
        return <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />;
      case "error":
        return <AlertCircle className="h-3.5 w-3.5 text-red-400" />;
      case "pending":
        return <Clock className="h-3.5 w-3.5 text-amber-400" />;
      default:
        return <Activity className="h-3.5 w-3.5" />;
    }
  };

  // ── Notification setting items ──
  const NOTIF_ITEMS: { key: keyof NotificationSettings; label: string; icon: React.ReactNode; description: string }[] = [
    { key: "agentComplete", label: "Agent Complete", icon: <Zap className="h-4 w-4 text-amber-400" />, description: "Notify when an AI agent finishes a task" },
    { key: "errors", label: "Errors", icon: <AlertCircle className="h-4 w-4 text-red-400" />, description: "Alert on runtime errors and failures" },
    { key: "approvals", label: "Approvals", icon: <Shield className="h-4 w-4 text-sky-400" />, description: "Request approval for critical actions" },
    { key: "deployments", label: "Deployments", icon: <Activity className="h-4 w-4 text-emerald-400" />, description: "Deployment status and progress" },
    { key: "security", label: "Security", icon: <Shield className="h-4 w-4 text-purple-400" />, description: "Security alerts and vulnerability findings" },
  ];

  // ── Render ──
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-4xl max-h-[92vh] p-0 gap-0 overflow-hidden flex flex-col overflow-hidden overflow-hidden flex flex-col">
        <DialogHeader className="px-6 pt-6 pb-0">
          <DialogTitle className="flex items-center gap-2">
            <Smartphone className="h-5 w-5" />
            Mobile Companion
          </DialogTitle>
          <DialogDescription>
            Pair mobile devices, manage notifications, and track mobile activity
          </DialogDescription>
        </DialogHeader>
          <PowerToolHint name="Mobile Companion" />

        <Tabs defaultValue="connection" className="flex flex-col flex-1 min-h-0">
          <div className="px-6 pt-2">
            <TabsList className="w-full">
              <TabsTrigger value="connection" className="flex-1 gap-1.5">
                <QrCode className="h-3.5 w-3.5" />
                Connection
              </TabsTrigger>
              <TabsTrigger value="notifications" className="flex-1 gap-1.5">
                <Bell className="h-3.5 w-3.5" />
                Notifications
              </TabsTrigger>
              <TabsTrigger value="activity" className="flex-1 gap-1.5">
                <Activity className="h-3.5 w-3.5" />
                Activity
              </TabsTrigger>
            </TabsList>
          </div>

          {/* ──────── CONNECTION TAB ──────── */}
          <TabsContent value="connection" className="flex-1 min-h-0 mt-0 overflow-y-auto">
            <ScrollArea className="h-[calc(90vh-14rem)]">
              <div className="p-6 space-y-5">
                {/* QR Code Section */}
                <div className="rounded-lg border bg-card p-4 space-y-4">
                  <div className="flex items-center gap-2">
                    <QrCode className="h-4 w-4 text-primary" />
                    <h4 className="font-semibold text-sm">Pair Mobile App</h4>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Scan this QR code with the ClawHub mobile app to pair your device
                  </p>

                  <div className="flex flex-col items-center gap-3">
                    {qrVisible ? (
                      <div className="rounded-lg border-2 border-dashed border-primary/30 p-3">
                        <canvas
                          ref={qrCanvasRef}
                          className="rounded"
                          style={{ width: 200, height: 200 }}
                        />
                      </div>
                    ) : (
                      <div className="h-[200px] w-[200px] rounded-lg border-2 border-dashed border-muted-foreground/20 flex items-center justify-center">
                        <div className="text-center">
                          <QrCode className="h-10 w-10 mx-auto mb-2 text-muted-foreground/40" />
                          <p className="text-xs text-muted-foreground">QR Code</p>
                        </div>
                      </div>
                    )}
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={generateQRCode}
                      className="gap-1.5"
                    >
                      <QrCode className="h-3.5 w-3.5" />
                      {qrVisible ? "Regenerate QR Code" : "Generate QR Code"}
                    </Button>
                  </div>
                </div>

                <Separator />

                {/* Register Device Manually */}
                <div className="rounded-lg border bg-card p-4 space-y-4">
                  <h4 className="font-semibold text-sm flex items-center gap-2">
                    <Wifi className="h-4 w-4 text-emerald-400" />
                    Register Device Manually
                  </h4>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label className="text-xs">Device Name</Label>
                      <Input
                        value={newDeviceName}
                        onChange={(e) => setNewDeviceName(e.target.value)}
                        placeholder="My iPhone"
                        className="h-9 text-sm"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs">Platform</Label>
                      <div className="flex gap-2">
                        <Button
                          variant={newDevicePlatform === "ios" ? "default" : "outline"}
                          size="sm"
                          className="flex-1 gap-1.5"
                          onClick={() => setNewDevicePlatform("ios")}
                        >
                          <Smartphone className="h-3.5 w-3.5" />
                          iOS
                        </Button>
                        <Button
                          variant={newDevicePlatform === "android" ? "default" : "outline"}
                          size="sm"
                          className="flex-1 gap-1.5"
                          onClick={() => setNewDevicePlatform("android")}
                        >
                          <Tablet className="h-3.5 w-3.5" />
                          Android
                        </Button>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-xs">Device Token</Label>
                    <Input
                      value={newDeviceToken}
                      onChange={(e) => setNewDeviceToken(e.target.value)}
                      placeholder="Enter device push token..."
                      className="h-9 text-sm"
                    />
                  </div>

                  <Button
                    onClick={handleRegisterDevice}
                    disabled={registering || !newDeviceToken.trim()}
                    className="w-full"
                  >
                    {registering ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <Wifi className="h-4 w-4 mr-2" />
                    )}
                    {registering ? "Registering..." : "Register Device"}
                  </Button>
                </div>

                <Separator />

                {/* Registered Devices */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h4 className="font-semibold text-sm flex items-center gap-2">
                      <Smartphone className="h-4 w-4" />
                      Registered Devices
                    </h4>
                    <Badge variant="secondary" className="h-5 text-[10px]">
                      {devices.length} device{devices.length !== 1 ? "s" : ""}
                    </Badge>
                  </div>

                  {loadingDevices ? (
                    <div className="flex items-center justify-center py-8 text-muted-foreground">
                      <Loader2 className="h-5 w-5 animate-spin mr-2" />
                      Loading devices...
                    </div>
                  ) : devices.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
                      <Smartphone className="h-10 w-10 mb-3 opacity-40" />
                      <p className="text-sm">No devices registered</p>
                      <p className="text-xs mt-1">Scan the QR code or register manually</p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {devices.map((device) => (
                        <div
                          key={device.id}
                          className={cn(
                            "rounded-lg border bg-card p-3 flex items-center gap-3",
                            !device.isActive && "opacity-50"
                          )}
                        >
                          <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                            {getPlatformIcon(device.platform)}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="font-medium text-sm truncate">
                                {device.deviceName}
                              </span>
                              <Badge
                                variant="outline"
                                className="h-4 text-[9px] px-1.5 shrink-0"
                              >
                                {device.platform}
                              </Badge>
                              {device.isActive ? (
                                <Badge className="h-4 text-[9px] px-1.5 bg-emerald-500/10 text-emerald-400 border-emerald-500/20 shrink-0">
                                  Active
                                </Badge>
                              ) : (
                                <Badge className="h-4 text-[9px] px-1.5 bg-muted text-muted-foreground shrink-0">
                                  Inactive
                                </Badge>
                              )}
                            </div>
                            <p className="text-[10px] text-muted-foreground mt-0.5">
                              Registered {new Date(device.registeredAt).toLocaleDateString()}
                            </p>
                          </div>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-destructive hover:text-destructive shrink-0"
                            onClick={() => handleDisconnect(device)}
                          >
                            <WifiOff className="h-4 w-4" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </ScrollArea>
          </TabsContent>

          {/* ──────── NOTIFICATIONS TAB ──────── */}
          <TabsContent value="notifications" className="flex-1 min-h-0 mt-0 overflow-y-auto">
            <ScrollArea className="h-[calc(90vh-14rem)]">
              <div className="p-6 space-y-5">
                {/* Push Notification Settings */}
                <div className="rounded-lg border bg-card p-4 space-y-4">
                  <div className="flex items-center justify-between">
                    <h4 className="font-semibold text-sm flex items-center gap-2">
                      <Bell className="h-4 w-4" />
                      Push Notification Settings
                    </h4>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 text-xs gap-1.5"
                      onClick={handleTestNotification}
                      disabled={sendingTest}
                    >
                      {sendingTest ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Send className="h-3.5 w-3.5" />
                      )}
                      Send Test
                    </Button>
                  </div>

                  <div className="space-y-3">
                    {NOTIF_ITEMS.map((item) => (
                      <div
                        key={item.key}
                        className="flex items-center justify-between py-2 border-b last:border-b-0"
                      >
                        <div className="flex items-center gap-3">
                          {item.icon}
                          <div>
                            <p className="text-sm font-medium">{item.label}</p>
                            <p className="text-xs text-muted-foreground">{item.description}</p>
                          </div>
                        </div>
                        <Switch
                          checked={notifSettings[item.key]}
                          onCheckedChange={(val) => updateNotifSetting(item.key, val)}
                        />
                      </div>
                    ))}
                  </div>
                </div>

                {/* Notification preview */}
                <div className="rounded-lg border bg-card p-4 space-y-3">
                  <Label className="text-xs font-semibold">Notification Preview</Label>
                  <div className="space-y-2">
                    {notifSettings.agentComplete && (
                      <div className="flex items-center gap-3 p-2 rounded-md bg-amber-500/5 border border-amber-500/10">
                        <Zap className="h-4 w-4 text-amber-400 shrink-0" />
                        <div className="flex-1">
                          <p className="text-xs font-medium">Agent Complete</p>
                          <p className="text-[10px] text-muted-foreground">Your AI agent has finished the task</p>
                        </div>
                      </div>
                    )}
                    {notifSettings.errors && (
                      <div className="flex items-center gap-3 p-2 rounded-md bg-red-500/5 border border-red-500/10">
                        <AlertCircle className="h-4 w-4 text-red-400 shrink-0" />
                        <div className="flex-1">
                          <p className="text-xs font-medium">Error Alert</p>
                          <p className="text-[10px] text-muted-foreground">A runtime error has occurred</p>
                        </div>
                      </div>
                    )}
                    {notifSettings.approvals && (
                      <div className="flex items-center gap-3 p-2 rounded-md bg-sky-500/5 border border-sky-500/10">
                        <Shield className="h-4 w-4 text-sky-400 shrink-0" />
                        <div className="flex-1">
                          <p className="text-xs font-medium">Approval Required</p>
                          <p className="text-[10px] text-muted-foreground">Action needs your approval to proceed</p>
                        </div>
                      </div>
                    )}
                    {notifSettings.deployments && (
                      <div className="flex items-center gap-3 p-2 rounded-md bg-emerald-500/5 border border-emerald-500/10">
                        <Activity className="h-4 w-4 text-emerald-400 shrink-0" />
                        <div className="flex-1">
                          <p className="text-xs font-medium">Deployment Update</p>
                          <p className="text-[10px] text-muted-foreground">Deployment status has changed</p>
                        </div>
                      </div>
                    )}
                    {notifSettings.security && (
                      <div className="flex items-center gap-3 p-2 rounded-md bg-purple-500/5 border border-purple-500/10">
                        <Shield className="h-4 w-4 text-purple-400 shrink-0" />
                        <div className="flex-1">
                          <p className="text-xs font-medium">Security Alert</p>
                          <p className="text-[10px] text-muted-foreground">Security scan found vulnerabilities</p>
                        </div>
                      </div>
                    )}
                    {!Object.values(notifSettings).some(Boolean) && (
                      <p className="text-xs text-muted-foreground text-center py-4">
                        No notifications enabled. Toggle the switches above to see previews.
                      </p>
                    )}
                  </div>
                </div>
              </div>
            </ScrollArea>
          </TabsContent>

          {/* ──────── ACTIVITY TAB ──────── */}
          <TabsContent value="activity" className="flex-1 min-h-0 mt-0 overflow-y-auto">
            <ScrollArea className="h-[calc(90vh-14rem)]">
              <div className="p-6 space-y-4">
                <div className="flex items-center justify-between">
                  <div className="text-sm text-muted-foreground">
                    {activityFeed.length} activit{activityFeed.length !== 1 ? "ies" : "y"}
                  </div>
                  {activityFeed.length > 0 && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 text-xs"
                      onClick={() => {
                        setActivityFeed([]);
                        toast.success("Activity feed cleared");
                      }}
                    >
                      Clear
                    </Button>
                  )}
                </div>

                {activityFeed.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                    <Activity className="h-10 w-10 mb-3 opacity-40" />
                    <p className="text-sm">No mobile activity yet</p>
                    <p className="text-xs mt-1">Actions taken from mobile devices will appear here</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {activityFeed.map((entry) => (
                      <div
                        key={entry.id}
                        className="rounded-lg border bg-card p-3 flex items-start gap-3"
                      >
                        <div className="mt-0.5">{getStatusIcon(entry.status)}</div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium">{entry.action}</span>
                            <Badge variant="outline" className="h-4 text-[9px] px-1.5 shrink-0">
                              {entry.device}
                            </Badge>
                          </div>
                          <p className="text-xs text-muted-foreground mt-0.5">{entry.details}</p>
                          <p className="text-[10px] text-muted-foreground/60 mt-1">
                            {entry.timestamp.toLocaleTimeString()}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </ScrollArea>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
