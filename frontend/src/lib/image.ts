/**
 * Lee una imagen, la redimensiona (canvas, máx maxDim px) y la devuelve como
 * data URL JPEG comprimido. Si falla la compresión, regresa el original.
 *
 * Escala para que el lado más largo quede ≤ maxDim (no agranda imágenes
 * pequeñas). Mismo patrón que `fileToCompressedDataUrl` en PurchaseFlow.tsx.
 */
export async function fileToImageDataUrl(file: File, maxDim = 800, quality = 0.8): Promise<string> {
  const dataUrl: string = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error('No se pudo leer el archivo'));
    reader.readAsDataURL(file);
  });
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error('Imagen inválida'));
      image.src = dataUrl;
    });
    const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
    const w = Math.round(img.width * scale);
    const h = Math.round(img.height * scale);
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) return dataUrl;
    ctx.drawImage(img, 0, 0, w, h);
    return canvas.toDataURL('image/jpeg', quality);
  } catch {
    return dataUrl;
  }
}
