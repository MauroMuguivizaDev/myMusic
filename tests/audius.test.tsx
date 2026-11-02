import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { db, getAudio } from '../src/services/library';
import type { AudiusTrack } from '../src/services/audius';
import { AudiusResults } from '../src/components/AudiusResults';

let audius: typeof import('../src/services/audius');
const track: AudiusTrack = {
  id: 'R0zAg', title: 'Extinction - Frost', artist: 'ParoBeats',
  permalink: 'https://audius.co/ParoBeats/extinction-frost',
  license: 'Attribution Share Alike CC BY-SA',
  licenseUrl: 'https://creativecommons.org/licenses/by-sa/4.0/',
  is_downloadable: true, is_download_gated: false,
};
const audioBytes = new Uint8Array([0x49, 0x44, 0x33, 0x04, 0, 0, 0, 0, 0, 0, 1, 2, 3]);

beforeEach(async () => {
  await db.open();
  await db.transaction('rw', db.tracks, db.files, async () => { await db.tracks.clear(); await db.files.clear(); });
  audius = await import('../src/services/audius');
});

afterEach(async () => {
  vi.unstubAllGlobals();
  await db.transaction('rw', db.tracks, db.files, async () => { await db.tracks.clear(); await db.files.clear(); });
});

it('segue o endpoint de download Audius, importa o áudio e permite recuperá-lo offline', async () => {
  const fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    expect(String(input)).toBe('https://api.audius.co/v1/tracks/R0zAg/download');
    expect(init?.redirect).toBe('follow');
    return new Response(audioBytes, { headers: { 'content-type': 'audio/mpeg', 'content-length': String(audioBytes.length) } });
  });
  vi.stubGlobal('fetch', fetcher);
  const progress = vi.fn();
  const result = await audius.downloadAudiusTrack(track, new AbortController().signal, progress);
  const saved = await db.tracks.toArray();
  expect(result.result).toBe('added');
  expect(saved).toHaveLength(1);
  expect(saved[0]).toMatchObject({ title: track.title, artist: track.artist, sourceName: 'Audius', sourceUrl: track.permalink, licenseUrl: track.licenseUrl });
  expect(new Uint8Array(await (await getAudio(saved[0]!.id)).arrayBuffer())).toEqual(audioBytes);
  expect(progress).toHaveBeenCalled();
});

it('não abre o permalink nem importa uma resposta HTML', async () => {
  const fetcher = vi.fn(async () => new Response('<html>Moved to Audius</html>', { headers: { 'content-type': 'text/html' } }));
  vi.stubGlobal('fetch', fetcher);
  await expect(audius.downloadAudiusTrack(track, new AbortController().signal, vi.fn())).rejects.toThrow('não devolveu um ficheiro de áudio');
  expect(String(fetcher.mock.calls[0]?.[0])).toBe('https://api.audius.co/v1/tracks/R0zAg/download');
  expect(await db.tracks.count()).toBe(0);
  expect(await db.files.count()).toBe(0);
});

it('mantém Descarregar dentro da aplicação e reserva o link externo para Ouvir no Audius', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => new Response(audioBytes, { headers: { 'content-type': 'audio/mpeg' } })));
  render(<AudiusResults results={[track]} />);
  expect(screen.getByRole('link', { name: /Ouvir no Audius/i }).getAttribute('href')).toBe(track.permalink);
  fireEvent.click(screen.getByRole('button', { name: 'Descarregar' }));
  await waitFor(() => expect(screen.getByRole('status').textContent).toContain('Importada para a biblioteca'));
  expect(String(vi.mocked(fetch).mock.calls[0]?.[0])).toBe('https://api.audius.co/v1/tracks/R0zAg/download');
  expect(await db.tracks.count()).toBe(1);
});

it('cancela a leitura do áudio antes da importação e não guarda ficheiros parciais', async () => {
  const stream = new ReadableStream<Uint8Array>({ start(controller) { controller.enqueue(audioBytes); } });
  vi.stubGlobal('fetch', vi.fn(async () => new Response(stream, { headers: { 'content-type': 'audio/mpeg' } })));
  const controller = new AbortController();
  await expect(audius.downloadAudiusTrack(track, controller.signal, () => controller.abort())).rejects.toMatchObject({ name: 'AbortError' });
  expect(await db.tracks.count()).toBe(0);
  expect(await db.files.count()).toBe(0);
});

it.skipIf(process.env.RUN_AUDIUS_INTEGRATION !== '1')('transfere uma faixa autorizada real e deixa o Blob reproduzível offline na IndexedDB', async () => {
  const realTrack: AudiusTrack = {
    id: 'R0zAg', title: 'Extinction - Frost (epische orchestrale Musik | CC BY-SA 3.0)', artist: 'Trackistador',
    permalink: 'https://audius.co/ParoBeats/extinction-frost-epische-orchestrale-musik-|-cc-by-sa-30',
    license: 'Attribution ShareAlike CC BY-SA', licenseUrl: 'https://creativecommons.org/licenses/by-sa/4.0/',
    is_downloadable: true, is_download_gated: false,
  };
  const progress = vi.fn();
  const result = await audius.downloadAudiusTrack(realTrack, new AbortController().signal, progress);
  const saved = await db.tracks.toArray();
  expect(result.result).toBe('added');
  expect(saved).toHaveLength(1);
  const offlineAudio = await getAudio(saved[0]!.id);
  expect(offlineAudio.type).toBe('audio/mpeg');
  expect(offlineAudio.size).toBeGreaterThan(100_000);
  expect([...new Uint8Array(await offlineAudio.slice(0, 3).arrayBuffer())]).toEqual([0x49, 0x44, 0x33]);
  expect(progress).toHaveBeenCalled();
}, 120_000);
