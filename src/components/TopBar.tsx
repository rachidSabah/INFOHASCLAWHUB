"use client";

import { useUIStore, useSettingsStore, useAgentStore, useSkillStore, useChatStore, useUpdateStore } from "@/lib/stores";
import { cn } from "@/lib/utils";
import { ClawHubLogo, ClawHubText } from "./ClawHubLogo";
import {
  PanelLeft, Settings, Bot, Zap, ChevronDown, Check, BarChart3, Activity, ArrowUpCircle, HeartPulse, BookOpen,
  Rocket, Workflow, Code2, Radio, Paintbrush, Database, Shield, Puzzle, MousePointerClick, Mic, GitBranch, Smartphone, Terminal, Search, Cpu, Server, Layout, GitMerge, GitFork, Sparkles, Wifi, LayoutTemplate, PanelRight,
  SlidersHorizontal,
  Brain, Lock, AlertTriangle, DollarSign, Target, Network, Wrench, FileCheck, Users,
  Eye, Gauge, Award, RotateCcw, Microscope, GitGraph, Waypoints, Receipt,
} from "lucide-react";
import { useEffect, useRef, useState, useMemo } from "react";
import { toast } from "sonner";
import { TokenDashboard } from "./TokenDashboard";
import { SystemMonitor } from "./SystemMonitor";
import { DoctorPanel } from "./DoctorPanel";

// 16 Enhancement Panels
import { AgentOrchestrationPanel } from "./enhancements/AgentOrchestrationPanel";
import { AutonomousCodingPanel } from "./enhancements/AutonomousCodingPanel";
import { ModelRouterPanel } from "./enhancements/ModelRouterPanel";
import { CodebaseIntelligencePanel } from "./enhancements/CodebaseIntelligencePanel";
import { AIPairTerminalPanel } from "./enhancements/AIPairTerminalPanel";
import { CommsHubPanel } from "./enhancements/CommsHubPanel";
import { UIBuilderPanel } from "./enhancements/UIBuilderPanel";
import { DatabaseStudioPanel } from "./enhancements/DatabaseStudioPanel";
import { DeployPipelinePanel } from "./enhancements/DeployPipelinePanel";
import { SecurityVaultPanel } from "./enhancements/SecurityVaultPanel";
import { AnalyticsPanel } from "./enhancements/AnalyticsPanel";
import { PluginMarketplacePanel } from "./enhancements/PluginMarketplacePanel";
import { QuickActionsPanel } from "./enhancements/QuickActionsPanel";
import { GitIntelligencePanel } from "./enhancements/GitIntelligencePanel";
import { MobileCompanionPanel } from "./enhancements/MobileCompanionPanel";
import { WebBridgeHubPanel } from "./enhancements/WebBridgeHubPanel";
import { KanbanPanel } from "./enhancements/KanbanPanel";
import { VoiceCodePipeline } from "./enhancements/VoiceCodePipeline";
import { ArchitectureMapper } from "./enhancements/ArchitectureMapper";
import { ConsensusPanel } from "./enhancements/ConsensusPanel";
import ArtifactPanel from "./enhancements/ArtifactPanel";
import NetworkInfoPanel from "./enhancements/NetworkInfoPanel";
import VisualCanvasPanel from "./enhancements/VisualCanvasPanel";
import { useArtifactPreviewStore } from "@/lib/artifact-store";
import AdvancedToolsDropdown, { type AdvancedTool } from "@/components/AdvancedToolsPanel";
import PromptLibraryDropdown from "@/components/PromptLibraryDropdown";

// Next-Gen Enhancement Panels
import { UniversalMemoryPanel } from "./enhancements/UniversalMemoryPanel";
import { CronSchedulerPanel } from "./enhancements/CronSchedulerPanel";
import { ResearchModePanel } from "./enhancements/ResearchModePanel";
import { IssuePipelinePanel } from "./enhancements/IssuePipelinePanel";
import { SelfImprovingPanel } from "./enhancements/SelfImprovingPanel";
import { HybridRouterPanel } from "./enhancements/HybridRouterPanel";
import { LiveSandboxPanel } from "./enhancements/LiveSandboxPanel";
import { MCPHubPanel } from "./enhancements/MCPHubPanel";
import { ComplianceEnginePanel } from "./enhancements/ComplianceEnginePanel";
import { CollaborationPanel } from "./enhancements/CollaborationPanel";

// Preconfigured System Panels
import { PrebuiltAgentsPanel } from "./enhancements/PrebuiltAgentsPanel";
import { PipelineTemplatesPanel } from "./enhancements/PipelineTemplatesPanel";

// Ruflo-Parity Panels (Tier 8)
import { SwarmCoordinationPanel } from "./enhancements/SwarmCoordinationPanel";
import { SONALearningPanel } from "./enhancements/SONALearningPanel";
import { FederationPanel } from "./enhancements/FederationPanel";
import { EncryptionVaultPanel } from "./enhancements/EncryptionVaultPanel";
import { AIDefencePanel } from "./enhancements/AIDefencePanel";
import { CostTrackerPanel } from "./enhancements/CostTrackerPanel";
import { GoalPlannerPanel } from "./enhancements/GoalPlannerPanel";
import { KnowledgeGraphPanel } from "./enhancements/KnowledgeGraphPanel";
import { BackgroundWorkersPanel } from "./enhancements/BackgroundWorkersPanel";
import { VerificationPanel } from "./enhancements/VerificationPanel";
import OptimizationPanel from "./enhancements/OptimizationPanel";
import TuningPanel from "./enhancements/TuningPanel";

// Next-Gen Pro Panels (Tier 9)
import { AgentLoopPanel } from "./enhancements/AgentLoopPanel";
import { ContextWindowPanel } from "./enhancements/ContextWindowPanel";
import { AgentEvaluationPanel } from "./enhancements/AgentEvaluationPanel";
import { MCPServerPanel } from "./enhancements/MCPServerPanel";
import { AgentReflectionPanel } from "./enhancements/AgentReflectionPanel";
import { DeepResearchPanel } from "./enhancements/DeepResearchPanel";
import { MemoryVisualizationPanel } from "./enhancements/MemoryVisualizationPanel";
import { TaskTypeDetectionPanel } from "./enhancements/TaskTypeDetectionPanel";
import { TokenTrackingPanel } from "./enhancements/TokenTrackingPanel";

