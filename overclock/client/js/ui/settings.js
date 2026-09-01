/* Settings.
 *
 * One object, persisted to localStorage, described by a schema that the
 * settings screen renders itself from. Adding an option is adding a line
 * to the schema — there is no second place to update, which is the only
 * way a settings screen this size stays correct.
 *
 * Defaults lean toward "works on a mid-range phone": medium quality,
 * dynamic resolution on, aim assist on for touch and off for mouse.
 */

const KEY = 'overclock.settings.v1';

export const DEFAULTS = {
  // Profile
  name: '', skin: 0,
  loadout: { primary: 'rift7', secondary: 'talon' },

  // Graphics
  quality: 'medium',
  resolutionScale: 1.0,
  dynamicResolution: true,
  renderDistance: 120,
  effectsLevel: 2,          // 0 minimal, 1 some, 2 full
  fov: 92,
  adsFovScale: true,
  showFps: false,
  showNetGraph: false,

  // Controls — shared
  sensitivity: 1.0,
  sensitivityX: 1.0,
  sensitivityY: 1.0,
  adsSensitivity: 0.72,
  invertX: false,
  invertY: false,
  adsMode: 'hold',          // hold | toggle
  crouchMode: 'hold',

  // Controls — touch
  touchSensitivity: 1.0,
  buttonOpacity: 0.55,
  stickZone: 0.44,
  stickDeadzone: 0.12,
  tapToFire: false,
  haptics: true,
  aimAssist: true,
  aimAssistStrength: 0.55,
  gyro: false,
  gyroStrength: 1.0,
  gyroInvertX: false,
  gyroInvertY: false,
  touchLayout: null,

  // Audio
  volumeMaster: 0.8,
  volumeEffects: 1.0,
  volumeMusic: 0.3,
  volumeUi: 0.7,

  // Gameplay
  crosshairStyle: 'cross',  // cross | dot | circle | none
  crosshairColour: '#4dffd0',
  crosshairSize: 8,
  crosshairGap: 5,
  crosshairThickness: 2,
  crosshairDot: true,
  crosshairDynamic: true,
  hitMarkers: true,
  damageNumbers: true,
  damageIndicators: true,
  killFeed: true,
  cameraShake: 0.7,
  viewBob: 0.8,
  showViewmodel: true,
  minimap: true,
  bindings: null,
};

/* The settings screen is generated from this. `type` picks the control,
   `group` the tab, and `when` hides options that do not apply — there is
   no point offering button opacity to somebody on a laptop. */
