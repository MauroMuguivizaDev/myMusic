export function isSuitableArtwork(width: number, height: number, minimumDimension = 250): boolean {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width < minimumDimension || height < minimumDimension) return false;
  const ratio = width / height;
  return ratio >= 0.8 && ratio <= 1.25;
}

export async function imageData(file: File, options: { minimumDimension?: number; requireSquare?: boolean } = {}): Promise<string> {
  if (!['image/jpeg','image/png','image/webp'].includes(file.type)) throw new Error('Escolhe uma imagem JPEG, PNG ou WebP.');
  if (file.size > 8 * 1024 * 1024) throw new Error('O limite da imagem é 8 MB.');
  const url = URL.createObjectURL(file);
  try {
    const image = new Image(); image.src = url;
    await image.decode();
    if (options.minimumDimension && !isSuitableArtwork(image.naturalWidth, image.naturalHeight, options.minimumDimension))
      throw new Error('A imagem é demasiado pequena ou não tem proporções adequadas para uma capa.');
    if (options.requireSquare && !isSuitableArtwork(image.naturalWidth, image.naturalHeight, 1))
      throw new Error('A imagem não tem proporções adequadas para uma capa.');
    const scale = Math.min(1, 1000 / Math.max(image.naturalWidth, image.naturalHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale)); canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Não foi possível preparar a imagem.');
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/jpeg', .88);
  } finally { URL.revokeObjectURL(url); }
}
