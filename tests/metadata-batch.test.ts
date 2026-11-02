import { expect, it } from 'vitest';
import { confidentMatch, selectConfidentArtworkCandidate, canAutomaticallyFillArtwork } from '../src/services/metadataBatch';
import { mergeMetadata } from '../src/services/metadata';
import type { Track } from '../src/domain/music';

const track: Track = { id: 'a', title: 'Música Exemplo', artist: 'Artista Exemplo', album: '', fileName: 'audio.mp3', mime: 'audio/mpeg', size: 4, addedAt: 0, metadataSources: { title: 'manual', artist: 'manual' } };
it('aceita correspondência de título e artista e rejeita candidatos duvidosos', () => {
  expect(confidentMatch(track, { title: 'Musica Exemplo', artist: 'Artista Exemplo' })).toBe(true);
  expect(confidentMatch(track, { title: 'Música Exemplo', artist: 'Outra pessoa' })).toBe(false);
});
it('preserva título e artista alterados manualmente ao aplicar resultados online', () => {
  expect(mergeMetadata(track, { title: 'Outro título', artist: 'Outro artista', album: 'Álbum', artwork: 'data:image/jpeg;base64,x' }, 'online')).toMatchObject({ title: 'Música Exemplo', artist: 'Artista Exemplo', album: 'Álbum', artwork: 'data:image/jpeg;base64,x' });
});
it('só associa capas a correspondências exactas de título, artista e álbum', () => {
  const song: Track = { ...track, title: 'Canção', artist: 'Artista', album: 'Álbum certo' };
  const candidates = [
    { id: 'wrong-artist', title: 'Canção', artist: 'Artista Novo', album: 'Álbum certo', releaseId: '11111111-1111-4111-8111-111111111111' },
    { id: 'wrong-album', title: 'Canção', artist: 'Artista', album: 'Outro álbum', releaseId: '22222222-2222-4222-8222-222222222222' },
    { id: 'right', title: 'Canção', artist: 'Artista', album: 'Álbum certo', releaseId: '33333333-3333-4333-8333-333333333333' },
  ];
  expect(selectConfidentArtworkCandidate(song, candidates)?.id).toBe('right');
  expect(selectConfidentArtworkCandidate({ ...song, album: '' }, candidates)).toBeUndefined();
  expect(selectConfidentArtworkCandidate({ ...song, album: '' }, [candidates[2]])?.id).toBe('right');
});
it('bloqueia a aplicação automática sobre capas existentes ou removidas manualmente', () => {
  expect(canAutomaticallyFillArtwork({ ...track, artwork: 'data:image/jpeg;base64,old', metadataSources: { artwork: 'online' } })).toBe(false);
  expect(canAutomaticallyFillArtwork({ ...track, artwork: undefined, metadataSources: { artwork: 'file' } })).toBe(false);
  expect(canAutomaticallyFillArtwork({ ...track, artwork: undefined, metadataSources: { artwork: 'manual' } })).toBe(false);
  expect(canAutomaticallyFillArtwork({ ...track, artwork: undefined, metadataSources: {} })).toBe(true);
});
