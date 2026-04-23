import {
  type DesignIR,
  type DesignNode,
  type DesignNodeType,
  type DesignStyle,
  emptyDesignIR,
} from "./design-ir";

// Fase I.2 — Lightweight HTML → DesignIR parser.
// Bruker regex-basert extraction (ingen DOM-runtime i Node). For Framer/Figma
// HTML-eksporter holder dette for MVP; full fidelity krever senere jsdom/cheerio.

let nodeIdCounter = 0;
function nextId(): string { return `n${++nodeIdCounter}`; }

function parseInlineStyle(styleAttr: string | undefined): DesignStyle {
  if (!styleAttr) return {};
  const style: DesignStyle = { raw: styleAttr };
  const parts = styleAttr.split(";").map((s) => s.trim()).filter(Boolean);
  for (const p of parts) {
    const idx = p.indexOf(":");
    if (idx < 0) continue;
    const key = p.slice(0, idx).trim();
    const value = p.slice(idx + 1).trim();
    switch (key) {
      case "width": style.width = value; break;
      case "height": style.height = value; break;
      case "padding": style.padding = value; break;
      case "margin": style.margin = value; break;
      case "background":
      case "background-color":
        style.background = value; break;
      case "color": style.color = value; break;
      case "font-size": style.fontSize = value; break;
      case "font-family": style.fontFamily = value; break;
      case "font-weight": style.fontWeight = value; break;
      case "border-radius": style.borderRadius = value; break;
      case "border": style.border = value; break;
      case "display": style.display = value; break;
      case "flex-direction": style.flexDirection = value; break;
      case "justify-content": style.justifyContent = value; break;
      case "align-items": style.alignItems = value; break;
      case "gap": style.gap = value; break;
    }
  }
  return style;
}

function tagToType(tag: string): DesignNodeType {
  const lower = tag.toLowerCase();
  if (["img", "picture"].includes(lower)) return "image";
  if (["p", "span", "h1", "h2", "h3", "h4", "h5", "h6", "label"].includes(lower)) return "text";
  if (["button"].includes(lower)) return "button";
  if (["input", "textarea", "select"].includes(lower)) return "input";
  if (["a"].includes(lower)) return "link";
  if (["div", "section", "main", "article", "header", "footer", "nav", "aside", "ul", "ol", "li"].includes(lower)) {
    return "container";
  }
  return "unknown";
}

interface ParsedAttrs {
  classes: string[];
  style: DesignStyle;
  src?: string;
  href?: string;
}

function parseAttrs(raw: string): ParsedAttrs {
  const classMatch = raw.match(/\sclass=["']([^"']+)["']/i);
  const styleMatch = raw.match(/\sstyle=["']([^"']+)["']/i);
  const srcMatch = raw.match(/\ssrc=["']([^"']+)["']/i);
  const hrefMatch = raw.match(/\shref=["']([^"']+)["']/i);
  return {
    classes: classMatch ? classMatch[1].split(/\s+/).filter(Boolean) : [],
    style: parseInlineStyle(styleMatch?.[1]),
    src: srcMatch?.[1],
    href: hrefMatch?.[1],
  };
}

const VOID_TAGS = new Set(["img", "br", "hr", "input", "meta", "link"]);

interface Token {
  kind: "open" | "close" | "void" | "text";
  tag?: string;
  raw?: string;
  attrs?: string;
  text?: string;
}

function tokenize(html: string): Token[] {
  const tokens: Token[] = [];
  const tagRegex = /<(\/?)([a-zA-Z][a-zA-Z0-9]*)([^>]*)>/g;
  let lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = tagRegex.exec(html)) !== null) {
    const text = html.slice(lastIndex, m.index).trim();
    if (text.length > 0) tokens.push({ kind: "text", text });
    const isClose = m[1] === "/";
    const tag = m[2].toLowerCase();
    const attrs = m[3] ?? "";
    const selfClosing = attrs.trim().endsWith("/") || VOID_TAGS.has(tag);
    if (isClose) tokens.push({ kind: "close", tag });
    else if (selfClosing) tokens.push({ kind: "void", tag, attrs });
    else tokens.push({ kind: "open", tag, attrs });
    lastIndex = m.index + m[0].length;
  }
  const tailText = html.slice(lastIndex).trim();
  if (tailText.length > 0) tokens.push({ kind: "text", text: tailText });
  return tokens;
}

