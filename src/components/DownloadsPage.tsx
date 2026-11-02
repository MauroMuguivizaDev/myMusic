import { Check, Download, ExternalLink, RotateCcw, Trash2, X } from 'lucide-react';
import type { Track } from '../domain/music';
import { formatBytes } from '../domain/music';
import { cancelDownload, clearDownloadHistory, retryDownload, type DownloadEntry } from '../services/downloadManager';
import { useDownloads } from '../hooks/useDownloads';

function DownloadRow({ entry, inLibrary, onOpenLibrary }: { entry: DownloadEntry; inLibrary?: boolean; onOpenLibrary?: () => void }) {
  const percent = entry.total ? Math.min(100, Math.round(entry.loaded / entry.total * 100)) : undefined;
  return <li className="settings-row download-history-row">
    <span className="download-history-info"><strong>{entry.title}</strong><small>{entry.artist} · {entry.source}</small>
      {entry.state === 'downloading' && <>
        <span className="download-progress-label">{percent !== undefined ? `${percent}%` : formatBytes(entry.loaded)} · A descarregar</span>
        <progress aria-label={`Progresso de ${entry.title}`} max={100} value={percent} />
      </>}
      {entry.state === 'completed' && <small className="download-state"><Check size={13}/>{inLibrary ? 'Importada para a biblioteca' : 'Concluída; a faixa já não está na biblioteca'}</small>}
      {entry.state === 'failed' && <small className="download-state" role="status">Falhou · {entry.message}</small>}
      {entry.state === 'interrupted' && <small className="download-state" role="status">Interrompido · {entry.message || 'A aplicação foi fechada durante o download.'}</small>}
      {entry.state === 'cancelled' && <small className="download-state">Cancelado pelo utilizador</small>}
    </span>
    <span className="download-history-actions">
      {entry.state === 'downloading' && <button type="button" className="text-link" onClick={() => cancelDownload(entry.id)}><X size={14}/>Cancelar</button>}
      {entry.state === 'completed' && inLibrary && <button type="button" className="text-link" onClick={onOpenLibrary}><ExternalLink size={14}/>Ver na biblioteca</button>}
      {['failed', 'interrupted', 'cancelled'].includes(entry.state) && <button type="button" className="text-link" onClick={() => retryDownload(entry.id)}><RotateCcw size={14}/>Tentar novamente</button>}
    </span>
  </li>;
}

export function DownloadsPage({ tracks, onOpenLibrary }: { tracks: Track[]; onOpenLibrary: () => void }) {
  const downloads = useDownloads();
  const active = downloads.filter(entry => entry.state === 'downloading');
  const completed = downloads.filter(entry => entry.state === 'completed');
  const failed = downloads.filter(entry => entry.state === 'failed' || entry.state === 'interrupted');
  const cancelled = downloads.filter(entry => entry.state === 'cancelled');
  const hasHistory = downloads.some(entry => entry.state !== 'downloading');

  const section = (title: string, entries: DownloadEntry[], resolveLibrary = false) => entries.length ? <section className="settings-section download-group" key={title}>
    <h2>{title}</h2>
    <ul className="download-history-list">{entries.map(entry => <DownloadRow key={entry.id} entry={entry} inLibrary={resolveLibrary && tracks.some(track => track.id === entry.libraryTrackId)} onOpenLibrary={onOpenLibrary}/>)}</ul>
  </section> : null;

  return <>
    <div className="page-heading download-page-heading">
      <div><h1>Downloads</h1></div>
      <button type="button" className="text-link download-clear" disabled={!hasHistory} onClick={clearDownloadHistory}><Trash2 size={15}/>Limpar histórico</button>
    </div>
    {section('Em andamento', active)}
    {section('Concluídos', completed, true)}
    {section('Falhados ou interrompidos', failed)}
    {section('Cancelados', cancelled)}
    {!downloads.length && <div className="empty download-empty"><div className="empty-icon"><Download size={25}/></div><h3>Sem downloads</h3><p>Os downloads iniciados na pesquisa online aparecem aqui.</p></div>}
    {hasHistory && <p className="download-history-note">Limpar o histórico não remove músicas da biblioteca. Os downloads em andamento permanecem listados.</p>}
  </>;
}
