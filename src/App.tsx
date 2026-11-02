
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";

import {
  HashRouter,
  NavLink,
  Route,
  Routes,
  useNavigate,
} from "react-router-dom";

import {
  ArrowDownToLine,
  ArrowUpFromLine,
  RefreshCw,
  Check,
  ChevronRight,
  Disc3,
  Download,
  HardDrive,
  House,
  Library,
  LoaderCircle,
  Music2,
  Palette,
  Plus,
  Search,
  Settings2,
  Trash2,
  X,
} from "lucide-react";

import {
  AUDIO_ACCEPT,
  errorMessage,
  type Track,
} from "./domain/music";

import {
  contrast,
  readTheme,
  themes,
  type ThemePreferences,
} from "./domain/themes";

import {
  selectTracks,
  readLibrarySortPreference,
  writeLibrarySortPreference,
  type LibrarySortPreference,
} from "./domain/playback";

import { useLibrary } from "./hooks/useLibrary";
import { usePlayer } from "./hooks/usePlayer";
import { useCollections } from "./hooks/useCollections";
import { useArtworkColor } from "./hooks/useArtworkColor";
import { updateLibraryMetadata, type BatchSummary } from "./services/metadataBatch";

import {
  importAudio,
  removeTrack,
} from "./services/library";

import {
  exportBackup,
  exportTrack,
  restoreBackup,
} from "./services/export";

import {
  playlistTrack,
  toggleFavorite,
} from "./services/collections";

import { imageData } from "./services/artwork";

import { TrackList } from "./components/TrackList";
import { Player } from "./components/Player";
import { LibraryControls } from "./components/LibraryControls";
import { Dashboard } from "./components/Dashboard";
import { TrackEditor } from "./components/TrackEditor";
import { Cover } from "./components/Cover";
import { OnlineSearch } from "./components/OnlineSearch";
import { StorageSettings } from "./components/StorageSettings";
import { DownloadsPage } from "./components/DownloadsPage";
import { useFormViewport } from "./hooks/useFormViewport";

import "./App.css";

const navigation = [
  { to: "/", label: "Início", icon: House },
  { to: "/search", label: "Pesquisar", icon: Search },
  { to: "/library", label: "Biblioteca", icon: Library },
  { to: "/downloads", label: "Downloads", icon: Download },
];

