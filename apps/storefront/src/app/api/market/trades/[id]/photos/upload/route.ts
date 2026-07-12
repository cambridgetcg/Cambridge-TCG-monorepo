import { publicUploadIntakePausedResponse } from "@/lib/uploads/public-intake";

// Presigning is paused for sellers and admins alike until the storage
// boundary is private and bounded.
export async function POST() {
  return publicUploadIntakePausedResponse("trade_photo");
}
