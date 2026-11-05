// Saves a fetched response as a file. The admin fetches downloads (so App
// Bridge's session token rides along) instead of linking to them, and then
// hands the body to the browser through a temporary <a download>.
//
// The object URL is revoked on a later task, not straight after click():
// some browsers read the URL asynchronously, and revoking it at once can
// cancel or empty the download, more so inside the embedded admin's iframe.
export const REVOKE_AFTER_MS = 1_000;

export function filenameFrom(response: Response, fallbackName: string): string {
  return /filename="([^"]+)"/.exec(response.headers.get("Content-Disposition") ?? "")?.[1] ?? fallbackName;
}

export async function saveResponseAsFile(response: Response, fallbackName: string): Promise<void> {
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
