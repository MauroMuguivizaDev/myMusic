import { ArrowDownToLine, AudioLines, Trash2, Heart, Ellipsis, Pencil, RefreshCw } from "lucide-react";
import { formatTime, type Track, type Playlist } from "../domain/music";
import { Cover } from "./Cover";
import { useEffect, useRef, useState } from 'react';

const INITIAL_TRACKS = 60;
const TRACKS_PER_BATCH = 40;

function placeMenu(details: HTMLDetailsElement) {
  if (!details.open) return;
  document.querySelectorAll<HTMLDetailsElement>('.track-menu[open]').forEach(other => { if (other !== details) other.open = false; });
  const menu = details.querySelector<HTMLElement>(':scope > div');
  if (!menu) return;
  const bounds = details.getBoundingClientRect();
  const dock = document.querySelector('.player')?.getBoundingClientRect().top ?? document.querySelector('.bottom-nav')?.getBoundingClientRect().top;
  const bottom = Math.min(window.innerHeight, dock && dock > 0 ? dock : window.innerHeight);
  const below = bottom - bounds.bottom - 14;
  const above = bounds.top - 16;
  const upward = below < Math.min(menu.scrollHeight, 300) && above > below;
  details.dataset.side = upward ? 'up' : 'down';
  menu.style.maxHeight = `${Math.max(88, Math.min(300, upward ? above : below))}px`;
}
interface Props {
  tracks: Track[];
  currentId?: string;
  playing: boolean;
  busy: boolean;
  onPlay: (track: Track) => void;
  onExport: (track: Track) => void;
  onDelete: (track: Track) => void;
  onEdit?: (track: Track) => void;
  onRefresh?: (track: Track) => void;
  favorites?: string[];
  playlists?: Playlist[];
  onFavorite?: (id: string) => void;
  onEnqueue?: (track: Track) => void;
  onPlaylist?: (playlistId: string, trackId: string, add: boolean) => void;
}
export function TrackList({
  tracks: items,
  currentId,
  playing,
  busy,
  onPlay,
  onExport,
  onDelete,
  onEdit,
  onRefresh,
  favorites = [], playlists = [], onFavorite, onEnqueue, onPlaylist,
}: Props) {
  const [visibleCount, setVisibleCount] = useState(INITIAL_TRACKS);
  const loadMoreRef = useRef<HTMLDivElement>(null);
  const hasMore = visibleCount < items.length;

  useEffect(() => {
    const sentinel = loadMoreRef.current;
    if (!sentinel || !hasMore || typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver(entries => {
      if (entries.some(entry => entry.isIntersecting)) {
        setVisibleCount(count => count + TRACKS_PER_BATCH);
      }
    }, { rootMargin: '500px 0px' });
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [hasMore]);

  useEffect(() => {
    const dismiss = (event: PointerEvent) => {
      document.querySelectorAll<HTMLDetailsElement>('.track-menu[open]').forEach(details => {
        if (event.target instanceof Node && !details.contains(event.target)) details.open = false;
      });
    };
    document.addEventListener('pointerdown', dismiss);
    return () => document.removeEventListener('pointerdown', dismiss);
  }, []);
  return (
    <div className="track-list">
      {items.slice(0, visibleCount).map((track, index) => (
        <div
          className={`track-row ${currentId === track.id ? "selected" : ""}`}
          key={track.id}
        >
          <span className="track-index">
            {String(index + 1).padStart(2, "0")}
          </span>
          <button
            className="track-main"
            onClick={() => void onPlay(track)}
            aria-label={`Reproduzir ${track.title}`}
          >
            <Cover title={track.title} artwork={track.artwork} />
            <span>
              <strong>{track.title}</strong>
              <small>
                {track.artist}{track.album ? ` · ${track.album}` : ''}
              </small>
            </span>
            {currentId === track.id && playing && (
              <AudioLines className="playing-icon" size={20} />
            )}
          </button>
          <span className="track-duration">
            {track.duration ? formatTime(track.duration) : "—"}
          </span>
          {onFavorite && <button className="icon-button" aria-label={`Favorito ${track.title}`} aria-pressed={favorites.includes(track.id)} onClick={() => onFavorite(track.id)}><Heart size={17} fill={favorites.includes(track.id) ? 'currentColor' : 'none'} /></button>}
          {onEnqueue && <details className="track-menu" onToggle={event => placeMenu(event.currentTarget)} onClick={event => { if (event.target instanceof Element && event.target.closest('button')) event.currentTarget.open = false; }} onKeyDown={event => { if (event.key === 'Escape') { event.currentTarget.open = false; event.currentTarget.querySelector('summary')?.focus(); } }}><summary aria-label={`Opções de ${track.title}`}><Ellipsis size={18} /></summary><div>
            <button onClick={() => onEnqueue(track)}>Adicionar à fila</button>
            {playlists.map(p => <button key={p.id} onClick={() => onPlaylist?.(p.id, track.id, !p.trackIds.includes(track.id))}>{p.trackIds.includes(track.id) ? 'Remover de' : 'Adicionar a'} {p.name}</button>)}
            {onEdit && <button onClick={() => onEdit(track)}><Pencil size={15} />Editar música e capa</button>}
            {onRefresh && <button disabled={busy} onClick={() => onRefresh(track)}><RefreshCw size={15} />Atualizar informações</button>}
            <button aria-label={`Exportar ${track.title}`} disabled={busy} onClick={() => onExport(track)}><ArrowDownToLine size={15} />Exportar ficheiro</button>
            <button aria-label={`Remover ${track.title}`} disabled={busy} onClick={() => onDelete(track)}><Trash2 size={15} />Remover música</button>
          </div></details>}
          {!onEnqueue && <><button
            className="icon-button"
            aria-label={`Exportar ${track.title}`}
            disabled={busy}
            onClick={() => void onExport(track)}
          >
            <ArrowDownToLine size={18} />
          </button>
          <button
            className="icon-button"
            aria-label={`Remover ${track.title}`}
            disabled={busy}
            onClick={() => onDelete(track)}
          >
            <Trash2 size={17} />
          </button></>}
        </div>
      ))}
      {hasMore && <div ref={loadMoreRef} className="track-list-more">
        {typeof IntersectionObserver === 'undefined' && <button type="button" className="text-link" onClick={() => setVisibleCount(count => count + TRACKS_PER_BATCH)}>Carregar mais músicas</button>}
      </div>}
    </div>
  );
}
