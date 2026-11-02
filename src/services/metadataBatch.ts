import type { CatalogResult, Track } from '../domain/music';
import { db } from './library';
import { catalogArtwork, catalogDetails, searchCatalog } from './catalog';
import { mergeMetadata, metadataSources } from './metadata';

export interface BatchProgress { index: number; total: number; track: Track; }
export interface BatchSummary { updated: number; unchanged: number; notFound: number; failed: number; }
const normalize = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
export function confidentMatch(track: Track, candidate: { title: string; artist: string }) {
  const title = normalize(track.title); const foundTitle = normalize(candidate.title);
  const artist = normalize(track.artist); const foundArtist = normalize(candidate.artist);
  const titleMatch = title === foundTitle || (title.length > 5 && (title.includes(foundTitle) || foundTitle.includes(title)));
  const artistMatch = artist === foundArtist || (artist.length > 3 && (artist.includes(foundArtist) || foundArtist.includes(artist)));
  return !!titleMatch && !!artistMatch;
}
export function selectConfidentArtworkCandidate(track: Track, candidates: CatalogResult[]): CatalogResult | undefined {
  const title = normalize(track.title);
  const artist = normalize(track.artist);
  const album = normalize(track.album);
  if (!title || !artist) return;
  const exact = candidates.filter(candidate => candidate.releaseId
    && normalize(candidate.title) === title
    && normalize(candidate.artist) === artist
    && (!album || normalize(candidate.album ?? '') === album));
  const releases = new Set(exact.map(candidate => candidate.releaseId));
  // Without an album tag, only use cover art if MusicBrainz identifies one release unambiguously.
  if (releases.size !== 1) return;
  return exact[0];
}
export function canAutomaticallyFillArtwork(track: Track): boolean {
  return !track.artwork && !['file', 'manual'].includes(metadataSources(track).artwork ?? '');
}
export async function updateLibraryMetadata(tracks: Track[], signal: AbortSignal, onProgress: (progress: BatchProgress) => void): Promise<BatchSummary> {
  const summary: BatchSummary = { updated: 0, unchanged: 0, notFound: 0, failed: 0 };
  for (const [index, track] of tracks.entries()) {
    if (signal.aborted) break;
    onProgress({ index: index + 1, total: tracks.length, track });
    try {
      const latest = await db.tracks.get(track.id);
      if (!latest) { summary.failed++; continue; }
      if (latest.musicbrainzId && latest.metadataSources?.title === 'online' && latest.metadataSources?.artist === 'online' && latest.artwork && latest.metadataSources?.artwork === 'online') { summary.unchanged++; continue; }
      const response = await searchCatalog([latest.title, latest.artist].filter(Boolean).join(' '), signal);
      const match = response.results.find(result => confidentMatch(latest, result));
      if (!match) { summary.notFound++; continue; }
      const details = await catalogDetails(match, signal);
      const artworkCandidate = canAutomaticallyFillArtwork(latest) ? selectConfidentArtworkCandidate(latest, response.results) : undefined;
      const artwork = artworkCandidate?.releaseId ? await catalogArtwork(artworkCandidate.releaseId, signal).catch(error => { if (signal.aborted) throw error; return undefined; }) : undefined;
      const merged = mergeMetadata(latest, { title: details.title, artist: details.artist, album: details.album, year: details.year, genre: details.genre, duration: details.duration, artwork }, 'online');
      const updated = merged.title !== latest.title || merged.artist !== latest.artist || merged.album !== latest.album || merged.artwork !== latest.artwork || merged.year !== latest.year || merged.genre !== latest.genre;
      if (updated) { await db.tracks.put({ ...merged, musicbrainzId: match.id, releaseId: match.releaseId }); summary.updated++; }
      else summary.unchanged++;
    } catch (error) {
      if (signal.aborted || (error instanceof DOMException && error.name === 'AbortError')) break;
      summary.failed++;
    }
  }
  return summary;
}
