import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
const phase = process.argv[2] ?? 'after';
const folder = `design-review/${phase}`;
await mkdir(folder, { recursive: true });
const browser = await chromium.launch({ channel: 'msedge' });
const context = await browser.newContext({ viewport: { width: 414, height: 896 }, deviceScaleFactor: 1 });
const page = await context.newPage();
const errors = [];
page.on('pageerror', error => errors.push(error.message));
await page.goto('http://127.0.0.1:4175');
await page.locator('.empty').first().waitFor();
await page.screenshot({ path: `${folder}/xs-max-empty.png`, fullPage: true });
const sampleRate = 8000, seconds = 60;
const wav = Buffer.alloc(44 + sampleRate * seconds * 2);
wav.write('RIFF'); wav.writeUInt32LE(wav.length - 8, 4); wav.write('WAVE', 8); wav.write('fmt ', 12); wav.writeUInt32LE(16,16); wav.writeUInt16LE(1,20); wav.writeUInt16LE(1,22); wav.writeUInt32LE(sampleRate,24); wav.writeUInt32LE(sampleRate * 2,28); wav.writeUInt16LE(2,32); wav.writeUInt16LE(16,34); wav.write('data',36); wav.writeUInt32LE(wav.length - 44,40);
await page.getByLabel('Importar ficheiros de áudio').setInputFiles({ name: 'Night Drive.wav', mimeType: 'audio/wav', buffer: wav });
await page.getByRole('button', { name: 'Reproduzir Night Drive', exact: true }).first().waitFor();
// Original geometric artwork created solely for this visual fixture; no remote assets.
await page.evaluate(async () => {
  const database = await new Promise((resolve,reject) => { const r = indexedDB.open('my-music'); r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error); });
  const rows = await new Promise(resolve => { const r = database.transaction('tracks').objectStore('tracks').getAll(); r.onsuccess = () => resolve(r.result); });
  const base = rows[0];
  const colors = [['#d26838','#edb875','#181621'],['#254e6f','#8da9b8','#101c2b'],['#365748','#bdd0ac','#182d2c'],['#74567c','#bf95bb','#211b2b'],['#345d78','#b6c8d9','#151b2d'],['#9c714c','#dfc79b','#30231e']];
  const titles = ['Night Drive','Blue Hour','Slow Motion','Afterglow','Tides','Golden'];
  const artists = ['Luna Vale','Atlas North','Luna Vale','June & The Sea','Atlas North','June & The Sea'];
  const tx = database.transaction(['tracks','files','favorites','history','playlists'],'readwrite');
  colors.forEach(([a,b,c],i) => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="600"><defs><linearGradient id="g" x2="1" y2="1"><stop stop-color="${a}"/><stop offset="1" stop-color="${c}"/></linearGradient><filter id="n"><feTurbulence baseFrequency=".7" numOctaves="3" stitchTiles="stitch"/><feColorMatrix type="saturate" values="0"/><feComponentTransfer><feFuncA type="linear" slope=".12"/></feComponentTransfer><feBlend in="SourceGraphic" mode="soft-light"/></filter></defs><rect width="600" height="600" fill="url(#g)"/><g filter="url(#n)"><circle cx="310" cy="248" r="150" fill="${b}"/><path d="M0 400 Q160 210 330 410 T650 340 V650 H0" fill="${c}"/><path d="M0 480 Q200 350 390 480 T650 440 V650 H0" fill="${a}"/></g><text x="42" y="60" fill="#fff" font-family="sans-serif" font-size="15" letter-spacing="5">${artists[i].toUpperCase().replaceAll('&','&amp;')}</text><text x="42" y="550" fill="#fff" font-family="sans-serif" font-size="42" letter-spacing="-1">${titles[i]}</text></svg>`;
    const id = i ? `review-${i}` : base.id;
    tx.objectStore('tracks').put({ ...base, id, title: titles[i], artist: artists[i], album: i % 2 ? 'Quiet Places' : 'Nocturnal', duration: 60, addedAt: Date.now() - i * 10000, artwork: `data:image/svg+xml,${encodeURIComponent(svg)}` });
    if (i) tx.objectStore('files').put({ id, blob: new Blob([new Uint8Array(44)], { type: 'audio/wav' }) });
    if (i < 3) tx.objectStore('favorites').put({ id });
    if (i < 2) tx.objectStore('history').put({ id, playedAt: Date.now() - i * 10000 });
  });
  tx.objectStore('playlists').put({ id: 'review-playlist', name: 'Late nights', trackIds: [base.id,'review-1','review-3'] });
  await new Promise((resolve,reject) => { tx.oncomplete = resolve; tx.onerror = reject; }); database.close();
});
await page.reload();
await page.getByRole('button', { name: 'Reproduzir Night Drive', exact: true }).first().waitFor();
await page.screenshot({ path: `${folder}/xs-max-home.png` });
await page.getByRole('button', { name: 'Reproduzir Night Drive', exact: true }).first().click();
await page.getByRole('button', { name: 'Expandir reprodutor' }).click();
await page.getByRole('dialog').waitFor();
await page.waitForTimeout(600);
await page.screenshot({ path: `${folder}/xs-max-player.png` });
await page.locator("audio").evaluate(audio => audio.pause());
await page.getByRole('dialog').getByRole('button', { name: 'Fechar', exact: true }).click();
const measurements = [];
for (const [name,width,height] of [['small',320,568],['xs-max',414,896],['tablet',820,1180],['desktop',1440,960]]) {
  await page.setViewportSize({ width,height });
  await page.screenshot({ path: `${folder}/${name}-dashboard.png`, fullPage: true });
  await page.screenshot({ path: `${folder}/${name}-viewport.png` });
  measurements.push({ name, ...await page.evaluate(() => ({ width: innerWidth, document: document.documentElement.scrollWidth, nav: document.querySelector('.bottom-nav')?.getBoundingClientRect().toJSON(), player: document.querySelector('.player')?.getBoundingClientRect().toJSON() })) });
}
if (phase === 'after') {
  await page.setViewportSize({ width:414,height:896 });
  for (const id of ['amoled','neon','anime','retro','album','custom']) {
    await page.evaluate(id => { localStorage.setItem('my-music-theme',JSON.stringify({ id, background:'#101b1a',accent:'#a2e5d3' })); }, id);
    await page.reload();
    await page.getByRole('button', { name:'Expandir reprodutor' }).waitFor();
    await page.screenshot({ path:`${folder}/theme-${id}-home.png`,fullPage:true });
    await page.getByRole('button', { name:'Expandir reprodutor' }).click();
    await page.waitForTimeout(400);
    await page.screenshot({ path:`${folder}/theme-${id}-player.png` });
    await page.getByRole('dialog').getByRole('button',{ name:'Fechar',exact:true }).click();
  }
}
await writeFile(`${folder}/measurements.json`, JSON.stringify({ measurements, errors },null,2));
await browser.close();
console.log(`${phase}: screenshots saved; page errors: ${errors.length}`);


