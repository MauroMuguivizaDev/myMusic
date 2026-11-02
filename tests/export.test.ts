import { afterEach, expect, it, vi } from "vitest";
import { exportTrack } from "../src/services/export";
import { getAudio } from "../src/services/library";
import type { Track } from "../src/domain/music";
vi.mock("../src/services/library", () => ({ getAudio: vi.fn(), db: {} }));
const track: Track = {
  id: "1",
  title: "Music",
  artist: "",
  album: "",
  mime: "audio/mpeg",
  fileName: "music.mp3",
  size: 5,
  addedAt: 0,
};
afterEach(() => {
  vi.restoreAllMocks();
  vi.clearAllMocks();
  vi.useRealTimers();
  Object.defineProperty(navigator, "share", {
    value: undefined,
    configurable: true,
  });
  Object.defineProperty(navigator, "canShare", {
    value: undefined,
    configurable: true,
  });
});
it("partilha um ficheiro original através da API nativa quando disponível", async () => {
  vi.mocked(getAudio).mockResolvedValue(new Blob(["audio"]));
  const share = vi.fn().mockResolvedValue(undefined);
  Object.defineProperty(navigator, "canShare", {
    value: () => true,
    configurable: true,
  });
  Object.defineProperty(navigator, "share", {
    value: share,
    configurable: true,
  });
  await exportTrack(track);
  expect(share.mock.calls[0][0].files[0].name).toBe("music.mp3");
  expect(share.mock.calls[0][0].files[0].size).toBe(5);
});
it("descarrega o ficheiro se a partilha falhar e liberta o URL", async () => {
  vi.useFakeTimers();
  vi.mocked(getAudio).mockResolvedValue(new Blob(["audio"]));
  Object.defineProperty(navigator, "canShare", {
    value: () => true,
    configurable: true,
  });
  Object.defineProperty(navigator, "share", {
    value: vi
      .fn()
      .mockRejectedValue(new DOMException("denied", "NotAllowedError")),
    configurable: true,
  });
  const click = vi
    .spyOn(HTMLAnchorElement.prototype, "click")
    .mockImplementation(() => {});
  await exportTrack(track);
  expect(click).toHaveBeenCalledOnce();
  vi.runAllTimers();
  expect(URL.revokeObjectURL).toHaveBeenCalledOnce();
});
