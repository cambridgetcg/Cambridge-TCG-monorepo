// Adventure level — a PRACTICE battle that runs entirely in the visitor's
// browser. Durable PVE (server-recorded battles and rewards) stays paused
// while server-side rules validation is completed; this page mounts no
// mutation path — the boundary the pause protects is untouched. Rewards
// are paused; the battle itself is local, free, and records nothing.

import { PracticeBoard } from "@/components/game/PracticeBoard";

export const metadata = {
  title: "Practice battle — Adventure | Cambridge TCG",
  description:
    "A practice One Piece TCG battle that runs in your browser. Nothing recorded, nothing paid — rewards are paused while rules validation is completed.",
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
