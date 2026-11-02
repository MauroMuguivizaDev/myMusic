import Dexie, { type EntityTable } from "dexie";
import { type Track, type Playlist, type HistoryEntry, type LyricsRecord, type CatalogCache, validateAudio } from "../domain/music";
import { mergeMetadata, readEmbeddedMetadata } from './metadata';

export class MusicDatabase extends Dexie {
  tracks!: EntityTable<Track, "id">;
  files!: EntityTable<{ id: string; blob: Blob }, "id">;
  playlists!: EntityTable<Playlist, "id">;
  favorites!: EntityTable<{ id: string }, "id">;
  history!: EntityTable<HistoryEntry, "id">;
  lyrics!: EntityTable<{ key: string; records: LyricsRecord[] }, "key">;
  catalogCache!: EntityTable<CatalogCache, "key">;

  constructor(name = "my-music") {
    super(name);
    this.version(1).stores({
      tracks: "id, title, artist, addedAt",
      files: "id",
    });
    this.version(2).stores({
      tracks: "id, title, artist, addedAt", files: "id",
      playlists: "id, name", favorites: "id", history: "id, playedAt", lyrics: "key",
    });
    this.version(3).stores({ catalogCache: 'key, savedAt' });
  }
}

export const db = new MusicDatabase();

export async function importAudio(
  file: File,
  database = db,
): Promise<"added" | "duplicate"> {
  validateAudio(file);
  if (!globalThis.crypto?.subtle)
    throw new Error(
      "Para importar, abre por HTTPS com um certificado de confiança.",
    );
  const digest = await crypto.subtle.digest(
    "SHA-256",
    await file.arrayBuffer(),
  );
  const id = Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
  // Parse before opening a transaction: decoding must not keep IndexedDB alive.
  const embedded = await readEmbeddedMetadata(file).catch(() => ({}));
  return database.transaction(
    "rw",
    database.tracks,
    database.files,
    async () => {
      if (await database.tracks.get(id)) {
        if (await database.files.get(id)) return "duplicate";
        await database.files.put({ id, blob: file.slice(0, file.size, file.type) });
        return "added";
      }
      await database.files.add({
        id,
        blob: file.slice(0, file.size, file.type),
      });
      await database.tracks.add(mergeMetadata({
        id,
        title: file.name.replace(/\.[^.]+$/, ""),
        artist: "Artista desconhecido",
        album: "",
        fileName: file.name,
        mime: file.type,
        size: file.size,
        addedAt: Date.now(),
        metadataSources: {},
      }, embedded, 'file'));
      return "added";
    },
  );
}

export async function removeTrack(id: string, database = db): Promise<void> {
  await database.transaction(
    "rw",
    database.tracks,
    database.files,
    database.playlists,
    database.favorites,
    database.history,
    async () => {
      await database.tracks.delete(id);
      await database.files.delete(id);
      await database.favorites.delete(id);
      await database.history.delete(id);
      await database.playlists.toCollection().modify((playlist) => {
        playlist.trackIds = playlist.trackIds.filter((trackId) => trackId !== id);
      });
    },
  );
}

export async function getAudio(id: string, database = db): Promise<Blob> {
  const file = await database.files.get(id);
  if (!file)
    throw new Error(
      "O ficheiro desta música não está disponível. Importa-o novamente.",
    );
  return file.blob;
}

export async function getStoredAudioSizes(database = db): Promise<Map<string, number>> {
  const sizes = new Map<string, number>();
  await database.files.toCollection().each(file => {
    if (file.blob && Number.isFinite(file.blob.size)) sizes.set(file.id, file.blob.size);
  });
  return sizes;
}
