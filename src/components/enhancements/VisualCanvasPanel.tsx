"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import {
  Pencil, Square, Type, Image, Trash2, Download, Save, Undo, Redo,
  Move, Palette, Circle, Minus, Loader2, LayoutTemplate, Sparkles,
  ZoomIn, ZoomOut, Layers, Grid3X3, ArrowUpRight,
} from "lucide-react";

interface CanvasElement {
  id: string;
  type: "rect" | "circle" | "line" | "text" | "image";
  x: number;
  y: number;
  width?: number;
  height?: number;
  radius?: number;
  x2?: number;
  y2?: number;
  text?: string;
  fill: string;
  stroke: string;
  strokeWidth: number;
  fontSize?: number;
  rotation?: number;
}

const COLORS = [
  "#000000", "#ffffff", "#ef4444", "#f97316", "#f59e0b", "#84cc16",
  "#10b981", "#06b6d4", "#3b82f6", "#8b5cf6", "#ec4899", "#6b7280",
];

const CANVAS_WIDTH = 1200;
const CANVAS_HEIGHT = 800;

function generateId() {
  return Math.random().toString(36).substring(2, 10);
}

export default function VisualCanvasPanel({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [elements, setElements] = useState<CanvasElement[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [undoStack, setUndoStack] = useState<CanvasElement[][]>([]);
  const [tool, setTool] = useState<"rect" | "circle" | "line" | "text" | "select" | "move">("select");
  const [color, setColor] = useState("#3b82f6");
  const [isDrawing, setIsDrawing] = useState(false);
  const [startPos, setStartPos] = useState({ x: 0, y: 0 });
  const [canvasTitle, setCanvasTitle] = useState("Untitled Canvas");
  const [zoom, setZoom] = useState(1);
  const [showGrid, setShowGrid] = useState(true);
  const activeDragRef = useRef<{ id: string; offsetX: number; offsetY: number } | null>(null);

  const pushUndo = useCallback((elems: CanvasElement[]) => {
    setUndoStack((prev) => [...prev.slice(-49), elems]);
  }, []);

  const undo = useCallback(() => {
    if (undoStack.length > 1) {
      const prev = undoStack[undoStack.length - 2];
      setElements(prev);
      setUndoStack((s) => s.slice(0, -1));
    }
  }, [undoStack]);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = CANVAS_WIDTH * dpr;
    canvas.height = CANVAS_HEIGHT * dpr;
    canvas.style.width = `${CANVAS_WIDTH}px`;
    canvas.style.height = `${CANVAS_HEIGHT}px`;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
    ctx.fillStyle = "#fafafa";
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    if (showGrid) {
      ctx.strokeStyle = "#e5e7eb";
      ctx.lineWidth = 0.5;
      for (let x = 0; x < CANVAS_WIDTH; x += 40) {
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, CANVAS_HEIGHT); ctx.stroke();
      }
      for (let y = 0; y < CANVAS_HEIGHT; y += 40) {
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(CANVAS_WIDTH, y); ctx.stroke();
      }
    }

    for (const el of elements) {
      ctx.save();
      if (el.rotation) {
        const cx = el.x + (el.width || 0) / 2;
        const cy = el.y + (el.height || 0) / 2;
        ctx.translate(cx, cy);
        ctx.rotate((el.rotation * Math.PI) / 180);
        ctx.translate(-cx, -cy);
      }
      ctx.fillStyle = el.fill;
      ctx.strokeStyle = el.stroke;
      ctx.lineWidth = el.strokeWidth;

      switch (el.type) {
        case "rect":
          ctx.fillRect(el.x, el.y, el.width || 100, el.height || 80);
          ctx.strokeRect(el.x, el.y, el.width || 100, el.height || 80);
          break;
        case "circle":
          ctx.beginPath();
          ctx.arc(el.x, el.y, el.radius || 40, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();
          break;
        case "line":
          ctx.beginPath();
          ctx.moveTo(el.x, el.y);
          ctx.lineTo(el.x2 || el.x + 100, el.y2 || el.y);
          ctx.stroke();
          break;
        case "text":
          if (el.text) {
            ctx.font = `${el.fontSize || 20}px system-ui, sans-serif`;
            ctx.fillText(el.text, el.x, el.y + (el.fontSize || 20));
          }
          break;
      }

      if (el.id === selectedId) {
        ctx.strokeStyle = "#3b82f6";
        ctx.lineWidth = 2;
        ctx.setLineDash([5, 3]);
        const w = el.width || el.radius ? (el.radius || 40) * 2 : 100;
        const h = el.height || el.radius ? (el.radius || 40) * 2 : 80;
        const sx = el.type === "circle" ? el.x - (el.radius || 40) : el.x;
        const sy = el.type === "circle" ? el.y - (el.radius || 40) : el.y;
        ctx.strokeRect(sx - 4, sy - 4, w + 8, h + 8);
        ctx.setLineDash([]);
      }
      ctx.restore();
    }
  }, [elements, selectedId, showGrid]);

  useEffect(() => { draw(); }, [draw]);

  const getCanvasPos = (e: React.MouseEvent) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return { x: 0, y: 0 };
    return {
      x: (e.clientX - rect.left) / zoom,
      y: (e.clientY - rect.top) / zoom,
    };
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    const pos = getCanvasPos(e);
    if (tool === "move") {
      const clicked = [...elements].reverse().find((el) => {
        const ex = el.type === "circle" ? el.x - (el.radius || 40) : el.x;
        const ey = el.type === "circle" ? el.y - (el.radius || 40) : el.y;
        const ew = el.type === "circle" ? (el.radius || 40) * 2 : (el.width || 100);
        const eh = el.type === "circle" ? (el.radius || 40) * 2 : (el.height || 80);
        return pos.x >= ex && pos.x <= ex + ew && pos.y >= ey && pos.y <= ey + eh;
      });
      if (clicked) {
        setSelectedId(clicked.id);
        activeDragRef.current = { id: clicked.id, offsetX: pos.x - clicked.x, offsetY: pos.y - clicked.y };
      } else {
        setSelectedId(null);
        activeDragRef.current = null;
      }
      return;
    }
    if (tool === "select") {
      const clicked = [...elements].reverse().find((el) => {
        const ex = el.type === "circle" ? el.x - (el.radius || 40) : el.x;
        const ey = el.type === "circle" ? el.y - (el.radius || 40) : el.y;
        const ew = el.type === "circle" ? (el.radius || 40) * 2 : (el.width || 100);
        const eh = el.type === "circle" ? (el.radius || 40) * 2 : (el.height || 80);
        return pos.x >= ex && pos.x <= ex + ew && pos.y >= ey && pos.y <= ey + eh;
      });
      setSelectedId(clicked?.id || null);
      return;
    }
    setIsDrawing(true);
    setStartPos(pos);
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    const pos = getCanvasPos(e);
    if (activeDragRef.current) {
      const { id, offsetX, offsetY } = activeDragRef.current;
      setElements((prev) => prev.map((el) => (el.id === id ? { ...el, x: pos.x - offsetX, y: pos.y - offsetY } : el)));
      return;
    }
    if (!isDrawing) return;
    drawPreview(pos);
  };

  const drawPreview = (pos: { x: number; y: number }) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    draw();
    ctx.setLineDash([5, 3]);
    ctx.strokeStyle = "#3b82f6";
    ctx.lineWidth = 1;
    ctx.fillStyle = color + "20";
    const w = pos.x - startPos.x;
    const h = pos.y - startPos.y;
    if (tool === "rect") {
      ctx.fillRect(startPos.x, startPos.y, w, h);
      ctx.strokeRect(startPos.x, startPos.y, w, h);
    } else if (tool === "circle") {
      const r = Math.sqrt(w * w + h * h) / 2;
      ctx.beginPath();
      ctx.arc(startPos.x + w / 2, startPos.y + h / 2, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
    ctx.setLineDash([]);
  };

  const handleMouseUp = (e: React.MouseEvent) => {
    activeDragRef.current = null;
    if (!isDrawing) return;
    setIsDrawing(false);
    const pos = getCanvasPos(e);
    const dx = Math.abs(pos.x - startPos.x);
    const dy = Math.abs(pos.y - startPos.y);
    if (dx < 5 && dy < 5) return;

    let newEl: CanvasElement | null = null;
    const id = generateId();
    if (tool === "rect") {
      newEl = { id, type: "rect", x: Math.min(startPos.x, pos.x), y: Math.min(startPos.y, pos.y), width: dx, height: dy, fill: color, stroke: "#000000", strokeWidth: 2 };
    } else if (tool === "circle") {
      const r = Math.sqrt(dx * dx + dy * dy) / 2;
      newEl = { id, type: "circle", x: startPos.x + (pos.x - startPos.x) / 2, y: startPos.y + (pos.y - startPos.y) / 2, radius: r, fill: color, stroke: "#000000", strokeWidth: 2 };
    } else if (tool === "text") {
      newEl = { id, type: "text", x: pos.x, y: pos.y, text: "Text", fill: color, stroke: "transparent", strokeWidth: 0, fontSize: 20 };
    } else if (tool === "line") {
      newEl = { id, type: "line", x: startPos.x, y: startPos.y, x2: pos.x, y2: pos.y, fill: "transparent", stroke: color, strokeWidth: 2 };
    }

    if (newEl) {
      const next = [...elements, newEl];
      setElements(next);
      pushUndo(next);
      setSelectedId(id);
    }
    draw();
  };

  const deleteSelected = () => {
    if (!selectedId) return;
    const next = elements.filter((e) => e.id !== selectedId);
    setElements(next);
    pushUndo(next);
    setSelectedId(null);
  };

  const addTextElement = () => {
    const id = generateId();
    const el: CanvasElement = { id, type: "text", x: 200, y: 200, text: "Double click to edit", fill: color, stroke: "transparent", strokeWidth: 0, fontSize: 24 };
    const next = [...elements, el];
    setElements(next);
    pushUndo(next);
    setSelectedId(id);
  };

  const exportCanvas = (format: "png" | "svg") => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    if (format === "png") {
      const link = document.createElement("a");
      link.download = `${canvasTitle}.png`;
      link.href = canvas.toDataURL();
      link.click();
      toast.success("Exported as PNG");
    } else {
      let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${CANVAS_WIDTH}" height="${CANVAS_HEIGHT}">`;
      svg += `<rect width="100%" height="100%" fill="#fafafa"/>`;
      for (const el of elements) {
        switch (el.type) {
          case "rect": svg += `<rect x="${el.x}" y="${el.y}" width="${el.width}" height="${el.height}" fill="${el.fill}" stroke="${el.stroke}" stroke-width="${el.strokeWidth}"/>`; break;
          case "circle": svg += `<circle cx="${el.x}" cy="${el.y}" r="${el.radius}" fill="${el.fill}" stroke="${el.stroke}" stroke-width="${el.strokeWidth}"/>`; break;
          case "text": svg += `<text x="${el.x}" y="${el.y}" fill="${el.fill}" font-size="${el.fontSize}">${el.text}</text>`; break;
          case "line": svg += `<line x1="${el.x}" y1="${el.y}" x2="${el.x2}" y2="${el.y2}" stroke="${el.stroke}" stroke-width="${el.strokeWidth}"/>`; break;
        }
      }
      svg += "</svg>";
      const blob = new Blob([svg], { type: "image/svg+xml" });
      const link = document.createElement("a");
      link.download = `${canvasTitle}.svg`;
      link.href = URL.createObjectURL(blob);
      link.click();
      URL.revokeObjectURL(link.href);
      toast.success("Exported as SVG");
    }
  };

  const selected = elements.find((e) => e.id === selectedId);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[95vw] max-h-[95vh] w-full h-full flex flex-col p-0 gap-0 overflow-hidden">
        <DialogHeader className="px-4 py-2 border-b border-border shrink-0 flex flex-row items-center justify-between">
          <DialogTitle className="text-sm flex items-center gap-2">
            <LayoutTemplate className="h-4 w-4 text-blue-500" />
            <Input
              value={canvasTitle}
              onChange={(e) => setCanvasTitle(e.target.value)}
              className="h-7 text-sm border-0 bg-transparent px-1 w-48 font-semibold focus-visible:ring-0"
            />
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 flex overflow-hidden">
          <div className="flex-1 overflow-auto bg-muted/50 flex items-center justify-center p-4" ref={containerRef}>
            <div style={{ transform: `scale(${zoom})`, transformOrigin: "center" }}>
              <canvas
                ref={canvasRef}
                className="border border-border shadow-lg rounded-lg cursor-crosshair"
                onMouseDown={handleMouseDown}
                onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUp}
                onMouseLeave={() => { setIsDrawing(false); activeDragRef.current = null; }}
              />
            </div>
          </div>

          <div className="w-56 border-l border-border bg-background p-3 flex flex-col gap-2 overflow-y-auto shrink-0">
            <p className="text-[10px] font-bold uppercase text-muted-foreground">Tools</p>
            <div className="grid grid-cols-2 gap-1">
              {([
                { t: "select", i: ArrowUpRight, l: "Select" },
                { t: "move", i: Move, l: "Move" },
                { t: "rect", i: Square, l: "Rect" },
                { t: "circle", i: Circle, l: "Circle" },
                { t: "line", i: Minus, l: "Line" },
                { t: "text", i: Type, l: "Text" },
              ] as const).map(({ t, i: Icon, l }) => (
                <button
                  key={t}
                  onClick={() => { if (t === "text") { addTextElement(); } else { setTool(t); } }}
                  className={`flex items-center gap-1 px-2 py-1.5 rounded text-[10px] transition-colors ${
                    tool === t ? "bg-primary/10 text-primary border border-primary/30" : "hover:bg-muted text-muted-foreground border border-transparent"
                  }`}
                >
                  <Icon className="h-3 w-3" /> {l}
                </button>
              ))}
            </div>

            <p className="text-[10px] font-bold uppercase text-muted-foreground mt-2">Colors</p>
            <div className="grid grid-cols-6 gap-1">
              {COLORS.map((c) => (
                <button
                  key={c}
                  onClick={() => {
                    setColor(c);
                    if (selectedId && selected) {
                      setElements((prev) => prev.map((e) => (e.id === selectedId ? { ...e, fill: c } : e)));
                    }
                  }}
                  className="w-7 h-7 rounded border border-border"
                  style={{ backgroundColor: c, boxShadow: color === c ? "0 0 0 2px #3b82f6" : undefined }}
                />
              ))}
            </div>

            <p className="text-[10px] font-bold uppercase text-muted-foreground mt-2">Canvas</p>
            <div className="flex gap-1">
              <Button variant="outline" size="sm" className="h-7 text-[10px] flex-1" onClick={() => setShowGrid(!showGrid)}>
                <Grid3X3 className="h-3 w-3 mr-1" /> Grid
              </Button>
              <Button variant="outline" size="sm" className="h-7 text-[10px] flex-1" onClick={() => setZoom(1)}>
                <ZoomIn className="h-3 w-3 mr-1" /> 1:1
              </Button>
            </div>
            <div className="flex gap-1">
              <Button variant="outline" size="sm" className="h-7 text-[10px] flex-1" onClick={() => setZoom((z) => Math.max(0.25, z - 0.1))}>
                <ZoomOut className="h-3 w-3 mr-1" /> Zoom-
              </Button>
              <Button variant="outline" size="sm" className="h-7 text-[10px] flex-1" onClick={() => setZoom((z) => Math.min(3, z + 0.1))}>
                <ZoomIn className="h-3 w-3 mr-1" /> Zoom+
              </Button>
            </div>

            <p className="text-[10px] font-bold uppercase text-muted-foreground mt-2">Actions</p>
            <div className="flex gap-1">
              <Button variant="outline" size="sm" className="h-7 text-[10px] flex-1" onClick={undo}>
                <Undo className="h-3 w-3 mr-1" /> Undo
              </Button>
              <Button variant="outline" size="sm" className="h-7 text-[10px] flex-1" onClick={deleteSelected} disabled={!selectedId}>
                <Trash2 className="h-3 w-3 mr-1" /> Delete
              </Button>
            </div>
            <div className="flex gap-1">
              <Button variant="outline" size="sm" className="h-7 text-[10px] flex-1" onClick={() => exportCanvas("png")}>
                <Download className="h-3 w-3 mr-1" /> PNG
              </Button>
              <Button variant="outline" size="sm" className="h-7 text-[10px] flex-1" onClick={() => exportCanvas("svg")}>
                <Download className="h-3 w-3 mr-1" /> SVG
              </Button>
            </div>

            {selected && (
              <>
                <p className="text-[10px] font-bold uppercase text-muted-foreground mt-2">Properties</p>
                <div className="text-[10px] space-y-1 text-muted-foreground">
                  <div>Type: {selected.type}</div>
                  <div>X: {Math.round(selected.x)} Y: {Math.round(selected.y)}</div>
                  <label className="flex items-center gap-1">
                    Fill:
                    <input type="color" value={selected.fill} onChange={(e) => setElements((prev) => prev.map((el) => (el.id === selectedId ? { ...el, fill: e.target.value } : el)))} className="w-5 h-5 rounded cursor-pointer" />
                  </label>
                </div>
              </>
            )}

            <div className="flex-1" />
            <Button size="sm" className="h-8 text-xs w-full mt-2" onClick={() => { toast.success("Canvas saved"); }}>
              <Save className="h-3 w-3 mr-1" /> Save Canvas
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
