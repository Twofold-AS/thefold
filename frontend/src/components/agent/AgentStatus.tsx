"use client";

import { useState } from "react";
import type { AgentStatusData, AgentPhaseProps } from "./types";
import { PhaseTab } from "./PhaseTab";
import { AgentWorking } from "./AgentWorking";
import { AgentWaiting } from "./AgentWaiting";
import { AgentReview } from "./AgentReview";
import { AgentComplete } from "./AgentComplete";
import { AgentFailed } from "./AgentFailed";
import { AgentClarification } from "./AgentClarification";
import { AgentStopped } from "./AgentStopped";

// Re-export types for backward compatibility
export type { AgentStep, ReviewData, AgentStatusData, AgentMessageType } from "./types";
export { parseAgentMessage } from "./parseAgentMessage";
export { parseAgentStatusContent } from "./types";

interface AgentStatusProps {
  data: AgentStatusData;
  lastThought?: string;
  onReply?: (answer: string) => void;
  onDismiss?: () => void;
  onApprove?: (reviewId: string) => void;
  onRequestChanges?: (reviewId: string) => void;
  onReject?: (reviewId: string) => void;
  onForceContinue?: (taskId: string) => void;
  onCancelTask?: (taskId: string) => void;
}

export function AgentStatus({
  data,
  lastThought,
  onReply,
  onDismiss,
  onApprove,
  onRequestChanges,
  onReject,
  onForceContinue,
  onCancelTask,
}: AgentStatusProps) {
  const [collapsed, setCollapsed] = useState(false);

  const isFailed = data.phase === "Feilet";
  const isComplete = data.phase === "Ferdig";
  const isStopped = data.phase === "Stopped";
  const isWaiting = data.phase === "Venter";
  const isReviewWaiting = isWaiting && !!data.reviewData;
  const isClarification = isWaiting && !isReviewWaiting && !!data.questions?.length;
  const isWorking = !isComplete && !isFailed && !isWaiting && !isStopped;

  const phaseProps: AgentPhaseProps = {
    data,
    lastThought,
    onReply,
    onDismiss,
    onApprove,
    onRequestChanges,
    onReject,
    onForceContinue,
    onCancelTask,
  };

  return (
    <div className="my-3 max-w-lg message-enter">
      {/* Tab header */}
      <PhaseTab
        phase={isReviewWaiting ? "Review" : data.phase}
        isWorking={isWorking}
        isFailed={isFailed}
        isWaiting={isWaiting || isClarification}
        collapsed={collapsed}
        onToggle={() => setCollapsed(!collapsed)}
      />

      {/* Phase content */}
      {!collapsed && renderPhase(data.phase, phaseProps, { isReviewWaiting, isClarification })}
    </div>
  );
}

function renderPhase(
  phase: string,
  props: AgentPhaseProps,
  flags: { isReviewWaiting: boolean; isClarification: boolean }
) {
  // Review waiting has priority
  if (flags.isReviewWaiting) {
    return <AgentReview {...props} />;
  }

  // Clarification — needs_input with questions
  if (flags.isClarification) {
    return <AgentClarification {...props} />;
  }

  switch (phase) {
    case "Ferdig":
      return <AgentComplete {...props} />;
    case "Feilet":
      return <AgentFailed {...props} />;
    case "Stopped":
      return <AgentStopped {...props} />;
    case "Venter":
      return <AgentWaiting {...props} />;
    default:
      // Working phases: Forbereder, Analyserer, Planlegger, Bygger, Reviewer, Utfører
      return <AgentWorking {...props} />;
  }
}