const ADVANCED_TOOLS: AdvancedTool[] = [
  // Tier 5: New Generation
  { key: "artifacts", label: "AI Artifacts Studio", description: "Doc, sheet, slide, canvas AI", icon: Sparkles, color: "text-purple-500", category: "Creative Suite", onOpen: () => { (window as any).__setArtifactsOpen?.(true); } },
  { key: "network", label: "LAN Network Access", description: "Multi-device WiFi access", icon: Wifi, color: "text-blue-500", category: "System Tools", onOpen: () => { (window as any).__setNetworkInfoOpen?.(true); } },
  { key: "canvas", label: "Visual Canvas", description: "Fabric-like design editor", icon: LayoutTemplate, color: "text-indigo-500", category: "Creative Suite", onOpen: () => { (window as any).__setCanvasOpen?.(true); } },
  // Tier 6: Next-Gen OS
  { key: "memory", label: "Universal Memory", description: "Cross-session context & vector recall", icon: Sparkles, color: "text-rose-500", category: "AI Engine", onOpen: () => { (window as any).__setUniversalMemoryOpen?.(true); } },
  { key: "cron", label: "Cron Scheduler", description: "Always-on agents & scheduled tasks", icon: Activity, color: "text-amber-500", category: "Automation", onOpen: () => { (window as any).__setCronSchedulerOpen?.(true); } },
  { key: "research", label: "Deep Research", description: "Citations, sources & hallucination detect", icon: Search, color: "text-cyan-500", category: "AI Engine", onOpen: () => { (window as any).__setResearchModeOpen?.(true); } },
  { key: "issue-pipeline", label: "Issue → Deploy", description: "GitHub issue to deployed code", icon: GitBranch, color: "text-emerald-500", category: "DevOps", onOpen: () => { (window as any).__setIssuePipelineOpen?.(true); } },
  { key: "self-improving", label: "Self-Improving Agents", description: "Prompt optimization & reflection", icon: Sparkles, color: "text-violet-500", category: "AI Engine", onOpen: () => { (window as any).__setSelfImprovingOpen?.(true); } },
  { key: "hybrid-router", label: "Hybrid Router", description: "Local ↔ Cloud provider racing", icon: Cpu, color: "text-blue-500", category: "AI Engine", onOpen: () => { (window as any).__setHybridRouterOpen?.(true); } },
  { key: "sandbox", label: "Live Sandbox", description: "Instant app preview & deploy", icon: Code2, color: "text-teal-500", category: "DevOps", onOpen: () => { (window as any).__setLiveSandboxOpen?.(true); } },
  { key: "mcp-hub", label: "MCP Hub", description: "Model Context Protocol registry", icon: Puzzle, color: "text-purple-500", category: "AI Engine", onOpen: () => { (window as any).__setMcpHubOpen?.(true); } },
  { key: "compliance", label: "Compliance Engine", description: "Audit logs, policies & scanning", icon: Shield, color: "text-red-500", category: "Monitoring", onOpen: () => { (window as any).__setComplianceEngineOpen?.(true); } },
  { key: "collaboration", label: "Collaboration", description: "Real-time multiplayer sessions", icon: Radio, color: "text-indigo-500", category: "Orchestration", onOpen: () => { (window as any).__setCollaborationOpen?.(true); } },
  // Tier 7: Preconfigured OS
  { key: "prebuilt-agents", label: "Prebuilt Agents", description: "One-click agent activation", icon: Bot, color: "text-amber-500", category: "Preconfigured", onOpen: () => { (window as any).__setPrebuiltAgentsOpen?.(true); } },
  { key: "pipeline-templates", label: "Pipeline Templates", description: "7 production-ready pipelines", icon: Workflow, color: "text-emerald-500", category: "Preconfigured", onOpen: () => { (window as any).__setPipelineTemplatesOpen?.(true); } },
  // Tier 8: Enterprise AI Engine
  { key: "swarm", label: "Swarm Coordination", description: "Queen-led swarms with consensus", icon: Users, color: "text-violet-500", category: "Multi-Agent", onOpen: () => { (window as any).__setSwarmOpen?.(true); } },
  { key: "sona", label: "SONA Self-Learning", description: "Neural patterns & trajectory learning", icon: Brain, color: "text-cyan-500", category: "Multi-Agent", onOpen: () => { (window as any).__setSonaOpen?.(true); } },
  { key: "federation", label: "Zero-Trust Federation", description: "Cross-machine mTLS & PII scanning", icon: Network, color: "text-emerald-500", category: "Security", onOpen: () => { (window as any).__setFederationOpen?.(true); } },
  { key: "encryption", label: "Encryption Vault", description: "AES-256-GCM at-rest encryption", icon: Lock, color: "text-rose-500", category: "Security", onOpen: () => { (window as any).__setEncryptionOpen?.(true); } },
  { key: "ai-defence", label: "AI Defence System", description: "DeepSeek/Venice hallucination firewall", icon: AlertTriangle, color: "text-red-500", category: "Security", onOpen: () => { (window as any).__setAiDefenceOpen?.(true); } },
  { key: "cost-tracker", label: "Cost Tracker", description: "Per-token per-provider cost analytics", icon: DollarSign, color: "text-emerald-500", category: "Monitoring", onOpen: () => { (window as any).__setCostTrackerOpen?.(true); } },
  { key: "goal-planner", label: "Goal Planner", description: "AI roadmap with milestones", icon: Target, color: "text-amber-500", category: "AI Engine", onOpen: () => { (window as any).__setGoalPlannerOpen?.(true); } },
  { key: "knowledge-graph", label: "Knowledge Graph", description: "Visual entity relationship mapping", icon: Network, color: "text-sky-500", category: "AI Engine", onOpen: () => { (window as any).__setKnowledgeGraphOpen?.(true); } },
  { key: "bg-workers", label: "Background Workers", description: "Headless long-running task engine", icon: Wrench, color: "text-teal-500", category: "Automation", onOpen: () => { (window as any).__setBgWorkersOpen?.(true); } },
  { key: "verification", label: "Verification Engine", description: "Multi-source answer cross-check", icon: FileCheck, color: "text-violet-500", category: "AI Engine", onOpen: () => { (window as any).__setVerificationOpen?.(true); } },
  { key: "optimization", label: "Optimization Engine", description: "Prompt compression & token savings", icon: Zap, color: "text-amber-500", category: "AI Engine", onOpen: () => { (window as any).__setOptimizationOpen?.(true); } },
  // Tier 9: Next-Gen Pro
  { key: "agent-loop", label: "Agent Loop Viz", description: "Real-time agent execution DAG", icon: Eye, color: "text-violet-500", category: "AI Engine", onOpen: () => { (window as any).__setAgentLoopOpen?.(true); } },
  { key: "context-window", label: "Context Window", description: "Token usage & auto-summarize", icon: Gauge, color: "text-cyan-500", category: "AI Engine", onOpen: () => { (window as any).__setContextWindowOpen?.(true); } },
  { key: "agent-eval", label: "Agent Evaluation", description: "Benchmarks & performance tracking", icon: Award, color: "text-amber-500", category: "AI Engine", onOpen: () => { (window as any).__setAgentEvalOpen?.(true); } },
  { key: "mcp-server", label: "MCP Server", description: "Expose ClawHub to external tools", icon: Server, color: "text-emerald-500", category: "AI Engine", onOpen: () => { (window as any).__setMcpServerOpen?.(true); } },
  { key: "agent-reflection", label: "Agent Reflection", description: "LLM self-critique loop", icon: RotateCcw, color: "text-rose-500", category: "AI Engine", onOpen: () => { (window as any).__setAgentReflectionOpen?.(true); } },
  { key: "deep-research", label: "Deep Research Pro", description: "Iterative multi-step research", icon: Microscope, color: "text-indigo-500", category: "AI Engine", onOpen: () => { (window as any).__setDeepResearchOpen?.(true); } },
  { key: "memory-viz", label: "Memory Visualization", description: "Timeline, cluster & graph views", icon: GitGraph, color: "text-purple-500", category: "AI Engine", onOpen: () => { (window as any).__setMemoryVizOpen?.(true); } },
  { key: "task-type", label: "Task Type Detector", description: "Smart model routing by prompt", icon: Waypoints, color: "text-blue-500", category: "AI Engine", onOpen: () => { (window as any).__setTaskTypeOpen?.(true); } },
  { key: "token-tracking", label: "Token Tracking", description: "Real-time token count & costs", icon: Receipt, color: "text-teal-500", category: "Monitoring", onOpen: () => { (window as any).__setTokenTrackingOpen?.(true); } },
];

