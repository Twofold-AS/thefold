"use client";

import { usePathname } from "next/navigation";
import { PageHeaderBar } from "@/components/PageHeaderBar";

const TABS = [
  { label: "AI-modeller", href: "/tools/ai-models" },
  { label: "Builder", href: "/tools/builder" },
  { label: "Oppgaver", href: "/tools/tasks" },
  { label: "Minne", href: "/tools/memory" },
  { label: "MCP", href: "/tools/mcp" },
  { label: "Observability", href: "/tools/observability" },
  { label: "Secrets", href: "/tools/secrets" },
  { label: "Templates", href: "/tools/templates" },
];

export default function ToolsLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  function isActive(href: string) {
    return pathname === href || pathname.startsWith(href + "/");
  }

  return (
    <div>
      <PageHeaderBar
        title="Tools"
        cells={TABS.map((tab) => ({
          label: tab.label,
          href: tab.href,
          active: isActive(tab.href),
        }))}
      />
      <div className="p-6">
        {children}
      </div>
    </div>
  );
}
