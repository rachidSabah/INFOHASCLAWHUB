"use client";

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
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
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  Store,
  Download,
  Settings,
  Trash2,
  Plus,
  Star,
  Loader2,
  RefreshCw,
  Search,
  Package,
  Code,
  Wrench,
  Bot,
  Palette,
  Zap,
  CheckCircle2,
  ToggleLeft,
  FileJson,
  Play,
  Upload,
  ExternalLink,
  User,
  Puzzle,
} from "lucide-react";

// ─── Types ───────────────────────────────────────────────────────────────────

interface Plugin {
  id: string;
  name: string;
  description: string;
  author: string;
  version: string;
  category: "integration" | "tool" | "agent" | "theme" | "utility";
  manifest: string;
  isEnabled: boolean;
  isInstalled: boolean;
  rating: number;
  installs: number;
  createdAt: string;
  updatedAt: string;
}

interface PluginMarketplacePanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function categoryIcon(category: string) {
  switch (category) {
    case "integration":
      return <Puzzle className="h-3.5 w-3.5 text-blue-400" />;
    case "tool":
      return <Wrench className="h-3.5 w-3.5 text-amber-400" />;
    case "agent":
      return <Bot className="h-3.5 w-3.5 text-violet-400" />;
    case "theme":
      return <Palette className="h-3.5 w-3.5 text-pink-400" />;
    case "utility":
      return <Zap className="h-3.5 w-3.5 text-emerald-400" />;
    default:
      return <Package className="h-3.5 w-3.5 text-zinc-400" />;
  }
}

function categoryBadge(category: string) {
  switch (category) {
    case "integration":
      return "bg-blue-500/15 text-blue-400 border-blue-500/30";
    case "tool":
      return "bg-amber-500/15 text-amber-400 border-amber-500/30";
    case "agent":
      return "bg-violet-500/15 text-violet-400 border-violet-500/30";
    case "theme":
      return "bg-pink-500/15 text-pink-400 border-pink-500/30";
    case "utility":
      return "bg-emerald-500/15 text-emerald-400 border-emerald-500/30";
    default:
      return "bg-zinc-500/15 text-zinc-400 border-zinc-500/30";
  }
}

function renderStars(rating: number): React.ReactElement[] {
  const stars: React.ReactElement[] = [];
  const fullStars = Math.floor(rating);
  const hasHalf = rating - fullStars >= 0.5;

  for (let i = 0; i < 5; i++) {
    if (i < fullStars) {
      stars.push(
        <Star key={i} className="h-3 w-3 fill-amber-400 text-amber-400" />
      );
    } else if (i === fullStars && hasHalf) {
      stars.push(
        <Star key={i} className="h-3 w-3 fill-amber-400/50 text-amber-400" />
      );
    } else {
      stars.push(
        <Star key={i} className="h-3 w-3 text-zinc-600" />
      );
    }
  }
  return stars;
}

function formatInstallCount(count: number): string {
  if (count >= 1_000_000) return `${(count / 1_000_000).toFixed(1)}M`;
  if (count >= 1_000) return `${(count / 1_000).toFixed(1)}K`;
  return count.toString();
}

// ─── Default manifest template ───────────────────────────────────────────────

const DEFAULT_MANIFEST = JSON.stringify(
  {
    name: "my-plugin",
    version: "1.0.0",
    description: "A custom ClawHub plugin",
    author: "You",
    category: "tool",
    entry: "index.js",
    permissions: ["read:conversations", "write:messages"],
    config: {
      apiKey: { type: "string", required: true, label: "API Key" },
    },
  },
  null,
  2
);

// ─── Component ───────────────────────────────────────────────────────────────

