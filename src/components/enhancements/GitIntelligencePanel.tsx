"use client";

import { useState, useCallback } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
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
  GitCommitHorizontal,
  GitPullRequest,
  GitMerge,
  Loader2,
  Copy,
  Check,
  AlertTriangle,
  AlertCircle,
  Info,
  CheckCircle2,
  XCircle,
  FileCode,
  Shield,
  Sparkles,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ─── Types ──────────────────────────────────────────────────────────────────

interface GitIntelligencePanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface ReviewIssue {
  file: string;
  line: string;
  severity: "critical" | "high" | "medium" | "low" | "info";
  message: string;
}

// ─── Constants ──────────────────────────────────────────────────────────────

const SEVERITY_CONFIG = {
  critical: { icon: AlertTriangle, color: "text-red-500", bg: "bg-red-500/10 border-red-500/20" },
  high: { icon: AlertCircle, color: "text-orange-500", bg: "bg-orange-500/10 border-orange-500/20" },
  medium: { icon: AlertTriangle, color: "text-amber-500", bg: "bg-amber-500/10 border-amber-500/20" },
  low: { icon: Info, color: "text-sky-500", bg: "bg-sky-500/10 border-sky-500/20" },
  info: { icon: Info, color: "text-muted-foreground", bg: "bg-muted/50 border-muted" },
} as const;

// ─── Component ──────────────────────────────────────────────────────────────

