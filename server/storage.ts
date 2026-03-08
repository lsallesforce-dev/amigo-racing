// Uses the Biz-provided storage proxy (Authorization: Bearer <token>)

import { ENV } from './env.ts';

type StorageConfig = { baseUrl: string; apiKey: string };

function getStorageConfig(): StorageConfig {
  const baseUrl = ENV.forgeApiUrl;
  const apiKey = ENV.forgeApiKey;

  if (!baseUrl || !apiKey) {
    throw new Error(
      "Storage proxy credentials missing: set BUILT_IN_FORGE_API_URL and BUILT_IN_FORGE_API_KEY"
    );
  }

  return { baseUrl: baseUrl.replace(/\/+$/, ""), apiKey };
}

function buildUploadUrl(baseUrl: string, relKey: string): URL {
  const url = new URL("v1/storage/upload", ensureTrailingSlash(baseUrl));
  url.searchParams.set("path", normalizeKey(relKey));
  return url;
}

async function buildDownloadUrl(
  baseUrl: string,
  relKey: string,
  apiKey: string
): Promise<string> {
  const downloadApiUrl = new URL(
    "v1/storage/downloadUrl",
    ensureTrailingSlash(baseUrl)
  );
  downloadApiUrl.searchParams.set("path", normalizeKey(relKey));
  const response = await fetch(downloadApiUrl, {
    method: "GET",
    headers: buildAuthHeaders(apiKey),
  });
  return (await response.json()).url;
}

function ensureTrailingSlash(value: string): string {
  return value.endsWith("/") ? value : `${value}/`;
}

function normalizeKey(relKey: string): string {
  return relKey.replace(/^\/+/, "");
}

function buildAuthHeaders(apiKey: string): HeadersInit {
  return {
    Authorization: `Bearer ${apiKey}`,
  };
}

export async function storagePut(
  relKey: string,
  data: any,
  options?: { contentType?: string }
): Promise<void> {
  const { baseUrl, apiKey } = getStorageConfig();
  const url = buildUploadUrl(baseUrl, relKey);

  const headers: any = {
    ...buildAuthHeaders(apiKey),
  };

  if (options?.contentType) {
    headers["Content-Type"] = options.contentType;
  }

  const response = await fetch(url, {
    method: "POST",
    headers,
    body: data,
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Storage upload failed (${response.status}): ${errorText}`);
  }
}

export async function storageGet(relKey: string): Promise<string> {
  const { baseUrl, apiKey } = getStorageConfig();
  return buildDownloadUrl(baseUrl, relKey, apiKey);
}
