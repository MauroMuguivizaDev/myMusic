import { type CatalogResult } from '../domain/music';
import { db, type MusicDatabase } from './library';
import { imageData } from './artwork';
import { isRelevantMusicResult } from './searchRelevance';

const uuid = /^[a-f\d]{8}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{12}$/i;
const record = (value: unknown): Record<string, unknown> => value && typeof value === 'object' ? value as Record<string, unknown> : {};
const text = (value: unknown) => typeof value === 'string' ? value.trim().slice(0, 300) : '';
const offline = () => navigator.onLine === false;
let queue = Promise.resolve();
let nextRequest = 0;

function check(signal: AbortSignal) {
  if (signal.aborted) throw new DOMException('Cancelado', 'AbortError');
  if (offline()) throw new Error('Sem ligação à Internet.');
}

function wait(milliseconds: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) { reject(new DOMException('Cancelado', 'AbortError')); return; }
    const abort = () => { clearTimeout(timer); reject(new DOMException('Cancelado', 'AbortError')); };
    const timer = setTimeout(() => { signal.removeEventListener('abort', abort); resolve(); }, milliseconds);
    signal.addEventListener('abort', abort, { once: true });
  });
}

async function request(url: string, signal: AbortSignal, accept: string): Promise<Response> {
  check(signal);
  const controller = new AbortController();
  const cancel = () => controller.abort();
  signal.addEventListener('abort', cancel, { once: true });
  let timedOut = false;
  const timer = setTimeout(() => { timedOut = true; cancel(); }, 15000);
  try {
    const response = await fetch(url, { signal: controller.signal, headers: { Accept: accept } });
    // Read bodies while the timeout and cancellation are still active.
    const blob = await response.blob();
    return new Response(blob, { status: response.status, headers: response.headers });
  } catch {
    if (signal.aborted) throw new DOMException('Cancelado', 'AbortError');
    if (timedOut) throw new Error('O catálogo demorou demasiado a responder. Tenta novamente.');
    throw new Error('Não foi possível contactar o catálogo. Tenta novamente.');
  } finally { clearTimeout(timer); signal.removeEventListener('abort', cancel); }
}

async function musicbrainz(path: string, signal: AbortSignal): Promise<unknown> {
  const execute = async () => {
    check(signal);
    try { nextRequest = Math.max(nextRequest, Number(localStorage.getItem('my-music-catalog-next')) || 0); } catch { /* Storage may be blocked. */ }
    await wait(Math.max(0, nextRequest - Date.now()), signal);
    check(signal);
    const remember = (time: number) => {
      nextRequest = time;
      try { localStorage.setItem('my-music-catalog-next', String(time)); } catch { /* In-memory throttling remains active. */ }
    };
    remember(Date.now() + 1100);
    let response = await request(`https://musicbrainz.org/ws/2/${path}`, signal, 'application/json');
    if (response.status === 429 || response.status === 503) {
      const retry = response.headers.get('Retry-After');
      const retryAt = retry && /^\d+$/.test(retry) ? Date.now() + Number(retry) * 1000 : retry ? Date.parse(retry) : 0;
      const delay = Math.max(response.status === 429 ? 1000 : 0, retryAt - Date.now());
      if (delay > 0) remember(Date.now() + delay);
      if (response.status === 429 && delay > 0 && delay <= 30000) {
        await wait(delay, signal);
        check(signal);
        response = await request(`https://musicbrainz.org/ws/2/${path}`, signal, 'application/json');
      }
      if (response.status === 429) throw new Error('MusicBrainz limitou os pedidos. Aguarda um pouco e tenta novamente.');
      if (response.status === 503) throw new Error('MusicBrainz está temporariamente indisponível. Tenta novamente mais tarde.');
    }
    if (!response.ok) throw new Error('O catálogo está indisponível. Tenta novamente.');
    return response.json().catch(() => { throw new Error('O catálogo devolveu uma resposta inválida.'); }) as Promise<unknown>;
  };
  // Web Locks coordinate tabs where available; the queue also supports older Safari.
  const task = queue.then(() => navigator.locks?.request
    ? navigator.locks.request('my-music-musicbrainz', { signal }, execute) : execute());
  queue = task.then(() => {}, () => {});
  return task;
}

