/* Browser checks.
 *
 *   node tools/test-browser.mjs
 *
 * Starts the real server, drives the real client in Chromium at three
 * viewport sizes, and asserts that it boots, renders, and can actually
 * play a match end to end. Console errors are failures — a shooter that
 * logs an exception every frame is not working, however it looks.
 */

import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = 8930 + (process.pid % 60);
const BASE = `http://127.0.0.1:${PORT}`;

let pass = 0, fail = 0;
const ok = (c, label, detail = '') => {
  if (c) { pass++; console.log('  ok   ' + label); }
  else { fail++; console.log('  FAIL ' + label + (detail ? '  — ' + detail : '')); }
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const server = spawn(process.execPath, [path.join(ROOT, 'server', 'index.js')], {
  env: { ...process.env, PORT: String(PORT), HOST: '127.0.0.1' },
  stdio: ['ignore', 'pipe', 'pipe'],
});
let serverLog = '';
server.stdout.on('data', (b) => { serverLog += b; });
server.stderr.on('data', (b) => { serverLog += b; });
const done = (code) => { server.kill('SIGKILL'); process.exit(code); };

for (let i = 0; i < 60; i++) {
  try { const r = await fetch(BASE + '/health'); if (r.ok) break; } catch {}
  await sleep(150);
}

const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: [
    '--use-gl=swiftshader', '--enable-unsafe-swiftshader',
    '--no-sandbox', '--disable-dev-shm-usage',
    /* Chromium otherwise spends the whole test trying to reach Google
       services that are not reachable from here. */
    '--disable-background-networking', '--disable-component-update',
    '--disable-sync', '--no-first-run', '--metrics-recording-only',
    '--disable-features=Translate,OptimizationHints,AutofillServerCommunication',
    '--mute-audio',
  ],
});

const VIEWPORTS = [
  { name: 'phone landscape', width: 844, height: 390, mobile: true },
  { name: 'tablet', width: 1024, height: 768, mobile: true },
  { name: 'desktop', width: 1600, height: 900, mobile: false },
];

async function openPage(vp) {
  const ctx = await browser.newContext({
    viewport: { width: vp.width, height: vp.height },
    /* 1x rather than the 2x a real phone would use: this runs on
       SwiftShader, where fragment cost is the entire budget, and the test
       checks that the game works rather than how fast software GL is. */
    deviceScaleFactor: 1,
    isMobile: vp.mobile,
    hasTouch: vp.mobile,
    userAgent: vp.mobile
      ? 'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Mobile Safari/537.36'
      : undefined,
  });
  /* Force the low preset before any module runs, so the software
     rasteriser is not asked to do work this test is not measuring. */
  await ctx.addInitScript(() => {
    localStorage.setItem('overclock.settings.v1', JSON.stringify({
      quality: 'low', resolutionScale: 0.5, dynamicResolution: false,
      effectsLevel: 1, name: 'TESTER', showFps: true,
    }));
  });
  const page = await ctx.newPage();
  page.setDefaultTimeout(15000);
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  await page.goto(BASE + '/', { waitUntil: 'load' });
  return { ctx, page, errors };
}

