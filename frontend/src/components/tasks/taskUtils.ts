export function mapStatus(status: string): "done" | "active" | "pending" {
  if (status === "done" || status === "completed") return "done";
  if (status === "in_progress" || status === "in_review") return "active";
  return "pending";
}

export function statusLabel(status: string): string {
  switch (status) {
    case "done":
    case "completed":
      return "done";
    case "in_progress":
      return "aktiv";
    case "in_review":
      return "review";
    case "planned":
      return "planlagt";
    case "backlog":
      return "backlog";
    case "blocked":
      return "blokkert";
    default:
      return status;
  }
}

export function timeAgo(date: string): string {
  const diff = Date.now() - new Date(date).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "na";
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}t`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d`;
  return `${Math.floor(days / 30)}mnd`;
}