export const SCHEMA = [
  { group: 'Graphics', key: 'quality', label: 'Quality preset', type: 'choice', options: [['low', 'Low'], ['medium', 'Medium'], ['high', 'High']], hint: 'Sets lights, surface detail and the effect budget in one move.' },
  { group: 'Graphics', key: 'resolutionScale', label: 'Resolution scale', type: 'range', min: 0.5, max: 1, step: 0.05, format: (v) => Math.round(v * 100) + '%' },
  { group: 'Graphics', key: 'dynamicResolution', label: 'Dynamic resolution', type: 'toggle', hint: 'Drops resolution rather than frames when the GPU falls behind.' },
  { group: 'Graphics', key: 'renderDistance', label: 'Render distance', type: 'range', min: 50, max: 260, step: 10, format: (v) => v + ' m' },
  { group: 'Graphics', key: 'effectsLevel', label: 'Effects', type: 'choice', options: [[0, 'Minimal'], [1, 'Reduced'], [2, 'Full']] },
  { group: 'Graphics', key: 'fov', label: 'Field of view', type: 'range', min: 70, max: 115, step: 1, format: (v) => v + '°' },
  { group: 'Graphics', key: 'adsFovScale', label: 'Zoom when sighted', type: 'toggle' },
  { group: 'Graphics', key: 'showFps', label: 'Show frame rate', type: 'toggle' },
  { group: 'Graphics', key: 'showNetGraph', label: 'Show network stats', type: 'toggle' },

  { group: 'Controls', key: 'sensitivity', label: 'Sensitivity', type: 'range', min: 0.15, max: 3, step: 0.05, when: 'desktop' },
  { group: 'Controls', key: 'touchSensitivity', label: 'Look sensitivity', type: 'range', min: 0.25, max: 3, step: 0.05, when: 'touch' },
  { group: 'Controls', key: 'adsSensitivity', label: 'Sighted sensitivity', type: 'range', min: 0.2, max: 1.6, step: 0.02, hint: 'Multiplies look speed while aiming down sights.' },
  { group: 'Controls', key: 'sensitivityX', label: 'Horizontal multiplier', type: 'range', min: 0.4, max: 2, step: 0.05 },
  { group: 'Controls', key: 'sensitivityY', label: 'Vertical multiplier', type: 'range', min: 0.4, max: 2, step: 0.05 },
  { group: 'Controls', key: 'invertY', label: 'Invert vertical', type: 'toggle' },
  { group: 'Controls', key: 'adsMode', label: 'Sights', type: 'choice', options: [['hold', 'Hold'], ['toggle', 'Toggle']] },
  { group: 'Controls', key: 'crouchMode', label: 'Crouch', type: 'choice', options: [['hold', 'Hold'], ['toggle', 'Toggle']] },
  { group: 'Controls', key: 'aimAssist', label: 'Aim assist', type: 'toggle', when: 'touch', hint: 'Slows your look speed while the crosshair crosses a target. Touch only — never applied to a mouse.' },
  { group: 'Controls', key: 'aimAssistStrength', label: 'Aim assist strength', type: 'range', min: 0, max: 1, step: 0.05, when: 'touch' },
  { group: 'Controls', key: 'gyro', label: 'Gyroscope aiming', type: 'toggle', when: 'touch' },
  { group: 'Controls', key: 'gyroStrength', label: 'Gyroscope strength', type: 'range', min: 0.2, max: 2.5, step: 0.05, when: 'touch' },
  { group: 'Controls', key: 'gyroInvertY', label: 'Invert gyroscope vertical', type: 'toggle', when: 'touch' },
  { group: 'Controls', key: 'buttonOpacity', label: 'Button opacity', type: 'range', min: 0.15, max: 1, step: 0.05, when: 'touch', format: (v) => Math.round(v * 100) + '%' },
  { group: 'Controls', key: 'stickZone', label: 'Stick zone width', type: 'range', min: 0.25, max: 0.6, step: 0.02, when: 'touch', format: (v) => Math.round(v * 100) + '%' },
  { group: 'Controls', key: 'stickDeadzone', label: 'Stick dead zone', type: 'range', min: 0, max: 0.35, step: 0.01, when: 'touch' },
  { group: 'Controls', key: 'tapToFire', label: 'Tap look area to fire', type: 'toggle', when: 'touch' },
  { group: 'Controls', key: 'haptics', label: 'Haptics', type: 'toggle', when: 'touch' },
  { group: 'Controls', key: '__layout', label: 'Button layout', type: 'action', action: 'edit-layout', when: 'touch', hint: 'Drag buttons where your thumbs actually are.' },
  { group: 'Controls', key: '__bindings', label: 'Key bindings', type: 'action', action: 'edit-bindings', when: 'desktop' },

  { group: 'Audio', key: 'volumeMaster', label: 'Master', type: 'range', min: 0, max: 1, step: 0.05, format: pct },
  { group: 'Audio', key: 'volumeEffects', label: 'Effects', type: 'range', min: 0, max: 1, step: 0.05, format: pct },
  { group: 'Audio', key: 'volumeMusic', label: 'Ambience', type: 'range', min: 0, max: 1, step: 0.05, format: pct },
  { group: 'Audio', key: 'volumeUi', label: 'Interface', type: 'range', min: 0, max: 1, step: 0.05, format: pct },

  { group: 'Gameplay', key: 'crosshairStyle', label: 'Crosshair', type: 'choice', options: [['cross', 'Cross'], ['dot', 'Dot'], ['circle', 'Circle'], ['none', 'None']] },
  { group: 'Gameplay', key: 'crosshairColour', label: 'Crosshair colour', type: 'colour' },
  { group: 'Gameplay', key: 'crosshairSize', label: 'Crosshair length', type: 'range', min: 2, max: 20, step: 1 },
  { group: 'Gameplay', key: 'crosshairGap', label: 'Crosshair gap', type: 'range', min: 0, max: 20, step: 1 },
  { group: 'Gameplay', key: 'crosshairThickness', label: 'Crosshair weight', type: 'range', min: 1, max: 6, step: 1 },
  { group: 'Gameplay', key: 'crosshairDot', label: 'Centre dot', type: 'toggle' },
  { group: 'Gameplay', key: 'crosshairDynamic', label: 'Crosshair follows spread', type: 'toggle' },
  { group: 'Gameplay', key: 'hitMarkers', label: 'Hit markers', type: 'toggle' },
  { group: 'Gameplay', key: 'damageNumbers', label: 'Damage numbers', type: 'toggle' },
  { group: 'Gameplay', key: 'damageIndicators', label: 'Damage direction', type: 'toggle' },
  { group: 'Gameplay', key: 'killFeed', label: 'Kill feed', type: 'toggle' },
  { group: 'Gameplay', key: 'minimap', label: 'Minimap', type: 'toggle' },
  { group: 'Gameplay', key: 'cameraShake', label: 'Camera shake', type: 'range', min: 0, max: 1.5, step: 0.05 },
  { group: 'Gameplay', key: 'viewBob', label: 'View bob', type: 'range', min: 0, max: 1.5, step: 0.05 },
  { group: 'Gameplay', key: 'showViewmodel', label: 'Show weapon', type: 'toggle' },
];

