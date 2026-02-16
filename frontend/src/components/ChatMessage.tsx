"use client";
import { CodeBlock } from "./CodeBlock";

interface ChatMessageProps {
  content: string;
  role: "user" | "assistant";
}

export function ChatMessage({ content, role }: ChatMessageProps) {
  if (role === "user") {
    return <span>{content}</span>;
  }

  // Parse markdown for assistant-meldinger
  const parts = parseMarkdown(content);

  return (
    <div className="space-y-2">
      {parts.map((part, i) => {
        if (part.type === "code") {
          return <CodeBlock key={i} code={part.content} language={part.language} filename={part.filename} />;
        }
        if (part.type === "heading") {
          return <h3 key={i} className="font-display text-base mt-3 mb-1" style={{ color: "var(--text-primary)" }}>{part.content}</h3>;
        }
        if (part.type === "list") {
          return (
            <ul key={i} className="pl-4 space-y-1">
              {part.items.map((item: string, j: number) => (
                <li key={j} className="text-sm" style={{ color: "var(--text-secondary)" }}>
                  <span className="mr-2" style={{ color: "var(--text-muted)" }}>&mdash;</span>
                  {renderInline(item)}
                </li>
              ))}
            </ul>
          );
        }
        // Paragraph
        return <p key={i} className="text-sm leading-relaxed" style={{ color: "var(--text-secondary)" }}>{renderInline(part.content)}</p>;
      })}
    </div>
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function parseMarkdown(content: string): any[] {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const parts: any[] = [];
  const lines = content.split("\n");
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Code block
    if (line.startsWith("```")) {
      const langMatch = line.match(/^```(\w+)?(?:\s+(.+))?/);
      const language = langMatch?.[1] || "";
      const filename = langMatch?.[2] || "";
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !lines[i].startsWith("```")) {
        codeLines.push(lines[i]);
        i++;
      }
      i++; // Skip closing ```
      parts.push({ type: "code", content: codeLines.join("\n"), language, filename });
      continue;
    }

    // Heading
    if (line.startsWith("## ") || line.startsWith("### ")) {
      parts.push({ type: "heading", content: line.replace(/^#{2,3}\s+/, "") });
      i++;
      continue;
    }

    // List
    if (line.startsWith("- ") || line.startsWith("* ")) {
      const items: string[] = [];
      while (i < lines.length && (lines[i].startsWith("- ") || lines[i].startsWith("* "))) {
        items.push(lines[i].replace(/^[-*]\s+/, ""));
        i++;
      }
      parts.push({ type: "list", items });
      continue;
    }

    // Empty line
    if (line.trim() === "") {
      i++;
      continue;
    }

    // Paragraph — samle sammenhengende linjer
    const paraLines: string[] = [];
    while (i < lines.length && lines[i].trim() !== "" && !lines[i].startsWith("```") && !lines[i].startsWith("## ") && !lines[i].startsWith("- ") && !lines[i].startsWith("* ")) {
      paraLines.push(lines[i]);
      i++;
    }
    parts.push({ type: "paragraph", content: paraLines.join(" ") });
  }

  return parts;
}

// Render inline markdown (bold, italic, inline code)
function renderInline(text: string) {
  // Split on inline code, bold, italic
  const parts = text.split(/(`[^`]+`|\*\*[^*]+\*\*|\*[^*]+\*)/g);
  return parts.map((part, i) => {
    if (part.startsWith("`") && part.endsWith("`")) {
      return <code key={i} className="px-1.5 py-0.5 text-xs font-mono" style={{ background: "rgba(255,255,255,0.06)", color: "var(--text-primary)" }}>{part.slice(1, -1)}</code>;
    }
    if (part.startsWith("**") && part.endsWith("**")) {
      return <strong key={i} style={{ color: "var(--text-primary)" }}>{part.slice(2, -2)}</strong>;
    }
    if (part.startsWith("*") && part.endsWith("*")) {
      return <em key={i}>{part.slice(1, -1)}</em>;
    }
    return <span key={i}>{part}</span>;
  });
}
