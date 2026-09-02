/* Boot and wiring.
 *
 * The shape of the thing: one canvas, one renderer, one input state that
 * either the keyboard or the touchscreen fills in, and one network client
 * whose transport is either a real socket or a server running in this tab.
 * Everything above that — menus, HUD, the match, the aim trainer — talks
 * only to those.
 *
 * The most important behaviour here is the fallback: if the multiplayer
 * server cannot be reached, the game does not stop. It hosts the match
 * locally instead, tells you it has, and stays completely playable. A
 * browser game that shows a connection error and nothing else has wasted
 * the one advantage it has over a download.
 */

import { $, $$, el, clear, control, Screens, toast, fmtTime } from './ui/ui.js';
import * as Settings from './ui/settings.js';
import { Hud, scoreTable } from './ui/hud.js';
import { Menus } from './ui/menus.js';
import { Renderer, PRESETS } from './engine/renderer.js';
import { Audio } from './audio/audio.js';
import { InputState, BTN } from './input/input.js';
import { DesktopInput } from './input/desktop.js';
import { TouchControls, Gyro } from './input/touch.js';
import { NetClient } from './net/client.js';
import { WebSocketTransport, LocalTransport, defaultServerUrl } from './net/transport.js';
import { Game } from './game/game.js';
import { AimTrainer, DRILLS, DRILL_IDS } from './modes/aimtrainer.js';
import { getMode, MODE_IDS } from '../../shared/sim/modes.js';
import { getMap, MAP_INFO } from '../../shared/maps/index.js';
import { WEAPONS, WEAPON_IDS } from '../../shared/weapons.js';
import { GAME_STATE, TEAM } from '../../shared/constants.js';

const isTouch = matchMedia('(hover: none) and (pointer: coarse)').matches ||
  (navigator.maxTouchPoints > 0 && !matchMedia('(pointer: fine)').matches);

const settings = Settings.load();
let stats = Settings.loadStats();

const audio = new Audio();
const input = new InputState();
const hud = new Hud(settings);
const screens = new Screens(audio);
const net = new NetClient();

let renderer = null;
let game = null;
let trainer = null;
let desktop = null;
let touch = null;
let gyro = null;
let mode = 'menu';                 // menu | match | training
let lastLobby = null;
let pendingStartConfig = null;

