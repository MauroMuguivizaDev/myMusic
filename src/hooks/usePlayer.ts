import { useCallback, useEffect, useRef, useState } from 'react';
import type { Track } from '../domain/music';
import { errorMessage } from '../domain/music';
import { nextId, readPlayback, shuffled, type PlaybackState } from '../domain/playback';
import { db, getAudio } from '../services/library';
import { useMediaSession } from './useMediaSession';

export function usePlayer(tracks: Track[], onError: (message: string) => void) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const urlRef = useRef<string | null>(null);
  const requestRef = useRef(0);
  const restored = useRef(false);
  const audioContextRef = useRef<AudioContext | null>(null);
  const gainRef = useRef<GainNode | null>(null);
  const sourceRef = useRef<MediaElementAudioSourceNode | null>(null);
  const sourceElementRef = useRef<HTMLAudioElement | null>(null);
  const previousVolumeRef = useRef(1);
  const lastSavedPlaybackRef = useRef<PlaybackState | null>(null);
  const lastPlaybackSaveRef = useRef(0);
  const [state, setState] = useState<PlaybackState>(readPlayback);
  const [current, setCurrent] = useState<Track | null>(null);
  const [playing, setPlaying] = useState(false);
  const [loading, setLoading] = useState(false);
  const [playbackError, setPlaybackError] = useState('');
  const [duration, setDuration] = useState(0);
  const [sleepAt, setSleepAt] = useState<number | null>(null);
  const resumePosition = useRef(0);
  const recorded = useRef(false);
  const queue = state.queue.map(id => tracks.find(t => t.id === id)).filter((t): t is Track => !!t);

  const prepareVolume = useCallback((audio: HTMLAudioElement) => {
    const AudioContextClass = window.AudioContext;
    if (!AudioContextClass) { audio.volume = state.volume; return; }
    try {
      if (!sourceRef.current || sourceElementRef.current !== audio) {
        if (sourceRef.current) return;
        const context = new AudioContextClass();
        const source = context.createMediaElementSource(audio);
        const gain = context.createGain();
        source.connect(gain); gain.connect(context.destination);
        audioContextRef.current = context; sourceRef.current = source; gainRef.current = gain; sourceElementRef.current = audio;
        audio.volume = 1;
      }
      if (audioContextRef.current && audioContextRef.current.state !== 'running') void audioContextRef.current.resume().catch(() => {});
      if (gainRef.current) gainRef.current.gain.setTargetAtTime(state.volume, audioContextRef.current?.currentTime ?? 0, .015);
    } catch { audio.volume = state.volume; }
  }, [state.volume]);

  useEffect(() => {
    const now = Date.now();
    const previous = lastSavedPlaybackRef.current;
    const settingsUnchanged = previous
      && previous.queue === state.queue
      && previous.currentId === state.currentId
      && previous.volume === state.volume
      && previous.rate === state.rate
      && previous.shuffle === state.shuffle
      && previous.repeat === state.repeat;
    if (settingsUnchanged && now - lastPlaybackSaveRef.current < 1000) return;
    lastSavedPlaybackRef.current = state;
    lastPlaybackSaveRef.current = now;
    try { localStorage.setItem('my-music-player-v2', JSON.stringify(state)); }
    catch { onError('O navegador impediu guardar o estado do reprodutor.'); }
  }, [state, onError]);

  const stop = useCallback(() => {
    requestRef.current++;
    const audio = audioRef.current;
    if (audio) { audio.pause(); audio.removeAttribute('src'); audio.load(); }
    if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    urlRef.current = null;
    setCurrent(null); setPlaying(false); setDuration(0); setLoading(false);
    setSleepAt(null); setPlaybackError('');
    setState(s => ({ ...s, currentId: null, position: 0 }));
  }, []);

  const loadTrack = useCallback(async (track: Track, autoplay = true, position = 0) => {
    const request = ++requestRef.current;
    const audio = audioRef.current;
    if (!audio) return;
    if (autoplay) prepareVolume(audio);
    audio.pause(); audio.removeAttribute('src'); audio.load();
    if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    urlRef.current = null;
    setCurrent(track); setLoading(true); setPlaying(false); setDuration(0);
    setPlaybackError('');
    recorded.current = false;
    resumePosition.current = position;
    setState(s => ({ ...s, currentId: track.id, position }));
    try {
      const blob = await getAudio(track.id);
      if (request !== requestRef.current) return;
      urlRef.current = URL.createObjectURL(blob);
      audio.src = urlRef.current;
      if (autoplay) await audio.play();
    } catch (error) {
      if (request === requestRef.current) {
        if (!(error instanceof DOMException && error.name === 'NotAllowedError')) {
          audio.removeAttribute('src'); audio.load();
          if (urlRef.current) URL.revokeObjectURL(urlRef.current);
          urlRef.current = null;
        }
        const message = error instanceof DOMException && error.name === 'NotAllowedError'
          ? 'Toca em reproduzir para iniciar o áudio neste navegador.' : errorMessage(error);
        setPlaybackError(message); onError(message);
      }
    } finally { if (request === requestRef.current) setLoading(false); }
  }, [onError, prepareVolume]);

  const playTrack = useCallback(async (track: Track, context?: Track[]) => {
    restored.current = true;
    setState(s => {
      let ids = context ? context.map(t => t.id) : s.queue.includes(track.id) ? s.queue : tracks.map(t => t.id);
      if (!ids.includes(track.id)) ids = [track.id, ...ids];
      return { ...s, queue: s.shuffle && (context || !s.queue.includes(track.id)) ? shuffled(ids, track.id) : ids };
    });
    await loadTrack(track);
  }, [loadTrack, tracks]);

  useEffect(() => {
    let active = true;
    if (!restored.current && tracks.length) {
      const saved = readPlayback();
      void Promise.resolve().then(() => {
        if (!active || restored.current) return;
        restored.current = true;
        const track = tracks.find(t => t.id === saved.currentId);
        setState(s => ({ ...s, queue: s.queue.filter(id => tracks.some(t => t.id === id)), currentId: track?.id ?? null }));
        if (track) void loadTrack(track, false, saved.position);
      });
    }
    return () => { active = false; };
  }, [tracks, loadTrack]);

  useEffect(() => {
    let active = true;
    if (current && !tracks.some(t => t.id === current.id)) void Promise.resolve().then(() => { if (active) stop(); });
    return () => { active = false; };
  }, [tracks, current, stop]);

  const toggle = useCallback(async () => {
    const audio = audioRef.current;
    if (!audio || !current) return;
    if (!audio.getAttribute('src')) { await loadTrack(current); return; }
    if (audio.paused) {
      try { prepareVolume(audio); await audio.play(); }
      catch { const message = 'Não foi possível reproduzir este formato. Experimenta MP3 ou AAC.'; setPlaybackError(message); onError(message); }
    } else audio.pause();
  }, [current, loadTrack, onError, prepareVolume]);

  const seek = useCallback((value: number) => {
    if (audioRef.current && duration && Number.isFinite(value)) {
      const position = Math.max(0, Math.min(value, duration));
      audioRef.current.currentTime = position;
      setState(s => ({ ...s, position }));
    }
  }, [duration]);
  const step = useCallback((direction: number, ended = false) => {
    if (direction < 0 && (audioRef.current?.currentTime ?? 0) > 3) { seek(0); return; }
    const ids = state.queue.filter(id => tracks.some(t => t.id === id));
    const id = nextId(ids, current?.id ?? null, direction, state.repeat, ended);
    const track = tracks.find(t => t.id === id);
    if (track) void loadTrack(track);
    else if (ended) stop();
  }, [state.queue, state.repeat, current, tracks, loadTrack, seek, stop]);

  useEffect(() => {
    const audio = audioRef.current;
    if (audio) { if (gainRef.current) { gainRef.current.gain.value = state.volume; audio.volume = 1; } else audio.volume = state.volume; audio.playbackRate = state.rate; }
  }, [state.volume, state.rate, current]);
  useEffect(() => {
    if (!sleepAt) return;
    const expire = () => {
      if (Date.now() >= sleepAt) { audioRef.current?.pause(); setPlaying(false); setSleepAt(null); }
    };
    const timer = window.setInterval(expire, 1000);
    document.addEventListener('visibilitychange', expire);
    return () => { clearInterval(timer); document.removeEventListener('visibilitychange', expire); };
  }, [sleepAt]);
  useEffect(() => {
    const audio = audioRef.current;
    const invalidate = () => { requestRef.current++; };
    return () => {
      invalidate();
      audio?.pause(); audio?.removeAttribute('src'); audio?.load();
      void audioContextRef.current?.close();
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    };
  }, []);

  useEffect(() => {
    let resumeTimer = 0;
    const resumeAfterForeground = () => {
      if (document.visibilityState !== 'visible') return;
      window.clearTimeout(resumeTimer);
      // iOS WebKit may report an interrupted AudioContext after returning to the app.
      resumeTimer = window.setTimeout(() => {
        const context = audioContextRef.current;
        if (context && context.state !== 'running' && audioRef.current && !audioRef.current.paused) {
          void context.resume().catch(() => {});
        }
      }, 250);
    };
    document.addEventListener('visibilitychange', resumeAfterForeground);
    window.addEventListener('pageshow', resumeAfterForeground);
    return () => {
      window.clearTimeout(resumeTimer);
      document.removeEventListener('visibilitychange', resumeAfterForeground);
      window.removeEventListener('pageshow', resumeAfterForeground);
    };
  }, []);

  const mediaPlay = useCallback(() => { if (audioRef.current?.paused) void toggle(); }, [toggle]);
  const mediaPause = useCallback(() => { audioRef.current?.pause(); }, []);
  const activeTrack = tracks.find(track => track.id === current?.id) ?? current;
  useMediaSession({ current: activeTrack, playing, position: state.position, duration, rate: state.rate,
    play: mediaPlay, pause: mediaPause, step, seek, stop });

  return {
    audioRef, current: activeTrack, playing, loading, playbackError, duration, ...state, queue, sleepAt,
    playTrack, stop, toggle, step, seek,
    changeVolume: (volume: number) => setState(s => { const next = Math.max(0, Math.min(1, volume)); if (next > 0) previousVolumeRef.current = next; return { ...s, volume: next }; }),
    toggleMute: () => setState(s => { const volume = s.volume > 0 ? 0 : previousVolumeRef.current || 1; if (s.volume > 0) previousVolumeRef.current = s.volume; return { ...s, volume }; }),
    changeRate: (rate: number) => setState(s => ({ ...s, rate: Math.max(.5, Math.min(2, rate)) })),
    cycleRepeat: () => setState(s => ({ ...s, repeat: s.repeat === 'off' ? 'all' : s.repeat === 'all' ? 'one' : 'off' })),
    toggleShuffle: () => setState(s => ({ ...s, shuffle: !s.shuffle,
      queue: !s.shuffle ? shuffled(s.queue, current?.id) : tracks.filter(t => s.queue.includes(t.id)).map(t => t.id) })),
    enqueue: (track: Track) => setState(s => ({ ...s, queue: s.queue.includes(track.id) ? s.queue : [...s.queue, track.id] })),
    removeQueued: (id: string) => { if (id === current?.id) stop(); setState(s => ({ ...s, queue: s.queue.filter(q => q !== id) })); },
    moveQueued: (index: number, delta: number) => setState(s => {
      const ids = s.queue.filter(id => tracks.some(t => t.id === id));
      const next = index + delta;
      if (next < 0 || next >= ids.length) return s;
      [ids[index], ids[next]] = [ids[next], ids[index]];
      return { ...s, queue: ids };
    }),
    clearQueue: () => { stop(); setState(s => ({ ...s, queue: [] })); },
    setSleep: (minutes: number) => setSleepAt(minutes > 0 ? Date.now() + minutes * 60_000 : null),
    onMetadata: () => {
      const value = audioRef.current?.duration;
      if (value && Number.isFinite(value)) {
        setDuration(value);
        if (audioRef.current) { if (gainRef.current) { gainRef.current.gain.value = state.volume; audioRef.current.volume = 1; } else audioRef.current.volume = state.volume; audioRef.current.playbackRate = state.rate; }
        if (resumePosition.current && audioRef.current) audioRef.current.currentTime = Math.min(resumePosition.current, value);
        resumePosition.current = 0;
        if (current && activeTrack?.metadataSources?.duration !== 'manual') void db.tracks.update(current.id, { duration: value }).catch(() => onError('Não foi possível guardar a duração.'));
      }
    },
    onTime: () => setState(s => ({ ...s, position: audioRef.current?.currentTime ?? 0 })),
    onPlay: () => {
      if (sleepAt && Date.now() >= sleepAt) { audioRef.current?.pause(); setSleepAt(null); return; }
      setPlaying(true);
      setPlaybackError('');
      if (current && !recorded.current) {
        recorded.current = true;
        void db.history.put({ id: current.id, playedAt: Date.now() }).catch(() => onError('Não foi possível guardar o histórico.'));
      }
    },
    onPause: () => setPlaying(false),
    onEnded: () => step(1, true),
    onAudioError: () => { setPlaying(false); setLoading(false); const message = 'Este áudio não pôde ser reproduzido. Verifica o ficheiro e o suporte do navegador ao formato.'; setPlaybackError(message); onError(message); },
    canPrevious: !!current && (state.position > 3 || queue.findIndex(t => t.id === current.id) > 0 || state.repeat === 'all'),
    canNext: !!current && (queue.findIndex(t => t.id === current.id) < queue.length - 1 || state.repeat === 'all'),
  };
}

