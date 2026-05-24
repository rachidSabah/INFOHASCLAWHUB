"use client";

import { useState, useEffect, useCallback } from "react";
import { useSettingsStore, useUIStore } from "@/lib/stores";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { ClawHubLogo, ClawHubText } from "./ClawHubLogo";
import {
  Sparkles,
  Key,
  FolderOpen,
  CheckCircle2,
  ArrowRight,
  ArrowLeft,
  Shield,
  Bot,
  Monitor,
  Server,
  Search,
  Terminal,
  Cpu,
  Globe,
  Brain,
  FileText,
  Loader2,
  CircleDot,
  XCircle,
  Check,
  Rocket,
  Wrench,
  MessageSquareHeart,
} from "lucide-react";
import { toast } from "sonner";

// ─── Types ───────────────────────────────────────────────────────────────────

interface OnboardingWizardProps {
  onComplete: () => void;
}

type ProviderId =
  | "nous-portal"
  | "openrouter"
  | "lm-studio"
  | "anthropic"
  | "openai"
  | "google-ai"
  | "deepseek"
  | "xai"
  | "qwen"
  | "ollama"
  | "custom";

interface ProviderOption {
  id: ProviderId;
  name: string;
  description: string;
  icon: React.ReactNode;
  tag?: string;
  needsUrl?: boolean;
  defaultUrl?: string;
  needsApiKey?: boolean;
}

interface DependencyInfo {
  name: string;
  version: string | null;
  installed: boolean;
  required: boolean;
  icon: React.ReactNode;
}

// ─── Provider definitions ────────────────────────────────────────────────────

const PROVIDERS: ProviderOption[] = [
  {
    id: "nous-portal",
    name: "Nous Portal",
    description: "Hermes & Nous Research models via official portal",
    icon: <Sparkles className="h-4 w-4" />,
    needsApiKey: true,
  },
  {
    id: "openrouter",
    name: "OpenRouter",
    description: "Access 100+ models including open-source & proprietary",
    icon: <Globe className="h-4 w-4" />,
    tag: "100+ Models",
    needsApiKey: true,
  },
  {
    id: "lm-studio",
    name: "LM Studio",
    description: "Run local GGUF models with a friendly GUI",
    icon: <Monitor className="h-4 w-4" />,
    tag: "Local",
    needsUrl: true,
    defaultUrl: "http://localhost:1234/v1",
    needsApiKey: false,
  },
  {
    id: "anthropic",
    name: "Anthropic (Claude)",
    description: "Claude Sonnet, Haiku & Opus — best-in-class reasoning",
    icon: <Brain className="h-4 w-4" />,
    needsApiKey: true,
  },
  {
    id: "openai",
    name: "OpenAI",
    description: "GPT-4o, o1, o3-mini and the latest OpenAI models",
    icon: <Cpu className="h-4 w-4" />,
    needsApiKey: true,
  },
  {
    id: "google-ai",
    name: "Google AI Studio (Gemini)",
    description: "Gemini Pro & Flash — multimodal powerhouse",
    icon: <Sparkles className="h-4 w-4" />,
    needsApiKey: true,
  },
  {
    id: "deepseek",
    name: "DeepSeek",
    description: "DeepSeek Chat & Reasoner — cost-effective reasoning",
    icon: <Search className="h-4 w-4" />,
    needsApiKey: true,
  },
  {
    id: "xai",
    name: "xAI (Grok)",
    description: "Grok models from xAI — fast and witty",
    icon: <Globe className="h-4 w-4" />,
    needsApiKey: true,
  },
  {
    id: "qwen",
    name: "Qwen Cloud",
    description: "Alibaba Cloud Qwen models — multilingual excellence",
    icon: <Globe className="h-4 w-4" />,
    needsApiKey: true,
  },
  {
    id: "ollama",
    name: "Ollama",
    description: "Run Llama, Mistral & more locally with Ollama",
    icon: <Server className="h-4 w-4" />,
    tag: "Local",
    needsUrl: true,
    defaultUrl: "http://localhost:11434/v1",
    needsApiKey: false,
  },
  {
    id: "custom",
    name: "Custom (OpenAI-compatible)",
    description: "Connect to any OpenAI-compatible API endpoint",
    icon: <Wrench className="h-4 w-4" />,
    needsUrl: true,
    needsApiKey: true,
  },
];

// ─── Model definitions per provider ──────────────────────────────────────────

