import { useEffect } from 'react';
import type { Track } from '../domain/music';
interface Session {
  current: Track | null; playing: boolean; position: number; duration: number; rate: number;
  play: () => void; pause: () => void;
  step: (direction: number) => void; seek: (position: number) => void; stop: () => void;
}
export function useMediaSession({ current, playing, position, duration, rate, play, pause, step, seek, stop }: Session) {
  useEffect(() => {
    const session = navigator.mediaSession;
    if (!session) return;
    const handlers: [MediaSessionAction, MediaSessionActionHandler][] = current ? [
      ['play', play], ['pause', pause], ['nexttrack', () => step(1)], ['previoustrack', () => step(-1)],
      ['stop', stop], ['seekto', details => { if (details.seekTime !== undefined) seek(details.seekTime); }],
    ] : [];
    if (current && typeof MediaMetadata !== 'undefined') {
      session.metadata = new MediaMetadata({ title: current.title, artist: current.artist, album: current.album,
        artwork: [{ src: current.artwork ?? `${location.origin}${import.meta.env.BASE_URL}icon-512.png`, sizes: '512x512', type: current.artwork ? undefined : 'image/png' }] });
    }
    session.playbackState = current ? playing ? 'playing' : 'paused' : 'none';
    for (const [action, handler] of handlers) {
      try { session.setActionHandler(action, handler); } catch { /* Optional platform action. */ }
    }
    return () => {
      for (const [action] of handlers) { try { session.setActionHandler(action, null); } catch { /* Unsupported. */ } }
      session.metadata = null; session.playbackState = 'none';
      try { session.setPositionState?.(); } catch { /* Optional API. */ }
    };
  }, [current, playing, play, pause, step, seek, stop]);
  useEffect(() => {
    if (!current || !navigator.mediaSession?.setPositionState || !Number.isFinite(duration) || duration <= 0) return;
    try { navigator.mediaSession.setPositionState({ duration, position: Math.max(0, Math.min(position, duration)), playbackRate: rate }); }
    catch { /* Position reporting is optional. */ }
  }, [current, position, duration, rate, playing, play, pause, step, seek, stop]);
}
