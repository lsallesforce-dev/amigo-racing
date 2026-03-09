/**
 * Image Proxy Endpoint
 * 
 * Serve imagens do S3 privado atravÃ©s de um proxy no backend que adiciona autenticaÃ§Ã£o.
 * Isso permite que as imagens sejam acessadas publicamente atravÃ©s do backend,
 * mesmo que o bucket S3 esteja configurado como privado.
 */

import { Request, Response } from 'express';
import { ENV } from '../.././env.js';

/**
 * Busca uma imagem do S3 usando o storage API do Manus
 */
async function fetchImageFromS3(fileKey: string): Promise<{ buffer: Buffer; contentType: string }> {
  const baseUrl = ENV.forgeApiUrl;
  const apiKey = ENV.forgeApiKey;

  if (!baseUrl || !apiKey) {
    throw new Error('Storage credentials missing');
  }

  // Normalizar fileKey (remover barra inicial)
  const normalizedKey = fileKey.replace(/^\/+/, '');

  // Primeiro, obter URL assinada do storage API
  const downloadUrlApiUrl = new URL('v1/storage/downloadUrl', baseUrl.replace(/\/+$/, '') + '/');
  downloadUrlApiUrl.searchParams.set('path', normalizedKey);

  const urlResponse = await fetch(downloadUrlApiUrl, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
    },
  });

  if (!urlResponse.ok) {
    throw new Error(`Failed to get download URL: ${urlResponse.status} ${urlResponse.statusText}`);
  }

  const { url: signedUrl } = await urlResponse.json();

  // Agora fazer download da imagem usando a URL assinada
  const imageResponse = await fetch(signedUrl);

  if (!imageResponse.ok) {
    throw new Error(`Failed to fetch image: ${imageResponse.status} ${imageResponse.statusText}`);
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
