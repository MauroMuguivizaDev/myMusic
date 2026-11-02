
import {
  useState,
  type RefObject,
  type CSSProperties,
} from "react";

import { AnimatePresence, motion, useReducedMotion } from "motion/react";

import {
  ChevronDown,
  Ellipsis,
  LoaderCircle,
  Pause,
  Play,
  SkipBack,
  SkipForward,
  Volume2,
  VolumeX,
  Shuffle,
  Repeat,
  Repeat1,
  ListMusic,
  Heart,
  AlignLeft,
  ArrowUp,
  ArrowDown,
  X,
} from "lucide-react";

import { formatTime } from "../domain/music";
import type { Track } from "../domain/music";
import type { usePlayer } from "../hooks/usePlayer";

import { Cover } from "./Cover";
import { Modal } from "./Modal";
import { Lyrics } from "./Lyrics";

interface Props {
  player: Omit<ReturnType<typeof usePlayer>, "audioRef">;
  audioRef: RefObject<HTMLAudioElement | null>;
  tracks: Track[];
  onError: (message: string) => void;
  favorite?: boolean;
  onFavorite?: () => void;
  source?: string;
}

const spring = {
  type: "spring" as const,
  stiffness: 320,
  damping: 30,
  mass: 0.85,
};

export function Player({
  player,
  audioRef,
  favorite,
  onFavorite,
  source = "Biblioteca",
}: Props) {
  const [panel, setPanel] = useState<
    "player" | "queue" | "lyrics" | null
  >(null);

  const [options, setOptions] = useState(false);

  const reduceMotion = useReducedMotion();
  const current = player.current;

  const repeatIcon =
    player.repeat === "one" ? (
      <Repeat1 size={21} />
    ) : (
      <Repeat size={21} />
    );

  const playButton = (mini = false) => (
    <motion.button
      type="button"
      className={
        mini ? "mini-play icon-button" : "play-button"
      }
      disabled={!current || player.loading}
      aria-label={
        player.playing ? "Pausar" : "Reproduzir"
      }
      onClick={() => void player.toggle()}
      whileTap={
        reduceMotion ? undefined : { scale: 0.94 }
      }
      transition={spring}
    >
      <AnimatePresence mode="wait" initial={false}>
        <motion.span
          key={player.loading ? 'loading' : player.playing ? 'pause' : 'play'}
          className="player-state-icon"
          initial={reduceMotion ? false : { opacity: 0, scale: 0.86 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: reduceMotion ? 1 : 0.9 }}
          transition={reduceMotion ? { duration: 0 } : { duration: 0.12, ease: 'easeOut' }}
        >
          {player.loading ? <LoaderCircle className="spin" size={mini ? 19 : 26} /> : player.playing ? <Pause size={mini ? 22 : 28} fill="currentColor" /> : <Play size={mini ? 22 : 28} fill="currentColor" />}
        </motion.span>
      </AnimatePresence>
    </motion.button>
  );

  const transport = (
    <div className="transport">
      <button
        type="button"
        className="icon-button secondary-transport"
        aria-label="Shuffle"
        aria-pressed={player.shuffle}
        onClick={player.toggleShuffle}
      >
        <Shuffle size={21} />
      </button>

      <button
        type="button"
        className="icon-button skip-button"
        aria-label="Música anterior"
        disabled={!player.canPrevious}
        onClick={() => player.step(-1)}
      >
        <SkipBack size={29} fill="currentColor" />
      </button>

      {playButton()}

      <button
        type="button"
        className="icon-button skip-button"
        aria-label="Música seguinte"
        disabled={!player.canNext}
        onClick={() => player.step(1)}
      >
        <SkipForward size={29} fill="currentColor" />
      </button>

      <button
        type="button"
        className="icon-button secondary-transport"
        aria-label={`Repetição: ${player.repeat}`}
        aria-pressed={player.repeat !== "off"}
        onClick={player.cycleRepeat}
      >
        {repeatIcon}
      </button>
    </div>
  );

  const seek = (
    <div className="seek">
      <input
        type="range"
        aria-label="Posição da reprodução"
        min={0}
        max={player.duration || 1}
        step={0.1}
        value={Math.min(
          player.position,
          player.duration || 1
        )}
        disabled={!player.duration}
        onChange={(event) =>
          player.seek(Number(event.target.value))
        }
        style={
          {
            "--progress": `${
              player.duration
                ? (player.position / player.duration) * 100
                : 0
            }%`,
          } as CSSProperties
        }
      />

      <div className="seek-times">
        <span>{formatTime(player.position)}</span>
        <span>{formatTime(player.duration)}</span>
      </div>
    </div>
  );

  const volume = (
    <label className="volume">
      <button type="button" className="volume-mute" aria-label={player.volume === 0 ? "Ativar som" : "Silenciar"} onClick={player.toggleMute}>
        {player.volume === 0 ? <VolumeX size={18} /> : <Volume2 size={18} />}
      </button>

      <span className="sr-only">Volume</span>

      <input
        aria-label="Volume"
        type="range"
        min={0}
        max={1}
        step={0.01}
        value={player.volume}
        onChange={(event) =>
          player.changeVolume(Number(event.target.value))
        }
      />
    </label>
  );

  const menu = (
    <div
      className="player-options"
      role="region"
      aria-label="Opções de reprodução"
    >
      <label>
        Velocidade

        <select
          aria-label="Velocidade"
          value={player.rate}
          onChange={(event) =>
            player.changeRate(Number(event.target.value))
          }
        >
          {[0.5, 0.75, 1, 1.25, 1.5, 1.75, 2].map(
            (rate) => (
              <option key={rate} value={rate}>
                {rate}×
              </option>
            )
          )}
        </select>
      </label>

      <label>
        Temporizador

        <select
          aria-label="Temporizador para dormir"
          value={player.sleepAt ? "active" : "0"}
          onChange={(event) =>
            player.setSleep(Number(event.target.value))
          }
        >
          <option value="0">Desligado</option>

          {player.sleepAt && (
            <option value="active">
              Até{" "}
              {new Date(
                player.sleepAt
              ).toLocaleTimeString([], {
                hour: "2-digit",
                minute: "2-digit",
              })}
            </option>
          )}

          {[1, 5, 15, 30, 60].map((minutes) => (
            <option key={minutes} value={minutes}>
              {minutes} min
            </option>
          ))}
        </select>
      </label>

      {volume}

      <button
        type="button"
        className="text-link"
        onClick={() => {
          player.stop();
          setOptions(false);
        }}
      >
        Terminar sessão
      </button>
    </div>
  );

  const close = () => {
    setPanel(null);
    setOptions(false);
  };

  return (
    <>
      {/* Mini-player */}

      <AnimatePresence initial={false}>
      {current && (
        <motion.section
          key="mini-player"
          className="player"
          aria-label="Reprodutor musical"
          initial={
            reduceMotion
              ? false
              : {
                  opacity: 0,
                  y: 16,
                  scale: 0.98,
                }
          }
          animate={{
            opacity: 1,
            y: 0,
            scale: 1,
          }}
          exit={{ opacity: 0, y: reduceMotion ? 0 : 12 }}
          transition={reduceMotion ? { duration: 0 } : spring}
        >
          <button
            type="button"
            className="now-playing expand-player"
            aria-label="Expandir reprodutor"
            onClick={() => setPanel("player")}
          >
            <Cover
              title={current.title}
              artwork={current.artwork}
              animateChange
            />

            <span>
              <strong>{current.title}</strong>
              <small>{current.artist}</small>
            </span>
          </button>

          <div className="mini-controls">
            {playButton(true)}

            <button
              type="button"
              className="icon-button mini-next"
              aria-label="Música seguinte"
              disabled={!player.canNext}
              onClick={() => player.step(1)}
            >
              <SkipForward
                size={20}
                fill="currentColor"
              />
            </button>

            <button
              type="button"
              className="icon-button mini-queue"
              aria-label="Abrir fila"
              onClick={() => setPanel("queue")}
            >
              <ListMusic size={20} />
            </button>
          </div>

          <div
            className="mini-progress"
            role="progressbar"
            aria-label="Progresso da música"
            aria-valuemin={0}
            aria-valuemax={player.duration || 1}
            aria-valuenow={Math.min(
              player.position,
              player.duration || 1
            )}
          >
            <span
              style={{
                width: `${
                  player.duration
                    ? Math.min(
                        100,
                        (player.position / player.duration) *
                          100
                      )
                    : 0
                }%`,
              }}
            />
          </div>
        </motion.section>
      )}
      </AnimatePresence>

      {/* Elemento de áudio persistente */}

      <audio
        ref={audioRef}
        preload="metadata"
        onLoadedMetadata={player.onMetadata}
        onTimeUpdate={player.onTime}
        onPlay={player.onPlay}
        onPause={player.onPause}
        onEnded={player.onEnded}
        onError={player.onAudioError}
      />

      {/* Reprodutor expandido e painéis */}

      <AnimatePresence>
      {panel && (
        <Modal
          key="player-panel"
          label={
            panel === "queue"
              ? "Fila de reprodução"
              : panel === "lyrics"
                ? "Letras"
                : "A tocar agora"
          }
          full={panel === "player"}
          close={close}
          header={
            panel === "player" ? (
              <>
                <button
                  type="button"
                  className="icon-button"
                  aria-label="Fechar"
                  onClick={close}
                >
                  <ChevronDown size={26} />
                </button>

                <div className="player-source">
                  <strong>{source}</strong>
                </div>

                <button
                  type="button"
                  className="icon-button"
                  aria-label="Mais opções"
                  aria-expanded={options}
                  onClick={() =>
                    setOptions((value) => !value)
                  }
                >
                  <Ellipsis size={25} />
                </button>
              </>
            ) : undefined
          }
        >
          {player.playbackError && (
            <p className="notice error" role="alert">
              {player.playbackError}
            </p>
          )}

          <AnimatePresence mode="wait" initial={false}>
          {panel === "player" ? (
            <motion.div
              key="expanded-content"
              className="expanded-content"
              initial={reduceMotion ? false : { opacity: 0, y: 5 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: reduceMotion ? 0 : -4 }}
              transition={reduceMotion ? { duration: 0 } : { duration: 0.16, ease: 'easeOut' }}
            >
              {options && menu}

              {/* Capa animada */}

              <motion.div
                className="album-stage"
                key={current?.id ?? "empty"}
                initial={
                  reduceMotion
                    ? false
                    : {
                        opacity: 0,
                        scale: 0.96,
                        y: 12,
                      }
                }
                animate={{
                  opacity: 1,
                  scale: 1,
                  y: 0,
                }}
                transition={reduceMotion ? { duration: 0 } : spring}
              >
                <Cover
                  title={current?.title}
                  artwork={current?.artwork}
                  animateChange
                />
              </motion.div>

              {/* Título e artista */}

              <div className="expanded-meta">
                <div>
                  <h1>
                    {current?.title ?? "Sem reprodução"}
                  </h1>

                  <p>
                    {current?.artist ??
                      "Escolhe uma música na biblioteca"}
                  </p>
                </div>

                {onFavorite && (
                  <button
                    type="button"
                    className="icon-button favorite-button"
                    aria-label="Favorito"
                    aria-pressed={favorite}
                    onClick={onFavorite}
                  >
                    <Heart
                      size={24}
                      fill={
                        favorite
                          ? "currentColor"
                          : "none"
                      }
                    />
                  </button>
                )}
              </div>

              {seek}
              {transport}

              <div className="player-bottom">

                <button
                  type="button"
                  aria-label="Letras"
                  disabled={!current}
                  onClick={() => {
                    setPanel("lyrics");
                    setOptions(false);
                  }}
                >
                  <AlignLeft size={21} />
                  <span>Letras</span>
                </button>

                <button
                  type="button"
                  aria-label={`Fila (${player.queue.length})`}
                  onClick={() => {
                    setPanel("queue");
                    setOptions(false);
                  }}
                >
                  <ListMusic size={21} />
                  <span>Fila</span>
                </button>
              </div>
            </motion.div>
          ) : (
            <motion.div
              key={panel}
              className="secondary-panel"
              initial={reduceMotion ? false : { opacity: 0, y: 5 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: reduceMotion ? 0 : -4 }}
              transition={reduceMotion ? { duration: 0 } : { duration: 0.16, ease: 'easeOut' }}
            >
              <div className="panel-tabs">
                <button
                  type="button"
                  className="text-link"
                  onClick={() => setPanel("player")}
                >
                  Ver reprodutor
                </button>

                <button
                  type="button"
                  className="text-link"
                  aria-pressed={panel === "lyrics"}
                  onClick={() => setPanel("lyrics")}
                >
                  Letras
                </button>

                <button
                  type="button"
                  className="text-link"
                  aria-pressed={panel === "queue"}
                  onClick={() => setPanel("queue")}
                >
                  Fila ({player.queue.length})
                </button>
              </div>

              {panel === "lyrics" ? (
                current ? (
                  <Lyrics
                    key={current.id}
                    track={current}
                    position={player.position}
                  />
                ) : (
                  <p>
                    Escolhe uma música para ver as letras.
                  </p>
                )
              ) : (
                <section className="queue-view">
                  <div className="section-heading">
                    <p className="muted">
                      {player.queue.length} músicas na fila
                    </p>

                    <button
                      type="button"
                      className="text-link"
                      disabled={!player.queue.length}
                      onClick={player.clearQueue}
                    >
                      Limpar fila
                    </button>
                  </div>

                  {player.queue.length ? (
                    <ol>
                      {player.queue.map((track, index) => (
                        <li
                          key={track.id}
                          className={
                            track.id === current?.id
                              ? "current-queue"
                              : ""
                          }
                        >
                          <Cover
                            title={track.title}
                            artwork={track.artwork}
                          />

                          <button
                            type="button"
                            className="queue-title"
                            onClick={() =>
                              void player.playTrack(track)
                            }
                          >
                            {track.title}
                            <small>{track.artist}</small>
                          </button>

                          <button
                            type="button"
                            className="icon-button"
                            disabled={!index}
                            aria-label={`Subir ${track.title}`}
                            onClick={() =>
                              player.moveQueued(index, -1)
                            }
                          >
                            <ArrowUp size={17} />
                          </button>

                          <button
                            type="button"
                            className="icon-button"
                            disabled={
                              index ===
                              player.queue.length - 1
                            }
                            aria-label={`Descer ${track.title}`}
                            onClick={() =>
                              player.moveQueued(index, 1)
                            }
                          >
                            <ArrowDown size={17} />
                          </button>

                          <button
                            type="button"
                            className="icon-button"
                            aria-label={`Retirar ${track.title} da fila`}
                            onClick={() =>
                              player.removeQueued(track.id)
                            }
                          >
                            <X size={17} />
                          </button>
                        </li>
                      ))}
                    </ol>
                  ) : (
                    <p className="section-empty">
                      Adiciona músicas à fila na biblioteca.
                    </p>
                  )}
                </section>
              )}
            </motion.div>
          )}
          </AnimatePresence>
        </Modal>
      )}
      </AnimatePresence>
    </>
  );
}
