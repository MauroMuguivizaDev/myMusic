import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { usePlayer } from '../src/hooks/usePlayer';
import type { Track } from '../src/domain/music';
import { db, getAudio } from '../src/services/library';
vi.mock('../src/services/library', () => ({
  getAudio: vi.fn(), db: { tracks: { update: vi.fn().mockResolvedValue(1) }, history: { put: vi.fn().mockResolvedValue(1) } },
}));
const tracks: Track[] = ['a','b','c'].map(id => ({ id, title: id, artist: 'Artist', album: '', fileName: `${id}.mp3`, mime: 'audio/mpeg', size: 1, addedAt: 0 }));
const onError = vi.fn();
function mount() {
  const hook = renderHook(() => usePlayer(tracks, onError));
  const audio = document.createElement('audio');
  Object.defineProperty(hook.result.current.audioRef, 'current', { value: audio, writable: true });
  Object.defineProperty(audio, 'duration', { value: 120 });
  return { ...hook, audio };
}
beforeEach(() => { localStorage.clear(); vi.clearAllMocks(); vi.mocked(getAudio).mockResolvedValue(new Blob(['audio'])); });
afterEach(() => { vi.useRealTimers(); localStorage.clear(); });
it('avança na fila, repete uma só no fim e termina sem repetição', async () => {
  const { result } = mount();
  await act(() => result.current.playTrack(tracks[0]));
  act(() => result.current.step(1));
  await waitFor(() => expect(result.current.current?.id).toBe('b'));
  act(() => { result.current.cycleRepeat(); result.current.cycleRepeat(); });
  await act(() => result.current.onEnded());
  expect(result.current.current?.id).toBe('b');
  act(() => result.current.step(1));
  await waitFor(() => expect(result.current.current?.id).toBe('c'));
  act(() => result.current.cycleRepeat());
  act(() => result.current.onEnded());
  expect(result.current.current).toBeNull();
});
it('edita a fila sem interromper o áudio, limpa e liberta a sessão', async () => {
  const { result } = mount();
  await act(() => result.current.playTrack(tracks[0]));
  const src = result.current.audioRef.current?.src;
  act(() => result.current.moveQueued(2, -1));
  expect(result.current.queue.map(t => t.id)).toEqual(['a','c','b']);
  act(() => result.current.removeQueued('b'));
  act(() => result.current.enqueue(tracks[1]));
  expect(result.current.audioRef.current?.src).toBe(src);
  act(() => result.current.clearQueue());
  expect(result.current.queue).toEqual([]);
  expect(result.current.audioRef.current?.getAttribute('src')).toBeNull();
});
it('restaura faixa, fila, posição e preferências em pausa', async () => {
  localStorage.setItem('my-music-player-v2', JSON.stringify({ queue: ['b','missing','a'], currentId: 'b', position: 42, volume: .3, rate: 1.5, shuffle: true, repeat: 'all' }));
  const { result, audio } = mount();
  await waitFor(() => expect(result.current.current?.id).toBe('b'));
  await waitFor(() => expect(audio.src).toContain('blob:'));
  act(() => result.current.onMetadata());
  expect(audio.currentTime).toBe(42);
  expect(audio.volume).toBe(.3);
  expect(audio.playbackRate).toBe(1.5);
  expect(result.current.queue.map(t => t.id)).toEqual(['b','a']);
  expect(audio.play).not.toHaveBeenCalled();
  expect(result.current.playing).toBe(false);
});
it('controla posição, velocidade, volume e reinício com anterior', async () => {
  const { result, audio } = mount();
  await act(() => result.current.playTrack(tracks[0]));
  act(() => result.current.onMetadata());
  act(() => { result.current.seek(500); result.current.changeVolume(.4); result.current.changeRate(1.75); });
  expect(audio.currentTime).toBe(120);
  expect(audio.volume).toBe(.4);
  expect(audio.playbackRate).toBe(1.75);
  act(() => result.current.step(-1));
  expect(audio.currentTime).toBe(0);
});
it('silencia, recupera o volume e persiste a escolha', async () => {
  const { result } = mount();
  act(() => result.current.changeVolume(.37));
  act(() => result.current.toggleMute());
  expect(result.current.volume).toBe(0);
  act(() => result.current.toggleMute());
  expect(result.current.volume).toBeCloseTo(.37);
  expect(JSON.parse(localStorage.getItem('my-music-player-v2')!).volume).toBeCloseTo(.37);
});
it('limita a gravação da posição a uma vez por segundo sem perder preferências', async () => {
  vi.useFakeTimers();
  const { result, audio } = mount();
  await act(() => result.current.playTrack(tracks[0]));
  const save = vi.spyOn(Storage.prototype, 'setItem');
  save.mockClear();
  for (let second = 1; second <= 4; second++) {
    act(() => { audio.currentTime = second; vi.advanceTimersByTime(250); result.current.onTime(); });
  }
  expect(save).toHaveBeenCalledTimes(1);
  expect(JSON.parse(localStorage.getItem('my-music-player-v2')!).position).toBe(4);
  save.mockRestore();
});
it('tenta recuperar o AudioContext interrompido quando a aplicação volta ao primeiro plano', async () => {
  vi.useFakeTimers();
  const previousAudioContext = Object.getOwnPropertyDescriptor(window, 'AudioContext');
  class TestAudioContext {
    static current: TestAudioContext | undefined;
    state: AudioContextState = 'running';
    currentTime = 0;
    destination = {} as AudioDestinationNode;
    constructor() { TestAudioContext.current = this; }
    createMediaElementSource = vi.fn(() => ({ connect: vi.fn() }) as unknown as MediaElementAudioSourceNode);
    createGain = vi.fn(() => ({ gain: { value: 1, setTargetAtTime: vi.fn() }, connect: vi.fn() }) as unknown as GainNode);
    resume = vi.fn(async () => { this.state = 'running'; });
    close = vi.fn(async () => undefined);
  }
  Object.defineProperty(window, 'AudioContext', { value: TestAudioContext, configurable: true });
  const { result, audio } = mount();
  Object.defineProperty(audio, 'paused', { configurable: true, get: () => false });
  await act(() => result.current.playTrack(tracks[0]));
  const audioContext = TestAudioContext.current!;
  audioContext.state = 'interrupted' as AudioContextState;
  window.dispatchEvent(new Event('pageshow'));
  await act(async () => { vi.advanceTimersByTime(250); await Promise.resolve(); });
  expect(audioContext.resume).toHaveBeenCalled();
  if (previousAudioContext) Object.defineProperty(window, 'AudioContext', previousAudioContext);
  else Reflect.deleteProperty(window, 'AudioContext');
});
it('pausa ao expirar o temporizador e permite cancelá-lo', async () => {
  const { result, audio } = mount();
  await act(() => result.current.playTrack(tracks[0]));
  vi.useFakeTimers();
  act(() => result.current.setSleep(1));
  vi.mocked(audio.pause).mockClear();
  act(() => vi.advanceTimersByTime(60_000));
  expect(audio.pause).toHaveBeenCalledOnce();
  expect(result.current.sleepAt).toBeNull();
  act(() => { result.current.setSleep(5); result.current.setSleep(0); });
  expect(result.current.sleepAt).toBeNull();
});
it('não deixa tocar a faixa anterior se o ficheiro seguinte estiver ausente', async () => {
  const { result, audio } = mount();
  await act(() => result.current.playTrack(tracks[0]));
  vi.mocked(getAudio).mockRejectedValueOnce(new Error('O ficheiro não está disponível.'));
  await act(() => result.current.playTrack(tracks[1]));
  expect(audio.getAttribute('src')).toBeNull();
  expect(onError).toHaveBeenCalledWith('O ficheiro não está disponível.');
  expect(result.current.loading).toBe(false);
});
it('regista a última reprodução uma vez por abertura da faixa', async () => {
  const { result } = mount();
  await act(() => result.current.playTrack(tracks[0]));
  act(() => { result.current.onPlay(); result.current.onPause(); result.current.onPlay(); });
  expect(db.history.put).toHaveBeenCalledOnce();
  expect(db.history.put).toHaveBeenCalledWith({ id: 'a', playedAt: expect.any(Number) });
});
