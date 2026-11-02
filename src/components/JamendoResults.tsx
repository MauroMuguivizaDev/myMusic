import { Check, Download, ExternalLink, LoaderCircle, X } from 'lucide-react';
import { type JamendoTrack } from '../services/jamendo';
import { formatBytes } from '../domain/music';
import { cancelDownload, startDownload } from '../services/downloadManager';
import { useDownloads } from '../hooks/useDownloads';
import { Cover } from './Cover';

const configured = Boolean(import.meta.env.VITE_JAMENDO_CLIENT_ID?.trim());
export function JamendoResults({ results }: { results: JamendoTrack[] }) {
  const downloads = useDownloads();
  return <ul className="catalog-results jamendo-results">{results.map(track => {
    const entry = downloads.find(item => item.source === 'Jamendo' && item.sourceTrackId === track.id);
    const downloading = entry?.state === 'downloading';
    const percent = downloading && entry.total ? Math.min(100, Math.round(entry.loaded / entry.total * 100)) : undefined;
    return <li key={track.id}>
      <Cover title={track.name} artwork={track.image || track.album_image} />
      <div className="catalog-meta">
        <strong>{track.name}</strong><span>{track.artist_name}</span>
        {track.album_name && <span>{track.album_name}</span>}
        <small>Jamendo · {track.license_ccurl ? <a href={track.license_ccurl} target="_blank" rel="noreferrer">Licença da faixa<ExternalLink size={12}/></a> : 'Licença não indicada'}</small>
        <div className="catalog-actions">
          {configured && track.audiodownload_allowed && track.audiodownload ? downloading ? <><span className="download-status" role="status"><LoaderCircle size={14} className="spin"/>A descarregar{percent !== undefined ? ` · ${percent}%` : `${formatBytes(entry.loaded)}`}</span><button type="button" className="text-link" onClick={() => cancelDownload(entry.id)}><X size={14}/>Cancelar</button></> : <button type="button" className="text-link" disabled={downloads.some(item => item.source === 'Jamendo' && item.state === 'downloading')} onClick={() => startDownload('Jamendo', track)}><Download size={15}/>{entry?.state === 'completed' ? 'Descarregar novamente' : 'Descarregar'}</button> : <span className="download-status">{configured ? 'Download não autorizado pelo artista.' : 'Configura o client ID para ativar downloads.'}</span>}
          {entry && entry.state !== 'downloading' && <span className="download-status" role="status">{entry.state === 'completed' ? <><Check size={14}/>Importada para a biblioteca.</> : entry.state === 'cancelled' ? 'Download cancelado.' : entry.message}</span>}
          {track.shareurl && <a className="text-link" href={track.shareurl} target="_blank" rel="noreferrer">Fonte<ExternalLink size={14}/></a>}
        </div>
      </div>
    </li>;
  })}</ul>;
}
