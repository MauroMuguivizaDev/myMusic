import { fireEvent, render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import type { Track } from '../src/domain/music';
import { TrackList } from '../src/components/TrackList';

function makeTracks(count: number): Track[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `track-${index}`,
    title: `Música ${index + 1}`,
    artist: 'Artista',
    album: 'Álbum',
    fileName: `track-${index}.mp3`,
    mime: 'audio/mpeg',
    size: 1024,
    addedAt: index,
  }));
}

it('renderiza a biblioteca progressivamente e mantém a reprodução das faixas carregadas', () => {
  const tracks = makeTracks(125);
  const onPlay = vi.fn();
  render(
    <TrackList
      tracks={tracks}
      playing={false}
      busy={false}
      onPlay={onPlay}
      onExport={vi.fn()}
      onDelete={vi.fn()}
    />,
  );

  expect(screen.getAllByRole('button', { name: /^Reproduzir Música/ })).toHaveLength(60);
  expect(screen.queryByRole('button', { name: 'Reproduzir Música 61' })).toBeNull();

  fireEvent.click(screen.getByRole('button', { name: 'Carregar mais músicas' }));
  const laterTrack = screen.getByRole('button', { name: 'Reproduzir Música 61' });
  fireEvent.click(laterTrack);
  expect(onPlay).toHaveBeenCalledWith(tracks[60]);
  expect(screen.getAllByRole('button', { name: /^Reproduzir Música/ })).toHaveLength(100);
});
