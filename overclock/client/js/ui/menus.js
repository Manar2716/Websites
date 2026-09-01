/* The menus.
 *
 * The one screen worth reading closely is the game setup, because it is
 * the four choices the brief is built around — mode, map, bots, rules —
 * and it is the same screen whether you are hosting sixteen people or
 * playing alone against four bots. Everything on it is driven by the
 * room's config, so a change by the host redraws it for everyone.
 */

import { $, $$, el, clear, control, toast, fmtTime } from './ui.js';
import { MAP_INFO, MAP_IDS } from '../../../shared/maps/index.js';
import { MODES, MODE_IDS, getMode } from '../../../shared/sim/modes.js';
import { DIFFICULTIES, DIFFICULTY_IDS } from '../../../shared/sim/bots.js';
import { WEAPONS, WEAPON_IDS, getWeapon, stk, shotInterval } from '../../../shared/weapons.js';
import { SCHEMA, GROUPS, levelFor } from './settings.js';
import { TEAM_COLOURS } from '../game/avatar.js';
import { MAX_BOTS } from '../../../shared/constants.js';

const BOT_COUNTS = [0, 2, 4, 6, 8, 10, 12];

/* Fields three and four of the setup. Ranges rather than free text: a
   score limit typed as 9999 is a lobby nobody ever leaves. */
const MATCH_FIELDS = [
  { key: 'duration', label: 'Match duration', type: 'range', min: 0, max: 1200, step: 60, format: (v) => (v ? fmtTime(v) : 'No limit') },
  { key: 'scoreLimit', label: 'Score limit', type: 'range', min: 0, max: 100, step: 5, format: (v) => (v ? String(v) : 'No limit') },
  { key: 'friendlyFire', label: 'Friendly fire', type: 'toggle' },
  { key: 'respawn', label: 'Respawning', type: 'toggle', hint: 'Off makes every life the last one until the round ends.' },
  { key: 'maxPlayers', label: 'Player slots', type: 'range', min: 2, max: 16, step: 1 },
  { key: 'private', label: 'Private room', type: 'toggle', hint: 'Keeps the room out of the browser. The code still works.' },
];

export class Menus {
  constructor(ctx) {
    this.ctx = ctx;                 // { net, settings, stats, screens, audio, onStart, onQuit }
    this.lobby = null;
    this.isHost = false;
    this.settingsTab = 'Graphics';
    this.selectedGun = null;
    this._buildStatic();
  }

