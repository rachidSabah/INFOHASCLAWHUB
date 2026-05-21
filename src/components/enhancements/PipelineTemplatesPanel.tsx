"use client";

import { useState, useCallback } from "react";
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
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  Workflow,
  Play,
  Eye,
  Rocket,
  ArrowRight,
  CheckCircle,
  Clock,
  AlertCircle,
  Loader2,
  ChevronDown,
  ChevronRight,
  Sparkles,
  Zap,
} from "lucide-react";
import { PowerToolHint } from "./PowerToolHint";

// ─── Types ───────────────────────────────────────────────────────────────────

interface PipelineStep {
  agentId: string;
  order: number;
  approvalRequired: boolean;
  task: string;
}

interface PipelineTemplate {
  id: string;
  name: string;
  description: string;
  emoji: string;
  category: "development" | "security" | "research" | "data" | "operations" | "product";
  steps: PipelineStep[];
}

interface PipelineTemplatesPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

// ─── Pipeline Template Data ──────────────────────────────────────────────────

const PIPELINE_TEMPLATES: PipelineTemplate[] = [
  {
    id: "tpl-fullstack-saas",
    name: "Full-Stack SaaS Builder",
    description: "End-to-end SaaS application generation: architecture → backend → frontend → database → deploy",
    emoji: "⚒️",
    category: "development",
    steps: [
      { agentId: "architect", order: 0, approvalRequired: true, task: "Design system architecture and API contracts" },
      { agentId: "backend-dev", order: 1, approvalRequired: false, task: "Implement REST/GraphQL API with authentication" },
      { agentId: "frontend-dev", order: 2, approvalRequired: false, task: "Build React UI with components and routing" },
      { agentId: "db-architect", order: 3, approvalRequired: true, task: "Design and migrate database schema" },
      { agentId: "devops", order: 4, approvalRequired: true, task: "Configure CI/CD and deploy to production" },
    ],
  },
  {
    id: "tpl-security-audit",
    name: "Security Audit Fortress",
    description: "Comprehensive security analysis: scan → vulnerability assessment → remediation → compliance",
    emoji: "🔐",
    category: "security",
    steps: [
      { agentId: "security-scanner", order: 0, approvalRequired: false, task: "Scan codebase for exposed secrets and API keys" },
      { agentId: "vulnerability-analyst", order: 1, approvalRequired: false, task: "Identify OWASP Top 10 vulnerabilities" },
      { agentId: "pen-tester", order: 2, approvalRequired: true, task: "Run penetration tests on API endpoints" },
      { agentId: "compliance-checker", order: 3, approvalRequired: true, task: "Verify GDPR/SOC2/HIPAA compliance" },
      { agentId: "remediation-engineer", order: 4, approvalRequired: false, task: "Generate patches for all findings" },
    ],
  },
  {
    id: "tpl-deep-research",
    name: "Deep Research Engine",
    description: "Multi-source research pipeline: query → search → analyze → synthesize → cite",
    emoji: "🔬",
    category: "research",
    steps: [
      { agentId: "research-planner", order: 0, approvalRequired: false, task: "Decompose research query into sub-queries" },
      { agentId: "web-searcher", order: 1, approvalRequired: false, task: "Search multiple sources for relevant information" },
      { agentId: "data-analyst", order: 2, approvalRequired: false, task: "Analyze and cross-reference findings" },
      { agentId: "synthesis-writer", order: 3, approvalRequired: true, task: "Synthesize findings into coherent report" },
      { agentId: "citation-checker", order: 4, approvalRequired: false, task: "Verify citations and detect hallucinations" },
    ],
  },
  {
    id: "tpl-data-pipeline",
    name: "Data Pipeline Architect",
    description: "Automated data engineering: extract → transform → validate → load → monitor",
    emoji: "📊",
    category: "data",
    steps: [
      { agentId: "data-engineer", order: 0, approvalRequired: false, task: "Extract data from configured sources" },
      { agentId: "transform-agent", order: 1, approvalRequired: false, task: "Apply transformation rules and mappings" },
      { agentId: "qa-validator", order: 2, approvalRequired: true, task: "Validate data quality and integrity" },
      { agentId: "loader-agent", order: 3, approvalRequired: false, task: "Load processed data to target warehouse" },
      { agentId: "monitor-agent", order: 4, approvalRequired: false, task: "Set up monitoring and alerting" },
    ],
  },
  {
    id: "tpl-incident-command",
    name: "Incident Command",
    description: "Rapid incident response: detect → triage → diagnose → remediate → post-mortem",
    emoji: "🚨",
    category: "operations",
    steps: [
      { agentId: "alert-monitor", order: 0, approvalRequired: false, task: "Detect and classify the incident severity" },
      { agentId: "triage-agent", order: 1, approvalRequired: false, task: "Triage and assign incident responders" },
      { agentId: "diagnostic-agent", order: 2, approvalRequired: false, task: "Diagnose root cause analysis" },
      { agentId: "remediation-agent", order: 3, approvalRequired: true, task: "Execute remediation plan" },
      { agentId: "postmortem-agent", order: 4, approvalRequired: false, task: "Generate post-mortem report" },
    ],
  },
  {
    id: "tpl-code-modernization",
    name: "Code Modernization",
    description: "Legacy code transformation: analyze → plan → refactor → test → document",
    emoji: "🔄",
    category: "development",
    steps: [
      { agentId: "code-analyzer", order: 0, approvalRequired: false, task: "Analyze legacy codebase structure and patterns" },
      { agentId: "migration-planner", order: 1, approvalRequired: true, task: "Create modernization plan with migration strategy" },
      { agentId: "refactor-agent", order: 2, approvalRequired: false, task: "Execute code refactoring and migration" },
      { agentId: "test-engineer", order: 3, approvalRequired: false, task: "Write and run test suites for migrated code" },
      { agentId: "doc-writer", order: 4, approvalRequired: false, task: "Document changes and update API references" },
    ],
  },
  {
    id: "tpl-product-launch",
    name: "Product Launch Pad",
    description: "Go-to-market pipeline: validate → build → test → launch → monitor",
    emoji: "🚀",
    category: "product",
    steps: [
      { agentId: "market-analyst", order: 0, approvalRequired: false, task: "Validate market fit and competitive landscape" },
      { agentId: "product-builder", order: 1, approvalRequired: false, task: "Build core product features" },
      { agentId: "qa-engineer", order: 2, approvalRequired: true, task: "Quality assurance and beta testing" },
      { agentId: "launch-coordinator", order: 3, approvalRequired: true, task: "Coordinate launch across channels" },
      { agentId: "growth-monitor", order: 4, approvalRequired: false, task: "Monitor KPIs and gather user feedback" },
    ],
  },
];

