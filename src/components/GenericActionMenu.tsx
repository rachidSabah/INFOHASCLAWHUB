"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";

interface MenuAction {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  destructive?: boolean;
}

interface GenericActionMenuProps {
  actions: MenuAction[];
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
 * Generic dropdown menu using createPortal + position:fixed (no Radix, no Portal).
 * Uses the same approach as ChatActionMenu to avoid overflow clipping.
 */
export function GenericActionMenu({ actions }: GenericActionMenuProps) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [isDark, setIsDark] = useState(false);
  const [menuPos, setMenuPos] = useState<{ top: number; left: number } | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => { setMounted(true); }, []);

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

  useEffect(() => {
    if (!open) return;

    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      if (triggerRef.current && triggerRef.current.contains(target)) return;
      const menuEl = document.querySelector('[data-generic-action-menu="true"]');
      if (menuEl && menuEl.contains(target)) return;
      setOpen(false);
    };

    const handleEsc = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };

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

  const updatePosition = useCallback(() => {
    if (!triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    const menuWidth = 160;
    let top = rect.bottom + 4;
    let left = rect.right - menuWidth;
    top = Math.max(8, Math.min(top, window.innerHeight - 300));
    left = Math.max(8, Math.min(left, window.innerWidth - menuWidth - 8));
    setMenuPos({ top, left });
  }, []);

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

  const menuPortal = mounted && open && menuPos
    ? createPortal(
        <div
          data-generic-action-menu="true"
          onClick={(e) => e.stopPropagation()}
          style={{
            position: "fixed",
            top: menuPos.top,
            left: menuPos.left,
            zIndex: 99999,
            minWidth: 160,
            background: colors.menuBg,
            border: `1px solid ${colors.menuBorder}`,
            borderRadius: 8,
            boxShadow: colors.menuShadow,
            padding: "4px 0",
            overflow: "hidden",
          }}
        >
          {actions.map((action, i) => (
            <div key={i}>
              {action.label === "---" ? (
                <div style={{ height: 1, background: colors.separatorBg, margin: "4px 0" }} />
              ) : (
                <button
                  type="button"
                  onClick={() => { action.onClick(); setOpen(false); }}
                  style={{
                    display: "flex", alignItems: "center", gap: 8, width: "100%", padding: "8px 12px",
                    border: "none", background: "transparent",
                    color: action.destructive ? "#ef4444" : colors.itemText,
                    fontSize: 13, cursor: "pointer", textAlign: "left", outline: "none",
                    transition: "background 0.1s ease",
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = action.destructive ? colors.destructiveHoverBg : colors.itemHoverBg; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
                >
                  <span style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 16, height: 16, flexShrink: 0 }}>
                    {action.icon}
                  </span>
                  <span style={{ flex: 1 }}>{action.label}</span>
                </button>
              )}
            </div>
          ))}
        </div>,
        document.body
      )
    : null;

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={(e) => { e.stopPropagation(); e.preventDefault(); setOpen((p) => !p); }}
        style={{
          width: 28, height: 28, display: "inline-flex", alignItems: "center", justifyContent: "center",
          borderRadius: 6, border: `1px solid ${colors.btnBorder}`, background: colors.btnBg,
          color: colors.btnText, cursor: "pointer", flexShrink: 0, transition: "all 0.15s ease", padding: 0, outline: "none",
        }}
        onMouseEnter={(e) => { e.currentTarget.style.background = colors.btnBgHover; e.currentTarget.style.color = colors.btnTextHover; }}
        onMouseLeave={(e) => { e.currentTarget.style.background = colors.btnBg; e.currentTarget.style.color = colors.btnText; }}
        title="Actions"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ pointerEvents: "none" }}>
          <circle cx="12" cy="12" r="1" /><circle cx="12" cy="5" r="1" /><circle cx="12" cy="19" r="1" />
        </svg>
      </button>
      {menuPortal}
    </>
  );
}
