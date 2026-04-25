"use client";

import { useState, useEffect, useRef, useMemo, Suspense, useCallback } from "react";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import { buildUrl } from "@/lib/url-utils";
import { T } from "@/lib/tokens";
import ChatComposer from "@/components/ChatComposer";
import ChatContainer from "@/components/chat/ChatContainer";
import HistoryDrawer, { extractRepoFromId } from "@/components/chat/HistoryDrawer";
import CommandPalette from "@/components/chat/CommandPalette";

import { useApiData } from "@/lib/hooks";
import {
  getConversations,
  getChatHistory,
  sendMessage,
  cancelChatGeneration,
  deleteConversation,
  repoConversationId,
  listSkills,
  listProviders,
  forceContinueTask,
  type Message,
} from "@/lib/api";
import { apiFetch } from "@/lib/api/client";
import { useRepoContext } from "@/lib/repo-context";
import { useAgentStream } from "@/hooks/useAgentStream";
import { useReviewFlow } from "@/hooks/useReviewFlow";

function classifyError(e: unknown): string {
  const msg = e instanceof Error ? e.message : "Noe gikk galt";
  const lower = msg.toLowerCase();
  if (lower.includes("credit") || lower.includes("billing") || lower.includes("quota") || lower.includes("brukt opp"))
    return "AI-credits er brukt opp. Sjekk billing hos leverandøren.";
  if (lower.includes("rate limit") || lower.includes("429") || lower.includes("too many"))
    return "For mange forespørsler — vent litt og prøv igjen.";
  if (lower.includes("api key") || lower.includes("api-nøkkel") || lower.includes("401") || lower.includes("ugyldig"))
    return "API-nøkkelen er ugyldig. Sjekk AI-innstillingene.";
  if (lower.includes("unavailable") || lower.includes("503") || lower.includes("utilgjengelig") || lower.includes("overloaded"))
    return "AI-tjenesten er midlertidig nede. Prøv igjen om litt.";
  if (lower.includes("context length") || lower.includes("too long"))
    return "Meldingen er for lang. Prøv en kortere melding.";
  return msg;
}

function makeOptimisticMsg(conversationId: string, content: string): Message {
  return {
    id: crypto.randomUUID(),
    conversationId,
    role: "user" as const,
    content,
    messageType: "chat",
    metadata: null,
    createdAt: new Date().toISOString(),
  };
}