function pct(v) { return Math.round(v * 100) + '%'; }

export const GROUPS = ['Graphics', 'Controls', 'Audio', 'Gameplay'];

export function load() {
  let stored = {};
  try { stored = JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch { stored = {}; }
  const s = { ...DEFAULTS, ...stored };
  // Nested objects merge rather than replace, so a new default field
  // appears for someone who saved settings before it existed.
  s.loadout = { ...DEFAULTS.loadout, ...(stored.loadout || {}) };
  if (!s.name) s.name = suggestName();
  return s;
}

export function save(settings) {
  try { localStorage.setItem(KEY, JSON.stringify(settings)); } catch {}
}

export function resetGroup(settings, group) {
  for (const row of SCHEMA) {
    if (row.group !== group || row.key.startsWith('__')) continue;
    settings[row.key] = DEFAULTS[row.key];
  }
  return settings;
}

const NAME_A = ['SWIFT', 'IRON', 'NEON', 'ASH', 'VOLT', 'ECHO', 'DUSK', 'ZERO', 'RAPID', 'NOVA'];
const NAME_B = ['FOX', 'WOLF', 'HAWK', 'VIPER', 'CROW', 'LYNX', 'RAVEN', 'DRAKE', 'ORCA', 'MOTH'];
export function suggestName() {
  return NAME_A[(Math.random() * NAME_A.length) | 0] + NAME_B[(Math.random() * NAME_B.length) | 0] + ((Math.random() * 90 + 10) | 0);
}

/* Long-term player record: separate from settings so clearing one does not
   clear the other. */
const STATS_KEY = 'overclock.stats.v1';
export const EMPTY_STATS = {
  xp: 0, level: 1, matches: 0, wins: 0, kills: 0, deaths: 0,
  shots: 0, hits: 0, headshots: 0, damage: 0, bestStreak: 0, timePlayed: 0,
  unlocked: ['skin0'],
};

export function loadStats() {
  try { return { ...EMPTY_STATS, ...(JSON.parse(localStorage.getItem(STATS_KEY) || '{}') || {}) }; }
  catch { return { ...EMPTY_STATS }; }
}
export function saveStats(s) { try { localStorage.setItem(STATS_KEY, JSON.stringify(s)); } catch {} }

/* Levels get progressively more expensive, so early ones arrive quickly
   and later ones still mean something. */
export function levelFor(xp) {
  let level = 1, need = 1000, spent = 0;
  while (xp - spent >= need && level < 99) { spent += need; level++; need = Math.round(need * 1.14); }
  return { level, into: xp - spent, need, progress: (xp - spent) / need };
}

export function applyMatchResult(stats, row, won, seconds) {
  stats.matches++;
  if (won) stats.wins++;
  stats.kills += row.kills || 0;
  stats.deaths += row.deaths || 0;
  stats.shots += row.shots || 0;
  stats.hits += row.hits || 0;
  stats.headshots += row.heads || 0;
  stats.damage += row.damage || 0;
  stats.bestStreak = Math.max(stats.bestStreak, row.streak || 0);
  stats.timePlayed += seconds || 0;
  stats.xp += (row.xp || 0) + (won ? 250 : 0);
  const { level } = levelFor(stats.xp);
  stats.level = level;
  return stats;
}
