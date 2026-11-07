/**
 * Where the source repository stands, and how public surfaces point into it.
 *
 * The Cambridge TCG monorepo is public. Yu, 2026-10-29: "yes I meant for them
 * to be public latest." The same day `gh repo view` reported PUBLIC (not
 * archived). The workspace packages are not published to npm (most declare
 * `"private": true`), so the source can be read and cloned but not installed
 * as a package. Surfaces point at a repository document through
 * repoDocRef(): an on-site page where one exists, otherwise the document on
 * GitHub. For the principle docs the on-site page is a summary of the same
 * doctrine, not the full text, and it omits sections (the-embassy.md's "The
 * substrate beneath" among them); a surface that points at such a section
 * uses repoDocPath(), which always gives the repository document itself.
 *
 * Who follows this module when the visibility changes: callers of
 * repoDocRef() and repoDocPath(), TypeSignature's "read next" links and
 * footer, content/platform's sourceRepository, the MCP discovery documents'
 * stdio_bridge blocks and the agents-notes `repo` fields. Prose elsewhere
 * says the visibility in its own words; repository.test.ts fails while any
 * production file still calls the repository private, so a change here
 * updates them deliberately rather than leaving them silently false.
 */
export const REPOSITORY_URL = "https://github.com/cambridgetcg/Cambridge-TCG-monorepo";
export const REPOSITORY_VISIBILITY = "public" as const;
export const REPOSITORY_VISIBILITY_CHECKED = "2026-10-29";
export const REPOSITORY_NOTE = `public repository at ${REPOSITORY_URL}; the workspace packages are not published to npm`;

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
 *  or null for any other href. Lets renderers that receive GitHub URLs
 *  (TypeSignature recursion props) prefer an on-site page. */
export function repoPathFromGithubUrl(href: string): string | null {
  const prefix = `${REPOSITORY_URL}/`;
  if (!href.startsWith(prefix)) return null;
  return href.slice(prefix.length).replace(/^(?:blob|tree)\/main\//, "");
}

/** The repository document itself: its GitHub URL on main. A path whose last
 *  segment has no extension (or that ends in "/") is a directory and gets a
 *  tree URL; anything else gets a blob URL. Use it when a surface points at
 *  content that only the repository document carries. */
export function repoDocPath(path: string): string {
  const kind = /\.[^/]+$/.test(path) ? "blob" : "tree";
  return `${REPOSITORY_URL}/${kind}/main/${path.replace(/\/$/, "")}`;
}

/** A public URL for a repository document: the on-site page when one exists,
 *  otherwise the document on GitHub. */
export function repoDocRef(path: string): string {
  const onSite = onSitePath(path);
  return onSite ? `${SITE}${onSite}` : repoDocPath(path);
}
