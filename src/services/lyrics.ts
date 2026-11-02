import type { LyricsRecord } from '../domain/music';
import { db } from './library';
export interface LyricLine { time: number; text: string; }
export function parseLrc(lrc: string): LyricLine[] {
  const lines: LyricLine[] = [];
  const offset = Number(lrc.match(/\[offset:([+-]?\d+)\]/i)?.[1] ?? 0) / 1000;
  for (const line of lrc.split(/\r?\n/)) {
    const stamps = [...line.matchAll(/\[(\d+):(\d{2}(?:\.\d+)?)\]/g)];
    const text = line.replace(/\[[^\]]*\]/g, '').trim();
    for (const match of stamps) lines.push({ time: Math.max(0, Number(match[1]) * 60 + Number(match[2]) + offset), text });
  }
  return lines.sort((a, b) => a.time - b.time);
}
export function activeLine(lines: LyricLine[], position: number) {
  return lines.findLastIndex(line => line.time <= position);
}
function isRecord(value: unknown): value is LyricsRecord {
  if (!value || typeof value !== 'object') return false;
  const v = value as Partial<LyricsRecord>;
  return typeof v.id === 'number' && typeof v.trackName === 'string' && typeof v.artistName === 'string'
    && (v.plainLyrics === null || typeof v.plainLyrics === 'string')
    && (v.syncedLyrics === null || typeof v.syncedLyrics === 'string') && typeof v.instrumental === 'boolean';
}
export async function searchLyrics(title: string, artist: string, signal: AbortSignal, database = db): Promise<{ records: LyricsRecord[]; cached: boolean }> {
  if (!title.trim() || !artist.trim()) throw new Error('Preenche o título e o artista para pesquisar.');
  const key = JSON.stringify([title.trim().toLocaleLowerCase(), artist.trim().toLocaleLowerCase()]);
  const saved = await database.lyrics.get(key);
  if (saved) return { records: saved.records, cached: true };
  const params = new URLSearchParams({ track_name: title.trim(), artist_name: artist.trim() });
  const response = await fetch(`https://lrclib.net/api/search?${params}`, { signal, headers: { Accept: 'application/json' } });
  if (!response.ok) throw new Error(`LRCLIB indisponível (${response.status}). Tenta novamente.`);
  const data: unknown = await response.json();
  if (!Array.isArray(data) || !data.every(isRecord)) throw new Error('A resposta da LRCLIB não é válida.');
  // Do not permanently cache a negative search: the catalogue may gain lyrics later.
  if (data.length) await database.lyrics.put({ key, records: data });
  return { records: data, cached: false };
}
