import { notFound } from "next/navigation";

import { PlayLab } from "@/components/play-lab";

const MODES = new Set(["standard", "evil", "unknown"]);

export default async function PlayModePage({
  params,
}: {
  params: Promise<{ mode: string }>;
}) {
  const { mode } = await params;
  if (!MODES.has(mode)) {
    notFound();
  }

  return (
    <main className="page-shell page-tight">
      <PlayLab mode={mode as "standard" | "evil" | "unknown"} />
    </main>
  );
}

