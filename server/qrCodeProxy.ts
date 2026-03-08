import { Request, Response } from 'express';

/**
 * Proxy endpoint para carregar QR Code do Pagar.me
 * Soluciona problemas de CORS ao acessar imagens de stone.com.br
 */
export async function qrCodeProxyHandler(req: Request, res: Response) {
  try {
    const { url } = req.query;

    if (!url || typeof url !== 'string') {
      console.error('[QRCodeProxy] URL nÃ£o fornecida ou invÃ¡lida');
      return res.status(400).json({ error: 'URL nÃ£o fornecida' });
    }

    // Validar que Ã© uma URL do Pagar.me/Stone
    if (!url.includes('stone.com.br') && !url.includes('pagarme') && !url.includes('pix')) {
      console.error('[QRCodeProxy] URL nÃ£o permitida:', url);
      return res.status(403).json({ error: 'URL nÃ£o permitida' });
    }

    console.log('[QRCodeProxy] Carregando QR Code de:', url);

    // Fazer requisiÃ§Ã£o para a URL
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);
    
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
      signal: controller.signal,
    });
    
    clearTimeout(timeoutId);

    if (!response.ok) {
      console.error('[QRCodeProxy] Erro ao carregar imagem:', response.status, response.statusText);
      return res.status(response.status).json({ error: 'Erro ao carregar imagem' });
    }

    // Obter content-type
    const contentType = response.headers.get('content-type') || 'image/png';
    
    // Configurar headers CORS
    res.setHeader('Content-Type', contentType);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Cache-Control', 'public, max-age=3600'); // Cache por 1 hora
    res.setHeader('X-Content-Type-Options', 'nosniff');

    // Enviar buffer da imagem
    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    res.send(buffer);

    console.log('[QRCodeProxy] QR Code carregado com sucesso, tamanho:', buffer.length, 'bytes');
  } catch (error) {
    console.error('[QRCodeProxy] Erro ao processar requisiÃ§Ã£o:', error);
    res.status(500).json({ error: 'Erro ao processar requisiÃ§Ã£o' });
  }
}
