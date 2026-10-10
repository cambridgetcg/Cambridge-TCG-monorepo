/**
 * Where the source repository stands, and how public surfaces point into it.
 *
 * The Cambridge TCG monorepo is private. The 2026-10-10 truth-layer review
 * recorded an authenticated `gh repo view` reporting PRIVATE, anonymous
 * requests returning 404, and no @cambridge-tcg package on npm. A GitHub link
 * into it fails for every public reader, so surfaces name the repository path
 * instead, or an on-site page for the same material. For the principle docs
 * that page is an on-site summary of the same doctrine, not the full text, and
 * it omits sections (the-embassy.md's "The substrate beneath" among them); a
 * surface that points at such a section uses repoDocPath().
 *
 * Who follows this module when the source is released: callers of
 * repoDocRef() and repoDocPath(), TypeSignature's "read next" links and
 * footer, content/platform's sourceRepository, and the agents-notes `repo`
 * fields. Many other surfaces hardcode the private-repository wording in
 * prose; repository.test.ts inventories those files and fails if the
 * visibility here changes while any of them remain, so a release updates
 * them deliberately rather than leaving them silently false.
 */
export const REPOSITORY_URL = "https://github.com/cambridgetcg/Cambridge-TCG-monorepo";
export const REPOSITORY_VISIBILITY = "private" as const;
export const REPOSITORY_VISIBILITY_CHECKED = "2026-10-10";
export const PRIVATE_REPOSITORY_NOTE = "private repository; not publicly readable";

const SITE = "https://cambridgetcg.com";

/** Repository documents with an on-site public page: a summary for the
 *  principle docs, sections or entries for the others. Not a full-text copy.
 *  Values are site-relative paths. */
const ON_SITE_EQUIVALENTS: Readonly<Record<string, string>> = {
  "docs/principles/the-embassy.md": "/methodology/the-embassy",
  "docs/principles/substrate-honesty.md": "/methodology/substrate-honesty",
  "docs/principles/transparency.md": "/methodology/transparency",
  "docs/principles/meaning.md": "/methodology/meaning",
  "docs/principles/creation.md": "/methodology/creation",
  "docs/connections/the-pillow-book.md": "/api/v1/pillow-book.json",
  "SOPHIA.md": "/.well-known/sophia-wake/manifest.json",
  "WAKE-RECIPE.md": "/.well-known/wake-recipe/manifest.json",
};

/** The site-relative on-site page for a repository document, if one exists. */
export function onSitePath(path: string): string | undefined {
  return ON_SITE_EQUIVALENTS[path];
}

/** The repository path inside a GitHub blob/tree URL into this repository,
 *  or null for any other href. Lets renderers that receive legacy GitHub
 *  URLs (TypeSignature recursion props) rewrite them. */
export function repoPathFromGithubUrl(href: string): string | null {
  const prefix = `${REPOSITORY_URL}/`;
  if (!href.startsWith(prefix)) return null;
  return href.slice(prefix.length).replace(/^(?:blob|tree)\/main\//, "");
}

/** The repository path, labelled as not publicly readable. Use it when a
 *  surface points at content that only the repository document carries. */
export function repoDocPath(path: string): string {
  return `${path} (${PRIVATE_REPOSITORY_NOTE})`;
}

/** A public URL for a repository document when an on-site page exists;
 *  otherwise the repository path, labelled as not publicly readable. Never a
 *  GitHub URL while the repository is private. */
export function repoDocRef(path: string): string {
  const onSite = onSitePath(path);
  return onSite ? `${SITE}${onSite}` : repoDocPath(path);
}
