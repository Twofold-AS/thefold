// Fase I.2 — DesignIR: intermediate representation for importerte design-eksporter
// (fra Framer, Figma eller custom HTML+CSS). Brukt som inngang til kodegenerering.

export type DesignNodeType =
  | "container"
  | "text"
  | "image"
  | "button"
  | "input"
  | "link"
  | "unknown";

export interface DesignStyle {
  width?: string;
  height?: string;
  padding?: string;
  margin?: string;
  background?: string;
  color?: string;
  fontSize?: string;
  fontFamily?: string;
  fontWeight?: string;
  borderRadius?: string;
  border?: string;
  display?: string;
  flexDirection?: string;
  justifyContent?: string;
  alignItems?: string;
  gap?: string;
  /** Raw inline CSS for fallback / future extraction */
  raw?: string;
}

export interface DesignNode {
  id: string;
  type: DesignNodeType;
  tag: string;
  classes: string[];
  style: DesignStyle;
  text?: string;
  src?: string;
  href?: string;
  children: DesignNode[];
}

export interface DesignIR {
  source: "framer" | "figma" | "html" | "unknown";
  sourceUrl?: string;
  root: DesignNode;
  /** Flat liste av alle bilde-assets som må følge eksporten */
  assets: Array<{ path: string; mimeType?: string; sizeBytes?: number }>;
  /** CSS fra inline <style>-tagger + eksterne stylesheet-referanser */
  stylesheets: string[];
  /** Web fonts referred to (e.g. Google Fonts, Framer fonts) */
  fonts: string[];
  createdAt: string;
}

export function emptyDesignIR(source: DesignIR["source"]): DesignIR {
  return {
    source,
    root: {
      id: "root",
      type: "container",
      tag: "div",
      classes: [],
      style: {},
      children: [],
    },
    assets: [],
    stylesheets: [],
    fonts: [],
    createdAt: new Date().toISOString(),
  };
}
