"use client";

import { PowerToolHint } from "./PowerToolHint";
import { useState, useRef, useCallback, useEffect } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Mic,
  MicOff,
  Loader2,
  Play,
  Terminal,
  FilePlus2,
  Sparkles,
  Brain,
  Copy,
  Check,
  Trash2,
} from "lucide-react";
import { cn } from "@/lib/utils";

import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { oneDark } from "react-syntax-highlighter/dist/esm/styles/prism";

interface VoiceCodePipelineProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface GeneratedCode {
  id: string;
  transcript: string;
  code: string;
  language: string;
  explanation: string;
  timestamp: number;
}

export function VoiceCodePipeline({ open, onOpenChange }: VoiceCodePipelineProps) {
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [interimTranscript, setInterimTranscript] = useState("");
  const [thinking, setThinking] = useState(false);
  const [generatedCode, setGeneratedCode] = useState<GeneratedCode | null>(null);
  const [history, setHistory] = useState<GeneratedCode[]>([]);
  const [copied, setCopied] = useState(false);
  const [isSupported, setIsSupported] = useState(true);
  const recognitionRef = useRef<any>(null);

  useEffect(() => {
    const SpeechRecognitionAPI =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognitionAPI) {
      setIsSupported(false);
    }
  }, []);

  const startListening = useCallback(() => {
    const SpeechRecognitionAPI =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognitionAPI) return;

    const recognition = new SpeechRecognitionAPI();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = "en-US";

    recognition.onresult = (event: any) => {
      let final = "";
      let interim = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        if (result.isFinal) {
          final += result[0]?.transcript || "";
        } else {
          interim += result[0]?.transcript || "";
        }
      }
      if (final) {
        setTranscript((prev) => (prev ? prev + " " + final : final));
      }
      setInterimTranscript(interim);
    };

    recognition.onerror = (e: any) => {
      if (e.error !== "aborted") {
        toast.error(`Voice error: ${e.error}`);
      }
      setIsListening(false);
    };

    recognition.onend = () => {
      setIsListening(false);
    };

    recognitionRef.current = recognition;
    recognition.start();
    setIsListening(true);
  }, []);

  const stopListening = useCallback(() => {
    if (recognitionRef.current) {
      recognitionRef.current.stop();
      recognitionRef.current = null;
    }
    setIsListening(false);
    setInterimTranscript("");
  }, []);

  const toggleMic = useCallback(() => {
    if (isListening) {
      stopListening();
    } else {
      startListening();
    }
  }, [isListening, startListening, stopListening]);

  const processTranscript = useCallback(async () => {
    const text = transcript.trim();
    if (!text) {
      toast.error("No transcription to process");
      return;
    }

    setThinking(true);
    try {
      const res = await fetch("/api/voice-coding", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transcript: text, language: "typescript" }),
      });

      if (res.ok) {
        const data = await res.json();
        const entry: GeneratedCode = {
          id: `vc-${Date.now()}`,
          transcript: text,
          code: data.code || "",
          language: "typescript",
          explanation: data.explanation || "",
          timestamp: Date.now(),
        };
        setGeneratedCode(entry);
        setHistory((prev) => [entry, ...prev]);
        setTranscript("");
        toast.success("Code generated from voice");
      } else {
        toast.error("Failed to generate code");
      }
    } catch {
      toast.error("Network error");
    } finally {
      setThinking(false);
    }
  }, [transcript]);

  const handleExecute = useCallback(() => {
    if (!generatedCode?.code) return;
    navigator.clipboard.writeText(generatedCode.code).then(() => {
      toast.success("Code copied for terminal execution");
    });
  }, [generatedCode]);

  const handleInsert = useCallback(() => {
    if (!generatedCode?.code) return;
    navigator.clipboard.writeText(generatedCode.code).then(() => {
      toast.success("Code copied to clipboard — paste into editor");
    });
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [generatedCode]);

  const clearAll = useCallback(() => {
    setTranscript("");
    setInterimTranscript("");
    setGeneratedCode(null);
    setHistory([]);
  }, []);

  const displayText = transcript + (interimTranscript ? " " + interimTranscript : "");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[700px] max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Mic className="h-5 w-5 text-rose-500" />
            Voice-to-Code Pipeline
          </DialogTitle>
          <DialogDescription>
            Speak your code request — AI generates the implementation
          </DialogDescription>
        </DialogHeader>

        <PowerToolHint name="Voice Coding" />

        <div className="flex-1 flex flex-col gap-4 min-h-0">
          {!isSupported && (
            <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/20 text-xs text-amber-600 dark:text-amber-400">
              Voice recognition requires Chrome, Edge, or a Chromium-based browser.
            </div>
          )}

          <div className="flex items-center justify-center">
            <button
              onClick={toggleMic}
              disabled={!isSupported || thinking}
              className={cn(
                "relative w-24 h-24 rounded-full flex items-center justify-center transition-all duration-300 border-4",
                isListening
                  ? "bg-red-500/20 border-red-500 text-red-500"
                  : "bg-muted border-border text-muted-foreground hover:border-rose-500/30 hover:text-rose-500"
              )}
            >
              {isListening ? (
                <>
                  <Mic className="h-10 w-10 animate-pulse" />
                  <span className="absolute inset-0 rounded-full border-4 border-red-500 animate-ping opacity-30" />
                </>
              ) : (
                <Mic className="h-10 w-10" />
              )}
            </button>
          </div>

          {isListening && (
            <p className="text-center text-xs text-rose-500 font-medium animate-pulse">
              Listening... Speak your code request
            </p>
          )}

          {(displayText || transcript) && (
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-muted-foreground">Transcription</label>
              <div className="p-3 rounded-lg bg-muted/50 border border-border min-h-[60px] text-sm">
                {displayText || transcript}
                {thinking && <span className="inline-block w-2 h-4 bg-primary animate-pulse ml-0.5 align-middle" />}
              </div>
            </div>
          )}

          {thinking && (
            <div className="flex items-center justify-center gap-2 text-muted-foreground py-2">
              <Brain className="h-4 w-4 animate-pulse text-primary" />
              <span className="text-xs">AI is generating code...</span>
            </div>
          )}

          <div className="flex gap-2 justify-center">
            <Button
              size="sm"
              variant="default"
              onClick={processTranscript}
              disabled={!transcript.trim() || thinking}
            >
              {thinking ? (
                <Loader2 className="h-4 w-4 animate-spin mr-1.5" />
              ) : (
                <Sparkles className="h-4 w-4 mr-1.5" />
              )}
              Generate Code
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={clearAll}
              disabled={!transcript && history.length === 0}
            >
              <Trash2 className="h-4 w-4 mr-1.5" />
              Clear
            </Button>
          </div>

          {generatedCode && (
            <div className="flex-1 flex flex-col min-h-0 space-y-2">
              <div className="flex items-center justify-between">
                <Badge variant="outline" className="text-xs">
                  <Sparkles className="h-3 w-3 mr-1 text-amber-500" />
                  Generated Code
                </Badge>
                <div className="flex gap-1">
              <Button size="icon" variant="outline" onClick={handleExecute} title="Copy for terminal">
                <Terminal className="h-3.5 w-3.5" />
              </Button>
              <Button size="icon" variant="outline" onClick={handleInsert} title="Insert into editor">
                {copied ? <Check className="h-3.5 w-3.5 text-green-500" /> : <FilePlus2 className="h-3.5 w-3.5" />}
              </Button>
              <Button size="icon" variant="ghost" onClick={() => {
                navigator.clipboard.writeText(generatedCode.code);
                toast.success("Copied to clipboard");
              }}>
                <Copy className="h-3.5 w-3.5" />
              </Button>
                </div>
              </div>

              <ScrollArea className="flex-1 rounded-lg border border-border bg-[#282c34]">
                <SyntaxHighlighter
                  language={generatedCode.language}
                  style={oneDark}
                  customStyle={{ margin: 0, borderRadius: 0, background: "transparent", fontSize: "0.8rem" }}
                  showLineNumbers
                >
                  {generatedCode.code || "// No code generated"}
                </SyntaxHighlighter>
              </ScrollArea>

              {generatedCode.explanation && (
                <div className="p-2 rounded-lg bg-muted/30 border border-border text-xs text-muted-foreground">
                  {generatedCode.explanation}
                </div>
              )}
            </div>
          )}

          {history.length > 1 && (
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-muted-foreground">
                History ({history.length})
              </label>
              <ScrollArea className="max-h-[150px] rounded-lg border border-border">
                <div className="p-2 space-y-1">
                  {history.slice(1).map((item) => (
                    <button
                      key={item.id}
                      onClick={() => setGeneratedCode(item)}
                      className="w-full text-left px-2 py-1.5 rounded-md hover:bg-muted transition-colors text-xs flex items-center gap-2"
                    >
                      <Mic className="h-3 w-3 text-rose-500 shrink-0" />
                      <span className="truncate flex-1">{item.transcript.slice(0, 80)}</span>
                      <span className="text-muted-foreground text-[10px] shrink-0">
                        {new Date(item.timestamp).toLocaleTimeString()}
                      </span>
                    </button>
                  ))}
                </div>
              </ScrollArea>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
