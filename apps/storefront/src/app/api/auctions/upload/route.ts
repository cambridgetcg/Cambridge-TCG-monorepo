import { publicUploadIntakePausedResponse } from "@/lib/uploads/public-intake";

export async function POST() {
  return publicUploadIntakePausedResponse("auction_image");
}
