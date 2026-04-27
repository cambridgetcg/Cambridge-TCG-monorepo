import { S3Client, PutObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import crypto from "crypto";

const BUCKET = (process.env.AUCTION_S3_BUCKET || "cambridgetcg-auction-images").trim();
const REGION = (process.env.AWS_REGION || "us-east-1").trim();

const s3 = new S3Client({
  region: REGION,
  credentials: {
    accessKeyId: (process.env.AWS_ACCESS_KEY_ID || "").trim(),
    secretAccessKey: (process.env.AWS_SECRET_ACCESS_KEY || "").trim(),
  },
});

export async function getPresignedUploadUrl(auctionId: string, contentType: string): Promise<{
  uploadUrl: string;
  imageUrl: string;
  s3Key: string;
}> {
  const ext = contentType.split("/")[1] || "jpg";
  const key = `auctions/${auctionId}/${crypto.randomUUID()}.${ext}`;

  const command = new PutObjectCommand({
    Bucket: BUCKET,
    Key: key,
    ContentType: contentType,
  });

  const uploadUrl = await getSignedUrl(s3, command, { expiresIn: 600 });
  const imageUrl = `https://${BUCKET}.s3.${REGION}.amazonaws.com/${key}`;

  return { uploadUrl, imageUrl, s3Key: key };
}

export async function deleteS3Object(key: string): Promise<void> {
  await s3.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: key }));
}
