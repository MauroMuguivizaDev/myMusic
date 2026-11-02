import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, cleanup, within } from '@testing-library/react';
import type { Track } from '../src/domain/music';
import * as library from '../src/services/library';
import { StorageSettings } from '../src/components/StorageSettings';

let storageDescriptor: PropertyDescriptor | undefined;
beforeEach(async () => {
  storageDescriptor = Object.getOwnPropertyDescriptor(navigator, 'storage');
  await library.db.open();
  await library.db.transaction('rw', library.db.tracks, library.db.files, async () => { await library.db.tracks.clear(); await library.db.files.clear(); });
});
afterEach(async () => {
  cleanup();
  await library.db.transaction('rw', library.db.tracks, library.db.files, async () => { await library.db.tracks.clear(); await library.db.files.clear(); });
  if (storageDescriptor) Object.defineProperty(navigator, 'storage', storageDescriptor);
  else Reflect.deleteProperty(navigator, 'storage');
  vi.restoreAllMocks();
});

it('mostra a biblioteca vazia sem inventar quota quando o navegador não a disponibiliza', async () => {
  const { unmount } = render(<StorageSettings tracks={[]} onDelete={vi.fn()} />);
  expect(await screen.findByText('0 B')).toBeTruthy();
  expect(screen.getByText('0', { selector: '.storage-summary-row small' })).toBeTruthy();
  expect(screen.getByText('O navegador não disponibiliza a estimativa de armazenamento deste site.')).toBeTruthy();
  unmount();
});

it('soma os Blobs da IndexedDB e mostra os tamanhos por música', async () => {
  await library.importAudio(new File(['1234'], 'Primeira.mp3', { type: 'audio/mpeg' }));
  await library.importAudio(new File(['x'.repeat(2048)], 'Segunda.mp3', { type: 'audio/mpeg' }));
  const tracks = await library.db.tracks.toArray();
  const { unmount } = render(<StorageSettings tracks={tracks} onDelete={vi.fn()} />);
  expect((await screen.findAllByText('2.0 KB')).length).toBeGreaterThanOrEqual(2);
  expect(screen.getAllByText('4 B')).toHaveLength(1);
  expect(screen.getAllByText('2.0 KB').length).toBeGreaterThanOrEqual(2);
  expect(screen.getByText('Total de músicas')).toBeTruthy();
  const sizes = await library.getStoredAudioSizes();
  expect(sizes.size).toBe(2);
  unmount();
});

it('pede ao componente pai para confirmar a remoção, sem eliminar directamente', async () => {
  await library.importAudio(new File(['1234'], 'Canção.mp3', { type: 'audio/mpeg' }));
  const track = (await library.db.tracks.toArray())[0] as Track;
  const onDelete = vi.fn();
  const { unmount } = render(<StorageSettings tracks={[track]} currentTrackId={track.id} isPlaying onDelete={onDelete} />);
  fireEvent.click(screen.getByRole('button', { name: 'Remover Canção da biblioteca' }));
  expect(onDelete).toHaveBeenCalledWith(track);
  expect(screen.getByText(/A tocar/)).toBeTruthy();
  expect(await library.db.tracks.count()).toBe(1);
  unmount();
});

it('indica quando IndexedDB não permite ler os ficheiros da biblioteca', async () => {
  vi.spyOn(library.db.files, 'toCollection').mockImplementation(() => { throw new Error('blocked'); });
  const { unmount } = render(<StorageSettings tracks={[]} onDelete={vi.fn()} />);
  expect(await screen.findByText('Não foi possível ler os ficheiros da biblioteca.')).toBeTruthy();
  const libraryRow = screen.getByText('Biblioteca musical').closest('.storage-summary-row');
  expect(libraryRow).toBeTruthy();
  expect(within(libraryRow as HTMLElement).getByText('Indisponível')).toBeTruthy();
  unmount();
});

it('separa o uso e a quota geral do navegador do tamanho da biblioteca', async () => {
  Object.defineProperty(navigator, 'storage', { configurable: true, value: { estimate: vi.fn().mockResolvedValue({ usage: 8192, quota: 16384 }) } });
  const { unmount } = render(<StorageSettings tracks={[]} onDelete={vi.fn()} />);
  await waitFor(() => expect(screen.getAllByText('8.0 KB')).toHaveLength(2));
  expect(screen.getByText('Usado por My Music no navegador')).toBeTruthy();
  expect(screen.getByText('Disponível na quota estimada')).toBeTruthy();
  unmount();
});

it('indica falhas ao consultar a quota sem apresentar valores fictícios', async () => {
  Object.defineProperty(navigator, 'storage', { configurable: true, value: { estimate: vi.fn().mockRejectedValue(new Error('blocked')) } });
  const { unmount } = render(<StorageSettings tracks={[]} onDelete={vi.fn()} />);
  expect(await screen.findByText('A quota estimada não está disponível neste momento.')).toBeTruthy();
  expect(screen.getAllByText('Indisponível')).toHaveLength(2);
  unmount();
});
