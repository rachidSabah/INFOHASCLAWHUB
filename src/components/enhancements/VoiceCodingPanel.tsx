"use client";

import { PowerToolHint } from "./PowerToolHint";
import { useState, useCallback, useRef } from "react";
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
  Mic,
  MicOff,
  Loader2,
  Copy,
  Check,
  Play,
  Languages,
  Terminal,
  Code,
  Pencil,
  Compass,
  ListChecks,
  ClipboardPaste,
  UserPlus,
  AlertCircle,
  MessageSquare,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ─── Types ──────────────────────────────────────────────────────────────────

interface VoiceCodingPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface CommandEntry {
  id: string;
  transcript: string;
  action: string;
  code: string;
  command: string;
  explanation: string;
  timestamp: Date;
}

interface ActionItem {
  id: string;
  text: string;
  assignee: string;
  priority: "high" | "medium" | "low";
  completed: boolean;
}

// ─── Constants ──────────────────────────────────────────────────────────────

const COMMAND_TYPES = [
  { value: "create", label: "Create", icon: Code, color: "text-emerald-400" },
  { value: "edit", label: "Edit", icon: Pencil, color: "text-sky-400" },
  { value: "refactor", label: "Refactor", icon: Terminal, color: "text-amber-400" },
  { value: "navigate", label: "Navigate", icon: Compass, color: "text-purple-400" },
] as const;

const DETECTED_LANGUAGES = [
  "TypeScript", "JavaScript", "Python", "Rust", "Go", "Java", "C++", "Ruby",
] as const;

// ─── Component ──────────────────────────────────────────────────────────────

