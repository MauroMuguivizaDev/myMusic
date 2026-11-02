import { type ReactNode } from 'react';
import { NavLink } from 'react-router-dom';
import { ArrowRight, Heart, ListMusic, Play } from 'lucide-react';
import type { HistoryEntry, Playlist, Track } from '../domain/music';
import { Cover } from './Cover';
interface Props {
  tracks: Track[]; playlists: Playlist[]; favorites: string[]; history: HistoryEntry[];
  current: Track | null; loading: boolean; importButton: ReactNode;
  onPlay: (track: Track, context: Track[], origin: string) => void;
  onCollection: (id: string) => void;
}
export function Dashboard({ tracks, playlists, favorites, history, current, loading, importButton, onPlay, onCollection }: Props) {
  const recent = tracks.slice(0, 8);
  const listened = history.map(h => tracks.find(t => t.id === h.id)).filter((t): t is Track => !!t);
  const resume = [current, ...listened].filter((t, i, a): t is Track => !!t && a.findIndex(v => v?.id === t.id) === i).slice(0, 4);
  const favoriteTracks = tracks.filter(t => favorites.includes(t.id));
  function heading(title: string, action?: ReactNode) { return <div className="section-heading"><h2>{title}</h2>{action}</div>; }
  const collectionLink = (id: string, label: string) => <button className="text-link" onClick={() => onCollection(id)}>{label}<ArrowRight size={15} /></button>;
  function rail(items: Track[], origin: string) {
    return <div className="album-rail">{items.map(track => <button className="album-card" key={track.id} aria-label={`Reproduzir ${track.title}`} onClick={() => onPlay(track, items, origin)}>
      <Cover title={track.title} artwork={track.artwork} /><strong>{track.title}</strong><small>{track.artist}</small>
    </button>)}</div>;
  }
  return <div className="dashboard">
    <header className="dashboard-heading"><h1>Início</h1>{tracks.length > 0 && importButton}</header>
    {loading ? <p role="status">A abrir a biblioteca…</p> : !tracks.length ? <section className="empty dashboard-empty"><h2>A tua biblioteca está vazia</h2>{importButton}</section> : <>
      {!!resume.length && <section>{heading('Continuar a ouvir', collectionLink('history','Histórico'))}<div className="resume-grid">{resume.map(track => <button className="resume-card" key={track.id} aria-label={`Continuar ${track.title}`} onClick={() => onPlay(track, listened.length ? listened : tracks, 'Continuar a ouvir')}><Cover title={track.title} artwork={track.artwork} /><span><strong>{track.title}</strong><small>{track.artist}</small></span><Play size={16} fill="currentColor" /></button>)}</div></section>}
      <section>{heading('Recentemente adicionadas',<NavLink className="text-link" to="/library">Ver biblioteca<ArrowRight size={15} /></NavLink>)}{rail(recent, 'Recentemente adicionadas')}</section>
      {!!favoriteTracks.length && <section>{heading('Favoritas', collectionLink('favorites','Ver todas'))}{favoriteTracks.length ? <div className="favorite-list">{favoriteTracks.slice(0,3).map(track => <button className="favorite-track" key={track.id} aria-label={`Ouvir favorita ${track.title}`} onClick={() => onPlay(track,favoriteTracks,'Favoritas')}><Cover title={track.title} artwork={track.artwork} /><span><strong>{track.title}</strong><small>{track.artist}</small></span><Heart size={17} fill="currentColor" /></button>)}</div> : <p className="section-empty"><Heart size={16} />Marca músicas com o coração para as encontrares aqui.</p>}</section>}
      {!!playlists.length && <section>{heading('As tuas playlists',collectionLink('all','Gerir'))}<div className="playlist-grid">{playlists.slice(0,4).map(p => <button className="playlist-card" key={p.id} onClick={() => onCollection(p.id)}><div className="playlist-mosaic">{p.trackIds.length ? p.trackIds.slice(0,4).map(id => { const t = tracks.find(t => t.id === id); return <Cover key={id} title={t?.title} artwork={t?.artwork} />; }) : <ListMusic size={25} />}</div><span><strong>{p.name}</strong><small>{p.trackIds.length} músicas</small></span></button>)}</div></section>}
    </>}
  </div>;
}


