import { expect, test, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { audioFixture } from './fixtures';
async function waitForDock(page: Page) {
  await expect.poll(async () => {
    const nav=await page.locator('.bottom-nav').boundingBox();
    const mini=await page.locator('.player').boundingBox();
    return !!nav && !!mini && mini.y + mini.height < nav.y;
  }).toBe(true);
}
test('redesign: biblioteca vazia, capas locais, temas e layouts responsivos', async ({ page,context }) => {
  await context.addInitScript(() => Object.defineProperty(navigator,'canShare',{value:() => false}));
  await page.setViewportSize({ width:414,height:896 });
  await page.goto('/');
  await expect(page.getByRole('heading',{name:'A tua biblioteca está vazia'})).toBeVisible();
  await expect(page.locator('.player')).toHaveCount(0);
  await expect(page.locator('.hero')).toHaveCount(0);
  const file = {name:'Local audio.wav',mimeType:'audio/wav',buffer:audioFixture()};
  await page.getByLabel('Importar ficheiros de áudio').setInputFiles(file);
  await page.getByRole('navigation',{name:'Navegação móvel'}).getByRole('link',{name:'Biblioteca',exact:true}).click();
  await page.getByLabel('Opções de Local audio').click();
  await page.getByRole('button',{name:'Editar música e capa'}).click();
  const editor = page.getByRole('dialog',{name:'Editar música'});
  await editor.getByLabel('Artista',{exact:true}).fill('Local artist');
  await editor.getByLabel('Álbum',{exact:true}).fill('Local album');
  const artwork = await page.evaluate(() => { const canvas = document.createElement('canvas'); canvas.width=32;canvas.height=32;const ctx=canvas.getContext('2d')!;ctx.fillStyle='#b65c39';ctx.fillRect(0,0,32,32);return canvas.toDataURL('image/png').split(',')[1]; });
  await editor.getByLabel('Escolher capa').setInputFiles({name:'Own cover.png',mimeType:'image/png',buffer:Buffer.from(artwork,'base64')});
  await expect(editor.getByRole('button',{name:'Guardar alterações'})).toBeEnabled();
  await editor.getByRole('button',{name:'Guardar alterações'}).click();
  await page.getByRole('button',{name:'Reproduzir Local audio',exact:true}).click();
  await expect.poll(() => page.locator('audio').evaluate(el => (el as HTMLAudioElement).currentTime)).toBeGreaterThan(0);
  await expect(page.locator('.now-playing img')).toBeVisible();
  await expect.poll(() => page.locator('.app').evaluate(el => getComputedStyle(el).getPropertyValue('--art-color').trim())).toMatch(/^rgb\(/);
  const src = await page.locator('audio').getAttribute('src');
  // Updating the catalogue must not replace or restart the playing audio.
  await page.getByLabel('Opções de Local audio').click();
  await page.getByRole('button',{name:'Editar música e capa'}).click();
  await editor.getByLabel('Título',{exact:true}).fill('Renamed audio');
  await editor.getByRole('button',{name:'Guardar alterações'}).click();
  expect(await page.locator('audio').getAttribute('src')).toBe(src);
  await expect.poll(() => page.evaluate(() => navigator.mediaSession.metadata?.title)).toBe('Renamed audio');
  await page.reload();
  await expect(page.locator('.now-playing img')).toBeVisible();
  await page.getByLabel('Opções de Renamed audio').click();
  const download = page.waitForEvent('download');
  await page.getByRole('button',{name:'Exportar Renamed audio'}).click();
  expect(await readFile((await (await download).path())!)).toEqual(file.buffer);
  await page.getByRole('navigation',{name:'Navegação móvel'}).getByRole('link',{name:'Início',exact:true}).click();
  await page.getByRole('navigation',{name:'Navegação móvel'}).getByRole('link',{name:'Biblioteca',exact:true}).click();
  await page.getByRole('button',{name:'Artistas',exact:true}).click();
  await page.getByRole('button',{name:'Local artist 1 músicas',exact:true}).click();
  await expect(page.locator('.track-main strong')).toHaveText(['Renamed audio']);
  await page.getByRole('button',{name:'Álbuns',exact:true}).click();
  await page.getByRole('button',{name:'Local album 1 músicas',exact:true}).click();
  await expect(page.locator('.track-main strong')).toHaveText(['Renamed audio']);
  await page.getByRole('navigation',{name:'Navegação móvel'}).getByRole('link',{name:'Início',exact:true}).click();
  const savedPosition = await page.locator('audio').evaluate(el => (el as HTMLAudioElement).currentTime);
  await page.getByRole('button',{name:'Continuar Renamed audio',exact:true}).click();
  await expect.poll(() => page.locator('audio').evaluate(el => (el as HTMLAudioElement).paused)).toBe(false);
  expect(await page.locator('audio').evaluate(el => (el as HTMLAudioElement).currentTime)).toBeGreaterThanOrEqual(Math.max(0,savedPosition - .1));
  await page.locator('audio').evaluate(el => (el as HTMLAudioElement).pause());
  for (const theme of ['Liquid Glass','AMOLED','Capa Dinâmica','Gaming Neon','Anime Night','Retro Arcade','Album Immersive','Custom']) {
    await page.goto('/#/themes');
    await page.getByRole('button',{name:new RegExp(theme)}).click();
    if (theme === 'Custom') {
      await page.getByLabel('Imagem de fundo personalizada').setInputFiles({name:'Own background.png',mimeType:'image/png',buffer:Buffer.from(artwork,'base64')});
      await expect.poll(() => page.locator('.app').evaluate(el => getComputedStyle(el).getPropertyValue('--wallpaper'))).toContain('data:image/jpeg');
    }
    await page.reload();
    await expect(page.getByRole('button',{name:new RegExp(theme)})).toHaveAttribute('aria-pressed','true');
    await expect(page.locator('audio')).toHaveAttribute('src', /^blob:/);
    const audioSource = await page.locator('audio').getAttribute('src');
    await page.getByRole('button',{name:'Expandir reprodutor'}).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog.locator('.album-stage img')).toBeVisible();
    await expect.poll(() => dialog.evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
    await expect(dialog.getByRole('button',{name:'Letras',exact:true})).toBeInViewport();
    await dialog.getByRole('button',{name:'Fechar',exact:true}).click();
    await expect(dialog).toHaveCount(0);
    expect(await page.locator('audio').getAttribute('src')).toBe(audioSource);
  }
  await page.getByRole('navigation',{name:'Navegação móvel'}).getByRole('link',{name:'Início',exact:true}).click();
  await page.goto('/#/themes');
  await page.getByRole('button',{name:'Liquid Glass',exact:true}).click();
  await page.goto('/');
  for (const [width,height] of [[320,568],[414,896],[820,1180],[1440,960],[896,414]]) {
    await page.setViewportSize({width,height});
    for (const route of ['/', '/#/search', '/#/library', '/#/downloads', '/#/settings', '/#/themes']) {
      await page.goto(route);
      await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      if (route.includes('search')) {
        await expect(page.getByLabel('Nome da playlist')).toHaveCount(0);
        await page.getByLabel('Pesquisar músicas').fill('Renamed');
        await expect(page.locator('.track-main strong')).toHaveText(['Renamed audio']);
      }
    }
    await page.goto('/');
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    if(width < 1000) {
      await waitForDock(page);
      const nav = (await page.locator('.bottom-nav').boundingBox())!;
      const mini = (await page.locator('.player').boundingBox())!;
      expect(mini.y + mini.height).toBeLessThan(nav.y);
      expect(mini.height).toBeLessThanOrEqual(64);
    }
    await expect(page.locator('audio')).toHaveAttribute('src', /^blob:/);
    const audioSource = await page.locator('audio').getAttribute('src');
    await page.getByRole('button',{name:'Expandir reprodutor'}).click();
    const dialog = page.getByRole('dialog');
    await expect.poll(() => dialog.evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
    await expect(dialog.getByRole('button',{name:'Letras',exact:true})).toBeInViewport();
    await dialog.getByRole('button',{name:'Fechar',exact:true}).click();
    await expect(dialog).toHaveCount(0);
    expect(await page.locator('audio').getAttribute('src')).toBe(audioSource);
  }
  await page.setViewportSize({width:414,height:896});
  // Simulate an enlarged system safe area without claiming Safari/device validation.
  await page.addStyleTag({content:'.app { --nav-height:92px!important; }'});
  await waitForDock(page);
  const nav = (await page.locator('.bottom-nav').boundingBox())!;
  const mini = (await page.locator('.player').boundingBox())!;
  expect(mini.y + mini.height).toBeLessThan(nav.y);
});


test('movimento reduzido mantém navegação, foco e áudio persistente', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  await page.getByLabel('Importar ficheiros de áudio').setInputFiles({name:'Motion.wav',mimeType:'audio/wav',buffer:audioFixture()});
  await page.getByRole('button',{name:'Reproduzir Motion',exact:true}).click();
  await expect.poll(() => page.locator('audio').evaluate(audio => !(audio as HTMLAudioElement).paused)).toBe(true);
  const source = await page.locator('audio').getAttribute('src');
  await page.getByRole('button',{name:'Expandir reprodutor'}).click();
  await page.getByRole('dialog',{name:'A tocar agora'}).getByRole('button',{name:'Fila (1)',exact:true}).click();
  await expect(page.getByRole('dialog',{name:'Fila de reprodução'})).toBeVisible();
  await page.getByRole('button',{name:'Ver reprodutor',exact:true}).click();
  await page.getByRole('dialog',{name:'A tocar agora'}).getByRole('button',{name:'Letras',exact:true}).click();
  await expect(page.getByRole('dialog',{name:'Letras'})).toBeVisible();
  await page.getByRole('button',{name:'Ver reprodutor',exact:true}).click();
  await page.getByRole('dialog',{name:'A tocar agora'}).getByRole('button',{name:'Pausar',exact:true}).click();
  await expect.poll(() => page.locator('audio').evaluate(audio => (audio as HTMLAudioElement).paused)).toBe(true);
  await page.getByRole('dialog',{name:'A tocar agora'}).getByRole('button',{name:'Reproduzir',exact:true}).click();
  await expect.poll(() => page.locator('audio').evaluate(audio => !(audio as HTMLAudioElement).paused)).toBe(true);
  await page.getByRole('dialog').getByRole('button',{name:'Fechar',exact:true}).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByRole('button',{name:'Expandir reprodutor'})).toBeFocused();
  await page.goto('/#/search');
  expect(await page.locator('audio').getAttribute('src')).toBe(source);
});