export function catalogResults(data: unknown): CatalogResult[] {
  const recordings = record(data).recordings;
  if (!Array.isArray(recordings)) throw new Error('O catálogo devolveu uma resposta inválida.');
  const results: CatalogResult[] = [];
  for (const raw of recordings) {
    const item = record(raw);
    const id = text(item.id);
    const title = text(item.title);
    if (!uuid.test(id) || !title) continue;
    const credits = item['artist-credit'];
    const artist = Array.isArray(credits) ? credits.map(value => {
      const credit = record(value);
      return (text(credit.name) || text(record(credit.artist).name)) + (typeof credit.joinphrase === 'string' ? credit.joinphrase : '');
    }).join('') : '';
    const releases = Array.isArray(item.releases) && item.releases.length ? item.releases : [{}];
    for (const value of releases) {
      const release = record(value);
      const date = text(release.date) || text(item['first-release-date']);
      const year = /^\d{4}/.test(date) ? Number(date.slice(0, 4)) : undefined;
      const result: CatalogResult = {
        id, title, artist,
        releaseId: uuid.test(text(release.id)) ? text(release.id) : undefined,
        album: text(release.title) || undefined,
        year: year && year > 0 ? year : undefined,
        duration: typeof item.length === 'number' && Number.isFinite(item.length) && item.length > 0 ? item.length / 1000 : undefined,
        disambiguation: [text(item.disambiguation), text(release.disambiguation), text(release.country), date].filter(Boolean).join(' · ') || undefined,
      };
      if (!results.some(previous => previous.id === id && previous.releaseId === result.releaseId)) results.push(result);
      if (results.length === 12) return results;
    }
  }
  return results;
}

export async function searchCatalog(query: string, signal: AbortSignal, database: MusicDatabase = db): Promise<{ results: CatalogResult[]; cached: boolean }> {
  const normalized = query.trim().slice(0, 200);
  if (!normalized) throw new Error('Escreve uma música ou um artista.');
  const key = `search:${normalized.toLocaleLowerCase()}`;
  const saved = await database.catalogCache.get(key);
  if (saved?.results && (offline() || Date.now() - saved.savedAt < 7 * 86400000)) return { results: saved.results.filter(item => isRelevantMusicResult(normalized, item.title, item.artist)), cached: true };
  check(signal);
  try {
    // Treat input as words, not as arbitrary Lucene query syntax.
    const words = normalized.replace(/[+\-&|!(){}[\]^"~*?:\\/]/g, ' ').trim();
    if (!words) return { results: [], cached: false };
    const params = new URLSearchParams({ query: words, fmt: 'json', limit: '8' });
    const catalog = catalogResults(await musicbrainz(`recording?${params}`, signal));
    const results = catalog.filter(item => isRelevantMusicResult(normalized, item.title, item.artist));
    if (catalog.length) await database.catalogCache.put({ key, results: catalog, savedAt: Date.now() });
    return { results, cached: false };
  } catch (error) {
    if (!signal.aborted && saved?.results) return { results: saved.results.filter(item => isRelevantMusicResult(normalized, item.title, item.artist)), cached: true };
    throw error;
  }
}

export async function catalogDetails(result: CatalogResult, signal: AbortSignal, database: MusicDatabase = db): Promise<CatalogResult> {
  const key = `details:${result.id}`;
  const saved = await database.catalogCache.get(key);
  if (saved?.results?.[0]) return { ...result, genre: saved.results[0].genre };
  if (offline()) return result;
  const data = record(await musicbrainz(`recording/${result.id}?inc=genres&fmt=json`, signal));
  const genres = Array.isArray(data.genres) ? data.genres.map(item => text(record(item).name)).filter(Boolean) : [];
  const details = { ...result, genre: genres.length ? genres.join(', ').slice(0, 200) : undefined };
  await database.catalogCache.put({ key, results: [details], savedAt: Date.now() });
  return details;
}

export async function catalogArtwork(releaseId: string, signal: AbortSignal, database: MusicDatabase = db): Promise<string | undefined> {
  if (!uuid.test(releaseId)) return;
  const key = `artwork:${releaseId}`;
  const saved = await database.catalogCache.get(key);
  if (saved?.artwork && saved.artworkSize === 1200) return saved.artwork;
  if (saved?.artworkMissing && Date.now() - saved.savedAt < 86400000) return;
  if (offline()) return saved?.artwork;
  const rememberMissing = async () => {
    await database.catalogCache.put({ key, artworkMissing: true, savedAt: Date.now() });
    return undefined;
  };
  let response: Response;
  try { response = await request(`https://coverartarchive.org/release/${releaseId}/front-1200`, signal, 'image/*'); }
  catch (error) { if (signal.aborted) throw error; if (saved?.artwork) return saved.artwork; throw error; }
  if (response.status === 404) return saved?.artwork ?? rememberMissing();
  if (!response.ok) { if (saved?.artwork) return saved.artwork; throw new Error('Capa indisponível.'); }
  const blob = await response.blob();
  const type = (response.headers.get('content-type') || blob.type).split(';')[0].trim().toLowerCase();
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(type) || !blob.size || blob.size > 8 * 1024 * 1024) return saved?.artwork ?? rememberMissing();
  let artwork: string;
  try { artwork = await imageData(new File([blob], 'cover', { type }), { minimumDimension: 250, requireSquare: true }); }
  catch (error) {
    if (signal.aborted) throw error;
    return saved?.artwork ?? rememberMissing();
  }
  await database.catalogCache.put({ key, artwork, artworkSize: 1200, savedAt: Date.now() });
  return artwork;
}
