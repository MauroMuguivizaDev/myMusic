import { expect, test, type Page } from '@playwright/test';
import { audioFixture, highResolutionCover, taggedAudioFixture } from './fixtures';

async function formSizes(page: Page) {
  expect(await page.locator('input:not([type=range]):not([type=color]):not([type=checkbox]),select,textarea').evaluateAll(elements =>
    elements.filter(element => element.getClientRects().length && !element.classList.contains('sr-only'))
      .every(element => parseFloat(getComputedStyle(element).fontSize) >= 16))).toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
}

test('tags e capas locais, edição sem reiniciar áudio e formulários com teclado simulado', async ({ page,context }) => {
  await context.addInitScript(() => Object.defineProperty(navigator,'canShare',{value:() => false}));
  await page.setViewportSize({width:414,height:896});
  await page.goto('/#/themes');
  await page.getByRole('button',{name:'Liquid Glass',exact:true}).click();
  await page.goto('/#/library');
  await page.getByLabel('Importar ficheiros de áudio').setInputFiles({name:'filename.wav',mimeType:'audio/wav',buffer:taggedAudioFixture('wav')});
  await expect(page.locator('.track-main strong')).toHaveText(['Título incorporado']);
  await expect(page.locator('.track-main img')).toBeVisible();
  await page.getByRole('button',{name:'Reproduzir Título incorporado',exact:true}).click();
  await expect(page.locator('audio')).toHaveAttribute('src',/^blob:/);
  const audioSource = await page.locator('audio').getAttribute('src');
  await expect.poll(() => page.evaluate(() => navigator.mediaSession.metadata?.artwork[0]?.src)).toContain('data:image/jpeg');
  await page.getByLabel('Opções de Título incorporado').click();
  await page.getByRole('button',{name:'Editar música e capa',exact:true}).click();
  const editor = page.getByRole('dialog',{name:'Editar música',exact:true});
  await expect(editor.getByLabel('Género',{exact:true})).toHaveValue('Jazz');
  await expect(editor.getByLabel('Ano',{exact:true})).toHaveValue('2024');
  for (const width of [320,414]) {
    await page.setViewportSize({width,height:896});
    await formSizes(page);
    await editor.getByLabel('Título',{exact:true}).fill('Título manual');
    await editor.getByLabel('Título',{exact:true}).pressSequentially(' novo');
    await expect(editor.getByLabel('Título',{exact:true})).toBeFocused();
    expect(await editor.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
  }
  // Emulate the VisualViewport changes the software keyboard sends; this is not a physical iPhone test.
  await page.evaluate(() => {
    const viewport = visualViewport!;
    Object.defineProperties(viewport,{height:{value:340,configurable:true},offsetTop:{value:80,configurable:true}});
    viewport.dispatchEvent(new Event('resize'));
  });
  await editor.getByLabel('Ano',{exact:true}).fill('2025');
  await expect(editor.getByLabel('Ano',{exact:true})).toBeFocused();
  await expect.poll(() => editor.getByLabel('Ano',{exact:true}).evaluate(element => {
    const bounds=element.getBoundingClientRect(); return bounds.top >= 80 && bounds.bottom <= 420;
  })).toBe(true);
  await expect(page.locator('.player')).toBeHidden();
  await page.evaluate(() => {
    const viewport = visualViewport!;
    Reflect.deleteProperty(viewport,'height'); Reflect.deleteProperty(viewport,'offsetTop');
    viewport.dispatchEvent(new Event('resize'));
  });
  await editor.getByLabel('Género',{exact:true}).fill('Soul');
  await editor.getByLabel('Duração (segundos)',{exact:true}).fill('14');
  await editor.getByRole('button',{name:'Guardar alterações',exact:true}).click();
  await expect(editor).toHaveCount(0);
  expect(await page.locator('audio').getAttribute('src')).toBe(audioSource);
  await expect.poll(() => page.evaluate(() => navigator.mediaSession.metadata?.title)).toBe('Título manual novo');
  await page.getByLabel('Opções de Título manual novo').click();
  await page.getByRole('button',{name:'Atualizar informações',exact:true}).click();
  const update=page.getByRole('dialog',{name:'Atualizar informações',exact:true});
  await expect(update.getByRole('button',{name:'Guardar alterações',exact:true})).toBeEnabled();
  await expect(update.getByLabel('Título',{exact:true})).toHaveValue('Título manual novo');
  await expect(update.getByLabel('Género',{exact:true})).toHaveValue('Soul');
  await expect(update.getByLabel('Ano',{exact:true})).toHaveValue('2025');
  await expect(update.getByLabel('Duração (segundos)',{exact:true})).toHaveValue('14');
  await update.getByRole('button',{name:'Fechar',exact:true}).click();
  const download=page.waitForEvent('download');
  await page.getByLabel('Opções de Título manual novo').click();
  await page.getByRole('button',{name:'Exportar Título manual novo',exact:true}).click();
  const { readFile }=await import('node:fs/promises');
  expect(await readFile((await (await download).path())!)).toEqual(taggedAudioFixture('wav'));
});

test('pesquisa online, escolha de lançamento e consulta offline sem áudio fictício', async ({page,context}) => {
  const recording='11111111-1111-4111-8111-111111111111';
  const studio='22222222-2222-4222-8222-222222222222';
  const live='33333333-3333-4333-8333-333333333333';
  let requests=0;
  await page.route('https://musicbrainz.org/ws/2/**', route => {
    requests++;
    if (new URL(route.request().url()).pathname.endsWith('/'+recording)) return route.fulfill({json:{id:recording,genres:[{name:'Rock'}]}});
    return route.fulfill({json:{recordings:[{id:recording,title:'Confirmed song','artist-credit':[{name:'Confirmed artist'}],releases:[{id:studio,title:'Studio album',date:'2001'},{id:live,title:'Live album',date:'2002'}]}]}});
  });
  await page.route('https://coverartarchive.org/**',route => { requests++; return route.fulfill({contentType:'image/png',body:highResolutionCover}); });
  await page.setViewportSize({width:414,height:896});
  await page.goto('/#/search');
  await page.getByRole('button',{name:'Online',exact:true}).click();
  await page.getByLabel('Pesquisar catálogo online').fill('Confirmed song');
  await page.getByRole('button',{name:'Pesquisar',exact:true}).click();
  await expect(page.locator('.catalog-results li')).toHaveCount(2);
  await expect(page.locator('.catalog-results img')).toHaveCount(2);
  await expect(page.locator('.catalog-results button')).toHaveCount(0);
  await expect(page.locator('.catalog-results a[download]')).toHaveCount(0);
  await expect(page.locator('.player')).toHaveCount(0);
  await formSizes(page);
  await page.goto('/#/library');
  await page.getByLabel('Importar ficheiros de áudio').setInputFiles({name:'filename.wav',mimeType:'audio/wav',buffer:audioFixture(880)});
  await page.getByLabel('Opções de filename').click();
  await page.getByRole('button',{name:'Editar música e capa',exact:true}).click();
  const editorWithoutArtwork=page.getByRole('dialog',{name:'Editar música',exact:true});
  const manualCover=await page.evaluate(() => { const canvas=document.createElement('canvas'); canvas.width=512;canvas.height=512;const context=canvas.getContext('2d')!;context.fillStyle='#cc5533';context.fillRect(0,0,512,512);return canvas.toDataURL('image/png').split(',')[1]; });
  await editorWithoutArtwork.getByLabel('Escolher capa').setInputFiles({name:'manual.png',mimeType:'image/png',buffer:Buffer.from(manualCover,'base64')});
  await expect(editorWithoutArtwork.locator('.track-editor > .cover img')).toBeVisible();
  await editorWithoutArtwork.getByRole('button',{name:'Guardar alterações',exact:true}).click();
  const originalCover=await page.locator('.track-main img').getAttribute('src');
  await page.getByLabel('Opções de filename').click();
  await page.getByRole('button',{name:'Atualizar informações',exact:true}).click();
  const editor=page.getByRole('dialog',{name:'Atualizar informações',exact:true});
  await expect(editor.getByRole('button',{name:'Guardar alterações',exact:true})).toBeEnabled();
  await editor.getByLabel('Procurar informações online').fill('Confirmed song');
  await editor.getByRole('button',{name:'Procurar online',exact:true}).click();
  await editor.locator('.catalog-results li').filter({hasText:'Live album'}).getByRole('button',{name:'Escolher',exact:true}).click();
  await expect(editor.getByRole('group',{name:'Pré-visualização da nova capa'})).toBeVisible();
  await expect(editor.locator('.track-editor > .cover img')).toHaveAttribute('src',originalCover!);
  await expect(editor.getByRole('button',{name:'Guardar alterações',exact:true})).toBeEnabled();
  await expect(editor.getByLabel('Título',{exact:true})).toHaveValue('Confirmed song');
  await expect(editor.getByLabel('Artista',{exact:true})).toHaveValue('Confirmed artist');
  await expect(editor.getByLabel('Álbum',{exact:true})).toHaveValue('Live album');
  await expect(editor.getByLabel('Ano',{exact:true})).toHaveValue('2002');
  await expect(editor.getByLabel('Género',{exact:true})).toHaveValue('Rock');
  await editor.getByRole('button',{name:'Usar esta capa',exact:true}).click();
  await editor.getByRole('button',{name:'Guardar alterações',exact:true}).click();
  await expect(page.locator('.track-main img')).toBeVisible();
  await expect(page.locator('.track-main img')).not.toHaveAttribute('src',originalCover!);
  const count=requests;
  await context.setOffline(true);
  await page.goto('/#/search');
  await page.getByLabel('Pesquisar catálogo online').fill('Confirmed song');
  await page.getByRole('button',{name:'Pesquisar',exact:true}).click();
  await expect(page.getByRole('region',{name:'Pesquisa online',exact:true}).getByRole('status')).toContainText('Resultados guardados');
  await expect(page.locator('.catalog-results img')).toHaveCount(2);
  expect(requests).toBe(count);
  await page.getByRole('button',{name:'No dispositivo',exact:true}).click();
  await page.getByLabel('Pesquisar músicas').fill('Live album');
  await expect(page.locator('.track-main strong')).toHaveText(['Confirmed song']);
});
