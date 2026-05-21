"use client";

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
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
  GitPullRequest,
  Rocket,
  AlertCircle,
  CheckCircle2,
  Loader2,
  Trash2,
  RotateCcw,
  ArrowRight,
} from "lucide-react";

// ─── Types ───────────────────────────────────────────────────────────────────

type PipelineStatus =
  | "planning"
  | "coding"
  | "testing"
  | "reviewing"
  | "pr_created"
  | "deployed"
  | "failed";

interface PipelineStep {
  id: string;
  title: string;
  description: string;
  status: "pending" | "in_progress" | "completed" | "failed";
  code?: string;
  filePath?: string;
}

interface PipelinePlan {
  summary: string;
  steps: PipelineStep[];
}

interface TestResultItem {
  name: string;
  status: "passed" | "failed" | "skipped";
  duration: number;
  error?: string;
}

interface TestResults {
  summary: {
    total: number;
    passed: number;
    failed: number;
    skipped: number;
    duration: number;
  };
  tests: TestResultItem[];
}

interface Pipeline {
  id: string;
  issueUrl: string | null;
  issueTitle: string;
  issueBody: string | null;
  repoUrl: string | null;
  status: PipelineStatus;
  plan: string | null;
  branchName: string | null;
  prUrl: string | null;
  prNumber: number | null;
  deployUrl: string | null;
  testResults: string | null;
  reviewNotes: string | null;
  iterations: number;
  maxIterations: number;
  createdAt: string;
  updatedAt: string;
}

interface IssuePipelinePanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function statusColor(status: PipelineStatus) {
  switch (status) {
    case "planning":
      return "bg-blue-500/15 text-blue-400 border-blue-500/30";
    case "coding":
      return "bg-purple-500/15 text-purple-400 border-purple-500/30";
    case "testing":
      return "bg-amber-500/15 text-amber-400 border-amber-500/30";
    case "reviewing":
      return "bg-orange-500/15 text-orange-400 border-orange-500/30";
    case "pr_created":
      return "bg-indigo-500/15 text-indigo-400 border-indigo-500/30";
    case "deployed":
      return "bg-emerald-500/15 text-emerald-400 border-emerald-500/30";
    case "failed":
      return "bg-red-500/15 text-red-400 border-red-500/30";
    default:
      return "bg-zinc-500/15 text-zinc-400 border-zinc-500/30";
  }
}

function statusIcon(status: PipelineStatus) {
  switch (status) {
    case "planning":
      return <ArrowRight className="h-3 w-3" />;
    case "coding":
      return <Loader2 className="h-3 w-3 animate-spin" />;
    case "testing":
      return <AlertCircle className="h-3 w-3" />;
    case "reviewing":
      return <GitPullRequest className="h-3 w-3" />;
    case "pr_created":
      return <GitPullRequest className="h-3 w-3" />;
    case "deployed":
      return <CheckCircle2 className="h-3 w-3" />;
    case "failed":
      return <AlertCircle className="h-3 w-3" />;
    default:
      return null;
  }
}

function statusLabel(status: PipelineStatus) {
  switch (status) {
    case "planning":
      return "Planning";
    case "coding":
      return "Coding";
    case "testing":
      return "Testing";
    case "reviewing":
      return "Reviewing";
    case "pr_created":
      return "PR Created";
    case "deployed":
      return "Deployed";
    case "failed":
      return "Failed";
    default:
      return status;
  }
}