  /* ── Setup screen ──────────────────────────────────────────────── */
  renderLobby(state) {
    this.lobby = state;
    this.isHost = !!state.isHost;
    const cfg = state.config;
    $('#roomCode').textContent = state.code || '';

    // 1 — mode
    const modeBox = $('#modeChips');
    clear(modeBox);
    for (const id of MODE_IDS) {
      const m = MODES[id];
      const b = el('button', 'chip' + (cfg.mode === id ? ' is-on' : ''), m.name);
      b.disabled = !this.isHost;
      b.onclick = () => this.patch({ mode: id });
      modeBox.appendChild(b);
    }
    $('#modeHint').textContent = getMode(cfg.mode).blurb;

    // 2 — map
    const mapBox = $('#mapCards');
    clear(mapBox);
    for (const id of MAP_IDS) {
      const info = MAP_INFO[id];
      const card = el('button', 'mapcard' + (cfg.mapId === id ? ' is-on' : ''));
      card.style.setProperty('--mapaccent', info.accent);
      card.appendChild(el('span', 'mapcard__bar'));
      card.appendChild(el('h4', null, info.name));
      card.appendChild(el('p', null, info.blurb));
      card.appendChild(el('div', 'mapcard__meta', `${info.size.toUpperCase()} · ${info.best.toUpperCase()}`));
      card.disabled = !this.isHost;
      card.onclick = () => this.patch({ mapId: id });
      mapBox.appendChild(card);
    }

    // 3 — bots
    const botBox = $('#botChips');
    clear(botBox);
    for (const n of BOT_COUNTS) {
      if (n > MAX_BOTS) continue;
      const b = el('button', 'chip' + (cfg.botCount === n ? ' is-on' : ''), n === 0 ? 'NO BOTS' : `${n} BOTS`);
      b.disabled = !this.isHost;
      b.onclick = () => this.patch({ botCount: n });
      botBox.appendChild(b);
    }
    const diffBox = $('#difficultyChips');
    clear(diffBox);
    for (const id of DIFFICULTY_IDS) {
      const b = el('button', 'chip' + (cfg.botDifficulty === id ? ' is-on' : ''), DIFFICULTIES[id].label.toUpperCase());
      b.disabled = !this.isHost || cfg.botCount === 0;
      b.onclick = () => this.patch({ botDifficulty: id });
      diffBox.appendChild(b);
    }

    // 4 — match settings
    const fieldBox = $('#matchFields');
    clear(fieldBox);
    for (const row of MATCH_FIELDS) {
      const node = control(row, cfg[row.key], (v) => this.patch({ [row.key]: v }));
      if (!this.isHost) node.querySelectorAll('input,button').forEach((n) => { n.disabled = true; });
      fieldBox.appendChild(node);
    }

    this.renderRoster(state);

    $('#startBtn').style.display = this.isHost ? '' : 'none';
    $('#startBtn').disabled = !state.canStart;
    $('#hostNote').textContent = this.isHost
      ? 'You are the host. Everyone sees your choices as you make them.'
      : 'Waiting for the host to start. Mark yourself ready when you are.';
  }

  renderRoster(state) {
    const list = $('#roster');
    clear(list);
    const roster = state.roster || [];
    $('#rosterCount').textContent = `${roster.filter((r) => !r.bot).length}/${state.config.maxPlayers}`;
    for (const r of roster) {
      const li = el('li', r.id === state.you || (!r.bot && r.name === this.ctx.settings.name) ? 'is-you' : '');
      const dot = el('span', 'rdot' + (r.ready ? ' is-ready' : '') + (r.team ? ' team-' + r.team : ''));
      li.appendChild(dot);
      const name = el('span', null, r.name);
      if (r.team) name.style.color = TEAM_COLOURS[r.team];
      li.appendChild(name);
      li.appendChild(el('span', 'rtag', r.bot ? 'BOT ' + (DIFFICULTIES[r.difficulty] ? DIFFICULTIES[r.difficulty].label.toUpperCase() : '') : (r.host ? 'HOST' : '')));
      li.appendChild(el('span', 'rping', r.bot ? '' : r.ping + 'ms'));
      list.appendChild(li);
    }
  }

  patch(config) {
    if (!this.isHost) { toast('Only the host can change the setup.', true); return; }
    this.ctx.audio.uiClick();
    this.ctx.net.lobby('config', { config });
  }

  /* ── Server browser ────────────────────────────────────────────── */
  renderRooms(rooms) {
    const list = $('#roomList');
    clear(list);
    if (!rooms || !rooms.length) {
      list.appendChild(el('p', 'empty', 'No open rooms right now. Create one — the browser updates for everybody.'));
      return;
    }
    for (const r of rooms) {
      const row = el('div', 'roomrow');
      const left = el('div');
      left.appendChild(el('div', 'roomrow__name', r.name));
      left.appendChild(el('div', 'roomrow__meta',
        `${getMode(r.mode).short} · ${(MAP_INFO[r.mapId] || {}).name || r.mapId} · ${r.bots} bots · ${r.state}`));
      row.appendChild(left);
      row.appendChild(el('div', 'roomrow__count', `${r.players}/${r.max}`));
      const join = el('button', 'btn btn--go', 'JOIN');
      join.onclick = () => { this.ctx.audio.uiClick(); this.ctx.net.lobby('join', { code: r.code }); };
      row.appendChild(join);
      list.appendChild(row);
    }
  }

