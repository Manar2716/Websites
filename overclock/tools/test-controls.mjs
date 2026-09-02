/* Desktop controls, checked one at a time against the simulation.
 *
 *   node tools/test-controls.mjs
 *
 * Every assertion here is "press this, and the player does that" — read off
 * the predicted player state rather than off the screen, because an input
 * bug and a rendering bug look identical in a screenshot.
 */

import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = 8760 + (process.pid % 120);
const BASE = `http://127.0.0.1:${PORT}`;
let pass = 0, fail = 0;
const ok = (c, label, detail = '') => {
  if (c) { pass++; console.log('  ok   ' + label); }
  else { fail++; console.log('  FAIL ' + label + (detail ? '  — ' + detail : '')); }
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const server = spawn(process.execPath, [path.join(ROOT, 'server', 'index.js')],
  { env: { ...process.env, PORT: String(PORT), HOST: '127.0.0.1' }, stdio: ['ignore', 'pipe', 'pipe'] });
let log = '';
server.stdout.on('data', (b) => { log += b; });
server.stderr.on('data', (b) => { log += b; });
for (let i = 0; i < 60; i++) { try { if ((await fetch(BASE + '/health')).ok) break; } catch {} await sleep(150); }

const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox', '--disable-dev-shm-usage',
    '--disable-background-networking', '--mute-audio', '--no-first-run'],
});

