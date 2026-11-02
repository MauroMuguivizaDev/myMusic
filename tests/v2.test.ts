import Dexie from 'dexie';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { MusicDatabase, importAudio, removeTrack } from '../src/services/library';
import { playlistTrack, savePlaylist, toggleFavorite } from '../src/services/collections';
import { activeLine, parseLrc, searchLyrics } from '../src/services/lyrics';
import { initialPlayback, nextId, readPlayback, selectTracks, shuffled, readLibrarySortPreference, writeLibrarySortPreference } from '../src/domain/playback';
import type { Track } from '../src/domain/music';
let database: MusicDatabase;
beforeEach(() => { database = new MusicDatabase(`v2-${crypto.randomUUID()}`); });
afterEach(async () => { await database.delete(); vi.restoreAllMocks(); vi.unstubAllGlobals(); localStorage.clear(); });
it('migra uma biblioteca V1 preservando os metadados e os bytes', async () => {
  const name = `migration-${crypto.randomUUID()}`;
  const old = new Dexie(name);
  old.version(1).stores({ tracks: 'id, title, artist, addedAt', files: 'id' });
  await old.table('tracks').put({ id: 'old', title: 'Original', artist: 'Artist', addedAt: 1 });
  await old.table('files').put({ id: 'old', blob: new Blob(['original']) });
  old.close();
  const upgraded = new MusicDatabase(name);
  try {
    expect((await upgraded.tracks.get('old'))?.title).toBe('Original');
    expect(await (await upgraded.files.get('old'))?.blob.text()).toBe('original');
    expect(await upgraded.playlists.count()).toBe(0);
  } finally { await upgraded.delete(); }
});
it('cria e renomeia playlist, evita duplicados e remove referências ao eliminar música', async () => {
  await importAudio(new File(['audio'], 'Original.mp3'), database);
  const track = (await database.tracks.toArray())[0];
  const id = await savePlaylist('Viagem', undefined, database);
  await playlistTrack(id, track.id, true, database);
  await playlistTrack(id, track.id, true, database);
  await savePlaylist('Viagem longa', id, database);
  expect(await database.playlists.get(id)).toMatchObject({ name: 'Viagem longa', trackIds: [track.id] });
  await playlistTrack(id, track.id, false, database);
  expect((await database.playlists.get(id))?.trackIds).toEqual([]);
  await playlistTrack(id, track.id, true, database);
  await toggleFavorite(track.id, database);
  await database.history.put({ id: track.id, playedAt: 1 });
  await removeTrack(track.id, database);
  expect((await database.playlists.get(id))?.trackIds).toEqual([]);
  expect(await database.favorites.count()).toBe(0);
  expect(await database.history.count()).toBe(0);
  await database.playlists.delete(id);
  expect(await database.playlists.count()).toBe(0);
});
it('reverte a eliminação inteira se falhar a remoção do Blob', async () => {
  await importAudio(new File(['audio'], 'Atomic.mp3'), database);
  const track = (await database.tracks.toArray())[0];
  const playlistId = await savePlaylist('Manter', undefined, database);
  await playlistTrack(playlistId, track.id, true, database);
  await toggleFavorite(track.id, database);
  await database.history.put({ id: track.id, playedAt: 1 });
  vi.spyOn(database.files, 'delete').mockRejectedValue(new Error('IndexedDB indisponível'));
  await expect(removeTrack(track.id, database)).rejects.toThrow('IndexedDB indisponível');
  expect(await database.tracks.get(track.id)).toBeTruthy();
  expect(await database.files.get(track.id)).toBeTruthy();
  expect(await database.favorites.get(track.id)).toBeTruthy();
  expect(await database.history.get(track.id)).toBeTruthy();
  expect((await database.playlists.get(playlistId))?.trackIds).toEqual([track.id]);
});
it('valida nomes, playlists ausentes e alterna favoritos', async () => {
  await expect(savePlaylist('   ', undefined, database)).rejects.toThrow('nome');
  await expect(playlistTrack('missing','track',true,database)).rejects.toThrow('Playlist');
  await toggleFavorite('track', database); await toggleFavorite('track', database);
  expect(await database.favorites.count()).toBe(0);
});
it('respeita os modos de repetição e mantém todas as faixas no shuffle', () => {
  expect(nextId(['a','b'], 'b', 1, 'off')).toBeUndefined();
  expect(nextId(['a','b'], 'b', 1, 'all')).toBe('a');
  expect(nextId(['a','b'], 'a', -1, 'all')).toBe('b');
  expect(nextId(['a','b'], 'a', 1, 'one', true)).toBe('a');
  expect(nextId(['a','b'], 'a', 1, 'one')).toBe('b');
  expect(nextId([], null, 1, 'all')).toBeUndefined();
  const ids = shuffled(['a','b','c'], 'b');
  expect(ids[0]).toBe('b'); expect(new Set(ids)).toEqual(new Set(['a','b','c']));
});
it('trata persistência inválida e limita valores restaurados', () => {
  localStorage.setItem('my-music-player-v2', '{broken'); expect(readPlayback()).toEqual(initialPlayback);
  localStorage.setItem('my-music-player-v2', JSON.stringify({ queue: ['a',1,'a'], rate: 100, volume: -1, repeat: 'bad' }));
  expect(readPlayback()).toMatchObject({ queue: ['a'], rate: 2, volume: 0, repeat: 'off' });
});
it('pesquisa e ordena sem alterar o catálogo original', async () => {
  await importAudio(new File(['a'], 'Zulu.mp3'), database);
  await importAudio(new File(['b'], 'Alpha.mp3'), database);
  const tracks = await database.tracks.toArray();
  await database.tracks.update(tracks[0].id, { artist: 'B', duration: 20, addedAt: 1 });
  await database.tracks.update(tracks[1].id, { artist: 'A', duration: 10, addedAt: 2 });
  const items = await database.tracks.toArray();
  expect(selectTracks(items, '', 'title').map(t => t.title)).toEqual(['Alpha','Zulu']);
  expect(selectTracks(items, '', 'artist')[0].artist).toBe('A');
  expect(selectTracks(items, '', 'duration')[0].duration).toBe(10);
  expect(selectTracks(items, '', 'addedAt')[0].addedAt).toBe(2);
  expect(selectTracks(items, 'zulu', 'title')).toHaveLength(1);
});
it('pesquisa título, artista e álbum por termos parciais sem distinguir caixa ou acentos', () => {
  const tracks = [
    { id: '1', title: 'Coração Aberto', artist: 'João Silva', album: 'Noite Azul', addedAt: 1 },
    { id: '2', title: 'Outro Caminho', artist: 'Maria Costa', album: 'Verão', addedAt: 2 },
  ] as Track[];
  const libraryFields = ['title', 'artist', 'album'] as const;
  expect(selectTracks(tracks, 'coracao', 'addedAt', [...libraryFields]).map(track => track.id)).toEqual(['1']);
  expect(selectTracks(tracks, 'JOAO sil', 'addedAt', [...libraryFields]).map(track => track.id)).toEqual(['1']);
  expect(selectTracks(tracks, 'noite AZ', 'addedAt', [...libraryFields]).map(track => track.id)).toEqual(['1']);
  expect(selectTracks(tracks, 'ver', 'addedAt', [...libraryFields]).map(track => track.id)).toEqual(['2']);
  expect(selectTracks(tracks, 'sem correspondencia', 'addedAt', [...libraryFields])).toEqual([]);
  expect(selectTracks(tracks, '', 'addedAt', [...libraryFields])).toHaveLength(2);
});
it('ordena por título, artista, álbum, género e data, com direção e valores ausentes estáveis', () => {
  const tracks = [
    { id: 'a', title: 'Éclair', artist: 'Zoe', album: 'Álbum B', genre: 'Pop', addedAt: 20 },
    { id: 'b', title: 'banana', artist: 'Álvaro', album: 'album A', genre: 'Jazz', addedAt: 10 },
    { id: 'c', title: 'Cedar', artist: '', album: '', genre: undefined, addedAt: 30 },
  ] as Track[];
  expect(selectTracks(tracks, '', 'title').map(track => track.id)).toEqual(['b', 'c', 'a']);
  expect(selectTracks(tracks, '', 'title', undefined, 'desc').map(track => track.id)).toEqual(['a', 'c', 'b']);
  expect(selectTracks(tracks, '', 'artist').map(track => track.id)).toEqual(['b', 'a', 'c']);
  expect(selectTracks(tracks, '', 'album').map(track => track.id)).toEqual(['b', 'a', 'c']);
  expect(selectTracks(tracks, '', 'genre').map(track => track.id)).toEqual(['b', 'a', 'c']);
  expect(selectTracks(tracks, '', 'addedAt', undefined, 'asc').map(track => track.id)).toEqual(['b', 'a', 'c']);
  expect(selectTracks(tracks, '', 'addedAt', undefined, 'desc').map(track => track.id)).toEqual(['c', 'a', 'b']);
});
it('combina pesquisa e ordenação e persiste a preferência de ordenação', () => {
  const tracks = [
    { id: 'a', title: 'Tema um', artist: 'Artista', album: 'Zeta', addedAt: 1 },
    { id: 'b', title: 'Tema dois', artist: 'Artista', album: 'Alfa', addedAt: 2 },
  ] as Track[];
  expect(selectTracks(tracks, 'tema', 'album', ['title', 'artist', 'album']).map(track => track.id)).toEqual(['b', 'a']);
  writeLibrarySortPreference({ field: 'album', direction: 'desc' });
  expect(readLibrarySortPreference()).toEqual({ field: 'album', direction: 'desc' });
});
it('interpreta LRC com múltiplas marcas, offset e linha atual', () => {
  const lines = parseLrc('[offset:500]\n[00:01.50][00:04.00]line\n[00:03]other\n[ar:artist]');
  expect(lines.map(l => l.time)).toEqual([2,3.5,4.5]);
  expect(activeLine(lines, 1)).toBe(-1); expect(activeLine(lines, 4)).toBe(1);
});
it('guarda resultados reais em cache e permite voltar a lê-los sem rede', async () => {
  const record = { id: 1, trackName: 'Title', artistName: 'Artist', plainLyrics: 'fixture from mocked API', syncedLyrics: null, instrumental: false };
  const fetcher = vi.fn().mockResolvedValue({ ok: true, json: async () => [record] });
  vi.stubGlobal('fetch', fetcher);
  const signal = new AbortController().signal;
  expect((await searchLyrics('Title','Artist',signal,database)).cached).toBe(false);
  fetcher.mockRejectedValue(new TypeError('offline'));
  expect((await searchLyrics(' title ','ARTIST',signal,database))).toEqual({ records: [record], cached: true });
  expect(fetcher).toHaveBeenCalledOnce();
});
it('distingue ausência de resultados, erro HTTP, resposta inválida e falha de rede', async () => {
  const fetcher = vi.fn().mockResolvedValue({ ok: true, json: async () => [] }); vi.stubGlobal('fetch',fetcher);
  const signal = new AbortController().signal;
  expect((await searchLyrics('a','b',signal,database)).records).toEqual([]);
  fetcher.mockResolvedValueOnce({ ok: false, status: 503 });
  await expect(searchLyrics('a','b',signal,database)).rejects.toThrow('503');
  fetcher.mockResolvedValueOnce({ ok: true, json: async () => [{}] });
  await expect(searchLyrics('a','b',signal,database)).rejects.toThrow('válida');
  fetcher.mockRejectedValueOnce(new TypeError('offline'));
  await expect(searchLyrics('a','b',signal,database)).rejects.toThrow('offline');
});

it('repara um Blob ausente ao reimportar o original sem perder playlists', async () => {
  const original = new File(['repair-me'], 'Original.mp3');
  await importAudio(original, database);
  const track = (await database.tracks.toArray())[0];
  const id = await savePlaylist('Preservar', undefined, database);
  await playlistTrack(id, track.id, true, database);
  await database.files.delete(track.id);
  expect(await importAudio(original, database)).toBe('added');
  expect(await (await database.files.get(track.id))?.blob.text()).toBe('repair-me');
  expect((await database.playlists.get(id))?.trackIds).toEqual([track.id]);
  expect(await database.tracks.count()).toBe(1);
});