  /* ── Loadout ───────────────────────────────────────────────────── */
  renderLoadout() {
    const s = this.ctx.settings;
    const primaries = WEAPON_IDS.filter((id) => WEAPONS[id].slot === 0);
    const secondaries = WEAPON_IDS.filter((id) => WEAPONS[id].slot === 1);
    this._gunList($('#primaryList'), primaries, s.loadout.primary, (id) => {
      s.loadout.primary = id; this.ctx.saveSettings(); this.ctx.net.setLoadout(s.loadout); this.renderLoadout();
    });
    this._gunList($('#secondaryList'), secondaries, s.loadout.secondary, (id) => {
      s.loadout.secondary = id; this.ctx.saveSettings(); this.ctx.net.setLoadout(s.loadout); this.renderLoadout();
    });

    const skins = $('#skinList');
    clear(skins);
    const palette = ['#7f8794', '#8a6f5c', '#5f7f6a', '#8a6a86', '#6f7a95', '#94836a', '#5d8590', '#8f6f6f', '#79856a', '#6a6f8f', '#8a8060', '#6d8a7c'];
    palette.forEach((hex, i) => {
      const b = el('button', 'skin' + (s.skin === i ? ' is-on' : ''));
      b.style.background = hex;
      b.setAttribute('aria-label', 'Colour ' + (i + 1));
      b.onclick = () => { s.skin = i; this.ctx.saveSettings(); this.renderLoadout(); };
      skins.appendChild(b);
    });

    this.renderGunDetail(this.selectedGun || s.loadout.primary);
  }

  _gunList(box, ids, selected, onPick) {
    clear(box);
    for (const id of ids) {
      const w = WEAPONS[id];
      const b = el('button', 'gun' + (selected === id ? ' is-on' : ''));
      b.appendChild(el('div', 'gun__name', w.name));
      b.appendChild(el('div', 'gun__cls', w.cls.toUpperCase()));
      b.onclick = () => { this.ctx.audio.uiClick(); this.selectedGun = id; onPick(id); };
      b.onmouseenter = () => { this.selectedGun = id; this.renderGunDetail(id); };
      box.appendChild(b);
    }
  }

  renderGunDetail(id) {
    const w = getWeapon(id);
    const box = $('#gunDetail');
    clear(box);
    box.appendChild(el('h3', null, w.name));
    box.appendChild(el('p', 'gun__cls', w.cls.toUpperCase()));
    const bar = (label, value, max, text) => {
      const row = el('div', 'statbar');
      row.appendChild(el('span', 'statbar__label', label));
      const track = el('div', 'statbar__track');
      const fill = el('div', 'statbar__fill');
      fill.style.width = Math.max(3, Math.min(100, (value / max) * 100)) + '%';
      track.appendChild(fill);
      row.appendChild(track);
      row.appendChild(el('span', 'statbar__num', text));
      box.appendChild(row);
    };
    bar('DAMAGE', w.damage * (w.pellets > 1 ? w.pellets * 0.55 : 1), 110, w.pellets > 1 ? `${w.damage}×${w.pellets}` : String(w.damage));
    bar('FIRE RATE', w.rpm, 1200, w.rpm + ' rpm');
    bar('MAGAZINE', Number.isFinite(w.mag) ? w.mag : 0, 80, Number.isFinite(w.mag) ? String(w.mag) : '∞');
    bar('RELOAD', 4200 - (w.reloadMs || 0), 4200, ((w.reloadMs || 0) / 1000).toFixed(1) + 's');
    bar('ACCURACY', 8 - w.spreadHip, 8, w.spreadHip.toFixed(1) + '°');
    bar('CONTROL', 4 - Math.min(3.9, w.recoil.up), 4, w.recoil.up.toFixed(2));
    bar('SIGHT SPEED', 500 - w.adsMs, 400, w.adsMs + 'ms');
    bar('RANGE', w.falloff[1], 200, w.falloff[0] + '–' + w.falloff[1] + 'm');
    bar('MOBILITY', w.moveMul * 100, 120, Math.round(w.moveMul * 100) + '%');
    const ttk = (stk(w) - 1) * shotInterval(w) * 1000;
    box.appendChild(el('p', 'opt__hint', `${stk(w)} body shots to kill · ${Math.round(ttk)} ms if every one lands.`));
  }

