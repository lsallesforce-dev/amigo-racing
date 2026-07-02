import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { ENV } from './env.js';

function getS3Client() {
  if (!ENV.r2AccountId || !ENV.r2AccessKeyId || !ENV.r2SecretAccessKey) {
    throw new Error(
      "R2 Storage credentials missing: set R2_ACCOUNT_ID, R2_ACCESS_KEY_ID and R2_SECRET_ACCESS_KEY"
    );
  }

  return new S3Client({
    region: "auto",
    endpoint: `https://${ENV.r2AccountId}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: ENV.r2AccessKeyId,
      secretAccessKey: ENV.r2SecretAccessKey,
    },
  });
}

const BUCKET_NAME = ENV.r2BucketName;

function normalizeKey(relKey: string): string {
  return relKey.replace(/^\/+/, "");
}

/**
 * Generates a signed URL for direct client-side upload (Bypass Vercel 5MB limit)
 */
export async function createSignedUploadUrl(relKey: string): Promise<{ url: string; token: string }> {
  const client = getS3Client();
  const safePath = normalizeKey(relKey);
  
  const command = new PutObjectCommand({ 
    Bucket: BUCKET_NAME, 
    Key: safePath 
  });
  
  const url = await getSignedUrl(client, command, { expiresIn: 3600 }); // 1 hour

  return {
    url,
    token: "" // Not needed for AWS/R2 signed URLs, but kept for interface compatibility
  };
}

/**
 * Uploads a file to R2 Storage (Server-side upload)
 */
export async function storagePut(
  relKey: string,
  data: Buffer | ArrayBuffer | string,
  options?: { contentType?: string }
): Promise<void> {
  const client = getS3Client();
  const safePath = normalizeKey(relKey);
  
  const command = new PutObjectCommand({
    Bucket: BUCKET_NAME,
    Key: safePath,
    Body: data as any,
    ContentType: options?.contentType
  });

  try {
    await client.send(command);
  } catch (err: any) {
    console.error(`[R2 Storage] Upload failed for ${safePath}. Error: ${err.message}`);
    throw new Error(`R2 storage upload failed: ${err.message}`);
  }
}

/**
 * Gets a public URL for a file in R2 Storage
 */
export async function storageGet(relKey: string): Promise<string> {
  const safePath = normalizeKey(relKey);
  const publicUrl = ENV.r2PublicUrl.replace(/\/+$/, "");
  return `${publicUrl}/${safePath}`;
}