// ─── Category Config ─────────────────────────────────────────────────────────

const CATEGORY_CONFIG: Record<string, { label: string; color: string; bgColor: string; borderColor: string; iconColor: string }> = {
  development: {
    label: "Development",
    color: "text-sky-400",
    bgColor: "bg-sky-500/10",
    borderColor: "border-sky-500/30",
    iconColor: "text-sky-400",
  },
  security: {
    label: "Security",
    color: "text-rose-400",
    bgColor: "bg-rose-500/10",
    borderColor: "border-rose-500/30",
    iconColor: "text-rose-400",
  },
  research: {
    label: "Research",
    color: "text-violet-400",
    bgColor: "bg-violet-500/10",
    borderColor: "border-violet-500/30",
    iconColor: "text-violet-400",
  },
  data: {
    label: "Data",
    color: "text-amber-400",
    bgColor: "bg-amber-500/10",
    borderColor: "border-amber-500/30",
    iconColor: "text-amber-400",
  },
  operations: {
    label: "Operations",
    color: "text-red-400",
    bgColor: "bg-red-500/10",
    borderColor: "border-red-500/30",
    iconColor: "text-red-400",
  },
  product: {
    label: "Product",
    color: "text-emerald-400",
    bgColor: "bg-emerald-500/10",
    borderColor: "border-emerald-500/30",
    iconColor: "text-emerald-400",
  },
};

// ─── Step Flow Diagram ───────────────────────────────────────────────────────

