export interface Track {
  id: string;
  title: string;
  artist: string;
  album: string;
  fileName: string;
  mime: string;
  size: number;
  addedAt: number;
  duration?: number;
  artwork?: string;
  genre?: string;
  year?: number;
  metadataSources?: Partial<Record<MetadataField, 'file' | 'online' | 'manual'>>;
  musicbrainzId?: string;
  releaseId?: string;
  jamendoId?: string;
  sourceName?: string;
  sourceUrl?: string;
  licenseUrl?: string;
  licenseName?: string;
}

export const metadataFields = ['title', 'artist', 'album', 'genre', 'year', 'duration', 'artwork'] as const;
export type MetadataField = typeof metadataFields[number];
export type TrackMetadata = Partial<Pick<Track, MetadataField>>;
export interface CatalogResult {
  id: string;
  releaseId?: string;
  title: string;
  artist: string;
  album?: string;
  year?: number;
  duration?: number;
  genre?: string;
  disambiguation?: string;
}
export interface CatalogCache {
  key: string;
  results?: CatalogResult[];
  artwork?: string;
  artworkSize?: number;
  artworkMissing?: boolean;
  savedAt: number;
}

export interface Playlist { id: string; name: string; trackIds: string[]; }
export interface HistoryEntry { id: string; playedAt: number; }
export interface LyricsRecord {
  id: number; trackName: string; artistName: string;
  plainLyrics: string | null; syncedLyrics: string | null; instrumental: boolean;
}

export const MAX_FILE_BYTES = 200 * 1024 * 1024;
export const AUDIO_ACCEPT =
  "audio/*,.mp3,.m4a,.aac,.wav,.flac,.ogg,.opus,.aiff,.aif,.webm";

export function validateAudio(file: File): void {
  if (
    !file.type.startsWith("audio/") &&
    !/\.(mp3|m4a|aac|wav|flac|ogg|opus|aiff?|webm)$/i.test(file.name)
  ) {
    throw new Error("Formato de áudio não reconhecido.");
  }
  if (!file.size) throw new Error("O ficheiro está vazio.");
  if (file.size > MAX_FILE_BYTES)
    throw new Error("O limite por ficheiro é 200 MB.");
}

export function formatTime(value: number): string {
  if (!Number.isFinite(value) || value < 0) return "0:00";
  return `${Math.floor(value / 60)}:${String(Math.floor(value % 60)).padStart(2, "0")}`;
}

export function formatBytes(bytes: number): string {
  return bytes >= 1024 ** 3
    ? `${(bytes / 1024 ** 3).toFixed(1)} GB`
    : `${(bytes / 1024 ** 2).toFixed(1)} MB`;
}

export function errorMessage(error: unknown): string {
  const name = error instanceof Error ? error.name : "";
  if (name === "QuotaExceededError")
    return "Armazenamento cheio. Exporta e remove músicas para libertar espaço.";
  if (name === "OpenFailedError" || name === "SecurityError")
    return "Não foi possível abrir o armazenamento. Permite os dados deste site e evita a navegação privada.";
  return error instanceof Error
    ? error.message
    : "Ocorreu um erro. Tenta novamente.";
}