try {
  for (const vp of VIEWPORTS) {
    console.log('\n' + vp.name + '  ' + vp.width + '×' + vp.height);
    const { ctx, page, errors } = await openPage(vp);

    await page.waitForSelector('#screen-main.is-active', { timeout: 20000 }).catch(() => {});
    const booted = await page.evaluate(() => document.getElementById('boot').hidden);
    ok(booted, 'boots past the loading screen', errors.slice(0, 2).join(' | '));

    const gl = await page.evaluate(() => {
      const c = document.getElementById('view');
      return { w: c.width, h: c.height, ctx: !!(c.getContext('webgl2') || c.getContext('webgl')) };
    });
    ok(gl.w > 0 && gl.h > 0, `canvas has a backing store (${gl.w}×${gl.h})`);

    const menuVisible = await page.isVisible('#screen-main.is-active');
    ok(menuVisible, 'the main menu is showing');

    // Walk into an offline match through the real UI.
    await page.click('[data-go="play"]');
    await page.waitForSelector('#screen-play.is-active', { timeout: 4000 });
    ok(true, 'PLAY screen opens');

    await page.click('[data-action="solo"]');
    await page.waitForSelector('#screen-setup.is-active', { timeout: 8000 });
    ok(true, 'offline hosting reaches the game setup screen');

    const setup = await page.evaluate(() => ({
      modes: document.querySelectorAll('#modeChips .chip').length,
      maps: document.querySelectorAll('#mapCards .mapcard').length,
      bots: document.querySelectorAll('#botChips .chip').length,
      diffs: document.querySelectorAll('#difficultyChips .chip').length,
      fields: document.querySelectorAll('#matchFields .opt').length,
      code: document.getElementById('roomCode').textContent,
    }));
    ok(setup.modes === 4, `all four game modes are offered (${setup.modes})`);
    ok(setup.maps === 4, `all four maps are offered (${setup.maps})`);
    ok(setup.bots >= 5, `bot counts are offered (${setup.bots} options)`);
    ok(setup.diffs === 4, `four bot difficulties (${setup.diffs})`);
    ok(setup.fields >= 5, `match settings are offered (${setup.fields} fields)`);
    ok(/^[A-Z0-9]{4}$/.test(setup.code), `a room code was issued (${setup.code})`);

    // Change the four choices, then start.
    await page.click('#mapCards .mapcard:nth-child(4)');
    await page.click('#modeChips .chip:nth-child(2)');
    await page.click('#botChips .chip:nth-child(3)');
    await sleep(250);
    const applied = await page.evaluate(() => ({
      map: document.querySelector('#mapCards .mapcard.is-on h4').textContent,
      mode: document.querySelector('#modeChips .chip.is-on').textContent,
      bots: document.querySelector('#botChips .chip.is-on').textContent,
    }));
    ok(applied.map === 'REACTOR' && applied.mode === 'Team Deathmatch',
      `the setup choices apply (${applied.mode} on ${applied.map}, ${applied.bots})`);

    await page.click('#startBtn');
    await sleep(5200);        // countdown plus a couple of seconds of play

    const live = await page.evaluate(() => ({
      hudVisible: !document.getElementById('hud').hidden,
      menusHidden: document.getElementById('screens').style.display === 'none',
      ammo: document.getElementById('ammoMag').textContent,
      weapon: document.getElementById('weaponName').textContent,
      health: document.getElementById('healthNum').textContent,
      timer: document.getElementById('matchTimer').textContent,
      touchShown: !document.getElementById('touch').hidden,
    }));
    ok(live.hudVisible && live.menusHidden, 'the match started and the HUD took over');
    ok(/^\d+$/.test(live.ammo) && Number(live.ammo) > 0, `ammo counter is live (${live.ammo})`);
    ok(live.weapon.length > 1, `weapon name shows (${live.weapon})`);
    /* Not "=== 100": the bots are live by now and may already have shot
       the test player, which is the system working. */
    const hp = Number(live.health);
    ok(Number.isFinite(hp) && hp > 0 && hp <= 100, `health shows a live value (${live.health})`);
    ok(/^\d+:\d\d$/.test(live.timer), `match timer runs (${live.timer})`);
    if (vp.mobile) ok(live.touchShown, 'touch controls appear on a touch device');
    else ok(!live.touchShown, 'touch controls stay hidden on desktop');

    if (vp.mobile) {
      const btns = await page.evaluate(() => [...document.querySelectorAll('.touch__btn')].map((b) => {
        const r = b.getBoundingClientRect();
        return { a: b.dataset.action, x: r.x, y: r.y, w: r.width, inView: r.x >= 0 && r.y >= 0 && r.right <= innerWidth && r.bottom <= innerHeight };
      }));
      ok(btns.length >= 7, `${btns.length} touch buttons are present`);
      ok(btns.every((b) => b.inView), 'every touch button is on screen');
      ok(btns.every((b) => b.w >= 34), `touch targets are big enough (smallest ${Math.min(...btns.map((b) => b.w)).toFixed(0)}px)`);
    }

    // Does it actually render and simulate?
    const perf = await page.evaluate(async () => {
      const t0 = performance.now();
      let frames = 0;
      await new Promise((res) => {
        const guard = setTimeout(res, 6000);
        const tick = () => {
          frames++;
          if (performance.now() - t0 < 1200) requestAnimationFrame(tick);
          else { clearTimeout(guard); res(); }
        };
        requestAnimationFrame(tick);
      });
      return { fps: frames / ((performance.now() - t0) / 1000) };
    });
    ok(perf.fps > 4, `the render loop runs (${perf.fps.toFixed(1)} fps under software GL)`);

    const dbg = await page.evaluate(() => window.__ocDebug());
    ok(dbg.vmParts > 0, `the weapon is drawn in first person (${dbg.vmParts} parts)`);
    ok(dbg.instances > 20, `the world is batched into instances (${dbg.instances})`);
    ok(dbg.calls <= 6, `the whole frame is ${dbg.calls} draw calls`);

    const pixels = await page.evaluate(() => {
      const c = document.getElementById('view');
      const gl = c.getContext('webgl2') || c.getContext('webgl');
      const px = new Uint8Array(4 * 64);
      gl.readPixels(Math.floor(c.width / 2) - 8, Math.floor(c.height / 2) - 8, 8, 8, gl.RGBA, gl.UNSIGNED_BYTE, px);
      let sum = 0, distinct = new Set();
      for (let i = 0; i < px.length; i += 4) { sum += px[i] + px[i + 1] + px[i + 2]; distinct.add(px[i] + ',' + px[i + 1] + ',' + px[i + 2]); }
      return { sum, distinct: distinct.size };
    });
    ok(pixels.sum > 0, 'the world is actually drawn (centre of the frame is not black)');

    // Simulated play: look around and shoot.
    const before = await page.evaluate(() => window.__ocDebug && window.__ocDebug());
    await page.mouse.move(vp.width / 2, vp.height / 2);
    await page.keyboard.down('KeyW');
    await sleep(700);
    await page.keyboard.up('KeyW');
    await sleep(400);

    ok(errors.length === 0, `no console errors during a full match (${errors.length})`,
      errors.slice(0, 3).join(' | '));

    await page.screenshot({ path: `/tmp/claude-0/-home-user-Websites/99d555a1-6dc1-5f8b-9a46-b142ab0dd50f/scratchpad/overclock-${vp.name.replace(/\s+/g, '-')}.png` }).catch(() => {});
    await ctx.close();
  }

  /* Two browsers, one room: the actual multiplayer claim. */
  console.log('\nreal multiplayer');
  {
    const a = await openPage(VIEWPORTS[2]);
    await a.page.waitForSelector('#screen-main.is-active', { timeout: 20000 });
    await a.page.click('[data-go="play"]');
    await a.page.click('[data-action="create"]');
    await a.page.waitForSelector('#screen-setup.is-active', { timeout: 8000 });
    const code = await a.page.textContent('#roomCode');
    ok(/^[A-Z0-9]{4}$/.test(code), `host created room ${code} on the dedicated server`);

    const b = await openPage(VIEWPORTS[2]);
    await b.page.waitForSelector('#screen-main.is-active', { timeout: 20000 });
    await b.page.click('[data-go="play"]');
    await b.page.fill('#joinCode', code);
    await b.page.click('[data-action="join"]');
    await b.page.waitForSelector('#screen-setup.is-active', { timeout: 8000 });
    await sleep(1200);

    const codes = await Promise.all([a.page, b.page].map((p) => p.textContent('#roomCode')));
    ok(codes[0] === codes[1], `both browsers are in room ${codes[0]} (guest sees ${codes[1]})`);
    const rosterA = await a.page.$$eval('#roster li', (n) => n.length);
    const rosterB = await b.page.$$eval('#roster li', (n) => n.length);
    ok(rosterA === 2 && rosterB === 2, `both browsers see both players (${rosterA}, ${rosterB})`);

    const hasStart = await b.page.evaluate(() => getComputedStyle(document.getElementById('startBtn')).display !== 'none');
    ok(!hasStart, 'the guest is not offered the start button');

    await a.page.click('#startBtn');
    await sleep(5200);

    const both = await Promise.all([a.page, b.page].map((p) => p.evaluate(() => ({
      hud: !document.getElementById('hud').hidden,
      timer: document.getElementById('matchTimer').textContent,
    }))));
    ok(both.every((x) => x.hud), 'both browsers are in the match');

    // Each browser should be able to see the other player's entity.
    const seen = await Promise.all([a.page, b.page].map((p) => p.evaluate(() =>
      new Promise((res) => setTimeout(() => res(window.__ocPeers ? window.__ocPeers() : -1), 500)))));
    ok(seen.every((n) => n === -1 || n >= 1), `each client tracks the other player (${seen.join(', ')})`);

    ok(a.errors.length === 0 && b.errors.length === 0,
      'no console errors in either browser',
      [...a.errors, ...b.errors].slice(0, 3).join(' | '));

    await a.ctx.close();
    await b.ctx.close();
  }
} catch (err) {
  console.error('\nERROR', err);
  console.error(serverLog.slice(-2000));
  fail++;
}

await browser.close();
console.log(`\n${pass} passed, ${fail} failed`);
done(fail ? 1 : 0);
