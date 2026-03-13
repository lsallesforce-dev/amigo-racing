// Uses Supabase Storage REST API
import { ENV } from './env.js';

const BUCKET_NAME = "amigo-racing";

function getSupabaseConfig() {
  const url = ENV.supabaseUrl;
  const key = ENV.supabaseServiceKey;

  if (!url || !key) {
    throw new Error(
      "Supabase Storage credentials missing: set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY"
    );
  }

  return { 
    baseUrl: url.replace(/\/+$/, ""), 
    apiKey: key 
  };
}

function normalizeKey(relKey: string): string {
  return relKey.replace(/^\/+/, "");
}

/**
 * Generates a signed URL for direct client-side upload (Bypass Vercel 5MB limit)
 */
export async function createSignedUploadUrl(relKey: string): Promise<{ url: string; token: string }> {
  const { baseUrl, apiKey } = getSupabaseConfig();
  const safePath = normalizeKey(relKey);
  
  // Supabase REST API for signed upload URL:
  // POST /storage/v1/object/upload/sign/[bucket]/[path]
  const url = `${baseUrl}/storage/v1/object/upload/sign/${BUCKET_NAME}/${safePath}`;

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ expiresIn: 3600 }) // 1 hour
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to create signed upload URL (${response.status}): ${errorText}`);
  }

  const data = await response.json();
  // Supabase returns { url: "/object/upload/sign/..." } which is relative to /storage/v1
  // We MUST ensure the full URL includes /storage/v1
  const relativeUrl = data.url.startsWith('/') ? data.url : `/${data.url}`;
  
  // Extract token from URL more robustly
  const urlParts = relativeUrl.split('?');
  const queryParams = new URLSearchParams(urlParts[1] || "");
  const token = queryParams.get('token') || "";

  return {
    url: `${baseUrl}/storage/v1${relativeUrl}`,
    token
  };
}

/**
 * Uploads a file to Supabase Storage
 */
export async function storagePut(
  relKey: string,
  data: Buffer | ArrayBuffer | string,
  options?: { contentType?: string }
): Promise<void> {
  const { baseUrl, apiKey } = getSupabaseConfig();
  const safePath = normalizeKey(relKey);
  
  // URL: https://[project-id].supabase.co/storage/v1/object/[bucket]/[path]
  const url = `${baseUrl}/storage/v1/object/${BUCKET_NAME}/${safePath}`;

  const headers: Record<string, string> = {
    "Authorization": apiKey.startsWith("Bearer ") ? apiKey : `Bearer ${apiKey}`,
    "apikey": apiKey.replace("Bearer ", ""),
    "x-upsert": "true"
  };

  const keyPreview = apiKey.substring(0, 15) + "...";
  console.log(`[Supabase Storage] Uploading to ${url}. Key prefix: ${keyPreview}, Length: ${apiKey.length}`);

  if (options?.contentType) {
    headers["Content-Type"] = options.contentType;
  }

  const response = await fetch(url, {
    method: "POST",
    headers,
    body: data as any,
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error(`[Supabase Storage] Upload failed for ${url}. Status: ${response.status}. Error: ${errorText}`);
    throw new Error(`Supabase storage upload failed (${response.status}): ${errorText}`);
  }
}

/**
 * Gets a public URL for a file in Supabase Storage
 */
export async function storageGet(relKey: string): Promise<string> {
  const { baseUrl } = getSupabaseConfig();
  const safePath = normalizeKey(relKey);
  
  // URL: https://[project-id].supabase.co/storage/v1/object/public/[bucket]/[path]
  return `${baseUrl}/storage/v1/object/public/${BUCKET_NAME}/${safePath}`;
}
