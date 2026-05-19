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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
  Rocket,
  Plus,
  Trash2,
  Globe,
  Server,
  Container,
  Cloud,
  Layout,
  Play,
  Loader2,
  CheckCircle2,
  XCircle,
  Clock,
  ArrowLeftRight,
  FileText,
  Terminal,
  AlertTriangle,
  Activity,
  RotateCcw,
  Eye,
  Copy,
  BarChart3,
  Zap,
  Shield,
  Github,
  RefreshCw,
} from "lucide-react";

// ─── Types ───────────────────────────────────────────────────────────────────

interface DeployEnv {
  id: string;
  name: string;
  projectPath: string;
  type: string; // "docker" | "serverless" | "vps" | "static"
  config: string; // JSON
  lastDeploy: string | null;
  deployCount: number;
  status: string; // "idle" | "deploying" | "running" | "failed"
  createdAt: string;
  updatedAt: string;
}

interface DeployLog {
  timestamp: string;
  level: string;
  message: string;
}

interface DeployPipelinePanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function envTypeColor(type: string) {
  switch (type) {
    case "docker":
      return "bg-blue-500/15 text-blue-400 border-blue-500/30";
    case "serverless":
      return "bg-violet-500/15 text-violet-400 border-violet-500/30";
    case "vps":
      return "bg-orange-500/15 text-orange-400 border-orange-500/30";
    case "static":
      return "bg-emerald-500/15 text-emerald-400 border-emerald-500/30";
    default:
      return "bg-zinc-500/15 text-zinc-400 border-zinc-500/30";
  }
}

function envTypeIcon(type: string) {
  switch (type) {
    case "docker":
      return <Container className="h-3.5 w-3.5" />;
    case "serverless":
      return <Cloud className="h-3.5 w-3.5" />;
    case "vps":
      return <Server className="h-3.5 w-3.5" />;
    case "static":
      return <Layout className="h-3.5 w-3.5" />;
    default:
      return <Globe className="h-3.5 w-3.5" />;
  }
}

function envNameColor(name: string) {
  const lower = name.toLowerCase();
  if (lower.includes("prod")) return "bg-red-500/15 text-red-400 border-red-500/30";
  if (lower.includes("staging")) return "bg-yellow-500/15 text-yellow-400 border-yellow-500/30";
  if (lower.includes("dev")) return "bg-emerald-500/15 text-emerald-400 border-emerald-500/30";
  return "bg-zinc-500/15 text-zinc-400 border-zinc-500/30";
}

function deployStatusColor(status: string) {
  switch (status) {
    case "idle":
      return "bg-zinc-500/15 text-zinc-400 border-zinc-500/30";
    case "deploying":
      return "bg-blue-500/15 text-blue-400 border-blue-500/30";
    case "running":
      return "bg-emerald-500/15 text-emerald-400 border-emerald-500/30";
    case "failed":
      return "bg-red-500/15 text-red-400 border-red-500/30";
    default:
      return "bg-zinc-500/15 text-zinc-400 border-zinc-500/30";
  }
}

function logLevelColor(level: string) {
  switch (level) {
    case "error":
      return "text-red-400";
    case "warn":
      return "text-yellow-400";
    case "info":
      return "text-cyan-400";
    default:
      return "text-zinc-400";
  }
}

function formatTimestamp(ts: string): string {
  try {
    const d = new Date(ts);
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  } catch {
    return ts;
  }
}

function formatDate(ts: string | null): string {
  if (!ts) return "Never";
  try {
    const d = new Date(ts);
    return d.toLocaleDateString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
  } catch {
    return ts;
  }
}

// ─── Component ───────────────────────────────────────────────────────────────

