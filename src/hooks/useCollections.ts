import { useEffect, useState } from 'react';
import { liveQuery } from 'dexie';
import { db } from '../services/library';
import type { Playlist, HistoryEntry } from '../domain/music';
export function useCollections(onError: (message: string) => void) {
  const [data, setData] = useState<{ playlists: Playlist[]; favorites: string[]; history: HistoryEntry[] }>({ playlists: [], favorites: [], history: [] });
  useEffect(() => {
    const subscription = liveQuery(async () => ({
      playlists: await db.playlists.toArray(),
      favorites: (await db.favorites.toArray()).map(f => f.id),
      history: await db.history.orderBy('playedAt').reverse().toArray(),
    })).subscribe({ next: setData, error: () => onError('Não foi possível abrir as coleções.') });
    return () => subscription.unsubscribe();
  }, [onError]);
  return data;
}