function formatDate(ts: string | null): string {
  if (!ts) return "—";
  try {
    const d = new Date(ts);
    return d.toLocaleDateString([], {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return ts;
  }
}

function safeParseJSON<T>(value: string | null | undefined): T | null {
  if (!value) return null;
  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
}

// ─── Phase Indicator ─────────────────────────────────────────────────────────

const PHASES: PipelineStatus[] = [
  "planning",
  "coding",
  "testing",
  "reviewing",
  "pr_created",
  "deployed",
];

function PhaseIndicator({ status }: { status: PipelineStatus }) {
  const currentIndex = PHASES.indexOf(status);
  const isFailed = status === "failed";

  return (
    <div className="flex items-center gap-1">
      {PHASES.map((phase, i) => {
        const isCompleted = !isFailed && currentIndex > i;
        const isCurrent = !isFailed && currentIndex === i;
        const isFuture = !isFailed && currentIndex < i;

        return (
          <div key={phase} className="flex items-center gap-1">
            <div
              className={cn(
                "flex items-center justify-center h-6 w-6 rounded-full text-[10px] font-bold border transition-all",
                isCompleted &&
                  "bg-emerald-500/20 text-emerald-400 border-emerald-500/40",
                isCurrent &&
                  "bg-blue-500/20 text-blue-400 border-blue-500/40 ring-2 ring-blue-500/30",
                isFuture && "bg-zinc-800 text-zinc-500 border-zinc-700",
                isFailed &&
                  i === 0 &&
                  "bg-red-500/20 text-red-400 border-red-500/40"
              )}
            >
              {isCompleted ? (
                <CheckCircle2 className="h-3 w-3" />
              ) : (
                i + 1
              )}
            </div>
            {i < PHASES.length - 1 && (
              <div
                className={cn(
                  "h-px w-3",
                  isCompleted ? "bg-emerald-500/40" : "bg-zinc-700"
                )}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── Component ───────────────────────────────────────────────────────────────

export function IssuePipelinePanel({
  open,
  onOpenChange,
}: IssuePipelinePanelProps) {
  // ── Pipelines list ──
  const [pipelines, setPipelines] = useState<Pipeline[]>([]);
  const [loadingPipelines, setLoadingPipelines] = useState(false);

  // ── New pipeline form ──
  const [issueUrl, setIssueUrl] = useState("");
  const [issueTitle, setIssueTitle] = useState("");
  const [issueBody, setIssueBody] = useState("");
  const [repoUrl, setRepoUrl] = useState("");
  const [creating, setCreating] = useState(false);
  const [createdPipeline, setCreatedPipeline] = useState<{
    id: string;
    status: string;
  } | null>(null);

  // ── Selected pipeline detail ──
  const [selectedPipeline, setSelectedPipeline] = useState<Pipeline | null>(
    null
  );
  const [loadingDetail, setLoadingDetail] = useState(false);

  // ── Actions ──
  const [runningPipeline, setRunningPipeline] = useState(false);
  const [rollingBack, setRollingBack] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // ── Active tab ──
  const [activeTab, setActiveTab] = useState("new");

  // ── Fetch pipelines ──
  const fetchPipelines = useCallback(async () => {
    setLoadingPipelines(true);
    try {
      const res = await fetch("/api/issue-pipeline");
      if (res.ok) {
        const data = await res.json();
        setPipelines(data);
      }
    } catch {
      // silently fail
    } finally {
      setLoadingPipelines(false);
    }
  }, []);

  // ── Fetch pipeline detail ──
  const fetchPipelineDetail = useCallback(async (id: string) => {
    setLoadingDetail(true);
    try {
      const res = await fetch(`/api/issue-pipeline/${id}`);
      if (res.ok) {
        const data = await res.json();
        setSelectedPipeline(data);
      }
    } catch {
      // silently fail
    } finally {
      setLoadingDetail(false);
    }
  }, []);

  // ── Init ──
  useEffect(() => {
    if (!open) return;
    fetchPipelines();
    setCreatedPipeline(null);
    setSelectedPipeline(null);
  }, [open, fetchPipelines]);

  // ── Poll selected pipeline ──
  useEffect(() => {
    if (!open || !selectedPipeline) return;
    const activeStatuses: PipelineStatus[] = [
      "planning",
      "coding",
      "testing",
      "reviewing",
    ];
    if (!activeStatuses.includes(selectedPipeline.status)) return;

    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/issue-pipeline/${selectedPipeline.id}`);
        if (res.ok) {
          const data = await res.json();
          setSelectedPipeline(data);
        }
      } catch {
        // silently fail
      }
    }, 3000);
    return () => clearInterval(interval);
  }, [open, selectedPipeline]);

  // ── Create pipeline ──
  const createPipeline = async () => {
    if (!issueTitle.trim()) {
      toast.error("Issue title is required");
      return;
    }
    setCreating(true);
    try {
      const res = await fetch("/api/issue-pipeline", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          issueUrl: issueUrl.trim() || undefined,
          issueTitle: issueTitle.trim(),
          issueBody: issueBody.trim() || undefined,
          repoUrl: repoUrl.trim() || undefined,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setCreatedPipeline({ id: data.id, status: "planning" });
        toast.success("Pipeline created successfully");
        setIssueUrl("");
        setIssueTitle("");
        setIssueBody("");
        setRepoUrl("");
        await fetchPipelines();
      } else {
        const data = await res.json();
        toast.error(data.error || "Failed to create pipeline");
      }
    } catch {
      toast.error("Failed to create pipeline");
    } finally {
      setCreating(false);
    }
  };

  // ── Run pipeline ──
  const runPipeline = async (id: string) => {
    setRunningPipeline(true);
    try {
      const res = await fetch(`/api/issue-pipeline/${id}/run`, {
        method: "POST",
      });
      if (res.ok) {
        toast.success("Pipeline execution started");
        await fetchPipelineDetail(id);
      } else {
        const data = await res.json();
        toast.error(data.error || "Failed to run pipeline");
      }
    } catch {
      toast.error("Failed to run pipeline");
    } finally {
      setRunningPipeline(false);
    }
  };

  // ── Rollback pipeline ──
  const rollbackPipeline = async (id: string) => {
    setRollingBack(true);
    try {
      const res = await fetch(`/api/issue-pipeline/${id}/rollback`, {
        method: "POST",
      });
      if (res.ok) {
        toast.success("Pipeline rolled back");
        await fetchPipelineDetail(id);
        await fetchPipelines();
      } else {
        const data = await res.json();
        toast.error(data.error || "Failed to rollback pipeline");
      }
    } catch {
      toast.error("Failed to rollback pipeline");
    } finally {
      setRollingBack(false);
    }
  };

  // ── Delete pipeline ──
  const deletePipeline = async (id: string) => {
    setDeleting(true);
    try {
      const res = await fetch(`/api/issue-pipeline/${id}`, {
        method: "DELETE",
      });
      if (res.ok) {
        toast.success("Pipeline deleted");
        setSelectedPipeline(null);
        await fetchPipelines();
      } else {
        const data = await res.json();
        toast.error(data.error || "Failed to delete pipeline");
      }
    } catch {
      toast.error("Failed to delete pipeline");
    } finally {
      setDeleting(false);
    }
  };

  // ── Parsed plan ──
  const parsedPlan = safeParseJSON<PipelinePlan>(selectedPipeline?.plan);
  const parsedTestResults = safeParseJSON<TestResults>(
    selectedPipeline?.testResults
  );

  // ═══════════════════════════════════════════════════════════════════════════
  // RENDER
  // ═══════════════════════════════════════════════════════════════════════════

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="sm:max-w-5xl max-h-[92vh] overflow-hidden flex flex-col"
        showCloseButton
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <div className="flex items-center justify-center h-8 w-8 rounded-lg bg-gradient-to-br from-blue-500/20 to-purple-500/20 border border-blue-500/30">
              <GitPullRequest className="h-4 w-4 text-blue-400" />
            </div>
            Issue → Deploy Pipeline
          </DialogTitle>
          <DialogDescription>
            Create pipelines from issues, track progress through planning,
            coding, testing, review, and deployment
          </DialogDescription>
        </DialogHeader>

        <Tabs
          value={activeTab}
          onValueChange={setActiveTab}
          className="flex-1 flex flex-col min-h-0"
        >
          <TabsList className="grid w-full grid-cols-2 mb-1 shrink-0">
            <TabsTrigger value="new" className="gap-1.5 text-xs">
              <Rocket className="h-3.5 w-3.5" />
              New
            </TabsTrigger>
            <TabsTrigger value="pipelines" className="gap-1.5 text-xs">
              <GitPullRequest className="h-3.5 w-3.5" />
              Pipelines
              {pipelines.length > 0 && (
                <Badge variant="secondary" className="h-4 text-[10px] ml-1">
                  {pipelines.length}
                </Badge>
              )}
            </TabsTrigger>
          </TabsList>

          {/* ═══ NEW TAB ═══ */}
          <TabsContent
            value="new"
            className="flex-1 min-h-0 mt-0 overflow-y-auto"
          >
            <ScrollArea className="h-[calc(90vh-200px)]">
              <div className="space-y-5 p-1 pr-4">
                {/* Create Pipeline Form */}
                <div className="rounded-xl border bg-card p-5 space-y-4">
                  <h4 className="text-sm font-semibold flex items-center gap-2">
                    <Rocket className="h-4 w-4 text-blue-400" />
                    Start New Pipeline
                  </h4>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <Label className="text-xs font-medium">
                        Issue URL
                        <span className="text-muted-foreground ml-1">
                          (optional)
                        </span>
                      </Label>
                      <Input
                        value={issueUrl}
                        onChange={(e) => setIssueUrl(e.target.value)}
                        placeholder="https://github.com/org/repo/issues/123"
                        className="h-9 font-mono text-xs"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs font-medium">
                        Repository URL
                        <span className="text-muted-foreground ml-1">
                          (optional)
                        </span>
                      </Label>
                      <Input
                        value={repoUrl}
                        onChange={(e) => setRepoUrl(e.target.value)}
                        placeholder="https://github.com/org/repo"
                        className="h-9 font-mono text-xs"
                      />
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-xs font-medium">
                      Issue Title
                      <span className="text-red-400 ml-0.5">*</span>
                    </Label>
                    <Input
                      value={issueTitle}
                      onChange={(e) => setIssueTitle(e.target.value)}
                      placeholder="Fix: Login page throws 500 error on submit"
                      className="h-9"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-xs font-medium">
                      Issue Body
                      <span className="text-muted-foreground ml-1">
                        (optional)
                      </span>
                    </Label>
                    <Textarea
                      value={issueBody}
                      onChange={(e) => setIssueBody(e.target.value)}
                      placeholder="Describe the issue in detail, including steps to reproduce..."
                      className="min-h-[100px] resize-none"
                    />
                  </div>

                  <div className="flex items-center justify-end">
                    <Button
                      size="sm"
                      onClick={createPipeline}
                      disabled={creating || !issueTitle.trim()}
                      className="h-9 text-xs gap-1.5 min-w-[140px]"
                    >
                      {creating ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Rocket className="h-3.5 w-3.5" />
                      )}
                      Start Pipeline
                    </Button>
                  </div>
                </div>

                {/* Created Pipeline Result */}
                {createdPipeline && (
                  <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-5 space-y-3">
                    <div className="flex items-center gap-2">
                      <CheckCircle2 className="h-5 w-5 text-emerald-400" />
                      <h4 className="text-sm font-semibold text-emerald-400">
                        Pipeline Created
                      </h4>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="rounded-lg bg-muted/50 p-3">
                        <div className="text-[10px] text-muted-foreground mb-1">
                          Pipeline ID
                        </div>
                        <div className="text-xs font-mono truncate">
                          {createdPipeline.id}
                        </div>
                      </div>
                      <div className="rounded-lg bg-muted/50 p-3">
                        <div className="text-[10px] text-muted-foreground mb-1">
                          Status
                        </div>
                        <Badge
                          className={cn(
                            "h-5 text-[10px] border",
                            statusColor(
                              createdPipeline.status as PipelineStatus
                            )
                          )}
                        >
                          {statusIcon(createdPipeline.status as PipelineStatus)}
                          <span className="ml-1">
                            {statusLabel(createdPipeline.status as PipelineStatus)}
                          </span>
                        </Badge>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setSelectedPipeline(null);
                          setActiveTab("pipelines");
                        }}
                        className="h-7 text-xs gap-1"
                      >
                        <GitPullRequest className="h-3 w-3" />
                        View in Pipelines
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => runPipeline(createdPipeline.id)}
                        disabled={runningPipeline}
                        className="h-7 text-xs gap-1"
                      >
                        {runningPipeline ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          <Rocket className="h-3 w-3" />
                        )}
                        Run Now
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            </ScrollArea>
          </TabsContent>

          {/* ═══ PIPELINES TAB ═══ */}
          <TabsContent
            value="pipelines"
            className="flex-1 min-h-0 mt-0 overflow-y-auto"
          >
            <ScrollArea className="h-[calc(90vh-200px)]">
              <div className="space-y-4 p-1 pr-4">
                {loadingPipelines && pipelines.length === 0 ? (
                  <div className="flex items-center justify-center py-12">
                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                  </div>
                ) : pipelines.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-12 text-muted-foreground border border-dashed rounded-lg">
                    <GitPullRequest className="h-10 w-10 mb-3 opacity-30" />
                    <p className="text-sm font-medium">No pipelines yet</p>
                    <p className="text-xs mt-1">
                      Create a new pipeline from the New tab
                    </p>
                  </div>
                ) : selectedPipeline ? (
                  /* ── Pipeline Detail ── */
                  <div className="space-y-4">
                    {/* Back button */}
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setSelectedPipeline(null)}
                      className="h-7 text-xs gap-1 -ml-2"
                    >
                      <ArrowRight className="h-3 w-3 rotate-180" />
                      Back to list
                    </Button>

                    {loadingDetail ? (
                      <div className="flex items-center justify-center py-12">
                        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                      </div>
                    ) : (
                      <>
                        {/* Header */}
                        <div className="rounded-xl border bg-card p-5 space-y-4">
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0 flex-1">
                              <h3 className="font-semibold text-sm truncate">
                                {selectedPipeline.issueTitle}
                              </h3>
                              <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                                <Badge
                                  className={cn(
                                    "h-5 text-[10px] border gap-1",
                                    statusColor(selectedPipeline.status)
                                  )}
                                >
                                  {statusIcon(selectedPipeline.status)}
                                  {statusLabel(selectedPipeline.status)}
                                </Badge>
                                <span className="text-xs text-muted-foreground">
                                  Iteration {selectedPipeline.iterations}/
                                  {selectedPipeline.maxIterations}
                                </span>
                                <span className="text-xs text-muted-foreground">
                                  {formatDate(selectedPipeline.createdAt)}
                                </span>
                              </div>
                            </div>
                          </div>

                          {/* Phase indicator */}
                          <PhaseIndicator status={selectedPipeline.status} />
                        </div>

                        {/* Plan */}
                        {parsedPlan && (
                          <div className="rounded-xl border bg-card p-5 space-y-3">
                            <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                              <ArrowRight className="h-3 w-3" />
                              Plan
                            </h4>
                            <p className="text-xs text-muted-foreground">
                              {parsedPlan.summary}
                            </p>
                            <div className="space-y-2">
                              {parsedPlan.steps.map((step, i) => (
                                <div
                                  key={step.id}
                                  className="flex items-start gap-2 rounded-lg bg-muted/30 p-3"
                                >
                                  <div
                                    className={cn(
                                      "flex items-center justify-center h-5 w-5 rounded-full text-[10px] font-bold shrink-0 border",
                                      step.status === "completed"
                                        ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/30"
                                        : step.status === "in_progress"
                                          ? "bg-blue-500/20 text-blue-400 border-blue-500/30"
                                          : step.status === "failed"
                                            ? "bg-red-500/20 text-red-400 border-red-500/30"
                                            : "bg-zinc-700 text-zinc-400 border-zinc-600"
                                    )}
                                  >
                                    {step.status === "completed" ? (
                                      <CheckCircle2 className="h-3 w-3" />
                                    ) : (
                                      i + 1
                                    )}
                                  </div>
                                  <div className="min-w-0 flex-1">
                                    <div className="text-xs font-medium">
                                      {step.title}
                                    </div>
                                    <div className="text-[10px] text-muted-foreground mt-0.5">
                                      {step.description}
                                    </div>
                                    {step.filePath && (
                                      <div className="text-[10px] font-mono text-muted-foreground mt-1">
                                        {step.filePath}
                                      </div>
                                    )}
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Branch / PR / Deploy info */}
                        {(selectedPipeline.branchName ||
                          selectedPipeline.prUrl ||
                          selectedPipeline.deployUrl) && (
                          <div className="rounded-xl border bg-card p-5 space-y-3">
                            <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                              <GitPullRequest className="h-3 w-3" />
                              Deployment Info
                            </h4>
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                              {selectedPipeline.branchName && (
                                <div className="rounded-lg bg-muted/50 p-3">
                                  <div className="text-[10px] text-muted-foreground mb-1">
                                    Branch
                                  </div>
                                  <div className="text-xs font-mono truncate">
                                    {selectedPipeline.branchName}
                                  </div>
                                </div>
                              )}
                              {selectedPipeline.prUrl && (
                                <div className="rounded-lg bg-muted/50 p-3">
                                  <div className="text-[10px] text-muted-foreground mb-1">
                                    Pull Request
                                  </div>
                                  <a
                                    href={selectedPipeline.prUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-xs text-blue-400 hover:underline truncate block"
                                  >
                                    PR #{selectedPipeline.prNumber}
                                  </a>
                                </div>
                              )}
                              {selectedPipeline.deployUrl && (
                                <div className="rounded-lg bg-muted/50 p-3">
                                  <div className="text-[10px] text-muted-foreground mb-1">
                                    Deploy URL
                                  </div>
                                  <a
                                    href={selectedPipeline.deployUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-xs text-emerald-400 hover:underline truncate block"
                                  >
                                    {selectedPipeline.deployUrl}
                                  </a>
                                </div>
                              )}
                            </div>
                          </div>
                        )}

                        {/* Test Results */}
                        {parsedTestResults && (
                          <div className="rounded-xl border bg-card p-5 space-y-3">
                            <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                              <AlertCircle className="h-3 w-3" />
                              Test Results
                            </h4>
                            <div className="grid grid-cols-4 gap-3">
                              <div className="rounded-lg bg-muted/50 p-3 text-center">
                                <div className="text-[10px] text-muted-foreground mb-1">
                                  Total
                                </div>
                                <div className="text-lg font-bold">
                                  {parsedTestResults.summary.total}
                                </div>
                              </div>
                              <div className="rounded-lg bg-emerald-500/10 p-3 text-center">
                                <div className="text-[10px] text-emerald-400 mb-1">
                                  Passed
                                </div>
                                <div className="text-lg font-bold text-emerald-400">
                                  {parsedTestResults.summary.passed}
                                </div>
                              </div>
                              <div className="rounded-lg bg-red-500/10 p-3 text-center">
                                <div className="text-[10px] text-red-400 mb-1">
                                  Failed
                                </div>
                                <div className="text-lg font-bold text-red-400">
                                  {parsedTestResults.summary.failed}
                                </div>
                              </div>
                              <div className="rounded-lg bg-amber-500/10 p-3 text-center">
                                <div className="text-[10px] text-amber-400 mb-1">
                                  Skipped
                                </div>
                                <div className="text-lg font-bold text-amber-400">
                                  {parsedTestResults.summary.skipped}
                                </div>
                              </div>
                            </div>
                            {parsedTestResults.tests.length > 0 && (
                              <div className="space-y-1.5 max-h-40 overflow-y-auto">
                                {parsedTestResults.tests.map(
                                  (test: TestResultItem, i: number) => (
                                    <div
                                      key={i}
                                      className="flex items-center gap-2 text-xs px-2 py-1.5 rounded bg-muted/30"
                                    >
                                      {test.status === "passed" ? (
                                        <CheckCircle2 className="h-3 w-3 text-emerald-400 shrink-0" />
                                      ) : test.status === "failed" ? (
                                        <AlertCircle className="h-3 w-3 text-red-400 shrink-0" />
                                      ) : (
                                        <AlertCircle className="h-3 w-3 text-amber-400 shrink-0" />
                                      )}
                                      <span className="truncate flex-1">
                                        {test.name}
                                      </span>
                                      <span className="text-muted-foreground shrink-0">
                                        {test.duration}ms
                                      </span>
                                    </div>
                                  )
                                )}
                              </div>
                            )}
                          </div>
                        )}

                        {/* Review Notes */}
                        {selectedPipeline.reviewNotes && (
                          <div className="rounded-xl border bg-card p-5 space-y-3">
                            <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                              Review Notes
                            </h4>
                            <div className="rounded-md bg-zinc-950 text-zinc-300 p-4 font-mono text-xs overflow-x-auto whitespace-pre-wrap max-h-60 overflow-y-auto">
                              {selectedPipeline.reviewNotes}
                            </div>
                          </div>
                        )}

                        <Separator />

                        {/* Actions */}
                        <div className="flex items-center gap-3">
                          <Button
                            size="sm"
                            onClick={() => runPipeline(selectedPipeline.id)}
                            disabled={runningPipeline}
                            className="h-9 text-xs gap-1.5 min-w-[130px]"
                          >
                            {runningPipeline ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <Rocket className="h-3.5 w-3.5" />
                            )}
                            Run Pipeline
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() =>
                              rollbackPipeline(selectedPipeline.id)
                            }
                            disabled={rollingBack}
                            className="h-9 text-xs gap-1.5"
                          >
                            {rollingBack ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <RotateCcw className="h-3.5 w-3.5" />
                            )}
                            Rollback
                          </Button>
                          <div className="flex-1" />
                          <Button
                            size="sm"
                            variant="destructive"
                            onClick={() => deletePipeline(selectedPipeline.id)}
                            disabled={deleting}
                            className="h-9 text-xs gap-1.5"
                          >
                            {deleting ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <Trash2 className="h-3.5 w-3.5" />
                            )}
                            Delete
                          </Button>
                        </div>
                      </>
                    )}
                  </div>
                ) : (
                  /* ── Pipeline List ── */
                  <div className="space-y-2">
                    {pipelines.map((pipeline) => (
                      <div
                        key={pipeline.id}
                        className="rounded-lg border bg-card p-4 transition-all hover:bg-card/80 cursor-pointer"
                        onClick={() => fetchPipelineDetail(pipeline.id)}
                      >
                        <div className="flex items-center justify-between gap-3">
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-medium text-sm truncate">
                                {pipeline.issueTitle}
                              </span>
                              <Badge
                                className={cn(
                                  "h-5 text-[10px] border gap-0.5",
                                  statusColor(pipeline.status)
                                )}
                              >
                                {statusIcon(pipeline.status)}
                                <span className="ml-0.5">
                                  {statusLabel(pipeline.status)}
                                </span>
                              </Badge>
                            </div>
                            <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                              <span>
                                Iteration {pipeline.iterations}/
                                {pipeline.maxIterations}
                              </span>
                              <span>{formatDate(pipeline.createdAt)}</span>
                              {pipeline.branchName && (
                                <span className="font-mono truncate">
                                  {pipeline.branchName}
                                </span>
                              )}
                            </div>
                          </div>
                          <ArrowRight className="h-4 w-4 text-muted-foreground shrink-0" />
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