export function DeployPipelinePanel({ open, onOpenChange }: DeployPipelinePanelProps) {
  // ── Environments ──
  const [environments, setEnvironments] = useState<DeployEnv[]>([]);
  const [loadingEnvs, setLoadingEnvs] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newEnvName, setNewEnvName] = useState("");
  const [newEnvType, setNewEnvType] = useState("docker");
  const [newEnvPath, setNewEnvPath] = useState("");
  const [newEnvConfig, setNewEnvConfig] = useState("{}");
  const [savingEnv, setSavingEnv] = useState(false);

  // ── Deploy ──
  const [deployEnvId, setDeployEnvId] = useState<string>("");
  const [deploying, setDeploying] = useState(false);
  const [deployProgress, setDeployProgress] = useState(0);
  const [deployStatus, setDeployStatus] = useState<string | null>(null);

  // ── CI/CD ──
  const [cicdTab, setCicdTab] = useState<"actions" | "dockerfile" | "test" | "script">("actions");
  const [cicdGenerating, setCicdGenerating] = useState(false);
  const [cicdContent, setCicdContent] = useState<string | null>(null);

  // ── Monitoring ──
  const [monitorEnvId, setMonitorEnvId] = useState<string>("");
  const [logs, setLogs] = useState<DeployLog[]>([]);
  const [logsLoading, setLogsLoading] = useState(false);
  const [errors, setErrors] = useState<{ message: string; timestamp: string; count: number }[]>([]);
  const [metrics, setMetrics] = useState<{ label: string; value: number; max: number; color: string }[]>([]);

  // ── Active Tab ──
  const [activeTab, setActiveTab] = useState("environments");

  // ── Fetch Environments ──
  const fetchEnvironments = useCallback(async () => {
    setLoadingEnvs(true);
    try {
      const res = await fetch("/api/deploy/environments");
      if (res.ok) {
        const data = await res.json();
        setEnvironments(data);
      }
    } catch {
      // silently fail
    } finally {
      setLoadingEnvs(false);
    }
  }, []);

  // ── Init ──
  useEffect(() => {
    if (!open) return;
    fetchEnvironments();
  }, [open, fetchEnvironments]);

  // ── Set default env IDs when environments load ──
  useEffect(() => {
    if (environments.length > 0) {
      if (!deployEnvId) setDeployEnvId(environments[0].id);
      if (!monitorEnvId) setMonitorEnvId(environments[0].id);
    }
  }, [environments, deployEnvId, monitorEnvId]);

  // ── Add Environment ──
  const addEnvironment = async () => {
    if (!newEnvName.trim()) {
      toast.error("Environment name is required");
      return;
    }
    if (!newEnvPath.trim()) {
      toast.error("Project path is required");
      return;
    }
    // Validate JSON config
    try {
      JSON.parse(newEnvConfig);
    } catch {
      toast.error("Config must be valid JSON");
      return;
    }
    setSavingEnv(true);
    try {
      const res = await fetch("/api/deploy/environments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newEnvName.trim(),
          type: newEnvType,
          projectPath: newEnvPath.trim(),
          config: newEnvConfig,
          status: "idle",
        }),
      });
      if (res.ok) {
        toast.success("Environment created");
        setNewEnvName("");
        setNewEnvType("docker");
        setNewEnvPath("");
        setNewEnvConfig("{}");
        setShowAddForm(false);
        await fetchEnvironments();
      } else {
        const data = await res.json();
        toast.error(data.error || "Failed to create environment");
      }
    } catch {
      toast.error("Failed to create environment");
    } finally {
      setSavingEnv(false);
    }
  };

  // ── Delete Environment ──
  const deleteEnvironment = async (id: string) => {
    try {
      const res = await fetch(`/api/deploy/environments/${id}`, { method: "DELETE" });
      if (res.ok) {
        toast.success("Environment deleted");
        await fetchEnvironments();
      } else {
        toast.error("Failed to delete environment");
      }
    } catch {
      toast.error("Failed to delete environment");
    }
  };

  // ── Deploy ──
  const deployNow = async () => {
    if (!deployEnvId) {
      toast.error("Select an environment");
      return;
    }
    setDeploying(true);
    setDeployProgress(0);
    setDeployStatus("deploying");
    try {
      const res = await fetch("/api/deploy/deploy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ environmentId: deployEnvId }),
      });
      if (res.ok) {
        // Simulate progress
        const steps = [10, 25, 45, 60, 75, 90, 100];
        for (const step of steps) {
          await new Promise((r) => setTimeout(r, 400));
          setDeployProgress(step);
        }
        setDeployStatus("running");
        toast.success("Deployment successful!");
        await fetchEnvironments();
      } else {
        const data = await res.json();
        setDeployStatus("failed");
        toast.error(data.error || "Deployment failed");
      }
    } catch {
      setDeployStatus("failed");
      toast.error("Deployment failed");
    } finally {
      setDeploying(false);
    }
  };

  // ── Rollback ──
  const rollback = async () => {
    if (!deployEnvId) return;
    setDeploying(true);
    try {
      const res = await fetch("/api/deploy/rollback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ environmentId: deployEnvId }),
      });
      if (res.ok) {
        toast.success("Rollback successful");
        setDeployStatus("idle");
        setDeployProgress(0);
        await fetchEnvironments();
      } else {
        toast.error("Rollback failed");
      }
    } catch {
      toast.error("Rollback failed");
    } finally {
      setDeploying(false);
    }
  };

  // ── Generate CI/CD ──
  const generateCICD = async (type: "actions" | "dockerfile" | "test" | "script") => {
    setCicdTab(type);
    setCicdGenerating(true);
    setCicdContent(null);

    // Simulate AI generation
    await new Promise((r) => setTimeout(r, 1200));

    const env = environments.find((e) => e.id === deployEnvId);
    const envType = env?.type || "docker";
    const envName = env?.name || "production";

    switch (type) {
      case "actions":
        setCicdContent(`name: Deploy to ${envName}

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  build-and-deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'

      - name: Install dependencies
        run: npm ci

      - name: Run linter
        run: npm run lint

      - name: Run tests
        run: npm test

      - name: Build
        run: npm run build

      - name: Deploy to ${envName}
        if: github.ref == 'refs/heads/main'
        run: |
          echo "Deploying to ${envName}..."
          # Add your deployment commands here
        env:
          DEPLOY_KEY: \${{ secrets.DEPLOY_KEY }}`);
        break;

      case "dockerfile":
        setCicdContent(`FROM node:20-alpine AS base

# Install dependencies
FROM base AS deps
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production

# Build
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

# Production
FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs
EXPOSE 3000
ENV PORT=3000

CMD ["node", "server.js"]`);
        break;

      case "test":
        setCicdContent(`#!/bin/bash
# Test script for ${envName} deployment

set -e

echo "🧪 Running test suite..."

# Unit tests
echo "→ Running unit tests..."
npm test -- --coverage --watchAll=false

# Integration tests
echo "→ Running integration tests..."
npm run test:integration --if-present

# Lint check
echo "→ Running linter..."
npm run lint

# Type check
echo "→ Running type check..."
npx tsc --noEmit

# Build test
echo "→ Testing build..."
npm run build

echo "✅ All tests passed!"`);
        break;

      case "script":
        setCicdContent(`#!/bin/bash
# Deploy script for ${envName} (${envType})
# Generated by ClawHub AI

set -e

ENV="${envName}"
TYPE="${envType}"
PROJECT_PATH="${env?.projectPath || "/app"}"

echo "🚀 Deploying to $ENV ($TYPE)..."

case $TYPE in
  docker)
    echo "→ Building Docker image..."
    docker build -t clawhub-app:$ENV .
    echo "→ Stopping old container..."
    docker stop clawhub-$ENV 2>/dev/null || true
    docker rm clawhub-$ENV 2>/dev/null || true
    echo "→ Starting new container..."
    docker run -d \\
      --name clawhub-$ENV \\
      --restart unless-stopped \\
      -p 3000:3000 \\
      -e NODE_ENV=production \\
      clawhub-app:$ENV
    ;;
  serverless)
    echo "→ Deploying to serverless..."
    npx serverless deploy --stage $ENV
    ;;
  vps)
    echo "→ Deploying to VPS..."
    ssh user@server "cd $PROJECT_PATH && git pull && npm ci && npm run build && pm2 restart clawhub"
    ;;
  static)
    echo "→ Building static export..."
    npm run build
    echo "→ Uploading to CDN..."
    npx vercel --prod
    ;;
esac

echo "✅ Deployment to $ENV complete!"`);
        break;
    }
    setCicdGenerating(false);
    toast.success(`${type === "actions" ? "GitHub Actions workflow" : type === "dockerfile" ? "Dockerfile" : type === "test" ? "Test script" : "Deploy script"} generated`);
  };

  // ── Load Logs ──
  const loadLogs = async () => {
    if (!monitorEnvId) {
      toast.error("Select an environment");
      return;
    }
    setLogsLoading(true);
    try {
      const res = await fetch(`/api/deploy/logs?environmentId=${monitorEnvId}`);
      if (res.ok) {
        const data = await res.json();
        setLogs(data.logs || []);
        // Generate mock errors
        setErrors([
          { message: "Connection timeout on /api/health", timestamp: new Date().toISOString(), count: 3 },
          { message: "Memory usage exceeded 85% threshold", timestamp: new Date().toISOString(), count: 1 },
        ]);
        // Generate mock metrics
        setMetrics([
          { label: "CPU Usage", value: 45, max: 100, color: "bg-emerald-500" },
          { label: "Memory", value: 72, max: 100, color: "bg-yellow-500" },
          { label: "Disk I/O", value: 28, max: 100, color: "bg-cyan-500" },
          { label: "Network", value: 61, max: 100, color: "bg-violet-500" },
          { label: "Request/sec", value: 340, max: 500, color: "bg-blue-500" },
          { label: "Error Rate", value: 2, max: 100, color: "bg-red-500" },
        ]);
        toast.success("Logs loaded");
      } else {
        toast.error("Failed to load logs");
      }
    } catch {
      toast.error("Failed to load logs");
    } finally {
      setLogsLoading(false);
    }
  };

  // ── Copy to Clipboard ──
  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success("Copied to clipboard");
  };

  // ── Get selected environment for deploy tab ──
  const selectedEnv = environments.find((e) => e.id === deployEnvId);

  // ═══════════════════════════════════════════════════════════════════════════
  // RENDER
  // ═══════════════════════════════════════════════════════════════════════════

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-5xl max-h-[90vh] overflow-hidden flex flex-col" showCloseButton>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <div className="flex items-center justify-center h-8 w-8 rounded-lg bg-gradient-to-br from-orange-500/20 to-rose-500/20 border border-orange-500/30">
              <Rocket className="h-4 w-4 text-orange-400" />
            </div>
            One-Click Deploy Pipeline
          </DialogTitle>
          <DialogDescription>
            Manage environments, deploy with one click, generate CI/CD configs, and monitor deployments
          </DialogDescription>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col min-h-0">
          <TabsList className="grid w-full grid-cols-4 mb-1 shrink-0">
            <TabsTrigger value="environments" className="gap-1.5 text-xs">
              <Globe className="h-3.5 w-3.5" />
              Environments
            </TabsTrigger>
            <TabsTrigger value="deploy" className="gap-1.5 text-xs">
              <Rocket className="h-3.5 w-3.5" />
              Deploy
            </TabsTrigger>
            <TabsTrigger value="cicd" className="gap-1.5 text-xs">
              <Github className="h-3.5 w-3.5" />
              CI/CD
            </TabsTrigger>
            <TabsTrigger value="monitoring" className="gap-1.5 text-xs">
              <Activity className="h-3.5 w-3.5" />
              Monitoring
            </TabsTrigger>
          </TabsList>

          {/* ═══ ENVIRONMENTS TAB ═══ */}
          <TabsContent value="environments" className="flex-1 min-h-0 mt-0">
            <ScrollArea className="h-[calc(90vh-200px)]">
              <div className="space-y-4 p-1 pr-4">
                {/* Add Environment Button */}
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-semibold flex items-center gap-2">
                    <Globe className="h-4 w-4 text-orange-400" />
                    Environments
                    {environments.length > 0 && (
                      <Badge variant="secondary" className="h-5 text-[10px]">
                        {environments.length}
                      </Badge>
                    )}
                  </h4>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setShowAddForm(!showAddForm)}
                    className="h-7 text-xs gap-1"
                  >
                    <Plus className="h-3 w-3" />
                    Add Environment
                  </Button>
                </div>

                {/* Add Environment Form */}
                {showAddForm && (
                  <div className="rounded-xl border bg-card p-5 space-y-4">
                    <h5 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                      New Environment
                    </h5>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div className="space-y-1.5">
                        <Label className="text-xs font-medium">Name</Label>
                        <Input
                          value={newEnvName}
                          onChange={(e) => setNewEnvName(e.target.value)}
                          placeholder="e.g., staging"
                          className="h-9"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-xs font-medium">Type</Label>
                        <Select value={newEnvType} onValueChange={setNewEnvType}>
                          <SelectTrigger className="h-9">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="docker">
                              <span className="flex items-center gap-1.5"><Container className="h-3 w-3" /> Docker</span>
                            </SelectItem>
                            <SelectItem value="serverless">
                              <span className="flex items-center gap-1.5"><Cloud className="h-3 w-3" /> Serverless</span>
                            </SelectItem>
                            <SelectItem value="vps">
                              <span className="flex items-center gap-1.5"><Server className="h-3 w-3" /> VPS</span>
                            </SelectItem>
                            <SelectItem value="static">
                              <span className="flex items-center gap-1.5"><Layout className="h-3 w-3" /> Static</span>
                            </SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-xs font-medium">Project Path</Label>
                        <Input
                          value={newEnvPath}
                          onChange={(e) => setNewEnvPath(e.target.value)}
                          placeholder="/home/user/my-project"
                          className="h-9 font-mono text-xs"
                        />
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs font-medium flex items-center gap-1.5">
                        Config (JSON)
                      </Label>
                      <Textarea
                        value={newEnvConfig}
                        onChange={(e) => setNewEnvConfig(e.target.value)}
                        placeholder='{"region": "us-east-1", "port": 3000}'
                        className="min-h-[60px] resize-none font-mono text-xs"
                      />
                    </div>
                    <div className="flex items-center justify-end gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setShowAddForm(false);
                          setNewEnvName("");
                          setNewEnvType("docker");
                          setNewEnvPath("");
                          setNewEnvConfig("{}");
                        }}
                        className="h-8 text-xs"
                      >
                        Cancel
                      </Button>
                      <Button
                        size="sm"
                        onClick={addEnvironment}
                        disabled={savingEnv || !newEnvName.trim() || !newEnvPath.trim()}
                        className="h-8 text-xs gap-1.5 min-w-[120px]"
                      >
                        {savingEnv ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Plus className="h-3.5 w-3.5" />
                        )}
                        Create
                      </Button>
                    </div>
                  </div>
                )}

                {/* Environments List */}
                {loadingEnvs ? (
                  <div className="flex items-center justify-center py-12">
                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                  </div>
                ) : environments.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-12 text-muted-foreground border border-dashed rounded-lg">
                    <Globe className="h-10 w-10 mb-3 opacity-30" />
                    <p className="text-sm font-medium">No environments yet</p>
                    <p className="text-xs mt-1">Add a deployment environment to get started</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {environments.map((env) => (
                      <div
                        key={env.id}
                        className="rounded-lg border bg-card p-4 transition-all hover:bg-card/80"
                      >
                        <div className="flex items-center justify-between gap-3">
                          <div className="flex items-center gap-3 min-w-0 flex-1">
                            <div className="flex items-center justify-center h-9 w-9 rounded-lg bg-muted shrink-0">
                              {envTypeIcon(env.type)}
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2">
                                <span className="font-medium text-sm">{env.name}</span>
                                <Badge className={cn("h-5 text-[10px] border", envNameColor(env.name))}>
                                  {env.name.toLowerCase().includes("prod") ? "PRODUCTION" : env.name.toLowerCase().includes("staging") ? "STAGING" : "DEVELOPMENT"}
                                </Badge>
                                <Badge className={cn("h-5 text-[10px] border", envTypeColor(env.type))}>
                                  {env.type.toUpperCase()}
                                </Badge>
                                <Badge className={cn("h-5 text-[10px] border", deployStatusColor(env.status))}>
                                  {env.status === "deploying" && <Loader2 className="h-2.5 w-2.5 mr-0.5 animate-spin" />}
                                  {env.status === "running" && <CheckCircle2 className="h-2.5 w-2.5 mr-0.5" />}
                                  {env.status === "failed" && <XCircle className="h-2.5 w-2.5 mr-0.5" />}
                                  {env.status.toUpperCase()}
                                </Badge>
                              </div>
                              <div className="flex items-center gap-3 mt-0.5 text-xs text-muted-foreground">
                                <span className="font-mono">{env.projectPath}</span>
                                <span className="flex items-center gap-1">
                                  <Rocket className="h-3 w-3" />
                                  {env.deployCount} deploys
                                </span>
                                <span className="flex items-center gap-1">
                                  <Clock className="h-3 w-3" />
                                  {formatDate(env.lastDeploy)}
                                </span>
                              </div>
                            </div>
                          </div>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-destructive hover:text-destructive shrink-0"
                            onClick={() => deleteEnvironment(env.id)}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </ScrollArea>
          </TabsContent>

          {/* ═══ DEPLOY TAB ═══ */}
          <TabsContent value="deploy" className="flex-1 min-h-0 mt-0">
            <ScrollArea className="h-[calc(90vh-200px)]">
              <div className="space-y-4 p-1 pr-4">
                {/* Select Environment */}
                <div className="rounded-xl border bg-card p-4">
                  <div className="space-y-1.5">
                    <Label className="text-xs font-medium">Select Environment</Label>
                    <Select value={deployEnvId} onValueChange={(v) => { setDeployEnvId(v); setDeployStatus(null); setDeployProgress(0); }}>
                      <SelectTrigger className="h-9">
                        <SelectValue placeholder="Select environment..." />
                      </SelectTrigger>
                      <SelectContent>
                        {environments.map((e) => (
                          <SelectItem key={e.id} value={e.id}>
                            <span className="flex items-center gap-1.5">
                              {envTypeIcon(e.type)}
                              {e.name}
                              <span className="text-muted-foreground">({e.type})</span>
                            </span>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {/* Deploy Panel */}
                {selectedEnv ? (
                  <div className="rounded-xl border bg-card p-5 space-y-5">
                    {/* Environment Info */}
                    <div className="flex items-center gap-4">
                      <div className="flex items-center justify-center h-12 w-12 rounded-xl bg-gradient-to-br from-orange-500/20 to-rose-500/20 border border-orange-500/30">
                        {envTypeIcon(selectedEnv.type)}
                      </div>
                      <div>
                        <h3 className="font-semibold text-sm">{selectedEnv.name}</h3>
                        <div className="flex items-center gap-2 mt-0.5">
                          <Badge className={cn("h-5 text-[10px] border", envTypeColor(selectedEnv.type))}>
                            {selectedEnv.type.toUpperCase()}
                          </Badge>
                          <Badge className={cn("h-5 text-[10px] border", deployStatusColor(selectedEnv.status))}>
                            {selectedEnv.status.toUpperCase()}
                          </Badge>
                        </div>
                      </div>
                    </div>

                    <Separator />

                    {/* Deploy Stats */}
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                      <div className="rounded-lg bg-muted/50 p-3">
                        <div className="text-[10px] text-muted-foreground mb-1">Deploy Count</div>
                        <div className="text-xl font-bold">{selectedEnv.deployCount}</div>
                      </div>
                      <div className="rounded-lg bg-muted/50 p-3">
                        <div className="text-[10px] text-muted-foreground mb-1">Last Deploy</div>
                        <div className="text-sm font-medium">{formatDate(selectedEnv.lastDeploy)}</div>
                      </div>
                      <div className="rounded-lg bg-muted/50 p-3">
                        <div className="text-[10px] text-muted-foreground mb-1">Project Path</div>
                        <div className="text-xs font-mono truncate">{selectedEnv.projectPath}</div>
                      </div>
                    </div>

                    {/* Progress Indicator */}
                    {(deploying || deployStatus === "running" || deployStatus === "failed") && (
                      <div className="space-y-2">
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-muted-foreground">
                            {deployStatus === "deploying" && "Deploying..."}
                            {deployStatus === "running" && "Deployment complete!"}
                            {deployStatus === "failed" && "Deployment failed"}
                          </span>
                          <span className="font-mono">{deployProgress}%</span>
                        </div>
                        <div className="h-2 bg-muted rounded-full overflow-hidden">
                          <div
                            className={cn(
                              "h-full rounded-full transition-all duration-500",
                              deployStatus === "failed"
                                ? "bg-red-500"
                                : deployStatus === "running"
                                  ? "bg-emerald-500"
                                  : "bg-blue-500"
                            )}
                            style={{ width: `${deployProgress}%` }}
                          />
                        </div>
                      </div>
                    )}

                    {/* Deploy Actions */}
                    <div className="flex items-center gap-3">
                      <Button
                        onClick={deployNow}
                        disabled={deploying || selectedEnv.status === "deploying"}
                        className="h-10 text-xs gap-1.5 min-w-[160px]"
                      >
                        {deploying ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Rocket className="h-4 w-4" />
                        )}
                        Deploy Now
                      </Button>
                      <Button
                        variant="outline"
                        onClick={rollback}
                        disabled={deploying || selectedEnv.deployCount === 0}
                        className="h-10 text-xs gap-1.5"
                      >
                        <RotateCcw className="h-4 w-4" />
                        Rollback
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center py-12 text-muted-foreground border border-dashed rounded-lg">
                    <Rocket className="h-10 w-10 mb-3 opacity-30" />
                    <p className="text-sm font-medium">No environment selected</p>
                    <p className="text-xs mt-1">Create an environment in the Environments tab first</p>
                  </div>
                )}
              </div>
            </ScrollArea>
          </TabsContent>

          {/* ═══ CI/CD TAB ═══ */}
          <TabsContent value="cicd" className="flex-1 min-h-0 mt-0">
            <ScrollArea className="h-[calc(90vh-200px)]">
              <div className="space-y-4 p-1 pr-4">
                {/* CI/CD Generator Buttons */}
                <div className="rounded-xl border bg-card p-4 space-y-3">
                  <Label className="text-xs font-medium flex items-center gap-1.5">
                    <Zap className="h-3 w-3 text-orange-400" />
                    AI-Generated Configs
                  </Label>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                    <Button
                      variant={cicdTab === "actions" ? "default" : "outline"}
                      size="sm"
                      onClick={() => generateCICD("actions")}
                      disabled={cicdGenerating}
                      className="h-auto py-3 flex-col gap-1.5"
                    >
                      <Github className="h-5 w-5" />
                      <span className="text-[10px]">GitHub Actions</span>
                    </Button>
                    <Button
                      variant={cicdTab === "dockerfile" ? "default" : "outline"}
                      size="sm"
                      onClick={() => generateCICD("dockerfile")}
                      disabled={cicdGenerating}
                      className="h-auto py-3 flex-col gap-1.5"
                    >
                      <Container className="h-5 w-5" />
                      <span className="text-[10px]">Dockerfile</span>
                    </Button>
                    <Button
                      variant={cicdTab === "test" ? "default" : "outline"}
                      size="sm"
                      onClick={() => generateCICD("test")}
                      disabled={cicdGenerating}
                      className="h-auto py-3 flex-col gap-1.5"
                    >
                      <Shield className="h-5 w-5" />
                      <span className="text-[10px]">Test Script</span>
                    </Button>
                    <Button
                      variant={cicdTab === "script" ? "default" : "outline"}
                      size="sm"
                      onClick={() => generateCICD("script")}
                      disabled={cicdGenerating}
                      className="h-auto py-3 flex-col gap-1.5"
                    >
                      <Terminal className="h-5 w-5" />
                      <span className="text-[10px]">Deploy Script</span>
                    </Button>
                  </div>
                </div>

                {/* Generated Content */}
                {cicdGenerating ? (
                  <div className="flex flex-col items-center justify-center py-12">
                    <Loader2 className="h-8 w-8 animate-spin text-orange-400 mb-3" />
                    <p className="text-sm text-muted-foreground">Generating {cicdTab === "actions" ? "GitHub Actions workflow" : cicdTab === "dockerfile" ? "Dockerfile" : cicdTab === "test" ? "test script" : "deploy script"}...</p>
                  </div>
                ) : cicdContent ? (
                  <div className="rounded-xl border bg-card p-5 space-y-3">
                    <div className="flex items-center justify-between">
                      <h4 className="text-sm font-semibold flex items-center gap-2">
                        <FileText className="h-4 w-4 text-emerald-400" />
                        {cicdTab === "actions" && "GitHub Actions Workflow"}
                        {cicdTab === "dockerfile" && "Dockerfile"}
                        {cicdTab === "test" && "Test Script"}
                        {cicdTab === "script" && "Deploy Script"}
                      </h4>
                      <div className="flex items-center gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => generateCICD(cicdTab)}
                          className="h-7 text-xs gap-1"
                        >
                          <RefreshCw className="h-3 w-3" />
                          Regenerate
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          onClick={() => copyToClipboard(cicdContent)}
                        >
                          <Copy className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>
                    <div className="rounded-md bg-zinc-950 text-emerald-400 p-4 font-mono text-xs overflow-x-auto whitespace-pre-wrap max-h-96 overflow-y-auto">
                      {cicdContent}
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center py-12 text-muted-foreground border border-dashed rounded-lg">
                    <FileText className="h-10 w-10 mb-3 opacity-30" />
                    <p className="text-sm font-medium">No config generated yet</p>
                    <p className="text-xs mt-1">Click one of the generators above to create CI/CD configs</p>
                  </div>
                )}
              </div>
            </ScrollArea>
          </TabsContent>

          {/* ═══ MONITORING TAB ═══ */}
          <TabsContent value="monitoring" className="flex-1 min-h-0 mt-0">
            <ScrollArea className="h-[calc(90vh-200px)]">
              <div className="space-y-4 p-1 pr-4">
                {/* Monitor Controls */}
                <div className="rounded-xl border bg-card p-4">
                  <div className="flex items-center gap-4 flex-wrap">
                    <div className="space-y-1.5 flex-1 min-w-[200px]">
                      <Label className="text-xs font-medium">Environment</Label>
                      <Select value={monitorEnvId} onValueChange={setMonitorEnvId}>
                        <SelectTrigger className="h-9">
                          <SelectValue placeholder="Select environment..." />
                        </SelectTrigger>
                        <SelectContent>
                          {environments.map((e) => (
                            <SelectItem key={e.id} value={e.id}>
                              <span className="flex items-center gap-1.5">
                                {envTypeIcon(e.type)}
                                {e.name}
                              </span>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <Button
                      onClick={loadLogs}
                      disabled={logsLoading}
                      className="h-9 text-xs gap-1.5 mt-5"
                    >
                      {logsLoading ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Activity className="h-3.5 w-3.5" />
                      )}
                      Load Logs
                    </Button>
                  </div>
                </div>

                {logs.length > 0 || metrics.length > 0 ? (
                  <>
                    {/* Performance Metrics */}
                    {metrics.length > 0 && (
                      <div className="rounded-xl border bg-card p-5 space-y-4">
                        <h4 className="text-sm font-semibold flex items-center gap-2">
                          <BarChart3 className="h-4 w-4 text-orange-400" />
                          Performance Metrics
                        </h4>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                          {metrics.map((metric) => (
                            <div key={metric.label} className="space-y-1.5">
                              <div className="flex items-center justify-between text-xs">
                                <span className="font-medium">{metric.label}</span>
                                <span className="font-mono text-muted-foreground">
                                  {metric.label === "Request/sec" ? metric.value : `${metric.value}%`}
                                </span>
                              </div>
                              <div className="h-2.5 bg-muted rounded-full overflow-hidden">
                                <div
                                  className={cn("h-full rounded-full transition-all duration-700", metric.color)}
                                  style={{
                                    width: `${Math.min(100, (metric.value / metric.max) * 100)}%`,
                                  }}
                                />
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Error Tracking */}
                    {errors.length > 0 && (
                      <div className="rounded-xl border bg-card p-5 space-y-3">
                        <h4 className="text-sm font-semibold flex items-center gap-2">
                          <AlertTriangle className="h-4 w-4 text-red-400" />
                          Error Tracking
                          <Badge className="h-5 text-[10px] bg-red-500/15 text-red-400 border-red-500/30 border">
                            {errors.length} issues
                          </Badge>
                        </h4>
                        <div className="space-y-2">
                          {errors.map((error, i) => (
                            <div
                              key={i}
                              className="flex items-center justify-between rounded-md border border-red-500/20 bg-red-500/5 p-3"
                            >
                              <div className="flex items-center gap-2 min-w-0 flex-1">
                                <AlertTriangle className="h-4 w-4 text-red-400 shrink-0" />
                                <span className="text-xs text-red-300 truncate">{error.message}</span>
                              </div>
                              <div className="flex items-center gap-2 shrink-0">
                                <Badge variant="secondary" className="h-5 text-[10px]">
                                  ×{error.count}
                                </Badge>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Live Logs */}
                    <div className="rounded-xl border bg-card p-5 space-y-3">
                      <h4 className="text-sm font-semibold flex items-center gap-2">
                        <Terminal className="h-4 w-4 text-cyan-400" />
                        Live Logs
                        <Badge variant="secondary" className="h-5 text-[10px]">
                          {logs.length} entries
                        </Badge>
                      </h4>
                      <div className="rounded-md bg-zinc-950 p-3 max-h-64 overflow-y-auto font-mono text-xs space-y-1">
                        {logs.map((log, i) => (
                          <div key={i} className="flex items-start gap-2">
                            <span className="text-zinc-500 shrink-0">
                              {formatTimestamp(log.timestamp)}
                            </span>
                            <Badge
                              className={cn(
                                "h-4 text-[8px] border shrink-0",
                                log.level === "error"
                                  ? "bg-red-500/15 text-red-400 border-red-500/30"
                                  : log.level === "warn"
                                    ? "bg-yellow-500/15 text-yellow-400 border-yellow-500/30"
                                    : "bg-cyan-500/15 text-cyan-400 border-cyan-500/30"
                              )}
                            >
                              {log.level.toUpperCase()}
                            </Badge>
                            <span className={cn("break-all", logLevelColor(log.level))}>
                              {log.message}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </>
                ) : (
                  <div className="flex flex-col items-center justify-center py-12 text-muted-foreground border border-dashed rounded-lg">
                    <Activity className="h-10 w-10 mb-3 opacity-30" />
                    <p className="text-sm font-medium">No monitoring data</p>
                    <p className="text-xs mt-1">Select an environment and click &quot;Load Logs&quot;</p>
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
