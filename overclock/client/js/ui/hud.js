/* The heads-up display.
 *
 * All DOM, no canvas except the minimap. That is a deliberate choice: text
 * rendered by the browser is crisper at every resolution than text drawn
 * into a WebGL canvas, it scales with the user's own accessibility
 * settings, and it costs nothing on the GPU — which is where the frame
 * budget actually goes.
 *
 * The rule everything here follows: information you need mid-fight lives
 * within a glance of the crosshair or at a screen edge your eye already
 * tracks, and nothing animates unless the animation itself is the message.
 */

import { $, el, clear, fmtTime } from './ui.js';
import { WEAPONS, getWeapon } from '../../../shared/weapons.js';
import { TEAM } from '../../../shared/constants.js';
import { TEAM_COLOURS } from '../game/avatar.js';

const FEED_LIFE = 5200;
const FEED_MAX = 6;

export class Hud {
  constructor(settings) {
    this.settings = settings;
    this.root = $('#hud');
    this.crosshair = $('#crosshair');
    this.hitmarker = $('#hitmarker');
    this.feed = $('#killFeed');
    this.nameplates = $('#nameplates');
    this.numbers = $('#damageNumbers');
    this.damageDirs = $('#damageDirs');
    this.flash = $('#damageFlash');
    this.minimap = $('#minimap');
    this.mmCtx = this.minimap.getContext('2d');
    this.feedRows = [];
    this.plates = new Map();
    this.lastHealth = 100;
    this.applySettings();
  }

  show(on) { this.root.hidden = !on; }

  applySettings() {
    const s = this.settings;
    const c = this.crosshair;
    c.style.setProperty('--ch-colour', s.crosshairColour);
    c.style.setProperty('--ch-len', s.crosshairSize + 'px');
    c.style.setProperty('--ch-w', s.crosshairThickness + 'px');
    c.classList.toggle('is-hidden', s.crosshairStyle === 'none');
    c.classList.toggle('is-circle', s.crosshairStyle === 'circle');
    c.classList.toggle('no-dot', !s.crosshairDot || s.crosshairStyle === 'dot');
    if (s.crosshairStyle === 'dot') c.classList.add('is-hidden-arms');
    $('#minimapWrap').hidden = !s.minimap;
    $('#perfStats').hidden = !(s.showFps || s.showNetGraph);
  }

  /* The crosshair opens with the weapon's actual spread, so what you see
     is the cone the server will roll inside rather than a decoration. */
  setSpread(degrees, fov) {
    const s = this.settings;
    if (!s.crosshairDynamic) {
      this.crosshair.style.setProperty('--ch-gap', s.crosshairGap + 'px');
      return;
    }
    const px = Math.tan(degrees * Math.PI / 180) / Math.tan(fov / 2) * (window.innerHeight * 0.5);
    this.crosshair.style.setProperty('--ch-gap', Math.min(160, s.crosshairGap + px).toFixed(1) + 'px');
  }

  setVitals(health, armour) {
    const h = Math.max(0, Math.round(health));
    $('#healthNum').textContent = h;
    $('#healthFill').style.width = Math.min(100, h) + '%';
    $('#healthFill').parentElement.classList.toggle('is-hurt', h <= 35);
    const aw = $('#armourWrap');
    aw.hidden = armour <= 0;
    if (armour > 0) $('#armourFill').style.width = Math.min(100, armour * 2) + '%';
    this.lastHealth = h;
  }

  setAmmo(mag, reserve, weaponId, slots, slot) {
    const w = getWeapon(weaponId);
    const magEl = $('#ammoMag');
    magEl.textContent = w.melee ? '—' : mag;
    magEl.classList.toggle('is-low', !w.melee && mag <= Math.max(1, Math.ceil(w.mag * 0.25)));
    $('#ammoRes').textContent = w.melee ? '∞' : reserve;
    $('#weaponName').textContent = w.name;
    const box = $('#weaponSlots');
    if (box.dataset.sig !== slots.join(',') + slot) {
      box.dataset.sig = slots.join(',') + slot;
      clear(box);
      slots.forEach((id, i) => {
        box.appendChild(el('span', 'slot' + (i === slot ? ' is-on' : ''), String(i + 1) + ' ' + getWeapon(id).name));
      });
    }
  }

  setMatch(mode, timeLeft, scoreA, scoreB, selfScore) {
    const line = $('#scoreline');
    const teams = mode.teams;
    line.classList.toggle('is-ffa', !teams);
    $('#scoreA').textContent = teams ? scoreA : selfScore;
    $('#scoreB').textContent = teams ? scoreB : '';
    $('#matchTimer').textContent = fmtTime(timeLeft);
    line.classList.toggle('is-low', Number.isFinite(timeLeft) && timeLeft <= 30);
    $('#hudMode').textContent = mode.name.toUpperCase() + (teams ? '' : ' · ' + mode.scoreLabel);
  }

