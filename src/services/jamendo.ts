import { imageData } from './artwork';
import { importAudio, db } from './library';
import { MAX_FILE_BYTES } from '../domain/music';
import { isRelevantMusicResult } from './searchRelevance';

export interface JamendoTrack {
  id: string; name: string; artist_name: string; album_name?: string;
  duration?: number; image?: string; album_image?: string;
  audiodownload?: string; audiodownload_allowed?: boolean;
  license_ccurl?: string; shareurl?: string;
}
export interface DownloadProgress { loaded: number; total?: number; }
const clientId = import.meta.env.VITE_JAMENDO_CLIENT_ID?.trim();

export async function searchJamendo(query: string, signal: AbortSignal): Promise<JamendoTrack[]> {
  if (!clientId) throw new Error('Configura VITE_JAMENDO_CLIENT_ID para pesquisar no Jamendo.');
  if (signal.aborted) throw new DOMException('Cancelado', 'AbortError');
  const params = new URLSearchParams({ client_id: clientId, format: 'json', limit: '20', search: query.trim(), include: 'licenses', audiodlformat: 'mp32' });
  let response: Response;
  try { response = await fetch(`https://api.jamendo.com/v3.0/tracks/?${params}`, { signal, headers: { Accept: 'application/json' } }); }
  catch { if (signal.aborted) throw new DOMException('Cancelado', 'AbortError'); throw new Error('Não foi possível contactar o Jamendo. Verifica a ligação.'); }
  if (!response.ok) throw new Error(`Jamendo respondeu com erro ${response.status}.`);
  const payload: unknown = await response.json();
  if (!payload || typeof payload !== 'object') throw new Error('Resposta inválida do Jamendo.');
  const data = (payload as { results?: unknown }).results;
  if (!Array.isArray(data)) throw new Error('Resposta inválida do Jamendo.');
  return data.filter((item): item is JamendoTrack => !!item && typeof item === 'object' && typeof (item as JamendoTrack).id === 'string' && typeof (item as JamendoTrack).name === 'string' && typeof (item as JamendoTrack).artist_name === 'string')
    .filter(track => isRelevantMusicResult(query, track.name, track.artist_name));
}

export async function downloadJamendoTrack(track: JamendoTrack, signal: AbortSignal, onProgress: (progress: DownloadProgress) => void) {
  if (!track.audiodownload_allowed || !track.audiodownload) throw new Error('Esta faixa não está autorizada para download pelo artista.');
  const source = new URL(track.audiodownload);
  if (source.protocol !== 'https:' || !(source.hostname === 'api.jamendo.com' || source.hostname.endsWith('.storage.jamendo.com'))) throw new Error('URL de download do Jamendo inválido.');
  let response: Response;
  try { response = await fetch(source, { signal, mode: 'cors', credentials: 'omit' }); }
  catch { if (signal.aborted) throw new DOMException('Cancelado', 'AbortError'); throw new Error('Download bloqueado ou indisponível. Verifica a ligação e tenta novamente.'); }
  if (!response.ok) throw new Error(response.status === 404 ? 'Esta faixa já não está disponível para download.' : `Falha ao descarregar a faixa (${response.status}).`);
  const responseMime = response.headers.get('content-type')?.split(';')[0] || '';
  const mime = responseMime.startsWith('audio/') ? responseMime : /\/(?:mp3|mp31|mp32)\/?$/i.test(source.pathname) ? 'audio/mpeg' : /\/(?:ogg)\/?$/i.test(source.pathname) ? 'audio/ogg' : /\/(?:flac)\/?$/i.test(source.pathname) ? 'audio/flac' : '';
  if (!mime) throw new Error('O Jamendo não devolveu um formato de áudio reconhecido.');
  const totalHeader = Number(response.headers.get('content-length'));
  if (totalHeader > MAX_FILE_BYTES) throw new Error('O ficheiro excede o limite de 200 MB.');
  const chunks: Uint8Array[] = []; let loaded = 0;
  if (response.body) {
    const reader = response.body.getReader();
    try {
      while (true) {
        if (signal.aborted) { await reader.cancel(); throw new DOMException('Cancelado', 'AbortError'); }
        const { done, value } = await reader.read(); if (done) break;
        loaded += value.byteLength;
        if (loaded > MAX_FILE_BYTES) { await reader.cancel(); throw new Error('O ficheiro excede o limite de 200 MB.'); }
        chunks.push(value); onProgress({ loaded, total: Number.isFinite(totalHeader) && totalHeader > 0 ? totalHeader : undefined });
      }
    } finally { reader.releaseLock(); }
  } else {
    const buffer = await response.arrayBuffer(); loaded = buffer.byteLength;
    if (loaded > MAX_FILE_BYTES) throw new Error('O ficheiro excede o limite de 200 MB.');
    chunks.push(new Uint8Array(buffer)); onProgress({ loaded, total: loaded });
  }
  if (!loaded) throw new Error('O ficheiro descarregado está vazio.');
  const extension = mime.includes('ogg') ? 'ogg' : mime.includes('flac') ? 'flac' : mime.includes('mp4') ? 'm4a' : 'mp3';
  const safeName = [...`${track.artist_name} - ${track.name}`].map(char => /[<>:"/\\|?*]/.test(char) || char.charCodeAt(0) < 32 ? '_' : char).join('').slice(0, 180);
  const blob = new Blob(chunks as BlobPart[], { type: mime });
  chunks.length = 0;
  const file = new File([blob], `${safeName}.${extension}`, { type: mime });
  const id = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', await file.arrayBuffer())), byte => byte.toString(16).padStart(2, '0')).join('');
  const result = await importAudio(file);
  if (result === 'duplicate') return { result, artwork: undefined, trackId: id, size: file.size };
  let artwork: string | undefined;
  const image = track.album_image || track.image;
  if (image) {
    try {
      const coverResponse = await fetch(image, { signal, mode: 'cors', credentials: 'omit' });
      if (coverResponse.ok) artwork = await imageData(new File([await coverResponse.blob()], 'cover', { type: coverResponse.headers.get('content-type')?.split(';')[0] || 'image/jpeg' }));
    } catch { /* O áudio já está guardado; capa indisponível não invalida o download. */ }
  }
  const existing = await db.tracks.get(id);
  await db.tracks.update(id, {
    title: track.name.slice(0, 200), artist: track.artist_name.slice(0, 200), album: (track.album_name || '').slice(0, 200),
    ...(artwork ? { artwork } : {}), musicbrainzId: undefined, releaseId: undefined,
    jamendoId: track.id, sourceName: 'Jamendo', sourceUrl: track.shareurl, licenseUrl: track.license_ccurl,
    metadataSources: { ...existing?.metadataSources, title: 'online', artist: 'online', album: 'online', ...(artwork ? { artwork: 'online' as const } : {}) },
  });
  return { result, artwork, trackId: id, size: file.size };
}
