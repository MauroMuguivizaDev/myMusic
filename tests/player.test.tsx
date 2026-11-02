import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { usePlayer } from "../src/hooks/usePlayer";
import type { Track } from "../src/domain/music";
import { getAudio } from "../src/services/library";
vi.mock("../src/services/library", () => ({
  getAudio: vi.fn(),
  db: { tracks: { update: vi.fn().mockResolvedValue(1) } },
}));
const makeTrack = (id: string): Track => ({
  id,
  title: id,
  artist: "",
  album: "",
  fileName: `${id}.mp3`,
  mime: "audio/mpeg",
  size: 1,
  addedAt: 0,
});
afterEach(() => {
  vi.clearAllMocks();
});
it("mantém o URL ao importar mais faixas e liberta-o ao trocar ou desmontar", async () => {
  vi.mocked(getAudio).mockResolvedValue(new Blob(["audio"]));
  const tracks = [makeTrack("first"), makeTrack("second")];
  const { result, rerender, unmount } = renderHook(
    ({ items }) => usePlayer(items, vi.fn()),
    { initialProps: { items: [tracks[0]] } },
  );
  const audio = document.createElement("audio");
  Object.defineProperty(result.current.audioRef, "current", {
    value: audio,
    writable: true,
  });
  await act(() => result.current.playTrack(tracks[0]));
  rerender({ items: tracks });
  expect(URL.revokeObjectURL).not.toHaveBeenCalled();
  await act(() => result.current.playTrack(tracks[1]));
  expect(URL.revokeObjectURL).toHaveBeenCalledTimes(1);
  unmount();
  expect(URL.revokeObjectURL).toHaveBeenCalledTimes(2);
});
it("ignora uma leitura antiga quando o utilizador escolhe outra música", async () => {
  let release!: (blob: Blob) => void;
  vi.mocked(getAudio)
    .mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          release = resolve;
        }),
    )
    .mockResolvedValueOnce(new Blob(["new"]));
  const tracks = [makeTrack("old"), makeTrack("new")];
  const { result } = renderHook(() => usePlayer(tracks, vi.fn()));
  Object.defineProperty(result.current.audioRef, "current", {
    value: document.createElement("audio"),
    writable: true,
  });
  let pending: Promise<void>;
  act(() => {
    pending = result.current.playTrack(tracks[0]);
  });
  await act(() => result.current.playTrack(tracks[1]));
  await act(async () => {
    release(new Blob(["old"]));
    await pending;
  });
  await waitFor(() => expect(result.current.current?.id).toBe("new"));
});