const PROVIDER_MODELS: Partial<Record<ProviderId, { id: string; name: string }[]>> = {
  openrouter: [
    { id: "anthropic/claude-sonnet-4-20250514", name: "Claude Sonnet 4" },
    { id: "anthropic/claude-haiku-4-20250414", name: "Claude Haiku 4" },
    { id: "openai/gpt-4o", name: "GPT-4o" },
    { id: "openai/o1", name: "o1" },
    { id: "google/gemini-2.5-pro", name: "Gemini 2.5 Pro" },
    { id: "google/gemini-2.5-flash", name: "Gemini 2.5 Flash" },
    { id: "meta-llama/llama-3.3-70b-instruct", name: "Llama 3.3 70B" },
    { id: "deepseek/deepseek-chat", name: "DeepSeek V3" },
    { id: "deepseek/deepseek-r1", name: "DeepSeek R1" },
    { id: "qwen/qwen-2.5-72b-instruct", name: "Qwen 2.5 72B" },
  ],
  openai: [
    { id: "gpt-4o", name: "GPT-4o" },
    { id: "gpt-4o-mini", name: "GPT-4o Mini" },
    { id: "gpt-4-turbo", name: "GPT-4 Turbo" },
    { id: "o1", name: "o1" },
    { id: "o3-mini", name: "o3-mini" },
  ],
  anthropic: [
    { id: "claude-sonnet-4-20250514", name: "Claude Sonnet 4" },
    { id: "claude-haiku-4-20250414", name: "Claude Haiku 4" },
    { id: "claude-opus-4-20250514", name: "Claude Opus 4" },
  ],
  "google-ai": [
    { id: "gemini-2.5-pro", name: "Gemini 2.5 Pro" },
    { id: "gemini-2.5-flash", name: "Gemini 2.5 Flash" },
    { id: "gemini-2.0-flash", name: "Gemini 2.0 Flash" },
  ],
  deepseek: [
    { id: "deepseek-chat", name: "DeepSeek Chat (V3)" },
    { id: "deepseek-reasoner", name: "DeepSeek Reasoner (R1)" },
  ],
  "nous-portal": [
    { id: "hermes-3-llama-3.1-405b", name: "Hermes 3 Llama 3.1 405B" },
    { id: "hermes-3-llama-3.1-70b", name: "Hermes 3 Llama 3.1 70B" },
  ],
  xai: [
    { id: "grok-3", name: "Grok 3" },
    { id: "grok-3-mini", name: "Grok 3 Mini" },
  ],
  qwen: [
    { id: "qwen-max", name: "Qwen Max" },
    { id: "qwen-plus", name: "Qwen Plus" },
    { id: "qwen-turbo", name: "Qwen Turbo" },
  ],
};

const TOTAL_STEPS = 6;

// ─── Component ───────────────────────────────────────────────────────────────