export function VoiceCodingPanel({ open, onOpenChange }: VoiceCodingPanelProps) {
  // ── Voice Input State ──
  const [isRecording, setIsRecording] = useState(false);
  const [transcription, setTranscription] = useState("");
  const [detectedLanguage, setDetectedLanguage] = useState("");
  const [processing, setProcessing] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);
  const recordingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [recordingDuration, setRecordingDuration] = useState(0);

  // ── Command History State ──
  const [commandHistory, setCommandHistory] = useState<CommandEntry[]>([]);

  // ── Meeting Notes State ──
  const [meetingTranscript, setMeetingTranscript] = useState("");
  const [extractingTasks, setExtractingTasks] = useState(false);
  const [actionItems, setActionItems] = useState<ActionItem[]>([]);

  // ── Toggle recording ──
  const toggleRecording = useCallback(() => {
    if (isRecording) {
      setIsRecording(false);
      if (recordingTimerRef.current) {
        clearInterval(recordingTimerRef.current);
        recordingTimerRef.current = null;
      }
      // Simulate transcription on stop
      if (transcription.trim() === "") {
        setTranscription("Create a function that validates email addresses in TypeScript");
        setDetectedLanguage("TypeScript");
      }
      toast.success("Recording stopped");
    } else {
      setIsRecording(true);
      setRecordingDuration(0);
      recordingTimerRef.current = setInterval(() => {
        setRecordingDuration((d) => d + 1);
      }, 1000);
      toast.info("Recording started... Speak your command");
    }
  }, [isRecording, transcription]);

  // ── Process voice command ──
  const processCommand = useCallback(async () => {
    if (!transcription.trim()) {
      toast.error("No transcription to process");
      return;
    }

    setProcessing(true);
    try {
      const res = await fetch("/api/voice-coding", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          transcript: transcription.trim(),
          language: detectedLanguage || "typescript",
        }),
      });

      if (res.ok) {
        const data = await res.json();
        const entry: CommandEntry = {
          id: `cmd-${Date.now()}`,
          transcript: transcription.trim(),
          action: data.action || "unknown",
          code: data.code || "",
          command: data.command || transcription.trim(),
          explanation: data.explanation || "Command processed",
          timestamp: new Date(),
        };
        setCommandHistory((prev) => [entry, ...prev]);
        toast.success("Voice command processed");
      } else {
        const data = await res.json();
        toast.error(data.error || "Failed to process command");
      }
    } catch {
      toast.error("Request failed");
    } finally {
      setProcessing(false);
    }
  }, [transcription, detectedLanguage]);

  // ── Extract tasks from meeting ──
  const extractTasks = useCallback(async () => {
    if (!meetingTranscript.trim()) {
      toast.error("Please paste a meeting transcript");
      return;
    }

    setExtractingTasks(true);
    try {
      const res = await fetch("/api/voice-coding", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          transcript: `Extract action items from this meeting transcript:\n\n${meetingTranscript}`,
          language: "text",
        }),
      });

      if (res.ok) {
        const data = await res.json();
        // Parse action items from AI response
        const items: ActionItem[] = [];
        const lines = (data.explanation || data.code || "").split("\n").filter((l: string) => l.trim());

        for (let i = 0; i < Math.min(lines.length, 10); i++) {
          const line = lines[i].replace(/^[-*•\d.)\s]+/, "").trim();
          if (line) {
            items.push({
              id: `task-${Date.now()}-${i}`,
              text: line,
              assignee: "",
              priority: i < 2 ? "high" : i < 5 ? "medium" : "low",
              completed: false,
            });
          }
        }

        if (items.length === 0) {
          // Fallback: create items from the raw response
          const rawText = data.explanation || data.command || "";
          items.push({
            id: `task-${Date.now()}-0`,
            text: rawText || "Review meeting notes for action items",
            assignee: "",
            priority: "medium",
            completed: false,
          });
        }

        setActionItems(items);
        toast.success(`Extracted ${items.length} action items`);
      } else {
        toast.error("Failed to extract tasks");
      }
    } catch {
      toast.error("Request failed");
    } finally {
      setExtractingTasks(false);
    }
  }, [meetingTranscript]);

  // ── Copy generated code ──
  const handleCopyCode = async (code: string) => {
    await navigator.clipboard.writeText(code);
    setCopiedCode(true);
    toast.success("Code copied to clipboard");
    setTimeout(() => setCopiedCode(false), 2000);
  };

  // ── Toggle task completion ──
  const toggleTaskComplete = (id: string) => {
    setActionItems((prev) =>
      prev.map((item) =>
        item.id === id ? { ...item, completed: !item.completed } : item
      )
    );
  };

  // ── Update task assignee ──
  const updateAssignee = (id: string, assignee: string) => {
    setActionItems((prev) =>
      prev.map((item) =>
        item.id === id ? { ...item, assignee } : item
      )
    );
  };

  // ── Update task priority ──
  const updatePriority = (id: string, priority: "high" | "medium" | "low") => {
    setActionItems((prev) =>
      prev.map((item) =>
        item.id === id ? { ...item, priority } : item
      )
    );
  };

  // ── Get command type info ──
  const getCommandTypeInfo = (action: string) => {
    return COMMAND_TYPES.find((c) => c.value === action) ?? COMMAND_TYPES[0];
  };

  // ── Format duration ──
  const formatDuration = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, "0")}`;
  };

  // ── Render ──
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-4xl max-h-[92vh] p-0 gap-0 overflow-hidden flex flex-col overflow-hidden overflow-hidden flex flex-col">
        <DialogHeader className="px-6 pt-6 pb-0">
          <DialogTitle className="flex items-center gap-2">
            <Mic className="h-5 w-5" />
            Voice Coding Mode
          </DialogTitle>
          <DialogDescription>
            Code with your voice, process commands, and convert meeting notes to tasks
          </DialogDescription>
        </DialogHeader>
          <PowerToolHint name="Voice Coding" />

        <Tabs defaultValue="voice" className="flex flex-col flex-1 min-h-0">
          <div className="px-6 pt-2">
            <TabsList className="w-full">
              <TabsTrigger value="voice" className="flex-1 gap-1.5">
                <Mic className="h-3.5 w-3.5" />
                Voice Input
              </TabsTrigger>
              <TabsTrigger value="commands" className="flex-1 gap-1.5">
                <Terminal className="h-3.5 w-3.5" />
                Commands
              </TabsTrigger>
              <TabsTrigger value="meetings" className="flex-1 gap-1.5">
                <ListChecks className="h-3.5 w-3.5" />
                Meeting → Tasks
              </TabsTrigger>
            </TabsList>
          </div>

          {/* ──────── VOICE INPUT TAB ──────── */}
          <TabsContent value="voice" className="flex-1 min-h-0 mt-0 overflow-y-auto">
            <ScrollArea className="h-[calc(90vh-14rem)]">
              <div className="p-6 space-y-5">
                {/* Record Button */}
                <div className="flex flex-col items-center justify-center py-6 space-y-4">
                  <button
                    onClick={toggleRecording}
                    className={cn(
                      "h-20 w-20 rounded-full flex items-center justify-center transition-all duration-200",
                      "hover:scale-105 active:scale-95",
                      isRecording
                        ? "bg-red-500/20 border-2 border-red-500 shadow-lg shadow-red-500/20"
                        : "bg-primary/10 border-2 border-primary/30 hover:border-primary/50"
                    )}
                  >
                    {isRecording ? (
                      <MicOff className="h-8 w-8 text-red-500" />
                    ) : (
                      <Mic className="h-8 w-8 text-primary" />
                    )}
                  </button>
                  <div className="text-center">
                    {isRecording ? (
                      <>
                        <p className="text-sm font-medium text-red-500">Recording...</p>
                        <p className="text-xs text-muted-foreground mt-1">
                          {formatDuration(recordingDuration)}
                        </p>
                      </>
                    ) : (
                      <p className="text-sm text-muted-foreground">
                        Click to start recording
                      </p>
                    )}
                  </div>
                </div>

                {/* Transcription Display */}
                <div className="rounded-lg border bg-card p-4 space-y-2">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs text-muted-foreground">Transcription</Label>
                    {detectedLanguage && (
                      <Badge variant="outline" className="h-5 text-[10px] gap-1">
                        <Languages className="h-3 w-3" />
                        {detectedLanguage}
                      </Badge>
                    )}
                  </div>
                  <Textarea
                    value={transcription}
                    onChange={(e) => setTranscription(e.target.value)}
                    placeholder="Your voice transcription will appear here, or type manually..."
                    className="min-h-[100px] text-sm"
                    rows={4}
                  />
                  <div className="flex items-center gap-2">
                    <Label className="text-xs text-muted-foreground">Detected Language:</Label>
                    <div className="flex flex-wrap gap-1">
                      {DETECTED_LANGUAGES.map((lang) => (
                        <Button
                          key={lang}
                          variant={detectedLanguage === lang ? "default" : "ghost"}
                          size="sm"
                          className="h-6 text-[10px] px-2"
                          onClick={() => setDetectedLanguage(lang)}
                        >
                          {lang}
                        </Button>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Process Button */}
                <Button
                  onClick={processCommand}
                  disabled={processing || !transcription.trim()}
                  className="w-full"
                >
                  {processing ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Play className="h-4 w-4 mr-2" />
                  )}
                  {processing ? "Processing..." : "Process Voice Command"}
                </Button>

                {/* Latest result preview */}
                {commandHistory.length > 0 && (
                  <div className="rounded-lg border bg-card p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <Label className="text-xs font-semibold">Latest AI Interpretation</Label>
                      {commandHistory[0].code && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 text-[10px] gap-1"
                          onClick={() => handleCopyCode(commandHistory[0].code)}
                        >
                          {copiedCode ? (
                            <Check className="h-3 w-3 text-emerald-400" />
                          ) : (
                            <Copy className="h-3 w-3" />
                          )}
                          {copiedCode ? "Copied" : "Copy Code"}
                        </Button>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      {(() => {
                        const ct = getCommandTypeInfo(commandHistory[0].action);
                        const CTIcon = ct.icon;
                        return (
                          <Badge variant="outline" className="h-5 text-[10px] gap-1">
                            <CTIcon className={cn("h-3 w-3", ct.color)} />
                            {ct.label}
                          </Badge>
                        );
                      })()}
                      <span className="text-xs text-muted-foreground">
                        {commandHistory[0].explanation}
                      </span>
                    </div>
                    {commandHistory[0].code && (
                      <pre className="text-xs bg-muted/50 rounded-md p-3 overflow-x-auto whitespace-pre-wrap max-h-48 overflow-y-auto">
                        {commandHistory[0].code}
                      </pre>
                    )}
                  </div>
                )}
              </div>
            </ScrollArea>
          </TabsContent>

          {/* ──────── COMMANDS TAB ──────── */}
          <TabsContent value="commands" className="flex-1 min-h-0 mt-0 overflow-y-auto">
            <ScrollArea className="h-[calc(90vh-14rem)]">
              <div className="p-6 space-y-4">
                <div className="flex items-center justify-between">
                  <div className="text-sm text-muted-foreground">
                    {commandHistory.length} command{commandHistory.length !== 1 ? "s" : ""}
                  </div>
                  {commandHistory.length > 0 && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 text-xs"
                      onClick={() => {
                        setCommandHistory([]);
                        toast.success("Command history cleared");
                      }}
                    >
                      Clear History
                    </Button>
                  )}
                </div>

                {commandHistory.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                    <Terminal className="h-10 w-10 mb-3 opacity-40" />
                    <p className="text-sm">No commands yet</p>
                    <p className="text-xs mt-1">Process a voice command to see it here</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {commandHistory.map((cmd) => {
                      const ct = getCommandTypeInfo(cmd.action);
                      const CTIcon = ct.icon;
                      return (
                        <div
                          key={cmd.id}
                          className="rounded-lg border bg-card p-4 space-y-2"
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <CTIcon className={cn("h-4 w-4", ct.color)} />
                              <Badge variant="outline" className="h-5 text-[10px]">
                                {ct.label}
                              </Badge>
                              <span className="text-xs text-muted-foreground">
                                {cmd.timestamp.toLocaleTimeString()}
                              </span>
                            </div>
                            {cmd.code && (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-6 text-[10px] gap-1"
                                onClick={() => handleCopyCode(cmd.code)}
                              >
                                <Copy className="h-3 w-3" />
                                Copy
                              </Button>
                            )}
                          </div>
                          <p className="text-sm">
                            <span className="text-muted-foreground">Transcript: </span>
                            &quot;{cmd.transcript}&quot;
                          </p>
                          <p className="text-xs text-muted-foreground">
                            <span className="font-medium">AI Interpretation:</span>{" "}
                            {cmd.explanation}
                          </p>
                          {cmd.command !== cmd.transcript && (
                            <p className="text-xs">
                              <span className="text-muted-foreground">Command: </span>
                              <code className="bg-muted/50 px-1.5 py-0.5 rounded">
                                {cmd.command}
                              </code>
                            </p>
                          )}
                          {cmd.code && (
                            <pre className="text-xs bg-muted/50 rounded-md p-2 overflow-x-auto whitespace-pre-wrap max-h-32 overflow-y-auto">
                              {cmd.code}
                            </pre>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </ScrollArea>
          </TabsContent>

          {/* ──────── MEETING → TASKS TAB ──────── */}
          <TabsContent value="meetings" className="flex-1 min-h-0 mt-0 overflow-y-auto">
            <ScrollArea className="h-[calc(90vh-14rem)]">
              <div className="p-6 space-y-5">
                {/* Transcript Input */}
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <ClipboardPaste className="h-4 w-4 text-purple-400" />
                    <Label className="text-sm font-semibold">Meeting Transcript</Label>
                  </div>
                  <Textarea
                    value={meetingTranscript}
                    onChange={(e) => setMeetingTranscript(e.target.value)}
                    placeholder="Paste your meeting transcript here... The AI will extract action items, assignees, and priorities."
                    className="min-h-[150px] text-sm"
                    rows={6}
                  />
                  <Button
                    onClick={extractTasks}
                    disabled={extractingTasks || !meetingTranscript.trim()}
                    className="w-full"
                  >
                    {extractingTasks ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <ListChecks className="h-4 w-4 mr-2" />
                    )}
                    {extractingTasks ? "Extracting Tasks..." : "Extract Action Items"}
                  </Button>
                </div>

                {/* Action Items */}
                {actionItems.length > 0 && (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <ListChecks className="h-4 w-4 text-emerald-400" />
                        <Label className="text-sm font-semibold">
                          Action Items ({actionItems.length})
                        </Label>
                      </div>
                      <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <span className="h-2 w-2 rounded-full bg-red-400" />
                          High
                        </span>
                        <span className="flex items-center gap-1">
                          <span className="h-2 w-2 rounded-full bg-amber-400" />
                          Medium
                        </span>
                        <span className="flex items-center gap-1">
                          <span className="h-2 w-2 rounded-full bg-emerald-400" />
                          Low
                        </span>
                      </div>
                    </div>

                    <div className="space-y-2">
                      {actionItems.map((item) => (
                        <div
                          key={item.id}
                          className={cn(
                            "rounded-lg border bg-card p-3 space-y-2 transition-colors",
                            item.completed && "opacity-60"
                          )}
                        >
                          <div className="flex items-start gap-3">
                            <button
                              onClick={() => toggleTaskComplete(item.id)}
                              className={cn(
                                "mt-0.5 h-5 w-5 rounded border flex items-center justify-center shrink-0 transition-colors",
                                item.completed
                                  ? "bg-emerald-500 border-emerald-500"
                                  : "border-muted-foreground/30 hover:border-primary"
                              )}
                            >
                              {item.completed && (
                                <Check className="h-3 w-3 text-white" />
                              )}
                            </button>
                            <div className="flex-1 min-w-0">
                              <p
                                className={cn(
                                  "text-sm",
                                  item.completed && "line-through text-muted-foreground"
                                )}
                              >
                                {item.text}
                              </p>
                            </div>
                            <div className="flex items-center gap-1.5 shrink-0">
                              <button
                                onClick={() => updatePriority(item.id, "high")}
                                className={cn(
                                  "h-5 w-5 rounded-full flex items-center justify-center transition-colors",
                                  item.priority === "high"
                                    ? "bg-red-500/20 border border-red-500/40"
                                    : "hover:bg-red-500/10"
                                )}
                              >
                                <span className="h-2 w-2 rounded-full bg-red-400" />
                              </button>
                              <button
                                onClick={() => updatePriority(item.id, "medium")}
                                className={cn(
                                  "h-5 w-5 rounded-full flex items-center justify-center transition-colors",
                                  item.priority === "medium"
                                    ? "bg-amber-500/20 border border-amber-500/40"
                                    : "hover:bg-amber-500/10"
                                )}
                              >
                                <span className="h-2 w-2 rounded-full bg-amber-400" />
                              </button>
                              <button
                                onClick={() => updatePriority(item.id, "low")}
                                className={cn(
                                  "h-5 w-5 rounded-full flex items-center justify-center transition-colors",
                                  item.priority === "low"
                                    ? "bg-emerald-500/20 border border-emerald-500/40"
                                    : "hover:bg-emerald-500/10"
                                )}
                              >
                                <span className="h-2 w-2 rounded-full bg-emerald-400" />
                              </button>
                            </div>
                          </div>
                          <div className="flex items-center gap-2 pl-8">
                            <UserPlus className="h-3 w-3 text-muted-foreground shrink-0" />
                            <Input
                              value={item.assignee}
                              onChange={(e) => updateAssignee(item.id, e.target.value)}
                              placeholder="Assign to..."
                              className="h-6 text-xs border-0 bg-transparent p-0 focus-visible:ring-0"
                            />
                          </div>
                        </div>
                      ))}
                    </div>

                    <Separator />

                    {/* Summary */}
                    <div className="flex items-center gap-4 text-xs text-muted-foreground">
                      <span>
                        {actionItems.filter((i) => i.completed).length}/{actionItems.length} completed
                      </span>
                      <span>
                        {actionItems.filter((i) => i.priority === "high").length} high priority
                      </span>
                      <span>
                        {actionItems.filter((i) => i.assignee).length} assigned
                      </span>
                    </div>
                  </div>
                )}

                {actionItems.length === 0 && !extractingTasks && (
                  <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
                    <MessageSquare className="h-10 w-10 mb-3 opacity-40" />
                    <p className="text-sm">No action items extracted yet</p>
                    <p className="text-xs mt-1">Paste a meeting transcript and click &quot;Extract Action Items&quot;</p>
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
