"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { PageHeaderBar } from "@/components/PageHeaderBar";

const TABS = [
  { label: "AI-modeller", href: "/tools/ai-models" },
  { label: "Builder", href: "/tools/builder" },
  { label: "Oppgaver", href: "/tools/tasks" },
  { label: "Minne", href: "/tools/memory" },
  { label: "MCP", href: "/tools/mcp" },
  { label: "Integrasjoner", href: "/tools/integrations" },
  { label: "Inspector", href: "/tools/inspector" },
  { label: "Observability", href: "/tools/observability" },
  { label: "Secrets", href: "/tools/secrets" },
  { label: "Templates", href: "/tools/templates" },
  { label: "Kostnader", href: "/tools/costs" },
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
          content: (
            <Link
              href={tab.href}
              prefetch={true}
              className="text-sm"
              style={{ color: isActive(tab.href) ? "var(--text-primary)" : "var(--text-muted)" }}
            >
              {tab.label}
            </Link>
          ),
        }))}
      />
      <div className="p-6">
        {children}
      </div>
    </div>
  );
}
