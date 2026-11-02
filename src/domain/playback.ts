import type { Track } from './music';
export type RepeatMode = 'off' | 'all' | 'one';
export interface PlaybackState {
  queue: string[]; currentId: string | null; position: number;
  volume: number; rate: number; shuffle: boolean; repeat: RepeatMode;
}
export const initialPlayback: PlaybackState = { queue: [], currentId: null, position: 0, volume: 1, rate: 1, shuffle: false, repeat: 'off' };
export function readPlayback(): PlaybackState {
  try {
    const value: unknown = JSON.parse(localStorage.getItem('my-music-player-v2') || 'null');
    if (!value || typeof value !== 'object') return { ...initialPlayback };
    const s = value as Partial<PlaybackState>;
    return {
      queue: Array.isArray(s.queue) ? [...new Set(s.queue.filter((id): id is string => typeof id === 'string'))] : [],
      currentId: typeof s.currentId === 'string' ? s.currentId : null,
      position: typeof s.position === 'number' && Number.isFinite(s.position) ? Math.max(0, s.position) : 0,
      volume: typeof s.volume === 'number' && Number.isFinite(s.volume) ? Math.max(0, Math.min(1, s.volume)) : 1,
      rate: typeof s.rate === 'number' && Number.isFinite(s.rate) ? Math.max(.5, Math.min(2, s.rate)) : 1,
      shuffle: s.shuffle === true,
      repeat: s.repeat === 'all' || s.repeat === 'one' ? s.repeat : 'off',
    };
  } catch { return { ...initialPlayback }; }
}
export function nextId(queue: string[], currentId: string | null, direction: number, repeat: RepeatMode, ended = false): string | undefined {
  if (ended && repeat === 'one' && currentId && queue.includes(currentId)) return currentId;
  const index = queue.indexOf(currentId ?? '');
  const next = index + direction;
  if (next >= 0 && next < queue.length) return queue[next];
  if (repeat === 'all' && queue.length) return queue[(next + queue.length) % queue.length];
}
export function shuffled(ids: string[], first?: string): string[] {
  const rest = ids.filter(id => id !== first);
  for (let i = rest.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [rest[i], rest[j]] = [rest[j], rest[i]];
  }
  return first && ids.includes(first) ? [first, ...rest] : rest;
}
export type SortOrder = 'title' | 'artist' | 'album' | 'genre' | 'addedAt' | 'duration';
export type SortDirection = 'asc' | 'desc';
export interface LibrarySortPreference { field: SortOrder; direction: SortDirection; }
export const defaultLibrarySort: LibrarySortPreference = { field: 'addedAt', direction: 'desc' };
const librarySortKey = 'my-music-library-sort-v1';

export function readLibrarySortPreference(): LibrarySortPreference {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(librarySortKey) || 'null');
    if (!value || typeof value !== 'object') return { ...defaultLibrarySort };
    const preference = value as Partial<LibrarySortPreference>;
    const field = ['title', 'artist', 'album', 'genre', 'addedAt', 'duration'].includes(preference.field ?? '')
      ? preference.field as SortOrder : defaultLibrarySort.field;
    const direction = preference.direction === 'asc' || preference.direction === 'desc'
      ? preference.direction : field === 'addedAt' ? 'desc' : 'asc';
    return { field, direction };
  } catch { return { ...defaultLibrarySort }; }
}

export function writeLibrarySortPreference(preference: LibrarySortPreference): void {
  try { localStorage.setItem(librarySortKey, JSON.stringify(preference)); } catch { /* Preference remains active until reload. */ }
}
export type TrackSearchField = 'title' | 'artist' | 'album' | 'genre' | 'year';

function normalizeSearchText(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase();
}

export function selectTracks(
  tracks: Track[],
  query: string,
  sort: SortOrder,
  fields: TrackSearchField[] = ['title', 'artist', 'album', 'genre', 'year'],
  direction: SortDirection = sort === 'addedAt' ? 'desc' : 'asc',
): Track[] {
  const terms = normalizeSearchText(query).trim().split(/\s+/).filter(Boolean);
  const matched = tracks.filter(track => {
    if (!terms.length) return true;
    const searchable = normalizeSearchText(fields.map(field => track[field] ?? '').join(' '));
    return terms.every(term => searchable.includes(term));
  });
  const collator = new Intl.Collator(undefined, { sensitivity: 'base', numeric: true });
  return matched.map((track, index) => ({ track, index })).sort((left, right) => {
    const a = left.track;
    const b = right.track;
    let comparison = 0;
    if (sort === 'addedAt') comparison = a.addedAt - b.addedAt;
    else if (sort === 'duration') {
      if (a.duration == null && b.duration != null) return 1;
      if (b.duration == null && a.duration != null) return -1;
      comparison = (a.duration ?? 0) - (b.duration ?? 0);
    }
    else {
      const aValue = normalizeSearchText(a[sort] ?? '').trim();
      const bValue = normalizeSearchText(b[sort] ?? '').trim();
      if (!aValue || !bValue) {
        if (aValue !== bValue) return aValue ? -1 : 1;
      }
      else comparison = collator.compare(aValue, bValue);
    }
    if (comparison !== 0) return comparison * (direction === 'asc' ? 1 : -1);
    return left.index - right.index;
  }).map(item => item.track);
}
