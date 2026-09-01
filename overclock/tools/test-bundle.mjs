/* Checks the single-file build actually plays.
 *
 *   node tools/bundle.mjs out.html && node tools/test-bundle.mjs out.html
 *
 * Loaded from file:// with no server at all, which is the harshest version
 * of how it will be opened, and driven through a real match.
 */

import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import path from 'node:path';
import fs from 'node:fs';

const file = path.resolve(process.argv[2] || 'overclock-standalone.html');
if (!fs.existsSync(file)) { console.error('no such file: ' + file); process.exit(1); }

let pass = 0, fail = 0;
const ok = (c, label, detail = '') => {
  if (c) { pass++; console.log('  ok   ' + label); }
  else { fail++; console.log('  FAIL ' + label + (detail ? '  — ' + detail : '')); }
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox',
    '--disable-dev-shm-usage', '--disable-background-networking', '--mute-audio',
    '--disable-component-update', '--no-first-run', '--disable-sync'],
});

try {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
  await ctx.addInitScript(() => {
    localStorage.setItem('overclock.settings.v1', JSON.stringify({
      quality: 'low', resolutionScale: 0.5, dynamicResolution: false, name: 'SOLO', showFps: true,
    }));
  });
  const page = await ctx.newPage();
  page.setDefaultTimeout(20000);
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  const requests = [];
  page.on('request', (r) => { if (!r.url().startsWith('file:')) requests.push(r.url()); });

  console.log('\nstandalone build, loaded from file://');
  await page.goto('file://' + file, { waitUntil: 'load' });
  await page.waitForSelector('#screen-main.is-active');
  ok(true, 'boots with no server and no network');
  ok(requests.length === 0, `makes no external requests (${requests.length})`, requests.slice(0, 3).join(' '));

  const note = await page.textContent('#serverNote');
  ok(/offline/i.test(note), `the menu says it is offline-only ("${note.trim()}")`);

  await page.click('[data-go="play"]');
  await page.click('[data-action="solo"]');
  await page.waitForSelector('#screen-setup.is-active');
  ok(true, 'reaches the game setup screen');

  await page.click('#mapCards .mapcard:nth-child(3)');   // DUNES
  await page.click('#modeChips .chip:nth-child(3)');     // Gun Game
  await page.click('#botChips .chip:nth-child(4)');      // 6 bots
  await sleep(250);
  const applied = await page.evaluate(() => ({
    map: document.querySelector('#mapCards .mapcard.is-on h4').textContent,
    mode: document.querySelector('#modeChips .chip.is-on').textContent,
  }));
  ok(applied.map === 'DUNES' && applied.mode === 'Gun Game', `setup applies (${applied.mode} on ${applied.map})`);

  await page.click('#startBtn');
  await sleep(7000);

  const live = await page.evaluate(() => ({
    ...window.__ocDebug(),
    hud: !document.getElementById('hud').hidden,
    ammo: document.getElementById('ammoMag').textContent,
    weapon: document.getElementById('weaponName').textContent,
    timer: document.getElementById('matchTimer').textContent,
    feed: document.querySelectorAll('#killFeed .feedrow').length,
  }));
  ok(live.hud, 'the match runs');
  ok(live.local === true, 'it is hosting the match in the tab');
  ok(live.peers >= 6, `the bots are in the match (${live.peers} tracked)`);
  ok(live.vmParts > 0, `the weapon is drawn (${live.vmParts} parts)`);
  ok(/^\d+$/.test(live.ammo), `ammo is live (${live.ammo} ${live.weapon})`);
  ok(/^\d+:\d\d$/.test(live.timer), `the clock runs (${live.timer})`);

  // Aim training, the other standalone mode.
  await page.keyboard.press('Escape');
  await page.waitForSelector('#screen-pause.is-active');
  await page.click('#screen-pause [data-action="quit"]');
  await page.waitForSelector('#screen-main.is-active');
  await page.click('[data-go="training"]');
  await page.waitForSelector('#screen-training.is-active');
  await page.click('#trainStart');
  await sleep(2500);
  const training = await page.evaluate(() => ({ mode: window.__ocDebug().mode, hud: !document.getElementById('hud').hidden }));
  ok(training.mode === 'training' && training.hud, 'aim training runs too');

  ok(errors.length === 0, `no console errors (${errors.length})`, errors.slice(0, 3).join(' | '));

  /* An artifact renders inside an iframe, which may refuse pointer lock.
     If that leaves the player unable to look around, the page is a
     screenshot rather than a game — so the refusal is simulated here. */
  console.log('\nwith pointer lock refused (the embedded case)');
  const ctx2 = await browser.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
  await ctx2.addInitScript(() => {
    localStorage.setItem('overclock.settings.v1', JSON.stringify({
      quality: 'low', resolutionScale: 0.5, dynamicResolution: false, name: 'EMBED',
    }));
    Element.prototype.requestPointerLock = function () { return Promise.reject(new Error('denied')); };
  });
  const p2 = await ctx2.newPage();
  p2.setDefaultTimeout(20000);
  const err2 = [];
  p2.on('pageerror', (e) => err2.push(e.message));
  await p2.goto('file://' + file, { waitUntil: 'load' });
  await p2.waitForSelector('#screen-main.is-active');
  await p2.click('[data-go="play"]');
  await p2.click('[data-action="solo"]');
  await p2.waitForSelector('#screen-setup.is-active');
  await p2.click('#startBtn');
  await sleep(6500);
  const before2 = await p2.evaluate(() => window.__ocDebug().yaw);
  // Move the mouse and press forward; both should still reach the player.
  await p2.mouse.move(400, 360);
  for (let i = 0; i < 12; i++) await p2.mouse.move(400 + i * 25, 360);
  await p2.keyboard.down('KeyW');
  await sleep(900);
  await p2.keyboard.up('KeyW');
  await sleep(300);
  const st2 = await p2.evaluate(() => ({ ...window.__ocDebug(), paused: document.getElementById('screen-pause').classList.contains('is-active') }));
  ok(!st2.paused, 'a refused pointer lock does not trap the player in the pause menu');
  ok(st2.mode === 'match', 'the match still runs');
  ok(st2.movedRecently, 'movement input still reaches the player without a pointer lock');
  ok(st2.turned, 'mouse look still works without a pointer lock');
  ok(err2.length === 0, `no errors in the embedded case (${err2.length})`, err2.slice(0, 2).join(' | '));
  await ctx2.close();
  await page.screenshot({ path: path.join(path.dirname(file), 'standalone.png') }).catch(() => {});
  await ctx.close();
} catch (err) {
  console.error('\nERROR', err.message);
  fail++;
}

await browser.close();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
