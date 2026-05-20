"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { Star, Pencil, Download, Trash2, MoreHorizontal } from "lucide-react";

interface ChatActionMenuProps {
  isFavorite: boolean;
  onToggleFavorite: (e: React.MouseEvent) => void;
  onRename: () => void;
  onExportMarkdown: () => void;
  onExportJSON: () => void;
  onDelete: () => void;
}

interface ColorScheme {
  btnBg: string;
  btnBgHover: string;
  btnBorder: string;
  btnText: string;
  btnTextHover: string;
  menuBg: string;
  menuBorder: string;
  menuShadow: string;
  itemText: string;
  itemHoverBg: string;
  destructiveHoverBg: string;
  separatorBg: string;
}

const DARK_COLORS: ColorScheme = {
  btnBg: "rgba(255,255,255,0.06)",
  btnBgHover: "rgba(255,255,255,0.12)",
  btnBorder: "rgba(255,255,255,0.1)",
  btnText: "rgba(255,255,255,0.55)",
  btnTextHover: "rgba(255,255,255,0.9)",
  menuBg: "#1e1e2e",
  menuBorder: "rgba(255,255,255,0.1)",
  menuShadow: "0 8px 24px rgba(0,0,0,0.5), 0 2px 8px rgba(0,0,0,0.3)",
  itemText: "rgba(255,255,255,0.85)",
  itemHoverBg: "rgba(255,255,255,0.06)",
  destructiveHoverBg: "rgba(239,68,68,0.15)",
  separatorBg: "rgba(255,255,255,0.08)",
};

const LIGHT_COLORS: ColorScheme = {
  btnBg: "rgba(0,0,0,0.04)",
  btnBgHover: "rgba(0,0,0,0.08)",
  btnBorder: "rgba(0,0,0,0.1)",
  btnText: "rgba(0,0,0,0.5)",
  btnTextHover: "rgba(0,0,0,0.8)",
  menuBg: "#ffffff",
  menuBorder: "rgba(0,0,0,0.12)",
  menuShadow: "0 8px 24px rgba(0,0,0,0.15), 0 2px 8px rgba(0,0,0,0.08)",
  itemText: "rgba(0,0,0,0.8)",
  itemHoverBg: "rgba(0,0,0,0.04)",
  destructiveHoverBg: "rgba(239,68,68,0.08)",
  separatorBg: "rgba(0,0,0,0.08)",
};