try {
  const ctx = await browser.newContext({ viewport: { width: 1100, height: 620 }, deviceScaleFactor: 1 });
  await ctx.addInitScript(() => localStorage.setItem('overclock.settings.v1', JSON.stringify({
    quality: 'low', resolutionScale: 0.5, dynamicResolution: false, name: 'CTRL', sensitivity: 1,
  })));
  const page = await ctx.newPage();
  page.setDefaultTimeout(25000);
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(BASE + '/', { waitUntil: 'load' });
  await page.waitForSelector('#screen-main.is-active');
  await page.click('[data-go="play"]');
  await page.click('[data-action="solo"]');
  await page.waitForSelector('#screen-setup.is-active');
  // No bots: this is about controls, not about being shot mid-measurement.
  await page.evaluate(() => {
    for (const c of document.querySelectorAll('#botChips .chip')) if (c.textContent === 'NO BOTS') c.click();
  });
  await sleep(300);
  await page.click('#startBtn');
  for (let i = 0; i < 30; i++) {
    await sleep(400);
    const s = await page.evaluate(() => window.__ocDebug());
    if (s.mode === 'match' && i > 10) break;
  }
  await page.click('#view');            // take the pointer lock
  await sleep(400);

  const st = () => page.evaluate(() => window.__ocState());
  const locked = await page.evaluate(() => !!document.pointerLockElement);
  ok(locked, 'the canvas takes the pointer lock on click');

  /* ── Look ──────────────────────────────────────────────────────── */
  {
    const a = await st();
    await page.mouse.move(550, 310);
    for (let i = 0; i < 20; i++) { await page.mouse.move(550 + i * 12, 310); await sleep(12); }
    await sleep(200);
    const b = await st();
    const dYaw = b.yaw - a.yaw;
    ok(Math.abs(dYaw) > 0.15, `moving the mouse right turns the view (${dYaw.toFixed(3)} rad)`);
    ok(dYaw < 0, 'and it turns to the right, not the left', `yaw went ${dYaw > 0 ? 'up' : 'down'}`);
  }
  {
    const a = await st();
    for (let i = 0; i < 16; i++) { await page.mouse.move(550, 310 + i * 8); await sleep(12); }
    await sleep(200);
    const b = await st();
    ok(b.pitch < a.pitch - 0.05, `pushing the mouse forward looks down (${(b.pitch - a.pitch).toFixed(3)} rad)`);
  }

  /* ── Movement, relative to where you are looking ───────────────── */
  const walk = async (key, ms = 550) => {
    const a = await st();
    await page.keyboard.down(key); await sleep(ms); await page.keyboard.up(key);
    await sleep(220);
    const b = await st();
    // Express the displacement in the player's own frame at the time.
    const dx = b.x - a.x, dz = b.z - a.z;
    const f = { x: -Math.sin(a.yaw), z: -Math.cos(a.yaw) };
    const r = { x: Math.cos(a.yaw), z: -Math.sin(a.yaw) };
    return { forward: dx * f.x + dz * f.z, right: dx * r.x + dz * r.z, dist: Math.hypot(dx, dz) };
  };
  {
    const w = await walk('KeyW');
    ok(w.forward > 1.2 && Math.abs(w.right) < 0.6, `W walks forward (${w.forward.toFixed(2)} fwd, ${w.right.toFixed(2)} side)`);
    const s = await walk('KeyS');
    ok(s.forward < -1.0, `S walks back (${s.forward.toFixed(2)})`);
    const d = await walk('KeyD');
    ok(d.right > 1.0 && Math.abs(d.forward) < 0.6, `D strafes right (${d.right.toFixed(2)} side)`);
    const a2 = await walk('KeyA');
    ok(a2.right < -1.0, `A strafes left (${a2.right.toFixed(2)})`);
  }
  {
    /* Peak speed, not displacement: measuring how far you got depends on
       what you ran into, which is a property of the map rather than of
       the sprint key. */
    const peak = async (sprinting) => {
      if (sprinting) await page.keyboard.down('ShiftLeft');
      await page.keyboard.down('KeyW');
      let best = 0;
      for (let i = 0; i < 14; i++) { await sleep(55); best = Math.max(best, (await st()).speed); }
      await page.keyboard.up('KeyW');
      if (sprinting) await page.keyboard.up('ShiftLeft');
      await sleep(320);
      // Turn around so the next run has fresh ground in front of it.
      for (let i = 0; i < 30; i++) { await page.mouse.move(550 + i * 20, 310); await sleep(8); }
      await sleep(200);
      return best;
    };
    const plain = await peak(false);
    const sprint = await peak(true);
    ok(sprint > plain * 1.15, `Shift sprints (${plain.toFixed(2)} -> ${sprint.toFixed(2)} u/s)`);
  }

  /* ── Jump and crouch ───────────────────────────────────────────── */
  {
    const a = await st();
    await page.keyboard.press('Space');
    await sleep(220);
    const b = await st();
    ok(b.y > a.y + 0.25, `Space jumps (${(b.y - a.y).toFixed(2)} units up)`);
    await sleep(700);
  }
  {
    const a = await st();
    await page.keyboard.down('ControlLeft'); await sleep(420);
    const b = await st();
    await page.keyboard.up('ControlLeft'); await sleep(420);
    const c = await st();
    ok(b.height < a.height - 0.2, `Ctrl crouches (${a.height.toFixed(2)} -> ${b.height.toFixed(2)})`);
    ok(c.height > b.height + 0.2, 'and releasing it stands back up');
  }

  /* ── Firing, reloading, switching ──────────────────────────────── */
  {
    const a = await st();
    await page.mouse.down(); await sleep(420); await page.mouse.up();
    await sleep(250);
    const b = await st();
    ok(b.mag < a.mag, `left mouse fires (${a.mag} -> ${b.mag})`);
    ok(b.weapon === a.weapon, 'and does not change weapon');
  }
  {
    const a = await st();
    await page.keyboard.press('KeyR');
    await sleep(300);
    const b = await st();
    ok(b.reloading, 'R starts a reload');
    await sleep(2600);
    const c = await st();
    ok(c.mag > b.mag, `and the magazine fills (${b.mag} -> ${c.mag})`);
  }
  {
    const a = await st();
    await page.keyboard.press('Digit2');
    await sleep(500);
    const b = await st();
    ok(b.weapon !== a.weapon && b.slot === 1, `2 switches to the sidearm (${a.weapon} -> ${b.weapon})`);
    await page.keyboard.press('Digit1');
    await sleep(500);
    const c = await st();
    ok(c.slot === 0, `1 switches back (${c.weapon})`);
  }
  {
    // Holding the swap key must advance one weapon, not spin through them.
    const a = await st();
    await page.keyboard.down('KeyQ'); await sleep(900); await page.keyboard.up('KeyQ');
    await sleep(400);
    const b = await st();
    ok(b.slot === (a.slot + 1) % 3, `holding Q advances exactly one weapon (${a.slot} -> ${b.slot})`);
  }
  {
    const a = await st();
    await page.mouse.down({ button: 'right' }); await sleep(450);
    const b = await st();
    await page.mouse.up({ button: 'right' }); await sleep(450);
    const c = await st();
    ok(b.ads > 0.7, `right mouse aims down sights (ads ${b.ads.toFixed(2)})`);
    ok(c.ads < 0.3, 'and releasing lowers them');
  }

  ok(errors.length === 0, `no console errors while driving the controls (${errors.length})`, errors.slice(0, 3).join(' | '));
  await ctx.close();
} catch (err) {
  console.error('\nERROR', err.message);
  console.error(log.slice(-1200));
  fail++;
}

await browser.close();
server.kill('SIGKILL');
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
