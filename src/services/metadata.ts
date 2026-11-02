import { metadataFields, type Track, type TrackMetadata } from '../domain/music';
import { imageData } from './artwork';

export async function readEmbeddedMetadata(blob: Blob): Promise<TrackMetadata> {
  const { parseBlob, selectCover } = await import('music-metadata');
  const { common, format } = await parseBlob(blob, { duration: true });
  const result: TrackMetadata = {};
  for (const key of ['title', 'artist', 'album'] as const) {
    if (common[key]?.trim()) result[key] = common[key].trim().slice(0, 200);
  }
  if (common.genre?.length) result.genre = common.genre.join(', ').slice(0, 200);
  if (common.year && Number.isInteger(common.year) && common.year > 0 && common.year <= 9999) result.year = common.year;
  if (format.duration && Number.isFinite(format.duration) && format.duration > 0) result.duration = format.duration;
  const picture = selectCover(common.picture);
  if (picture && ['image/jpeg', 'image/png', 'image/webp'].includes(picture.format)) {
    try {
      result.artwork = await imageData(new File([new Uint8Array(picture.data)], 'cover', { type: picture.format }));
    } catch { /* Unreadable artwork must not prevent importing the audio or other tags. */ }
  }
  return result;
}

// Older versions did not record provenance: preserve their meaningful edits.
export function metadataSources(track: Track): NonNullable<Track['metadataSources']> {
  if (track.metadataSources) return { ...track.metadataSources };
  const sources: NonNullable<Track['metadataSources']> = {};
  for (const key of metadataFields) {
    if (key === 'duration') continue;
    if (key === 'title' && track.title === track.fileName.replace(/\.[^.]+$/, '')) continue;
    if (key === 'artist' && track.artist === 'Artista desconhecido') continue;
    if (track[key]) sources[key] = 'manual';
  }
  return sources;
}

export function mergeMetadata(track: Track, incoming: TrackMetadata, source: 'file' | 'online', replaceManual = false): Track {
  const sources = metadataSources(track);
  const changes: TrackMetadata = {};
  for (const key of metadataFields) {
    const value = incoming[key];
    if (value === undefined || value === '') continue;
    if (sources[key] === 'manual' && !replaceManual) continue;
    // File tags take precedence over online suggestions, even after confirmation.
    if (source === 'online' && sources[key] === 'file') continue;
    Object.assign(changes, { [key]: value });
    sources[key] = source;
  }
  return { ...track, ...changes, metadataSources: sources };
}