  banner(text) {
    const b = $('#hudBanner');
    b.textContent = text;
    b.classList.remove('is-on');
    void b.offsetWidth;                    // restart the animation
    b.classList.add('is-on');
  }

  hit(head, kill) {
    if (!this.settings.hitMarkers) return;
    const h = this.hitmarker;
    h.classList.remove('is-on', 'is-head', 'is-kill');
    void h.offsetWidth;
    h.classList.add('is-on');
    if (kill) h.classList.add('is-kill');
    else if (head) h.classList.add('is-head');
  }

  damageNumber(screenX, screenY, amount, head) {
    if (!this.settings.damageNumbers) return;
    const n = el('div', 'dmgnum' + (head ? ' is-head' : ''), String(Math.round(amount)));
    n.style.left = (screenX * 100) + '%';
    n.style.top = (screenY * 100) + '%';
    this.numbers.appendChild(n);
    setTimeout(() => n.remove(), 780);
  }

  /* The direction indicator points at where the shot came from, in your
     own frame — the only version of that information that is useful while
     you are turning. */
  tookDamage(angleFromForward, amount) {
    this.flash.classList.add('is-on');
    setTimeout(() => this.flash.classList.remove('is-on'), 90);
    if (!this.settings.damageIndicators) return;
    const d = el('div', 'dmgdir');
    d.style.setProperty('--a', (angleFromForward * 180 / Math.PI).toFixed(1) + 'deg');
    this.damageDirs.appendChild(d);
    setTimeout(() => d.remove(), 1150);
  }

  killFeed(killerName, victimName, weaponId, head, isMine, killerTeam, victimTeam) {
    if (!this.settings.killFeed) return;
    const row = el('div', 'feedrow' + (isMine ? ' is-mine' : ''));
    const k = el('span', 'feedrow__k', killerName || 'THE WORLD');
    if (killerTeam) k.style.color = TEAM_COLOURS[killerTeam];
    row.appendChild(k);
    if (head) row.appendChild(el('span', 'feedrow__hs', '◎'));
    row.appendChild(el('span', 'feedrow__w', weaponId ? getWeapon(weaponId).name : '—'));
    const v = el('span', 'feedrow__v', victimName || '?');
    if (victimTeam) v.style.color = TEAM_COLOURS[victimTeam];
    row.appendChild(v);
    this.feed.appendChild(row);
    this.feedRows.push({ row, at: performance.now() });
    while (this.feedRows.length > FEED_MAX) this.feedRows.shift().row.remove();
  }

  tickFeed(now) {
    while (this.feedRows.length && now - this.feedRows[0].at > FEED_LIFE) {
      this.feedRows.shift().row.remove();
    }
  }

  /* Names float over teammates only. In free-for-all nobody gets a name,
     because a name over an enemy is a wallhack with a nice font. */
  updateNameplates(list) {
    const seen = new Set();
    for (const p of list) {
      seen.add(p.id);
      let plate = this.plates.get(p.id);
      if (!plate) {
        plate = el('div', 'nameplate');
        plate.appendChild(el('span', 'nameplate__text'));
        const bar = el('div', 'nameplate__bar');
        bar.appendChild(el('i'));
        plate.appendChild(bar);
        this.nameplates.appendChild(plate);
        this.plates.set(p.id, plate);
      }
      plate.style.left = (p.x * 100) + '%';
      plate.style.top = (p.y * 100) + '%';
      plate.style.opacity = String(p.alpha);
      const text = plate.firstChild;
      if (text.textContent !== p.name) text.textContent = p.name;
      text.style.color = p.colour;
      plate.lastChild.firstChild.style.width = Math.max(0, Math.min(100, p.health)) + '%';
      plate.lastChild.style.display = p.showHealth ? '' : 'none';
    }
    for (const [id, plate] of this.plates) {
      if (!seen.has(id)) { plate.remove(); this.plates.delete(id); }
    }
  }

  death(killerName, weaponId, seconds) {
    const d = $('#deathScreen');
    d.hidden = false;
    $('#killerName').textContent = killerName || 'THE WORLD';
    $('#killerWeapon').textContent = weaponId ? getWeapon(weaponId).name : '';
    $('#respawnCount').textContent = Math.max(0, Math.ceil(seconds));
  }
  respawnCount(seconds) { $('#respawnCount').textContent = Math.max(0, Math.ceil(seconds)); }
  hideDeath() { $('#deathScreen').hidden = true; }

  perf(text) { const p = $('#perfStats'); p.textContent = text; }

  /* ── Scoreboard ───────────────────────────────────────────────── */
  scoreboard(on) { $('#scoreboard').hidden = !on; }

  renderScoreboard(rows, mode, selfId, subtitle) {
    $('#sbTitle').textContent = mode.name.toUpperCase();
    $('#sbSub').textContent = subtitle || '';
    const body = $('#sbBody');
    clear(body);
    body.appendChild(scoreTable(rows, mode, selfId));
  }

