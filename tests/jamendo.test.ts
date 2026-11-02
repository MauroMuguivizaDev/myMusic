import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const { importAudio, updateTrack } = vi.hoisted(() => ({ importAudio: vi.fn(), updateTrack: vi.fn() }));
vi.mock('../src/services/library', () => ({ importAudio, db: { tracks: { get: vi.fn(async () => ({ metadataSources: {} })), update: updateTrack } } }));
vi.mock('../src/services/artwork', () => ({ imageData: vi.fn(async () => 'data:image/jpeg;base64,YQ==') }));
let jamendo: typeof import('../src/services/jamendo');
beforeEach(async () => { vi.resetModules(); vi.stubEnv('VITE_JAMENDO_CLIENT_ID', 'test-client'); importAudio.mockReset().mockResolvedValue('added'); updateTrack.mockReset().mockResolvedValue(1); jamendo = await import('../src/services/jamendo'); });
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

it('pesquisa Jamendo e mapeia resultados com permissão de download/licença', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => Response.json({ results: [{ id: '12', name: 'Faixa', artist_name: 'Artista', audiodownload_allowed: true, audiodownload: 'https://prod-1.storage.jamendo.com/download/track/12/mp32/', license_ccurl: 'https://creativecommons.org/licenses/by/4.0/' }] })));
  const tracks = await jamendo.searchJamendo('Faixa', new AbortController().signal);
  expect(tracks[0]).toMatchObject({ id: '12', audiodownload_allowed: true, license_ccurl: expect.stringContaining('creativecommons') });
});

it('não descarrega faixas sem autorização explícita', async () => {
  await expect(jamendo.downloadJamendoTrack({ id: '12', name: 'Faixa', artist_name: 'Artista', audiodownload: 'https://prod-1.storage.jamendo.com/download/track/12/mp32/' }, new AbortController().signal, vi.fn())).rejects.toThrow('não está autorizada');
  expect(importAudio).not.toHaveBeenCalled();
});

it('só importa após download completo e guarda metadados/licença na faixa', async () => {
  const payload = new Uint8Array([1, 2, 3, 4]);
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => String(input).includes('usercontent') ? new Response(new Blob(['cover'], { type: 'image/jpeg' }), { headers: { 'content-type': 'image/jpeg' } }) : new Response(payload, { headers: { 'content-type': 'text/html', 'content-length': '4' } })));
  const progress = vi.fn();
  const outcome = await jamendo.downloadJamendoTrack({ id: '12', name: 'Faixa', artist_name: 'Artista', album_name: 'Álbum', image: 'https://usercontent.jamendo.com/cover', audiodownload_allowed: true, audiodownload: 'https://prod-1.storage.jamendo.com/download/track/12/mp32/', license_ccurl: 'https://creativecommons.org/licenses/by/4.0/', shareurl: 'https://www.jamendo.com/track/12' }, new AbortController().signal, progress);
  expect(outcome.result).toBe('added');
  expect(importAudio).toHaveBeenCalledOnce();
  expect(importAudio.mock.calls[0]?.[0]).toMatchObject({ type: 'audio/mpeg', size: 4 });
  expect(updateTrack).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ title: 'Faixa', artist: 'Artista', album: 'Álbum', sourceName: 'Jamendo', licenseUrl: expect.stringContaining('creativecommons') }));
  expect(progress).toHaveBeenCalled();
});
