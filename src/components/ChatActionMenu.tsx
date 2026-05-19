"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { Star, Pencil, Download, Trash2, MoreHorizontal } from "lucide-react";

interface ChatActionMenuProps {
  isFavorite: boolean;
  onToggleFavorite: (e: React.MouseEvent) => void;
  onRename: () => void;
  onExportMarkdown: () => void;
  onExportJSON: () => void;
  onDelete: () => void;
}

/**
 * A custom dropdown menu that does NOT use Radix UI Portal.
 * Renders directly in the DOM tree with inline styles for guaranteed visibility.
 * Uses a global click-away listener to close.
 * Supports both light and dark modes.
 */
export function ChatActionMenu({
  isFavorite,
  onToggleFavorite,
  onRename,
  onExportMarkdown,
  onExportJSON,
  onDelete,
}: ChatActionMenuProps) {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const [isDark, setIsDark] = useState(false);

  // Detect dark mode
  useEffect(() => {
    const checkDark = () => {
      const hasDark = document.documentElement.classList.contains("dark") ||
        document.documentElement.getAttribute("data-theme") === "dark" ||
        window.matchMedia("(prefers-color-scheme: dark)").matches;
      setIsDark(hasDark);
    };
    checkDark();
    // Observe class changes on <html>
    const observer = new MutationObserver(checkDark);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class", "data-theme"] });
    return () => observer.disconnect();
  }, []);

  // Colors based on theme
  const colors = isDark ? {
    btnBg: "rgba(255,255,255,0.06)",
    btnBgHover: "rgba(255,255,255,0.12)",
    btnBorder: "rgba(255,255,255,0.1)",
    btnText: "rgba(255,255,255,0.55)",
    btnTextHover: "rgba(255,255,255,0.9)",
    menuBg: "#1e1e2e",
    menuBorder: "rgba(255,255,255,0.1)",
    menuShadow: "0 4px 16px rgba(0,0,0,0.4), 0 1px 4px rgba(0,0,0,0.3)",
    itemText: "rgba(255,255,255,0.85)",
    itemHoverBg: "rgba(255,255,255,0.06)",
    destructiveHoverBg: "rgba(239,68,68,0.15)",
    separatorBg: "rgba(255,255,255,0.08)",
  } : {
    btnBg: "rgba(0,0,0,0.04)",
    btnBgHover: "rgba(0,0,0,0.08)",
    btnBorder: "rgba(0,0,0,0.1)",
    btnText: "rgba(0,0,0,0.5)",
    btnTextHover: "rgba(0,0,0,0.8)",
    menuBg: "#ffffff",
    menuBorder: "rgba(0,0,0,0.12)",
    menuShadow: "0 4px 16px rgba(0,0,0,0.12), 0 1px 4px rgba(0,0,0,0.08)",
    itemText: "rgba(0,0,0,0.8)",
    itemHoverBg: "rgba(0,0,0,0.04)",
    destructiveHoverBg: "rgba(239,68,68,0.08)",
    separatorBg: "rgba(0,0,0,0.08)",
  };

  // Close on click outside
  const handleClickOutside = useCallback((e: MouseEvent) => {
    if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
      setOpen(false);
    }
  }, []);

  useEffect(() => {
    if (open) {
      document.addEventListener("mousedown", handleClickOutside);
      const handleEsc = (e: KeyboardEvent) => {
        if (e.key === "Escape") setOpen(false);
      };
      document.addEventListener("keydown", handleEsc);
      return () => {
        document.removeEventListener("mousedown", handleClickOutside);
        document.removeEventListener("keydown", handleEsc);
      };
    }
  }, [open, handleClickOutside]);

  return (
    <div ref={menuRef} style={{ position: "relative", flexShrink: 0 }}>
      {/* ⋮ Trigger button - ALWAYS VISIBLE with inline styles */}
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          e.preventDefault();
          setOpen((prev) => !prev);
        }}
        style={{
          width: 28,
          height: 28,
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          borderRadius: 6,
          border: `1px solid ${colors.btnBorder}`,
          background: colors.btnBg,
          color: colors.btnText,
          cursor: "pointer",
          flexShrink: 0,
          transition: "all 0.15s ease",
          padding: 0,
          outline: "none",
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.background = colors.btnBgHover;
          e.currentTarget.style.color = colors.btnTextHover;
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = colors.btnBg;
          e.currentTarget.style.color = colors.btnText;
        }}
        title="Actions: Favorite, Rename, Export, Delete"
      >
        <MoreHorizontal style={{ width: 16, height: 16, pointerEvents: "none" }} />
      </button>

      {/* Dropdown panel - positioned absolutely, NO portal */}
      {open && (
        <div
          style={{
            position: "absolute",
            right: 0,
            top: "100%",
            zIndex: 9999,
            minWidth: 192,
            marginTop: 4,
            background: colors.menuBg,
            border: `1px solid ${colors.menuBorder}`,
            borderRadius: 8,
            boxShadow: colors.menuShadow,
            padding: "4px 0",
            overflow: "hidden",
          }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Favorite / Remove from Favorites */}
          <MenuItem
            icon={<Star style={{ width: 14, height: 14, color: "#f59e0b", fill: isFavorite ? "#f59e0b" : "none" }} />}
            label={isFavorite ? "Remove from Favorites" : "Add to Favorites"}
            onClick={(e) => { onToggleFavorite(e); setOpen(false); }}
            colors={colors}
          />

          {/* Rename */}
          <MenuItem
            icon={<Pencil style={{ width: 14, height: 14 }} />}
            label="Rename"
            onClick={() => { onRename(); setOpen(false); }}
            colors={colors}
          />

          {/* Separator */}
          <div style={{ height: 1, background: colors.separatorBg, margin: "4px 0" }} />

          {/* Export Markdown */}
          <MenuItem
            icon={<Download style={{ width: 14, height: 14, color: "#10b981" }} />}
            label="Export Markdown"
            onClick={() => { onExportMarkdown(); setOpen(false); }}
            colors={colors}
          />

          {/* Export JSON */}
          <MenuItem
            icon={<Download style={{ width: 14, height: 14, color: "#10b981" }} />}
            label="Export JSON"
            onClick={() => { onExportJSON(); setOpen(false); }}
            colors={colors}
          />

          {/* Separator */}
          <div style={{ height: 1, background: colors.separatorBg, margin: "4px 0" }} />

          {/* Delete */}
          <MenuItem
            icon={<Trash2 style={{ width: 14, height: 14, color: "#ef4444" }} />}
            label="Delete"
            onClick={() => { onDelete(); setOpen(false); }}
            destructive
            colors={colors}
          />
        </div>
      )}
    </div>
  );
}

/** Individual menu item with hover effect */
function MenuItem({
  icon,
  label,
  onClick,
  destructive = false,
  colors,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: (e?: React.MouseEvent) => void;
  destructive?: boolean;
  colors: { itemText: string; itemHoverBg: string; destructiveHoverBg: string };
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        width: "100%",
        padding: "8px 12px",
        border: "none",
        background: "transparent",
        color: destructive ? "#ef4444" : colors.itemText,
        fontSize: 13,
        cursor: "pointer",
        textAlign: "left",
        outline: "none",
        transition: "background 0.1s ease",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = destructive ? colors.destructiveHoverBg : colors.itemHoverBg;
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = "transparent";
      }}
    >
      <span style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 16, height: 16, flexShrink: 0 }}>
        {icon}
      </span>
      <span style={{ flex: 1 }}>{label}</span>
    </button>
  );
}
