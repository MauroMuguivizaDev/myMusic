import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { createElement } from 'react';
import type { Track } from '../src/domain/music';

const { audiusDownload, jamendoDownload } = vi.hoisted(() => ({ audiusDownload: vi.fn(), jamendoDownload: vi.fn() }));
vi.mock('../src/services/audius', () => ({ downloadAudiusTrack: audiusDownload }));
vi.mock('../src/services/jamendo', () => ({ downloadJamendoTrack: jamendoDownload }));

const audiusTrack = { id: 'a1', title: 'Faixa Audius', artist: 'Artista A', is_downloadable: true, is_download_gated: false };
const jamendoTrack = { id: 'j1', name: 'Faixa Jamendo', artist_name: 'Artista J', audiodownload_allowed: true, audiodownload: 'https://prod-1.storage.jamendo.com/download/track/j1/mp32/' };
let manager: typeof import('../src/services/downloadManager');

beforeEach(async () => {
  localStorage.clear();
  vi.resetModules();
  audiusDownload.mockReset().mockResolvedValue({ result: 'added', trackId: 'library-a', size: 100 });
  jamendoDownload.mockReset().mockResolvedValue({ result: 'added', trackId: 'library-j', size: 200 });
  manager = await import('../src/services/downloadManager');
});
afterEach(() => { localStorage.clear(); vi.restoreAllMocks(); });

it('regista progresso e permite cancelar uma transferência ativa', async () => {
  let reportProgress: ((value: { loaded: number; total?: number }) => void) | undefined;
  audiusDownload.mockImplementation((_track: unknown, signal: AbortSignal, progress: typeof reportProgress) => {
    reportProgress = progress;
    return new Promise((_resolve, reject) => signal.addEventListener('abort', () => reject(new DOMException('Cancelled', 'AbortError')), { once: true }));
  });
  const id = manager.startDownload('Audius', audiusTrack);
  await vi.waitFor(() => expect(reportProgress).toBeTypeOf('function'));
  reportProgress?.({ loaded: 45, total: 100 });
  expect(manager.getDownloadSnapshot()[0]).toMatchObject({ state: 'downloading', loaded: 45, total: 100 });
  manager.cancelDownload(id);
  await vi.waitFor(() => expect(manager.getDownloadSnapshot()[0]?.state).toBe('cancelled'));
  expect(manager.getDownloadSnapshot()[0]?.message).toContain('utilizador');
});

it('marca o áudio concluído apenas depois do importador devolver o identificador local', async () => {
  const id = manager.startDownload('Jamendo', jamendoTrack);
  await vi.waitFor(() => expect(manager.getDownloadSnapshot().find(entry => entry.id === id)).toMatchObject({ state: 'completed', libraryTrackId: 'library-j', loaded: 200 }));
  expect(jamendoDownload).toHaveBeenCalledOnce();
});

it('mostra erro simples e permite repetir uma tentativa falhada', async () => {
  audiusDownload.mockRejectedValueOnce(new Error('Sem ligação')).mockResolvedValueOnce({ result: 'added', trackId: 'library-a', size: 100 });
  const id = manager.startDownload('Audius', audiusTrack);
  await vi.waitFor(() => expect(manager.getDownloadSnapshot()[0]).toMatchObject({ state: 'failed', message: 'Sem ligação' }));
  manager.retryDownload(id);
  await vi.waitFor(() => expect(manager.getDownloadSnapshot().find(entry => entry.id === id)?.state).toBe('completed'));
  expect(audiusDownload).toHaveBeenCalledTimes(2);
});

it('persiste o histórico em localStorage sem guardar áudio binário', async () => {
  manager.startDownload('Audius', audiusTrack);
  await vi.waitFor(() => expect(manager.getDownloadSnapshot()[0]?.state).toBe('completed'));
  const saved = localStorage.getItem('my-music-download-history-v1')!;
  expect(saved).toContain('Faixa Audius');
  expect(saved).not.toContain('audioBytes');
  vi.resetModules();
  manager = await import('../src/services/downloadManager');
  expect(manager.getDownloadSnapshot()[0]).toMatchObject({ state: 'completed', libraryTrackId: 'library-a' });
});

