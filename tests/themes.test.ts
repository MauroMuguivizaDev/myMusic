import { afterEach, expect, it, vi } from "vitest";
import { contrast, readTheme, themes } from "../src/domain/themes";
afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
});
it("recupera de preferências inválidas e armazenamento bloqueado", () => {
  localStorage.setItem("my-music-theme", "{invalid");
  expect(readTheme().id).toBe("amoled");
  vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
    throw new Error("blocked");
  });
  expect(readTheme().id).toBe("amoled");
});

it("os temas fornecem contraste legível", () => {
  for (const theme of themes) {
    const textColor =
      theme.id === "glass"
        ? "#171821"
        : "#f5f5ed";

    expect(
      contrast(theme.bg, textColor),
    ).toBeGreaterThanOrEqual(4.5);

    expect(
      contrast(theme.bg, theme.accent),
    ).toBeGreaterThanOrEqual(4.5);
  }
});