export function OnboardingWizard({ onComplete }: OnboardingWizardProps) {
  const { settings, updateSetting } = useSettingsStore();
  const [step, setStep] = useState(1);
  const [isSaving, setIsSaving] = useState(false);

  // Step 2 — dependency detection
  const [dependencies, setDependencies] = useState<DependencyInfo[]>([]);
  const [depsLoading, setDepsLoading] = useState(true);

  // Step 3 — provider selection
  const [selectedProvider, setSelectedProvider] = useState<ProviderId>("openrouter");

  // Step 4 — API keys / URLs
  const [apiKey, setApiKey] = useState("");
  const [providerUrl, setProviderUrl] = useState("");
  const [openrouterKey, setOpenrouterKey] = useState("");
  const [groqKey, setGroqKey] = useState("");

  // Step 5 — model selection
  const [selectedModel, setSelectedModel] = useState("");
  const [customModelName, setCustomModelName] = useState("");

  // Step 6 — workspace & personality
  const [workspace, setWorkspace] = useState(settings.workspacePath || "");
  const [soulMd, setSoulMd] = useState(
    "You are ClawHub, a powerful autonomous AI coding agent. You write clean, production-quality code. You are thorough, precise, and proactive."
  );

  // ─── Dependency detection on mount ─────────────────────────────────────────

  useEffect(() => {
    async function detectDeps() {
      setDepsLoading(true);
      try {
        const res = await fetch("/api/doctor");
        if (res.ok) {
          const data = await res.json();
          // Parse the doctor check results into dependency format
          const depMap: Record<string, DependencyInfo> = {
            nodejs: {
              name: "Node.js",
              version: null,
              installed: false,
              required: true,
              icon: <Terminal className="h-4 w-4 text-green-500" />,
            },
            git: {
              name: "Git",
              version: null,
              installed: false,
              required: true,
              icon: <FileText className="h-4 w-4 text-orange-500" />,
            },
            python: {
              name: "Python",
              version: null,
              installed: false,
              required: false,
              icon: <Bot className="h-4 w-4 text-blue-500" />,
            },
            ripgrep: {
              name: "ripgrep",
              version: null,
              installed: false,
              required: false,
              icon: <Search className="h-4 w-4 text-purple-500" />,
            },
            ffmpeg: {
              name: "ffmpeg",
              version: null,
              installed: false,
              required: false,
              icon: <Cpu className="h-4 w-4 text-pink-500" />,
            },
          };

          if (data?.checks && Array.isArray(data.checks)) {
            for (const check of data.checks) {
              const nameLower = check.name.toLowerCase();
              for (const [key, dep] of Object.entries(depMap)) {
                if (nameLower.includes(key) || nameLower.includes(dep.name.toLowerCase())) {
                  dep.installed = check.status === "ok";
                  dep.version = check.message || null;
                }
              }
            }
          }

          setDependencies(Object.values(depMap));
        } else {
          // Fallback: show defaults
          setDependencies(getFallbackDeps());
        }
      } catch {
        setDependencies(getFallbackDeps());
      } finally {
        setDepsLoading(false);
      }
    }
    detectDeps();
  }, []);

  // ─── Update URL when provider changes ──────────────────────────────────────

  useEffect(() => {
    const provider = PROVIDERS.find((p) => p.id === selectedProvider);
    if (provider?.needsUrl && provider.defaultUrl) {
      setProviderUrl(provider.defaultUrl);
    } else {
      setProviderUrl("");
    }
  }, [selectedProvider]);

  // ─── Set default model when provider changes ──────────────────────────────

  useEffect(() => {
    const models = PROVIDER_MODELS[selectedProvider];
    if (models && models.length > 0) {
      setSelectedModel(models[0].id);
    } else {
      setSelectedModel("");
      setCustomModelName("");
    }
  }, [selectedProvider]);

  // ─── Navigation ────────────────────────────────────────────────────────────

  const handleNext = useCallback(() => {
    if (step < TOTAL_STEPS) {
      setStep(step + 1);
    }
  }, [step]);

  const handleBack = useCallback(() => {
    if (step > 1) {
      setStep(step - 1);
    }
  }, [step]);

  // ─── Validate current step ─────────────────────────────────────────────────

  const canProceed = useCallback((): boolean => {
    switch (step) {
      case 1:
        return true;
      case 2:
        return true; // deps don't block
      case 3:
        return !!selectedProvider;
      case 4: {
        const provider = PROVIDERS.find((p) => p.id === selectedProvider);
        if (!provider) return false;
        if (provider.needsApiKey && !apiKey.trim()) return false;
        if (provider.needsUrl && !providerUrl.trim()) return false;
        return true;
      }
      case 5:
        if (isLocalProvider(selectedProvider)) {
          return customModelName.trim().length > 0;
        }
        return !!selectedModel;
      case 6:
        return workspace.trim().length > 0;
      default:
        return true;
    }
  }, [step, selectedProvider, apiKey, providerUrl, selectedModel, customModelName, workspace]);

  // ─── Finish handler ────────────────────────────────────────────────────────

  const handleFinish = useCallback(async () => {
    setIsSaving(true);
    try {
      const provider = PROVIDERS.find((p) => p.id === selectedProvider)!;
      const modelId = isLocalProvider(selectedProvider)
        ? customModelName.trim()
        : selectedModel;

      // 1. Save the selected provider to database
      await fetch("/api/providers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: provider.name,
          apiKey: apiKey || null,
          baseUrl: providerUrl || null,
        }),
      });

      // 2. Save secondary providers (OpenRouter, Groq) if keys provided
      const secondaryProviders = [
        { name: "OpenRouter", key: openrouterKey },
        { name: "Groq", key: groqKey },
      ].filter((p) => p.key.trim() !== "");

      await Promise.all(
        secondaryProviders.map((p) =>
          fetch("/api/providers", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              name: p.name,
              apiKey: p.key,
              baseUrl: null,
            }),
          })
        )
      );

      // 3. Save settings (API key, workspace path, default model)
      updateSetting("apiKey", apiKey);
      updateSetting("workspacePath", workspace);
      updateSetting("defaultModel", modelId);
      if (soulMd.trim()) {
        updateSetting("systemPrompt", soulMd.trim());
      }

      await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          apiKey,
          workspacePath: workspace,
          defaultModel: modelId,
          systemPrompt: soulMd.trim(),
        }),
      });

      // 4. Mark as onboarded
      localStorage.setItem("clawhub_onboarded", "true");

      toast.success("Welcome to ClawHub Desktop! Your agent is ready.");
      onComplete();
    } catch (e) {
      console.error("Onboarding failed:", e);
      toast.error("Failed to complete setup. Please try again.");
    } finally {
      setIsSaving(false);
    }
  }, [
    selectedProvider,
    apiKey,
    providerUrl,
    openrouterKey,
    groqKey,
    workspace,
    selectedModel,
    customModelName,
    soulMd,
    updateSetting,
    onComplete,
  ]);

  // ─── Step indicator dots ───────────────────────────────────────────────────

  const StepIndicator = () => (
    <div className="flex items-center gap-1.5 justify-center">
      {Array.from({ length: TOTAL_STEPS }, (_, i) => (
        <div
          key={i}
          className={`rounded-full transition-all duration-300 ${
            i + 1 === step
              ? "w-6 h-1.5 bg-primary"
              : i + 1 < step
              ? "w-1.5 h-1.5 bg-primary/60"
              : "w-1.5 h-1.5 bg-border"
          }`}
        />
      ))}
    </div>
  );

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-md overflow-hidden animate-fade-in">
      {/* Decorative background glow */}
      <div className="absolute top-1/4 left-1/4 w-96 h-96 rounded-full bg-primary/8 blur-[120px] pointer-events-none" />
      <div className="absolute bottom-1/3 right-1/4 w-80 h-80 rounded-full bg-orange-500/8 blur-[100px] pointer-events-none" />
      <div className="absolute top-1/2 right-1/3 w-64 h-64 rounded-full bg-amber-500/5 blur-[80px] pointer-events-none" />

      {/* Main glass card */}
      <div className="relative w-full max-w-xl mx-4 bg-card/65 border border-border/60 shadow-2xl rounded-2xl p-8 backdrop-blur-xl flex flex-col min-h-[540px] max-h-[92vh] transition-all">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border/25 pb-4 mb-6">
          <div className="flex items-center gap-2">
            <ClawHubLogo size={24} />
            <ClawHubText className="text-base" />
          </div>
          <div className="flex items-center gap-3">
            <StepIndicator />
            <span className="text-[11px] font-semibold text-muted-foreground bg-muted/40 px-2.5 py-1 rounded-full select-none">
              {step} / {TOTAL_STEPS}
            </span>
          </div>
        </div>

        {/* Dynamic Step Content */}
        <div className="flex-1 flex flex-col justify-center py-1 overflow-y-auto custom-scrollbar">
          {step === 1 && <StepWelcome />}
          {step === 2 && (
            <StepDependencyCheck
              dependencies={dependencies}
              loading={depsLoading}
            />
          )}
          {step === 3 && (
            <StepProviderSelect
              selected={selectedProvider}
              onSelect={setSelectedProvider}
            />
          )}
          {step === 4 && (
            <StepApiKeyConfig
              provider={selectedProvider}
              apiKey={apiKey}
              onApiKeyChange={setApiKey}
              providerUrl={providerUrl}
              onProviderUrlChange={setProviderUrl}
              openrouterKey={openrouterKey}
              onOpenrouterKeyChange={setOpenrouterKey}
              groqKey={groqKey}
              onGroqKeyChange={setGroqKey}
            />
          )}
          {step === 5 && (
            <StepModelSelect
              provider={selectedProvider}
              selectedModel={selectedModel}
              onModelSelect={setSelectedModel}
              customModelName={customModelName}
              onCustomModelChange={setCustomModelName}
            />
          )}
          {step === 6 && (
            <StepWorkspace
              workspace={workspace}
              onWorkspaceChange={setWorkspace}
              soulMd={soulMd}
              onSoulMdChange={setSoulMd}
            />
          )}
        </div>

        {/* Footer Navigation */}
        <div className="flex items-center justify-between border-t border-border/25 pt-4 mt-6">
          <Button
            variant="ghost"
            size="sm"
            onClick={handleBack}
            disabled={step === 1 || isSaving}
            className="text-xs hover:bg-primary/10 gap-1"
          >
            <ArrowLeft className="h-3.5 w-3.5" /> Back
          </Button>

          {step < TOTAL_STEPS ? (
            <Button
              variant="default"
              size="sm"
              onClick={handleNext}
              disabled={!canProceed()}
              className="text-xs bg-primary hover:bg-primary/95 text-primary-foreground font-semibold gap-1 transition-all"
            >
              Continue <ArrowRight className="h-3.5 w-3.5" />
            </Button>
          ) : (
            <Button
              variant="default"
              size="sm"
              onClick={handleFinish}
              disabled={isSaving || !canProceed()}
              className="text-xs bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 text-white font-bold gap-1 shadow-lg shadow-orange-500/20"
            >
              {isSaving ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" /> Configuring...
                </>
              ) : (
                <>
                  Launch ClawHub <Rocket className="h-3.5 w-3.5" />
                </>
              )}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Step 1: Welcome ─────────────────────────────────────────────────────────

function StepWelcome() {
  return (
    <div className="space-y-5 animate-slide-in">
      <div className="flex flex-col items-center text-center gap-4">
        <div className="inline-flex p-4 rounded-2xl bg-gradient-to-br from-primary/15 to-orange-500/10 border border-primary/20">
          <ClawHubLogo size={40} />
        </div>
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-foreground">
            Unleash the Power of Autonomous AI
          </h2>
          <p className="mt-2 text-sm text-muted-foreground leading-relaxed max-w-md mx-auto">
            ClawHub is the most powerful autonomous AI coding agent. It plans,
            writes, debugs, and ships code — supporting 38+ inference providers
            and running entirely on your machine.
          </p>
        </div>
      </div>

      {/* Feature highlights */}
      <div className="grid grid-cols-3 gap-2 text-center">
        {[
          { icon: <Bot className="h-4 w-4" />, label: "Autonomous Agent" },
          { icon: <Globe className="h-4 w-4" />, label: "38+ Providers" },
          { icon: <Shield className="h-4 w-4" />, label: "100% Local" },
        ].map((feat) => (
          <div
            key={feat.label}
            className="flex flex-col items-center gap-1.5 p-3 rounded-xl bg-muted/30 border border-border/15"
          >
            <div className="text-primary">{feat.icon}</div>
            <span className="text-[11px] font-medium text-muted-foreground">
              {feat.label}
            </span>
          </div>
        ))}
      </div>

      {/* Privacy notice */}
      <div className="p-3 bg-muted/30 border border-border/20 rounded-xl space-y-2 text-xs">
        <div className="flex gap-2">
          <Shield className="h-4 w-4 text-primary shrink-0" />
          <span className="text-muted-foreground">
            All API keys and configuration are stored locally in a secure SQLite
            database on your device. No data is ever sent to external trackers or
            analytics servers.
          </span>
        </div>
      </div>
    </div>
  );
}

// ─── Step 2: Dependency Check ────────────────────────────────────────────────

function StepDependencyCheck({
  dependencies,
  loading,
}: {
  dependencies: DependencyInfo[];
  loading: boolean;
}) {
  return (
    <div className="space-y-4 animate-slide-in">
      <div className="flex items-center gap-2 mb-1">
        <Monitor className="h-5 w-5 text-primary" />
        <h3 className="text-lg font-bold text-foreground">Dependency Check</h3>
      </div>
      <p className="text-xs text-muted-foreground">
        ClawHub needs a few tools on your system. Required ones must be present;
        optional ones unlock extra features.
      </p>

      {loading ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="h-6 w-6 text-primary animate-spin" />
          <span className="ml-2 text-sm text-muted-foreground">
            Detecting dependencies...
          </span>
        </div>
      ) : (
        <div className="space-y-2 max-h-[260px] overflow-y-auto pr-1">
          {dependencies.map((dep) => (
            <div
              key={dep.name}
              className={`flex items-center gap-3 p-3 rounded-xl border transition-colors ${
                dep.installed
                  ? "border-green-500/20 bg-green-500/5"
                  : dep.required
                  ? "border-red-500/20 bg-red-500/5"
                  : "border-border/30 bg-muted/20"
              }`}
            >
              <div className="shrink-0">{dep.icon}</div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold text-foreground">
                    {dep.name}
                  </span>
                  {dep.version && dep.installed && (
                    <span className="text-[10px] text-muted-foreground bg-muted/40 px-1.5 py-0.5 rounded">
                      {dep.version}
                    </span>
                  )}
                  {!dep.required && (
                    <span className="text-[10px] bg-blue-500/15 text-blue-500 px-1.5 py-0.5 rounded">
                      Optional
                    </span>
                  )}
                </div>
              </div>
              {dep.installed ? (
                <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0" />
              ) : dep.required ? (
                <XCircle className="h-4 w-4 text-red-500 shrink-0" />
              ) : (
                <XCircle className="h-4 w-4 text-muted-foreground/40 shrink-0" />
              )}
            </div>
          ))}
        </div>
      )}

      <p className="text-[11px] text-muted-foreground leading-relaxed">
        Missing optional dependencies won&apos;t block setup. You can install
        them later for enhanced features like fast code search (ripgrep) or TTS
        (ffmpeg).
      </p>
    </div>
  );
}

