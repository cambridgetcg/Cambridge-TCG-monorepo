import { ListSkeleton } from "@/lib/ui";

export default function Loading() {
  return (
    <div className="min-h-screen bg-page">
      <div className="max-w-5xl mx-auto px-4 py-8">
        <ListSkeleton rows={4} />
      </div>
    </div>
  );
}