  /* ── Statistics ────────────────────────────────────────────────── */
  renderStats() {
    const st = this.ctx.stats;
    const body = $('#statsBody');
    clear(body);
    const lv = levelFor(st.xp);

    const head = el('div', 'stattile');
    head.appendChild(el('div', 'stattile__num', 'LEVEL ' + lv.level));
    const bar = el('div', 'xpbar');
    const i = el('i');
    i.style.width = (lv.progress * 100).toFixed(1) + '%';
    bar.appendChild(i);
    head.appendChild(bar);
    head.appendChild(el('div', 'stattile__label', `${lv.into.toLocaleString()} / ${lv.need.toLocaleString()} XP TO LEVEL ${lv.level + 1}`));
    body.appendChild(head);

    const grid = el('div', 'statgrid');
    const tile = (num, label) => {
      const t = el('div', 'stattile');
      t.appendChild(el('div', 'stattile__num', num));
      t.appendChild(el('div', 'stattile__label', label));
      grid.appendChild(t);
    };
    tile(String(st.kills), 'KILLS');
    tile(String(st.deaths), 'DEATHS');
    tile((st.kills / Math.max(1, st.deaths)).toFixed(2), 'K/D');
    tile(String(st.matches), 'MATCHES');
    tile(String(st.wins), 'WINS');
    tile(st.matches ? Math.round((st.wins / st.matches) * 100) + '%' : '—', 'WIN RATE');
    tile(st.shots ? ((st.hits / st.shots) * 100).toFixed(1) + '%' : '—', 'ACCURACY');
    tile(st.hits ? ((st.headshots / st.hits) * 100).toFixed(1) + '%' : '—', 'HEADSHOTS');
    tile(String(st.bestStreak), 'BEST STREAK');
    tile(Math.round(st.damage).toLocaleString(), 'DAMAGE');
    tile(fmtTime(st.timePlayed), 'TIME PLAYED');
    tile(st.xp.toLocaleString(), 'TOTAL XP');
    body.appendChild(grid);

    const note = el('p', 'opt__hint',
      'Statistics live in this browser only — there is no account and nothing is sent anywhere.');
    body.appendChild(note);
  }

  /* ── Settings ──────────────────────────────────────────────────── */
  renderSettings() {
    const tabs = $('#settingsTabs');
    clear(tabs);
    for (const g of GROUPS) {
      const b = el('button', 'tab' + (this.settingsTab === g ? ' is-on' : ''), g.toUpperCase());
      b.onclick = () => { this.settingsTab = g; this.ctx.audio.uiClick(); this.renderSettings(); };
      tabs.appendChild(b);
    }
    const body = $('#settingsBody');
    clear(body);
    const s = this.ctx.settings;
    const touch = this.ctx.isTouch;
    for (const row of SCHEMA) {
      if (row.group !== this.settingsTab) continue;
      if (row.when === 'touch' && !touch) continue;
      if (row.when === 'desktop' && touch) continue;
      body.appendChild(control(row, s[row.key], (v) => {
        if (row.type === 'action') { this.ctx.onSettingsAction(row.action); return; }
        s[row.key] = v;
        this.ctx.saveSettings();
        this.ctx.onSettingChanged(row.key, v);
      }));
    }
  }

  _buildStatic() {
    $('#resetGroup').onclick = () => {
      this.ctx.resetSettingsGroup(this.settingsTab);
      this.renderSettings();
      toast(this.settingsTab + ' settings reset');
    };
  }
}