function StepFlowDiagram({ steps }: { steps: PipelineStep[] }) {
  return (
    <div className="overflow-x-auto py-2">
      <div className="flex items-center gap-0 min-w-max">
        {steps.map((step, index) => (
          <div key={index} className="flex items-center">
            {/* Step Node */}
            <div className="flex flex-col items-center gap-1.5 min-w-[110px]">
              <div className="flex items-center justify-center h-8 w-8 rounded-full bg-gradient-to-br from-violet-500/20 to-cyan-500/20 border border-violet-500/30 text-xs font-bold text-violet-300">
                {index + 1}
              </div>
              <span className="text-[10px] font-medium text-foreground/80 text-center leading-tight max-w-[100px] truncate" title={step.task}>
                {step.agentId.split("-").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ")}
              </span>
              {step.approvalRequired && (
                <Badge className="h-4 text-[8px] px-1.5 bg-yellow-500/15 text-yellow-400 border-yellow-500/30 border">
                  Gate
                </Badge>
              )}
            </div>
            {/* Arrow Connector */}
            {index < steps.length - 1 && (
              <div className="flex items-center mx-1">
                <ArrowRight className="h-4 w-4 text-muted-foreground/50 shrink-0" />
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Expanded Steps Detail ───────────────────────────────────────────────────

function ExpandedSteps({ steps }: { steps: PipelineStep[] }) {
  return (
    <div className="space-y-2 mt-3 pt-3 border-t border-border/50">
      {/* Flow Diagram */}
      <div className="rounded-lg bg-muted/30 p-3 border border-border/30">
        <p className="text-[10px] text-muted-foreground font-medium mb-2 flex items-center gap-1">
          <Workflow className="h-3 w-3" />
          Step Flow
        </p>
        <StepFlowDiagram steps={steps} />
      </div>

      {/* Step Details List */}
      <div className="space-y-1.5">
        {steps.map((step, index) => (
          <div
            key={index}
            className="flex items-start gap-3 p-2 rounded-md bg-muted/20 hover:bg-muted/40 transition-colors"
          >
            <div className="flex items-center justify-center h-6 w-6 rounded-full bg-gradient-to-br from-violet-500/20 to-cyan-500/20 border border-violet-500/30 text-[10px] font-bold text-violet-300 shrink-0 mt-0.5">
              {index + 1}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs font-medium text-foreground">
                  {step.agentId.split("-").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ")}
                </span>
                {step.approvalRequired && (
                  <Badge className="h-4 text-[8px] px-1.5 bg-yellow-500/15 text-yellow-400 border-yellow-500/30 border">
                    <AlertCircle className="h-2.5 w-2.5 mr-0.5" />
                    Approval Required
                  </Badge>
                )}
              </div>
              <p className="text-[10px] text-muted-foreground mt-0.5 leading-relaxed">
                {step.task}
              </p>
            </div>
            <div className="flex items-center gap-1 text-[9px] text-muted-foreground shrink-0">
              <Clock className="h-2.5 w-2.5" />
              ~{2 + Math.floor(Math.random() * 5)}min
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Main Component ──────────────────────────────────────────────────────────

export function PipelineTemplatesPanel({ open, onOpenChange }: PipelineTemplatesPanelProps) {
  const [launchingId, setLaunchingId] = useState<string | null>(null);
  const [seeding, setSeeding] = useState(false);
  const [expandedTemplates, setExpandedTemplates] = useState<Set<string>>(new Set());
  const [launchedIds, setLaunchedIds] = useState<Set<string>>(new Set());

  // ── Toggle Expanded Template ──
  const toggleExpanded = (id: string) => {
    setExpandedTemplates((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // ── Launch Single Pipeline ──
  const launchPipeline = useCallback(async (template: PipelineTemplate) => {
    setLaunchingId(template.id);
    try {
      const res = await fetch("/api/pipelines", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: template.id,
          name: template.name,
          description: template.description,
          steps: JSON.stringify(template.steps),
          status: "draft",
          currentStep: 0,
        }),
      });
      if (res.ok) {
        setLaunchedIds((prev) => new Set(prev).add(template.id));
        toast.success(`Pipeline "${template.name}" created! Open Agent Orchestration to run it.`, {
          duration: 4000,
        });
      } else {
        const data = await res.json();
        toast.error(data.error || "Failed to launch pipeline");
      }
    } catch {
      toast.error("Failed to launch pipeline");
    } finally {
      setLaunchingId(null);
    }
  }, []);

  // ── Seed All Pipelines ──
  const seedAllPipelines = useCallback(async () => {
    setSeeding(true);
    try {
      const res = await fetch("/api/system/seed", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      if (res.ok) {
        const data = await res.json();
        toast.success(data.message || "All pipeline templates seeded!", {
          duration: 4000,
        });
        // Mark all as launched visually
        setLaunchedIds(new Set(PIPELINE_TEMPLATES.map((t) => t.id)));
      } else {
        const data = await res.json();
        toast.error(data.error || "Failed to seed pipelines");
      }
    } catch {
      toast.error("Failed to seed pipelines");
    } finally {
      setSeeding(false);
    }
  }, []);

  // ── Compute stats ──
  const totalSteps = PIPELINE_TEMPLATES.reduce((acc, t) => acc + t.steps.length, 0);
  const approvalSteps = PIPELINE_TEMPLATES.reduce(
    (acc, t) => acc + t.steps.filter((s) => s.approvalRequired).length,
    0
  );

  // ═══════════════════════════════════════════════════════════════════════════
  // RENDER
  // ═══════════════════════════════════════════════════════════════════════════

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-5xl max-h-[92vh] overflow-hidden flex flex-col" showCloseButton>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <div className="flex items-center justify-center h-8 w-8 rounded-lg bg-gradient-to-br from-amber-500/20 to-rose-500/20 border border-amber-500/30">
              <Workflow className="h-4 w-4 text-amber-400" />
            </div>
            Pipeline Templates
          </DialogTitle>
          <DialogDescription>
            One-click launch preconfigured multi-agent pipelines for common workflows
          </DialogDescription>
        </DialogHeader>
        <PowerToolHint name="Pipeline Templates" />

        {/* Stats Bar + Seed Button */}
        <div className="flex items-center justify-between gap-3 px-1 shrink-0">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Sparkles className="h-3.5 w-3.5 text-amber-400" />
              <span><strong className="text-foreground">{PIPELINE_TEMPLATES.length}</strong> templates</span>
            </div>
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Workflow className="h-3.5 w-3.5 text-violet-400" />
              <span><strong className="text-foreground">{totalSteps}</strong> total steps</span>
            </div>
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <AlertCircle className="h-3.5 w-3.5 text-yellow-400" />
              <span><strong className="text-foreground">{approvalSteps}</strong> approval gates</span>
            </div>
          </div>
          <Button
            size="sm"
            variant="outline"
            onClick={seedAllPipelines}
            disabled={seeding}
            className="h-8 text-xs gap-1.5 border-amber-500/30 text-amber-400 hover:bg-amber-500/10 hover:text-amber-300"
          >
            {seeding ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Rocket className="h-3.5 w-3.5" />
            )}
            Seed All Pipelines
          </Button>
        </div>

        {/* Template Grid */}
        <ScrollArea className="flex-1 min-h-0">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-1 pr-4 pb-4">
            {PIPELINE_TEMPLATES.map((template) => {
              const catConfig = CATEGORY_CONFIG[template.category];
              const isExpanded = expandedTemplates.has(template.id);
              const isLaunching = launchingId === template.id;
              const isLaunched = launchedIds.has(template.id);

              return (
                <div
                  key={template.id}
                  className={cn(
                    "rounded-xl border bg-card transition-all duration-200",
                    "hover:shadow-lg hover:shadow-black/5 hover:border-primary/20",
                    "group relative overflow-hidden",
                    isLaunched && "border-emerald-500/30"
                  )}
                >
                  {/* Category accent line */}
                  <div className={cn("h-1 w-full", catConfig.bgColor.replace("/10", "/40"))} />

                  <div className="p-5 space-y-4">
                    {/* Header */}
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-start gap-3">
                        <div className={cn(
                          "flex items-center justify-center h-10 w-10 rounded-lg shrink-0",
                          "bg-gradient-to-br from-amber-500/10 to-rose-500/10",
                          "border border-amber-500/20",
                          "text-xl"
                        )}>
                          {template.emoji}
                        </div>
                        <div className="min-w-0">
                          <h3 className="font-semibold text-sm leading-tight">{template.name}</h3>
                          <p className="text-[11px] text-muted-foreground mt-1 leading-relaxed line-clamp-2">
                            {template.description}
                          </p>
                        </div>
                      </div>
                    </div>

                    {/* Category Badge + Step Count */}
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge className={cn(
                        "h-5 text-[10px] border",
                        catConfig.bgColor,
                        catConfig.color,
                        catConfig.borderColor
                      )}>
                        {catConfig.label}
                      </Badge>
                      <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                        <Workflow className="h-3 w-3" />
                        {template.steps.length} steps
                      </div>
                      {template.steps.some((s) => s.approvalRequired) && (
                        <div className="flex items-center gap-1 text-[10px] text-yellow-400">
                          <AlertCircle className="h-3 w-3" />
                          {template.steps.filter((s) => s.approvalRequired).length} gates
                        </div>
                      )}
                    </div>

                    {/* Step Progress Bar */}
                    <div className="space-y-1">
                      <div className="flex items-center justify-between text-[9px] text-muted-foreground">
                        <span>Pipeline steps</span>
                        <span>{template.steps.length} / {template.steps.length}</span>
                      </div>
                      <div className="h-1.5 bg-muted rounded-full overflow-hidden flex gap-0.5">
                        {template.steps.map((step, i) => (
                          <div
                            key={i}
                            className={cn(
                              "h-full rounded-full flex-1 transition-all",
                              step.approvalRequired
                                ? "bg-yellow-500/60"
                                : "bg-violet-500/40"
                            )}
                          />
                        ))}
                      </div>
                      <div className="flex items-center gap-3 mt-1">
                        <div className="flex items-center gap-1 text-[8px] text-muted-foreground">
                          <div className="h-1.5 w-1.5 rounded-full bg-violet-500/40" />
                          Auto
                        </div>
                        <div className="flex items-center gap-1 text-[8px] text-muted-foreground">
                          <div className="h-1.5 w-1.5 rounded-full bg-yellow-500/60" />
                          Approval Gate
                        </div>
                      </div>
                    </div>

                    {/* Mini Flow Preview (always visible) */}
                    <div className="rounded-lg bg-muted/30 p-2.5 border border-border/30 overflow-x-auto">
                      <div className="flex items-center gap-0 min-w-max">
                        {template.steps.map((step, i) => (
                          <div key={i} className="flex items-center">
                            <div className="flex items-center gap-1.5">
                              <div className={cn(
                                "flex items-center justify-center h-5 px-2 rounded text-[9px] font-medium",
                                step.approvalRequired
                                  ? "bg-yellow-500/15 text-yellow-400 border border-yellow-500/30"
                                  : "bg-violet-500/10 text-violet-300 border border-violet-500/20"
                              )}>
                                {step.agentId.split("-")[0]}
                              </div>
                              {step.approvalRequired && (
                                <AlertCircle className="h-2.5 w-2.5 text-yellow-400" />
                              )}
                            </div>
                            {i < template.steps.length - 1 && (
                              <ArrowRight className="h-3 w-3 text-muted-foreground/40 mx-1 shrink-0" />
                            )}
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Action Buttons */}
                    <div className="flex items-center gap-2">
                      <Button
                        size="sm"
                        onClick={() => launchPipeline(template)}
                        disabled={isLaunching || isLaunched}
                        className={cn(
                          "h-8 text-xs gap-1.5 flex-1",
                          isLaunched
                            ? "bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 hover:bg-emerald-500/20"
                            : ""
                        )}
                        variant={isLaunched ? "outline" : "default"}
                      >
                        {isLaunching ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : isLaunched ? (
                          <CheckCircle className="h-3.5 w-3.5" />
                        ) : (
                          <Play className="h-3.5 w-3.5" />
                        )}
                        {isLaunched ? "Launched" : "Launch Pipeline"}
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => toggleExpanded(template.id)}
                        className="h-8 text-xs gap-1.5"
                      >
                        <Eye className="h-3.5 w-3.5" />
                        View Steps
                        {isExpanded ? (
                          <ChevronDown className="h-3 w-3" />
                        ) : (
                          <ChevronRight className="h-3 w-3" />
                        )}
                      </Button>
                    </div>

                    {/* Expanded Steps Detail */}
                    {isExpanded && <ExpandedSteps steps={template.steps} />}
                  </div>
                </div>
              );
            })}
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
