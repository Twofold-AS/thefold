import { redirect } from "next/navigation";

export default async function RepoRoot({ params }: { params: Promise<{ name: string }> }) {
  const { name } = await params;
  redirect(`/repo/${name}/overview`);
}
