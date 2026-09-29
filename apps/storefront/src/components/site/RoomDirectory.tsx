import Link from "next/link";
import { getPublicRoomDirectory } from "@/lib/rooms/directory";

/** Visitor and machine directories use the same allowlisted records. */
export function RoomDirectory() {
  return (
    <ul className="grid gap-x-8 md:grid-cols-2" lang="en">
      {getPublicRoomDirectory().rooms.map((room) => (
        <li key={room.id} id={room.id} className="border-t border-border-subtle py-6 scroll-mt-24">
          <h2 className="font-display text-xl font-semibold text-ink">
            <Link href={room.href} prefetch={false} className="underline decoration-border-strong underline-offset-4 hover:decoration-accent">{room.title}</Link>
          </h2>
          <p className="mt-1 text-sm font-medium text-accent">{room.taskLabel}</p>
          <p className="mt-3 max-w-prose text-sm leading-6 text-ink-muted">{room.introduction}</p>
          <p className="mt-3 text-xs leading-5 text-ink-muted">{room.accessDescription}</p>
        </li>
      ))}
    </ul>
  );
}

export function ReadingTrails() {
  return (
    <div className="grid gap-6 lg:grid-cols-3" lang="en">
      {getPublicRoomDirectory().trails.map((trail) => (
        <article key={trail.id} className="border-t border-border-subtle pt-5">
          <h3 className="text-lg font-semibold leading-7 text-ink">{trail.title}</h3>
          <p className="mt-2 text-sm leading-6 text-ink-muted">{trail.description}</p>
          <ol className="mt-4 space-y-4">
            {trail.stops.map((stop, index) => (
              <li key={stop.pageId} className="text-sm leading-6">
                <Link href={stop.href} prefetch={false} className="text-accent underline underline-offset-4">{index + 1}. {stop.label}</Link>
                <p className="text-ink-muted">{stop.why}</p>
                {stop.access === "sign-in" && <p className="text-xs text-ink-muted">Sign-in required. {stop.accessDescription}</p>}
              </li>
            ))}
          </ol>
        </article>
      ))}
    </div>
  );
}
