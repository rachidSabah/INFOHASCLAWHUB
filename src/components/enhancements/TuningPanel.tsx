"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { useChatStore } from "@/lib/stores";
import { getModelAdaptation } from "@/lib/optimization-engine";
import { toast } from "sonner";
import {
  SlidersHorizontal, Gauge, Brain, Zap, Save, RotateCcw, ChevronDown, ChevronUp, Trash2,
  Star, Clock, Layers, Cpu, type LucideIcon,
} from "lucide-react";

const ACCENT = "#f97316";

interface TuningSettings {
  maxTokens: number;
  temperature: number;
  topP: number;
  frequencyPenalty: number;
  presencePenalty: number;
  streamingEnabled: boolean;
  systemPrompt: string;
  maxContextMessages: number;
  contextStrategy: "recent" | "summarized" | "full";
  contextTrimThreshold: number;
  primaryModel: string;
  fallbackModel: string;
  requestTimeout: number;
  cacheEnabled: boolean;
  cacheTTL: number;
  scopeGlobal: boolean;
}

const DEFAULTS: TuningSettings = {
  maxTokens: 2048, temperature: 0.7, topP: 0.9, frequencyPenalty: 0, presencePenalty: 0,
  streamingEnabled: true, systemPrompt: "", maxContextMessages: 10,
  contextStrategy: "recent", contextTrimThreshold: 30000,
  primaryModel: "", fallbackModel: "", requestTimeout: 30,
  cacheEnabled: true, cacheTTL: 15, scopeGlobal: false,
};

const PRESETS: Array<{ name: string; icon: LucideIcon; settings: Partial<TuningSettings>; desc: string }> = [
  { name: "Fast", icon: Zap, desc: "Quick answers, minimal tokens", settings: { maxTokens: 512, temperature: 0.3, maxContextMessages: 5, streamingEnabled: false } },
  { name: "Balanced", icon: Gauge, desc: "Good speed & quality (default)", settings: { maxTokens: 2048, temperature: 0.7, maxContextMessages: 10, streamingEnabled: true } },
  { name: "Deep", icon: Brain, desc: "Complex tasks, high quality", settings: { maxTokens: 4096, temperature: 1.0, maxContextMessages: 30, streamingEnabled: true } },
  { name: "Creative", icon: Star, desc: "Writing & brainstorming", settings: { maxTokens: 4096, temperature: 1.5, topP: 0.95, maxContextMessages: 15, streamingEnabled: true } },
];