/**
 * A custom dropdown menu that does NOT use Radix UI Portal.
 * Uses createPortal + position:fixed for the dropdown panel to avoid being
 * clipped by any parent overflow:hidden/scroll containers (e.g. ScrollArea).
 * Calculates position dynamically from the trigger button's bounding rect.
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
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [isDark, setIsDark] = useState(false);
  const [menuPos, setMenuPos] = useState<{ top: number; left: number } | null>(null);
  const [mounted, setMounted] = useState(false);

  // Ensure we're mounted (for createPortal)
  useEffect(() => { setMounted(true); }, []);

  // Detect dark mode
  useEffect(() => {
    const checkDark = () => {
      const hasDark = document.documentElement.classList.contains("dark") ||
        document.documentElement.getAttribute("data-theme") === "dark" ||
        window.matchMedia("(prefers-color-scheme: dark)").matches;
      setIsDark(hasDark);
    };
    checkDark();
    const observer = new MutationObserver(checkDark);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class", "data-theme"] });
    return () => observer.disconnect();
  }, []);

  const colors = isDark ? DARK_COLORS : LIGHT_COLORS;

  // Close on click outside
  useEffect(() => {
    if (!open) return;

    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      // Don't close if clicking the trigger
      if (triggerRef.current && triggerRef.current.contains(target)) return;
      // Don't close if clicking inside the menu
      const menuEl = document.querySelector('[data-chat-action-menu="true"]');
      if (menuEl && menuEl.contains(target)) return;
      setOpen(false);
    };

    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };

    // Use small delay so the current click doesn't immediately close
    const timer = setTimeout(() => {
      document.addEventListener("mousedown", handleClickOutside);
      document.addEventListener("keydown", handleEsc);
    }, 10);

    return () => {
      clearTimeout(timer);
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEsc);
    };
  }, [open]);

  // Calculate and update menu position
  const updatePosition = useCallback(() => {
    if (!triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    const menuWidth = 192;
    // Position below and right-aligned with button
    let top = rect.bottom + 4;
    let left = rect.right - menuWidth;
    // Clamp within viewport
    top = Math.max(8, Math.min(top, window.innerHeight - 320));
    left = Math.max(8, Math.min(left, window.innerWidth - menuWidth - 8));
    setMenuPos({ top, left });
  }, []);

  // Update position when menu opens or window scrolls/resizes
  useEffect(() => {
    if (!open) return;
    updatePosition();

    const handleScroll = () => updatePosition();
    const handleResize = () => updatePosition();

    window.addEventListener("scroll", handleScroll, true);
    window.addEventListener("resize", handleResize);
    return () => {
      window.removeEventListener("scroll", handleScroll, true);
      window.removeEventListener("resize", handleResize);
    };
  }, [open, updatePosition]);

  const handleToggle = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    setOpen((prev) => !prev);
  };

  const handleAction = (action: () => void) => {
    action();
    setOpen(false);
  };

  // Portal dropdown menu
  const menuPortal = mounted && open && menuPos
    ? createPortal(
        <div
          data-chat-action-menu="true"
          onClick={(e) => e.stopPropagation()}
          style={{
            position: "fixed",
            top: menuPos.top,
            left: menuPos.left,
            zIndex: 99999,
            minWidth: 192,
            background: colors.menuBg,
            border: `1px solid ${colors.menuBorder}`,
            borderRadius: 8,
            boxShadow: colors.menuShadow,
            padding: "4px 0",
            overflow: "hidden",
            opacity: 1,
            transform: "scale(1)",
            transition: "opacity 0.1s, transform 0.1s",
          }}
        >
          {/* Favorite / Remove from Favorites */}
          <MenuItem
            icon={<Star style={{ width: 14, height: 14, color: "#f59e0b", fill: isFavorite ? "#f59e0b" : "none" }} />}
            label={isFavorite ? "Remove from Favorites" : "Add to Favorites"}
            onClick={(e) => { onToggleFavorite(e as React.MouseEvent); setOpen(false); }}
            colors={colors}
          />

          {/* Rename */}
          <MenuItem
            icon={<Pencil style={{ width: 14, height: 14 }} />}
            label="Rename"
            onClick={() => handleAction(onRename)}
            colors={colors}
          />

          {/* Separator */}
          <div style={{ height: 1, background: colors.separatorBg, margin: "4px 0" }} />

          {/* Export Markdown */}
          <MenuItem
            icon={<Download style={{ width: 14, height: 14, color: "#10b981" }} />}
            label="Export Markdown"
            onClick={() => handleAction(onExportMarkdown)}
            colors={colors}
          />

          {/* Export JSON */}
          <MenuItem
            icon={<Download style={{ width: 14, height: 14, color: "#10b981" }} />}
            label="Export JSON"
            onClick={() => handleAction(onExportJSON)}
            colors={colors}
          />

          {/* Separator */}
          <div style={{ height: 1, background: colors.separatorBg, margin: "4px 0" }} />

          {/* Delete */}
          <MenuItem
            icon={<Trash2 style={{ width: 14, height: 14, color: "#ef4444" }} />}
            label="Delete"
            onClick={() => handleAction(onDelete)}
            destructive
            colors={colors}
          />
        </div>,
        document.body
      )
    : null;

  return (
    <>
      {/* Trigger button - ALWAYS VISIBLE with inline styles */}
      <button
        ref={triggerRef}
        type="button"
        onClick={handleToggle}
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

      {/* Dropdown rendered via portal at document.body - NOT affected by parent overflow */}
      {menuPortal}
    </>
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