  /* ── Minimap ──────────────────────────────────────────────────── */
  drawMinimap(world, self, others, mode) {
    if (!this.settings.minimap) return;
    const c = this.mmCtx;
    const W = this.minimap.width, H = this.minimap.height;
    c.clearRect(0, 0, W, H);
    const b = world.bounds;
    const span = Math.max(b.maxX - b.minX, b.maxZ - b.minZ);
    const zoom = 0.62;                      // shows the local area, not the map
    const range = span * zoom * 0.5;
    const toPx = (wx, wz) => {
      // Rotated so the top of the minimap is where you are looking, which
      // is the only orientation you can read without thinking.
      const dx = wx - self.x, dz = wz - self.z;
      const s = Math.sin(-self.yaw), co = Math.cos(-self.yaw);
      const rx = dx * co - dz * s, rz = dx * s + dz * co;
      return [W / 2 + (rx / range) * (W / 2), H / 2 + (rz / range) * (H / 2)];
    };

    // Walls near the player, as thin outlines.
    c.strokeStyle = 'rgba(150,175,190,0.34)';
    c.lineWidth = 1;
    c.beginPath();
    for (const br of world.brushes) {
      if (!br.solid || br.h < 1.2) continue;
      if (Math.abs(br.x + br.w / 2 - self.x) > range + br.w) continue;
      if (Math.abs(br.z + br.d / 2 - self.z) > range + br.d) continue;
      if (br.y > self.y + 3.4 || br.y + br.h < self.y - 2.2) continue;
      const [x0, y0] = toPx(br.x, br.z);
      const [x1, y1] = toPx(br.x + br.w, br.z);
      const [x2, y2] = toPx(br.x + br.w, br.z + br.d);
      const [x3, y3] = toPx(br.x, br.z + br.d);
      c.moveTo(x0, y0); c.lineTo(x1, y1); c.lineTo(x2, y2); c.lineTo(x3, y3); c.closePath();
    }
    c.stroke();

    for (const o of others) {
      if (!o.alive) continue;
      const friendly = mode.teams && o.team === self.team;
      /* In team modes you see your side. In free-for-all the minimap
         shows only you — anything else would be a radar hack. */
      if (mode.teams && !friendly) continue;
      if (!mode.teams) continue;
      const [x, y] = toPx(o.x, o.z);
      c.fillStyle = TEAM_COLOURS[o.team] || '#8f9aa5';
      c.beginPath();
      c.arc(x, y, 3, 0, Math.PI * 2);
      c.fill();
      if (Math.abs(o.y - self.y) > 2.5) {
        c.fillStyle = 'rgba(255,255,255,0.85)';
        c.fillRect(x - 2, o.y > self.y ? y - 7 : y + 5, 4, 1.5);
      }
    }

    // Self: a triangle pointing up, because the map is already rotated.
    c.fillStyle = '#6ef3c8';
    c.beginPath();
    c.moveTo(W / 2, H / 2 - 6);
    c.lineTo(W / 2 - 4.5, H / 2 + 5);
    c.lineTo(W / 2 + 4.5, H / 2 + 5);
    c.closePath();
    c.fill();
  }
}

export function scoreTable(rows, mode, selfId) {
  const table = el('table', 'sbtable');
  const head = el('tr');
  const cols = mode.id === 'gungame'
    ? ['PLAYER', 'RUNG', 'K', 'D', 'K/D', 'ACC', 'HS', 'PING']
    : ['PLAYER', mode.scoreLabel, 'K', 'D', 'K/D', 'ACC', 'HS', 'PING'];
  for (const c of cols) head.appendChild(el('th', null, c));
  table.appendChild(head);

  for (const r of rows) {
    const tr = el('tr', (r.id === selfId ? 'is-you ' : '') + (mode.teams ? 'team-' + r.team : ''));
    const nameCell = el('td');
    nameCell.appendChild(document.createTextNode(r.name));
    if (r.bot) nameCell.appendChild(el('span', 'botpill', 'BOT'));
    tr.appendChild(nameCell);
    tr.appendChild(el('td', null, String(mode.id === 'gungame' ? (r.rung || 0) + 1 : r.score)));
    tr.appendChild(el('td', null, String(r.kills)));
    tr.appendChild(el('td', null, String(r.deaths)));
    tr.appendChild(el('td', null, (r.kills / Math.max(1, r.deaths)).toFixed(2)));
    tr.appendChild(el('td', null, (r.acc * 100).toFixed(0) + '%'));
    tr.appendChild(el('td', null, (r.hs * 100).toFixed(0) + '%'));
    tr.appendChild(el('td', null, r.bot ? '—' : String(r.ping)));
    table.appendChild(tr);
  }
  return table;
}
