import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { strFromU8, unzipSync } from "fflate";

import { audioFixture } from "./fixtures";

test("importar, ouvir, reabrir, exportar e usar offline", async ({
  page,
  context,
}) => {
  // Exercise the download fallback without opening the Windows native share UI.
  await context.addInitScript(() => {
    Object.defineProperty(navigator, "canShare", { value: () => false });
  });
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "A tua biblioteca está vazia" }),
  ).toBeVisible();
  await page.evaluate(async () => { await navigator.serviceWorker.ready; });
  const input = page.getByLabel("Importar ficheiros de áudio");
  const first = {
    name: "Primeiro som.wav",
    mimeType: "audio/wav",
    buffer: audioFixture(),
  };
  await input.setInputFiles(first);
  await expect(
    page.getByRole("button", { name: "Reproduzir Primeiro som", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Reproduzir Primeiro som", exact: true })
    .click();
  await expect
    .poll(() =>
      page
        .locator("audio")
        .evaluate((audio) => !(audio as HTMLAudioElement).paused),
    )
    .toBe(true);
  await input.setInputFiles({
    name: "Outro som.wav",
    mimeType: "audio/wav",
    buffer: audioFixture(660),
  });
  await expect(
    page.getByRole("button", { name: "Reproduzir Outro som", exact: true }),
  ).toBeVisible();
  expect(
    await page
      .locator("audio")
      .evaluate((audio) => !(audio as HTMLAudioElement).paused),
  ).toBe(true);
  await page.getByRole("button", { name: "Reproduzir Outro som", exact: true }).click();
  await expect.poll(() => page.locator("audio").evaluate(audio => !(audio as HTMLAudioElement).paused)).toBe(true);
  await input.setInputFiles({ ...first, name: "Cópia.wav" });
  await expect(page.getByRole("status")).toContainText(
    "duplicada(s) ignorada(s)",
  );
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Reproduzir Primeiro som", exact: true }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Ver biblioteca", exact: true }).click();
  await page
    .getByRole("searchbox", { name: "Pesquisar na biblioteca" })
    .fill("Primeiro");
  await expect(
    page.getByRole("button", { name: "Reproduzir Outro som", exact: true }),
  ).toHaveCount(0);
  await page.getByRole("searchbox", { name: "Pesquisar na biblioteca" }).fill("inexistente");
  await expect(page.getByText("Nenhuma música encontrada")).toBeVisible();
  await page.getByRole("button", { name: "Limpar pesquisa da biblioteca" }).click();
  await expect(page.getByRole("button", { name: "Reproduzir Primeiro som", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Reproduzir Primeiro som", exact: true }).click();
  await expect.poll(() => page.locator("audio").evaluate(audio => !(audio as HTMLAudioElement).paused)).toBe(true);
  await page.getByRole("button", { name: "Pausar", exact: true }).click();
  await expect.poll(() => page.locator("audio").evaluate(audio => (audio as HTMLAudioElement).paused)).toBe(true);
  const download = page.waitForEvent("download");
  await page.getByRole("combobox", { name: "Ordenar músicas" }).selectOption("title");
  await page.getByRole("button", { name: "Alternar ordem de classificação" }).click();
  await expect(page.getByRole("button", { name: "Alternar ordem de classificação" })).toHaveText("Z–A");
  await page.reload();
  await expect(page.getByRole("combobox", { name: "Ordenar músicas" })).toHaveValue("title");
  await expect(page.getByRole("button", { name: "Alternar ordem de classificação" })).toHaveText("Z–A");
  await page.getByRole("button", { name: "Reproduzir Primeiro som", exact: true }).click();
  await expect.poll(() => page.locator("audio").evaluate(audio => !(audio as HTMLAudioElement).paused)).toBe(true);
  await page.getByRole("button", { name: "Pausar", exact: true }).click();
  await page.getByLabel("Opções de Primeiro som").click();
  await page.getByRole("button", { name: "Exportar Primeiro som" }).click();
  const exported = await download;
  expect(exported.suggestedFilename()).toBe("Primeiro som.wav");
  expect(await readFile((await exported.path())!)).toEqual(first.buffer);
  await page.getByRole("searchbox", { name: "Pesquisar na biblioteca" }).fill("");
  await page.getByLabel("Opções de Outro som").click();
  await page.getByRole("button", { name: "Remover Outro som" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page
    .getByRole("button", { name: "Remover música", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Reproduzir Outro som", exact: true }),
  ).toHaveCount(0);
  await page
    .getByRole("link", { name: "Definições", exact: true })
    .first()
    .click();
  const backupDownload = page.waitForEvent("download");
  await page.getByRole("button", { name: "Exportar biblioteca" }).click();
  const backup = await backupDownload;
  const entries = unzipSync(await readFile((await backup.path())!));
  const catalog = JSON.parse(strFromU8(entries["library.json"]));
  expect(catalog.tracks).toHaveLength(1);
  const audioPath = Object.keys(entries).find((name) =>
    name.endsWith("Primeiro som.wav"),
  )!;
  expect(Buffer.from(entries[audioPath])).toEqual(first.buffer);
  await page.getByRole("link", { name: /Tema da aplicação/ }).click();
  await page.getByRole("button", { name: /Gaming Neon/ }).click();
  await page.reload();
  await expect(
    page.getByRole("button", { name: /Gaming Neon/ }),
  ).toHaveAttribute("aria-pressed", "true");
  await page.setViewportSize({ width: 414, height: 896 });
  await page
    .getByRole("navigation", { name: "Navegação móvel" })
    .getByRole("link", { name: "Início", exact: true })
    .click();
  await expect
    .poll(() =>
      page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    )
    .toBe(true);
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await context.setOffline(true);
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Reproduzir Primeiro som", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Reproduzir Primeiro som", exact: true })
    .click();
  await expect
    .poll(() =>
      page
        .locator("audio")
        .evaluate((audio) => (audio as HTMLAudioElement).currentTime),
    )
    .toBeGreaterThan(0);

});

test('V2: coleções, fila, controlos, letras em cache e restauração em pausa', async ({ page, context }) => {
  await page.goto('/#/library');
  await page.getByLabel('Importar ficheiros de áudio').setInputFiles([
    { name: 'Alpha.wav', mimeType: 'audio/wav', buffer: audioFixture(440) },
    { name: 'Beta.wav', mimeType: 'audio/wav', buffer: audioFixture(660) },
    { name: 'Gamma.wav', mimeType: 'audio/wav', buffer: audioFixture(880) },
  ]);
  await expect(page.getByRole('button', { name: 'Reproduzir Gamma', exact: true })).toBeVisible();
  await page.getByLabel('Ordenar músicas').selectOption('title');
  await expect(page.locator('.track-main strong')).toHaveText(['Alpha','Beta','Gamma']);
  await page.getByRole('button', { name: 'Playlists', exact: true }).click();
  await page.getByLabel('Nome da playlist').fill('Viagem');
  await page.getByRole('button', { name: 'Criar playlist', exact: true }).click();
  await expect(page.getByLabel('Coleção')).not.toHaveValue('all');
  await page.getByRole('button', { name: 'Músicas', exact: true }).click();
  await page.getByLabel('Coleção').selectOption('all');
  await page.getByLabel('Opções de Alpha').click();
  await page.getByRole('button', { name: 'Adicionar a Viagem', exact: true }).click();
  await page.getByLabel('Opções de Alpha').click();
  await page.getByRole('button', { name: 'Favorito Alpha', exact: true }).click();
  await page.getByLabel('Coleção').selectOption('favorites');
  await expect(page.locator('.track-main strong')).toHaveText(['Alpha']);
  await page.getByLabel('Coleção').selectOption({ label: 'Viagem' });
  await expect(page.locator('.track-main strong')).toHaveText(['Alpha']);
  await page.getByRole('button', { name: 'Editar playlist', exact: true }).click();
  await page.getByLabel('Nome da playlist').fill('Viagem longa');
  await page.getByRole('button', { name: 'Guardar playlist' }).click();
  await expect(page.getByLabel('Coleção').locator('option:checked')).toHaveText('Viagem longa');
  await page.getByLabel('Coleção').selectOption('all');
  await page.getByRole('button', { name: 'Reproduzir Alpha', exact: true }).click();
  await expect.poll(() => page.locator('audio').evaluate(a => (a as HTMLAudioElement).currentTime)).toBeGreaterThan(0);
  await page.getByRole('button', { name: 'Expandir reprodutor' }).click();
  let dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('heading', { name: 'Alpha', exact: true })).toBeVisible();
  await dialog.getByRole('button', { name: 'Mais opções', exact: true }).click();
  await dialog.getByLabel('Velocidade', { exact: true }).selectOption('1.5');
  await dialog.getByLabel('Volume', { exact: true }).fill('0.4');
  await dialog.getByRole('button', { name: 'Mais opções', exact: true }).click();
  await dialog.getByLabel('Posição da reprodução', { exact: true }).fill('4');
  await expect.poll(() => page.locator('audio').evaluate(a => (a as HTMLAudioElement).playbackRate)).toBe(1.5);
  await expect.poll(() => page.evaluate(() => navigator.mediaSession.metadata?.title)).toBe('Alpha');
  await dialog.getByRole('button', { name: 'Shuffle', exact: true }).click();
  await expect(dialog.getByRole('button', { name: 'Shuffle', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await dialog.getByRole('button', { name: 'Repetição: off', exact: true }).click();
  await expect(dialog.getByRole('button', { name: 'Repetição: all', exact: true })).toBeVisible();
  await dialog.getByRole('button', { name: 'Fila (3)', exact: true }).click();
  await expect(dialog.locator('li')).toHaveCount(3);
  const lastTitle = await dialog.locator('li').last().locator('.queue-title').evaluate(el => el.childNodes[0].textContent);
  await dialog.getByRole('button', { name: `Subir ${lastTitle}`, exact: true }).click();
  await dialog.getByRole('button', { name: `Retirar ${lastTitle} da fila`, exact: true }).click();
  await expect(dialog.locator('li')).toHaveCount(2);
  await dialog.getByRole('button', { name: 'Ver reprodutor' }).click();
  await page.route('https://lrclib.net/api/search?**', route => route.fulfill({ json: [{ id: 123, trackName: 'Alpha', artistName: 'Test Artist', plainLyrics: 'Test fixture line', syncedLyrics: '[00:00.00]Test fixture line\n[00:10.00]Second fixture line', instrumental: false }] }));
  await dialog.getByRole('button', { name: 'Letras', exact: true }).click();
  await dialog.getByLabel('Artista da letra', { exact: true }).fill('Test Artist');
  await dialog.getByRole('button', { name: 'Pesquisar letras' }).click();
  await expect(dialog.locator('.lyric-active')).toContainText('Test fixture line');
  await dialog.getByRole('button', { name: 'Ver reprodutor' }).click();
  await dialog.getByRole('button', { name: 'Pausar', exact: true }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect.poll(() => dialog.evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
  await dialog.getByRole('button', { name: 'Fechar', exact: true }).click();
  await page.reload();
  await page.getByRole('button', { name: 'Expandir reprodutor' }).click();
  dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('heading', { name: 'Alpha', exact: true })).toBeVisible();
  await dialog.getByRole('button', { name: 'Mais opções', exact: true }).click();
  await expect(dialog.getByLabel('Velocidade', { exact: true })).toHaveValue('1.5');
  await dialog.getByRole('button', { name: 'Mais opções', exact: true }).click();
  expect(await page.locator('audio').evaluate(a => (a as HTMLAudioElement).paused)).toBe(true);
  await context.setOffline(true);
  await dialog.getByRole('button', { name: 'Letras', exact: true }).click();
  await dialog.getByLabel('Artista da letra', { exact: true }).fill('Test Artist');
  await dialog.getByRole('button', { name: 'Pesquisar letras' }).click();
  await expect(dialog.getByText('Resultados da cache local · LRCLIB', { exact: true })).toBeVisible();
  await expect(dialog.locator('.lyrics-lines')).toContainText('Test fixture line');
  await dialog.getByRole('button', { name: 'Ver reprodutor' }).click();
  await dialog.getByRole('button', { name: 'Mais opções', exact: true }).click();
  await dialog.getByRole('button', { name: 'Terminar sessão', exact: true }).click();
  await expect.poll(() => page.evaluate(() => navigator.mediaSession.metadata)).toBeNull();
  await dialog.getByRole('button', { name: 'Fechar', exact: true }).click();
  await page.getByLabel('Coleção').selectOption('history');
  await expect(page.locator('.track-main strong')).toHaveText(['Alpha']);
  await page.getByLabel('Coleção').selectOption({ label: 'Viagem longa' });
  await page.getByRole('button', { name: 'Eliminar playlist', exact: true }).click();
  await page.getByRole('button', { name: 'Confirmar eliminação', exact: true }).click();
  await expect(page.getByLabel('Coleção')).toHaveValue('all');
});

test('V2: letras normais, pesquisa vazia e erros de rede', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('Importar ficheiros de áudio').setInputFiles({ name: 'Lyrics test.wav', mimeType: 'audio/wav', buffer: audioFixture() });
  await page.getByRole('button', { name: 'Reproduzir Lyrics test', exact: true }).click();
  await page.getByRole('button', { name: 'Expandir reprodutor' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('button', { name: 'Letras', exact: true }).click();
  await dialog.getByLabel('Artista da letra', { exact: true }).fill('Fixture artist');
  await page.route('https://lrclib.net/api/search?**', route => route.fulfill({ json: [] }));
  await dialog.getByRole('button', { name: 'Pesquisar letras' }).click();
  await expect(dialog.getByRole('status')).toContainText('Sem resultados');
  await page.unroute('https://lrclib.net/api/search?**');
  await page.route('https://lrclib.net/api/search?**', route => route.fulfill({ status: 503, json: {} }));
  await dialog.getByRole('button', { name: 'Pesquisar letras' }).click();
  await expect(dialog.getByRole('status')).toContainText('503');
  await page.unroute('https://lrclib.net/api/search?**');
  await page.route('https://lrclib.net/api/search?**', route => route.abort());
  await dialog.getByRole('button', { name: 'Pesquisar letras' }).click();
  await expect(dialog.getByRole('status')).toContainText('Sem ligação');
  await page.unroute('https://lrclib.net/api/search?**');
  await page.route('https://lrclib.net/api/search?**', route => route.fulfill({ json: [{ id: 456, trackName: 'Lyrics test', artistName: 'Fixture artist', plainLyrics: 'Plain lyric fixture\nSecond fixture', syncedLyrics: null, instrumental: false }] }));
  await dialog.getByRole('button', { name: 'Pesquisar letras' }).click();
  await expect(dialog.locator('.plain-lyrics')).toHaveText('Plain lyric fixture\nSecond fixture');
  await page.setViewportSize({ width: 390, height: 844 });
  await dialog.evaluate(el => { el.scrollTop = 0; });
});


