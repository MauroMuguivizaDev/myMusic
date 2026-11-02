import { useEffect, useRef, useState } from 'react';
import { Search } from 'lucide-react';
import { errorMessage, type CatalogResult } from '../domain/music';
import { searchCatalog } from '../services/catalog';
import { CatalogResults } from './CatalogResults';
import { searchJamendo, type JamendoTrack } from '../services/jamendo';
import { JamendoResults } from './JamendoResults';
import { AudiusResults } from './AudiusResults';
import { searchAudius, type AudiusTrack } from '../services/audius';

export function OnlineSearch() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<CatalogResult[]>([]);
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);
  const [source, setSource] = useState<'musicbrainz' | 'jamendo' | 'audius'>('musicbrainz');
  const [jamendoResults, setJamendoResults] = useState<JamendoTrack[]>([]);
  const [audiusResults, setAudiusResults] = useState<AudiusTrack[]>([]);
  const request = useRef<AbortController | null>(null);
  useEffect(() => () => request.current?.abort(), []);
  async function search() {
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    setBusy(true); setStatus('A pesquisar…'); setResults([]); setJamendoResults([]); setAudiusResults([]);
    try {
      if (source === 'jamendo') {
        const found = await searchJamendo(query, controller.signal);
        if (controller.signal.aborted) return;
        setJamendoResults(found);
        setStatus(found.length ? `${found.length} faixas · Jamendo` : 'Nenhuma faixa encontrada.');
        return;
      }
      if (source === 'audius') {
        const found = await searchAudius(query, controller.signal);
        if (controller.signal.aborted) return;
        setAudiusResults(found);
        setStatus(found.length ? `${found.length} correspondências relevantes · Audius` : 'Nenhuma correspondência confiável. Não foi encontrada uma versão autorizada para download nesta fonte.');
        return;
      }
      const response = await searchCatalog(query, controller.signal);
      if (controller.signal.aborted) return;
      setResults(response.results);
      setStatus(response.results.length ? response.cached ? 'Resultados guardados' : 'Catálogo MusicBrainz · Sem áudio' : 'Nenhum resultado.');
    } catch (error) { if (!controller.signal.aborted) setStatus(errorMessage(error)); }
    finally { if (!controller.signal.aborted) setBusy(false); }
  }
  return <section aria-label="Pesquisa online">
    <div className="browse-tabs online-source-tabs" role="group" aria-label="Fonte de pesquisa">
      <button type="button" aria-pressed={source === 'musicbrainz'} onClick={() => { request.current?.abort(); setBusy(false); setSource('musicbrainz'); setResults([]); setJamendoResults([]); setAudiusResults([]); setStatus(''); }}>MusicBrainz</button>
      <button type="button" aria-pressed={source === 'jamendo'} onClick={() => { request.current?.abort(); setBusy(false); setSource('jamendo'); setResults([]); setJamendoResults([]); setAudiusResults([]); setStatus(''); }}>Jamendo</button>
      <button type="button" aria-pressed={source === 'audius'} onClick={() => { request.current?.abort(); setBusy(false); setSource('audius'); setResults([]); setJamendoResults([]); setAudiusResults([]); setStatus(''); }}>Audius</button>
    </div>
    <form className="catalog-search" onSubmit={event => { event.preventDefault(); void search(); }}>
      <label className="search-field"><Search size={20} /><input aria-label="Pesquisar catálogo online" type="search" placeholder="Música ou artista" maxLength={200} value={query} onChange={event => {
        request.current?.abort(); setBusy(false); setResults([]); setJamendoResults([]); setAudiusResults([]); setStatus(''); setQuery(event.target.value);
      }} required /></label>
      <button className="button secondary" disabled={busy || !query.trim()}>Pesquisar</button>
    </form>
    {status && <p className="muted" role="status">{status}</p>}
    {source === 'musicbrainz' ? <CatalogResults results={results} /> : source === 'jamendo' ? <JamendoResults results={jamendoResults} /> : <AudiusResults results={audiusResults} />}
  </section>;
}