// ─── Step 3: Inference Provider ──────────────────────────────────────────────

function StepProviderSelect({
  selected,
  onSelect,
}: {
  selected: ProviderId;
  onSelect: (id: ProviderId) => void;
}) {
  return (
    <div className="space-y-4 animate-slide-in">
      <div className="flex items-center gap-2 mb-1">
        <Server className="h-5 w-5 text-primary" />
        <h3 className="text-lg font-bold text-foreground">
          Choose Inference Provider
        </h3>
      </div>
      <p className="text-xs text-muted-foreground">
        Select the primary provider for your AI agent. You can add more later.
      </p>

      <div className="space-y-1.5 max-h-[280px] overflow-y-auto pr-1 custom-scrollbar">
        {PROVIDERS.map((provider) => {
          const isSelected = selected === provider.id;
          return (
            <button
              key={provider.id}
              type="button"
              onClick={() => onSelect(provider.id)}
              className={`w-full flex items-center gap-3 p-3 rounded-xl border text-left transition-all duration-200 cursor-pointer ${
                isSelected
                  ? "border-primary/50 bg-primary/8 shadow-sm shadow-primary/10"
                  : "border-border/30 bg-muted/15 hover:bg-muted/30 hover:border-border/50"
              }`}
            >
              <div
                className={`shrink-0 flex items-center justify-center h-8 w-8 rounded-lg ${
                  isSelected
                    ? "bg-primary/15 text-primary"
                    : "bg-muted/40 text-muted-foreground"
                }`}
              >
                {provider.icon}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span
                    className={`text-xs font-semibold ${
                      isSelected ? "text-foreground" : "text-foreground/80"
                    }`}
                  >
                    {provider.name}
                  </span>
                  {provider.tag && (
                    <span className="text-[10px] bg-primary/15 text-primary px-1.5 py-0.5 rounded font-medium">
                      {provider.tag}
                    </span>
                  )}
                </div>
                {isSelected && (
                  <p className="text-[11px] text-muted-foreground mt-0.5 leading-relaxed">
                    {provider.description}
                  </p>
                )}
              </div>
              <div
                className={`shrink-0 h-4 w-4 rounded-full border-2 flex items-center justify-center transition-colors ${
                  isSelected
                    ? "border-primary bg-primary"
                    : "border-muted-foreground/30"
                }`}
              >
                {isSelected && <CircleDot className="h-2.5 w-2.5 text-primary-foreground" />}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ─── Step 4: API Key Configuration ───────────────────────────────────────────

function StepApiKeyConfig({
  provider: providerId,
  apiKey,
  onApiKeyChange,
  providerUrl,
  onProviderUrlChange,
  openrouterKey,
  onOpenrouterKeyChange,
  groqKey,
  onGroqKeyChange,
}: {
  provider: ProviderId;
  apiKey: string;
  onApiKeyChange: (v: string) => void;
  providerUrl: string;
  onProviderUrlChange: (v: string) => void;
  openrouterKey: string;
  onOpenrouterKeyChange: (v: string) => void;
  groqKey: string;
  onGroqKeyChange: (v: string) => void;
}) {
  const provider = PROVIDERS.find((p) => p.id === providerId)!;

  return (
    <div className="space-y-4 animate-slide-in">
      <div className="flex items-center gap-2 mb-1">
        <Key className="h-5 w-5 text-primary" />
        <h3 className="text-lg font-bold text-foreground">API Configuration</h3>
      </div>
      <p className="text-xs text-muted-foreground">
        Enter credentials for{" "}
        <span className="font-semibold text-foreground">{provider.name}</span>.
        {provider.needsUrl && " Provide the server URL."}
      </p>

      <div className="space-y-3.5 max-h-[260px] overflow-y-auto pr-1">
        {/* URL field for local/custom providers */}
        {provider.needsUrl && (
          <div className="space-y-1.5">
            <Label className="text-xs font-bold text-muted-foreground">
              Server URL
            </Label>
            <Input
              type="text"
              placeholder={provider.defaultUrl || "http://localhost:1234/v1"}
              value={providerUrl}
              onChange={(e) => onProviderUrlChange(e.target.value)}
              className="h-9 text-xs focus-visible:ring-primary"
            />
          </div>
        )}

        {/* API Key field */}
        {provider.needsApiKey && (
          <div className="space-y-1.5">
            <Label className="text-xs font-bold text-muted-foreground">
              {provider.name} API Key
            </Label>
            <Input
              type="password"
              placeholder={getApiKeyPlaceholder(providerId)}
              value={apiKey}
              onChange={(e) => onApiKeyChange(e.target.value)}
              className="h-9 text-xs focus-visible:ring-primary"
            />
          </div>
        )}

        {/* For local providers that don't need a key, show confirmation */}
        {!provider.needsApiKey && !provider.needsUrl && (
          <div className="flex items-start gap-2.5 p-3 bg-green-500/5 border border-green-500/15 rounded-xl text-xs">
            <Check className="h-4 w-4 text-green-500 shrink-0 mt-0.5" />
            <div>
              <span className="font-semibold text-foreground">
                No API key required
              </span>
              <p className="text-muted-foreground mt-0.5">
                This provider runs locally and doesn&apos;t need an API key.
              </p>
            </div>
          </div>
        )}

        <div className="border-t border-border/20 pt-3 mt-2">
          <p className="text-[11px] font-semibold text-muted-foreground mb-2.5 uppercase tracking-wider">
            Secondary Providers (Optional)
          </p>

          {/* OpenRouter secondary */}
          {providerId !== "openrouter" && (
            <div className="space-y-1.5 mb-3">
              <Label className="text-xs font-bold text-muted-foreground">
                OpenRouter API Key
                <span className="ml-1.5 text-[10px] font-normal bg-blue-500/15 text-blue-500 px-1.5 py-0.5 rounded">
                  Optional
                </span>
              </Label>
              <Input
                type="password"
                placeholder="sk-or-v1-..."
                value={openrouterKey}
                onChange={(e) => onOpenrouterKeyChange(e.target.value)}
                className="h-9 text-xs focus-visible:ring-primary"
              />
            </div>
          )}

          {/* Groq secondary */}
          <div className="space-y-1.5">
            <Label className="text-xs font-bold text-muted-foreground">
              Groq API Key
              <span className="ml-1.5 text-[10px] font-normal bg-blue-500/15 text-blue-500 px-1.5 py-0.5 rounded">
                Optional
              </span>
            </Label>
            <Input
              type="password"
              placeholder="gsk_..."
              value={groqKey}
              onChange={(e) => onGroqKeyChange(e.target.value)}
              className="h-9 text-xs focus-visible:ring-primary"
            />
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Step 5: Model Selection ─────────────────────────────────────────────────

function StepModelSelect({
  provider: providerId,
  selectedModel,
  onModelSelect,
  customModelName,
  onCustomModelChange,
}: {
  provider: ProviderId;
  selectedModel: string;
  onModelSelect: (id: string) => void;
  customModelName: string;
  onCustomModelChange: (v: string) => void;
}) {
  const models = PROVIDER_MODELS[providerId];
  const isLocal = isLocalProvider(providerId);
  const isCustom = providerId === "custom";

  return (
    <div className="space-y-4 animate-slide-in">
      <div className="flex items-center gap-2 mb-1">
        <Brain className="h-5 w-5 text-primary" />
        <h3 className="text-lg font-bold text-foreground">Model Selection</h3>
      </div>
      <p className="text-xs text-muted-foreground">
        {isLocal
          ? "Enter the model name as it appears in your local server."
          : isCustom
          ? "Enter the model identifier for your custom endpoint."
          : "Choose a default model for your AI agent."}
      </p>

      <div className="space-y-3.5">
        {models && models.length > 0 ? (
          <div className="space-y-1.5">
            <Label className="text-xs font-bold text-muted-foreground">
              Default Model
            </Label>
            <Select value={selectedModel} onValueChange={onModelSelect}>
              <SelectTrigger className="w-full h-9 text-xs">
                <SelectValue placeholder="Select a model..." />
              </SelectTrigger>
              <SelectContent>
                {models.map((model) => (
                  <SelectItem key={model.id} value={model.id}>
                    {model.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-[11px] text-muted-foreground">
              Selected:{" "}
              <span className="font-semibold text-foreground">
                {models.find((m) => m.id === selectedModel)?.name ||
                  selectedModel}
              </span>
            </p>
          </div>
        ) : (
          <div className="space-y-1.5">
            <Label className="text-xs font-bold text-muted-foreground">
              {isLocal ? "Local Model Name" : "Model Identifier"}
            </Label>
            <Input
              type="text"
              placeholder={
                isLocal
                  ? "e.g. llama-3.3-70b, mistral-7b..."
                  : "e.g. my-custom-model"
              }
              value={customModelName}
              onChange={(e) => onCustomModelChange(e.target.value)}
              className="h-9 text-xs focus-visible:ring-primary"
            />
            <p className="text-[11px] text-muted-foreground">
              {isLocal
                ? "Type the exact model name loaded in your local server."
                : "Enter the model ID your endpoint expects."}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Step 6: Workspace & Configuration ───────────────────────────────────────

function StepWorkspace({
  workspace,
  onWorkspaceChange,
  soulMd,
  onSoulMdChange,
}: {
  workspace: string;
  onWorkspaceChange: (v: string) => void;
  soulMd: string;
  onSoulMdChange: (v: string) => void;
}) {
  return (
    <div className="space-y-4 animate-slide-in">
      <div className="flex items-center gap-2 mb-1">
        <FolderOpen className="h-5 w-5 text-primary" />
        <h3 className="text-lg font-bold text-foreground">
          Workspace & Personality
        </h3>
      </div>
      <p className="text-xs text-muted-foreground">
        Set your working directory and customize how your AI agent behaves.
      </p>

      <div className="space-y-4 max-h-[260px] overflow-y-auto pr-1">
        {/* Workspace path */}
        <div className="space-y-1.5">
          <Label className="text-xs font-bold text-muted-foreground flex items-center gap-1.5">
            <FolderOpen className="h-3.5 w-3.5" />
            Workspace Path
          </Label>
          <Input
            type="text"
            placeholder="/home/user/projects/my-app"
            value={workspace}
            onChange={(e) => onWorkspaceChange(e.target.value)}
            className="h-9 text-xs focus-visible:ring-primary"
          />
          <p className="text-[11px] text-muted-foreground">
            The directory where ClawHub reads, writes, and executes code.
          </p>
        </div>

        {/* SOUL.md / personality */}
        <div className="space-y-1.5">
          <Label className="text-xs font-bold text-muted-foreground flex items-center gap-1.5">
            <MessageSquareHeart className="h-3.5 w-3.5" />
            AI Personality (SOUL.md)
          </Label>
          <Textarea
            placeholder="Describe how your AI agent should behave..."
            value={soulMd}
            onChange={(e) => onSoulMdChange(e.target.value)}
            className="min-h-[100px] text-xs focus-visible:ring-primary resize-none"
          />
          <p className="text-[11px] text-muted-foreground">
            This becomes your agent&apos;s system prompt. Customize tone,
            preferences, and coding style.
          </p>
        </div>
      </div>

      {/* Ready confirmation */}
      <div className="flex items-start gap-2.5 p-3 bg-primary/5 border border-primary/20 rounded-xl text-xs">
        <Rocket className="h-4 w-4 text-primary shrink-0 mt-0.5" />
        <div className="space-y-0.5">
          <span className="font-bold text-foreground">
            Ready to launch!
          </span>
          <p className="text-muted-foreground leading-relaxed">
            Click <strong>Launch ClawHub</strong> to save your configuration,
            index the workspace, and start building with your autonomous AI
            agent.
          </p>
        </div>
      </div>
    </div>
  );
}

// ─── Utility functions ───────────────────────────────────────────────────────

function isLocalProvider(id: ProviderId): boolean {
  return id === "lm-studio" || id === "ollama";
}

function getApiKeyPlaceholder(id: ProviderId): string {
  switch (id) {
    case "openai":
      return "sk-proj-...";
    case "anthropic":
      return "sk-ant-...";
    case "google-ai":
      return "AIzaSy...";
    case "openrouter":
      return "sk-or-v1-...";
    case "deepseek":
      return "sk-...";
    case "xai":
      return "xai-...";
    case "qwen":
      return "sk-...";
    case "nous-portal":
      return "np-...";
    case "custom":
      return "your-api-key";
    default:
      return "Enter API key...";
  }
}

function getFallbackDeps(): DependencyInfo[] {
  return [
    {
      name: "Node.js",
      version: null,
      installed: false,
      required: true,
      icon: <Terminal className="h-4 w-4 text-green-500" />,
    },
    {
      name: "Git",
      version: null,
      installed: false,
      required: true,
      icon: <FileText className="h-4 w-4 text-orange-500" />,
    },
    {
      name: "Python",
      version: null,
      installed: false,
      required: false,
      icon: <Bot className="h-4 w-4 text-blue-500" />,
    },
    {
      name: "ripgrep",
      version: null,
      installed: false,
      required: false,
      icon: <Search className="h-4 w-4 text-purple-500" />,
    },
    {
      name: "ffmpeg",
      version: null,
      installed: false,
      required: false,
      icon: <Cpu className="h-4 w-4 text-pink-500" />,
    },
  ];
}
