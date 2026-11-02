import { useEffect, useRef, useState } from 'react';
import type { LyricsRecord, Track } from '../domain/music';
import { activeLine, parseLrc, searchLyrics } from '../services/lyrics';
export function Lyrics({ track, position }: { track: Track; position: number }) {
  const [title, setTitle] = useState(track.title);
  const [artist, setArtist] = useState(track.artist === 'Artista desconhecido' ? '' : track.artist);
  const [records, setRecords] = useState<LyricsRecord[]>([]);
  const [selected, setSelected] = useState<LyricsRecord | null>(null);
  const [status, setStatus] = useState('Pesquisa letras reais por título e artista.');
  const [busy, setBusy] = useState(false);
  const request = useRef<AbortController | null>(null);
  const activeRef = useRef<HTMLParagraphElement>(null);
  const lines = parseLrc(selected?.syncedLyrics ?? '');
  const index = activeLine(lines, position);
  useEffect(() => () => request.current?.abort(), []);
  useEffect(() => {
    const active = activeRef.current;
    const container = active?.parentElement;
    if (active && container) container.scrollTo?.({ top: active.offsetTop - container.clientHeight / 2 + active.clientHeight / 2, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' });
  }, [index]);
  async function search() {
    request.current?.abort();
    const controller = new AbortController(); request.current = controller; setBusy(true); setSelected(null); setRecords([]);
    const timeout = window.setTimeout(() => controller.abort('timeout'), 15000);
    try {
      const result = await searchLyrics(title, artist, controller.signal);
      if (request.current !== controller || controller.signal.aborted) return;
      setRecords(result.records);
      setStatus(result.records.length ? result.cached ? 'Resultados da cache local · LRCLIB' : 'Resultados · LRCLIB' : 'Sem resultados. Confirma o título e o artista.');
      if (result.records.length === 1) setSelected(result.records[0]);
    } catch (error) {
      if (request.current !== controller) return;
      setStatus(controller.signal.aborted ? 'A pesquisa excedeu o tempo limite. Tenta novamente.' : error instanceof TypeError ? 'Sem ligação à LRCLIB. Letras já pesquisadas continuam disponíveis na cache.' : error instanceof Error ? error.message : 'Erro ao pesquisar letras.');
    } finally { clearTimeout(timeout); if (request.current === controller) setBusy(false); }
  }
  return <section className="lyrics-view" aria-label="Letras">
    <h2>Letras</h2>
    <form className="collection-tools" onSubmit={event => { event.preventDefault(); void search(); }}>
      <label>Título<input aria-label="Título da letra" value={title} onChange={e => setTitle(e.target.value)} /></label>
      <label>Artista<input aria-label="Artista da letra" value={artist} onChange={e => setArtist(e.target.value)} /></label>
      <button className="button secondary" disabled={busy}>{busy ? 'A pesquisar…' : 'Pesquisar letras'}</button>
    </form>
    <p role="status">{status}</p>
    {!!records.length && <label>Versão da letra<select aria-label="Versão da letra" value={selected?.id ?? ''} onChange={e => setSelected(records.find(r => r.id === Number(e.target.value)) ?? null)}>
      <option value="">Escolhe um resultado</option>{records.map(record => <option key={record.id} value={record.id}>{record.trackName} · {record.artistName} · #{record.id}{record.syncedLyrics ? ' · sincronizada' : ''}</option>)}
    </select></label>}
    {selected && <div className="lyrics-lines" aria-label="Texto da letra">
      {selected.instrumental ? <p>Faixa instrumental.</p> : lines.length ? lines.map((line, i) => <p key={`${line.time}-${i}`} ref={i === index ? activeRef : undefined} className={i === index ? 'lyric-active' : ''} aria-current={i === index ? 'true' : undefined}>{line.text || '♪'}</p>) : <p className="plain-lyrics">{selected.plainLyrics || 'Este resultado não contém letras.'}</p>}
    </div>}
    <p className="muted">A pesquisa envia título e artista à <a href="https://lrclib.net" target="_blank" rel="noreferrer">LRCLIB</a>. Os resultados ficam guardados neste dispositivo.</p>
  </section>;
}
