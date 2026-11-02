import { useState } from 'react';
import type { Playlist } from '../domain/music';
import type { LibrarySortPreference, SortOrder } from '../domain/playback';
import { db } from '../services/library';
import { savePlaylist } from '../services/collections';
export function LibraryControls({ playlists, selection, onSelection, sort, onSort, run, showCreate = true, showSort = true }: {
  playlists: Playlist[]; selection: string; onSelection: (id: string) => void;
  sort: LibrarySortPreference; onSort: (value: LibrarySortPreference) => void; run: (action: () => Promise<unknown>) => void;
  showCreate?: boolean; showSort?: boolean;
}) {
  const [name, setName] = useState('');
  const [editing, setEditing] = useState<string | null>(null);
  const [confirm, setConfirm] = useState(false);
  const current = playlists.find(p => p.id === selection);
  return <section aria-label="Organizar biblioteca">
    <div className="collection-tools">
      <label>Coleção<select aria-label="Coleção" value={selection} onChange={e => { onSelection(e.target.value); setConfirm(false); }}>
        <option value="all">Todas as músicas</option><option value="favorites">Favoritos</option><option value="history">Histórico</option>
        {playlists.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
      </select></label>
      {showSort && <><label>Ordenar<select aria-label="Ordenar músicas" value={sort.field} onChange={e => {
        const field = e.target.value as SortOrder;
        onSort({ field, direction: field === 'addedAt' ? 'desc' : 'asc' });
      }}>
        <option value="title">Título</option><option value="artist">Artista</option><option value="album">Álbum</option><option value="genre">Género</option><option value="addedAt">Data de adição</option><option value="duration">Duração</option>
      </select></label><button type="button" className="button secondary sort-direction" aria-label="Alternar ordem de classificação" onClick={() => onSort({ ...sort, direction: sort.direction === 'asc' ? 'desc' : 'asc' })}>
        {sort.field === 'addedAt' ? (sort.direction === 'desc' ? 'Mais recentes' : 'Mais antigas') : (sort.direction === 'asc' ? 'A–Z' : 'Z–A')}
      </button></>}
      {current && <><button className="button secondary" onClick={() => { setEditing(current.id); setName(current.name); }}>Editar playlist</button>
        <button className="button secondary" onClick={() => setConfirm(true)}>Eliminar playlist</button></>}
    </div>
    {selection === 'history' && <p className="muted">Última reprodução de cada música, da mais recente para a mais antiga.</p>}
    {confirm && current && <div className="notice"><p>Eliminar “{current.name}”? As músicas continuam na biblioteca.</p><button className="button danger" onClick={() => run(async () => { await db.playlists.delete(current.id); onSelection('all'); setConfirm(false); })}>Confirmar eliminação</button><button className="button secondary" onClick={() => setConfirm(false)}>Cancelar</button></div>}
    {(showCreate || editing) && <form className="collection-tools" onSubmit={e => { e.preventDefault(); run(async () => { const id = await savePlaylist(name, editing ?? undefined); setName(''); setEditing(null); onSelection(id); }); }}>
      <label>{editing ? 'Nome da playlist' : 'Nova playlist'}<input aria-label="Nome da playlist" maxLength={100} required value={name} onChange={e => setName(e.target.value)} /></label>
      <button className="button secondary">{editing ? 'Guardar playlist' : 'Criar playlist'}</button>
      {editing && <button type="button" className="button secondary" onClick={() => { setEditing(null); setName(''); }}>Cancelar edição</button>}
    </form>}
  </section>;
}
