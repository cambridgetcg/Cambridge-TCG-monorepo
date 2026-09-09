// Adventure level — a PRACTICE battle that runs entirely in the visitor's
// browser. Durable PVE (server-recorded battles and rewards) stays paused
// while server-side rules validation is completed; this page mounts no
// mutation path — the boundary the pause protects is untouched. Rewards
// are paused; battle state, starter choice, and clears can be saved in
// localStorage in this browser only, not as server-recorded PVE results.

import { PracticeBoard } from "@/components/game/PracticeBoard";

export const metadata = {
  title: "Practice battle — Adventure | Cambridge TCG",
  description:
    "A practice One Piece TCG battle with browser-local saves. No server-recorded results or rewards while server-side rules validation is completed.",
};

export default async function AdventureLevelPage({
  params,
}: {
  params: Promise<{ levelId: string }>;
}) {
  const { levelId } = await params;
  const id = Number.parseInt(levelId, 10);
  return <PracticeBoard levelId={Number.isNaN(id) ? 0 : id} />;
}