function ChatPageInner() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const autoMsg = searchParams.get("msg");
  const convParam = searchParams.get("conv");
  const projectParam = searchParams.get("project");
  const pathname = usePathname();
  // Fase I.0.c/f — samme side brukes av /, /cowork og /designer; scope
  // bestemmes av ruten. Root-path (/) er Incognito-fanen (ingen lagring).
  const projectScope: "incognito" | "cowork" | "designer" =
    pathname.startsWith("/cowork") ? "cowork"
    : pathname.startsWith("/designer") ? "designer"
    : "incognito";

  const { selectedRepo } = useRepoContext();
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(projectParam);
  // Keep selectedProjectId reactive to URL changes (sidebar drill-in updates `?project=<uuid>`).
  // Without this the state is only read at mount and gets stale on sidebar navigation.
  useEffect(() => {
    setSelectedProjectId(projectParam);
  }, [projectParam]);
  const [ac, setAc] = useState<string | null>(convParam || null);
  const [newChat, setNewChat] = useState(!convParam);

  // resolvedProjectName + resolvedProjectType state declared here; actual
  // resolve-effect runs below once convData is in scope (needed for conv.projectId fallback).
  const [resolvedProjectName, setResolvedProjectName] = useState<string | null>(null);
  const [resolvedProjectType, setResolvedProjectType] = useState<"code" | "framer" | "figma" | "framer_figma" | null>(null);

  // React to URL conversation changes (sidebar clicks + logo click reset)
  useEffect(() => {
    if (convParam && convParam !== ac) {
      setAc(convParam);
      setNewChat(false);
    } else if (!convParam && ac !== null) {
      // No conv param (logo click or "Ny samtale") → reset to new chat view
      setAc(null);
      setNewChat(true);
    }
  }, [convParam]); // eslint-disable-line react-hooks/exhaustive-deps

  // Fix #1: Reset sending/task state when switching conversations (prevents SSE bleed)
  const [sending, setSending] = useState(false);
  const [chatError, setChatError] = useState<string | null>(null);
  const [selectedSkillIds, setSelectedSkillIds] = useState<string[]>([]);
  const [subAgentsEnabled, setSubAgentsEnabled] = useState(false);
  const [planMode, setPlanMode] = useState(false);
  const [autoMode, setAutoMode] = useState(false);

  // Modes are per-conversation: reset whenever the active conversation changes
  // (sidebar click, "+"-new-chat, incognito toggle). Prevents mode-bleed across chats.
  useEffect(() => {
    setPlanMode(false);
    setAutoMode(false);
    setSubAgentsEnabled(false);
    setSelectedModel(null); // reset to Smart (AI) auto-routing on new conv
  }, [convParam]);

  const [thinkSeconds, setThinkSeconds] = useState(0);
  const [activeTaskId, setActiveTaskId] = useState<string | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [skillsOpen, setSkillsOpen] = useState(false);
  // Incognito er KUN aktiv i /incognito-fanen — ingen per-chat-toggle.
  // Ghost-ikonet i ChatInput er en snarvei (router.push /incognito), ikke
  // en mode-switch innen gjeldende fane.
  const isIncognito = projectScope === "incognito";
  const autoMsgSent = useRef(false);
  const hasSent = useRef(false);
  const wasSendingRef = useRef(false);
  const acPrevRef = useRef<string | null>(null);
  // When a brand-new conversation is created, useApiData refetches with empty result
  // and would wipe the optimistic user message. These refs let the fetcher serve the
  // optimistic msg instead of fetching, until agent.done triggers a real refresh.
  const skipNextFetchRef = useRef(false);
  const optForNewConvRef = useRef<{ convId: string; msg: Message } | null>(null);

  useEffect(() => {
    if (ac === acPrevRef.current) return;
    if (acPrevRef.current !== null) {
      // Actual conversation switch — clear in-flight state
      setSending(false);
      setActiveTaskId(null);
      setChatError(null);
    }
    acPrevRef.current = ac;
  }, [ac]); // eslint-disable-line react-hooks/exhaustive-deps

  const { data: convData, loading: convsLoading, refresh: refreshConvs } = useApiData(
    () => getConversations(),
    [],
  );
  const conversations = convData?.conversations ?? [];

  // Derived project context: prefer URL ?project, fall back to active
  // conversation's projectId. This keeps the ghost/suggestions correct even
  // when the user "drills out" to root while still in a conv owned by a project.
  const activeConv = ac ? conversations.find(c => c.id === ac) : null;
  const derivedProjectId: string | null = selectedProjectId ?? activeConv?.projectId ?? null;

  // Scope-guard: if the URL has ?conv=X but X belongs to a different scope
  // (e.g. /designer?conv=<cowork-conv-id>), clear the conv param so we land
  // on a clean new-chat view in the current scope. Uses conversations list
  // as source of truth since the backend stamps scope on insert.
  // Incognito (=/) viser aldri convs i sidebaren, så enhver ?conv= på /
  // regnes som scope-mismatch — dropper den.
  useEffect(() => {
    if (!ac) return;
    if (projectScope === "incognito") {
      router.replace(pathname, { scroll: false });
      setAc(null);
      setNewChat(true);
      return;
    }
    if (conversations.length === 0) return;
    const match = conversations.find((c) => c.id === ac);
    if (!match) return;
    const convScope = (match as { scope?: "incognito" | "cowork" | "designer" }).scope ?? "cowork";
    if (convScope !== projectScope) {
      const carry = selectedProjectId ?? projectParam ?? null;
      const nextUrl = carry ? `?project=${encodeURIComponent(carry)}` : "";
      router.replace(pathname + nextUrl, { scroll: false });
      setAc(null);
      setNewChat(true);
    }
  }, [ac, conversations, projectScope, pathname, router, selectedProjectId, projectParam]);

  // Resolve project name + type for SuggestionChips based on derivedProjectId.
  useEffect(() => {
    if (!derivedProjectId) {
      setResolvedProjectName(null);
      setResolvedProjectType(null);
      return;
    }
    let cancelled = false;
    import("@/lib/api").then(({ getTFProject }) => {
      getTFProject(derivedProjectId)
        .then((r) => {
          if (cancelled) return;
          setResolvedProjectName(r.project.name);
          setResolvedProjectType(r.project.projectType ?? null);
        })
        .catch(() => {
          if (cancelled) return;
          setResolvedProjectName(null);
          setResolvedProjectType(null);
        });
    });
    return () => { cancelled = true; };
  }, [derivedProjectId]);

  // [debug] history-bug: dump conv ids whenever the list changes so user can
  // verify whether a missing repo ("Mikael-er-kul") is absent from the API
  // response or filtered out client-side. Remove once root cause confirmed.
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (conversations.length === 0) return;
    // eslint-disable-next-line no-console
    console.log("[cowork] conversations from /chat/conversations:", conversations.map(c => ({
      id: c.id,
      title: c.title,
      lastActivity: c.lastActivity,
    })));
  }, [conversations]);

  const { data: msgData, loading: msgsLoading, refresh: refreshMsgs, setData: setMsgData } = useApiData(
    () => {
      if (skipNextFetchRef.current && optForNewConvRef.current?.convId === ac) {
        skipNextFetchRef.current = false;
        const opt = optForNewConvRef.current.msg;
        return Promise.resolve({ messages: [opt], hasMore: false });
      }
      return ac ? getChatHistory(ac, 50) : Promise.resolve({ messages: [], hasMore: false });
    },
    [ac],
  );
  const msgs: Message[] = msgData?.messages ?? [];

  const { data: skillsData } = useApiData(() => listSkills(), []);
  const availableSkills = skillsData?.skills ?? [];

  const { data: providerData } = useApiData(() => listProviders(), []);
  const allModels = (providerData?.providers ?? []).flatMap(p =>
    p.models.filter(m => m.enabled).map(m => ({ id: m.modelId, displayName: m.displayName, provider: p.name }))
  );
  const [selectedModel, setSelectedModel] = useState<string | null>(null);

  const {
    pendingReviewId,
    setPendingReviewId,
    reviewInProgress,
    handleApprove,
    handleReject,
    handleRequestChanges,
  } = useReviewFlow(refreshMsgs, setChatError);

  const filtered = conversations.filter((c) => {
    if (c.id.startsWith("inkognito-")) return false;
    return true;
  });

  // SSE streaming
  // Incognito-fanen går ren direkte AI-kall — ingen agent-loop, ingen
  // tool-calls, ingen SSE-events å lytte på. Hopper over hele hook-en
  // ved å gi `null` som task-id. useAgentStream returnerer tomt state
  // og lukker eventuell åpen connection.
  const {
    messages: sseMessages,
    status: streamStatus,
    agentStartedTaskId,
    stalled: streamStalled,
    activeSkills: streamActiveSkills,
    toolCalls: streamToolCalls,
    sleeping: streamSleeping,
    planPending: streamPlanPending,
    interrupted: streamInterrupted,
    clearPlanPending,
    clearInterrupted,
  } = useAgentStream(
    isIncognito ? null : (sending ? (activeTaskId || ac) : null),
    {
      onDone: async (info) => {
        // Surface non-natural stop reasons as an inline chat error so the
        // user sees *why* the run ended. "natural" = happy-path, no banner.
        if (info?.reason && info.reason !== "natural") {
          const label = {
            user_cancelled: "Stoppet av deg",
            tool_failure: "Verktøyfeil",
            max_loops: "For mange verktøy-kall",
            truncated: "Avbrutt i generering",
          }[info.reason] ?? "Avbrutt";
          const detail = info.userMessage || info.finalText || "";
          setChatError(classifyError(new Error(detail ? `${label}: ${detail}` : label)));
        }
        // Await DB refresh BEFORE clearing sending so optimistic msg has a confirmed counterpart
        await refreshMsgs();
        setSending(false);
        setActiveTaskId(null);
        // Refresh sidebar when AI response finishes (title now available from first message)
        refreshConvs();
        if (typeof window !== "undefined") {
          window.dispatchEvent(new CustomEvent("tf:conv-list-changed"));
        }
      },
      onError: (err) => {
        setSending(false);
        setActiveTaskId(null);
        setChatError(classifyError(new Error(err)));
        refreshMsgs();
      },
      // onSleeping-kallback trenges ikke eksplisitt — streamSleeping-state
      // plukkes opp av useEffect nedenfor og vises som info-bubble.
      // chat.message_update arrives the moment the AI's final placeholder
      // is committed, which is guaranteed AFTER any newly-created
      // conversation row. This is the earliest 100%-safe moment to
      // refresh the sidebar list for brand-new convs.
      onMessageUpdate: () => {
        refreshConvs();
        if (typeof window !== "undefined") {
          window.dispatchEvent(new CustomEvent("tf:conv-list-changed"));
        }
      },
    }
  );

  // Derive connection status from stream state
  const connectionStatus: "connected" | "connecting" | "disconnected" =
    sending && activeTaskId
      ? streamStalled ? "disconnected" : "connected"
      : sending ? "connecting" : "connected";

  useEffect(() => {
    if (agentStartedTaskId && agentStartedTaskId !== activeTaskId) {
      setActiveTaskId(agentStartedTaskId);
    }
  }, [agentStartedTaskId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (streamStatus === "pending_review" && sending) {
      setSending(false);
      setActiveTaskId(null);
      refreshMsgs();
    }
  }, [streamStatus]); // eslint-disable-line react-hooks/exhaustive-deps

  // Runde 2d — Sleep-mode: when master enters needs_input, show the
  // sleeping message as an inline info-banner. Next user message in this
  // conv triggers chat.send → resumeMasterTask on backend, and the hook
  // emits `agent.resumed` that clears this state.
  useEffect(() => {
    if (!streamSleeping) return;
    setSending(false);
    setChatError({
      type: "info",
      message: `Agent venter på input: ${streamSleeping.userMessage}`,
    } as unknown as ReturnType<typeof classifyError>);
  }, [streamSleeping?.taskId, streamSleeping?.pendingSubTaskId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Poll messages while agent task active
  useEffect(() => {
    if (!sending || !activeTaskId) return;
    const iv = setInterval(() => { refreshMsgs(); }, 8000);
    return () => clearInterval(iv);
  }, [sending, activeTaskId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Note: trailing refresh timers removed — SSE delivers content immediately (agent.message)
  // and agent.done already calls refreshMsgs() once to sync DB state. No extra polling needed.

  // Merge DB messages + SSE messages. Regression from the prior round: the
  // first cut of this logic could in theory touch user messages (role="user")
  // during the map step, and the useMemo-less recomputation recreated the
  // whole array on every SSE event — producing reference-instability that
  // broke downstream memoisation + hid the optimistic user message in some
  // render orders.
  //
  // Rules here, in order:
  //   1. Build assistant-only SSE index — user messages NEVER come from SSE.
  //   2. For each DB msg, only merge when ALL of these hold:
  //        - the DB msg is assistant
  //        - SSE has a matching id + the event was `chat.message_update`
  //          (completed === true), NOT a mid-stream delta
  //        - the DB content is empty (placeholder has not been re-fetched)
  //     Anything else passes through untouched.
  //   3. Append any SSE assistant message that has NO matching DB row.
  //   4. Memoise on (msgs, sseMessages, ac) so identity is stable across
  //      unrelated re-renders.
  const merged: Message[] = useMemo(() => {
    if (!ac) return msgs;

    // Shape every SSE message as the DB Message type for the append path.
    const ssEMsgs: Message[] = sseMessages.map((sm) => ({
      id: sm.id,
      conversationId: ac,
      role: sm.role,
      content: sm.content,
      messageType: "chat" as const,
      metadata: sm.completed
        ? JSON.stringify({
            model: sm.model,
            cost: sm.costUsd,
            tokens: sm.tokens,
            activeSkills: sm.activeSkills,
            toolsUsed: sm.toolsUsed,
          })
        : null,
      createdAt: new Date().toISOString(),
    }));

    // Index ONLY completed SSE assistant messages — mid-stream deltas
    // without `completed` must never overwrite anything.
    const completedSseById = new Map<string, { content: string; metadata: string | null }>();
    sseMessages.forEach((sm) => {
      if (!sm.completed) return;
      completedSseById.set(sm.id, {
        content: sm.content,
        metadata: JSON.stringify({
          model: sm.model,
          cost: sm.costUsd,
          tokens: sm.tokens,
          activeSkills: sm.activeSkills,
          toolsUsed: sm.toolsUsed,
        }),
      });
    });

    // Enrich matching DB messages in-place (only empty-content assistants).
    const enrichedMsgs = msgs.map((m) => {
      if (m.role !== "assistant") return m;
      const sseCompleted = completedSseById.get(m.id);
      if (!sseCompleted) return m;
      const dbHasContent = (m.content ?? "").trim().length > 0;
      if (dbHasContent) return m;
      return { ...m, content: sseCompleted.content, metadata: sseCompleted.metadata };
    });

    // Append SSE messages that don't have a DB counterpart (streaming before
    // refreshMsgs finishes). Still scoped to assistant role by type.
    const dbIds = new Set(msgs.map((m) => m.id));
    const newSseOnly = ssEMsgs.filter((m) => !dbIds.has(m.id));

    return [...enrichedMsgs, ...newSseOnly];
  }, [ac, msgs, sseMessages]);

  // Deduplicate user messages by trimmed content — optimistic copy in msgs and the
  // server-confirmed copy from refreshMsgs() can briefly co-exist with different ids.
  const seen = new Set<string>();
  const displayMsgs = merged.filter((m) => {
    if (m.role === "user") {
      const key = `${m.role}:${m.content?.trim()}`;
      if (seen.has(key)) return false;
      seen.add(key);
    }
    return true;
  });

  // Think timer
  useEffect(() => {
    if (!sending) { setThinkSeconds(0); return; }
    const start = Date.now();
    const iv = setInterval(() => setThinkSeconds(Math.floor((Date.now() - start) / 1000)), 1000);
    return () => clearInterval(iv);
  }, [sending]);

  // Safety timeout
  useEffect(() => {
    if (!sending) return;
    const max = setTimeout(() => setSending(false), 120000);
    return () => clearTimeout(max);
  }, [sending]);

  // Polling fallback for direct chat (no agent task running).
  // SSE is the fast path; this is the safety net in case the agent.message event is dropped.
  // Active only when sending && no activeTaskId (agent path has its own SSE stream).
  useEffect(() => {
    if (!sending || activeTaskId || !ac) return;

    let stopped = false;
    let firstContentAt: number | null = null;
    const intervals: ReturnType<typeof setInterval>[] = [];
    const timeouts: ReturnType<typeof setTimeout>[] = [];

    const isReviewMsg = (content: string) => {
      try { const p = JSON.parse(content); return p.type === "review" || (p.type === "progress" && p.status === "waiting"); }
      catch { return false; }
    };

    const poll = async () => {
      if (stopped) return;
      try {
        const result = await getChatHistory(ac, 50);
        if (stopped) return;

        const assistantMsgs = result.messages.filter(m => m.role === "assistant" && m.content?.trim());
        const hasContent = assistantMsgs.length > 0;
        const hasReview = assistantMsgs.some(m => isReviewMsg(m.content));

        if (hasContent) {
          setMsgData({ messages: result.messages, hasMore: result.hasMore });
          if (firstContentAt === null) firstContentAt = Date.now();
          if (hasReview || Date.now() - firstContentAt > 20000) {
            setSending(false);
            stopped = true;
          }
        }
      } catch {
        // ignore transient errors
      }
    };

    const startDelay = setTimeout(() => {
      if (stopped) return;
      poll();
      const iv = setInterval(() => { if (!stopped) poll(); }, 2000);
      intervals.push(iv);
      const maxTimeout = setTimeout(() => {
        if (!stopped) { stopped = true; setSending(false); }
      }, 87000);
      timeouts.push(maxTimeout);
    }, 3000);
    timeouts.push(startDelay);

    return () => {
      stopped = true;
      timeouts.forEach(clearTimeout);
      intervals.forEach(clearInterval);
    };
  }, [sending, activeTaskId, ac, setMsgData]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSendResult = (result: { agentTriggered: boolean; taskId?: string } | null) => {
    if (result?.taskId) {
      setActiveTaskId(result.taskId);
    }
    // Only refresh conversations list — do NOT call refreshMsgs() here.
    // Calling refreshMsgs() immediately overwrites the optimistic message with empty DB state
    // (the message hasn't been written yet). SSE streaming and the polling fallback handle updates.
    //
    // Triple notify:
    //  1. refreshConvs()        — our own useApiData fetch (unused for sidebar
    //                             but may affect other local consumers)
    //  2. refreshConvs()+400ms  — absorb any DB commit race
    //  3. tf:conv-list-changed  — broadcast to the dashboard layout, which
    //                             owns the sidebar and has a 30s cache that
    //                             otherwise would keep the old list visible
    refreshConvs();
    setTimeout(() => { refreshConvs(); }, 400);
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("tf:conv-list-changed"));
    }
  };

  // Auto-send msg from search params
  useEffect(() => {
    if (autoMsg && !autoMsgSent.current) {
      autoMsgSent.current = true;
      setNewChat(false);

      const repoParam = searchParams.get("repo");
      const skillsParam = searchParams.get("skills");
      const subagentsParam = searchParams.get("subagents") === "1";

      if (skillsParam) setSelectedSkillIds(skillsParam.split(",").filter(Boolean));
      if (subagentsParam) setSubAgentsEnabled(true);

      const repoName = repoParam || selectedRepo?.name || null;
      const convId = repoName
        ? repoConversationId(repoName)
        : `chat-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

      const optimisticMsg = makeOptimisticMsg(convId, autoMsg);
      optForNewConvRef.current = { convId, msg: optimisticMsg };
      skipNextFetchRef.current = true;
      setAc(convId);
      // Preserve any existing ?project= when swapping ?conv= so the sidebar
      // doesn't reset to the projects-list after a send. Previously this
      // blew away `project` because buildUrl overwrote the full search string.
      const carryProject = selectedProjectId ?? projectParam ?? null;
      router.replace(
        buildUrl(pathname, carryProject ? { conv: convId, project: carryProject } : { conv: convId }),
        { scroll: false },
      );
      setMsgData({ messages: [optimisticMsg], hasMore: false });

      setSending(true);
      sendMessage(convId, autoMsg, {
        repoName: repoName || undefined,
        repoOwner: selectedRepo?.owner || undefined,
        skillIds: skillsParam ? skillsParam.split(",").filter(Boolean) : undefined,
      })
        .then(handleSendResult)
        .catch((e) => { setSending(false); setChatError(classifyError(e)); });
    }
  }, [autoMsg]); // eslint-disable-line react-hooks/exhaustive-deps

  const curRepo = ac ? extractRepoFromId(ac) : null;

  // Active mode label rendered inline inside ChatInput beside the ghost icon.
  // Mutually-exclusive: planMode > subAgents > autoMode.
  const activeModeLabel: string | null = planMode ? "Planlegger"
    : subAgentsEnabled ? "Agenter"
    : autoMode ? "Auto"
    : null;

  const startNewChat = useCallback((msg: string, options?: { firecrawlEnabled?: boolean; planMode?: boolean }) => {
    const repoName = selectedRepo?.name || null;
    // Incognito-fanen (/) får inkognito-prefix på convId så sidebaren (som
    // filtrerer bort `inkognito-*`) aldri viser samtalen. Plassholder
    // inntil backend får "ingen logging"-støtte.
    const convId = isIncognito
      ? `inkognito-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
      : repoName
        ? repoConversationId(repoName)
        : `chat-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const optimisticMsg = makeOptimisticMsg(convId, msg);
    // Pre-seed the fetcher so the useApiData refetch on `ac` change serves the
    // optimistic msg instead of overwriting it with an empty fetch.
    optForNewConvRef.current = { convId, msg: optimisticMsg };
    skipNextFetchRef.current = true;
    setAc(convId);
    setNewChat(false);
    // Persist convId in URL so refresh restores the conversation. Preserve
    // ?project= so the sidebar keeps its project-focus instead of snapping
    // back to the global /cowork view after the first send.
    const carryProject2 = selectedProjectId ?? projectParam ?? null;
    const nextUrl = carryProject2
      ? `?conv=${convId}&project=${encodeURIComponent(carryProject2)}`
      : `?conv=${convId}`;
    router.replace(nextUrl, { scroll: false });
    setMsgData({ messages: [optimisticMsg], hasMore: false });
    hasSent.current = true;
    setSending(true);
    sendMessage(convId, msg, {
      ...(repoName && !isIncognito ? { repoName, repoOwner: selectedRepo?.owner } : {}),
      skillIds: selectedSkillIds.length > 0 ? selectedSkillIds : undefined,
      modelOverride: selectedModel,
      firecrawlEnabled: options?.firecrawlEnabled,
      planMode: options?.planMode || planMode || undefined,
      projectId: selectedProjectId ?? undefined,
      scope: projectScope,
    })
      .then(handleSendResult)
      .catch((e) => { setSending(false); setChatError(classifyError(e)); });
  }, [selectedRepo, isIncognito, selectedSkillIds, selectedModel, planMode, selectedProjectId, router, setMsgData, handleSendResult]);

  const handleSend = useCallback(async (value: string, options?: { firecrawlEnabled?: boolean; planMode?: boolean }) => {
    if (!ac || !value) return;
    setChatError(null);

    if (pendingReviewId) {
      handleRequestChanges(pendingReviewId, value);
      setPendingReviewId(null);
      return;
    }

    // Runde 3-A — if a plan-preview is active, this message is plan-edit
    // feedback, not a new chat turn. Backend routes via editingPlanFor.
    const editingPlanFor = streamPlanPending?.masterTaskId;
    // Runde 3-B — if an interrupt was emitted (and the user is composing
    // their next message), route it to interrupt-handler. The first such
    // message is "what to do next"; subsequent ones go through normal flow.
    const interruptingMaster = streamInterrupted?.masterTaskId;

    const optimisticMsg = makeOptimisticMsg(ac, value);
    setMsgData(prev => ({
      messages: [...(prev?.messages ?? []), optimisticMsg],
      hasMore: prev?.hasMore ?? false,
    }));
    hasSent.current = true;
    setSending(true);
    sendMessage(ac, value, {
      repoName: selectedRepo?.name || curRepo || undefined,
      repoOwner: selectedRepo?.owner || undefined,
      skillIds: selectedSkillIds.length > 0 ? selectedSkillIds : undefined,
      modelOverride: selectedModel,
      firecrawlEnabled: options?.firecrawlEnabled,
      planMode: options?.planMode || planMode || undefined,
      projectId: selectedProjectId ?? undefined,
      scope: projectScope,
      editingPlanFor,
      interruptingMaster,
    })
      .then((result) => {
        // Clear UI banners when the routing actually fired.
        if (editingPlanFor) {
          // Don't clearPlanPending here — backend will re-emit plan_ready
          // with iteration+1 once it's done revising. Just keep it visible.
        }
        if (interruptingMaster) {
          clearInterrupted();
        }
        return handleSendResult(result);
      })
      .catch((e) => { setSending(false); setChatError(classifyError(e)); });
  }, [ac, pendingReviewId, selectedRepo, curRepo, selectedSkillIds, selectedModel, planMode, selectedProjectId, setMsgData, handleRequestChanges, handleSendResult, streamPlanPending, streamInterrupted, clearInterrupted, projectScope]);

  const handleCancel = useCallback(() => {
    if (ac) cancelChatGeneration(ac).catch(() => {});
    setSending(false);
    setActiveTaskId(null);
  }, [ac]);

  const handleForceContinue = useCallback(async () => {
    if (!activeTaskId || !ac) return;
    try {
      await forceContinueTask(activeTaskId, ac);
    } catch {
      // Non-critical
    }
  }, [activeTaskId, ac]);

  const handleDelete = async (id: string) => {
    await deleteConversation(id);
    if (ac === id) {
      const remaining = filtered.filter(x => x.id !== id);
      if (remaining.length > 0) {
        setAc(remaining[0].id);
      } else {
        setAc(null);
        setNewChat(true);
      }
    }
    refreshConvs();
  };

  // Stream status text
  const streamStatusText = streamStatus && streamStatus !== "idle" && streamStatus !== "done"
    ? (() => {
        const s = streamStatus.toLowerCase();
        if (s.includes("plan")) return "Planlegger...";
        if (s.includes("build") || s.includes("generer")) return "Genererer kode...";
        if (s.includes("context") || s.includes("github") || s.includes("memory")) return "Henter kontekst...";
        if (s.includes("valid") || s.includes("test")) return "Validerer...";
        if (s.includes("review")) return "Gjennomgår...";
        return "Tenker...";
      })()
    : null;

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", position: "relative", overflow: "hidden" }}>

      {/* Main content */}
      {newChat ? (
        <div style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0 }}>
          <ChatComposer
            heading={projectScope === "designer" ? "Velkommen til Designer." : "Velkommen til CoWork."}
            projectName={resolvedProjectName}
            projectType={resolvedProjectType ?? (projectScope === "designer" ? "framer" : null)}
            onSubmit={startNewChat}
            skills={availableSkills.map(s => ({ id: s.id, name: s.name, enabled: s.enabled }))}
            selectedSkillIds={selectedSkillIds}
            onSkillsChange={setSelectedSkillIds}
            subAgentsEnabled={subAgentsEnabled}
            onSubAgentsToggle={() => setSubAgentsEnabled(p => !p)}
            models={allModels}
            selectedModel={selectedModel}
            onModelChange={setSelectedModel}
            activeModeLabel={activeModeLabel}
            isIncognito={isIncognito}
            planMode={planMode}
            onPlanModeToggle={() => setPlanMode(p => !p)}
            autoMode={autoMode}
            onAutoModeToggle={() => setAutoMode(p => !p)}
            conversationId={ac ?? undefined}
            projectScope={projectScope}
            onNewProject={() => {
              // Fase I.0.f — CodeProjectModal/DesignProjectModal lyttes på i I.3.
              if (typeof window !== "undefined") {
                window.dispatchEvent(new CustomEvent("tf:new-project", { detail: { scope: projectScope } }));
              }
            }}
            selectedProjectId={derivedProjectId}
            onSelectProject={(id) => {
              setSelectedProjectId(id);
              const url = new URL(window.location.href);
              if (id) url.searchParams.set("project", id);
              else url.searchParams.delete("project");
              router.replace(url.pathname + url.search);
            }}
          />
        </div>
      ) : (
        <div style={{ position: "relative", display: "flex", flexDirection: "column", flex: 1, minHeight: 0 }}>
          {/* Stall banner */}
          {streamStalled && sending && activeTaskId && (
            <div style={{
              position: "absolute",
              top: 12,
              left: "50%",
              transform: "translateX(-50%)",
              zIndex: 50,
              display: "flex",
              alignItems: "center",
              gap: 12,
              background: T.surface,
              border: `1px solid ${T.warning}`,
              borderRadius: 8,
              padding: "10px 16px",
              fontSize: 13,
              color: T.warning,
              boxShadow: "0 4px 16px rgba(0,0,0,0.06)",
            }}>
              <span>Agenten har stoppet å svare</span>
              <button
                onClick={handleForceContinue}
                style={{
                  background: T.accent,
                  color: "#fff",
                  border: "none",
                  borderRadius: 6,
                  padding: "5px 12px",
                  fontSize: 12,
                  cursor: "pointer",
                  fontFamily: T.sans,
                }}
              >
                Fortsett
              </button>
              <button
                onClick={handleCancel}
                style={{
                  background: "transparent",
                  color: T.textMuted,
                  border: `1px solid ${T.border}`,
                  borderRadius: 6,
                  padding: "5px 10px",
                  fontSize: 12,
                  cursor: "pointer",
                  fontFamily: T.sans,
                }}
              >
                Avbryt
              </button>
            </div>
          )}

          <ChatContainer
            title={ac ? (conversations.find(c => c.id === ac)?.title || (ac.startsWith("inkognito-") ? "Inkognito" : "Ny samtale")) : "—"}
            subtitle={curRepo ?? undefined}
            msgs={displayMsgs}
            msgsLoading={msgsLoading}
            ac={ac}
            sending={sending}
            activeTaskId={activeTaskId}
            thinkSeconds={thinkSeconds}
            streamStatusText={streamStatusText}
            chatError={chatError}
            onClearError={() => setChatError(null)}
            onCancel={handleCancel}
            onApprove={handleApprove}
            onReject={handleReject}
            onRequestChanges={handleRequestChanges}
            onSend={handleSend}
            pendingReviewId={pendingReviewId}
            reviewInProgress={reviewInProgress}
            skills={availableSkills.map(s => ({ id: s.id, name: s.name, enabled: s.enabled }))}
            selectedSkillIds={selectedSkillIds}
            onSkillsChange={setSelectedSkillIds}
            subAgentsEnabled={subAgentsEnabled}
            onSubAgentsToggle={() => setSubAgentsEnabled(p => !p)}
            models={allModels}
            selectedModel={selectedModel}
            onModelChange={setSelectedModel}
            onNewChat={() => { setNewChat(true); setAc(null); }}
            activeModeLabel={activeModeLabel}
            isIncognito={isIncognito}
            planMode={planMode}
            onPlanModeToggle={() => setPlanMode(p => !p)}
            autoMode={autoMode}
            onAutoModeToggle={() => setAutoMode(p => !p)}
            conversationId={ac ?? undefined}
            projectScope={projectScope}
            onNewProject={() => {
              if (typeof window !== "undefined") {
                window.dispatchEvent(new CustomEvent("tf:new-project", { detail: { scope: projectScope } }));
              }
            }}
            selectedProjectId={derivedProjectId}
            onSelectProject={(id) => {
              setSelectedProjectId(id);
              const url = new URL(window.location.href);
              if (id) url.searchParams.set("project", id);
              else url.searchParams.delete("project");
              router.replace(url.pathname + url.search);
            }}
            activeSkills={streamActiveSkills}
            liveToolCalls={streamToolCalls}
            planPending={streamPlanPending}
            onClearPlanPending={clearPlanPending}
            interrupted={streamInterrupted}
          />
        </div>
      )}

      {/* Command Palette (Cmd+K) */}
      <CommandPalette
        onNewChat={() => { setNewChat(true); setAc(null); }}
        onSendMessage={(msg) => {
          if (newChat) {
            startNewChat(msg);
          } else if (ac) {
            handleSend(msg);
          }
        }}
        onTriggerDream={async () => {
          try {
            await apiFetch("/memory/dream", { method: "POST" });
          } catch { /* non-critical */ }
        }}
      />
    </div>
  );
}

export default function ChatPage() {
  return (
    <Suspense fallback={<div style={{ padding: 40, textAlign: "center", color: T.textMuted }}>Laster...</div>}>
      <ChatPageInner />
    </Suspense>
  );
}
