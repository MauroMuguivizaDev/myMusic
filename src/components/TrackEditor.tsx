import { useEffect, useRef, useState } from 'react';
import { metadataFields, type CatalogResult, type MetadataField, type Track } from '../domain/music';
import { db, getAudio } from '../services/library';
import { mergeMetadata, metadataSources, readEmbeddedMetadata } from '../services/metadata';
import { catalogArtwork, catalogDetails, searchCatalog } from '../services/catalog';
import { CatalogResults } from './CatalogResults';
import { errorMessage } from '../domain/music';
import { imageData } from '../services/artwork';
import { Cover } from './Cover';
import { Modal } from './Modal';
export function TrackEditor({ track, close, onError, refresh = false }: { track: Track; close: () => void; onError: (message: string) => void; refresh?: boolean }) {
  const [draft, setDraft] = useState<Track>(() => ({ ...track, metadataSources: metadataSources(track) }));
  const [busy,setBusy] = useState(refresh);
  const [error,setError] = useState('');
  const [status,setStatus] = useState('');
  const [replaceManual,setReplaceManual] = useState(false);
  const [query,setQuery] = useState([track.title, track.artist === 'Artista desconhecido' ? '' : track.artist].filter(Boolean).join(' '));
  const [results,setResults] = useState<CatalogResult[]>([]);
  const [pendingArtwork,setPendingArtwork] = useState<string>();
  const request = useRef<AbortController | null>(null);
  useEffect(() => () => request.current?.abort(), []);
  useEffect(() => {
    if (!refresh) return;
    let active = true;
    void getAudio(track.id).then(readEmbeddedMetadata).then(metadata => {
      if (!active) return;
      setDraft(previous => mergeMetadata(previous, metadata, 'file'));
      setStatus(Object.keys(metadata).length ? 'Informações lidas. Revê e guarda.' : 'O ficheiro não contém informações adicionais.');
    }).catch(() => { if (active) setError('Não foi possível ler as informações do ficheiro.'); })
      .finally(() => { if (active) setBusy(false); });
    return () => { active = false; };
  }, [refresh, track.id]);

  function edit(field: MetadataField, value: string | number | undefined) {
    if (field === 'artwork') setPendingArtwork(undefined);
    setDraft(previous => ({ ...previous, [field]: value, metadataSources: { ...previous.metadataSources, [field]: 'manual' } }));
  }
  async function readFile() {
    setBusy(true); setError(''); setStatus('');
    try {
      const metadata = await readEmbeddedMetadata(await getAudio(track.id));
      setDraft(previous => mergeMetadata(previous, metadata, 'file', replaceManual));
      setStatus(Object.keys(metadata).length ? 'Informações lidas. Revê e guarda.' : 'O ficheiro não contém informações adicionais.');
    } catch { setError('Não foi possível ler as informações do ficheiro.'); }
    finally { setBusy(false); }
  }
  async function search() {
    request.current?.abort();
    const controller = new AbortController(); request.current = controller;
    setBusy(true); setError(''); setStatus('A pesquisar…'); setResults([]);
    try {
      const response = await searchCatalog(query, controller.signal);
      if (controller.signal.aborted) return;
      setResults(response.results);
      setStatus(response.results.length ? 'Escolhe a gravação e o álbum corretos.' : 'Nenhuma correspondência.');
    } catch (error) { if (!controller.signal.aborted) setError(errorMessage(error)); }
    finally { if (!controller.signal.aborted) setBusy(false); }
  }
  async function choose(result: CatalogResult) {
    request.current?.abort();
    const controller = new AbortController(); request.current = controller;
    setBusy(true); setError('');
    try {
      const details = await catalogDetails(result, controller.signal).catch(() => result);
      const artwork = result.releaseId ? await catalogArtwork(result.releaseId, controller.signal).catch(() => undefined) : undefined;
      if (controller.signal.aborted) return;
      const { title, artist, album, year, genre, duration } = details;
      const artworkProtected = Boolean(draft.artwork) || ['file', 'manual'].includes(draft.metadataSources?.artwork ?? '');
      setDraft(previous => ({ ...mergeMetadata(previous, { title, artist, album, year, genre, duration, artwork: artworkProtected ? undefined : artwork }, 'online', replaceManual), musicbrainzId: result.id, releaseId: result.releaseId }));
      setPendingArtwork(artwork && artworkProtected && artwork !== draft.artwork ? artwork : undefined);
      setResults([]); setStatus('Informações selecionadas. Revê e guarda.');
    } catch (error) { if (!controller.signal.aborted) setError(errorMessage(error)); }
    finally { if (!controller.signal.aborted) setBusy(false); }
  }
  async function save() {
    if (!draft.title.trim()) { setError('O título não pode ficar vazio.'); return; }
    setBusy(true); setError('');
    try {
      const values = Object.fromEntries(metadataFields.map(field => [field, draft[field]]));
      const count = await db.tracks.update(track.id, { ...values, title: draft.title.trim(), artist: draft.artist.trim() || 'Artista desconhecido', album: draft.album.trim(), metadataSources: draft.metadataSources, musicbrainzId: draft.musicbrainzId, releaseId: draft.releaseId });
      if (!count) throw new Error('Música não encontrada.');
      close();
    } catch (error) { const message = errorMessage(error); setError(message); onError(message); }
    finally { setBusy(false); }
  }
  return <Modal label={refresh ? 'Atualizar informações' : 'Editar música'} close={close}><form className="track-editor" onSubmit={e => { e.preventDefault(); void save(); }}>
    <Cover title={draft.title} artwork={draft.artwork} />
    {pendingArtwork && <div className="artwork-preview" role="group" aria-label="Pré-visualização da nova capa">
      <Cover title={draft.title} artwork={pendingArtwork} />
      <div><span>Pré-visualização da capa encontrada</span><button type="button" className="text-link" onClick={() => {
        setDraft(previous => ({ ...previous, artwork: pendingArtwork, metadataSources: { ...previous.metadataSources, artwork: 'manual' } }));
        setPendingArtwork(undefined);
      }}>Usar esta capa</button></div>
    </div>}
    {error && <p className="notice error" role="alert">{error}</p>}
    {status && <p className="muted" role="status">{status}</p>}
    <fieldset disabled={busy}>
      <label>Capa<input type="file" accept="image/jpeg,image/png,image/webp" aria-label="Escolher capa" onChange={e => { const file = e.target.files?.[0]; if (file) { setBusy(true); void imageData(file).then(value => edit('artwork', value)).catch(error => setError(errorMessage(error))).finally(() => setBusy(false)); } e.target.value = ''; }} /></label>
      {draft.artwork && <button type="button" className="text-link" onClick={() => edit('artwork', undefined)}>Remover capa</button>}
      {([['title','Título'], ['artist','Artista'], ['album','Álbum'], ['genre','Género']] as const).map(([field,label]) => <label key={field}>{label}<input value={draft[field] ?? ''} maxLength={200} required={field === 'title'} onChange={e => edit(field, e.target.value)} /></label>)}
      <div className="metadata-numbers">
        <label>Ano<input type="number" inputMode="numeric" min={1} max={9999} step={1} value={draft.year ?? ''} onChange={e => edit('year', e.target.value ? Number(e.target.value) : undefined)} /></label>
        <label>Duração (segundos)<input type="number" inputMode="decimal" min={0.01} step="any" value={draft.duration ?? ''} onChange={e => edit('duration', e.target.value ? Number(e.target.value) : undefined)} /></label>
      </div>
      <details className="metadata-lookup" open={refresh}>
        <summary>Identificar música</summary>
        <label className="checkbox-label"><input type="checkbox" checked={replaceManual} onChange={e => setReplaceManual(e.target.checked)} />Permitir substituir campos editados manualmente</label>
        <button type="button" className="button secondary" onClick={() => void readFile()}>Ler ficheiro</button>
        <label>Procurar informações<input aria-label="Procurar informações online" maxLength={200} value={query} onChange={e => { setQuery(e.target.value); setResults([]); }} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); if (query.trim() && !busy) void search(); } }} /></label>
        <button type="button" className="button secondary" disabled={!query.trim()} onClick={() => void search()}>Procurar online</button>
        <CatalogResults results={results} onSelect={result => void choose(result)} busy={busy} />
      </details>
    </fieldset>
    <button className="button primary" disabled={busy}>{busy ? 'A preparar…' : 'Guardar alterações'}</button>
  </form></Modal>;
}
