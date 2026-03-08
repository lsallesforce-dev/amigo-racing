import imageCompression from 'browser-image-compression';

/**
 * Comprime uma imagem para reduzir seu tamanho antes do upload
 * @param file - Arquivo de imagem original
 * @returns Promise com a imagem comprimida em base64
 */
export async function compressImage(file: File): Promise<string> {
  const options = {
    maxSizeMB: 0.05, // Máximo 50KB (mais agressivo)
    maxWidthOrHeight: 800, // Máximo 800px de largura ou altura
    useWebWorker: true,
    fileType: 'image/jpeg', // Converter para JPEG (melhor compressão)
    initialQuality: 0.6, // Qualidade inicial mais baixa
  };

  try {
    const compressedFile = await imageCompression(file, options);
    
    // Converter para base64
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(compressedFile);
    });
  } catch (error) {
    console.error('Erro ao comprimir imagem:', error);
    throw new Error('Falha ao comprimir imagem');
  }
}
