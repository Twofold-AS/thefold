// DEPRECATED: This page is no longer in active navigation.
// Kept for reference. Will be removed in future cleanup.
import { redirect } from "next/navigation";

export default async function RepoRoot({ params }: { params: Promise<{ name: string }> }) {
  const { name } = await params;
  redirect(`/repo/${name}/overview`);
}
