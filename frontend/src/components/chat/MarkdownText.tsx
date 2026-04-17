"use client";

import React from "react";
import { T } from "@/lib/tokens";

/**
 * Lightweight markdown renderer for chat messages.
 * Handles: code blocks, inline code, bold, italic, bullets, numbered lists, headers, line breaks.
 * No external library dependency.
 */

interface MarkdownTextProps {
  content: string;
  fontSize?: number;
  lineHeight?: number | string;
  color?: string;
}

type Segment = { type: "text" | "bold" | "italic" | "code" } & { text: string };

function parseInline(text: string): React.ReactNode[] {
  const result: React.ReactNode[] = [];
  // Combined regex: **bold**, *italic*, `code`
  const re = /(\*\*([^*]+)\*\*)|(\*([^*]+)\*)|(`([^`]+)`)/g;
  let last = 0;
  let match: RegExpExecArray | null;
  let key = 0;

  while ((match = re.exec(text)) !== null) {
    if (match.index > last) {
      result.push(<span key={key++}>{text.slice(last, match.index)}</span>);
    }
    if (match[1]) {
      // **bold**
      result.push(<strong key={key++} style={{ fontWeight: 600, color: T.text }}>{match[2]}</strong>);
    } else if (match[3]) {
      // *italic*
      result.push(<em key={key++}>{match[4]}</em>);
    } else if (match[5]) {
      // `code`
      result.push(
        <code key={key++} style={{
          fontFamily: T.mono,
          fontSize: "0.88em",
          background: "rgba(255,255,255,0.06)",
          border: "1px solid rgba(255,255,255,0.1)",
          borderRadius: 4,
          padding: "1px 5px",
          color: T.textSec ?? T.text,
        }}>{match[6]}</code>
      );
    }
    last = match.index + match[0].length;
  }

  if (last < text.length) {
    result.push(<span key={key++}>{text.slice(last)}</span>);
  }

  return result;
}

export default function MarkdownText({ content, fontSize = 13, lineHeight = 1.65, color }: MarkdownTextProps) {
  if (!content) return null;

  const lines = content.split("\n");
  const nodes: React.ReactNode[] = [];
  let i = 0;
  let key = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Code block: ```
    if (line.trimStart().startsWith("```")) {
      const codeLines: string[] = [];
      const lang = line.trimStart().slice(3).trim();
      i++;
      while (i < lines.length && !lines[i].trimStart().startsWith("```")) {
        codeLines.push(lines[i]);
        i++;
      }
      i++; // skip closing ```
      nodes.push(
        <pre key={key++} style={{
          fontFamily: T.mono,
          fontSize: fontSize - 1,
          background: "rgba(0,0,0,0.25)",
          border: `1px solid rgba(255,255,255,0.08)`,
          borderRadius: 6,
          padding: "10px 14px",
          overflowX: "auto",
          margin: "6px 0",
          color: T.textSec ?? T.text,
          lineHeight: 1.5,
          whiteSpace: "pre",
        }}>
          <code>{codeLines.join("\n")}</code>
        </pre>
      );
      continue;
    }

    // Header: ## or ###
    const headerMatch = line.match(/^(#{1,4})\s+(.+)/);
    if (headerMatch) {
      const level = headerMatch[1].length;
      const sizes = [fontSize + 5, fontSize + 3, fontSize + 1, fontSize];
      nodes.push(
        <div key={key++} style={{
          fontSize: sizes[Math.min(level - 1, 3)],
          fontWeight: 600,
          color: color ?? T.text,
          marginTop: 8,
          marginBottom: 2,
          lineHeight: 1.4,
        }}>
          {parseInline(headerMatch[2])}
        </div>
      );
      i++;
      continue;
    }

    // Bullet list: - or * or •
    if (/^(\s*[-*•]\s)/.test(line)) {
      const listItems: React.ReactNode[] = [];
      while (i < lines.length && /^(\s*[-*•]\s)/.test(lines[i])) {
        const indent = lines[i].match(/^(\s*)/)?.[1].length ?? 0;
        const itemText = lines[i].replace(/^\s*[-*•]\s/, "");
        listItems.push(
          <div key={i} style={{
            display: "flex",
            gap: 6,
            alignItems: "flex-start",
            paddingLeft: indent,
            marginBottom: 2,
          }}>
            <span style={{ color: T.textMuted, flexShrink: 0, marginTop: 2, fontSize: fontSize - 1 }}>–</span>
            <span>{parseInline(itemText)}</span>
          </div>
        );
        i++;
      }
      nodes.push(
        <div key={key++} style={{ margin: "4px 0" }}>
          {listItems}
        </div>
      );
      continue;
    }

    // Numbered list: 1. 2. etc
    if (/^\s*\d+\.\s/.test(line)) {
      const listItems: React.ReactNode[] = [];
      let num = 1;
      while (i < lines.length && /^\s*\d+\.\s/.test(lines[i])) {
        const itemText = lines[i].replace(/^\s*\d+\.\s/, "");
        listItems.push(
          <div key={i} style={{
            display: "flex",
            gap: 8,
            alignItems: "flex-start",
            marginBottom: 2,
          }}>
            <span style={{ color: T.textMuted, flexShrink: 0, minWidth: 16, fontSize: fontSize - 1, marginTop: 2 }}>{num}.</span>
            <span>{parseInline(itemText)}</span>
          </div>
        );
        num++;
        i++;
      }
      nodes.push(
        <div key={key++} style={{ margin: "4px 0" }}>
          {listItems}
        </div>
      );
      continue;
    }

    // Empty line → spacer
    if (line.trim() === "") {
      nodes.push(<div key={key++} style={{ height: 6 }} />);
      i++;
      continue;
    }

    // Normal paragraph line
    nodes.push(
      <div key={key++} style={{ lineHeight }}>
        {parseInline(line)}
      </div>
    );
    i++;
  }

  return (
    <div style={{ fontSize, color: color ?? T.text, fontFamily: T.sans }}>
      {nodes}
    </div>
  );
}