export function TopBar() {
  const { toggleSidebar, setSettingsOpen } = useUIStore();
  const { settings, updateSetting, modelGroups, fetchModels } = useSettingsStore();
  const { agents, activeAgentId, setActiveAgentId } = useAgentStore();
  const { skills, activeSkillId, setActiveSkillId } = useSkillStore();
  const { activeConversationId, getActiveConversation, updateConversation } = useChatStore();
  const { updateAvailable, setUpdateState } = useUpdateStore();

  const [agentDropdownOpen, setAgentDropdownOpen] = useState(false);
  const [skillDropdownOpen, setSkillDropdownOpen] = useState(false);
  const [modelDropdownOpen, setModelDropdownOpen] = useState(false);
  const [modelSearchQuery, setModelSearchQuery] = useState("");
  const [tokenDashboardOpen, setTokenDashboardOpen] = useState(false);
  const [systemMonitorOpen, setSystemMonitorOpen] = useState(false);
  const [doctorOpen, setDoctorOpen] = useState(false);
  const [powerToolsOpen, setPowerToolsOpen] = useState(false);
  const [advancedToolsOpen, setAdvancedToolsOpen] = useState(false);
  const [promptLibraryOpen, setPromptLibraryOpen] = useState(false);

  // 16 Enhancement panel open states
  const [orchestrationOpen, setOrchestrationOpen] = useState(false);
  const [codingLoopOpen, setCodingLoopOpen] = useState(false);
  const [modelRouterOpen, setModelRouterOpen] = useState(false);
  const [codebaseIntelOpen, setCodebaseIntelOpen] = useState(false);
  const [aiTerminalOpen, setAiTerminalOpen] = useState(false);
  const [commsHubOpen, setCommsHubOpen] = useState(false);
  const [uiBuilderOpen, setUiBuilderOpen] = useState(false);
  const [dbStudioOpen, setDbStudioOpen] = useState(false);
  const [deployOpen, setDeployOpen] = useState(false);
  const [securityVaultOpen, setSecurityVaultOpen] = useState(false);
  const [analyticsOpen, setAnalyticsOpen] = useState(false);
  const [pluginsOpen, setPluginsOpen] = useState(false);
  const [quickActionsOpen, setQuickActionsOpen] = useState(false);
  const [voiceCodingOpen, setVoiceCodingOpen] = useState(false);
  const [gitIntelOpen, setGitIntelOpen] = useState(false);
  const [architectureOpen, setArchitectureOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [webBridgeOpen, setWebBridgeOpen] = useState(false);
  const [kanbanOpen, setKanbanOpen] = useState(false);
  const [consensusOpen, setConsensusOpen] = useState(false);
  const [artifactsOpen, setArtifactsOpen] = useState(false);
  const [networkInfoOpen, setNetworkInfoOpen] = useState(false);
  const [canvasOpen, setCanvasOpen] = useState(false);

  // Next-Gen panel open states
  const [universalMemoryOpen, setUniversalMemoryOpen] = useState(false);
  const [cronSchedulerOpen, setCronSchedulerOpen] = useState(false);
  const [researchModeOpen, setResearchModeOpen] = useState(false);
  const [issuePipelineOpen, setIssuePipelineOpen] = useState(false);
  const [selfImprovingOpen, setSelfImprovingOpen] = useState(false);
  const [hybridRouterOpen, setHybridRouterOpen] = useState(false);
  const [liveSandboxOpen, setLiveSandboxOpen] = useState(false);
  const [mcpHubOpen, setMcpHubOpen] = useState(false);
  const [complianceEngineOpen, setComplianceEngineOpen] = useState(false);
  const [collaborationOpen, setCollaborationOpen] = useState(false);

  // Preconfigured System panel open states
  const [prebuiltAgentsOpen, setPrebuiltAgentsOpen] = useState(false);
  const [pipelineTemplatesOpen, setPipelineTemplatesOpen] = useState(false);

  // Ruflo-Parity panel open states (Tier 8)
  const [swarmOpen, setSwarmOpen] = useState(false);
  const [sonaOpen, setSonaOpen] = useState(false);
  const [federationOpen, setFederationOpen] = useState(false);
  const [encryptionOpen, setEncryptionOpen] = useState(false);
  const [aiDefenceOpen, setAiDefenceOpen] = useState(false);
  const [costTrackerOpen, setCostTrackerOpen] = useState(false);
  const [goalPlannerOpen, setGoalPlannerOpen] = useState(false);
  const [knowledgeGraphOpen, setKnowledgeGraphOpen] = useState(false);
  const [bgWorkersOpen, setBgWorkersOpen] = useState(false);
  const [verificationOpen, setVerificationOpen] = useState(false);
  const [optimizationOpen, setOptimizationOpen] = useState(false);
  const [tuningOpen, setTuningOpen] = useState(false);

  // Next-Gen Pro panel open states (Tier 9)
  const [agentLoopOpen, setAgentLoopOpen] = useState(false);
  const [contextWindowOpen, setContextWindowOpen] = useState(false);
  const [agentEvalOpen, setAgentEvalOpen] = useState(false);
  const [mcpServerOpen, setMcpServerOpen] = useState(false);
  const [agentReflectionOpen, setAgentReflectionOpen] = useState(false);
  const [deepResearchOpen, setDeepResearchOpen] = useState(false);
  const [memoryVizOpen, setMemoryVizOpen] = useState(false);
  const [taskTypeOpen, setTaskTypeOpen] = useState(false);
  const [tokenTrackingOpen, setTokenTrackingOpen] = useState(false);

  const agentRef = useRef<HTMLDivElement>(null);
  const skillRef = useRef<HTMLDivElement>(null);
  const modelRef = useRef<HTMLDivElement>(null);
  const powerToolsRef = useRef<HTMLDivElement>(null);
  const advancedToolsRef = useRef<HTMLDivElement>(null);

  // Expose state setters for Advanced Tools callbacks
  useEffect(() => {
    (window as any).__setArtifactsOpen = setArtifactsOpen;
    (window as any).__setNetworkInfoOpen = setNetworkInfoOpen;
    (window as any).__setCanvasOpen = setCanvasOpen;
    (window as any).__setUniversalMemoryOpen = setUniversalMemoryOpen;
    (window as any).__setCronSchedulerOpen = setCronSchedulerOpen;
    (window as any).__setResearchModeOpen = setResearchModeOpen;
    (window as any).__setIssuePipelineOpen = setIssuePipelineOpen;
    (window as any).__setSelfImprovingOpen = setSelfImprovingOpen;
    (window as any).__setHybridRouterOpen = setHybridRouterOpen;
    (window as any).__setLiveSandboxOpen = setLiveSandboxOpen;
    (window as any).__setMcpHubOpen = setMcpHubOpen;
    (window as any).__setComplianceEngineOpen = setComplianceEngineOpen;
    (window as any).__setCollaborationOpen = setCollaborationOpen;
    (window as any).__setPrebuiltAgentsOpen = setPrebuiltAgentsOpen;
    (window as any).__setPipelineTemplatesOpen = setPipelineTemplatesOpen;
    (window as any).__setSwarmOpen = setSwarmOpen;
    (window as any).__setSonaOpen = setSonaOpen;
    (window as any).__setFederationOpen = setFederationOpen;
    (window as any).__setEncryptionOpen = setEncryptionOpen;
    (window as any).__setAiDefenceOpen = setAiDefenceOpen;
    (window as any).__setCostTrackerOpen = setCostTrackerOpen;
    (window as any).__setGoalPlannerOpen = setGoalPlannerOpen;
    (window as any).__setKnowledgeGraphOpen = setKnowledgeGraphOpen;
    (window as any).__setBgWorkersOpen = setBgWorkersOpen;
    (window as any).__setVerificationOpen = setVerificationOpen;
    (window as any).__setOptimizationOpen = setOptimizationOpen;
    (window as any).__setAgentLoopOpen = setAgentLoopOpen;
    (window as any).__setContextWindowOpen = setContextWindowOpen;
    (window as any).__setAgentEvalOpen = setAgentEvalOpen;
    (window as any).__setMcpServerOpen = setMcpServerOpen;
    (window as any).__setAgentReflectionOpen = setAgentReflectionOpen;
    (window as any).__setDeepResearchOpen = setDeepResearchOpen;
    (window as any).__setMemoryVizOpen = setMemoryVizOpen;
    (window as any).__setTaskTypeOpen = setTaskTypeOpen;
    (window as any).__setTokenTrackingOpen = setTokenTrackingOpen;
  }, []);

  // Load models on mount + periodic refresh
  useEffect(() => {
    fetchModels().catch(() => {});
    const interval = setInterval(() => fetchModels().catch(() => {}), 300000); // 5 min
    return () => clearInterval(interval);
  }, [fetchModels]);

  // Re-fetch models when providers change (via settings store)
  const providerCount = useSettingsStore((s) => 
    s.settings?.providers ? Object.keys(s.settings.providers).length : 0
  );
  useEffect(() => {
    fetchModels().catch(() => {});
  }, [providerCount, fetchModels]);

  // Close dropdowns on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (agentRef.current && !agentRef.current.contains(e.target as Node)) setAgentDropdownOpen(false);
      if (skillRef.current && !skillRef.current.contains(e.target as Node)) setSkillDropdownOpen(false);
      if (modelRef.current && !modelRef.current.contains(e.target as Node)) setModelDropdownOpen(false);
      if (powerToolsRef.current && !powerToolsRef.current.contains(e.target as Node)) setPowerToolsOpen(false);
      if (advancedToolsRef.current && !advancedToolsRef.current.contains(e.target as Node)) setAdvancedToolsOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const activeConversation = getActiveConversation();
  const currentModelId = activeConversation ? activeConversation.model : settings.defaultModel;

  const activeAgent = agents.find(a => a.id === activeAgentId);
  const activeSkill = skills.find(s => s.id === activeSkillId);

  // Flatten all models to find the active model display name
  const allModels = modelGroups.flatMap(g => g.models).filter((m, i, arr) => arr.findIndex(x => x.id === m.id) === i);
  const activeModel = allModels.find(m => m.id === currentModelId);

  const handleModelChange = async (modelId: string) => {
    if (activeConversationId) {
      updateConversation(activeConversationId, { model: modelId });
      try {
        await fetch(`/api/conversations/${activeConversationId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ model: modelId }),
        });
        toast.success(`Model updated to ${modelId} for this chat`);
      } catch {
        toast.error("Failed to save model change");
      }
    } else {
      updateSetting("defaultModel", modelId);
      try {
        await fetch("/api/settings", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ defaultModel: modelId }),
        });
        toast.success(`Default model set to ${modelId}`);
      } catch {
        toast.error("Failed to save default model");
      }
    }
    setModelDropdownOpen(false);
  };

  return (
    <div className="h-10 lg:h-12 flex items-center gap-1.5 lg:gap-2 px-2 lg:px-3 border-b border-border bg-card/30 shrink-0">
      {/* Sidebar toggle */}
      <button onClick={toggleSidebar} className="p-1.5 rounded-md hover:bg-muted transition-colors text-muted-foreground hover:text-foreground" title="Toggle sidebar (Ctrl+B)">
        <PanelLeft className="h-4 w-4" />
      </button>

      {/* Logo */}
      <div className="flex items-center gap-1.5 mr-1 lg:mr-2">
        <ClawHubLogo size={20} />
        <span className="topbar-logo-text"><ClawHubText className="text-sm" /></span>
        {updateAvailable && (
          <button
            onClick={() => setUpdateState({ updateDialogOpen: true })}
            className="relative flex items-center"
            title="Update available"
          >
            <ArrowUpCircle className="h-4 w-4 text-primary animate-pulse" />
            <span className="absolute -top-0.5 -right-0.5 flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full rounded-full bg-primary opacity-75 animate-ping" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-primary" />
            </span>
          </button>
        )}
      </div>

      {/* Agent selector */}
      <div ref={agentRef} className="relative">
        <button
          onClick={() => { setAgentDropdownOpen(!agentDropdownOpen); setSkillDropdownOpen(false); setModelDropdownOpen(false); }}
          className={cn("flex items-center gap-1 px-2 lg:px-2.5 py-1 lg:py-1.5 rounded-lg text-xs font-medium transition-colors border",
            activeAgent ? "border-primary/30 bg-primary/5 text-primary" : "border-border hover:border-primary/20 hover:bg-muted/30 text-muted-foreground"
          )}
        >
          <Bot className="h-3.5 w-3.5" />
          <span className="topbar-dropdown-text max-w-[80px] lg:max-w-[100px] truncate">{activeAgent?.name || "Agent"}</span>
          <ChevronDown className="h-3 w-3 opacity-60" />
        </button>
        {agentDropdownOpen && (
          <div className="absolute top-full left-0 mt-1 w-64 bg-popover border border-border rounded-xl shadow-xl z-50 animate-fade-in overflow-hidden">
            <div className="p-2 border-b border-border max-h-60 overflow-y-auto space-y-0.5">
              <button
                onClick={() => { setActiveAgentId(null); setAgentDropdownOpen(false); }}
                className={cn("w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-xs transition-colors text-left",
                  !activeAgentId ? "bg-primary/10 text-primary font-medium" : "hover:bg-muted")}
              >
                <Bot className="h-3.5 w-3.5" />
                <span className="font-medium">Default Assistant</span>
              </button>
              {agents.map((agent) => (
                <button
                  key={agent.id}
                  onClick={() => { setActiveAgentId(agent.id); setAgentDropdownOpen(false); }}
                  className={cn("w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-xs transition-colors text-left",
                    activeAgentId === agent.id ? "bg-primary/10 text-primary font-medium" : "hover:bg-muted")}
                >
                  <Bot className="h-3.5 w-3.5" />
                  <span className="truncate">{agent.name}</span>
                </button>
              ))}
            </div>
            <div className="p-2 bg-muted/20">
              <button
                onClick={() => { setSettingsOpen(true); setAgentDropdownOpen(false); }}
                className="w-full text-center py-1.5 text-xs font-semibold text-primary hover:underline"
              >
                Manage Agents in Settings
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Skill selector */}
      <div ref={skillRef} className="relative">
        <button
          onClick={() => { setSkillDropdownOpen(!skillDropdownOpen); setAgentDropdownOpen(false); setModelDropdownOpen(false); }}
          className={cn("flex items-center gap-1 px-2 lg:px-2.5 py-1 lg:py-1.5 rounded-lg text-xs font-medium transition-colors border",
            activeSkill ? "border-amber-500/30 bg-amber-500/5 text-amber-500" : "border-border hover:border-amber-500/20 hover:bg-muted/30 text-muted-foreground"
          )}
        >
          <Zap className="h-3.5 w-3.5" />
          <span className="topbar-dropdown-text max-w-[60px] lg:max-w-[80px] truncate">{activeSkill?.name || "Skill"}</span>
          <ChevronDown className="h-3 w-3 opacity-60" />
        </button>
        {skillDropdownOpen && (
          <div className="absolute top-full left-0 mt-1 w-56 bg-popover border border-border rounded-xl shadow-xl z-50 animate-fade-in overflow-hidden">
            <div className="p-2 max-h-60 overflow-y-auto space-y-0.5">
              <button onClick={() => { setActiveSkillId(null); setSkillDropdownOpen(false); }}
                className={cn("w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-xs transition-colors text-left",
                  !activeSkillId ? "bg-amber-500/10 text-amber-500 font-medium" : "hover:bg-muted")}
              >
                <Zap className="h-3.5 w-3.5" /> <span className="font-medium">No Skill</span>
              </button>
              {skills.map((skill) => (
                <button key={skill.id} onClick={() => { setActiveSkillId(skill.id); setSkillDropdownOpen(false); }}
                  className={cn("w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-xs transition-colors text-left",
                    activeSkillId === skill.id ? "bg-amber-500/10 text-amber-500 font-medium" : "hover:bg-muted")}>
                  <Zap className="h-3.5 w-3.5" />
                  <span className="truncate">{skill.name}</span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Model selector */}
      <div ref={modelRef} className="relative">
        <button
          onClick={() => {
            setModelDropdownOpen(!modelDropdownOpen);
            setAgentDropdownOpen(false);
            setSkillDropdownOpen(false);
            setModelSearchQuery("");
            if (!modelDropdownOpen) fetchModels().catch(() => {});
          }}
          className="flex items-center gap-1 px-2 lg:px-2.5 py-1 lg:py-1.5 rounded-lg text-xs font-medium border border-border hover:border-primary/20 hover:bg-muted/30 text-muted-foreground hover:text-foreground transition-colors"
        >
          <span className="max-w-[120px] lg:max-w-[150px] truncate">{activeModel?.name || currentModelId}</span>
          <ChevronDown className="h-3 w-3 opacity-60" />
        </button>
        {modelDropdownOpen && (
          <div className="absolute top-full left-0 mt-1 w-80 bg-popover border border-border rounded-xl shadow-xl z-50 animate-fade-in overflow-hidden">
            {/* Search input */}
            <div className="p-2 border-b border-border/40">
              <div className="relative">
                <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <input
                  type="text"
                  value={modelSearchQuery}
                  onChange={(e) => setModelSearchQuery(e.target.value)}
                  placeholder="Search models..."
                  className="w-full pl-7 pr-2 py-1.5 text-xs rounded-md border border-border bg-background focus:outline-none focus:ring-1 focus:ring-primary/30 placeholder:text-muted-foreground"
                  autoFocus
                />
              </div>
            </div>
            <div className="max-h-72 overflow-y-auto p-2 space-y-3">
              {modelGroups
                .map(group => ({
                  ...group,
                  models: group.models
                    .filter((m, i, a) => a.findIndex(x => x.id === m.id) === i)
                    .filter(m => {
                      if (!modelSearchQuery.trim()) return true;
                      const q = modelSearchQuery.toLowerCase();
                      return m.name.toLowerCase().includes(q) || 
                             m.id.toLowerCase().includes(q) || 
                             m.description.toLowerCase().includes(q) ||
                             group.name.toLowerCase().includes(q);
                    })
                }))
                .filter(group => group.models.length > 0)
                .map((group) => (
                <div key={group.name} className="space-y-1">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground px-2 py-0.5 border-b border-border/40">
                    {group.name}
                  </p>
                  <div className="space-y-0.5">
                    {group.models.map((model) => (
                      <button
                        key={model.id}
                        onClick={() => handleModelChange(model.id)}
                        className={cn("w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-xs transition-colors text-left",
                          currentModelId === model.id ? "bg-primary/10 text-primary font-medium" : "hover:bg-muted")}
                      >
                        <div className="flex-1 min-w-0">
                          <p className="truncate font-semibold">{model.name}</p>
                          <p className="text-[10px] text-muted-foreground truncate">{model.description}</p>
                        </div>
                        {currentModelId === model.id && <Check className="h-3.5 w-3.5 text-primary shrink-0" />}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
              {allModels.length === 0 && (
                <p className="text-xs text-muted-foreground text-center py-4">No models available.</p>
              )}
              {modelSearchQuery.trim() && allModels.filter(m => {
                const q = modelSearchQuery.toLowerCase();
                return m.name.toLowerCase().includes(q) || m.id.toLowerCase().includes(q) || m.description.toLowerCase().includes(q);
              }).length === 0 && (
                <p className="text-xs text-muted-foreground text-center py-4">No models match "{modelSearchQuery}"</p>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Tuning Settings */}
      <button
        onClick={() => setTuningOpen(true)}
        className="p-1.5 rounded-md hover:bg-muted transition-colors text-muted-foreground hover:text-foreground shrink-0"
        title="Model Tuning Settings"
      >
        <SlidersHorizontal className="h-4 w-4" />
      </button>

      {/* Spacer */}
      <div className="flex-1" />

      {/* Advanced Tools Dropdown */}
      <div ref={advancedToolsRef} className="relative">
        <button
          onClick={() => { setAdvancedToolsOpen(!advancedToolsOpen); setPowerToolsOpen(false); }}
          className={cn("flex items-center gap-1 px-2 lg:px-2.5 py-1 lg:py-1.5 rounded-lg text-xs font-medium transition-colors border",
            advancedToolsOpen ? "border-orange-500/30 bg-orange-500/5 text-orange-500" : "border-border hover:border-orange-500/20 hover:bg-muted/30 text-muted-foreground"
          )}
          title="Advanced Tools — Enterprise & AI Engine"
        >
          <Zap className="h-3.5 w-3.5" />
          <span className="topbar-dropdown-text">Advanced</span>
          <ChevronDown className={cn("h-3 w-3 opacity-60 transition-transform", advancedToolsOpen && "rotate-180")} />
        </button>
        <AdvancedToolsDropdown
          open={advancedToolsOpen}
          onOpenChange={setAdvancedToolsOpen}
          tools={useMemo(() => ADVANCED_TOOLS, [])}
        />
      </div>

      {/* Power Tools Dropdown */}
      <div ref={powerToolsRef} className="relative">
        <button
          onClick={() => { setPowerToolsOpen(!powerToolsOpen); setAdvancedToolsOpen(false); }}
          className={cn("flex items-center gap-1 px-2 lg:px-2.5 py-1 lg:py-1.5 rounded-lg text-xs font-medium transition-colors border",
            powerToolsOpen ? "border-primary/30 bg-primary/5 text-primary" : "border-border hover:border-primary/20 hover:bg-muted/30 text-muted-foreground"
          )}
          title="Power Tools — AI Enhancement Features"
        >
          <Rocket className="h-3.5 w-3.5" />
          <span className="topbar-dropdown-text">Power Tools</span>
          <ChevronDown className={cn("h-3 w-3 opacity-60 transition-transform", powerToolsOpen && "rotate-180")} />
        </button>
        {powerToolsOpen && (
          <div className="absolute top-full right-0 mt-1 w-72 bg-popover border border-border rounded-xl shadow-xl z-50 animate-fade-in overflow-hidden">
            <div className="p-1.5 border-b border-border">
              <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground px-2 py-1">Tier 1: Game-Changers</p>
            </div>
            <div className="p-1.5 space-y-0.5 max-h-[70vh] overflow-y-auto">
              <button onClick={() => { setOrchestrationOpen(true); setPowerToolsOpen(false); }} className="w-full flex items-center gap-2.5 px-2 py-1.5 rounded-md text-xs transition-colors text-left hover:bg-muted">
                <Workflow className="h-3.5 w-3.5 text-violet-500" /><div><span className="font-medium">Agent Orchestration</span><p className="text-[10px] text-muted-foreground">Visual pipeline builder</p></div>
              </button>
              <button onClick={() => { setCodingLoopOpen(true); setPowerToolsOpen(false); }} className="w-full flex items-center gap-2.5 px-2 py-1.5 rounded-md text-xs transition-colors text-left hover:bg-muted">
                <Code2 className="h-3.5 w-3.5 text-blue-500" /><div><span className="font-medium">Autonomous Coding</span><p className="text-[10px] text-muted-foreground">Plan→Code→Test→Fix→Commit</p></div>
              </button>
              <button onClick={() => { setModelRouterOpen(true); setPowerToolsOpen(false); }} className="w-full flex items-center gap-2.5 px-2 py-1.5 rounded-md text-xs transition-colors text-left hover:bg-muted">
                <Cpu className="h-3.5 w-3.5 text-emerald-500" /><div><span className="font-medium">Model Router</span><p className="text-[10px] text-muted-foreground">Smart AI model switching</p></div>
              </button>
              <button onClick={() => { setCodebaseIntelOpen(true); setPowerToolsOpen(false); }} className="w-full flex items-center gap-2.5 px-2 py-1.5 rounded-md text-xs transition-colors text-left hover:bg-muted">
                <Search className="h-3.5 w-3.5 text-cyan-500" /><div><span className="font-medium">Codebase Intelligence</span><p className="text-[10px] text-muted-foreground">Semantic search & security</p></div>
              </button>
              <button onClick={() => { setAiTerminalOpen(true); setPowerToolsOpen(false); }} className="w-full flex items-center gap-2.5 px-2 py-1.5 rounded-md text-xs transition-colors text-left hover:bg-muted">
                <Terminal className="h-3.5 w-3.5 text-amber-500" /><div><span className="font-medium">AI Pair Terminal</span><p className="text-[10px] text-muted-foreground">AI watches your terminal</p></div>
              </button>
              <button onClick={() => { setKanbanOpen(true); setPowerToolsOpen(false); }} className="w-full flex items-center gap-2.5 px-2 py-1.5 rounded-md text-xs transition-colors text-left hover:bg-muted">
                <Layout className="h-3.5 w-3.5 text-teal-500" /><div><span className="font-medium">Kanban Board</span><p className="text-[10px] text-muted-foreground">Task management with agents</p></div>
              </button>
              <button onClick={() => { setArchitectureOpen(true); setPowerToolsOpen(false); }} className="w-full flex items-center gap-2.5 px-2 py-1.5 rounded-md text-xs transition-colors text-left hover:bg-muted">
                <GitFork className="h-3.5 w-3.5 text-cyan-500" /><div><span className="font-medium">Architecture Mapper</span><p className="text-[10px] text-muted-foreground">Codebase visualization & deps</p></div>
              </button>
              <div className="border-t border-border my-1" />
              <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground px-2 py-1">Tier 2: Power Features</p>
              <button onClick={() => { setCommsHubOpen(true); setPowerToolsOpen(false); }} className="w-full flex items-center gap-2.5 px-2 py-1.5 rounded-md text-xs transition-colors text-left hover:bg-muted">
                <Radio className="h-3.5 w-3.5 text-green-500" /><div><span className="font-medium">Comms Hub</span><p className="text-[10px] text-muted-foreground">WhatsApp/Telegram/Discord/Slack</p></div>
              </button>
              <button onClick={() => { setConsensusOpen(true); setPowerToolsOpen(false); }} className="w-full flex items-center gap-2.5 px-2 py-1.5 rounded-md text-xs transition-colors text-left hover:bg-muted">
                <GitMerge className="h-3.5 w-3.5 text-amber-500" /><div><span className="font-medium">Cross-Provider Consensus</span><p className="text-[10px] text-muted-foreground">Ensemble voting across models</p></div>
              </button>
              <button onClick={() => { setUiBuilderOpen(true); setPowerToolsOpen(false); }} className="w-full flex items-center gap-2.5 px-2 py-1.5 rounded-md text-xs transition-colors text-left hover:bg-muted">
                <Paintbrush className="h-3.5 w-3.5 text-pink-500" /><div><span className="font-medium">Visual UI Builder</span><p className="text-[10px] text-muted-foreground">Screenshot → Component</p></div>
              </button>
              <button onClick={() => { setDbStudioOpen(true); setPowerToolsOpen(false); }} className="w-full flex items-center gap-2.5 px-2 py-1.5 rounded-md text-xs transition-colors text-left hover:bg-muted">
                <Database className="h-3.5 w-3.5 text-orange-500" /><div><span className="font-medium">Database Studio</span><p className="text-[10px] text-muted-foreground">AI-powered DB management</p></div>
              </button>
              <div className="border-t border-border my-1" />
              <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground px-2 py-1">Tier 3: Pro Features</p>
              <button onClick={() => { setDeployOpen(true); setPowerToolsOpen(false); }} className="w-full flex items-center gap-2.5 px-2 py-1.5 rounded-md text-xs transition-colors text-left hover:bg-muted">
                <Rocket className="h-3.5 w-3.5 text-indigo-500" /><div><span className="font-medium">Deploy Pipeline</span><p className="text-[10px] text-muted-foreground">One-click deploy & CI/CD</p></div>
              </button>
              <button onClick={() => { setSecurityVaultOpen(true); setPowerToolsOpen(false); }} className="w-full flex items-center gap-2.5 px-2 py-1.5 rounded-md text-xs transition-colors text-left hover:bg-muted">
                <Shield className="h-3.5 w-3.5 text-red-500" /><div><span className="font-medium">Security Vault</span><p className="text-[10px] text-muted-foreground">Secret scanner & compliance</p></div>
              </button>
              <button onClick={() => { setAnalyticsOpen(true); setPowerToolsOpen(false); }} className="w-full flex items-center gap-2.5 px-2 py-1.5 rounded-md text-xs transition-colors text-left hover:bg-muted">
                <BarChart3 className="h-3.5 w-3.5 text-teal-500" /><div><span className="font-medium">Analytics & Insights</span><p className="text-[10px] text-muted-foreground">Token usage & AI metrics</p></div>
              </button>
              <button onClick={() => { setPluginsOpen(true); setPowerToolsOpen(false); }} className="w-full flex items-center gap-2.5 px-2 py-1.5 rounded-md text-xs transition-colors text-left hover:bg-muted">
                <Puzzle className="h-3.5 w-3.5 text-purple-500" /><div><span className="font-medium">Plugin Marketplace</span><p className="text-[10px] text-muted-foreground">Community extensions</p></div>
              </button>
              <div className="border-t border-border my-1" />
              <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground px-2 py-1">Tier 4: Differentiators</p>
              <button onClick={() => { setQuickActionsOpen(true); setPowerToolsOpen(false); }} className="w-full flex items-center gap-2.5 px-2 py-1.5 rounded-md text-xs transition-colors text-left hover:bg-muted">
                <MousePointerClick className="h-3.5 w-3.5 text-lime-500" /><div><span className="font-medium">Quick Actions</span><p className="text-[10px] text-muted-foreground">Right-click AI actions</p></div>
              </button>
              <button onClick={() => { setVoiceCodingOpen(true); setPowerToolsOpen(false); }} className="w-full flex items-center gap-2.5 px-2 py-1.5 rounded-md text-xs transition-colors text-left hover:bg-muted">
                <Mic className="h-3.5 w-3.5 text-rose-500" /><div><span className="font-medium">Voice-to-Code Pipeline</span><p className="text-[10px] text-muted-foreground">Speak → AI generates code</p></div>
              </button>
              <button onClick={() => { setGitIntelOpen(true); setPowerToolsOpen(false); }} className="w-full flex items-center gap-2.5 px-2 py-1.5 rounded-md text-xs transition-colors text-left hover:bg-muted">
                <GitBranch className="h-3.5 w-3.5 text-sky-500" /><div><span className="font-medium">Git Intelligence</span><p className="text-[10px] text-muted-foreground">AI commits & PR reviews</p></div>
              </button>
              <button onClick={() => { setMobileOpen(true); setPowerToolsOpen(false); }} className="w-full flex items-center gap-2.5 px-2 py-1.5 rounded-md text-xs transition-colors text-left hover:bg-muted">
                <Smartphone className="h-3.5 w-3.5 text-fuchsia-500" /><div><span className="font-medium">Mobile Companion</span><p className="text-[10px] text-muted-foreground">Monitor from your phone</p></div>
              </button>
              <button onClick={() => { setWebBridgeOpen(true); setPowerToolsOpen(false); }} className="w-full flex items-center gap-2.5 px-2 py-1.5 rounded-md text-xs transition-colors text-left hover:bg-muted">
                <Server className="h-3.5 w-3.5 text-blue-500" /><div><span className="font-medium">Web Bridges</span><p className="text-[10px] text-muted-foreground">Free AI via browser tokens</p></div>
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Doctor */}
      <button
        onClick={() => {
          const store = useArtifactPreviewStore.getState();
          if (!store.isOpen) {
            store.setOpen(true);
            if (store.tabs.length === 0) {
              const msgs = useChatStore.getState().messages;
              const lastAssistant = [...msgs].reverse().find(m => m.role === "assistant");
              if (lastAssistant?.content) {
                store.addTab({
                  id: `tab-${Date.now()}`,
                  title: lastAssistant.content.split("\n")[0]?.replace(/^#+\s*/, "").slice(0, 60) || "Response",
                  type: "markdown",
                  content: lastAssistant.content,
                  isPinned: false,
                  isStreaming: false,
                  createdAt: Date.now(),
                });
              }
            }
          } else {
            store.setOpen(false);
          }
        }}
        className="p-1.5 rounded-md hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
        title="Toggle Artifact Preview Panel"
      >
        <PanelRight className="h-4 w-4" />
      </button>

      {/* Prompt Library */}
      <div className="relative">
        <button
          onClick={() => setPromptLibraryOpen(!promptLibraryOpen)}
          className="p-1.5 rounded-md hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
          title="Prompt Library"
        >
          <BookOpen className="h-4 w-4" />
        </button>
        <PromptLibraryDropdown open={promptLibraryOpen} onOpenChange={setPromptLibraryOpen} />
      </div>

      {/* Doctor */}
      <button
        onClick={() => setDoctorOpen(true)}
        className="p-1.5 rounded-md hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
        title="ClawHub Doctor"
      >
        <HeartPulse className="h-4 w-4" />
      </button>

      {/* System Monitor */}
      <button
        onClick={() => setSystemMonitorOpen(true)}
        className="p-1.5 rounded-md hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
        title="System Monitor"
      >
        <Activity className="h-4 w-4" />
      </button>

      {/* Token Dashboard */}
      <button
        onClick={() => setTokenDashboardOpen(true)}
        className="p-1.5 rounded-md hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
        title="Token Usage Dashboard"
      >
        <BarChart3 className="h-4 w-4" />
      </button>

      {/* Settings */}
      <button onClick={() => setSettingsOpen(true)} className="p-1.5 rounded-md hover:bg-muted transition-colors text-muted-foreground hover:text-foreground" title="Settings (Ctrl+,)">
        <Settings className="h-4 w-4" />
      </button>

      <TokenDashboard open={tokenDashboardOpen} onOpenChange={setTokenDashboardOpen} />
      <SystemMonitor open={systemMonitorOpen} onOpenChange={setSystemMonitorOpen} />
      <DoctorPanel open={doctorOpen} onOpenChange={setDoctorOpen} />

      {/* 16 Enhancement Panels */}
      <AgentOrchestrationPanel open={orchestrationOpen} onOpenChange={setOrchestrationOpen} />
      <AutonomousCodingPanel open={codingLoopOpen} onOpenChange={setCodingLoopOpen} />
      <ModelRouterPanel open={modelRouterOpen} onOpenChange={setModelRouterOpen} />
      <CodebaseIntelligencePanel open={codebaseIntelOpen} onOpenChange={setCodebaseIntelOpen} />
      <AIPairTerminalPanel open={aiTerminalOpen} onOpenChange={setAiTerminalOpen} />
      <CommsHubPanel open={commsHubOpen} onOpenChange={setCommsHubOpen} />
      <UIBuilderPanel open={uiBuilderOpen} onOpenChange={setUiBuilderOpen} />
      <DatabaseStudioPanel open={dbStudioOpen} onOpenChange={setDbStudioOpen} />
      <DeployPipelinePanel open={deployOpen} onOpenChange={setDeployOpen} />
      <SecurityVaultPanel open={securityVaultOpen} onOpenChange={setSecurityVaultOpen} />
      <AnalyticsPanel open={analyticsOpen} onOpenChange={setAnalyticsOpen} />
      <PluginMarketplacePanel open={pluginsOpen} onOpenChange={setPluginsOpen} />
      <QuickActionsPanel open={quickActionsOpen} onOpenChange={setQuickActionsOpen} />
      <VoiceCodePipeline open={voiceCodingOpen} onOpenChange={setVoiceCodingOpen} />
      <GitIntelligencePanel open={gitIntelOpen} onOpenChange={setGitIntelOpen} />
      <ArchitectureMapper open={architectureOpen} onOpenChange={setArchitectureOpen} />
      <MobileCompanionPanel open={mobileOpen} onOpenChange={setMobileOpen} />
      <WebBridgeHubPanel open={webBridgeOpen} onOpenChange={setWebBridgeOpen} />
      <KanbanPanel open={kanbanOpen} onOpenChange={setKanbanOpen} />
      <ConsensusPanel open={consensusOpen} onOpenChange={setConsensusOpen} />
      <ArtifactPanel open={artifactsOpen} onOpenChange={setArtifactsOpen} />
      <NetworkInfoPanel open={networkInfoOpen} onOpenChange={setNetworkInfoOpen} />
      <VisualCanvasPanel open={canvasOpen} onOpenChange={setCanvasOpen} />

      {/* Next-Gen Enhancement Panels */}
      <UniversalMemoryPanel open={universalMemoryOpen} onOpenChange={setUniversalMemoryOpen} />
      <CronSchedulerPanel open={cronSchedulerOpen} onOpenChange={setCronSchedulerOpen} />
      <ResearchModePanel open={researchModeOpen} onOpenChange={setResearchModeOpen} />
      <IssuePipelinePanel open={issuePipelineOpen} onOpenChange={setIssuePipelineOpen} />
      <SelfImprovingPanel open={selfImprovingOpen} onOpenChange={setSelfImprovingOpen} />
      <HybridRouterPanel open={hybridRouterOpen} onOpenChange={setHybridRouterOpen} />
      <LiveSandboxPanel open={liveSandboxOpen} onOpenChange={setLiveSandboxOpen} />
      <MCPHubPanel open={mcpHubOpen} onOpenChange={setMcpHubOpen} />
      <ComplianceEnginePanel open={complianceEngineOpen} onOpenChange={setComplianceEngineOpen} />
      <CollaborationPanel open={collaborationOpen} onOpenChange={setCollaborationOpen} />

      {/* Preconfigured System Panels */}
      <PrebuiltAgentsPanel open={prebuiltAgentsOpen} onOpenChange={setPrebuiltAgentsOpen} />
      <PipelineTemplatesPanel open={pipelineTemplatesOpen} onOpenChange={setPipelineTemplatesOpen} />

      {/* Ruflo-Parity Panels (Tier 8) */}
      <SwarmCoordinationPanel open={swarmOpen} onOpenChange={setSwarmOpen} />
      <SONALearningPanel open={sonaOpen} onOpenChange={setSonaOpen} />
      <FederationPanel open={federationOpen} onOpenChange={setFederationOpen} />
      <EncryptionVaultPanel open={encryptionOpen} onOpenChange={setEncryptionOpen} />
      <AIDefencePanel open={aiDefenceOpen} onOpenChange={setAiDefenceOpen} />
      <CostTrackerPanel open={costTrackerOpen} onOpenChange={setCostTrackerOpen} />
      <GoalPlannerPanel open={goalPlannerOpen} onOpenChange={setGoalPlannerOpen} />
      <KnowledgeGraphPanel open={knowledgeGraphOpen} onOpenChange={setKnowledgeGraphOpen} />
      <BackgroundWorkersPanel open={bgWorkersOpen} onOpenChange={setBgWorkersOpen} />
      <VerificationPanel open={verificationOpen} onOpenChange={setVerificationOpen} />
      <OptimizationPanel open={optimizationOpen} onOpenChange={setOptimizationOpen} />
      <TuningPanel open={tuningOpen} onOpenChange={setTuningOpen} />
      {/* Next-Gen Pro Panels (Tier 9) */}
      <AgentLoopPanel open={agentLoopOpen} onOpenChange={setAgentLoopOpen} />
      <ContextWindowPanel open={contextWindowOpen} onOpenChange={setContextWindowOpen} />
      <AgentEvaluationPanel open={agentEvalOpen} onOpenChange={setAgentEvalOpen} />
      <MCPServerPanel open={mcpServerOpen} onOpenChange={setMcpServerOpen} />
      <AgentReflectionPanel open={agentReflectionOpen} onOpenChange={setAgentReflectionOpen} />
      <DeepResearchPanel open={deepResearchOpen} onOpenChange={setDeepResearchOpen} />
      <MemoryVisualizationPanel open={memoryVizOpen} onOpenChange={setMemoryVizOpen} />
      <TaskTypeDetectionPanel open={taskTypeOpen} onOpenChange={setTaskTypeOpen} />
      <TokenTrackingPanel open={tokenTrackingOpen} onOpenChange={setTokenTrackingOpen} />
    </div>
  );
}