/* ── Boot ───────────────────────────────────────────────────────────── */
async function boot() {
  const canvas = $('#view');
  try {
    renderer = new Renderer(canvas, {
      quality: settings.quality,
      resolutionScale: settings.resolutionScale,
      dynamicResolution: settings.dynamicResolution,
    });
    renderer.renderDistance = settings.renderDistance;
  } catch (err) {
    $('#bootMsg').textContent = err.message + ' OVERCLOCK needs WebGL.';
    return;
  }

  /* Building a map costs a few tens of milliseconds and the first one is
     needed for the menu backdrop anyway, so it happens during the boot
     screen rather than on the first frame of a match. */
  $('#bootMsg').textContent = 'Building the world…';
  await frame();
  getMap('foundry');
  renderer.setMap(getMap('foundry'));

  desktop = new DesktopInput(canvas, input, settings);
  desktop.setBindings(settings.bindings);
  desktop.onMenu = () => togglePause();
  desktop.onLockChange = (locked) => {
    if (locked) { desktop.lockDenied = false; return; }
    if (mode !== 'menu' && !$('#screen-pause').classList.contains('is-active')) togglePause(true);
  };

  touch = new TouchControls($('#touch'), input, settings);
  touch.setLayout(settings.touchLayout);
  touch.onMenu = () => togglePause();
  gyro = new Gyro(input, settings);

  game = new Game({ net, audio, hud, settings, input, renderer });
  trainer = new AimTrainer({ renderer, audio, settings, hud, input });
  trainer.onFinish = showTrainingResult;

  wireNet();
  wireMenus();
  wireGlobal();

  applyAudioSettings();
  $('#profileName').value = settings.name;
  $('#profileLevel').textContent = String(Settings.levelFor(stats.xp).level);
  $('#serverNote').textContent = defaultServerUrl()
    ? 'Multiplayer: ' + defaultServerUrl().replace(/^wss?:\/\//, '')
    : 'Offline only — open over http:// for multiplayer.';

  $('#boot').hidden = true;
  screens.show('main', false);
  requestAnimationFrame(loop);
}

const frame = () => new Promise((r) => requestAnimationFrame(r));

/* ── Networking ─────────────────────────────────────────────────────── */
function wireNet() {
  /* Deliberately does not answer with HELLO: the server replies to a
     HELLO with a WELCOME, so doing that here is an infinite handshake
     that trips the flood limiter and drops the connection. The one HELLO
     is sent by connect(), once per socket. */
  net.on.welcome = () => {
    $('#profileName').value = settings.name;
  };
  net.on.error = (m) => toast(m, true);
  net.on.close = () => {
    if (mode === 'match') { toast('Disconnected from the server.', true); leaveMatch(); }
  };
  net.on.lobby = (d) => {
    if (d.list) { menus.renderRooms(d.list); return; }
    lastLobby = d;
    menus.renderLobby(d);
    if (screens.current !== 'setup' && mode === 'menu') screens.show('setup');
  };
  net.on.matchStart = (d) => startMatch(d);
  net.on.snapshot = (s) => { if (game) game.onSnapshot(s); };
  net.on.events = (e) => { if (game) game.onEvents(e); };
  net.on.scores = (d) => { if (game) game.onScores(d); };
  net.on.matchEnd = (d) => endMatch(d);
  net.on.chat = (d) => toast(`${d.from}: ${d.text}`);
}

function profile() {
  return { name: settings.name, skin: settings.skin, loadout: settings.loadout };
}

async function connect(preferLocal = false) {
  const url = defaultServerUrl();
  if (!preferLocal && url) {
    try {
      await net.connect(new WebSocketTransport(url));
      net.hello(profile());
      return 'online';
    } catch (err) {
      toast('No multiplayer server reachable — hosting locally instead.', true, 4200);
    }
  }
  await net.connect(new LocalTransport());
  net.hello(profile());
  return 'local';
}

/* ── Menus ──────────────────────────────────────────────────────────── */
const menus = new Menus({
  net, settings, stats, screens, audio, isTouch,
  saveSettings: () => Settings.save(settings),
  resetSettingsGroup: (g) => { Settings.resetGroup(settings, g); Settings.save(settings); applyAllSettings(); },
  onSettingChanged: (key, value) => onSettingChanged(key, value),
  onSettingsAction: (action) => {
    if (action === 'edit-layout') startLayoutEditor();
    if (action === 'edit-bindings') toast('Rebind by pressing a key while its row is focused — coming from the pause menu.');
  },
});

function wireMenus() {
  for (const b of $$('[data-go]')) {
    b.onclick = () => { audio.unlock(); audio.uiClick(); goto(b.dataset.go); };
  }
  for (const b of $$('[data-back]')) b.onclick = () => screens.back();

  $$('#screen-play [data-action]').forEach((b) => {
    b.onclick = async () => {
      audio.unlock(); audio.uiClick();
      const a = b.dataset.action;
      if (a === 'quick') { await connect(); net.lobby('quick', { prefs: {} }); }
      else if (a === 'solo') { await connect(true); net.lobby('create', { config: { name: settings.name + ' OFFLINE', private: true, botCount: 6 } }); }
      else if (a === 'create') { await connect(); net.lobby('create', { config: { name: settings.name + "'S MATCH" } }); }
      else if (a === 'browse') { await connect(); net.lobby('list'); screens.show('browser'); }
      else if (a === 'join') {
        const code = $('#joinCode').value.trim().toUpperCase();
        if (code.length < 3) { toast('Enter the four-character room code.', true); return; }
        await connect();
        net.lobby('join', { code });
      }
    };
  });
  $('#screen-browser [data-action="refresh"]').onclick = () => { audio.uiClick(); net.lobby('list'); };

  $('#startBtn').onclick = () => { audio.uiClick(); net.lobby('start'); };
  $('#readyBtn').onclick = (e) => {
    const on = !e.currentTarget.classList.contains('is-on');
    e.currentTarget.classList.toggle('is-on', on);
    e.currentTarget.textContent = on ? 'READY' : 'NOT READY';
    audio.uiClick();
    net.lobby('ready', { ready: on });
  };
  $('#inviteBtn').onclick = async () => {
    const code = lastLobby ? lastLobby.code : '';
    const url = location.origin + location.pathname + '?room=' + code;
    try { await navigator.clipboard.writeText(url); toast('Invite link copied — code ' + code); }
    catch { toast('Room code: ' + code); }
  };

  $('#profileName').oninput = (e) => {
    settings.name = e.target.value.replace(/[^A-Za-z0-9_.-]/g, '').slice(0, 16) || Settings.suggestName();
    Settings.save(settings);
  };
  $('#profileName').onblur = (e) => { e.target.value = settings.name; net.hello(profile()); };

  // Results screen.
  $$('#screen-results [data-action]').forEach((b) => {
    b.onclick = () => {
      audio.uiClick();
      const a = b.dataset.action;
      if (a === 'again') net.lobby('start');
      else if (a === 'lobby') screens.show('setup', false);
      else { net.lobby('leave'); net.close(); screens.show('main', false); }
    };
  });

  // Pause menu.
  $$('#screen-pause [data-action]').forEach((b) => {
    b.onclick = () => {
      audio.uiClick();
      const a = b.dataset.action;
      if (a === 'resume') togglePause(false);
      else if (a === 'layout') { togglePause(false); startLayoutEditor(); }
      else if (a === 'quit') leaveMatch(true);
    };
  });

  buildTraining();
}

function goto(name) {
  if (name === 'loadout') menus.renderLoadout();
  if (name === 'stats') { menus.ctx.stats = stats; menus.renderStats(); }
  if (name === 'settings') menus.renderSettings();
  screens.show(name);
}

/* ── Settings side-effects ──────────────────────────────────────────── */
function onSettingChanged(key, value) {
  switch (key) {
    case 'quality':
      renderer.setQuality(value, {
        resolutionScale: settings.resolutionScale,
        dynamicResolution: settings.dynamicResolution,
        renderDistance: settings.renderDistance,
      });
      if (game) game.effects.setBudget(PRESETS[value].particles);
      if (trainer) trainer.effects.setBudget(PRESETS[value].particles);
      menus.renderSettings();
      break;
    case 'resolutionScale':
      renderer.res.scale = value; renderer.res.resize(true); break;
    case 'dynamicResolution':
      renderer.res.enabled = value; break;
    case 'renderDistance':
      renderer.renderDistance = value; break;
    case 'gyro':
      if (value) gyro.enable().then((ok) => { if (!ok) { settings.gyro = false; Settings.save(settings); toast('This device did not allow gyroscope access.', true); menus.renderSettings(); } });
      else gyro.disable();
      break;
    case 'buttonOpacity': case 'stickZone':
      touch.applyLayout(); break;
    default:
      break;
  }
  hud.applySettings();
  applyAudioSettings();
}

function applyAllSettings() {
  renderer.setQuality(settings.quality, {
    resolutionScale: settings.resolutionScale,
    dynamicResolution: settings.dynamicResolution,
    renderDistance: settings.renderDistance,
  });
  hud.applySettings();
  applyAudioSettings();
  touch.applyLayout();
}

function applyAudioSettings() {
  audio.setVolumes({
    master: settings.volumeMaster, effects: settings.volumeEffects,
    music: settings.volumeMusic, ui: settings.volumeUi,
  });
}

/* ── Match flow ─────────────────────────────────────────────────────── */
function startMatch(info) {
  mode = 'match';
  screens.hideAll();
  hud.show(true);
  game.start(info);
  input.yaw = 0; input.pitch = 0;
  if (isTouch) { touch.show(true); $('#touch').hidden = false; }
  else { desktop.enabled = true; desktop.requestLock(); }
  audio.unlock();
  checkOrientation();
}

function endMatch(result) {
  const rows = result.scoreboard || [];
  const mine = rows.find((r) => r.id === (game ? game.selfId : 0));
  const modeDef = getMode(result.mode);
  const won = !!(result.winner && (
    (result.winner.playerId && game && result.winner.playerId === game.selfId) ||
    (result.winner.team && mine && result.winner.team === mine.team)
  ));

  $('#resultLabel').textContent = result.reason === 'time' ? 'TIME' : result.reason === 'score' ? 'SCORE LIMIT' : 'MATCH OVER';
  $('#resultWinner').textContent = result.winner ? result.winner.text : '—';
  $('#resultSub').textContent = [
    result.winner ? result.winner.sub : '',
    (MAP_INFO[result.mapId] || {}).name || '',
    fmtTime(result.duration),
  ].filter(Boolean).join(' · ');

  const table = $('#resultTable');
  clear(table);
  table.appendChild(scoreTable(rows, modeDef, game ? game.selfId : 0));

  if (mine) {
    stats = Settings.applyMatchResult(stats, mine, won, result.duration);
    Settings.saveStats(stats);
    menus.ctx.stats = stats;
    const lv = Settings.levelFor(stats.xp);
    $('#profileLevel').textContent = String(lv.level);
    $('#resultXp').textContent =
      `+${(mine.xp || 0) + (won ? 250 : 0)} XP · LEVEL ${lv.level} · ${Math.round(lv.progress * 100)}% to next` +
      ` · ${mine.kills}/${mine.deaths} · ${(mine.acc * 100).toFixed(0)}% accuracy`;
  } else $('#resultXp').textContent = '';

  audio.matchEnd(won);
  leaveMatch(false);
  screens.show('results', false);
}

function leaveMatch(toMenu = false) {
  if (game) game.stop();
  mode = 'menu';
  desktop.enabled = false;
  desktop.releaseLock();
  touch.show(false);
  $('#touch').hidden = true;
  hud.show(false);
  hud.scoreboard(false);
  $('#countdown').hidden = true;
  if (toMenu) { net.lobby('leave'); net.close(); screens.show('main', false); }
}

function togglePause(force) {
  if (mode !== 'match' && mode !== 'training') return;
  const pauseScreen = $('#screen-pause');
  const showing = force !== undefined ? force : !pauseScreen.classList.contains('is-active');
  if (showing) {
    screens.show('pause', false);
    desktop.enabled = false;
    desktop.releaseLock();
    touch.show(false);
    audio.uiBack();
  } else {
    screens.hideAll();
    if (isTouch) touch.show(true);
    else { desktop.enabled = true; desktop.requestLock(); }
  }
}

/* ── Aim training ───────────────────────────────────────────────────── */
let trainingCfg = { drill: 'flick', size: 0.42, speed: 4, duration: 60, weapon: null };

function buildTraining() {
  const box = $('#trainingModes');
  clear(box);
  for (const id of DRILL_IDS) {
    const d = DRILLS[id];
    const b = el('button', 'card' + (trainingCfg.drill === id ? ' is-on' : ''));
    b.appendChild(el('h3', null, d.name));
    b.appendChild(el('p', null, d.blurb));
    b.onclick = () => { trainingCfg.drill = id; audio.uiClick(); buildTraining(); };
    box.appendChild(b);
  }
  const fields = $('#trainingFields');
  clear(fields);
  const rows = [
    { key: 'size', label: 'Target size', type: 'range', min: 0.16, max: 1.1, step: 0.02, format: (v) => v.toFixed(2) + ' m' },
    { key: 'speed', label: 'Target speed', type: 'range', min: 0, max: 12, step: 0.5, format: (v) => v.toFixed(1) + ' m/s' },
    { key: 'duration', label: 'Session length', type: 'range', min: 15, max: 300, step: 15, format: (v) => fmtTime(v) },
  ];
  for (const r of rows) fields.appendChild(control(r, trainingCfg[r.key], (v) => { trainingCfg[r.key] = v; }));

  const gunRow = el('div', 'field');
  gunRow.appendChild(el('label', null, 'WEAPON'));
  const chips = el('div', 'chips');
  for (const id of WEAPON_IDS) {
    if (WEAPONS[id].melee) continue;
    const c = el('button', 'chip' + ((trainingCfg.weapon || settings.loadout.primary) === id ? ' is-on' : ''), WEAPONS[id].name);
    c.onclick = () => { trainingCfg.weapon = id; buildTraining(); };
    chips.appendChild(c);
  }
  gunRow.appendChild(chips);
  fields.appendChild(gunRow);

  const best = AimTrainer.loadBest();
  const b = best[trainingCfg.drill];
  $('#trainingBest').textContent = b
    ? `BEST — score ${b.score}, ${(b.accuracy * 100).toFixed(1)}% accuracy${b.avgReaction ? `, ${b.avgReaction.toFixed(0)}ms average reaction` : ''}`
    : 'No result recorded for this drill yet.';

  $('#trainStart').onclick = () => {
    audio.unlock(); audio.uiClick();
    mode = 'training';
    screens.hideAll();
    trainer.start({ ...trainingCfg, weapon: trainingCfg.weapon || settings.loadout.primary });
    if (isTouch) { touch.show(true); $('#touch').hidden = false; }
    else { desktop.enabled = true; desktop.requestLock(); }
    checkOrientation();
  };
}

function showTrainingResult(r) {
  mode = 'menu';
  desktop.enabled = false;
  desktop.releaseLock();
  touch.show(false);
  $('#touch').hidden = true;
  $('#perfStats').hidden = !(settings.showFps || settings.showNetGraph);

  $('#resultLabel').textContent = 'AIM TRAINING' + (r.record ? ' — NEW BEST' : '');
  $('#resultWinner').textContent = r.drillName;
  $('#resultSub').textContent = `${r.score} points in ${fmtTime(r.duration)}`;
  const table = $('#resultTable');
  clear(table);
  const grid = el('div', 'statgrid');
  const tile = (n, l) => { const t = el('div', 'stattile'); t.appendChild(el('div', 'stattile__num', n)); t.appendChild(el('div', 'stattile__label', l)); grid.appendChild(t); };
  tile(String(r.shots), 'SHOTS FIRED');
  tile(String(r.hits), 'SHOTS HIT');
  tile((r.accuracy * 100).toFixed(1) + '%', 'ACCURACY');
  tile((r.headshotRate * 100).toFixed(0) + '%', 'HEADSHOTS');
  tile(String(r.kills), 'TARGETS');
  tile(r.avgReaction ? r.avgReaction.toFixed(0) + 'ms' : '—', 'AVG REACTION');
  tile(r.bestReaction ? r.bestReaction.toFixed(0) + 'ms' : '—', 'BEST REACTION');
  tile(r.duration ? (r.kills / (r.duration / 60)).toFixed(1) : '0', 'TARGETS / MIN');
  table.appendChild(grid);
  $('#resultXp').textContent = '';
  screens.show('results', false);
  buildTraining();
}

/* ── Touch layout editor ────────────────────────────────────────────── */
let layoutTarget = 'fire';
function startLayoutEditor() {
  screens.hideAll();
  touch.show(true);
  $('#touch').hidden = false;
  touch.setEditing(true);
  $('#layoutBar').hidden = false;
  const slider = $('#layoutSize');
  slider.value = touch.layout[layoutTarget].size;
  slider.oninput = () => touch.resize(layoutTarget, parseFloat(slider.value));
  $('#layoutReset').onclick = () => { touch.resetLayout(); slider.value = touch.layout[layoutTarget].size; };
  $('#layoutDone').onclick = () => {
    touch.setEditing(false);
    $('#layoutBar').hidden = true;
    settings.touchLayout = touch.layout;
    Settings.save(settings);
    touch.show(false);
    $('#touch').hidden = true;
    goto('settings');
    toast('Layout saved');
  };
  // Pick whichever button was last dragged for the size slider.
  touch.onEditChange = () => {};
  $('#touch').addEventListener('pointerdown', (e) => {
    const b = e.target.closest && e.target.closest('.touch__btn');
    if (b && touch.editing) { layoutTarget = b.dataset.action; slider.value = touch.layout[layoutTarget].size; }
  });
}

/* ── Global input and orientation ───────────────────────────────────── */
function wireGlobal() {
  const canvas = $('#view');
  const unlock = () => audio.unlock();
  window.addEventListener('pointerdown', unlock, { once: true });
  window.addEventListener('keydown', unlock, { once: true });

  canvas.addEventListener('click', () => {
    if (mode !== 'menu' && !isTouch && !$('#screen-pause').classList.contains('is-active')) desktop.requestLock();
  });

  window.addEventListener('keydown', (e) => {
    if (mode === 'menu') return;
    if (desktop.matches('scoreboard', e.code)) { e.preventDefault(); showScoreboard(true); }
  });
  window.addEventListener('keyup', (e) => {
    if (desktop.matches('scoreboard', e.code)) showScoreboard(false);
  });

  window.addEventListener('resize', () => { renderer.res.resize(true); checkOrientation(); });
  window.addEventListener('orientationchange', () => setTimeout(checkOrientation, 220));
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { audio.suspend(); if (mode === 'match') togglePause(true); }
    else audio.resume();
  });

  // A ?room=CODE link joins straight into that lobby.
  const room = new URLSearchParams(location.search).get('room');
  if (room) {
    connect().then(() => net.lobby('join', { code: room.toUpperCase() }));
  }
}

