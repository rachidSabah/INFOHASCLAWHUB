"use client";

import { useUIStore, useSettingsStore, useAgentStore, useSkillStore, useChatStore, useUpdateStore } from "@/lib/stores";
import { cn } from "@/lib/utils";
import { ClawHubLogo, ClawHubText } from "./ClawHubLogo";
import {
  PanelLeft, Settings, Bot, Zap, ChevronDown, Check, BarChart3, Activity, ArrowUpCircle, HeartPulse,
  Rocket, Workflow, Code2, Radio, Paintbrush, Database, Shield, Puzzle, MousePointerClick, Mic, GitBranch, Smartphone, Terminal, Search, Cpu, Server,
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
import { VoiceCodingPanel } from "./enhancements/VoiceCodingPanel";
import { GitIntelligencePanel } from "./enhancements/GitIntelligencePanel";
import { MobileCompanionPanel } from "./enhancements/MobileCompanionPanel";
import { WebBridgeHubPanel } from "./enhancements/WebBridgeHubPanel";

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
  const [mobileOpen, setMobileOpen] = useState(false);
  const [webBridgeOpen, setWebBridgeOpen] = useState(false);

  const agentRef = useRef<HTMLDivElement>(null);
  const skillRef = useRef<HTMLDivElement>(null);
  const modelRef = useRef<HTMLDivElement>(null);
  const powerToolsRef = useRef<HTMLDivElement>(null);

  // Load models on mount + periodic refresh
  useEffect(() => {
    fetchModels().catch(() => {});
    const interval = setInterval(() => fetchModels().catch(() => {}), 30000);
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
  const allModels = modelGroups.flatMap(g => g.models);
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
          title="Power Tools — 16 AI Enhancement Features"
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
              <div className="border-t border-border my-1" />
              <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground px-2 py-1">Tier 2: Power Features</p>
              <button onClick={() => { setCommsHubOpen(true); setPowerToolsOpen(false); }} className="w-full flex items-center gap-2.5 px-2 py-1.5 rounded-md text-xs transition-colors text-left hover:bg-muted">
                <Radio className="h-3.5 w-3.5 text-green-500" /><div><span className="font-medium">Comms Hub</span><p className="text-[10px] text-muted-foreground">WhatsApp/Telegram/Discord/Slack</p></div>
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
                <Mic className="h-3.5 w-3.5 text-rose-500" /><div><span className="font-medium">Voice Coding</span><p className="text-[10px] text-muted-foreground">Speak your code changes</p></div>
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
      <VoiceCodingPanel open={voiceCodingOpen} onOpenChange={setVoiceCodingOpen} />
      <GitIntelligencePanel open={gitIntelOpen} onOpenChange={setGitIntelOpen} />
      <MobileCompanionPanel open={mobileOpen} onOpenChange={setMobileOpen} />
      <WebBridgeHubPanel open={webBridgeOpen} onOpenChange={setWebBridgeOpen} />
    </div>
  );
}
