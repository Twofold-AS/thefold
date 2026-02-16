"use client";

import { useState, useRef, useEffect } from "react";
import { Plus, Sparkles, ListTodo, ArrowRight, Upload, X } from "lucide-react";

interface ChatToolsMenuProps {
  onCreateSkill: () => void;
  onCreateTask: () => void;
  onUploadFile?: () => void;
  onTransfer?: () => void;
}

export function ChatToolsMenu({ onCreateSkill, onCreateTask, onUploadFile, onTransfer }: ChatToolsMenuProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  const items = [
    ...(onUploadFile ? [{ icon: Upload, label: "Last opp fil", action: onUploadFile }] : []),
    { icon: Sparkles, label: "Opprett ny skill", action: onCreateSkill },
    { icon: ListTodo, label: "Opprett task", action: onCreateTask },
    ...(onTransfer ? [{ icon: ArrowRight, label: "Overfor til repo", action: onTransfer }] : []),
  ];

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center justify-center transition-colors"
        style={{
          width: "32px",
          height: "32px",
          background: "transparent",
          color: open ? "var(--text-primary)" : "var(--text-muted)",
          border: "none",
          flexShrink: 0,
          cursor: "pointer",
        }}
        onMouseEnter={(e) => (e.currentTarget.style.color = "var(--text-primary)")}
        onMouseLeave={(e) => (e.currentTarget.style.color = open ? "var(--text-primary)" : "var(--text-muted)")}
      >
        {open ? <X size={18} /> : <Plus size={18} />}
      </button>

      {open && (
        <div
          style={{
            position: "absolute",
            bottom: "calc(100% + 8px)",
            left: 0,
            zIndex: 50,
            minWidth: "200px",
            background: "var(--bg-page)",
            border: "1px solid var(--border)",
            overflow: "hidden",
          }}
        >
          {items.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.label}
                onClick={() => {
                  setOpen(false);
                  item.action();
                }}
                className="w-full text-left px-3 py-2.5 flex items-center gap-2.5 text-sm transition-colors"
                style={{
                  background: "transparent",
                  border: "none",
                  borderBottom: "1px solid var(--border)",
                  color: "var(--text-primary)",
                  cursor: "pointer",
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = "var(--bg-hover)")}
                onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
              >
                <Icon size={16} style={{ color: "var(--text-muted)", flexShrink: 0 }} />
                {item.label}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
