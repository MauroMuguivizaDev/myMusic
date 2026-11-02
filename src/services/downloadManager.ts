import { downloadAudiusTrack, type AudiusTrack } from './audius';
import { downloadJamendoTrack, type JamendoTrack } from './jamendo';
import { errorMessage } from '../domain/music';

export type DownloadSource = 'Audius' | 'Jamendo';
export type DownloadState = 'downloading' | 'completed' | 'failed' | 'cancelled' | 'interrupted';
export type DownloadTrack = AudiusTrack | JamendoTrack;

export interface DownloadEntry {
  id: string;
  source: DownloadSource;
  sourceTrackId: string;
  title: string;
  artist: string;
  track: DownloadTrack;
  state: DownloadState;
  loaded: number;
  total?: number;
  message?: string;
  libraryTrackId?: string;
  createdAt: number;
  updatedAt: number;
}

const HISTORY_KEY = 'my-music-download-history-v1';
const MAX_HISTORY = 50;
const listeners = new Set<() => void>();
const controllers = new Map<string, AbortController>();
const lastProgressSave = new Map<string, number>();

function readHistory(): DownloadEntry[] {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((entry): entry is DownloadEntry => !!entry && typeof entry === 'object'
      && typeof entry.id === 'string' && typeof entry.source === 'string'
      && typeof entry.sourceTrackId === 'string' && typeof entry.title === 'string'
      && typeof entry.artist === 'string' && (entry.source === 'Audius' || entry.source === 'Jamendo')
      && !!entry.track && typeof entry.track === 'object'
      && ['downloading', 'completed', 'failed', 'cancelled', 'interrupted'].includes(entry.state));
  } catch { return []; }
}

function recoverInterrupted(entries: DownloadEntry[]): DownloadEntry[] {
  let changed = false;
  const recovered = entries.map(entry => {
    if (entry.state !== 'downloading') return entry;
    changed = true;
    return { ...entry, state: 'interrupted' as const, message: 'A aplicação foi fechada durante o download.', updatedAt: Date.now() };
  });
  if (changed) persist(recovered);
  return recovered;
}

function persist(entries: DownloadEntry[]) {
  try { localStorage.setItem(HISTORY_KEY, JSON.stringify(entries.slice(0, MAX_HISTORY))); }
  catch { /* O gestor continua activo nesta sessão se o armazenamento local estiver indisponível. */ }
}

let snapshot = recoverInterrupted(readHistory());

function publish(next: DownloadEntry[], persistNow = true) {
  snapshot = [...next].sort((a, b) => b.updatedAt - a.updatedAt).slice(0, MAX_HISTORY);
  if (persistNow) persist(snapshot);
  listeners.forEach(listener => listener());
}

function patch(id: string, updates: Partial<DownloadEntry>, persistNow = true) {
  publish(snapshot.map(entry => entry.id === id ? { ...entry, ...updates, updatedAt: Date.now() } : entry), persistNow);
}

export function getDownloadSnapshot(): DownloadEntry[] { return snapshot; }
export function subscribeDownloads(listener: () => void) { listeners.add(listener); return () => listeners.delete(listener); }

function getTrackInfo(source: DownloadSource, track: DownloadTrack) {
  return source === 'Audius'
    ? { id: (track as AudiusTrack).id, title: (track as AudiusTrack).title, artist: (track as AudiusTrack).artist }
    : { id: (track as JamendoTrack).id, title: (track as JamendoTrack).name, artist: (track as JamendoTrack).artist_name };
}

export function startDownload(source: DownloadSource, track: DownloadTrack): string {
  const info = getTrackInfo(source, track);
  const id = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const now = Date.now();
  const entry: DownloadEntry = { ...info, id, source, sourceTrackId: info.id, track, state: 'downloading', loaded: 0, createdAt: now, updatedAt: now };
  publish([entry, ...snapshot]);
  void execute(entry);
  return id;
}

async function execute(entry: DownloadEntry) {
  const controller = new AbortController();
  controllers.set(entry.id, controller);
  try {
    const progress = (value: { loaded: number; total?: number }) => {
      const now = Date.now();
      const shouldPersist = now - (lastProgressSave.get(entry.id) ?? 0) >= 500;
      if (shouldPersist) lastProgressSave.set(entry.id, now);
      patch(entry.id, { loaded: value.loaded, total: value.total }, shouldPersist);
    };
    const result = entry.source === 'Audius'
      ? await downloadAudiusTrack(entry.track as AudiusTrack, controller.signal, progress)
      : await downloadJamendoTrack(entry.track as JamendoTrack, controller.signal, progress);
    patch(entry.id, { state: 'completed', loaded: result.size ?? entry.loaded, total: result.size ?? entry.total, libraryTrackId: result.trackId, message: 'Importada para a biblioteca.' });
  } catch (error) {
    const cancelled = controller.signal.aborted || (error instanceof Error && error.name === 'AbortError');
    patch(entry.id, { state: cancelled ? 'cancelled' : 'failed', message: cancelled ? 'Cancelado pelo utilizador.' : errorMessage(error) });
  } finally {
    controllers.delete(entry.id);
    lastProgressSave.delete(entry.id);
  }
}

export function cancelDownload(id: string) { controllers.get(id)?.abort(); }

export function retryDownload(id: string) {
  const entry = snapshot.find(item => item.id === id);
  if (!entry || !['failed', 'cancelled', 'interrupted'].includes(entry.state)) return;
  patch(id, { state: 'downloading', loaded: 0, total: undefined, message: undefined, libraryTrackId: undefined });
  const retryEntry = snapshot.find(item => item.id === id);
  if (retryEntry) void execute(retryEntry);
}

export function clearDownloadHistory() {
  publish(snapshot.filter(entry => entry.state === 'downloading'));
}

