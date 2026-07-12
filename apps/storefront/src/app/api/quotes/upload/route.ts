import { publicUploadIntakePausedResponse } from "@/lib/uploads/public-intake";

// The quote desk is retired and the shared object bucket is not private.
// Keep this old URL fail-closed so stale clients cannot mint upload links.
export async function POST() {
  return publicUploadIntakePausedResponse("quote_image");
}
