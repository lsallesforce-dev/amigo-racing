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
    "Authorization": `Bearer ${apiKey}`,
    "x-upsert": "true" // Allow overwriting
  };

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
