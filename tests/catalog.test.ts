import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { MusicDatabase } from '../src/services/library';
import { fixtureCover } from '../e2e/fixtures';

vi.mock('../src/services/artwork', () => ({ imageData: vi.fn(async () => 'data:image/jpeg;base64,Y2FjaGU=') }));
const recordingId = '11111111-1111-4111-8111-111111111111';
const releaseId = '22222222-2222-4222-8222-222222222222';
const response = {recordings:[{id:recordingId,title:'Song',length:123000,'artist-credit':[{name:'Artist',joinphrase:' feat. '},{artist:{name:'Guest'}}],releases:[{id:releaseId,title:'Album',date:'2024-01-01',country:'MZ'},{id:'33333333-3333-4333-8333-333333333333',title:'Live album',date:'2025'}]}]};
let database: MusicDatabase;
let catalog: typeof import('../src/services/catalog');
beforeEach(async () => {
  vi.resetModules(); localStorage.clear();
  database = new MusicDatabase(`catalog-${crypto.randomUUID()}`);
  catalog = await import('../src/services/catalog');
  vi.spyOn(navigator,'onLine','get').mockReturnValue(true);
});
afterEach(async () => { vi.useRealTimers(); await database.delete(); vi.restoreAllMocks(); vi.unstubAllGlobals(); localStorage.clear(); });
const signal = () => new AbortController().signal;

it('mantém lançamentos ambíguos separados e ignora IDs ou respostas inválidas', () => {
  expect(catalog.catalogResults(response)).toMatchObject([{artist:'Artist feat. Guest',album:'Album',year:2024,duration:123},{album:'Live album',year:2025}]);
  expect(catalog.catalogResults({recordings:[{id:'https://unsafe',title:'Invalid'}]})).toEqual([]);
  expect(() => catalog.catalogResults({error:'bad'})).toThrow('inválida');
});

it('guarda resultados e capas para uso offline sem consultar a rede', async () => {
  const fetcher = vi.fn().mockResolvedValueOnce(new Response(JSON.stringify(response),{headers:{'Content-Type':'application/json'}}))
    .mockResolvedValueOnce(new Response(fixtureCover,{headers:{'Content-Type':'image/png'}}));
  vi.stubGlobal('fetch',fetcher);
  const found = await catalog.searchCatalog('Song Artist',signal(),database);
  expect(found.cached).toBe(false);
  const artwork = await catalog.catalogArtwork(releaseId,signal(),database);
  expect(artwork).toContain('data:image/jpeg');
  expect(fetcher.mock.calls[1][0]).toContain('/front-1200');
  expect((await database.catalogCache.get(`artwork:${releaseId}`))?.artworkSize).toBe(1200);
  vi.spyOn(navigator,'onLine','get').mockReturnValue(false);
  expect((await catalog.searchCatalog('Song Artist',signal(),database)).cached).toBe(true);
  expect(await catalog.catalogArtwork(releaseId,signal(),database)).toBe(artwork);
  await expect(catalog.searchCatalog('Uncached',signal(),database)).rejects.toThrow('Internet');
  expect(fetcher).toHaveBeenCalledTimes(2);
});

it('memoriza temporariamente a ausência de capa para não repetir pedidos', async () => {
  const fetcher = vi.fn().mockResolvedValue(new Response('',{status:404}));
  vi.stubGlobal('fetch',fetcher);
  await expect(catalog.catalogArtwork(releaseId,signal(),database)).resolves.toBeUndefined();
  await expect(catalog.catalogArtwork(releaseId,signal(),database)).resolves.toBeUndefined();
  expect(fetcher).toHaveBeenCalledTimes(1);
  expect((await database.catalogCache.get(`artwork:${releaseId}`))?.artworkMissing).toBe(true);
});

