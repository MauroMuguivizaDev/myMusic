import Dexie from 'dexie';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { readEmbeddedMetadata, mergeMetadata, metadataSources } from '../src/services/metadata';
import { MusicDatabase, getAudio, importAudio } from '../src/services/library';
import type { Track } from '../src/domain/music';
import { imageData } from '../src/services/artwork';
import { taggedAudioFixture } from '../e2e/fixtures';
import { selectTracks } from '../src/domain/playback';

vi.mock('../src/services/artwork', () => ({ imageData: vi.fn(async () => 'data:image/jpeg;base64,Y292ZXI=') }));
let database: MusicDatabase;
beforeEach(() => { database = new MusicDatabase(`metadata-${crypto.randomUUID()}`); });
afterEach(async () => { await database.delete(); vi.clearAllMocks(); });

it.each(['mp3','m4a','flac','wav'] as const)('lê tags reais e capa de um contentor %s sem alterar os bytes', async format => {
  const bytes = taggedAudioFixture(format);
  const file = new File([bytes], `filename.${format}`, { type: {mp3:'audio/mpeg',m4a:'audio/mp4',flac:'audio/flac',wav:'audio/wav'}[format] });
  const metadata = await readEmbeddedMetadata(file);
  expect(metadata).toMatchObject({ title:'Título incorporado',artist:'Artista incorporado',album:'Álbum incorporado',genre:'Jazz',year:2024,artwork:'data:image/jpeg;base64,Y292ZXI=' });
  expect(metadata.duration).toBeGreaterThan(0);
  expect(imageData).toHaveBeenCalledWith(expect.objectContaining({ type:'image/png' }));
  await importAudio(file, database);
  const track = (await database.tracks.toArray())[0];
  expect(track.metadataSources?.title).toBe('file');
  expect(track.artwork).toBe(metadata.artwork);
  expect(new Uint8Array(await (await getAudio(track.id,database)).arrayBuffer())).toEqual(new Uint8Array(bytes));
});

it('mantém importação e fallback quando o ficheiro não permite ler tags', async () => {
  await importAudio(new File(['untagged fixture'],'Original.mp3'),database);
  expect((await database.tracks.toArray())[0]).toMatchObject({ title:'Original',artist:'Artista desconhecido',album:'' });
});

const track: Track = { id:'track', title:'filename',artist:'Artista desconhecido',album:'',fileName:'filename.mp3',size:10,mime:'audio/mpeg',addedAt:1,metadataSources:{} };
it('prioriza tags sobre dados online e exige confirmação para substituir edições manuais', () => {
  const embedded = mergeMetadata(track,{title:'Real',album:'File album'},'file');
  const online = mergeMetadata(embedded,{title:'Online',artist:'Artist',album:'Other',year:2024},'online');
  expect(online).toMatchObject({title:'Real',album:'File album',artist:'Artist',year:2024});
  const manual: Track = {...online,title:'Manual',artwork:undefined,metadataSources:{...online.metadataSources,title:'manual',artwork:'manual'}};
  expect(mergeMetadata(manual,{title:'File',artwork:'embedded'},'file')).toMatchObject({title:'Manual',artwork:undefined});
  expect(mergeMetadata(manual,{title:'File',artwork:'embedded'},'file',true)).toMatchObject({title:'File',artwork:'embedded'});
  expect(mergeMetadata(manual,{title:'Confirmed'},'online',true).title).toBe('Confirmed');
});

it('preserva edições antigas sem proveniência e pesquisa também álbum, género e ano', () => {
  const legacy: Track = {...track,title:'Edited',artist:'Artist',album:'Album',artwork:'local',metadataSources:undefined,genre:'Jazz',year:2024};
  expect(metadataSources(legacy)).toMatchObject({title:'manual',artist:'manual',album:'manual',artwork:'manual'});
  expect(mergeMetadata(legacy,{title:'Embedded',artwork:'replacement'},'file').title).toBe('Edited');
  for (const query of ['Album','Jazz','2024']) expect(selectTracks([legacy],query,'addedAt')).toHaveLength(1);
});

it('migra a V2 preservando ficheiros, coleções e letras', async () => {
  const name = `migration-v2-${crypto.randomUUID()}`;
  const old = new Dexie(name);
  old.version(2).stores({tracks:'id, title, artist, addedAt',files:'id',playlists:'id, name',favorites:'id',history:'id, playedAt',lyrics:'key'});
  await old.table('tracks').put(track);
  await old.table('files').put({id:track.id,blob:new Blob(['original'])});
  await old.table('playlists').put({id:'playlist',name:'Playlist',trackIds:[track.id]});
  await old.table('favorites').put({id:track.id});
  await old.table('history').put({id:track.id,playedAt:123});
  await old.table('lyrics').put({key:'lyrics',records:[{plainLyrics:'Saved lyrics'}]});
  old.close();
  const upgraded = new MusicDatabase(name);
  try {
    expect(await upgraded.tracks.get(track.id)).toEqual(track);
    expect(await (await getAudio(track.id,upgraded)).text()).toBe('original');
    expect((await upgraded.playlists.get('playlist'))?.trackIds).toEqual([track.id]);
    expect(await upgraded.favorites.count()).toBe(1);
    expect((await upgraded.history.get(track.id))?.playedAt).toBe(123);
    expect((await upgraded.lyrics.get('lyrics'))?.records[0].plainLyrics).toBe('Saved lyrics');
    expect(await upgraded.catalogCache.count()).toBe(0);
  } finally { await upgraded.delete(); }
});