function buildTree(tokens: Token[]): DesignNode {
  const root: DesignNode = {
    id: nextId(),
    type: "container",
    tag: "root",
    classes: [],
    style: {},
    children: [],
  };
  const stack: DesignNode[] = [root];

  for (const t of tokens) {
    const top = stack[stack.length - 1];
    if (t.kind === "text" && t.text) {
      top.children.push({
        id: nextId(),
        type: "text",
        tag: "#text",
        classes: [],
        style: {},
        text: t.text,
        children: [],
      });
    } else if (t.kind === "open" && t.tag) {
      const attrs = parseAttrs(t.attrs ?? "");
      const node: DesignNode = {
        id: nextId(),
        type: tagToType(t.tag),
        tag: t.tag,
        classes: attrs.classes,
        style: attrs.style,
        src: attrs.src,
        href: attrs.href,
        children: [],
      };
      top.children.push(node);
      stack.push(node);
    } else if (t.kind === "void" && t.tag) {
      const attrs = parseAttrs(t.attrs ?? "");
      top.children.push({
        id: nextId(),
        type: tagToType(t.tag),
        tag: t.tag,
        classes: attrs.classes,
        style: attrs.style,
        src: attrs.src,
        href: attrs.href,
        children: [],
      });
    } else if (t.kind === "close" && t.tag && stack.length > 1) {
      // Pop until matching tag (tolerant mot malformed HTML)
      while (stack.length > 1) {
        const popped = stack.pop();
        if (popped?.tag === t.tag) break;
      }
    }
  }

  return root;
}

function extractStylesheetUrls(html: string): string[] {
  const out: string[] = [];
  const linkRegex = /<link[^>]*rel=["']stylesheet["'][^>]*href=["']([^"']+)["']/gi;
  let m: RegExpExecArray | null;
  while ((m = linkRegex.exec(html)) !== null) out.push(m[1]);
  return out;
}

function extractInlineStyles(html: string): string[] {
  const out: string[] = [];
  const styleRegex = /<style[^>]*>([\s\S]*?)<\/style>/gi;
  let m: RegExpExecArray | null;
  while ((m = styleRegex.exec(html)) !== null) out.push(m[1].trim());
  return out;
}

function extractFonts(html: string): string[] {
  const out = new Set<string>();
  const googleFonts = /fonts\.googleapis\.com\/css2?\?family=([^"'&]+)/gi;
  let m: RegExpExecArray | null;
  while ((m = googleFonts.exec(html)) !== null) {
    out.add(decodeURIComponent(m[1]).replace(/\+/g, " "));
  }
  const fontFace = /@font-face\s*\{[^}]*font-family\s*:\s*['"]?([^;'"}]+)['"]?/gi;
  while ((m = fontFace.exec(html)) !== null) {
    out.add(m[1].trim());
  }
  return Array.from(out);
}

export function parseHtmlToDesignIR(
  html: string,
  source: DesignIR["source"] = "html",
): DesignIR {
  nodeIdCounter = 0;
  const ir = emptyDesignIR(source);

  // Extract <body>-innholdet hvis mulig, fall back til hele HTML.
  const bodyMatch = html.match(/<body[^>]*>([\s\S]*)<\/body>/i);
  const body = bodyMatch ? bodyMatch[1] : html;

  const tokens = tokenize(body);
  const root = buildTree(tokens);
  ir.root = root;
  ir.stylesheets = [...extractInlineStyles(html), ...extractStylesheetUrls(html)];
  ir.fonts = extractFonts(html);
  return ir;
}

// Infer source from markup: Framer-eksporter har "data-framer-*"-attributter;
// Figma-eksporter har ofte "figma" eller "node-id" i klassenavn.
export function inferDesignSource(html: string): DesignIR["source"] {
  if (/data-framer/i.test(html)) return "framer";
  if (/figma|node-id/i.test(html)) return "figma";
  return "html";
}
