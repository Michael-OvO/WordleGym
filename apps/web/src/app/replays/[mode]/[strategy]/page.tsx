import { notFound } from "next/navigation";

import { ReplayPanel } from "@/components/replay-panel";
import { getSampleReplays } from "@/lib/generated-data";

export default async function ReplayPage({
  params,
}: {
  params: Promise<{ mode: string; strategy: string }>;
}) {
  const { mode, strategy } = await params;
  const replays = await getSampleReplays();
  const trace = replays?.[mode]?.[strategy];
  if (!trace) {
    notFound();
  }

  return (
    <main className="page-shell page-tight">
      <ReplayPanel trace={trace} />
    </main>
  );
}

