"use client";
import { useState } from "react";

interface CodeBlockProps {
  code: string;
  language?: string;
  filename?: string;
}

export function CodeBlock({ code, language, filename }: CodeBlockProps) {
  const lines = code.split("\n");
  const isLong = lines.length > 15;
  const [expanded, setExpanded] = useState(!isLong);
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownload = () => {
    const blob = new Blob([code], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename || "code.txt";
    a.click();
    URL.revokeObjectURL(url);
  };

  const displayLines = expanded ? lines : lines.slice(0, 8);

  return (
    <div className="my-3" style={{ border: "1px solid var(--border)" }}>
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2" style={{ borderBottom: "1px solid var(--border)", background: "rgba(255,255,255,0.02)" }}>
        <div className="flex items-center gap-2">
          {filename && <span className="text-xs font-mono" style={{ color: "var(--text-primary)" }}>{filename}</span>}
          {language && <span className="text-xs px-2 py-0.5" style={{ color: "var(--text-muted)", border: "1px solid var(--border)" }}>{language}</span>}
        </div>
        <div className="flex items-center gap-2">
          {isLong && (
            <button onClick={() => setExpanded(!expanded)} className="text-xs hover:underline" style={{ color: "var(--text-muted)", background: "none", border: "none", cursor: "pointer" }}>
              {expanded ? "Skjul" : `Vis alle ${lines.length} linjer`}
            </button>
          )}
          {filename && (
            <button onClick={handleDownload} className="text-xs px-2 py-1 hover:bg-white/5" style={{ color: "var(--text-muted)", border: "1px solid var(--border)", background: "transparent", cursor: "pointer" }}>
              Last ned
            </button>
          )}
          <button onClick={handleCopy} className="text-xs px-2 py-1 hover:bg-white/5" style={{ color: "var(--text-muted)", border: "1px solid var(--border)", background: "transparent", cursor: "pointer" }}>
            {copied ? "Kopiert!" : "Kopier"}
          </button>
        </div>
      </div>
      {/* Kode */}
      <div className="overflow-x-auto">
        <pre className="px-3 py-2 text-sm font-mono leading-relaxed" style={{ color: "var(--text-secondary)", margin: 0, background: "transparent" }}>
          {displayLines.map((line, i) => (
            <div key={i} className="flex">
              <span className="select-none w-8 shrink-0 text-right pr-3" style={{ color: "rgba(255,255,255,0.15)" }}>{i + 1}</span>
              <span>{line}</span>
            </div>
          ))}
          {!expanded && isLong && (
            <div className="flex items-center justify-center py-2 cursor-pointer hover:bg-white/5" onClick={() => setExpanded(true)}>
              <span className="text-xs" style={{ color: "var(--text-muted)" }}>... {lines.length - 8} linjer skjult — klikk for å vise</span>
            </div>
          )}
        </pre>
      </div>
    </div>
  );
}
