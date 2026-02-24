"use client";

import { useState } from "react";
import {
  Ghost,
  Bot,
  Users,
  ChevronDown,
  Zap,
  GitBranch,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface ChatControlsProps {
  repos: Array<{ name: string; fullName: string }>;
  selectedRepo: string | null;
  onRepoChange: (repo: string | null) => void;
  inkognito: boolean;
  onInkognitoToggle: () => void;
  agentMode: boolean;
  onAgentModeToggle: () => void;
  subAgents: boolean;
  onSubAgentsToggle: () => void;
  selectedModel: string | null;
  onModelChange: (model: string | null) => void;
  models?: Array<{ id: string; displayName: string }>;
}

export function ChatControls({
  repos,
  selectedRepo,
  onRepoChange,
  inkognito,
  onInkognitoToggle,
  agentMode,
  onAgentModeToggle,
  subAgents,
  onSubAgentsToggle,
  selectedModel,
  onModelChange,
  models = [],
}: ChatControlsProps) {
  return (
    <div className="flex items-center gap-1.5 flex-wrap px-1 py-1.5">
      {/* Left group: Repo + Inkognito */}
      <div className="flex items-center gap-1.5">
        {/* Repo selector */}
        {!inkognito && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className={`control-chip ${selectedRepo ? "active" : ""}`}>
                <GitBranch className="w-3 h-3" />
                <span className="hidden sm:inline">{selectedRepo || "No repo"}</span>
                <ChevronDown className="w-2.5 h-2.5" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-56">
              <DropdownMenuItem onClick={() => onRepoChange(null)}>
                No repo (general)
              </DropdownMenuItem>
              {repos.map((repo) => (
                <DropdownMenuItem key={repo.fullName} onClick={() => onRepoChange(repo.fullName)}>
                  {repo.fullName}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        )}

        {/* Inkognito toggle */}
        <button
          onClick={onInkognitoToggle}
          className={`control-chip ${inkognito ? "active" : ""}`}
          style={inkognito ? {
            borderColor: "rgba(144, 97, 255, 0.3)",
            background: "rgba(144, 97, 255, 0.06)",
            color: "#9061FF",
          } : undefined}
          title="Inkognito mode"
        >
          <Ghost className={`w-3.5 h-3.5 ${inkognito ? "inkognito-ghost" : ""}`} />
          <span className="hidden sm:inline">{inkognito ? "Inkognito" : "Private"}</span>
        </button>
      </div>

      {/* Right group: Agent controls (hidden in inkognito) */}
      {!inkognito && (
        <div className="flex items-center gap-1.5 ml-auto">
          {/* Agent mode */}
          <button
            onClick={onAgentModeToggle}
            className={`control-chip ${agentMode ? "active" : ""}`}
            title="Agent mode"
          >
            <Bot className="w-3 h-3" />
            <span className="hidden sm:inline">Agent</span>
          </button>

          {/* Sub-agents */}
          {agentMode && (
            <button
              onClick={onSubAgentsToggle}
              className={`control-chip ${subAgents ? "active" : ""}`}
              title="Sub-agents"
            >
              <Users className="w-3 h-3" />
              <span className="hidden sm:inline">Multi</span>
            </button>
          )}

          {/* Model selector */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="control-chip">
                <Zap className="w-3 h-3" />
                <span className="hidden sm:inline">{selectedModel || "Auto"}</span>
                <ChevronDown className="w-2.5 h-2.5" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <DropdownMenuItem onClick={() => onModelChange(null)}>
                Auto (recommended)
              </DropdownMenuItem>
              {models.map((m) => (
                <DropdownMenuItem key={m.id} onClick={() => onModelChange(m.displayName)}>
                  {m.displayName}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      )}
    </div>
  );
}
