import { db } from './library';
import type { Playlist } from '../domain/music';
export async function savePlaylist(name: string, id: string = crypto.randomUUID(), database = db) {
  const trimmed = name.trim();
  if (!trimmed || trimmed.length > 100) throw new Error('O nome deve ter entre 1 e 100 caracteres.');
  await database.transaction('rw', database.playlists, async () => {
    const old = await database.playlists.get(id);
    await database.playlists.put({ id, name: trimmed, trackIds: old?.trackIds ?? [] });
  });
  return id;
}
export async function playlistTrack(playlistId: string, trackId: string, add: boolean, database = db) {
  await database.transaction('rw', database.playlists, database.tracks, async () => {
    const list = await database.playlists.get(playlistId);
    if (!list) throw new Error('Playlist não encontrada.');
    if (add && !await database.tracks.get(trackId)) throw new Error('Música não encontrada.');
    const trackIds = list.trackIds.filter(id => id !== trackId);
    if (add) trackIds.push(trackId);
    await database.playlists.put({ ...list, trackIds });
  });
}
export async function toggleFavorite(id: string, database = db) {
  await database.transaction('rw', database.favorites, async () => {
    if (await database.favorites.get(id)) await database.favorites.delete(id);
    else await database.favorites.put({ id });
  });
}
export type { Playlist };
