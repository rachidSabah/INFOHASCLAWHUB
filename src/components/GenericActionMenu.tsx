"use client";

import { useState, useRef, useEffect, useCallback } from "react";

interface MenuAction {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  destructive?: boolean;
}

interface GenericActionMenuProps {
  actions: MenuAction[];
}

/**
 * Generic dropdown menu using inline styles (no Radix, no Portal).
 * Same approach as ChatActionMenu but for arbitrary actions.
 */
export function GenericActionMenu({ actions }: GenericActionMenuProps) {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const [isDark, setIsDark] = useState(false);

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

  const handleClickOutside = useCallback((e: MouseEvent) => {
    if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
      setOpen(false);
    }
  }, []);

  useEffect(() => {
    if (open) {
      document.addEventListener("mousedown", handleClickOutside);
      const handleEsc = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
      document.addEventListener("keydown", handleEsc);
      return () => {
        document.removeEventListener("mousedown", handleClickOutside);
        document.removeEventListener("keydown", handleEsc);
      };
    }
  }, [open, handleClickOutside]);

  return (
    <div ref={menuRef} style={{ position: "relative", flexShrink: 0 }}>
      <button
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

      {open && (
        <div
          style={{
            position: "absolute", right: 0, top: "100%", zIndex: 9999, minWidth: 160, marginTop: 4,
            background: colors.menuBg, border: `1px solid ${colors.menuBorder}`, borderRadius: 8,
            boxShadow: colors.menuShadow, padding: "4px 0", overflow: "hidden",
          }}
          onClick={(e) => e.stopPropagation()}
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
        </div>
      )}
    </div>
  );
}