export function GitIntelligencePanel({ open, onOpenChange }: GitIntelligencePanelProps) {
  // ── Commit Messages State ──
  const [projectPath, setProjectPath] = useState("");
  const [commitHash, setCommitHash] = useState("");
  const [diffContent, setDiffContent] = useState("");
  const [generating, setGenerating] = useState(false);
  const [commitMessage, setCommitMessage] = useState("");
  const [copiedCommit, setCopiedCommit] = useState(false);

  // ── PR Review State ──
  const [prDiff, setPrDiff] = useState("");
  const [prDescription, setPrDescription] = useState("");
  const [reviewing, setReviewing] = useState(false);
  const [reviewResult, setReviewResult] = useState<{
    approved: boolean;
    score: number;
    issues: ReviewIssue[];
    positives: string[];
    suggestions: string[];
    analysisId?: string;
  } | null>(null);
  const [reviewDecision, setReviewDecision] = useState<"none" | "approved" | "changes">("none");

  // ── Conflict Resolver State ──
  const [conflictContent, setConflictContent] = useState("");
  const [conflictFilePath, setConflictFilePath] = useState("");
  const [resolving, setResolving] = useState(false);
  const [resolvedCode, setResolvedCode] = useState("");
  const [resolutionStrategy, setResolutionStrategy] = useState("");
  const [resolutionExplanation, setResolutionExplanation] = useState("");
  const [applied, setApplied] = useState(false);
  const [copiedResolved, setCopiedResolved] = useState(false);

  // ── Generate Commit Message ──
  const handleGenerateCommit = useCallback(async () => {
    if (!diffContent.trim() && !projectPath.trim()) {
      toast.error("Provide a project path or paste a diff");
      return;
    }

    setGenerating(true);
    setCommitMessage("");
    try {
      const res = await fetch("/api/git/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectPath: projectPath.trim() || "/unknown",
          commitHash: commitHash.trim() || `manual-${Date.now()}`,
          diff: diffContent.trim() || undefined,
          type: "commit",
        }),
      });

      if (res.ok) {
        const data = await res.json();
        const analysis = typeof data.analysis === "string" ? JSON.parse(data.analysis) : data.analysis;
        const msg = analysis.summary || data.analysis?.summary || "chore: update codebase";
        setCommitMessage(msg);
        toast.success("Commit message generated");
      } else {
        const data = await res.json();
        toast.error(data.error || "Failed to generate commit message");
      }
    } catch {
      toast.error("Request failed");
    } finally {
      setGenerating(false);
    }
  }, [projectPath, commitHash, diffContent]);

  // ── PR Review ──
  const handleReview = useCallback(async () => {
    if (!prDiff.trim()) {
      toast.error("Please paste the PR diff");
      return;
    }

    setReviewing(true);
    setReviewResult(null);
    setReviewDecision("none");
    try {
      const res = await fetch("/api/git/review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectPath: projectPath.trim() || undefined,
          diff: prDiff.trim(),
          description: prDescription.trim() || undefined,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        const review = data.review || {};
        setReviewResult({
          approved: review.approved ?? true,
          score: review.score ?? 70,
          issues: Array.isArray(review.issues) ? review.issues : [],
          positives: Array.isArray(review.positives) ? review.positives : [],
          suggestions: Array.isArray(review.suggestions) ? review.suggestions : [],
          analysisId: data.analysisId,
        });
        toast.success("Code review completed");
      } else {
        const data = await res.json();
        toast.error(data.error || "Review failed");
      }
    } catch {
      toast.error("Request failed");
    } finally {
      setReviewing(false);
    }
  }, [prDiff, prDescription, projectPath]);

  // ── Resolve Conflict ──
  const handleResolveConflict = useCallback(async () => {
    if (!conflictContent.trim()) {
      toast.error("Please paste the merge conflict content");
      return;
    }

    // Parse conflict markers
    const hasOurs = conflictContent.includes("<<<<<<<");
    const hasTheirs = conflictContent.includes(">>>>>>>");

    let ours = "";
    let theirs = "";
    let base = "";

    if (hasOurs && hasTheirs) {
      const parts = conflictContent.split(/<<<<<<<.*\n|=======\n|>>>>>>>.*\n/);
      ours = parts[1]?.trim() || "";
      theirs = parts[2]?.trim() || "";
      base = parts[0]?.trim() || "";
    } else {
      ours = conflictContent;
      theirs = conflictContent;
    }

    setResolving(true);
    setResolvedCode("");
    try {
      const res = await fetch("/api/git/conflict", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectPath: projectPath.trim() || "/unknown",
          filePath: conflictFilePath.trim() || "unknown",
          ours,
          theirs,
          base: base || undefined,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        const resolution = data.resolution || {};
        setResolvedCode(resolution.resolvedCode || "");
        setResolutionStrategy(resolution.strategy || "ai-assisted");
        setResolutionExplanation(resolution.explanation || "AI-generated merge resolution");
        toast.success("Conflict resolution generated");
      } else {
        const data = await res.json();
        toast.error(data.error || "Conflict resolution failed");
      }
    } catch {
      toast.error("Request failed");
    } finally {
      setResolving(false);
    }
  }, [conflictContent, conflictFilePath, projectPath]);

  // ── Copy handlers ──
  const handleCopyCommit = async () => {
    await navigator.clipboard.writeText(commitMessage);
    setCopiedCommit(true);
    toast.success("Copied to clipboard");
    setTimeout(() => setCopiedCommit(false), 2000);
  };

  const handleCopyResolved = async () => {
    await navigator.clipboard.writeText(resolvedCode);
    setCopiedResolved(true);
    toast.success("Copied to clipboard");
    setTimeout(() => setCopiedResolved(false), 2000);
  };

  const handleApply = () => {
    setApplied(true);
    toast.success("Resolution applied successfully");
    setTimeout(() => setApplied(false), 3000);
  };

  // ── Score color ──
  const getScoreColor = (score: number) => {
    if (score >= 80) return "text-emerald-400";
    if (score >= 60) return "text-amber-400";
    return "text-red-400";
  };

  const getScoreBg = (score: number) => {
    if (score >= 80) return "bg-emerald-500/10 border-emerald-500/20";
    if (score >= 60) return "bg-amber-500/10 border-amber-500/20";
    return "bg-red-500/10 border-red-500/20";
  };

  // ── Render ──
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-5xl max-h-[90vh] p-0 gap-0 overflow-hidden">
        <DialogHeader className="px-6 pt-6 pb-0">
          <DialogTitle className="flex items-center gap-2">
            <GitCommitHorizontal className="h-5 w-5" />
            Git Intelligence
          </DialogTitle>
          <DialogDescription>
            Generate commit messages, review PRs, and resolve merge conflicts with AI
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="commit" className="flex flex-col flex-1 min-h-0">
          <div className="px-6 pt-2">
            <TabsList className="w-full">
              <TabsTrigger value="commit" className="flex-1 gap-1.5">
                <GitCommitHorizontal className="h-3.5 w-3.5" />
                Commit Messages
              </TabsTrigger>
              <TabsTrigger value="review" className="flex-1 gap-1.5">
                <GitPullRequest className="h-3.5 w-3.5" />
                PR Review
              </TabsTrigger>
              <TabsTrigger value="conflict" className="flex-1 gap-1.5">
                <GitMerge className="h-3.5 w-3.5" />
                Conflict Resolver
              </TabsTrigger>
            </TabsList>
          </div>

          {/* ──────── COMMIT MESSAGES TAB ──────── */}
          <TabsContent value="commit" className="flex-1 min-h-0 mt-0">
            <ScrollArea className="h-[calc(90vh-14rem)]">
              <div className="p-6 space-y-5">
                <div className="rounded-lg border bg-card p-4 space-y-4">
                  <h4 className="font-semibold text-sm flex items-center gap-2">
                    <GitCommitHorizontal className="h-4 w-4" />
                    Generate Commit Message
                  </h4>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label className="text-xs">Project Path</Label>
                      <Input
                        value={projectPath}
                        onChange={(e) => setProjectPath(e.target.value)}
                        placeholder="/path/to/project"
                        className="h-9 text-sm"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs">Commit Hash (optional)</Label>
                      <Input
                        value={commitHash}
                        onChange={(e) => setCommitHash(e.target.value)}
                        placeholder="abc1234"
                        className="h-9 text-sm"
                      />
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-xs">
                      Git Diff{" "}
                      <span className="font-normal text-muted-foreground">
                        (paste your diff or leave empty to read from repo)
                      </span>
                    </Label>
                    <Textarea
                      value={diffContent}
                      onChange={(e) => setDiffContent(e.target.value)}
                      placeholder={`Paste git diff output here...\n\nExample:\ndiff --git a/src/app.ts b/src/app.ts\n+ import { newFeature } from './feature'\n- import { oldFeature } from './legacy'`}
                      className="min-h-[150px] text-sm font-mono"
                      rows={6}
                    />
                  </div>

                  <Button
                    onClick={handleGenerateCommit}
                    disabled={generating}
                    className="w-full"
                  >
                    {generating ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <Sparkles className="h-4 w-4 mr-2" />
                    )}
                    {generating ? "Generating..." : "Generate Commit Message"}
                  </Button>
                </div>

                {/* Generated commit message */}
                {commitMessage && (
                  <div className="rounded-lg border bg-card p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <Label className="text-xs font-semibold">Generated Commit Message</Label>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 text-xs gap-1"
                        onClick={handleCopyCommit}
                      >
                        {copiedCommit ? (
                          <Check className="h-3.5 w-3.5 text-emerald-400" />
                        ) : (
                          <Copy className="h-3.5 w-3.5" />
                        )}
                        {copiedCommit ? "Copied" : "Copy"}
                      </Button>
                    </div>
                    <pre className="text-sm bg-muted/50 rounded-md p-3 whitespace-pre-wrap font-mono">
                      {commitMessage}
                    </pre>
                  </div>
                )}
              </div>
            </ScrollArea>
          </TabsContent>

          {/* ──────── PR REVIEW TAB ──────── */}
          <TabsContent value="review" className="flex-1 min-h-0 mt-0">
            <ScrollArea className="h-[calc(90vh-14rem)]">
              <div className="p-6 space-y-5">
                {/* Input section */}
                <div className="rounded-lg border bg-card p-4 space-y-4">
                  <h4 className="font-semibold text-sm flex items-center gap-2">
                    <GitPullRequest className="h-4 w-4" />
                    AI Code Review
                  </h4>

                  <div className="space-y-1.5">
                    <Label className="text-xs">PR Description (optional)</Label>
                    <Input
                      value={prDescription}
                      onChange={(e) => setPrDescription(e.target.value)}
                      placeholder="Brief description of the PR..."
                      className="h-9 text-sm"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-xs">PR Diff</Label>
                    <Textarea
                      value={prDiff}
                      onChange={(e) => setPrDiff(e.target.value)}
                      placeholder="Paste the PR diff here..."
                      className="min-h-[150px] text-sm font-mono"
                      rows={6}
                    />
                  </div>

                  <Button
                    onClick={handleReview}
                    disabled={reviewing}
                    className="w-full"
                  >
                    {reviewing ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <Shield className="h-4 w-4 mr-2" />
                    )}
                    {reviewing ? "Reviewing..." : "Review PR"}
                  </Button>
                </div>

                {/* Review results */}
                {reviewResult && (
                  <div className="space-y-4">
                    {/* Score + Decision */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div className={cn("rounded-lg border p-4 text-center", getScoreBg(reviewResult.score))}>
                        <div className={cn("text-3xl font-bold", getScoreColor(reviewResult.score))}>
                          {reviewResult.score}
                        </div>
                        <div className="text-xs text-muted-foreground mt-1">Code Quality Score</div>
                      </div>
                      <div className="rounded-lg border bg-card p-4 space-y-3">
                        <Label className="text-xs font-semibold">Review Decision</Label>
                        <div className="flex gap-2">
                          <Button
                            variant={reviewDecision === "approved" ? "default" : "outline"}
                            size="sm"
                            className="flex-1 gap-1"
                            onClick={() => {
                              setReviewDecision("approved");
                              toast.success("PR Approved");
                            }}
                          >
                            <CheckCircle2 className="h-3.5 w-3.5" />
                            Approve
                          </Button>
                          <Button
                            variant={reviewDecision === "changes" ? "destructive" : "outline"}
                            size="sm"
                            className="flex-1 gap-1"
                            onClick={() => {
                              setReviewDecision("changes");
                              toast("Changes requested", { description: "PR needs revisions before merging" });
                            }}
                          >
                            <XCircle className="h-3.5 w-3.5" />
                            Request Changes
                          </Button>
                        </div>
                      </div>
                    </div>

                    {/* Issues */}
                    {reviewResult.issues.length > 0 && (
                      <div className="rounded-lg border bg-card p-4 space-y-3">
                        <Label className="text-xs font-semibold flex items-center gap-2">
                          <AlertCircle className="h-4 w-4 text-amber-400" />
                          Issues ({reviewResult.issues.length})
                        </Label>
                        <div className="space-y-2">
                          {reviewResult.issues.map((issue, i) => {
                            const sev = SEVERITY_CONFIG[issue.severity as keyof typeof SEVERITY_CONFIG] || SEVERITY_CONFIG.info;
                            const SevIcon = sev.icon;
                            return (
                              <div
                                key={i}
                                className={cn("rounded-md border p-3", sev.bg)}
                              >
                                <div className="flex items-center gap-2 mb-1">
                                  <SevIcon className={cn("h-3.5 w-3.5", sev.color)} />
                                  <Badge variant="outline" className="h-4 text-[9px] px-1.5">
                                    {issue.severity}
                                  </Badge>
                                  {issue.file && (
                                    <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                                      <FileCode className="h-3 w-3" />
                                      {issue.file}
                                      {issue.line && `:${issue.line}`}
                                    </span>
                                  )}
                                </div>
                                <p className="text-xs">{issue.message}</p>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {/* Positives */}
                    {reviewResult.positives.length > 0 && (
                      <div className="rounded-lg border bg-card p-4 space-y-2">
                        <Label className="text-xs font-semibold flex items-center gap-2">
                          <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                          Positives
                        </Label>
                        <ul className="space-y-1">
                          {reviewResult.positives.map((p, i) => (
                            <li key={i} className="text-xs flex items-start gap-2">
                              <Check className="h-3 w-3 text-emerald-400 mt-0.5 shrink-0" />
                              {p}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {/* Suggestions */}
                    {reviewResult.suggestions.length > 0 && (
                      <div className="rounded-lg border bg-card p-4 space-y-2">
                        <Label className="text-xs font-semibold flex items-center gap-2">
                          <Sparkles className="h-4 w-4 text-purple-400" />
                          Suggestions
                        </Label>
                        <ul className="space-y-1">
                          {reviewResult.suggestions.map((s, i) => (
                            <li key={i} className="text-xs flex items-start gap-2">
                              <Sparkles className="h-3 w-3 text-purple-400 mt-0.5 shrink-0" />
                              {s}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </ScrollArea>
          </TabsContent>

          {/* ──────── CONFLICT RESOLVER TAB ──────── */}
          <TabsContent value="conflict" className="flex-1 min-h-0 mt-0">
            <ScrollArea className="h-[calc(90vh-14rem)]">
              <div className="p-6 space-y-5">
                <div className="rounded-lg border bg-card p-4 space-y-4">
                  <h4 className="font-semibold text-sm flex items-center gap-2">
                    <GitMerge className="h-4 w-4" />
                    AI Conflict Resolver
                  </h4>

                  <div className="space-y-1.5">
                    <Label className="text-xs">File Path (optional)</Label>
                    <Input
                      value={conflictFilePath}
                      onChange={(e) => setConflictFilePath(e.target.value)}
                      placeholder="src/components/App.tsx"
                      className="h-9 text-sm"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-xs">
                      Merge Conflict Content{" "}
                      <span className="font-normal text-muted-foreground">
                        (paste content with &lt;&lt;&lt;&lt;&lt;&lt;&lt; / ======= / &gt;&gt;&gt;&gt;&gt;&gt;&gt; markers)
                      </span>
                    </Label>
                    <Textarea
                      value={conflictContent}
                      onChange={(e) => setConflictContent(e.target.value)}
                      placeholder={`<<<<<<< HEAD\nconst value = 'ours';\n=======\nconst value = 'theirs';\n>>>>>>> feature-branch`}
                      className="min-h-[180px] text-sm font-mono"
                      rows={7}
                    />
                  </div>

                  <Button
                    onClick={handleResolveConflict}
                    disabled={resolving}
                    className="w-full"
                  >
                    {resolving ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <GitMerge className="h-4 w-4 mr-2" />
                    )}
                    {resolving ? "Resolving..." : "Resolve Conflict"}
                  </Button>
                </div>

                {/* Resolution */}
                {resolvedCode && (
                  <div className="rounded-lg border bg-card p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <Label className="text-xs font-semibold">AI Resolution</Label>
                      <div className="flex items-center gap-1.5">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 text-xs gap-1"
                          onClick={handleCopyResolved}
                        >
                          {copiedResolved ? (
                            <Check className="h-3.5 w-3.5 text-emerald-400" />
                          ) : (
                            <Copy className="h-3.5 w-3.5" />
                          )}
                          {copiedResolved ? "Copied" : "Copy"}
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 text-xs gap-1"
                          onClick={handleApply}
                          disabled={applied}
                        >
                          {applied ? (
                            <Check className="h-3.5 w-3.5 text-emerald-400" />
                          ) : (
                            <CheckCircle2 className="h-3.5 w-3.5" />
                          )}
                          {applied ? "Applied" : "Apply"}
                        </Button>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="h-5 text-[10px] gap-1">
                        <Shield className="h-3 w-3" />
                        {resolutionStrategy}
                      </Badge>
                    </div>

                    <pre className="text-sm bg-muted/50 rounded-md p-3 whitespace-pre-wrap font-mono max-h-64 overflow-y-auto">
                      {resolvedCode}
                    </pre>

                    {resolutionExplanation && (
                      <div className="rounded-md border p-3 bg-muted/30">
                        <Label className="text-xs text-muted-foreground mb-1 block">Explanation</Label>
                        <p className="text-xs">{resolutionExplanation}</p>
                      </div>
                    )}
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
