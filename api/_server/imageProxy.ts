/**
 * Image Proxy Endpoint
 * 
 * Serve imagens do S3 privado atravÃ©s de um proxy no backend que adiciona autenticaÃ§Ã£o.
 * Isso permite que as imagens sejam acessadas publicamente atravÃ©s do backend,
 * mesmo que o bucket S3 esteja configurado como privado.
 */

import { Request, Response } from 'express';
import { ENV } from './env.js';
import * as storage from './storage.js';

/**
 * Busca uma imagem do Supabase Storage
 */
async function fetchImageFromS3(fileKey: string): Promise<{ buffer: Buffer; contentType: string }> {
  // Com Supabase Public Bucket, podemos baixar diretamente da URL pública
  // No entanto, para manter o proxy (se necessário por CORS ou segurança futura),
  // fazemos o fetch pelo backend.
  
  const relPath = fileKey.replace(/^\/+/, '');
  const url = await storage.storageGet(relPath);

  console.log('[ImageProxy] Fetching from Supabase:', url);

  const imageResponse = await fetch(url);

  if (!imageResponse.ok) {
    throw new Error(`Failed to fetch image from Supabase: ${imageResponse.status} ${imageResponse.statusText}`);
  }

  // Obter o buffer da imagem
  const arrayBuffer = await imageResponse.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  // Obter content-type do response
  const contentType = imageResponse.headers.get('content-type') || 'application/octet-stream';

  return { buffer, contentType };
}

/**
 * Handler do endpoint /api/images/:key
 */
export async function imageProxyHandler(req: Request, res: Response) {
  try {
    const fileKey = decodeURIComponent(req.params.key);

    if (!fileKey) {
      res.status(400).json({ error: 'Missing file key' });
      return;
    }

    console.log('[ImageProxy] Fetching image:', fileKey);

    // Buscar imagem do S3
    const { buffer, contentType } = await fetchImageFromS3(fileKey);

    // Configurar headers de cache
    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable'); // Cache por 1 ano
    res.setHeader('Content-Length', buffer.length);

    // Enviar imagem
    res.send(buffer);
  } catch (error) {
    console.error('[ImageProxy] Error:', error);
    res.status(500).json({
      error: 'Failed to fetch image',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}