it('recupera um download que ficou ativo ao fechar a aplicação como interrompido', async () => {
  localStorage.setItem('my-music-download-history-v1', JSON.stringify([{ id: 'old', source: 'Jamendo', sourceTrackId: 'j1', title: 'Faixa Jamendo', artist: 'Artista J', track: jamendoTrack, state: 'downloading', loaded: 30, total: 100, createdAt: 1, updatedAt: 1 }]));
  vi.resetModules();
  manager = await import('../src/services/downloadManager');
  expect(manager.getDownloadSnapshot()[0]).toMatchObject({ state: 'interrupted', loaded: 30, message: 'A aplicação foi fechada durante o download.' });
});

it('executa downloads Audius e Jamendo em paralelo e mantém cada origem identificada', async () => {
  const audiusId = manager.startDownload('Audius', audiusTrack);
  const jamendoId = manager.startDownload('Jamendo', jamendoTrack);
  await vi.waitFor(() => expect(manager.getDownloadSnapshot().filter(entry => entry.state === 'completed')).toHaveLength(2));
  expect(manager.getDownloadSnapshot().find(entry => entry.id === audiusId)?.source).toBe('Audius');
  expect(manager.getDownloadSnapshot().find(entry => entry.id === jamendoId)?.source).toBe('Jamendo');
});

it('limpa registos do histórico sem interferir nos downloads em andamento', async () => {
  manager.startDownload('Audius', audiusTrack);
  await vi.waitFor(() => expect(manager.getDownloadSnapshot()[0]?.state).toBe('completed'));
  let finishJamendo!: () => void;
  jamendoDownload.mockImplementation(() => new Promise(resolve => { finishJamendo = () => resolve({ result: 'added', trackId: 'library-j', size: 200 }); }));
  const activeId = manager.startDownload('Jamendo', jamendoTrack);
  await vi.waitFor(() => expect(manager.getDownloadSnapshot().find(entry => entry.id === activeId)?.state).toBe('downloading'));
  manager.clearDownloadHistory();
  expect(manager.getDownloadSnapshot().map(entry => entry.id)).toEqual([activeId]);
  finishJamendo();
  await vi.waitFor(() => expect(manager.getDownloadSnapshot()[0]?.state).toBe('completed'));
});

it('apresenta progresso, cancelamento e acesso à faixa importada no gestor', async () => {
  let reportProgress: ((value: { loaded: number; total?: number }) => void) | undefined;
  audiusDownload.mockImplementation((_track: unknown, signal: AbortSignal, progress: typeof reportProgress) => {
    reportProgress = progress;
    return new Promise((_resolve, reject) => signal.addEventListener('abort', () => reject(new DOMException('Cancelled', 'AbortError')), { once: true }));
  });
  const activeId = manager.startDownload('Audius', audiusTrack);
  await vi.waitFor(() => expect(reportProgress).toBeTypeOf('function'));
  expect(manager.getDownloadSnapshot().find(entry => entry.id === activeId)?.state).toBe('downloading');
  reportProgress?.({ loaded: 25, total: 100 });
  const { DownloadsPage } = await import('../src/components/DownloadsPage');
  const opened = vi.fn();
  const ui = render(createElement(DownloadsPage, { tracks: [], onOpenLibrary: opened }));
  expect(screen.getByText('Em andamento')).toBeTruthy();
  expect(screen.getByText('25% · A descarregar')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
  await vi.waitFor(() => expect(screen.getByText('Cancelado pelo utilizador')).toBeTruthy());
  ui.unmount();

  audiusDownload.mockReset().mockResolvedValue({ result: 'added', trackId: 'library-a', size: 100 });
  const completedId = manager.startDownload('Audius', audiusTrack);
  await vi.waitFor(() => expect(manager.getDownloadSnapshot().find(entry => entry.id === completedId)?.state).toBe('completed'));
  const completedUi = render(createElement(DownloadsPage, { tracks: [{ id: 'library-a', title: 'Faixa Audius' } as Track], onOpenLibrary: opened }));
  fireEvent.click(screen.getByRole('button', { name: 'Ver na biblioteca' }));
  expect(opened).toHaveBeenCalledOnce();
  completedUi.unmount();
});

