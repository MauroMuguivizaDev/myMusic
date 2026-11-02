import { Check, Download, ExternalLink, LoaderCircle, X } from 'lucide-react';
import { formatBytes } from '../domain/music';
import { AUDIUS_OML_URL, audiusDownloadAuthorized, type AudiusTrack } from '../services/audius';
import { cancelDownload, startDownload } from '../services/downloadManager';
import { useDownloads } from '../hooks/useDownloads';
import { Cover } from './Cover';

export function AudiusResults({ results }: { results: AudiusTrack[] }) {
  const downloads = useDownloads();

  return <ul className="catalog-results jamendo-results audius-results">{results.map(track => {
    const entry = downloads.find(item => item.source === 'Audius' && item.sourceTrackId === track.id);
    const downloading = entry?.state === 'downloading';
    const percent = downloading && entry.total ? Math.min(100, Math.round(entry.loaded / entry.total * 100)) : undefined;
    const authorized = audiusDownloadAuthorized(track);
    return <li key={track.id}>
      <Cover title={track.title} artwork={track.artwork} />
      <div className="catalog-meta">
        <strong>{track.title}</strong><span>{track.artist}</span>
        {track.album && <span>{track.album}</span>}
        <small>Audius · Licença: {track.licenseUrl ? <a href={track.licenseUrl} target="_blank" rel="noreferrer">{track.license} <ExternalLink size={12}/></a> : track.license} · <a href={AUDIUS_OML_URL} target="_blank" rel="noreferrer">OML da API <ExternalLink size={12}/></a></small>
        <div className="catalog-actions">
          {authorized && (downloading ? <><span className="download-status" role="status"><LoaderCircle size={14} className="spin"/>A descarregar{percent !== undefined ? ` · ${percent}%` : ` · ${formatBytes(entry.loaded)}`}</span><button type="button" className="text-link" onClick={() => cancelDownload(entry.id)}><X size={14}/>Cancelar</button></> : <button type="button" className="text-link" disabled={downloads.some(item => item.source === 'Audius' && item.state === 'downloading')} onClick={event => { event.preventDefault(); event.stopPropagation(); startDownload('Audius', track); }}><Download size={15}/>{entry?.state === 'completed' ? 'Descarregar novamente' : 'Descarregar'}</button>)}
          {entry && entry.state !== 'downloading' && <span className="download-status" role="status">{entry.state === 'completed' ? <><Check size={14}/>Importada para a biblioteca.</> : entry.state === 'cancelled' ? 'Download cancelado.' : entry.message}</span>}
          {track.permalink && <a className="text-link" href={track.permalink} target="_blank" rel="noopener noreferrer">Ouvir no Audius <ExternalLink size={14}/></a>}
        </div>
      </div>
    </li>;
  })}</ul>;
}
