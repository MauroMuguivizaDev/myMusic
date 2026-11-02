import { imageData } from './artwork';
import { importAudio, db } from './library';
import { MAX_FILE_BYTES } from '../domain/music';
import { isRelevantMusicResult } from './searchRelevance';
import type { DownloadProgress } from './jamendo';

const API = 'https://api.audius.co/v1';
export const AUDIUS_OML_URL = 'https://audius.org/open-music-license.pdf';
const CREATIVE_COMMONS_LICENSES: Record<string, string> = {
  'Attribution CC BY': 'https://creativecommons.org/licenses/by/4.0/',
  'Attribution Share Alike CC BY-SA': 'https://creativecommons.org/licenses/by-sa/4.0/',
  'Attribution Non-Commercial CC BY-NC': 'https://creativecommons.org/licenses/by-nc/4.0/',
  'Attribution Non-Commercial Share Alike CC BY-NC-SA': 'https://creativecommons.org/licenses/by-nc-sa/4.0/',
  'Attribution No Derivatives CC BY-ND': 'https://creativecommons.org/licenses/by-nd/4.0/',
  'Attribution Non-Commercial No Derivatives CC BY-NC-ND': 'https://creativecommons.org/licenses/by-nc-nd/4.0/',
};

export interface AudiusTrack {
  id: string;
  title: string;
  artist: string;
  album?: string;
  duration?: number;
  artwork?: string;
  permalink?: string;
  license?: string;
  is_downloadable: boolean;
  is_download_gated: boolean;
  download_conditions?: unknown;
  licenseUrl?: string;
}

function object(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? value as Record<string, unknown> : {};
}

