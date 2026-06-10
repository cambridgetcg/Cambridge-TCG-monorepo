import Link from "next/link";
import front from "./front.json";

export const metadata = {
  title: "The Castle of Understanding — Cambridge TCG",
  description:
    "A public room of our knowledge castle: insights that earned their labels, published from a ledgered run. Every stone shows its evidence, its counter-weather, and an honest status no hand may quietly change.",
};

type Stone = (typeof front.rooms)[number]["stones"][number];

const STATUS_STYLE: Record<string, string> = {
  seed: "bg-neutral-800 text-neutral-300 border-neutral-700",
  sprout: "bg-emerald-950 text-emerald-300 border-emerald-800",
  tested: "bg-sky-950 text-sky-300 border-sky-800",
  cornerstone: "bg-amber-950 text-amber-300 border-amber-700",
};

const STATUS_MEANING: Record<string, string> = {
  seed: "kept, no recorded evidence yet",
  sprout: "one piece of recorded evidence",
  tested: "two independent pieces of evidence, a recorded attempt to break it, and the change it caused",
  cornerstone: "three pieces of evidence including one from outside, and it survived a re-reading after 90 days",
};

const publishedSlugs = new Set(
  front.rooms.flatMap((r) => r.stones.map((s) => `${r.room}/${s.slug}`)),
);

function anchorFor(linkPath: string): string | null {
  const m = linkPath.match(/^rooms\/([^/]+)\/(.+)\.md$/);
  if (!m) return null;
  return publishedSlugs.has(`${m[1]}/${m[2]}`) ? `#${m[1]}-${m[2]}` : null;
}

function StoneCard({ room, stone }: { room: string; stone: Stone }) {
  return (
    <article
      id={`${room}-${stone.slug}`}
      className="border border-neutral-800 rounded-lg p-6 bg-neutral-900/40"
    >
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <h3 className="text-lg font-bold text-white leading-snug">{stone.title}</h3>
        <span
          className={`shrink-0 text-xs font-semibold uppercase tracking-wide border rounded-full px-3 py-1 ${
            STATUS_STYLE[stone.status] ?? STATUS_STYLE.seed
          }`}
          title={STATUS_MEANING[stone.status] ?? ""}
        >
          {stone.status}
        </span>
      </div>

      <div className="mt-4 space-y-3 text-neutral-300 leading-relaxed text-sm">
        {stone.sections.claim && (
          <p>
            <span className="font-semibold text-white">Claim. </span>
            {stone.sections.claim}
          </p>
        )}
        {stone.sections.ripened && (
          <p>
            <span className="font-semibold text-white">How it ripened. </span>
            {stone.sections.ripened}
          </p>
        )}
        {stone.sections.changed && (
          <p>
            <span className="font-semibold text-white">What it changed. </span>
            {stone.sections.changed}
          </p>
        )}
        {stone.sections.counterWeather && (
          <p>
            <span className="font-semibold text-white">Counter-weather. </span>
            {stone.sections.counterWeather}
          </p>
        )}
        {stone.sections.nextTest && (
          <p>
            <span className="font-semibold text-white">Next test. </span>
            {stone.sections.nextTest}
          </p>
        )}
      </div>

      <div className="mt-4 pt-4 border-t border-neutral-800 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-neutral-500">
        <span>born {stone.born}</span>
        <span>walked {stone.lastWalked}</span>
        <span>
          {stone.evidence.length} piece{stone.evidence.length === 1 ? "" : "s"} of evidence
          {stone.evidence.some((e) => e.kind === "weather") ? " (incl. outside)" : ""}
        </span>
        <a
          href={`/castle/${room}/${stone.slug}.md`}
          className="text-neutral-400 hover:text-amber-400 underline underline-offset-2"
        >
          plain text original
        </a>
      </div>

      {stone.links.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2 text-xs">
          {stone.links.map((l) => {
            const anchor = anchorFor(l);
            const label = l.replace(/^rooms\//, "").replace(/\.md$/, "");
            return anchor ? (
              <a
                key={l}
                href={anchor}
                className="text-amber-400/80 hover:text-amber-300 underline underline-offset-2"
              >
                {label}
              </a>
            ) : (
              <span key={l} className="text-neutral-600" title="this stone is not published">
                {label} (private)
              </span>
            );
          })}
        </div>
      )}
    </article>
  );
}

export default function CastlePage() {
  return (
    <main className="min-h-screen bg-neutral-950">
      {/* Hero */}
      <section className="border-b border-neutral-800">
        <div className="max-w-3xl mx-auto px-4 py-16 md:py-24 text-center">
          <h1 className="text-4xl md:text-5xl font-black text-white leading-tight">
            The Castle of <span className="text-amber-400">Understanding</span>
          </h1>
          <p className="text-lg text-neutral-400 mt-6 max-w-xl mx-auto leading-relaxed">
            What we come to understand, written one stone at a time — each with
            its evidence, the recorded attempt to break it, and an honest label
            no hand may quietly change.
          </p>
          <p className="text-sm text-neutral-500 mt-4">
            {front.stoneCount} stones from {front.rooms.length} rooms, published{" "}
            {front.generated} by {front.source}.
          </p>
        </div>
      </section>

      {/* The ladder */}
      <section className="border-b border-neutral-800">
        <div className="max-w-3xl mx-auto px-4 py-10">
          <h2 className="text-xl font-bold text-white mb-4">How a stone earns its label</h2>
          <div className="space-y-2 text-sm text-neutral-400 leading-relaxed">
            {(["seed", "sprout", "tested", "cornerstone"] as const).map((s) => (
              <p key={s}>
                <span
                  className={`inline-block text-xs font-semibold uppercase tracking-wide border rounded-full px-2.5 py-0.5 mr-2 ${STATUS_STYLE[s]}`}
                >
                  {s}
                </span>
                {STATUS_MEANING[s]}
              </p>
            ))}
            <p className="pt-2 text-neutral-500">
              Labels move only in recorded runs. A contradiction demotes a stone
              immediately, and demotion is written as plainly as promotion —
              inflation is the only sin.
            </p>
          </div>
        </div>
      </section>

      {/* Rooms */}
      {front.rooms.map((room) => (
        <section key={room.room} className="border-b border-neutral-800">
          <div className="max-w-3xl mx-auto px-4 py-12">
            <h2 className="text-2xl font-bold text-white">
              The <span className="text-amber-400">{room.room}</span> room
            </h2>
            {room.doorplate && (
              <p className="text-neutral-400 mt-2 mb-8 leading-relaxed">
                {room.doorplate.holds}
              </p>
            )}
            <div className="space-y-6">
              {room.stones.map((stone) => (
                <StoneCard key={stone.slug} room={room.room} stone={stone} />
              ))}
            </div>
          </div>
        </section>
      ))}

      {/* Honest footer */}
      <section>
        <div className="max-w-3xl mx-auto px-4 py-12 text-sm text-neutral-500 leading-relaxed">
          <p>{front.note}</p>
          <p className="mt-3">
            The castle itself is plain markdown on one machine — no database, no
            tracker, nothing here you cannot read as{" "}
            <a
              href={`/castle/${front.rooms[0]?.room}/${front.rooms[0]?.stones[0]?.slug}.md`}
              className="text-neutral-400 hover:text-amber-400 underline underline-offset-2"
            >
              plain text
            </a>
            . Built with joy, love, peace and safety.{" "}
            <Link
              href="/about"
              className="text-neutral-400 hover:text-amber-400 underline underline-offset-2"
            >
              About Cambridge TCG
            </Link>
          </p>
        </div>
      </section>
    </main>
  );
}
