"use client";

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
  Bot,
  Zap,
  Play,
  Power,
  PowerOff,
  RefreshCw,
  Rocket,
  Filter,
  Check,
  X,
  Loader2,
  Sparkles,
  Shield,
  Code,
  BarChart3,
  Briefcase,
  Database,
  Activity,
  LayoutGrid,
} from "lucide-react";

// ─── Types ───────────────────────────────────────────────────────────────────

interface Agent {
  id: string;
  name: string;
  role: string;
  avatar?: string | null;
  skills?: string | null;
  isActive: boolean;
  systemPrompt: string;
  createdAt: string;
  updatedAt: string;
}

interface PrebuiltAgentsPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

// ─── Category Mapping ────────────────────────────────────────────────────────

type Category = "Development" | "Security" | "Operations" | "Business" | "Data";

const CATEGORY_KEYWORDS: Record<Category, string[]> = {
  Development: ["code", "build", "software", "architect", "fullstack", "frontend", "backend", "coding", "review", "debug", "ci/cd", "forge", "scribe", "documentation"],
  Security: ["security", "vulnerability", "penetration", "audit", "guardian", "vault", "compliance", "deploy guardian", "vuln"],
  Operations: ["infrastructure", "admin", "incident", "monitor", "healing", "deploy", "pipeline", "system", "server", "infra", "self-healing"],
  Business: ["resume", "marketing", "copywriting", "seo", "sales", "pipeline", "competitive", "intelligence", "echo", "rank", "scout", "compass", "content"],
  Data: ["analytics", "metrics", "business intelligence", "data", "pulse", "radar", "performance"],
};