export function PluginMarketplacePanel({ open, onOpenChange }: PluginMarketplacePanelProps) {
  // ── Plugin State ──
  const [plugins, setPlugins] = useState<Plugin[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");

  // ── Installed filter ──
  const [installedFilter, setInstalledFilter] = useState<string>("all");

  // ── Create Tab State ──
  const [createName, setCreateName] = useState("");
  const [createDescription, setCreateDescription] = useState("");
  const [createManifest, setCreateManifest] = useState(DEFAULT_MANIFEST);
  const [createAuthor, setCreateAuthor] = useState("");
  const [createVersion, setCreateVersion] = useState("1.0.0");
  const [createCategory, setCreateCategory] = useState<Plugin["category"]>("tool");
  const [creating, setCreating] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<string | null>(null);

  // ── Active Tab ──
  const [activeTab, setActiveTab] = useState("browse");

  // ── Fetch Plugins ──
  const fetchPlugins = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (categoryFilter !== "all") params.set("category", categoryFilter);
      const res = await fetch(`/api/plugins?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setPlugins(data);
      }
    } catch {
      // silently fail
    } finally {
      setLoading(false);
    }
  }, [categoryFilter]);

  // ── Init ──
  useEffect(() => {
    if (!open) return;
    fetchPlugins();
  }, [open, fetchPlugins]);

  // ── Filtered plugins for Browse tab ──
  const availablePlugins = plugins.filter((p) => !p.isInstalled);
  const filteredAvailable = availablePlugins.filter((p) => {
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      return (
        p.name.toLowerCase().includes(q) ||
        p.description.toLowerCase().includes(q) ||
        p.author.toLowerCase().includes(q)
      );
    }
    return true;
  });

  // ── Filtered plugins for Installed tab ──
  const installedPlugins = plugins.filter((p) => p.isInstalled);
  const filteredInstalled = installedPlugins.filter((p) => {
    if (installedFilter === "enabled") return p.isEnabled;
    if (installedFilter === "disabled") return !p.isEnabled;
    return true;
  });

  // ── Install Plugin ──
  const installPlugin = async (pluginId: string) => {
    try {
      const res = await fetch("/api/plugins/install", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pluginId }),
      });
      if (res.ok) {
        toast.success("Plugin installed successfully");
        await fetchPlugins();
      } else {
        const data = await res.json();
        toast.error(data.error || "Failed to install plugin");
      }
    } catch {
      toast.error("Failed to install plugin");
    }
  };

  // ── Toggle Plugin Enabled ──
  const togglePlugin = async (plugin: Plugin) => {
    try {
      const res = await fetch(`/api/plugins/${plugin.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isEnabled: !plugin.isEnabled }),
      });
      if (res.ok) {
        toast.success(plugin.isEnabled ? "Plugin disabled" : "Plugin enabled");
        await fetchPlugins();
      } else {
        toast.error("Failed to update plugin");
      }
    } catch {
      toast.error("Failed to update plugin");
    }
  };

  // ── Uninstall Plugin ──
  const uninstallPlugin = async (pluginId: string) => {
    try {
      const res = await fetch(`/api/plugins/${pluginId}`, {
        method: "DELETE",
      });
      if (res.ok) {
        toast.success("Plugin uninstalled");
        await fetchPlugins();
      } else {
        toast.error("Failed to uninstall plugin");
      }
    } catch {
      toast.error("Failed to uninstall plugin");
    }
  };

  // ── Create Plugin ──
  const createPlugin = async () => {
    if (!createName.trim()) {
      toast.error("Plugin name is required");
      return;
    }
    if (!createDescription.trim()) {
      toast.error("Plugin description is required");
      return;
    }

    // Validate manifest JSON
    try {
      JSON.parse(createManifest);
    } catch {
      toast.error("Invalid JSON in manifest");
      return;
    }

    setCreating(true);
    try {
      const res = await fetch("/api/plugins", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: createName.trim(),
          description: createDescription.trim(),
          author: createAuthor.trim() || "Anonymous",
          version: createVersion.trim() || "1.0.0",
          category: createCategory,
          manifest: createManifest,
          isInstalled: true,
          isEnabled: false,
          rating: 0,
          installs: 0,
        }),
      });
      if (res.ok) {
        toast.success("Plugin created successfully");
        // Reset form
        setCreateName("");
        setCreateDescription("");
        setCreateManifest(DEFAULT_MANIFEST);
        setCreateAuthor("");
        setCreateVersion("1.0.0");
        setCreateCategory("tool");
        setTestResult(null);
        await fetchPlugins();
        setActiveTab("installed");
      } else {
        const data = await res.json();
        toast.error(data.error || "Failed to create plugin");
      }
    } catch {
      toast.error("Failed to create plugin");
    } finally {
      setCreating(false);
    }
  };

  // ── Test Manifest ──
  const testManifest = async () => {
    try {
      const parsed = JSON.parse(createManifest);
      setTesting(true);
      setTestResult(null);

      // Simulate validation
      const errors: string[] = [];
      if (!parsed.name) errors.push("Missing 'name' field");
      if (!parsed.version) errors.push("Missing 'version' field");
      if (!parsed.entry) errors.push("Missing 'entry' field");
      if (parsed.permissions && !Array.isArray(parsed.permissions)) {
        errors.push("'permissions' must be an array");
      }
      if (parsed.config && typeof parsed.config !== "object") {
        errors.push("'config' must be an object");
      }

      await new Promise((resolve) => setTimeout(resolve, 800));

      if (errors.length > 0) {
        setTestResult(`❌ Validation failed:\n${errors.map((e) => `  • ${e}`).join("\n")}`);
        toast.error("Manifest validation failed");
      } else {
        setTestResult("✅ Manifest is valid and ready to publish!");
        toast.success("Manifest validation passed");
      }
    } catch {
      setTestResult("❌ Invalid JSON syntax");
      toast.error("Invalid JSON in manifest");
    } finally {
      setTesting(false);
    }
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // RENDER
  // ═══════════════════════════════════════════════════════════════════════════

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-5xl max-h-[90vh] overflow-hidden flex flex-col" showCloseButton>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <div className="flex items-center justify-center h-8 w-8 rounded-lg bg-gradient-to-br from-emerald-500/20 to-violet-500/20 border border-emerald-500/30">
              <Store className="h-4 w-4 text-emerald-400" />
            </div>
            Plugin &amp; Extension Marketplace
          </DialogTitle>
          <DialogDescription>
            Browse, install, and create plugins to extend ClawHub&apos;s capabilities
          </DialogDescription>
        </DialogHeader>
          <PowerToolHint name="Plugin Marketplace" />

        <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col min-h-0">
          <TabsList className="grid w-full grid-cols-3 mb-1 shrink-0">
            <TabsTrigger value="browse" className="gap-1.5 text-xs">
              <Store className="h-3.5 w-3.5" />
              Browse
            </TabsTrigger>
            <TabsTrigger value="installed" className="gap-1.5 text-xs">
              <Package className="h-3.5 w-3.5" />
              Installed
            </TabsTrigger>
            <TabsTrigger value="create" className="gap-1.5 text-xs">
              <Plus className="h-3.5 w-3.5" />
              Create
            </TabsTrigger>
          </TabsList>

          {/* ═══ BROWSE TAB ═══ */}
          <TabsContent value="browse" className="flex-1 min-h-0 mt-0">
            <ScrollArea className="h-[calc(90vh-200px)]">
              <div className="space-y-4 p-1 pr-4">
                {/* Search & Filter */}
                <div className="flex items-center gap-3 flex-wrap">
                  <div className="relative flex-1 min-w-[200px]">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                    <Input
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="Search plugins..."
                      className="h-8 pl-8 text-xs"
                    />
                  </div>
                  <div className="flex gap-1.5">
                    {["all", "integration", "tool", "agent", "theme", "utility"].map(
                      (cat) => (
                        <Button
                          key={cat}
                          size="sm"
                          variant={categoryFilter === cat ? "default" : "outline"}
                          onClick={() => setCategoryFilter(cat)}
                          className="h-7 text-xs capitalize"
                        >
                          {cat !== "all" && categoryIcon(cat)}
                          {cat}
                        </Button>
                      )
                    )}
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={fetchPlugins}
                    disabled={loading}
                    className="h-7 text-xs gap-1"
                  >
                    <RefreshCw className={cn("h-3 w-3", loading && "animate-spin")} />
                  </Button>
                </div>

                {/* Plugin Grid */}
                {loading && plugins.length === 0 ? (
                  <div className="flex items-center justify-center py-16 text-muted-foreground">
                    <Loader2 className="h-6 w-6 animate-spin mr-2" />
                    <span className="text-sm">Loading plugins...</span>
                  </div>
                ) : filteredAvailable.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-16 text-muted-foreground border border-dashed rounded-lg">
                    <Store className="h-10 w-10 mb-3 opacity-30" />
                    <p className="text-sm font-medium">No plugins available</p>
                    <p className="text-xs mt-1">
                      {searchQuery ? "Try a different search term" : "Check back later for new plugins"}
                    </p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {filteredAvailable.map((plugin) => (
                      <div
                        key={plugin.id}
                        className="rounded-xl border bg-card p-4 space-y-3 hover:border-primary/30 transition-colors"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <h5 className="text-sm font-semibold truncate">
                                {plugin.name}
                              </h5>
                              <Badge
                                className={cn(
                                  "h-5 text-[10px] border",
                                  categoryBadge(plugin.category)
                                )}
                              >
                                {categoryIcon(plugin.category)}
                                <span className="ml-1">{plugin.category}</span>
                              </Badge>
                            </div>
                            <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                              {plugin.description}
                            </p>
                          </div>
                        </div>

                        <div className="flex items-center gap-4 text-[10px] text-muted-foreground">
                          <span className="flex items-center gap-1">
                            <User className="h-3 w-3" />
                            {plugin.author}
                          </span>
                          <span className="flex items-center gap-1">
                            {renderStars(plugin.rating)}
                            <span className="ml-0.5">{plugin.rating.toFixed(1)}</span>
                          </span>
                          <span className="flex items-center gap-1">
                            <Download className="h-3 w-3" />
                            {formatInstallCount(plugin.installs)}
                          </span>
                          <span>v{plugin.version}</span>
                        </div>

                        <div className="flex items-center gap-2 pt-1">
                          <Button
                            size="sm"
                            onClick={() => installPlugin(plugin.id)}
                            className="h-7 text-xs gap-1 flex-1"
                          >
                            <Download className="h-3 w-3" />
                            Install
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </ScrollArea>
          </TabsContent>

          {/* ═══ INSTALLED TAB ═══ */}
          <TabsContent value="installed" className="flex-1 min-h-0 mt-0">
            <ScrollArea className="h-[calc(90vh-200px)]">
              <div className="space-y-4 p-1 pr-4">
                {/* Filter */}
                <div className="flex items-center gap-3">
                  <div className="flex gap-1.5">
                    {["all", "enabled", "disabled"].map((filter) => (
                      <Button
                        key={filter}
                        size="sm"
                        variant={installedFilter === filter ? "default" : "outline"}
                        onClick={() => setInstalledFilter(filter)}
                        className="h-7 text-xs capitalize"
                      >
                        {filter}
                      </Button>
                    ))}
                  </div>
                  <span className="text-xs text-muted-foreground ml-auto">
                    {installedPlugins.length} plugin{installedPlugins.length !== 1 ? "s" : ""} installed
                  </span>
                </div>

                {/* Installed List */}
                {filteredInstalled.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-16 text-muted-foreground border border-dashed rounded-lg">
                    <Package className="h-10 w-10 mb-3 opacity-30" />
                    <p className="text-sm font-medium">No installed plugins</p>
                    <p className="text-xs mt-1 mb-4">Browse and install plugins to extend functionality</p>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setActiveTab("browse")}
                      className="h-8 text-xs gap-1"
                    >
                      <Store className="h-3 w-3" />
                      Browse Plugins
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {filteredInstalled.map((plugin) => (
                      <div
                        key={plugin.id}
                        className={cn(
                          "rounded-lg border p-4 transition-all",
                          plugin.isEnabled
                            ? "bg-card border-emerald-500/20"
                            : "bg-card opacity-70"
                        )}
                      >
                        <div className="flex items-start gap-3">
                          {/* Plugin icon */}
                          <div className="flex items-center justify-center h-10 w-10 rounded-lg bg-muted/50 shrink-0">
                            {categoryIcon(plugin.category)}
                          </div>

                          {/* Info */}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <h5 className="text-sm font-medium">{plugin.name}</h5>
                              <Badge
                                className={cn(
                                  "h-4 text-[9px] border",
                                  categoryBadge(plugin.category)
                                )}
                              >
                                {plugin.category}
                              </Badge>
                              <Badge
                                className={cn(
                                  "h-4 text-[9px] border",
                                  plugin.isEnabled
                                    ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/30"
                                    : "bg-zinc-500/15 text-zinc-400 border-zinc-500/30"
                                )}
                              >
                                {plugin.isEnabled ? "Enabled" : "Disabled"}
                              </Badge>
                              <span className="text-[10px] text-muted-foreground">
                                v{plugin.version}
                              </span>
                            </div>
                            <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">
                              {plugin.description}
                            </p>
                            <p className="text-[10px] text-muted-foreground mt-0.5">
                              by {plugin.author}
                            </p>
                          </div>

                          {/* Actions */}
                          <div className="flex items-center gap-2 shrink-0">
                            <div className="flex items-center gap-1.5">
                              <Label className="text-[10px] text-muted-foreground">
                                <ToggleLeft className="h-3 w-3 inline mr-0.5" />
                              </Label>
                              <Switch
                                checked={plugin.isEnabled}
                                onCheckedChange={() => togglePlugin(plugin)}
                                className="scale-75"
                              />
                            </div>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
                              onClick={() => {
                                try {
                                  const manifest = JSON.parse(plugin.manifest);
                                  toast.info(
                                    `Plugin: ${manifest.name || plugin.name}\nEntry: ${manifest.entry || "N/A"}\nPermissions: ${(manifest.permissions || []).join(", ") || "None"}`
                                  );
                                } catch {
                                  toast.info("No configuration available");
                                }
                              }}
                            >
                              <Settings className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-7 w-7 p-0 text-destructive hover:text-destructive"
                              onClick={() => uninstallPlugin(plugin.id)}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </ScrollArea>
          </TabsContent>

          {/* ═══ CREATE TAB ═══ */}
          <TabsContent value="create" className="flex-1 min-h-0 mt-0">
            <ScrollArea className="h-[calc(90vh-200px)]">
              <div className="space-y-6 p-1 pr-4">
                {/* Plugin Info */}
                <div className="rounded-xl border bg-card p-5 space-y-4">
                  <h4 className="text-sm font-semibold flex items-center gap-2">
                    <Code className="h-4 w-4 text-violet-400" />
                    Custom Tool Builder
                  </h4>
                  <p className="text-xs text-muted-foreground">
                    Create a custom plugin to extend ClawHub with new capabilities.
                  </p>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <Label className="text-xs font-medium">Plugin Name</Label>
                      <Input
                        value={createName}
                        onChange={(e) => setCreateName(e.target.value)}
                        placeholder="e.g., My Awesome Tool"
                        className="h-9 text-xs"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs font-medium">Author</Label>
                      <Input
                        value={createAuthor}
                        onChange={(e) => setCreateAuthor(e.target.value)}
                        placeholder="Your name"
                        className="h-9 text-xs"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs font-medium">Version</Label>
                      <Input
                        value={createVersion}
                        onChange={(e) => setCreateVersion(e.target.value)}
                        placeholder="1.0.0"
                        className="h-9 text-xs"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs font-medium">Category</Label>
                      <div className="flex gap-1.5 flex-wrap">
                        {(["integration", "tool", "agent", "theme", "utility"] as const).map(
                          (cat) => (
                            <Button
                              key={cat}
                              size="sm"
                              variant={createCategory === cat ? "default" : "outline"}
                              onClick={() => setCreateCategory(cat)}
                              className={cn(
                                "h-8 text-xs gap-1 capitalize",
                                createCategory === cat && categoryBadge(cat)
                              )}
                            >
                              {categoryIcon(cat)}
                              {cat}
                            </Button>
                          )
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-xs font-medium">Description</Label>
                    <Textarea
                      value={createDescription}
                      onChange={(e) => setCreateDescription(e.target.value)}
                      placeholder="Describe what your plugin does..."
                      className="text-xs min-h-[60px] resize-none"
                    />
                  </div>
                </div>

                {/* Manifest Editor */}
                <div className="rounded-xl border bg-card p-5 space-y-4">
                  <div className="flex items-center justify-between">
                    <h4 className="text-sm font-semibold flex items-center gap-2">
                      <FileJson className="h-4 w-4 text-amber-400" />
                      Manifest JSON
                    </h4>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setCreateManifest(DEFAULT_MANIFEST)}
                      className="h-7 text-xs gap-1"
                    >
                      <RefreshCw className="h-3 w-3" />
                      Reset
                    </Button>
                  </div>

                  <Textarea
                    value={createManifest}
                    onChange={(e) => {
                      setCreateManifest(e.target.value);
                      setTestResult(null);
                    }}
                    className="font-mono text-[11px] min-h-[240px] resize-y bg-zinc-950 text-zinc-200 border-zinc-800"
                    spellCheck={false}
                  />

                  {/* Test Result */}
                  {testResult && (
                    <div
                      className={cn(
                        "rounded-lg border p-3 text-xs whitespace-pre-wrap",
                        testResult.startsWith("✅")
                          ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400"
                          : "bg-red-500/10 border-red-500/30 text-red-400"
                      )}
                    >
                      {testResult}
                    </div>
                  )}

                  {/* Actions */}
                  <div className="flex items-center gap-3">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={testManifest}
                      disabled={testing}
                      className="h-8 text-xs gap-1.5"
                    >
                      {testing ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Play className="h-3.5 w-3.5" />
                      )}
                      {testing ? "Testing..." : "Test Manifest"}
                    </Button>
                    <Button
                      size="sm"
                      onClick={createPlugin}
                      disabled={creating || !createName.trim() || !createDescription.trim()}
                      className="h-8 text-xs gap-1.5 min-w-[140px]"
                    >
                      {creating ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Upload className="h-3.5 w-3.5" />
                      )}
                      {creating ? "Publishing..." : "Publish Plugin"}
                    </Button>
                  </div>
                </div>

                {/* Manifest Guide */}
                <div className="rounded-xl border bg-card p-5 space-y-3">
                  <h4 className="text-sm font-semibold flex items-center gap-2">
                    <ExternalLink className="h-4 w-4 text-cyan-400" />
                    Manifest Reference
                  </h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                    <div className="space-y-1.5">
                      <p className="text-muted-foreground">
                        <code className="text-foreground bg-muted/60 px-1 rounded">name</code> — Plugin identifier (required)
                      </p>
                      <p className="text-muted-foreground">
                        <code className="text-foreground bg-muted/60 px-1 rounded">version</code> — Semantic version (required)
                      </p>
                      <p className="text-muted-foreground">
                        <code className="text-foreground bg-muted/60 px-1 rounded">entry</code> — Entry point file (required)
                      </p>
                      <p className="text-muted-foreground">
                        <code className="text-foreground bg-muted/60 px-1 rounded">permissions</code> — Array of required permissions
                      </p>
                    </div>
                    <div className="space-y-1.5">
                      <p className="text-muted-foreground">
                        <code className="text-foreground bg-muted/60 px-1 rounded">config</code> — User-configurable options schema
                      </p>
                      <p className="text-muted-foreground">
                        <code className="text-foreground bg-muted/60 px-1 rounded">hooks</code> — Lifecycle hooks (onLoad, onMessage)
                      </p>
                      <p className="text-muted-foreground">
                        <code className="text-foreground bg-muted/60 px-1 rounded">dependencies</code> — Required npm packages
                      </p>
                      <p className="text-muted-foreground">
                        <code className="text-foreground bg-muted/60 px-1 rounded">description</code> — Plugin description
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </ScrollArea>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