function showScoreboard(on) {
  if (mode !== 'match' || !game) { hud.scoreboard(false); return; }
  if (on) {
    hud.renderScoreboard(game.scoreboardRows(), game.mode, game.selfId,
      `${(MAP_INFO[game.config.mapId] || {}).name || ''} · ${fmtTime(game.timeLeft)} remaining`);
  }
  hud.scoreboard(on);
}

function checkOrientation() {
  const portrait = window.innerHeight > window.innerWidth;
  const small = Math.min(window.innerWidth, window.innerHeight) < 560;
  const needsLandscape = isTouch && portrait && small && mode !== 'menu';
  $('#rotatePrompt').hidden = !needsLandscape;
  /* Ask for landscape where the browser allows it. Most will refuse
     outside fullscreen, which is why the prompt above exists too. */
  if (needsLandscape && screen.orientation && screen.orientation.lock) {
    screen.orientation.lock('landscape').catch(() => {});
  }
}

/* ── Frame loop ─────────────────────────────────────────────────────── */
let last = performance.now();
let frameMs = 16.7;
let fpsAccum = 0, fpsFrames = 0, fps = 60;

function loop(now) {
  requestAnimationFrame(loop);
  const dtMs = Math.min(now - last, 100);
  last = now;
  const dt = dtMs / 1000;
  const t0 = performance.now();

  net.update(dtMs);

  if (mode === 'match' && game && game.active) {
    pollInput();
    game.update(dt, frameMs);
    game.render(dt, frameMs);
    if (input.scoreboard !== hudScores) { hudScores = input.scoreboard; showScoreboard(input.scoreboard); }
  } else if (mode === 'training' && trainer && trainer.active) {
    pollInput();
    trainer.update(dt);
    trainer.render(dt, frameMs);
  }

  frameMs = frameMs * 0.9 + (performance.now() - t0) * 0.1;
  fpsAccum += dtMs; fpsFrames++;
  if (fpsAccum >= 500) {
    fps = Math.round((fpsFrames * 1000) / fpsAccum);
    fpsAccum = 0; fpsFrames = 0;
    if (settings.showFps || settings.showNetGraph) updatePerf();
  }
}

