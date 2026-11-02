import { useEffect, useState } from 'react';
import { HardDrive, Trash2 } from 'lucide-react';
import type { Track } from '../domain/music';
import { getStoredAudioSizes } from '../services/library';

interface StorageEstimate {
  usage?: number;
  quota?: number;
}

interface StorageData {
  sizes: Map<string, number> | null;
  filesKey: string | null;
  estimate: StorageEstimate | null;
  estimateKey: string | null;
  estimateFailed: boolean;
}

function formatStorage(bytes: number): string {
  if (bytes < 1024) return `${Math.round(bytes)} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
}

export function StorageSettings({
  tracks,
  currentTrackId,
  isPlaying = false,
  refreshKey = 0,
  onDelete,
}: {
  tracks: Track[];
  currentTrackId?: string;
  isPlaying?: boolean;
  refreshKey?: number;
  onDelete: (track: Track) => void;
}) {
  const [data, setData] = useState<StorageData>({ sizes: null, filesKey: null, estimate: null, estimateKey: null, estimateFailed: false });
  const tracksKey = `${refreshKey}:${tracks.map(track => track.id).join('|')}`;
  const readingFiles = data.filesKey !== tracksKey;
  const estimateAvailable = typeof navigator.storage?.estimate === 'function';
  const estimateLoading = estimateAvailable && data.estimateKey !== tracksKey;
  const estimate = data.estimateKey === tracksKey ? data.estimate : null;

  useEffect(() => {
    let active = true;
    void getStoredAudioSizes().then(sizes => {
      if (active) setData(previous => ({ ...previous, sizes, filesKey: tracksKey }));
    }).catch(() => {
      if (active) setData(previous => ({ ...previous, sizes: null, filesKey: tracksKey }));
    });

    const estimateStorage = navigator.storage?.estimate;
    if (estimateStorage) {
      void estimateStorage.call(navigator.storage).then(estimate => {
        if (active) setData(previous => ({ ...previous, estimate, estimateKey: tracksKey, estimateFailed: false }));
      }).catch(() => {
        if (active) setData(previous => ({ ...previous, estimate: null, estimateKey: tracksKey, estimateFailed: true }));
      });
    }
    return () => { active = false; };
  }, [tracksKey]);

  const sizes = data.sizes;
  const libraryBytes = sizes ? tracks.reduce((sum, track) => sum + (sizes.get(track.id) ?? 0), 0) : null;
  const knownCount = sizes ? tracks.filter(track => sizes.has(track.id)).length : 0;
  const used = typeof estimate?.usage === 'number' && Number.isFinite(estimate.usage) ? estimate.usage : null;
  const quota = typeof estimate?.quota === 'number' && Number.isFinite(estimate.quota) ? estimate.quota : null;
  const available = used !== null && quota !== null ? Math.max(0, quota - used) : null;

  return <section className="settings-section storage-settings" aria-labelledby="storage-heading" aria-busy={readingFiles || estimateLoading}>
    <h2 id="storage-heading">Armazenamento</h2>
    <div className="settings-row storage-summary-row">
      <HardDrive size={18}/>
      <span>Biblioteca</span>
      <small>{readingFiles ? 'A calcular…' : libraryBytes === null ? 'Indisponível' : formatStorage(libraryBytes)}</small>
    </div>
    <div className="settings-row storage-summary-row">
      <span className="settings-spacer"/>
      <span>Total de músicas</span>
      <small>{tracks.length}</small>
    </div>
    <div className="settings-row storage-summary-row">
      <span className="settings-spacer"/>
      <span>Usado por My Music no navegador</span>
      <small>{estimateLoading ? 'A calcular…' : used === null ? 'Indisponível' : formatStorage(used)}</small>
    </div>
    <div className="settings-row storage-summary-row">
      <span className="settings-spacer"/>
      <span>{available === null ? 'Quota do navegador' : 'Disponível na quota estimada'}</span>
      <small>{estimateLoading ? 'A calcular…' : available === null ? quota === null ? 'Indisponível' : formatStorage(quota) : formatStorage(available)}</small>
    </div>
    {estimateAvailable && <p className="storage-note"></p>}
    {sizes === null && <p className="storage-note" role="status">Não foi possível ler os ficheiros da biblioteca.</p>}
    {!estimateAvailable && <p className="storage-note">O navegador não disponibiliza a estimativa de armazenamento deste site.</p>}
    {estimateAvailable && data.estimateKey === tracksKey && data.estimateFailed && <p className="storage-note">A quota estimada não está disponível neste momento.</p>}
    {sizes && tracks.some(track => !sizes.has(track.id)) && <p className="storage-note">Tamanho indisponível para {tracks.length - knownCount} música(s).</p>}
    <h3 className="storage-list-heading">Músicas</h3>
    {tracks.length ? <ul className="storage-track-list">{tracks.map(track => {
      const size = sizes?.get(track.id);
      return <li className="settings-row storage-track-row" key={track.id}>
        <span className="storage-track-name"><strong>{track.title}</strong><small>{track.artist}</small></span>
        <small className="storage-track-size">{readingFiles ? 'A calcular…' : size === undefined ? 'Indisponível' : formatStorage(size)}{isPlaying && currentTrackId === track.id ? ' · A tocar' : ''}</small>
        <button type="button" className="storage-delete" aria-label={`Remover ${track.title} da biblioteca`} title="Remover música" onClick={() => onDelete(track)}><Trash2 size={17}/></button>
      </li>;
    })}</ul> : <p className="storage-note">A biblioteca está vazia.</p>}
  </section>;
}
