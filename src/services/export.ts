import { strToU8, zip, unzipSync, strFromU8 } from "fflate";
import { db, getAudio } from "./library";
import type { Track } from "../domain/music";

export function downloadBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  document.body.append(link);
  link.click();
  link.remove();
  // Give Safari time to consume the URL before releasing it.
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

export async function exportTrack(track: Track) {
  const blob = await getAudio(track.id);
  const file = new File([blob], track.fileName, { type: track.mime });
  if (navigator.share && navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: track.title });
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError")
        throw error;
      downloadBlob(blob, track.fileName);
    }
  } else downloadBlob(blob, track.fileName);
}

export async function exportBackup() {
  // Snapshot metadata + blobs together; do not race imports/removals in another tab.
  const { tracks, files, playlists, favorites, history } = await db.transaction(
    "r",
    db.tracks,
    db.files,
    db.playlists,
    db.favorites,
    db.history,
    async () => {
      const tracks = await db.tracks.toArray();
      if (
        tracks.reduce((sum, track) => sum + track.size, 0) >
        300 * 1024 ** 2
      ) {
        throw new Error(
          "O backup ZIP está limitado a 300 MB nesta versão. Exporta as músicas individualmente.",
        );
      }
      return { tracks, files: await db.files.toArray(), playlists: await db.playlists.toArray(), favorites: await db.favorites.toArray(), history: await db.history.toArray() };
    },
  );
  const entries: Record<string, Uint8Array> = {
    "library.json": strToU8(JSON.stringify({ version: 2, tracks, playlists, favorites, history }, null, 2)),
  };
  for (const file of files) {
    const track = tracks.find((track) => track.id === file.id);
    if (track)
      entries[`audio/${track.id}/${track.fileName.replace(/[/\\]/g, "_")}`] =
        new Uint8Array(await file.blob.arrayBuffer());
  }
  const bytes = await new Promise<Uint8Array<ArrayBuffer>>(
    (resolve, reject) => {
      zip(entries, { level: 0 }, (error, data) =>
        error ? reject(error) : resolve(new Uint8Array(data)),
      );
    },
  );
  downloadBlob(
    new Blob([bytes], { type: "application/zip" }),
    "my-music-backup.zip",
  );
}

export async function restoreBackup(file: File, mode: "merge" | "replace") {
  if (file.size > 700 * 1024 ** 2) throw new Error("O backup excede o limite de 700 MB.");
  let entries: Record<string, Uint8Array>;
  try { entries = unzipSync(new Uint8Array(await file.arrayBuffer())); }
  catch { throw new Error("O ficheiro não é um backup ZIP válido."); }
  const manifestBytes = entries["library.json"];
  if (!manifestBytes) throw new Error("Backup incompatível: falta library.json.");
  let manifest: { version?: unknown; tracks?: unknown; playlists?: unknown; favorites?: unknown; history?: unknown };
  try { manifest = JSON.parse(strFromU8(manifestBytes)); }
  catch { throw new Error("O manifesto do backup está inválido."); }
  if (manifest?.version !== 2 || !Array.isArray(manifest.tracks) || !Array.isArray(manifest.playlists) || !Array.isArray(manifest.favorites) || !Array.isArray(manifest.history)) throw new Error("Formato de backup incompatível.");
  const rawTracks = manifest.tracks as unknown[];
  if (rawTracks.length > 10000 || rawTracks.some((value) => { if (!value || typeof value !== "object") return true; const t = value as Record<string, unknown>; return typeof t.id !== "string" || !/^[a-f\d]{64}$/i.test(t.id) || typeof t.fileName !== "string" || typeof t.mime !== "string" || typeof t.size !== "number" || !Number.isFinite(t.size) || t.size <= 0; })) throw new Error("O backup contém metadados de música inválidos.");
  const tracks = rawTracks as Track[];
  if (new Set(tracks.map(t => t.id)).size !== tracks.length) throw new Error("O backup contém músicas duplicadas.");
  const files = tracks.map(track => {
    const path = Object.keys(entries).find(key => key.startsWith(`audio/${track.id}/`));
    const bytes = path ? entries[path] : undefined;
    if (!bytes || bytes.byteLength !== track.size) throw new Error(`Áudio ausente ou incompleto: ${track.fileName}`);
    return { id: track.id, blob: new Blob([new Uint8Array(bytes).buffer as ArrayBuffer], { type: track.mime }) };
  });
  if (!globalThis.crypto?.subtle) throw new Error("A verificação de integridade requer HTTPS neste navegador.");
  for (const item of files) {
    const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", await item.blob.arrayBuffer()));
    const actualId = Array.from(digest, byte => byte.toString(16).padStart(2, "0")).join("");
    if (actualId !== item.id) throw new Error("A integridade do áudio não corresponde ao identificador da música.");
  }
  const playlists = manifest.playlists as unknown[]; const favorites = manifest.favorites as unknown[]; const history = manifest.history as unknown[];
  if (playlists.some(value => { if (!value || typeof value !== "object") return true; const p = value as Record<string, unknown>; return typeof p.id !== "string" || typeof p.name !== "string" || !Array.isArray(p.trackIds); }) || favorites.some(value => !value || typeof value !== "object" || typeof (value as Record<string, unknown>).id !== "string") || history.some(value => { if (!value || typeof value !== "object") return true; const item = value as Record<string, unknown>; return typeof item.id !== "string" || typeof item.playedAt !== "number" || !Number.isFinite(item.playedAt); })) throw new Error("O backup contém dados de playlists, favoritos ou histórico inválidos.");
  await db.transaction("rw", db.tracks, db.files, db.playlists, db.favorites, db.history, async () => {
    if (mode === "replace") { await db.tracks.clear(); await db.files.clear(); await db.playlists.clear(); await db.favorites.clear(); await db.history.clear(); }
    for (let i = 0; i < tracks.length; i++) {
      const track = tracks[i]!;
      if (mode === "merge" && await db.tracks.get(track.id)) continue;
      await db.tracks.put(track); await db.files.put(files[i]!);
    }
    for (const playlist of playlists as import("../domain/music").Playlist[]) if (mode === "replace" || !(await db.playlists.get(playlist.id))) await db.playlists.put(playlist);
    for (const favorite of favorites as { id: string }[]) await db.favorites.put(favorite);
    for (const item of history as import("../domain/music").HistoryEntry[]) await db.history.put(item);
  });
  return { tracks: tracks.length, playlists: manifest.playlists.length };
}