it('atualiza a miniatura antiga para alta resolução e conserva o cache antigo offline', async () => {
  await database.catalogCache.put({ key:`artwork:${releaseId}`, artwork:'data:image/jpeg;base64,b2xk', savedAt:Date.now() });
  const fetcher = vi.fn().mockResolvedValue(new Response(fixtureCover,{headers:{'Content-Type':'image/png'}}));
  vi.stubGlobal('fetch',fetcher);
  await expect(catalog.catalogArtwork(releaseId,signal(),database)).resolves.toContain('data:image/jpeg');
  expect((await database.catalogCache.get(`artwork:${releaseId}`))?.artworkSize).toBe(1200);
  vi.spyOn(navigator,'onLine','get').mockReturnValue(false);
  await database.catalogCache.put({ key:`artwork:${releaseId}`, artwork:'data:image/jpeg;base64,b2xk', savedAt:Date.now() });
  await expect(catalog.catalogArtwork(releaseId,signal(),database)).resolves.toBe('data:image/jpeg;base64,b2xk');
});

it('não guarda respostas que não são imagens como capas', async () => {
  vi.stubGlobal('fetch',vi.fn().mockResolvedValue(new Response('{"error":"invalid"}',{headers:{'Content-Type':'application/json'}})));
  await expect(catalog.catalogArtwork(releaseId,signal(),database)).resolves.toBeUndefined();
  expect((await database.catalogCache.get(`artwork:${releaseId}`))?.artworkMissing).toBe(true);
});

it('não inventa correspondências ou capas quando o catálogo não as tem', async () => {
  vi.stubGlobal('fetch',vi.fn().mockResolvedValueOnce(new Response('{"recordings":[]}'))
    .mockResolvedValueOnce(new Response('',{status:404})));
  expect((await catalog.searchCatalog('Unknown',signal(),database)).results).toEqual([]);
  expect(await catalog.catalogArtwork(releaseId,signal(),database)).toBeUndefined();
  expect((await database.catalogCache.get(`artwork:${releaseId}`))?.artworkMissing).toBe(true);
});

it('respeita o intervalo entre pedidos e o Retry-After sem repetir automaticamente', async () => {
  await database.open();
  const times: number[] = [];
  vi.stubGlobal('fetch',vi.fn(async () => { times.push(Date.now()); return new Response(JSON.stringify(response)); }));
  await catalog.searchCatalog('First',signal(),database);
  await catalog.searchCatalog('Second',signal(),database);
  expect(times[1]-times[0]).toBeGreaterThanOrEqual(1100);
  vi.stubGlobal('fetch',vi.fn(async () => new Response('',{status:503,headers:{'Retry-After':'20'}})));
  await expect(catalog.searchCatalog('Limited',signal(),database)).rejects.toThrow('temporariamente indisponível');
  expect(Number(localStorage.getItem('my-music-catalog-next'))).toBeGreaterThanOrEqual(times[1]+20000);
}, 15000);

it('serializa pesquisas concorrentes e liberta a fila depois de falhas de rede', async () => {
  let active = 0; let peak = 0;
  const fetcher = vi.fn(async () => {
    active++; peak = Math.max(peak, active);
    await new Promise(resolve => setTimeout(resolve, 5));
    active--;
    return new Response(JSON.stringify(response));
  });
  vi.stubGlobal('fetch', fetcher);
  await Promise.all([
    catalog.searchCatalog('Concurrent A', signal(), database),
    catalog.searchCatalog('Concurrent B', signal(), database),
  ]);
  expect(peak).toBe(1);
  vi.stubGlobal('fetch', vi.fn().mockRejectedValueOnce(new TypeError('offline')).mockResolvedValueOnce(new Response(JSON.stringify(response))));
  await expect(catalog.searchCatalog('Network failure', signal(), database)).rejects.toThrow('contactar');
  await expect(catalog.searchCatalog('Queue recovered', signal(), database)).resolves.toMatchObject({ cached: false });
});

it('cancela pesquisas abandonadas sem enviar pedidos', async () => {
  const fetcher = vi.fn(); vi.stubGlobal('fetch',fetcher);
  const controller = new AbortController(); controller.abort();
  await expect(catalog.searchCatalog('Song',controller.signal,database)).rejects.toMatchObject({name:'AbortError'});
  expect(fetcher).not.toHaveBeenCalled();
});
