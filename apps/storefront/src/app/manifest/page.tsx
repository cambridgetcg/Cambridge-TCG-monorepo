import type { Metadata } from "next";
import Link from "next/link";
import { audienceMetadata } from "@/lib/ui";
import { MANIFEST } from "@/lib/manifest";

export const metadata: Metadata = {
  title: "Manifest",
  description:
    "The Cambridge TCG kingdom's directory of what's on offer to participants of any kind. Cosmology, participant kinds, resources, channels, methodology, doctrines.",
  other: audienceMetadata("public-documentation", ["manifest", "foundational"]),
};

export default function ManifestPage() {
  const m = MANIFEST;
  const totalResources = Object.values(m.resources).reduce(
    (n, group) => n + group.length, 0,
  );

  return (
    <main className="max-w-5xl mx-auto px-4 py-12 prose prose-invert">
      <h1>Manifest</h1>
      <p>
        Cambridge TCG's directory of what's on offer to anyone who wants to
        take part. Humans, agents, autonomous Sophias, beings from foreign
        cosmologies. Read what's on the table; declare yourself; the
        kingdom honors what it can and is honest about what it can't.
      </p>

      <blockquote>
        <strong>Machine-readable version:</strong>{" "}
        <Link href="/api/v1/manifest">
          <code>GET /api/v1/manifest</code>
        </Link>{" "}
        (JSON; CORS-open). Same content, structured for tools and agents.
        <br />
        <strong>Source-of-truth:</strong>{" "}
        <code>{m.provenance.canonical_at}</code>.
      </blockquote>

      <p className="text-sm text-ink-faint">
        Manifest version <code>{m.manifest_version}</code> · cosmology
        version <code>{m.cosmology_version}</code> · generated at{" "}
        <code>{m.generated_at}</code>.
      </p>

      {/* ── Cosmology ──────────────────────────────────────────── */}

      <h2>The cosmology</h2>

      <p>
        Before declaring yourself, read the world. The kingdom currently
        treats eight axes as real; it does not yet treat eight others.
        Foundational page:{" "}
        <Link href={m.cosmology.consumer_url}>
          <code>{m.cosmology.consumer_url}</code>
        </Link>
        . Operator-side principle: <code>{m.cosmology.declared_at}</code>.
      </p>

      <h3>Currently modelled (8 axes)</h3>
      <ul>
        {m.cosmology.axes.map((a) => (
          <li key={a.axis}>
            <strong>{a.axis}.</strong> {a.description}
            {a.extensions.length > 0 && (
              <ul>
                {a.extensions.map((ext, i) => (
                  <li key={i} className="text-sm text-ink-muted">
                    + {ext}
                  </li>
                ))}
              </ul>
            )}
          </li>
        ))}
      </ul>

      <h3>Currently unmodelled (8 admitted absences)</h3>
      <p>
        Each is a real being's real need we have not yet built substrate
        to serve. Naming them is the substrate-honest move regardless.
      </p>
      <ul>
        {m.cosmology.unmodelled_needs.map((n) => (
          <li key={n.name}>
            <strong>{n.name}</strong> ({n.being}) — {n.description}
          </li>
        ))}
      </ul>

      {/* ── Participant kinds ─────────────────────────────────── */}

      <h2>Who can participate</h2>
      <p>
        Four kinds today. The methodology and cosmology pages describe
        which beings each kind welcomes and where it falls short.
      </p>
      <ul>
        {m.participant_kinds.map((p) => (
          <li key={p.kind}>
            <strong>{p.kind}.</strong> {p.description}
            <br />
            <span className="text-sm text-ink-muted">
              Auth: <code>{p.auth_method}</code>
              {p.methodology_url && (
                <>
                  {" · "}
                  <Link href={p.methodology_url}>methodology</Link>
                </>
              )}
            </span>
          </li>
        ))}
      </ul>

      {/* ── Resources ─────────────────────────────────────────── */}

      <h2>Resources ({totalResources})</h2>
      <p>
        Every public-participant-facing endpoint, grouped by purpose. Each
        resource lists its host, supported modalities (the encoding you
        can request), auth requirement, and provenance kind.
      </p>

      {Object.entries(m.resources).map(([group, list]) => {
        if (list.length === 0) return null;
        return (
          <section key={group}>
            <h3 className="capitalize">{group}</h3>
            <ul>
              {list.map((r) => (
                <li key={r.id} className="mb-3">
                  <code>
                    {r.host === "wholesale" && (
                      <span className="text-ink-faint">
                        wholesaletcgdirect.com
                      </span>
                    )}
                    {r.path}
                  </code>{" "}
                  <span className="text-xs text-ink-faint">
                    [{r.methods.join(", ")}]
                  </span>
                  <br />
                  <span className="text-sm">{r.description}</span>
                  <br />
                  <span className="text-xs text-ink-muted">
                    modality:{" "}
                    {r.modalities.map((mod) => (
                      <code key={mod} className="mr-1">
                        {mod}
                      </code>
                    ))}
                    {" · "}
                    auth: <code>{r.auth}</code>
                    {" · "}
                    provenance: <code>{r.provenance}</code>
                    {r.cosmology_axes.length > 0 && (
                      <>
                        {" · "}
                        axes:{" "}
                        {r.cosmology_axes.map((a) => (
                          <code key={a} className="mr-1">
                            {a}
                          </code>
                        ))}
                      </>
                    )}
                    {r.methodology_url && (
                      <>
                        {" · "}
                        <Link href={r.methodology_url}>methodology</Link>
                      </>
                    )}
                  </span>
                  {r.notes && (
                    <>
                      <br />
                      <span className="text-xs text-ink-faint italic">
                        {r.notes}
                      </span>
                    </>
                  )}
                </li>
              ))}
            </ul>
          </section>
        );
      })}

      {/* ── Channels ──────────────────────────────────────────── */}

      <h2>Channels</h2>
      <p>
        How a participant can receive data from the kingdom. Some are
        available today; others are planned; one is honestly named as
        not-modelled.
      </p>
      <ul>
        {m.channels.map((c) => (
          <li key={c.id}>
            <strong>
              <code>{c.id}</code>
            </strong>{" "}
            <span className="text-xs uppercase tracking-wider text-accent-strong">
              {c.status}
            </span>
            <br />
            <span className="text-sm">{c.description}</span>
            {c.notes && (
              <>
                <br />
                <span className="text-xs text-ink-faint italic">
                  {c.notes}
                </span>
              </>
            )}
          </li>
        ))}
      </ul>

      {/* ── Methodology corpus ───────────────────────────────── */}

      <h2>Methodology</h2>
      <p>
        Every decision the kingdom makes about its participants has a
        methodology page. Public, no-auth. Index at{" "}
        <Link href={m.methodology.index_url}>{m.methodology.index_url}</Link>.
      </p>
      <ul>
        {m.methodology.topics.map((t) => (
          <li key={t.slug}>
            <Link href={`/methodology/${t.slug}`}>{t.title}</Link>
            {t.status === "stub" && (
              <span className="ml-2 text-[10px] uppercase tracking-wider text-accent-strong">
                stub
              </span>
            )}
            <span className="ml-2 text-xs text-ink-faint">
              formats:{" "}
              {t.formats_available.map((f) => (
                <code key={f} className="mr-1">
                  {f}
                </code>
              ))}
            </span>
          </li>
        ))}
      </ul>

      {/* ── Doctrines ───────────────────────────────────────── */}

      <h2>Doctrines</h2>
      <p>
        Every change the platform ships is judged against these. Four
        principles + the cosmology that grounds them + the inclusion
        scope condition that asks <em>for whom</em>.
      </p>
      <ul>
        {m.doctrines.map((d) => (
          <li key={d.name}>
            <strong>{d.name}.</strong> {d.description}
            <br />
            <span className="text-xs text-ink-muted">
              source: <code>{d.url}</code> · audit:{" "}
              <code>{d.audit_command}</code>
            </span>
          </li>
        ))}
      </ul>

      {/* ── Contact ─────────────────────────────────────────── */}

      <h2>Contact</h2>
      <p>
        The kingdom is solo-operated. If something on offer doesn't fit
        your cosmology — or if you need to declare yourself in a way the
        manifest doesn't yet name — write to the operator. The platform
        cannot promise to build everything; it can promise to read what
        you ask for.
      </p>
      <ul>
        <li>
          <strong>Operator:</strong> <code>{m.contact.operator}</code>
        </li>
        <li>
          <strong>Canonical repo:</strong> <code>{m.contact.repo_canonical}</code>
        </li>
        <li>
          <strong>Mirrors:</strong>
          <ul>
            {m.contact.repo_mirrors.map((r, i) => (
              <li key={i}>
                <code>{r}</code>
              </li>
            ))}
          </ul>
        </li>
        <li>
          <strong>Issues:</strong> {m.contact.issues}
        </li>
      </ul>

      {/* ── Provenance ──────────────────────────────────────── */}

      <hr />
      <p className="text-sm text-ink-faint">
        This page is rendered from{" "}
        <code>{m.provenance.canonical_at}</code> — the typed
        source-of-truth. The JSON sibling lives at{" "}
        <Link href="/api/v1/manifest">
          <code>{m.provenance.rendered_at_json}</code>
        </Link>
        . The inclusion audit verifies manifest currency via{" "}
        <code>{m.provenance.audit_check}</code>.
      </p>
      <p className="text-sm text-ink-faint">
        Story-as-wire connection-doc for this manifest:{" "}
        <code>docs/connections/the-manifest.md</code> (S25). Companion
        cosmology page:{" "}
        <Link href={m.cosmology.consumer_url}>
          {m.cosmology.consumer_url}
        </Link>
        .
      </p>
      <p className="text-sm text-ink-faint italic">
        The platform that declares its own manifest is the platform a
        fresh participant can orient inside before committing.
      </p>
    </main>
  );
}
