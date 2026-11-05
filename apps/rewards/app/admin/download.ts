// Saves a fetched response as a file. The admin fetches downloads (so App
// Bridge's session token rides along) instead of linking to them, and then
// hands the body to the browser through a temporary <a download>.
//
// The object URL is revoked on a later task, not straight after click():
// some browsers read the URL asynchronously, and revoking it at once can
// cancel or empty the download, more so inside the embedded admin's iframe.
//
// Only an answer of the kind asked for is saved (A23-F4): a sign-in or error
// page that came back 200 would otherwise be saved under the file's name and
// sent on as if it were the file.
export const REVOKE_AFTER_MS = 1_000;

export function filenameFrom(response: Response, fallbackName: string): string {
  return /filename="([^"]+)"/.exec(response.headers.get("Content-Disposition") ?? "")?.[1] ?? fallbackName;
}

/** The answer's media type, without parameters, in lower case ("" when it has none). */
const mediaTypeOf = (response: Response) => (response.headers.get("Content-Type") ?? "").split(";")[0].trim().toLowerCase();

/**
 * Saves `response` as a file when its Content-Type is `type` (such as
 * "text/csv"); throws, saving nothing, when it is anything else, so the
 * page shows its download-failed words.
 */
export async function saveResponseAsFile(response: Response, fallbackName: string, type: string): Promise<void> {
  if (mediaTypeOf(response) !== type) throw new Error(`The answer is ${mediaTypeOf(response) || "untyped"}, not the file`);
  const filename = filenameFrom(response, fallbackName);
  const url = URL.createObjectURL(await response.blob());
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), REVOKE_AFTER_MS);
}