function categorizeAgent(agent: Agent): Category {
  const searchText = `${agent.name} ${agent.role}`.toLowerCase();
  const skills = agent.skills ? parseSkills(agent.skills).join(" ").toLowerCase() : "";

  for (const [category, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
    for (const keyword of keywords) {
      if (searchText.includes(keyword) || skills.includes(keyword)) {
        return category as Category;
      }
    }
  }
  return "Development";
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function parseSkills(raw: string | null | undefined): string[] {
  try {
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function getCategoryIcon(category: Category) {
  switch (category) {
    case "Development":
      return <Code className="h-3.5 w-3.5" />;
    case "Security":
      return <Shield className="h-3.5 w-3.5" />;
    case "Operations":
      return <Activity className="h-3.5 w-3.5" />;
    case "Business":
      return <Briefcase className="h-3.5 w-3.5" />;
    case "Data":
      return <Database className="h-3.5 w-3.5" />;
  }
}

function getCategoryColor(category: Category) {
  switch (category) {
    case "Development":
      return "from-emerald-500/20 to-cyan-500/20 border-emerald-500/30";
    case "Security":
      return "from-red-500/20 to-orange-500/20 border-red-500/30";
    case "Operations":
      return "from-amber-500/20 to-yellow-500/20 border-amber-500/30";
    case "Business":
      return "from-violet-500/20 to-fuchsia-500/20 border-violet-500/30";
    case "Data":
      return "from-sky-500/20 to-blue-500/20 border-sky-500/30";
  }
}

function getCategoryBadgeColor(category: Category) {
  switch (category) {
    case "Development":
      return "bg-emerald-500/15 text-emerald-400 border-emerald-500/30";
    case "Security":
      return "bg-red-500/15 text-red-400 border-red-500/30";
    case "Operations":
      return "bg-amber-500/15 text-amber-400 border-amber-500/30";
    case "Business":
      return "bg-violet-500/15 text-violet-400 border-violet-500/30";
    case "Data":
      return "bg-sky-500/15 text-sky-400 border-sky-500/30";
  }
}

function getSkillBadgeColor(skill: string) {
  const s = skill.toLowerCase();
  if (s.includes("browser") || s.includes("agent")) return "bg-sky-500/15 text-sky-400 border-sky-500/25";
  if (s.includes("code") || s.includes("fullstack") || s.includes("frontend") || s.includes("backend")) return "bg-emerald-500/15 text-emerald-400 border-emerald-500/25";
  if (s.includes("database") || s.includes("architect") || s.includes("system")) return "bg-amber-500/15 text-amber-400 border-amber-500/25";
  if (s.includes("pdf") || s.includes("docx") || s.includes("xlsx")) return "bg-rose-500/15 text-rose-400 border-rose-500/25";
  if (s.includes("search") || s.includes("web")) return "bg-violet-500/15 text-violet-400 border-violet-500/25";
  return "bg-zinc-500/15 text-zinc-400 border-zinc-500/25";
}

// ─── Component ───────────────────────────────────────────────────────────────

export function PrebuiltAgentsPanel({ open, onOpenChange }: PrebuiltAgentsPanelProps) {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(false);
  const [seeding, setSeeding] = useState(false);
  const [systemSeeding, setSystemSeeding] = useState(false);
  const [runningAgentId, setRunningAgentId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState("all");
  const [activatingId, setActivatingId] = useState<string | null>(null);

  // ── Fetch Agents ──
  const fetchAgents = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/agents");
      if (res.ok) {
        const data = await res.json();
        setAgents(data);
      }
    } catch {
      // silently fail
    } finally {
      setLoading(false);
    }
  }, []);

  // ── Init ──
  useEffect(() => {
    if (!open) return;
    fetchAgents();
  }, [open, fetchAgents]);

  // ── Filter Agents ──
  const filteredAgents = activeTab === "all"
    ? agents
    : agents.filter((a) => categorizeAgent(a) === activeTab);

  const activeCount = agents.filter((a) => a.isActive).length;
  const totalCount = agents.length;

  // ── Seed All Agents ──
  const seedAllAgents = async () => {
    setSeeding(true);
    try {
      const res = await fetch("/api/agents/seed", { method: "POST" });
      if (res.ok) {
        const data = await res.json();
        toast.success(`Agents seeded: ${data.created} created, ${data.updated} updated`);
        await fetchAgents();
      } else {
        const data = await res.json();
        toast.error(data.error || "Failed to seed agents");
      }
    } catch {
      toast.error("Failed to seed agents");
    } finally {
      setSeeding(false);
    }
  };

  // ── Seed Full System ──
  const seedFullSystem = async () => {
    setSystemSeeding(true);
    try {
      const res = await fetch("/api/system/seed", { method: "POST" });
      if (res.ok) {
        const data = await res.json();
        toast.success(
          `Full system seeded! ${data.summary.totalCreated} created, ${data.summary.totalUpdated} updated`
        );
        await fetchAgents();
      } else {
        const data = await res.json();
        toast.error(data.error || "Failed to seed system");
      }
    } catch {
      toast.error("Failed to seed system");
    } finally {
      setSystemSeeding(false);
    }
  };

  // ── Toggle Agent Active ──
  const toggleAgent = async (agent: Agent) => {
    setActivatingId(agent.id);
    try {
      const res = await fetch(`/api/agents/${agent.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: !agent.isActive }),
      });
      if (res.ok) {
        toast.success(agent.isActive ? `${agent.name} deactivated` : `${agent.name} activated`);
        await fetchAgents();
      } else {
        toast.error("Failed to update agent status");
      }
    } catch {
      toast.error("Failed to update agent status");
    } finally {
      setActivatingId(null);
    }
  };

  // ── Run Agent Test ──
  const runAgent = async (agent: Agent) => {
    setRunningAgentId(agent.id);
    try {
      const res = await fetch("/api/agents/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          agentId: agent.id,
          task: `Quick test: Say hello and confirm you are ${agent.name}`,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        toast.success(`${agent.name} test started (run: ${data.id || "pending"})`);
      } else {
        const data = await res.json();
        toast.error(data.error || `Failed to run ${agent.name}`);
      }
    } catch {
      toast.error(`Failed to run ${agent.name}`);
    } finally {
      setRunningAgentId(null);
    }
  };

  // ── Category Stats ──
  const categoryStats = agents.reduce<Record<string, number>>((acc, agent) => {
    const cat = categorizeAgent(agent);
    acc[cat] = (acc[cat] || 0) + 1;
    return acc;
  }, {});

  // ═══════════════════════════════════════════════════════════════════════════
  // RENDER
  // ═══════════════════════════════════════════════════════════════════════════

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-5xl max-h-[92vh] overflow-hidden flex flex-col" showCloseButton>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <div className="flex items-center justify-center h-8 w-8 rounded-lg bg-gradient-to-br from-amber-500/20 to-rose-500/20 border border-amber-500/30">
              <Bot className="h-4 w-4 text-amber-400" />
            </div>
            Prebuilt Agents
            <Badge variant="secondary" className="h-5 text-[10px] ml-1">
              {activeCount}/{totalCount} Active
            </Badge>
          </DialogTitle>
          <DialogDescription>
            Browse, activate, and test all preconfigured AI agents for your workspace
          </DialogDescription>
        </DialogHeader>

        {/* Action Buttons */}
        <div className="flex items-center gap-2 shrink-0 pb-1">
          <Button
            size="sm"
            onClick={seedAllAgents}
            disabled={seeding || systemSeeding}
            className="h-8 text-xs gap-1.5 bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-500 hover:to-orange-500 border-0"
          >
            {seeding ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Zap className="h-3.5 w-3.5" />
            )}
            Seed All Agents
          </Button>
          <Button
            size="sm"
            onClick={seedFullSystem}
            disabled={seeding || systemSeeding}
            className="h-8 text-xs gap-1.5 bg-gradient-to-r from-violet-600 to-fuchsia-600 hover:from-violet-500 hover:to-fuchsia-500 border-0"
          >
            {systemSeeding ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Rocket className="h-3.5 w-3.5" />
            )}
            Seed Full System
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={fetchAgents}
            disabled={loading}
            className="h-8 text-xs gap-1.5 ml-auto"
          >
            <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} />
            Refresh
          </Button>
        </div>

        {/* Filter Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col min-h-0">
          <TabsList className="grid w-full grid-cols-6 mb-1 shrink-0">
            <TabsTrigger value="all" className="gap-1 text-xs">
              <LayoutGrid className="h-3 w-3" />
              All
              <Badge variant="secondary" className="h-4 text-[9px] px-1 ml-0.5">{totalCount}</Badge>
            </TabsTrigger>
            <TabsTrigger value="Development" className="gap-1 text-xs">
              <Code className="h-3 w-3" />
              Dev
              <Badge variant="secondary" className="h-4 text-[9px] px-1 ml-0.5">{categoryStats["Development"] || 0}</Badge>
            </TabsTrigger>
            <TabsTrigger value="Security" className="gap-1 text-xs">
              <Shield className="h-3 w-3" />
              Security
              <Badge variant="secondary" className="h-4 text-[9px] px-1 ml-0.5">{categoryStats["Security"] || 0}</Badge>
            </TabsTrigger>
            <TabsTrigger value="Operations" className="gap-1 text-xs">
              <Activity className="h-3 w-3" />
              Ops
              <Badge variant="secondary" className="h-4 text-[9px] px-1 ml-0.5">{categoryStats["Operations"] || 0}</Badge>
            </TabsTrigger>
            <TabsTrigger value="Business" className="gap-1 text-xs">
              <Briefcase className="h-3 w-3" />
              Business
              <Badge variant="secondary" className="h-4 text-[9px] px-1 ml-0.5">{categoryStats["Business"] || 0}</Badge>
            </TabsTrigger>
            <TabsTrigger value="Data" className="gap-1 text-xs">
              <BarChart3 className="h-3 w-3" />
              Data
              <Badge variant="secondary" className="h-4 text-[9px] px-1 ml-0.5">{categoryStats["Data"] || 0}</Badge>
            </TabsTrigger>
          </TabsList>

          {/* All tabs share the same content, just different filters */}
          {["all", "Development", "Security", "Operations", "Business", "Data"].map((tab) => (
            <TabsContent key={tab} value={tab} className="flex-1 min-h-0 mt-0 overflow-y-auto">
              <ScrollArea className="h-[calc(90vh-260px)]">
                <div className="p-1 pr-4">
                  {loading && agents.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
                      <Loader2 className="h-10 w-10 mb-4 animate-spin opacity-30" />
                      <p className="text-sm font-medium">Loading agents...</p>
                    </div>
                  ) : filteredAgents.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
                      <Bot className="h-12 w-12 mb-4 opacity-20" />
                      <p className="text-sm font-medium">
                        {tab === "all" ? "No agents found" : `No ${tab} agents found`}
                      </p>
                      <p className="text-xs mt-1 mb-4">Click &quot;Seed All Agents&quot; to populate prebuilt agents</p>
                      <Button
                        size="sm"
                        onClick={seedAllAgents}
                        disabled={seeding}
                        className="h-8 text-xs gap-1.5 bg-gradient-to-r from-amber-600 to-orange-600 border-0"
                      >
                        <Zap className="h-3.5 w-3.5" />
                        Seed Agents
                      </Button>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                      {filteredAgents.map((agent) => {
                        const skills = parseSkills(agent.skills);
                        const category = categorizeAgent(agent);
                        const isActivating = activatingId === agent.id;
                        const isRunning = runningAgentId === agent.id;

                        return (
                          <div
                            key={agent.id}
                            className={cn(
                              "group relative rounded-xl border p-4 transition-all duration-300",
                              "hover:shadow-[0_0_20px_rgba(245,158,11,0.08)] hover:border-amber-500/30",
                              "hover:-translate-y-0.5",
                              agent.isActive
                                ? "bg-gradient-to-br from-card to-emerald-500/5 border-emerald-500/20"
                                : "bg-card border-border opacity-70 hover:opacity-100"
                            )}
                          >
                            {/* Glow effect on hover */}
                            <div className="absolute inset-0 rounded-xl bg-gradient-to-br from-amber-500/5 to-rose-500/5 opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none" />

                            {/* Top: Avatar + Name + Status */}
                            <div className="relative flex items-start gap-3 mb-3">
                              <div className={cn(
                                "flex items-center justify-center h-12 w-12 rounded-xl text-2xl shrink-0 border",
                                "bg-gradient-to-br",
                                agent.isActive
                                  ? getCategoryColor(category)
                                  : "from-zinc-500/10 to-zinc-500/10 border-zinc-500/20"
                              )}>
                                {agent.avatar || "🤖"}
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2">
                                  <h4 className="text-sm font-semibold truncate">{agent.name}</h4>
                                  {/* Active indicator */}
                                  <div className={cn(
                                    "h-2 w-2 rounded-full shrink-0",
                                    agent.isActive
                                      ? "bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.5)]"
                                      : "bg-zinc-600"
                                  )} />
                                </div>
                                <p className="text-[11px] text-muted-foreground truncate mt-0.5">
                                  {agent.role}
                                </p>
                                {/* Category badge */}
                                <Badge className={cn(
                                  "h-4 text-[9px] mt-1 border gap-0.5 px-1.5",
                                  agent.isActive ? getCategoryBadgeColor(category) : "bg-zinc-500/10 text-zinc-500 border-zinc-500/20"
                                )}>
                                  {getCategoryIcon(category)}
                                  {category}
                                </Badge>
                              </div>
                            </div>

                            {/* Skills tags */}
                            {skills.length > 0 && (
                              <div className="flex flex-wrap gap-1 mb-3">
                                {skills.slice(0, 5).map((skill) => (
                                  <Badge
                                    key={skill}
                                    className={cn(
                                      "h-4 text-[8px] border px-1.5 font-mono",
                                      agent.isActive ? getSkillBadgeColor(skill) : "bg-zinc-500/10 text-zinc-500 border-zinc-500/20"
                                    )}
                                  >
                                    {skill}
                                  </Badge>
                                ))}
                                {skills.length > 5 && (
                                  <Badge className="h-4 text-[8px] bg-zinc-500/10 text-zinc-400 border-zinc-500/20 px-1.5">
                                    +{skills.length - 5}
                                  </Badge>
                                )}
                              </div>
                            )}

                            {/* Action buttons */}
                            <div className="flex items-center gap-2 mt-auto">
                              {/* Activate / Deactivate */}
                              <Button
                                size="sm"
                                variant={agent.isActive ? "outline" : "default"}
                                onClick={() => toggleAgent(agent)}
                                disabled={isActivating}
                                className={cn(
                                  "h-7 text-[10px] gap-1 flex-1",
                                  !agent.isActive && "bg-gradient-to-r from-emerald-600 to-cyan-600 hover:from-emerald-500 hover:to-cyan-500 border-0"
                                )}
                              >
                                {isActivating ? (
                                  <Loader2 className="h-3 w-3 animate-spin" />
                                ) : agent.isActive ? (
                                  <>
                                    <PowerOff className="h-3 w-3" />
                                    Deactivate
                                  </>
                                ) : (
                                  <>
                                    <Power className="h-3 w-3" />
                                    Activate
                                  </>
                                )}
                              </Button>

                              {/* Run Test */}
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => runAgent(agent)}
                                disabled={isRunning || !agent.isActive}
                                className="h-7 text-[10px] gap-1"
                              >
                                {isRunning ? (
                                  <Loader2 className="h-3 w-3 animate-spin" />
                                ) : (
                                  <Play className="h-3 w-3" />
                                )}
                                Run
                              </Button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </ScrollArea>
            </TabsContent>
          ))}
        </Tabs>

        {/* Footer Stats */}
        <div className="shrink-0 border-t pt-3 flex items-center justify-between gap-4 text-[11px] text-muted-foreground">
          <div className="flex items-center gap-4">
            <span className="flex items-center gap-1">
              <div className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
              {activeCount} active
            </span>
            <span className="flex items-center gap-1">
              <div className="h-1.5 w-1.5 rounded-full bg-zinc-500" />
              {totalCount - activeCount} inactive
            </span>
          </div>
          <span className="flex items-center gap-1">
            <Filter className="h-3 w-3" />
            Showing {filteredAgents.length} of {totalCount}
          </span>
        </div>
      </DialogContent>
    </Dialog>
  );
}
