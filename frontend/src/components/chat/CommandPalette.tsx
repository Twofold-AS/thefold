"use client";

import { useEffect, useState, useCallback } from "react";
import { T } from "@/lib/tokens";
import {
  CommandDialog,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandSeparator,
} from "@/components/ui/command";
import {
  MessageSquarePlus,
  Lock,
  ListTodo,
  Play,
  Eye,
  Sparkles,
  Cpu,
  GitBranch,
  FileCode,
  Moon,
  LayoutTemplate,
} from "lucide-react";

interface CommandAction {
  id: string;
  label: string;
  shortcut?: string;
  icon: React.ReactNode;
  group: string;
  onSelect: () => void;
}

interface CommandPaletteProps {
  onNewChat: () => void;
  onNewIncognito?: () => void;
  onCreateTask?: (title: string) => void;
  onStartTask?: (taskId: string) => void;
  onShowReviews?: () => void;
  onOpenSkills?: () => void;
  onChangeModel?: (model: string) => void;
  onChangeRepo?: (repo: string) => void;
  onOpenTemplates?: () => void;
  onTriggerDream?: () => void;
  onSendMessage?: (msg: string) => void;
}

export default function CommandPalette({
  onNewChat,
  onNewIncognito,
  onShowReviews,
  onOpenSkills,
  onOpenTemplates,
  onTriggerDream,
  onSendMessage,
}: CommandPaletteProps) {
  const [open, setOpen] = useState(false);
  const [inputValue, setInputValue] = useState("");

  // Cmd+K listener
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((prev) => !prev);
      }
    };
    document.addEventListener("keydown", down);
    return () => document.removeEventListener("keydown", down);
  }, []);

  const handleSelect = useCallback((action: () => void) => {
    setOpen(false);
    setInputValue("");
    action();
  }, []);

  // Slash command detection
  const isSlashCommand = inputValue.startsWith("/");
  const slashCmd = isSlashCommand ? inputValue.split(" ")[0] : null;
  const slashArg = isSlashCommand ? inputValue.slice((slashCmd?.length ?? 0) + 1).trim() : "";

  const handleSlashSubmit = useCallback(() => {
    if (!slashCmd) return;
    switch (slashCmd) {
      case "/ny":
        handleSelect(onNewChat);
        break;
      case "/inkognito":
        handleSelect(onNewIncognito ?? onNewChat);
        break;
      case "/task":
        if (slashArg && onSendMessage) {
          handleSelect(() => onSendMessage(`Opprett task: ${slashArg}`));
        }
        break;
      case "/start":
        if (slashArg && onSendMessage) {
          handleSelect(() => onSendMessage(`Start task ${slashArg}`));
        }
        break;
      case "/review":
        if (onShowReviews) handleSelect(onShowReviews);
        break;
      case "/skills":
        if (onOpenSkills) handleSelect(onOpenSkills);
        break;
      case "/mal":
        if (onOpenTemplates) handleSelect(onOpenTemplates);
        break;
      case "/drøm":
        if (onTriggerDream) handleSelect(onTriggerDream);
        break;
      default:
        // Unknown command — send as message
        if (onSendMessage) handleSelect(() => onSendMessage(inputValue));
    }
  }, [slashCmd, slashArg, handleSelect, onNewChat, onNewIncognito, onSendMessage, onShowReviews, onOpenSkills, onOpenTemplates, onTriggerDream]);

  const actions: CommandAction[] = [
    {
      id: "new-chat",
      label: "Ny samtale",
      shortcut: "/ny",
      icon: <MessageSquarePlus size={16} />,
      group: "Samtaler",
      onSelect: () => handleSelect(onNewChat),
    },
    ...(onNewIncognito
      ? [{
          id: "incognito",
          label: "Ny inkognito-samtale",
          shortcut: "/inkognito",
          icon: <Lock size={16} />,
          group: "Samtaler",
          onSelect: () => handleSelect(onNewIncognito),
        }]
      : []),
    {
      id: "create-task",
      label: "Opprett task...",
      shortcut: "/task",
      icon: <ListTodo size={16} />,
      group: "Oppgaver",
      onSelect: () => {
        if (onSendMessage) {
          setInputValue("/task ");
        }
      },
    },
    {
      id: "start-task",
      label: "Start task...",
      shortcut: "/start",
      icon: <Play size={16} />,
      group: "Oppgaver",
      onSelect: () => {
        if (onSendMessage) {
          setInputValue("/start ");
        }
      },
    },
    ...(onShowReviews
      ? [{
          id: "reviews",
          label: "Vis ventende reviews",
          shortcut: "/review",
          icon: <Eye size={16} />,
          group: "Oppgaver",
          onSelect: () => handleSelect(onShowReviews),
        }]
      : []),
    ...(onOpenSkills
      ? [{
          id: "skills",
          label: "Åpne skills-velger",
          shortcut: "/skills",
          icon: <Sparkles size={16} />,
          group: "Verktøy",
          onSelect: () => handleSelect(onOpenSkills),
        }]
      : []),
    ...(onOpenTemplates
      ? [{
          id: "templates",
          label: "Åpne mal-velger",
          shortcut: "/mal",
          icon: <LayoutTemplate size={16} />,
          group: "Verktøy",
          onSelect: () => handleSelect(onOpenTemplates),
        }]
      : []),
    ...(onTriggerDream
      ? [{
          id: "dream",
          label: "Trigger drømmemotor",
          shortcut: "/drøm",
          icon: <Moon size={16} />,
          group: "Verktøy",
          onSelect: () => handleSelect(onTriggerDream),
        }]
      : []),
  ];

  const groups = [...new Set(actions.map((a) => a.group))];

  return (
    <CommandDialog open={open} onOpenChange={setOpen}>
      <CommandInput
        placeholder="Skriv en kommando eller søk..."
        value={inputValue}
        onValueChange={setInputValue}
        onKeyDown={(e) => {
          if (e.key === "Enter" && isSlashCommand) {
            e.preventDefault();
            handleSlashSubmit();
          }
        }}
        style={{ fontFamily: T.sans }}
      />
      <CommandList>
        <CommandEmpty>
          {isSlashCommand ? (
            <span style={{ color: T.textMuted }}>
              Trykk Enter for å kjøre <code style={{ fontFamily: T.mono }}>{slashCmd}</code>
            </span>
          ) : (
            "Ingen resultater."
          )}
        </CommandEmpty>
        {groups.map((group, gi) => (
          <div key={group}>
            {gi > 0 && <CommandSeparator />}
            <CommandGroup heading={group}>
              {actions
                .filter((a) => a.group === group)
                .map((action) => (
                  <CommandItem
                    key={action.id}
                    onSelect={action.onSelect}
                    style={{ fontFamily: T.sans }}
                  >
                    <span style={{ marginRight: 8, display: "flex", color: T.textMuted }}>
                      {action.icon}
                    </span>
                    <span>{action.label}</span>
                    {action.shortcut && (
                      <span style={{
                        marginLeft: "auto",
                        fontSize: 11,
                        fontFamily: T.mono,
                        color: T.textFaint,
                      }}>
                        {action.shortcut}
                      </span>
                    )}
                  </CommandItem>
                ))}
            </CommandGroup>
          </div>
        ))}
      </CommandList>
    </CommandDialog>
  );
}
