import { ListSkeleton } from "@/lib/ui";

export default function Loading() {
  return (
    <div className="min-h-screen bg-neutral-950">
      <div className="max-w-5xl mx-auto px-4 py-8">
        <ListSkeleton rows={4} />
      </div>
    </div>
  );
}