function safeText(value: unknown, max = 200): string {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

function safeArtwork(value: unknown): string | undefined {
  const artwork = object(value);
  const url = safeText(artwork['480x480'] || artwork['150x150'], 1000);
  return url.startsWith('https://') ? url : undefined;
}

export async function searchAudius(query: string, signal: AbortSignal): Promise<AudiusTrack[]> {
  if (!query.trim()) return [];
  const params = new URLSearchParams({ query: query.trim(), limit: '30' });
  let response: Response;
  try { response = await fetch(`${API}/tracks/search?${params}`, { signal, headers: { Accept: 'application/json' } }); }
  catch {
    if (signal.aborted) throw new DOMException('Cancelado', 'AbortError');
    throw new Error('Não foi possível contactar o Audius. Verifica a ligação.');
  }
  if (!response.ok) throw new Error(`Audius respondeu com erro ${response.status}.`);
  const payload = object(await response.json().catch(() => null));
  if (!Array.isArray(payload.data)) throw new Error('O Audius devolveu uma resposta inválida.');
  return payload.data.map(value => {
    const item = object(value);
    const user = object(item.user);
    const title = safeText(item.title);
    const artist = safeText(user.name || user.handle);
    const id = safeText(item.id, 100);
    const path = safeText(item.permalink, 500);
    const url = path.startsWith('/') ? `https://audius.co${path}` : /^https:\/\/audius\.co\//.test(path) ? path : undefined;
    const license = safeText(item.license);
    const licenseUrl = CREATIVE_COMMONS_LICENSES[license];
    const isDownloadable = item.is_downloadable === true && item.is_download_gated !== true && !item.download_conditions;
    return {
      id, title, artist, duration: typeof item.duration === 'number' ? item.duration : undefined,
      artwork: safeArtwork(item.artwork), permalink: url, license: license || 'Licença não indicada',
      is_downloadable: isDownloadable, is_download_gated: item.is_download_gated === true,
      download_conditions: item.download_conditions,
      licenseUrl,
    } satisfies AudiusTrack;
  }).filter(track => track.id && track.title && track.artist && track.permalink && isRelevantMusicResult(query, track.title, track.artist))
    .sort((a, b) => Number(b.is_downloadable) - Number(a.is_downloadable) || a.title.localeCompare(b.title));
}

export function audiusDownloadAuthorized(track: AudiusTrack): boolean {
  // Require both the public download setting and an explicit CC license we can identify.
  // Audius OML covers API access, while this allowlist respects the artist's alternative license.
  return track.is_downloadable && !track.is_download_gated && !track.download_conditions && !!track.licenseUrl;
}

export async function downloadAudiusTrack(track: AudiusTrack, signal: AbortSignal, onProgress: (progress: DownloadProgress) => void) {
  if (!audiusDownloadAuthorized(track)) throw new Error('O Audius não confirmou uma licença e autorização pública de download para esta faixa.');
  let response: Response;
  try {
    response = await fetch(`${API}/tracks/${encodeURIComponent(track.id)}/download`, {
      method: 'GET', redirect: 'follow', signal,
      headers: { Accept: 'audio/*, application/octet-stream' },
    });
  }
  catch {
    if (signal.aborted) throw new DOMException('Cancelado', 'AbortError');
    throw new Error('Não foi possível obter o áudio directamente do Audius. O servidor pode bloquear o acesso por CORS; a faixa não foi adicionada.');
  }
  if (!response.ok) throw new Error(response.status === 403 ? 'O Audius não autoriza o download desta faixa.' : `Falha ao descarregar a faixa (${response.status}).`);
  if (response.redirected && response.url && new URL(response.url).hostname === 'audius.co') {
    throw new Error('O Audius encaminhou para uma página em vez de devolver áudio. A faixa não foi adicionada.');
  }
  const mimeHeader = response.headers.get('content-type')?.split(';')[0] || '';
  const mime = mimeHeader.toLowerCase();
  if (!mime.startsWith('audio/') && mime !== 'application/octet-stream') {
    throw new Error('O Audius não devolveu um ficheiro de áudio. A faixa não foi adicionada.');
  }
  const length = Number(response.headers.get('content-length'));
  if (length > MAX_FILE_BYTES) throw new Error('O ficheiro excede o limite de 200 MB.');
  const chunks: Uint8Array[] = [];
  let loaded = 0;
  if (response.body) {
    const reader = response.body.getReader();
    try {
      while (true) {
        if (signal.aborted) { await reader.cancel(); throw new DOMException('Cancelado', 'AbortError'); }
        const { done, value } = await reader.read();
        if (done) break;
        loaded += value.byteLength;
        if (loaded > MAX_FILE_BYTES) { await reader.cancel(); throw new Error('O ficheiro excede o limite de 200 MB.'); }
        chunks.push(value);
        onProgress({ loaded, total: length > 0 ? length : undefined });
      }
    } finally { reader.releaseLock(); }
  } else {
    const buffer = await response.arrayBuffer();
    loaded = buffer.byteLength;
    if (loaded > MAX_FILE_BYTES) throw new Error('O ficheiro excede o limite de 200 MB.');
    chunks.push(new Uint8Array(buffer));
    onProgress({ loaded, total: loaded });
  }
  if (!loaded) throw new Error('O Audius devolveu um ficheiro vazio.');
  if (Number.isFinite(length) && length > 0 && loaded !== length) {
    throw new Error('A transferência do Audius ficou incompleta. A faixa não foi adicionada.');
  }
  if (mime === 'application/octet-stream') {
    const prefix = new TextDecoder().decode(chunks[0]?.subarray(0, 12) || new Uint8Array());
    const isKnownAudio = prefix.startsWith('ID3') || prefix.startsWith('OggS') || prefix.startsWith('fLaC')
      || prefix.startsWith('RIFF') || prefix.startsWith('\u001aE\xdf\xa3')
      || (chunks[0]?.[0] === 0xff && (chunks[0]?.[1] ?? 0) >= 0xe0);
    if (!isKnownAudio) throw new Error('O Audius devolveu um ficheiro não reconhecido como áudio. A faixa não foi adicionada.');
  }
  const audioMime = mime === 'application/octet-stream' ? 'audio/mpeg' : mime;
  const extension = mime.includes('ogg') ? 'ogg' : mime.includes('flac') ? 'flac' : mime.includes('wav') ? 'wav' : mime.includes('mp4') ? 'm4a' : 'mp3';
  const safeName = [...`${track.artist} - ${track.title}`].map(char => /[<>:"/\\|?*]/.test(char) || char.charCodeAt(0) < 32 ? '_' : char).join('').slice(0, 180);
  const blob = new Blob(chunks as BlobPart[], { type: audioMime });
  chunks.length = 0;
  if (!blob.size || blob.size !== loaded) throw new Error('A transferência do Audius não foi concluída correctamente. A faixa não foi adicionada.');
  const file = new File([blob], `${safeName}.${extension}`, { type: audioMime });
  const digest = await crypto.subtle.digest('SHA-256', await file.arrayBuffer());
  const id = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
  const result = await importAudio(file);
  if (result === 'duplicate') return { result, trackId: id, size: file.size };
  let artwork: string | undefined;
  if (track.artwork) {
    try {
      const coverResponse = await fetch(track.artwork, { signal, mode: 'cors', credentials: 'omit' });
      if (coverResponse.ok) artwork = await imageData(new File([await coverResponse.blob()], 'cover', { type: coverResponse.headers.get('content-type')?.split(';')[0] || 'image/jpeg' }));
    } catch { /* O áudio já está importado; a capa é opcional. */ }
  }
  const existing = await db.tracks.get(id);
  await db.tracks.update(id, {
    title: track.title, artist: track.artist, album: track.album || '',
    ...(artwork ? { artwork } : {}), musicbrainzId: undefined, releaseId: undefined,
    sourceName: 'Audius', sourceUrl: track.permalink, licenseUrl: track.licenseUrl, licenseName: track.license,
    metadataSources: { ...existing?.metadataSources, title: 'online', artist: 'online', album: 'online', ...(artwork ? { artwork: 'online' as const } : {}) },
  });
  return { result, artwork, trackId: id, size: file.size };
}