export default function TuningPanel({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const { activeConversationId, getActiveConversation } = useChatStore();
  const [settings, setSettings] = useState<TuningSettings>(DEFAULTS);
  const [savedPresets, setSavedPresets] = useState<Array<{ name: string; settings: TuningSettings }>>([]);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({ Speed: true, Context: false, Cache: false, Model: false });
  const [autoDetected, setAutoDetected] = useState<string | null>(null);

  const activeModel = getActiveConversation()?.model || "";

  useEffect(() => {
    if (!open) return;
    const saved = localStorage.getItem("clawhub_tuning");
    if (saved) { try { setSettings(JSON.parse(saved)); } catch {} }
    const ps = localStorage.getItem("clawhub_tuning_presets");
    if (ps) { try { setSavedPresets(JSON.parse(ps)); } catch {} }
  }, [open]);

  // Auto-detect model settings when model changes
  useEffect(() => {
    if (!activeModel || !open) return;
    const adapt = getModelAdaptation(activeModel);
    const modelName = activeModel.split("/").slice(1).join("/") || activeModel;
    setAutoDetected(`Adapted for ${modelName}`);

    const modelDefaults: Partial<TuningSettings> = {
      maxTokens: adapt.maxTokens,
      temperature: adapt.temperature,
      topP: adapt.topP,
      streamingEnabled: adapt.supportsStreaming,
    };

    setSettings(prev => {
      const next = { ...prev, ...modelDefaults };
      localStorage.setItem("clawhub_tuning", JSON.stringify(next));
      return next;
    });
  }, [activeModel, open]);

  const update = (key: keyof TuningSettings, value: any) => {
    setSettings(prev => {
      const next = { ...prev, [key]: value };
      localStorage.setItem("clawhub_tuning", JSON.stringify(next));
      return next;
    });
  };

  const applyPreset = (preset: Partial<TuningSettings>) => {
    const next = { ...settings, ...preset };
    setSettings(next);
    localStorage.setItem("clawhub_tuning", JSON.stringify(next));
    toast.success("Preset applied");
  };

  const resetAll = () => {
    setSettings(DEFAULTS);
    localStorage.setItem("clawhub_tuning", JSON.stringify(DEFAULTS));
    toast.success("Reset to defaults");
  };

  const savePreset = () => {
    const name = prompt("Preset name:");
    if (!name) return;
    const next = [...savedPresets, { name, settings: { ...settings } }];
    setSavedPresets(next);
    localStorage.setItem("clawhub_tuning_presets", JSON.stringify(next));
    toast.success(`Saved "${name}"`);
  };

  const deletePreset = (name: string) => {
    const next = savedPresets.filter(p => p.name !== name);
    setSavedPresets(next);
    localStorage.setItem("clawhub_tuning_presets", JSON.stringify(next));
  };

  const toggleSection = (s: string) => setExpanded(prev => ({ ...prev, [s]: !prev[s] }));

  const estTime = useCallback(() => {
    const base = settings.maxContextMessages * 0.1 + settings.maxTokens / 2000;
    const streamBonus = settings.streamingEnabled ? 0.5 : 1.5;
    const tempPenalty = settings.temperature > 1.0 ? 0.5 : 0;
    const time = base + streamBonus + tempPenalty;
    if (time < 2) return "~1-2s (Fast)";
    if (time < 5) return "~3-5s (Normal)";
    return "~5-8s (Detailed)";
  }, [settings]);

  const Slider = ({ label, value, min, max, step, onChange, unit, tooltip }: { label: string; value: number; min: number; max: number; step: number; onChange: (v: number) => void; unit?: string; tooltip?: string }) => (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-medium text-foreground" title={tooltip}>{label}</span>
        <span className="text-[11px] font-mono text-muted-foreground">{value}{unit || ""}</span>
      </div>
      <input
        type="range"
        min={min} max={max} step={step} value={value}
        onChange={e => onChange(parseFloat(e.target.value))}
        className="w-full h-1.5 rounded-full appearance-none cursor-pointer"
        style={{
          background: `linear-gradient(to right, ${ACCENT} 0%, ${ACCENT} ${((value - min) / (max - min)) * 100}%, rgba(255,255,255,0.1) ${((value - min) / (max - min)) * 100}%, rgba(255,255,255,0.1) 100%)`,
          accentColor: ACCENT,
        }}
      />
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[90vh] flex flex-col p-0 gap-0 overflow-hidden">
        <DialogHeader className="px-4 py-3 border-b border-border shrink-0">
          <DialogTitle className="flex items-center gap-2 text-sm">
            <SlidersHorizontal className="h-4 w-4" style={{ color: ACCENT }} />
            Model Tuning
            <span className="text-[10px] font-normal text-muted-foreground ml-auto">{estTime()}</span>
          </DialogTitle>
          {autoDetected && (
            <p className="text-[10px] mt-1 px-1.5 py-0.5 rounded bg-orange-500/10 text-orange-500 inline-flex items-center gap-1 w-fit">
              <Gauge className="h-3 w-3" />
              Auto-detected: {autoDetected}
            </p>
          )}
        </DialogHeader>

        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {/* Presets */}
          <div className="space-y-2">
            <p className="text-[10px] font-bold uppercase text-muted-foreground">Speed Presets</p>
            <div className="grid grid-cols-4 gap-2">
              {PRESETS.map(p => {
                const Icon = p.icon;
                return (
                  <button key={p.name} onClick={() => applyPreset(p.settings)} className="flex flex-col items-center gap-1 p-2 rounded-lg border border-border hover:border-orange-500/50 hover:bg-orange-500/5 transition-all" title={p.desc}>
                    <Icon className="h-4 w-4" style={{ color: ACCENT }} />
                    <span className="text-[10px] font-semibold">{p.name}</span>
                    <span className="text-[8px] text-muted-foreground">{p.desc}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Scope toggle */}
          <div className="flex items-center justify-between py-2 px-3 rounded-lg border border-border bg-muted/10">
            <span className="text-[11px]">Apply to all conversations</span>
            <Switch checked={settings.scopeGlobal} onCheckedChange={v => update("scopeGlobal", v)} />
          </div>

          {/* Section: Speed */}
          <Section title="Speed" icon={Zap} expanded={expanded.Speed} onToggle={() => toggleSection("Speed")}>
            <Slider label="Max Tokens" value={settings.maxTokens} min={1} max={8192} step={128} onChange={v => update("maxTokens", v)} tooltip="Lower = faster but shorter responses" />
            <Slider label="Temperature" value={settings.temperature} min={0} max={2} step={0.1} onChange={v => update("temperature", v)} tooltip="Lower = more focused, Higher = more creative" />
            <Slider label="Top P" value={settings.topP} min={0} max={1} step={0.05} onChange={v => update("topP", v)} tooltip="Nucleus sampling — lower = more focused" />
            <Slider label="Frequency Penalty" value={settings.frequencyPenalty} min={-2} max={2} step={0.1} onChange={v => update("frequencyPenalty", v)} tooltip="Reduces word repetition" />
            <Slider label="Presence Penalty" value={settings.presencePenalty} min={-2} max={2} step={0.1} onChange={v => update("presencePenalty", v)} tooltip="Encourages topic diversity" />
            <div className="flex items-center justify-between">
              <span className="text-[11px]">Streaming</span>
              <Switch checked={settings.streamingEnabled} onCheckedChange={v => update("streamingEnabled", v)} />
            </div>
            <Slider label="Request Timeout (s)" value={settings.requestTimeout} min={5} max={120} step={5} onChange={v => update("requestTimeout", v)} unit="s" />
          </Section>

          {/* Section: Context */}
          <Section title="Context" icon={Layers} expanded={expanded.Context} onToggle={() => toggleSection("Context")}>
            <div className="space-y-1.5">
              <label className="text-[11px] font-medium">System Prompt</label>
              <textarea className="w-full h-20 rounded-md border border-input bg-background px-3 py-2 text-xs resize-none" maxLength={2000} value={settings.systemPrompt} onChange={e => update("systemPrompt", e.target.value)} placeholder="Custom system instructions..." />
            </div>
            <Slider label="Max Context Messages" value={settings.maxContextMessages} min={1} max={50} step={1} onChange={v => update("maxContextMessages", v)} tooltip="Fewer = faster, more = better memory" />
            <div className="space-y-1.5">
              <label className="text-[11px] font-medium">Context Strategy</label>
              <select className="w-full h-8 rounded-md border border-input bg-background px-2 text-xs" value={settings.contextStrategy} onChange={e => update("contextStrategy", e.target.value)}>
                <option value="recent">Recent Messages</option>
                <option value="summarized">Summarized</option>
                <option value="full">Full History</option>
              </select>
            </div>
            <Slider label="Context Trim Threshold" value={settings.contextTrimThreshold} min={1000} max={100000} step={1000} onChange={v => update("contextTrimThreshold", v)} unit=" tokens" tooltip="Auto-trim when context exceeds this" />
          </Section>

          {/* Section: Model */}
          <Section title="Model" icon={Cpu} expanded={expanded.Model} onToggle={() => toggleSection("Model")}>
            <div className="space-y-1.5">
              <label className="text-[11px] font-medium">Primary Model</label>
              <input className="w-full h-8 rounded-md border border-input bg-background px-2 text-xs" placeholder="gemini-2.0-flash" value={settings.primaryModel} onChange={e => update("primaryModel", e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <label className="text-[11px] font-medium">Fallback Model</label>
              <input className="w-full h-8 rounded-md border border-input bg-background px-2 text-xs" placeholder="Optional fallback" value={settings.fallbackModel} onChange={e => update("fallbackModel", e.target.value)} />
            </div>
          </Section>

          {/* Section: Cache */}
          <Section title="Cache" icon={Clock} expanded={expanded.Cache} onToggle={() => toggleSection("Cache")}>
            <div className="flex items-center justify-between">
              <span className="text-[11px]">Enable Caching</span>
              <Switch checked={settings.cacheEnabled} onCheckedChange={v => update("cacheEnabled", v)} />
            </div>
            <Slider label="Cache TTL" value={settings.cacheTTL} min={5} max={60} step={5} onChange={v => update("cacheTTL", v)} unit=" min" />
            <Button variant="outline" size="sm" className="h-7 text-[10px] w-full" onClick={() => { localStorage.removeItem("clawhub_response_cache"); toast.success("Cache cleared"); }}>
              <Trash2 className="h-3 w-3 mr-1" /> Clear Cache
            </Button>
          </Section>

          {/* Saved Presets */}
          {savedPresets.length > 0 && (
            <div className="space-y-1">
              <p className="text-[10px] font-bold uppercase text-muted-foreground">Saved Presets</p>
              {savedPresets.map(p => (
                <div key={p.name} className="flex items-center justify-between px-2 py-1 rounded border border-border bg-muted/10">
                  <button onClick={() => applyPreset(p.settings)} className="text-[11px] font-medium hover:text-orange-500">{p.name}</button>
                  <button onClick={() => deletePreset(p.name)} className="text-red-500 hover:bg-red-500/10 rounded p-0.5"><Trash2 className="h-3 w-3" /></button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex gap-2 px-4 py-3 border-t border-border bg-muted/10 shrink-0">
          <Button variant="outline" size="sm" className="h-8 text-xs flex-1" onClick={resetAll}>
            <RotateCcw className="h-3.5 w-3.5 mr-1" /> Reset
          </Button>
          <Button size="sm" className="h-8 text-xs flex-1" onClick={savePreset} style={{ background: ACCENT, borderColor: ACCENT }}>
            <Save className="h-3.5 w-3.5 mr-1" /> Save Preset
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Section({ title, icon: Icon, expanded, onToggle, children }: { title: string; icon?: LucideIcon; expanded: boolean; onToggle: () => void; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-border bg-card overflow-hidden">
      <button onClick={onToggle} className="w-full flex items-center justify-between px-3 py-2 hover:bg-muted/30 transition-colors">
        <span className="flex items-center gap-2 text-xs font-semibold">
          {Icon && <Icon className="h-3.5 w-3.5 text-muted-foreground" />}
          {title}
        </span>
        {expanded ? <ChevronUp className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />}
      </button>
      {expanded && <div className="px-3 pb-3 space-y-3">{children}</div>}
    </div>
  );
}