let hudScores = false;

function pollInput() {
  if (isTouch) touch.poll();
  else desktop.poll();
}

function updatePerf() {
  if (mode === 'training') return;   // the trainer owns that panel
  const lines = [];
  if (settings.showFps) {
    lines.push(`${fps} FPS   ${frameMs.toFixed(1)}ms`);
    lines.push(`${(renderer.res.scale * 100) | 0}% scale  ${renderer.stats.instances} boxes`);
    lines.push(`${renderer.stats.calls} draw calls  ${renderer.stats.sprites} sprites`);
  }
  if (settings.showNetGraph) {
    lines.push(`${net.ping}ms ping  ${net.isLocal ? 'local' : 'online'}`);
    lines.push(`${net.rateWindow.kbIn.toFixed(1)} kB/s down  ${net.rateWindow.kbOut.toFixed(1)} up`);
    if (game && game.prediction) lines.push(`${game.prediction.pending.length} unacked  ${game.prediction.worstError.toFixed(2)}m error`);
  }
  hud.perf(lines.join('\n'));
  $('#perfStats').hidden = false;
}

/* A very small read-only debug surface. The browser test uses it to check
   that each client really is tracking the other players rather than just
   rendering an empty room, and it is handy from a console. */
let __lastPos = null, __moved = 0, __turned = 0, __lastYaw = 0;
window.__ocDebug = () => {
  if (game && game.prediction) {
    const p = game.prediction.ph.pos;
    if (__lastPos) __moved += Math.hypot(p.x - __lastPos.x, p.z - __lastPos.z);
    __lastPos = { x: p.x, z: p.z };
    __turned += Math.abs(input.yaw - __lastYaw) > 3 ? 0 : Math.abs(input.yaw - __lastYaw);
    __lastYaw = input.yaw;
  }
  return {
  mode,
  fps,
  frameMs: +frameMs.toFixed(2),
  ping: net.ping,
  local: net.isLocal,
  scale: renderer ? +renderer.res.scale.toFixed(2) : 0,
  instances: renderer ? renderer.stats.instances : 0,
  calls: renderer ? renderer.stats.calls : 0,
  vmParts: renderer ? renderer.stats.viewmodel : 0,
  peers: game && game.remotes ? game.remotes.tracks.size : 0,
  unacked: game && game.prediction ? game.prediction.pending.length : 0,
  error: game && game.prediction ? +game.prediction.worstError.toFixed(3) : 0,
  yaw: +input.yaw.toFixed(3),
  movedRecently: __moved > 1.5,
  turned: __turned > 0.15,
  };
};
window.__ocPeers = () => (game && game.remotes ? game.remotes.tracks.size : -1);

/* The predicted local player, for the controls test: every assertion there
   is "press this, get that", and reading it off the simulation is the only
   way to tell an input bug from a rendering one. */
window.__ocState = () => {
  const g = game && game.prediction;
  if (!g) return null;
  const p = g.player, a = g.ammo;
  return {
    x: p.ph.pos.x, y: p.ph.pos.y, z: p.ph.pos.z,
    yaw: input.yaw, pitch: input.pitch,
    height: p.ph.height, onGround: p.ph.onGround,
    speed: Math.hypot(p.ph.vel.x, p.ph.vel.z),
    slot: p.slot, weapon: p.weapons[p.slot],
    mag: a ? a.mag : 0, reserve: a ? a.reserve : 0,
    ads: p.ads, reloading: p.reloadUntil > (game.remotes.serverClock || 0),
    health: p.health,
  };
};

boot();