function Shell() {
  useFormViewport();
  const {
    tracks,
    loading,
    error: libraryError,
  } = useLibrary();

  const [message, setMessage] = useState("");
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const collections = useCollections(setMessage);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState("");

  const [libraryQuery, setLibraryQuery] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [searchMode, setSearchMode] = useState('device');
  const [refreshInfo, setRefreshInfo] = useState(false);
  const [batchProgress, setBatchProgress] = useState<{ index: number; total: number; title: string } | null>(null);
  const [batchSummary, setBatchSummary] = useState<BatchSummary | null>(null);
  const batchAbort = useRef<AbortController | null>(null);

  useEffect(() => {
    const handleUpdate = () => setUpdateAvailable(true);
    window.addEventListener("my-music-update-available", handleUpdate);
    return () => window.removeEventListener("my-music-update-available", handleUpdate);
  }, []);

  function startBatchMetadataUpdate() {
    const controller = new AbortController();
    batchAbort.current = controller;
    setBatchSummary(null);
    setBatchProgress({ index: 0, total: tracks.length, title: "A iniciar…" });
    void updateLibraryMetadata(tracks, controller.signal, progress =>
      setBatchProgress({ ...progress, title: progress.track.title }),
    ).then(setBatchSummary).catch(error => setMessage(errorMessage(error))).finally(() => {
      setBatchProgress(null);
      batchAbort.current = null;
    });
  }

  const [selection, setSelection] = useState("all");
  const [libraryView, setLibraryView] = useState("songs");
  const [libraryGroup, setLibraryGroup] = useState<string | null>(null);

  const [sort, setSort] = useState<LibrarySortPreference>(readLibrarySortPreference);

  useEffect(() => {
    writeLibrarySortPreference(sort);
  }, [sort]);

  const [theme, setTheme] =
    useState<ThemePreferences>(readTheme);

  const [deleting, setDeleting] =
    useState<Track | null>(null);

  const [editingTrack, setEditingTrack] =
    useState<Track | null>(null);

  const [origin, setOrigin] = useState("Biblioteca");

  const fileInput = useRef<HTMLInputElement>(null);
  const backupInput = useRef<HTMLInputElement>(null);

  const { audioRef, ...player } = usePlayer(
    tracks,
    setMessage,
  );

  const navigate = useNavigate();

  const ambient = useArtworkColor(player.current);

  // Temas

  const selectedTheme =
    themes.find((item) => item.id === theme.id) ??
    themes[0];

  const background =
    theme.id === "custom"
      ? theme.background
      : selectedTheme.bg;

  const accent =
    theme.id === "custom"
      ? theme.accent
      : selectedTheme.accent;

  const style = {
    "--bg": background,
    "--panel":
      theme.id === "custom"
        ? background
        : selectedTheme.panel,
    "--accent": accent,
    "--art-color": ambient,
    "--dynamic-accent": theme.id === "dynamic" ? ambient : accent,
    "--wallpaper":
      theme.id === "custom" && theme.backgroundImage
        ? `url("${theme.backgroundImage}")`
        : "none",
    "--ink":
      contrast(accent, "#000000") >=
      contrast(accent, "#ffffff")
        ? "#000000"
        : "#ffffff",
  } as CSSProperties;

  function changeTheme(value: ThemePreferences) {
    if (
      value.id === "custom" &&
      (contrast(value.background, "#f5f5ed") < 4.5 ||
        contrast(value.background, value.accent) < 3)
    ) {
      setMessage(
        "Escolhe cores com contraste suficiente.",
      );
      return;
    }

    setTheme(value);

    try {
      localStorage.setItem(
        "my-music-theme",
        JSON.stringify(value),
      );
    } catch {
      setMessage(
        "Tema aplicado, mas não foi possível guardar a preferência.",
      );
    }
  }

  // Importação

  async function importFiles(files: FileList | null) {
    if (!files?.length || busy) return;
    if (!window.isSecureContext || !globalThis.crypto?.subtle) {
      setMessage("Para importar, abre por HTTPS e confia no certificado nas Definições do iPhone.");
      return;
    }

    setBusy(true);

    let added = 0;
    let duplicates = 0;

    const failures: string[] = [];

    try {
      for (
        const [index, file] of
        Array.from(files).entries()
      ) {
        setProgress(
          `A importar ${index + 1} de ${files.length}…`,
        );

        try {
          const result = await importAudio(file);

          if (result === "added") added++;
          else duplicates++;
        } catch (error) {
          failures.push(
            `${file.name}: ${errorMessage(error)}`,
          );
        }
      }

      setMessage(
        `${added} música(s) importada(s).` +
        (duplicates
          ? ` ${duplicates} duplicada(s) ignorada(s).`
          : "") +
        (failures.length
          ? ` ${failures.length} falharam. ${failures[0]}`
          : ""),
      );
    } finally {
      setBusy(false);
      setProgress("");
    }
  }

  function importButton(label = "Importar") {
    return (
      <button
        type="button"
        className="button primary"
        disabled={busy || !!libraryError}
        onClick={() => fileInput.current?.click()}
      >
        {busy ? (
          <LoaderCircle className="spin" size={18} />
        ) : (
          <Plus size={18} />
        )}

        {busy ? progress || "A preparar…" : label}
      </button>
    );
  }

  // Exportação

  async function runExport(track?: Track) {
    setBusy(true);

    try {
      if (track) await exportTrack(track);
      else await exportBackup();
    } catch (error) {
      if (
        !(
          error instanceof DOMException &&
          error.name === "AbortError"
        )
      ) {
        setMessage(errorMessage(error));
      }
    } finally {
      setBusy(false);
    }
  }

  async function runRestore(file: File | undefined, mode: "merge" | "replace") {
    if (!file) return;
    setBusy(true); setProgress("A validar e restaurar backup…");
    try {
      const result = await restoreBackup(file, mode);
      setMessage(`Restauro concluído: ${result.tracks} músicas no backup.`);
      await window.location.reload();
    } catch (error) { setMessage(errorMessage(error)); }
    finally { setBusy(false); setProgress(""); if (backupInput.current) backupInput.current.value = ""; }
  }

  // Eliminar música

  async function confirmDelete() {
    if (!deleting) return;

    try {
      if (player.current?.id === deleting.id) {
        player.stop();
      }

      await removeTrack(deleting.id);

      setDeleting(null);
      setMessage("Música removida.");
    } catch (error) {
      setMessage(errorMessage(error));
    }
  }

  function runCollection(
    action: () => Promise<unknown>,
  ) {
    void action().catch((error) =>
      setMessage(errorMessage(error)),
    );
  }

  // Biblioteca e filtros


  const selectedPlaylist =
    collections.playlists.find(
      (playlist) => playlist.id === selection,
    );

  const selectedIds = useMemo(() =>
    selection === "favorites"
      ? collections.favorites
      : selection === "history"
        ? collections.history.map((item) => item.id)
        : selectedPlaylist?.trackIds,
  [selection, collections.favorites, collections.history, selectedPlaylist]);
  const selectedTrackIds = useMemo(() => selectedIds ? new Set(selectedIds) : null, [selectedIds]);
  const selectedOrder = useMemo(() => selection === "history" && selectedIds
    ? new Map(selectedIds.map((id, index) => [id, index]))
    : null, [selection, selectedIds]);
  const libraryTracks = useMemo(() => {
    const filtered = selectTracks(
      tracks.filter(track => !selectedTrackIds || selectedTrackIds.has(track.id)),
      libraryQuery,
      sort.field,
      ["title", "artist", "album"],
      sort.direction,
    );
    if (selectedOrder) filtered.sort((a, b) =>
      (selectedOrder.get(a.id) ?? 0) - (selectedOrder.get(b.id) ?? 0));
    return filtered;
  }, [tracks, selectedTrackIds, selectedOrder, libraryQuery, sort]);

  const searchTracks = useMemo(() => searchQuery.trim()
    ? selectTracks(tracks, searchQuery, "addedAt")
    : [], [tracks, searchQuery]);

  const libraryGroups = useMemo(() => {
    if (libraryView !== "artists" && libraryView !== "albums") return [];
    const grouped = new Map<string, Track[]>();
    for (const track of tracks) {
      if (libraryView === "albums" && !track.album) continue;
      const key = libraryView === "artists" ? track.artist : JSON.stringify([track.artist, track.album]);
      const items = grouped.get(key) ?? [];
      items.push(track);
      grouped.set(key, items);
    }
    return [...grouped].map(([key, items]) => ({
      key,
      label: libraryView === "artists" ? key : (JSON.parse(key) as string[])[1]!,
      tracks: items,
    }));
  }, [tracks, libraryView]);

  // Lista de músicas

  function trackList(
    items: Track[],
    source = "Biblioteca",
  ) {
    return (
      <TrackList
        tracks={items}
        currentId={player.current?.id}
        playing={player.playing}
        busy={busy}
        favorites={collections.favorites}
        playlists={collections.playlists}
        onPlay={(track) => {
          setOrigin(source);
          void player.playTrack(track, items);
        }}
        onExport={runExport}
        onDelete={setDeleting}
        onEdit={(track) => { setRefreshInfo(false); setEditingTrack(track); }}
        onRefresh={(track) => { setRefreshInfo(true); setEditingTrack(track); }}
        onFavorite={(id) =>
          runCollection(() => toggleFavorite(id))
        }
        onEnqueue={player.enqueue}
        onPlaylist={(id, trackId, add) =>
          runCollection(() =>
            playlistTrack(id, trackId, add),
          )
        }
      />
    );
  }

  function empty(
    title: string,
    description?: string,
  ) {
    return (
      <div className="empty">
        <div className="empty-icon">
          <Music2 size={28} />
        </div>

        <h3>{title}</h3>

        {description && <p>{description}</p>}
      </div>
    );
  }

  // Pesquisa

  function SearchPage() {
    return (
      <>
        <div className="page-heading">
          <div>
            <h1>Pesquisar</h1>
          </div>
        </div>

        <div className="browse-tabs library-tabs" role="group" aria-label="Onde pesquisar">
          <button aria-pressed={searchMode === 'device'} onClick={() => setSearchMode('device')}>No dispositivo</button>
          <button aria-pressed={searchMode === 'online'} onClick={() => setSearchMode('online')}>Online</button>
        </div>
        {searchMode === 'online' ? <OnlineSearch /> : <>
        <label className="search-field">
          <Search size={20} />

          <input
            aria-label="Pesquisar músicas"
            placeholder="Música, artista ou álbum"
            value={searchQuery}
            onChange={(event) =>
              setSearchQuery(event.target.value)
            }
          />

          {searchQuery && (
            <button
              type="button"
              className="icon-button"
              aria-label="Limpar pesquisa"
              onClick={() => setSearchQuery("")}
            >
              <X size={18} />
            </button>
          )}
        </label>

        {loading ? (
          <p role="status">A carregar…</p>
        ) : !searchQuery.trim() ? (
          empty("Pesquisa na tua biblioteca")
        ) : searchTracks.length ? (
          trackList(searchTracks, "Pesquisa")
        ) : (
          empty("Nenhum resultado")
        )}
        </>}
      </>
    );
  }

  // Biblioteca

  function LibraryPage() {
    const groups = libraryGroups;
    const groupLabel = (key: string) => groups.find(group => group.key === key)?.label ?? key;
    const groupTracks = (key: string) => groups.find(group => group.key === key)?.tracks ?? [];
    const source =
      selectedPlaylist?.name ??
      (selection === "favorites"
        ? "Favoritas"
        : selection === "history"
          ? "Histórico"
          : "Biblioteca");

    return (
      <>
        <div className="page-heading">
          <div>
            <h1>Biblioteca</h1>
            <p className="muted">
              {tracks.length} músicas
            </p>
          </div>

          {importButton()}
        </div>

        <div className="browse-tabs library-tabs" role="group" aria-label="Ver biblioteca">
          {[["songs", "Músicas"], ["artists", "Artistas"], ["albums", "Álbuns"], ["playlists", "Playlists"]].map(([id, label]) => (
            <button key={id} aria-pressed={libraryView === id} onClick={() => { setLibraryView(id); setLibraryGroup(null); setSelection("all"); }}>{label}</button>
          ))}
        </div>

        {libraryView === "songs" && tracks.length > 0 && (
          <label className="search-field">
            <Search size={20} />

            <input
              aria-label="Pesquisar na biblioteca"
              type="search"
              placeholder="Filtrar músicas"
              value={libraryQuery}
              onChange={(event) =>
                setLibraryQuery(event.target.value)
              }
            />
            {libraryQuery && (
              <button
                type="button"
                className="icon-button"
                aria-label="Limpar pesquisa da biblioteca"
                onClick={() => setLibraryQuery("")}
              >
                <X size={18} />
              </button>
            )}
          </label>
        )}

        {(libraryView === "songs" || libraryView === "playlists") && <LibraryControls
          showCreate={libraryView === "playlists"}
          showSort={libraryView === "songs"}
          playlists={collections.playlists}
          selection={selection}
          onSelection={setSelection}
          sort={sort}
          onSort={setSort}
          run={runCollection}
        />}

        {(libraryView === "artists" || libraryView === "albums") ? (
          libraryGroup ? <>
            <button className="text-link" onClick={() => setLibraryGroup(null)}>Voltar a {libraryView === "artists" ? "artistas" : "álbuns"}</button>
            <h2>{groupLabel(libraryGroup)}</h2>
            {trackList(groupTracks(libraryGroup), groupLabel(libraryGroup))}
          </> : <div className="library-groups">
            {groups.map(({ key, label, tracks: items }) => {
              return <button className="resume-card" key={key} onClick={() => setLibraryGroup(key)}>
                <Cover title={label} artwork={items[0]?.artwork} />
                <span><strong>{label}</strong><small>{items.length} músicas</small></span><ChevronRight size={18} />
              </button>;
            })}
            {!groups.length && <p className="muted">Sem {libraryView === "artists" ? "artistas" : "álbuns"}.</p>}
          </div>
        ) : <>

        {libraryView === "playlists" && selection === "all" ? (
          <div className="library-groups">
            {collections.playlists.map(playlist => <button className="resume-card" key={playlist.id} onClick={() => setSelection(playlist.id)}>
              <span><strong>{playlist.name}</strong><small>{playlist.trackIds.length} músicas</small></span><ChevronRight size={18} />
            </button>)}
            {!collections.playlists.length && <p className="muted">Sem playlists.</p>}
          </div>
        ) : loading ? (
          <p role="status">A carregar…</p>
        ) : libraryTracks.length ? (
          trackList(libraryTracks, source)
        ) : tracks.length === 0 ? (
          <div className="empty">
            <div className="empty-icon">
              <Music2 size={28} />
            </div>

            <h3>Biblioteca vazia</h3>
            {importButton("Importar músicas")}
          </div>
        ) : (
          empty("Nenhuma música encontrada")
        )}
        </>}
      </>
    );
  }

  // Página de temas

  function ThemesPage() {
    return (
      <>
        <div className="page-heading">
          <div>
            <h1>Temas</h1>
          </div>
        </div>

        <div className="theme-grid">
          {themes.map((item) => (
            <button
              type="button"
              key={item.id}
              aria-pressed={theme.id === item.id}
              className={
                `theme-card ${
                  theme.id === item.id ? "active" : ""
                }`
              }
              onClick={() =>
                changeTheme({ ...theme, id: item.id })
              }
            >
              <div
                className={
                  `theme-preview preview-${item.id}`
                }
                style={{
                  background: item.bg,
                  color: item.accent,
                }}
              >
                <div className="preview-nav" />

                <Disc3 size={62} />

                <div className="preview-bars">
                  <i />
                  <i />
                  <i />
                </div>

                {theme.id === item.id && (
                  <span className="theme-check">
                    <Check size={17} />
                  </span>
                )}
              </div>

              <strong>{item.name}</strong>
            </button>
          ))}
        </div>

        {theme.id === "custom" && (
          <section className="settings-card">
            <h2>Personalizar</h2>

            <label className="wallpaper-upload">
              Imagem de fundo
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                aria-label="Imagem de fundo personalizada"
                onChange={(event) => {
                  const file = event.target.files?.[0];

                  if (file) {
                    void imageData(file)
                      .then((backgroundImage) =>
                        changeTheme({
                          ...theme,
                          backgroundImage,
                        }),
                      )
                      .catch((error) =>
                        setMessage(errorMessage(error)),
                      );
                  }

                  event.target.value = "";
                }}
              />
            </label>

            {theme.backgroundImage && (
              <button
                type="button"
                className="button secondary"
                onClick={() =>
                  changeTheme({
                    ...theme,
                    backgroundImage: undefined,
                  })
                }
              >
                Remover fundo
              </button>
            )}

            <div className="color-fields">
              <label>
                Fundo
                <input
                  type="color"
                  value={theme.background}
                  onChange={(event) =>
                    changeTheme({
                      ...theme,
                      background: event.target.value,
                    })
                  }
                />
              </label>

              <label>
                Destaque
                <input
                  type="color"
                  value={theme.accent}
                  onChange={(event) =>
                    changeTheme({
                      ...theme,
                      accent: event.target.value,
                    })
                  }
                />
              </label>
            </div>
          </section>
        )}
      </>
    );
  }

  // Definições

  function SettingsPage() {
    return (
      <>
        <div className="page-heading">
          <h1>Definições</h1>
        </div>

        <input ref={backupInput} hidden type="file" accept=".zip,application/zip" onChange={e => {
          const file = e.currentTarget.files?.[0]; if (!file) return;
          const mode = window.confirm("OK: combinar com a biblioteca atual. Cancelar: substituir os dados atuais.") ? "merge" : "replace";
          if (mode === "replace" && !window.confirm("Substituir a biblioteca atual? Esta operação não pode ser desfeita.")) { e.currentTarget.value = ""; return; }
          void runRestore(file, mode);
        }} />
        <section className="settings-section">
          <h2>Aparência</h2>
          <NavLink to="/themes" className="settings-row"><Palette size={18}/><span>Tema da aplicação</span><small>{selectedTheme.name}</small><ChevronRight size={17}/></NavLink>
        </section>
        <section className="settings-section">
          <h2>Biblioteca</h2>
          <NavLink to="/library" className="settings-row"><HardDrive size={18}/><span>Atualizar metadados</span><small>Por faixa</small><ChevronRight size={17}/></NavLink>
          <div className="batch-update">
            {batchProgress ? <div className="settings-row batch-progress"><RefreshCw size={17} className="batch-spinner"/><span><strong>{batchProgress.index} de {batchProgress.total} músicas</strong><small>{batchProgress.title}</small></span><button className="settings-action" onClick={() => batchAbort.current?.abort()}>Cancelar</button></div> : <button className="settings-row settings-button batch-action" disabled={tracks.length === 0} onClick={startBatchMetadataUpdate}><RefreshCw size={17}/><span>Atualizar toda a biblioteca</span><ChevronRight size={17}/></button>}
            {batchSummary && <p role="status">Atualizadas: {batchSummary.updated} · Sem alterações: {batchSummary.unchanged} · Não encontradas: {batchSummary.notFound} · Falhadas: {batchSummary.failed}</p>}
          </div>
        </section>
        <StorageSettings tracks={tracks} currentTrackId={player.current?.id} isPlaying={player.playing} onDelete={setDeleting} />
        <section className="settings-section">
          <h2>Dados</h2>
          <button className="settings-row settings-button" disabled={busy || tracks.length === 0} onClick={() => void runExport()}><ArrowDownToLine size={18}/><span>Exportar biblioteca</span><small>{busy ? progress || "A preparar…" : "ZIP"}</small></button>
          <button className="settings-row settings-button" disabled={busy} onClick={() => backupInput.current?.click()}><ArrowUpFromLine size={18}/><span>Restaurar backup</span><ChevronRight size={17}/></button>
        </section>
        <section className="settings-section">
          <h2>Sobre</h2>
          <div className="settings-row"><Music2 size={18}/><span>My Music</span><small>Versão 2.6</small></div>
        </section>
      </>
    );
  }

  return (
    <div
      className={
        `app theme-${theme.id} ${
          player.current ? "has-player" : ""
        }`
      }
      style={style}
    >
      <a
        className="skip-link"
        href="#main"
        onClick={(event) => {
          event.preventDefault();
          document.getElementById("main")?.focus();
        }}
      >
        Saltar para o conteúdo
      </a>

      <input
        ref={fileInput}
        className="sr-only"
        type="file"
        accept={AUDIO_ACCEPT}
        multiple
        aria-label="Importar ficheiros de áudio"
        tabIndex={-1}
        onChange={(event) => {
          void importFiles(event.target.files);
          event.target.value = "";
        }}
      />

      {/* Navegação desktop */}

      <aside className="sidebar">
        <NavLink
          className="brand"
          to="/"
          aria-label="My Music — Início"
        >
          <span className="brand-icon">
            <Music2 size={25} />
          </span>

          my music
        </NavLink>

        <nav aria-label="Navegação principal">
          {navigation.map(
            ({ to, label, icon: Icon }) => (
              <NavLink end to={to} key={to}>
                <Icon size={20} />
                {label}
                <ChevronRight
                  className="nav-arrow"
                  size={15}
                />
              </NavLink>
            ),
          )}
        </nav>

        <NavLink
          className="settings-link"
          to="/settings"
        >
          <Settings2 size={19} />
          Definições
        </NavLink>
      </aside>

      {/* Conteúdo */}

      <main
        id="main"
        className="main"
        tabIndex={-1}
      >
        {libraryError && (
          <div role="alert" className="notice error">
            {libraryError}
          </div>
        )}

        {updateAvailable && (
          <div className="notice update-notice" role="status">
            <span>Está disponível uma atualização do My Music.</span>
            <button type="button" className="settings-action" onClick={() => window.dispatchEvent(new Event("my-music-apply-update"))}>Atualizar</button>
          </div>
        )}

        {message && (
          <div className="notice" role="status">
            <span>{message}</span>

            <button
              type="button"
              className="icon-button"
              aria-label="Fechar"
              onClick={() => setMessage("")}
            >
              <X size={18} />
            </button>
          </div>
        )}

        <Routes>
          <Route
            path="/"
            element={
              <Dashboard
                tracks={tracks}
                playlists={collections.playlists}
                favorites={collections.favorites}
                history={collections.history}
                current={player.current}
                loading={loading}
                importButton={importButton()}
                onPlay={(track, context, source) => {
                  setOrigin(source);

                  if (
                    player.current?.id === track.id
                  ) {
                    if (!player.playing) {
                      void player.toggle();
                    }
                  } else {
                    void player.playTrack(
                      track,
                      context,
                    );
                  }
                }}
                onCollection={(id) => {
                  setLibraryView(id === "all" ? "playlists" : "songs");
                  setSelection(id);
                  navigate("/library");
                }}
              />
            }
          />

          <Route
            path="/search"
            element={SearchPage()}
          />

          <Route
            path="/library"
            element={LibraryPage()}
          />

          <Route
            path="/themes"
            element={ThemesPage()}
          />

          <Route
            path="/settings"
            element={SettingsPage()}
          />

          <Route
            path="/downloads"
            element={<DownloadsPage tracks={tracks} onOpenLibrary={() => { setLibraryView("songs"); setSelection("all"); navigate("/library"); }} />}
          />

          <Route
            path="*"
            element={
              <div className="empty">
                <h1>Página não encontrada</h1>

                <NavLink
                  className="button primary"
                  to="/"
                >
                  Voltar ao início
                </NavLink>
              </div>
            }
          />
        </Routes>
      </main>

      {/* Reprodutor */}

      <Player
        player={player}
        audioRef={audioRef}
        tracks={tracks}
        onError={setMessage}
        source={origin}
        favorite={
          !!player.current &&
          collections.favorites.includes(
            player.current.id,
          )
        }
        onFavorite={
          player.current
            ? () =>
                runCollection(() =>
                  toggleFavorite(
                    player.current!.id,
                  ),
                )
            : undefined
        }
      />

      {/* Navegação móvel */}

      <nav
        className="bottom-nav"
        aria-label="Navegação móvel"
      >
        {navigation.map(
          ({ to, label, icon: Icon }) => (
            <NavLink end key={to} to={to}>
              <Icon size={21} />
              <span>{label}</span>
            </NavLink>
          ),
        )}

        <NavLink to="/settings">
          <Settings2 size={21} />
          <span>Definições</span>
        </NavLink>
      </nav>

      {/* Editor */}

      {editingTrack && (
        <TrackEditor
          key={editingTrack.id}
          refresh={refreshInfo}
          track={editingTrack}
          close={() => setEditingTrack(null)}
          onError={setMessage}
        />
      )}

      {/* Confirmar eliminação */}

      {deleting && (
        <div className="dialog-backdrop">
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="delete-title"
            className="dialog"
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                setDeleting(null);
              }

              if (event.key === "Tab") {
                event.preventDefault();

                const buttons =
                  event.currentTarget.querySelectorAll(
                    "button",
                  );

                const next =
                  document.activeElement === buttons[0]
                    ? buttons[1]
                    : buttons[0];

                next?.focus();
              }
            }}
          >
            <Trash2 size={28} />

            <h2 id="delete-title">
              Remover esta música?
            </h2>

            <p>
              “{deleting.title}” será removida da biblioteca. As playlists mantêm-se e esta faixa será retirada delas, dos favoritos e do histórico.
            </p>

            <div>
              <button
                type="button"
                className="button secondary"
                autoFocus
                onClick={() => setDeleting(null)}
              >
                Cancelar
              </button>

              <button
                type="button"
                className="button danger"
                onClick={() =>
                  void confirmDelete()
                }
              >
                Remover música
              </button>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}

export default function App() {
  return (
    <HashRouter>
      <Shell />
    </HashRouter>
  );
}
