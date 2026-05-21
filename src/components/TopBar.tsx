"use client";

import { useUIStore, useSettingsStore, useAgentStore, useSkillStore, useChatStore, useUpdateStore } from "@/lib/stores";
import { cn } from "@/lib/utils";
import { ClawHubLogo, ClawHubText } from "./ClawHubLogo";
import {
  PanelLeft, Settings, Bot, Zap, ChevronDown, Check, BarChart3, Activity, ArrowUpCircle, HeartPulse,
  Rocket, Workflow, Code2, Radio, Paintbrush, Database, Shield, Puzzle, MousePointerClick, Mic, GitBranch, Smartphone, Terminal, Search, Cpu, Server, Layout, GitMerge, GitFork, Sparkles, Wifi, LayoutTemplate, PanelRight,
  Brain, Lock, AlertTriangle, DollarSign, Target, Network, Wrench, FileCheck, Users,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
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
  const [tokenDashboardOpen, setTokenDashboardOpen] = useState(false);
  const [systemMonitorOpen, setSystemMonitorOpen] = useState(false);
  const [doctorOpen, setDoctorOpen] = useState(false);
  const [powerToolsOpen, setPowerToolsOpen] = useState(false);

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

  const agentRef = useRef<HTMLDivElement>(null);
  const skillRef = useRef<HTMLDivElement>(null);
  const modelRef = useRef<HTMLDivElement>(null);
  const powerToolsRef = useRef<HTMLDivElement>(null);

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
    <div className="h-12 flex items-center gap-2 px-3 border-b border-border bg-card/30 shrink-0">
      {/* Sidebar toggle */}
      <button onClick={toggleSidebar} className="p-1.5 rounded-md hover:bg-muted transition-colors text-muted-foreground hover:text-foreground" title="Toggle sidebar (Ctrl+B)">
        <PanelLeft className="h-4 w-4" />
      </button>

      {/* Logo */}
      <div className="flex items-center gap-1.5 mr-2">
        <ClawHubLogo size={22} />
        <ClawHubText className="text-sm" />
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
          className={cn("flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors border",
            activeAgent ? "border-primary/30 bg-primary/5 text-primary" : "border-border hover:border-primary/20 hover:bg-muted/30 text-muted-foreground"
          )}
        >
          <Bot className="h-3.5 w-3.5" />
          <span className="max-w-[100px] truncate">{activeAgent?.name || "Default Agent"}</span>
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
          className={cn("flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors border",
            activeSkill ? "border-amber-500/30 bg-amber-500/5 text-amber-500" : "border-border hover:border-amber-500/20 hover:bg-muted/30 text-muted-foreground"
          )}
        >
          <Zap className="h-3.5 w-3.5" />
          <span className="max-w-[80px] truncate">{activeSkill?.name || "No Skill"}</span>
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
            if (!modelDropdownOpen) fetchModels().catch(() => {});
          }}
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium border border-border hover:border-primary/20 hover:bg-muted/30 text-muted-foreground hover:text-foreground transition-colors"
        >
          <span className="max-w-[150px] truncate">{activeModel?.name || currentModelId}</span>
          <ChevronDown className="h-3 w-3 opacity-60" />
        </button>
        {modelDropdownOpen && (
          <div className="absolute top-full left-0 mt-1 w-80 bg-popover border border-border rounded-xl shadow-xl z-50 animate-fade-in overflow-hidden">
            <div className="max-h-80 overflow-y-auto p-2 space-y-3">
              {modelGroups.map((group) => (
                <div key={group.name} className="space-y-1">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground px-2 py-0.5 border-b border-border/40">
                    {group.name}
                  </p>
                  <div className="space-y-0.5">
                    {group.models.filter((m,i,a) => a.findIndex(x => x.id === m.id) === i).map((model) => (
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
            </div>
          </div>
        )}
      </div>

      {/* Spacer */}
      <div className="flex-1" />

      {/* Power Tools Dropdown */}
      <div ref={powerToolsRef} className="relative">
        <button
          onClick={() => setPowerToolsOpen(!powerToolsOpen)}
          className={cn("flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors border",
            powerToolsOpen ? "border-primary/30 bg-primary/5 text-primary" : "border-border hover:border-primary/20 hover:bg-muted/30 text-muted-foreground"
          )}
          title="Power Tools — 19 AI Enhancement Features"
        >
          <Rocket className="h-3.5 w-3.5" />
          <span>Power Tools</span>
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
            <div className="border-t border-border my-1" />
            <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground px-2 py-1">Tier 5: New Generation</p>
            <button onClick={() => { setArtifactsOpen(true); setPowerToolsOpen(false); }} className="w-full flex items-center gap-2.5 px-2 py-1.5 rounded-md text-xs transition-colors text-left hover:bg-muted">
              <Sparkles className="h-3.5 w-3.5 text-purple-500" /><div><span className="font-medium">AI Artifacts Studio</span><p className="text-[10px] text-muted-foreground">Doc, sheet, slide, canvas AI</p></div>
            </button>
            <button onClick={() => { setNetworkInfoOpen(true); setPowerToolsOpen(false); }} className="w-full flex items-center gap-2.5 px-2 py-1.5 rounded-md text-xs transition-colors text-left hover:bg-muted">
              <Wifi className="h-3.5 w-3.5 text-blue-500" /><div><span className="font-medium">LAN Network Access</span><p className="text-[10px] text-muted-foreground">Multi-device WiFi access</p></div>
            </button>
            <button onClick={() => { setCanvasOpen(true); setPowerToolsOpen(false); }} className="w-full flex items-center gap-2.5 px-2 py-1.5 rounded-md text-xs transition-colors text-left hover:bg-muted">
              <LayoutTemplate className="h-3.5 w-3.5 text-indigo-500" /><div><span className="font-medium">Visual Canvas</span><p className="text-[10px] text-muted-foreground">Fabric-like design editor</p></div>
            </button>
            <div className="border-t border-border my-1" />
            <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground px-2 py-1">Tier 6: Next-Gen OS</p>
            <button onClick={() => { setUniversalMemoryOpen(true); setPowerToolsOpen(false); }} className="w-full flex items-center gap-2.5 px-2 py-1.5 rounded-md text-xs transition-colors text-left hover:bg-muted">
              <Sparkles className="h-3.5 w-3.5 text-rose-500" /><div><span className="font-medium">Universal Memory</span><p className="text-[10px] text-muted-foreground">Cross-session context & vector recall</p></div>
            </button>
            <button onClick={() => { setCronSchedulerOpen(true); setPowerToolsOpen(false); }} className="w-full flex items-center gap-2.5 px-2 py-1.5 rounded-md text-xs transition-colors text-left hover:bg-muted">
              <Activity className="h-3.5 w-3.5 text-amber-500" /><div><span className="font-medium">Cron Scheduler</span><p className="text-[10px] text-muted-foreground">Always-on agents & scheduled tasks</p></div>
            </button>
            <button onClick={() => { setResearchModeOpen(true); setPowerToolsOpen(false); }} className="w-full flex items-center gap-2.5 px-2 py-1.5 rounded-md text-xs transition-colors text-left hover:bg-muted">
              <Search className="h-3.5 w-3.5 text-cyan-500" /><div><span className="font-medium">Deep Research</span><p className="text-[10px] text-muted-foreground">Citations, sources & hallucination detect</p></div>
            </button>
            <button onClick={() => { setIssuePipelineOpen(true); setPowerToolsOpen(false); }} className="w-full flex items-center gap-2.5 px-2 py-1.5 rounded-md text-xs transition-colors text-left hover:bg-muted">
              <GitBranch className="h-3.5 w-3.5 text-emerald-500" /><div><span className="font-medium">Issue → Deploy</span><p className="text-[10px] text-muted-foreground">GitHub issue to deployed code</p></div>
            </button>
            <button onClick={() => { setSelfImprovingOpen(true); setPowerToolsOpen(false); }} className="w-full flex items-center gap-2.5 px-2 py-1.5 rounded-md text-xs transition-colors text-left hover:bg-muted">
              <Sparkles className="h-3.5 w-3.5 text-violet-500" /><div><span className="font-medium">Self-Improving Agents</span><p className="text-[10px] text-muted-foreground">Prompt optimization & reflection</p></div>
            </button>
            <button onClick={() => { setHybridRouterOpen(true); setPowerToolsOpen(false); }} className="w-full flex items-center gap-2.5 px-2 py-1.5 rounded-md text-xs transition-colors text-left hover:bg-muted">
              <Cpu className="h-3.5 w-3.5 text-blue-500" /><div><span className="font-medium">Hybrid Router</span><p className="text-[10px] text-muted-foreground">Local ↔ Cloud provider racing</p></div>
            </button>
            <button onClick={() => { setLiveSandboxOpen(true); setPowerToolsOpen(false); }} className="w-full flex items-center gap-2.5 px-2 py-1.5 rounded-md text-xs transition-colors text-left hover:bg-muted">
              <Code2 className="h-3.5 w-3.5 text-teal-500" /><div><span className="font-medium">Live Sandbox</span><p className="text-[10px] text-muted-foreground">Instant app preview & deploy</p></div>
            </button>
            <button onClick={() => { setMcpHubOpen(true); setPowerToolsOpen(false); }} className="w-full flex items-center gap-2.5 px-2 py-1.5 rounded-md text-xs transition-colors text-left hover:bg-muted">
              <Puzzle className="h-3.5 w-3.5 text-purple-500" /><div><span className="font-medium">MCP Hub</span><p className="text-[10px] text-muted-foreground">Model Context Protocol registry</p></div>
            </button>
            <button onClick={() => { setComplianceEngineOpen(true); setPowerToolsOpen(false); }} className="w-full flex items-center gap-2.5 px-2 py-1.5 rounded-md text-xs transition-colors text-left hover:bg-muted">
              <Shield className="h-3.5 w-3.5 text-red-500" /><div><span className="font-medium">Compliance Engine</span><p className="text-[10px] text-muted-foreground">Audit logs, policies & scanning</p></div>
            </button>
            <button onClick={() => { setCollaborationOpen(true); setPowerToolsOpen(false); }} className="w-full flex items-center gap-2.5 px-2 py-1.5 rounded-md text-xs transition-colors text-left hover:bg-muted">
              <Radio className="h-3.5 w-3.5 text-indigo-500" /><div><span className="font-medium">Collaboration</span><p className="text-[10px] text-muted-foreground">Real-time multiplayer sessions</p></div>
            </button>
            <div className="border-t border-border my-1" />
            <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground px-2 py-1">Tier 7: Preconfigured OS</p>
            <button onClick={() => { setPrebuiltAgentsOpen(true); setPowerToolsOpen(false); }} className="w-full flex items-center gap-2.5 px-2 py-1.5 rounded-md text-xs transition-colors text-left hover:bg-muted">
              <Bot className="h-3.5 w-3.5 text-amber-500" /><div><span className="font-medium">Prebuilt Agents</span><p className="text-[10px] text-muted-foreground">One-click agent activation</p></div>
            </button>
            <button onClick={() => { setPipelineTemplatesOpen(true); setPowerToolsOpen(false); }} className="w-full flex items-center gap-2.5 px-2 py-1.5 rounded-md text-xs transition-colors text-left hover:bg-muted">
              <Workflow className="h-3.5 w-3.5 text-emerald-500" /><div><span className="font-medium">Pipeline Templates</span><p className="text-[10px] text-muted-foreground">7 production-ready pipelines</p></div>
            </button>
            <div className="border-t border-border my-1" />
            <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground px-2 py-1">Tier 8: Enterprise AI Engine</p>
            <button onClick={() => { setSwarmOpen(true); setPowerToolsOpen(false); }} className="w-full flex items-center gap-2.5 px-2 py-1.5 rounded-md text-xs transition-colors text-left hover:bg-muted">
              <Users className="h-3.5 w-3.5 text-violet-500" /><div><span className="font-medium">Swarm Coordination</span><p className="text-[10px] text-muted-foreground">Queen-led swarms with consensus</p></div>
            </button>
            <button onClick={() => { setSonaOpen(true); setPowerToolsOpen(false); }} className="w-full flex items-center gap-2.5 px-2 py-1.5 rounded-md text-xs transition-colors text-left hover:bg-muted">
              <Brain className="h-3.5 w-3.5 text-cyan-500" /><div><span className="font-medium">SONA Self-Learning</span><p className="text-[10px] text-muted-foreground">Neural patterns & trajectory learning</p></div>
            </button>
            <button onClick={() => { setFederationOpen(true); setPowerToolsOpen(false); }} className="w-full flex items-center gap-2.5 px-2 py-1.5 rounded-md text-xs transition-colors text-left hover:bg-muted">
              <Network className="h-3.5 w-3.5 text-emerald-500" /><div><span className="font-medium">Zero-Trust Federation</span><p className="text-[10px] text-muted-foreground">Cross-machine mTLS & PII scanning</p></div>
            </button>
            <button onClick={() => { setEncryptionOpen(true); setPowerToolsOpen(false); }} className="w-full flex items-center gap-2.5 px-2 py-1.5 rounded-md text-xs transition-colors text-left hover:bg-muted">
              <Lock className="h-3.5 w-3.5 text-rose-500" /><div><span className="font-medium">Encryption Vault</span><p className="text-[10px] text-muted-foreground">AES-256-GCM at-rest encryption</p></div>
            </button>
            <button onClick={() => { setAiDefenceOpen(true); setPowerToolsOpen(false); }} className="w-full flex items-center gap-2.5 px-2 py-1.5 rounded-md text-xs transition-colors text-left hover:bg-muted">
              <AlertTriangle className="h-3.5 w-3.5 text-red-500" /><div><span className="font-medium">AI Defence</span><p className="text-[10px] text-muted-foreground">Injection block, PII detect, safety</p></div>
            </button>
            <button onClick={() => { setCostTrackerOpen(true); setPowerToolsOpen(false); }} className="w-full flex items-center gap-2.5 px-2 py-1.5 rounded-md text-xs transition-colors text-left hover:bg-muted">
              <DollarSign className="h-3.5 w-3.5 text-amber-500" /><div><span className="font-medium">Cost Tracker</span><p className="text-[10px] text-muted-foreground">Budgets, alerts & spending analytics</p></div>
            </button>
            <button onClick={() => { setGoalPlannerOpen(true); setPowerToolsOpen(false); }} className="w-full flex items-center gap-2.5 px-2 py-1.5 rounded-md text-xs transition-colors text-left hover:bg-muted">
              <Target className="h-3.5 w-3.5 text-indigo-500" /><div><span className="font-medium">Goal Planner</span><p className="text-[10px] text-muted-foreground">GOAP A* goal decomposition</p></div>
            </button>
            <button onClick={() => { setKnowledgeGraphOpen(true); setPowerToolsOpen(false); }} className="w-full flex items-center gap-2.5 px-2 py-1.5 rounded-md text-xs transition-colors text-left hover:bg-muted">
              <Network className="h-3.5 w-3.5 text-purple-500" /><div><span className="font-medium">Knowledge Graph</span><p className="text-[10px] text-muted-foreground">Entity relationships & traversal</p></div>
            </button>
            <button onClick={() => { setBgWorkersOpen(true); setPowerToolsOpen(false); }} className="w-full flex items-center gap-2.5 px-2 py-1.5 rounded-md text-xs transition-colors text-left hover:bg-muted">
              <Wrench className="h-3.5 w-3.5 text-slate-500" /><div><span className="font-medium">Background Workers</span><p className="text-[10px] text-muted-foreground">12 auto-triggered workers</p></div>
            </button>
            <button onClick={() => { setVerificationOpen(true); setPowerToolsOpen(false); }} className="w-full flex items-center gap-2.5 px-2 py-1.5 rounded-md text-xs transition-colors text-left hover:bg-muted">
              <FileCheck className="h-3.5 w-3.5 text-green-500" /><div><span className="font-medium">Verification</span><p className="text-[10px] text-muted-foreground">Ed25519 file signing & verification</p></div>
            </button>
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
    </div>
  );
}
