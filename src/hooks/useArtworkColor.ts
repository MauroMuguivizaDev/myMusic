import { useEffect, useState } from 'react';
import type { Track } from '../domain/music';
export function useArtworkColor(track: Track | null) {
  const [sample, setSample] = useState<{ source: string; color: string } | null>(null);
  const artwork = track?.artwork;
  useEffect(() => {
    if (!artwork) return;
    let active = true;
    const image = new Image();
    image.crossOrigin = 'anonymous';
    image.onload = () => {
      try {
        const canvas = document.createElement('canvas'); canvas.width = 12; canvas.height = 12;
        const context = canvas.getContext('2d', { willReadFrequently: true });
        if (!context) return;
        context.drawImage(image, 0, 0, 12, 12);
        const pixels = context.getImageData(0, 0, 12, 12).data;
        let r = 0, g = 0, b = 0, weight = 0;
        for (let i = 0; i < pixels.length; i += 4) {
          if (pixels[i + 3] < 128) continue;
          const saturation = Math.max(pixels[i], pixels[i+1], pixels[i+2]) - Math.min(pixels[i], pixels[i+1], pixels[i+2]);
          const w = 1 + saturation / 64;
          r += pixels[i] * w; g += pixels[i+1] * w; b += pixels[i+2] * w; weight += w;
        }
        if (active && weight) setSample({ source: artwork, color: `rgb(${Math.round(r/weight)} ${Math.round(g/weight)} ${Math.round(b/weight)})` });
      } catch { /* An unreadable or remote image keeps the local fallback palette. */ }
    };
    image.src = artwork;
    return () => { active = false; image.onload = null; };
  }, [artwork]);
  const hue = track ? [...track.title].reduce((sum, c) => sum + c.charCodeAt(0), 0) % 360 : 215;
  return sample && sample.source === artwork ? sample.color : `hsl(${hue} 25% 38%)`;
}
