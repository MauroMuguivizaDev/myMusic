import { useEffect, useState } from 'react';
import { ExternalLink } from 'lucide-react';
import type { CatalogResult } from '../domain/music';
import { catalogArtwork } from '../services/catalog';
import { Cover } from './Cover';

function CatalogCover({ result }: { result: CatalogResult }) {
  const [artwork, setArtwork] = useState<string>();
  useEffect(() => {
    const controller = new AbortController();
    if (result.releaseId) void catalogArtwork(result.releaseId, controller.signal)
      .then(value => { if (!controller.signal.aborted) setArtwork(value); }).catch(() => {});
    return () => controller.abort();
  }, [result.releaseId]);
  return <Cover title={result.title} artwork={artwork} />;
}

export function CatalogResults({ results, onSelect, busy = false }: { results: CatalogResult[]; onSelect?: (result: CatalogResult) => void; busy?: boolean }) {
  return <ul className="catalog-results">{results.map(result => <li key={`${result.id}:${result.releaseId ?? ''}`}>
    <CatalogCover result={result} />
    <div className="catalog-meta">
      <strong>{result.title}</strong>
      <span>{result.artist || 'Artista não indicado'}</span>
      {result.album && <span>{result.album}</span>}
      {result.disambiguation && <small>{result.disambiguation}</small>}
      <small>MusicBrainz · Catálogo</small>
      <div className="catalog-actions">
        {onSelect && <button type="button" className="text-link" disabled={busy} onClick={() => onSelect(result)}>Escolher</button>}
        <a className="text-link" href={`https://musicbrainz.org/${result.releaseId ? 'release/' + result.releaseId : 'recording/' + result.id}`} target="_blank" rel="noreferrer" aria-label={`Abrir ${result.title} no MusicBrainz`}>Ver origem<ExternalLink size={14} /></a>
      </div>
    </div>
  </li>)}</ul>;
}
