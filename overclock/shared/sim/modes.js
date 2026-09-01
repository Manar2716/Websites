/* Game modes.
 *
 * A mode is a small bundle of hooks over the same match loop. Adding one
 * means adding an entry here; the match, the HUD and the scoreboard all
 * read their behaviour from these fields rather than branching on an id.
 */

import { TEAM } from '../constants.js';
import { GUN_GAME_LADDER, loadoutWeapons } from '../weapons.js';

export const MODES = {
  ffa: {
    id: 'ffa',
    name: 'Free For All',
    short: 'FFA',
    blurb: 'Everyone for themselves. First to the score limit, or the highest score when time runs out.',
    teams: false,
    defaults: { duration: 480, scoreLimit: 30, friendlyFire: false, respawn: true },
    scoreLabel: 'KILLS',
    loadout: (p) => loadoutWeapons(p.loadout),
    onKill(match, killer, victim) {
      if (killer && killer !== victim) killer.score += 1;
      else if (victim) victim.score = Math.max(0, victim.score - 1);   // suicide
    },
    leaders: (match) => [...match.players].sort((a, b) => b.score - a.score || a.deaths - b.deaths),
    isOver(match) {
      return match.players.some((p) => p.score >= match.config.scoreLimit);
    },
    winner(match) {
      const s = this.leaders(match);
      if (!s.length) return { text: 'NOBODY', sub: 'no players' };
      return { text: s[0].name, sub: `${s[0].score} kills`, playerId: s[0].id };
    },
  },

  tdm: {
    id: 'tdm',
    name: 'Team Deathmatch',
    short: 'TDM',
    blurb: 'Two squads. Every elimination is a point for your side.',
    teams: true,
    defaults: { duration: 600, scoreLimit: 60, friendlyFire: false, respawn: true },
    scoreLabel: 'SCORE',
    loadout: (p) => loadoutWeapons(p.loadout),
    onKill(match, killer, victim) {
      if (!killer || killer === victim) { match.teamScore[victim.team] = Math.max(0, (match.teamScore[victim.team] || 0) - 1); return; }
      if (killer.team === victim.team) { match.teamScore[killer.team] = Math.max(0, (match.teamScore[killer.team] || 0) - 1); return; }
      killer.score += 1;
      match.teamScore[killer.team] = (match.teamScore[killer.team] || 0) + 1;
    },
    leaders: (match) => [...match.players].sort((a, b) => a.team - b.team || b.score - a.score),
    isOver(match) {
      return Object.values(match.teamScore).some((v) => v >= match.config.scoreLimit);
    },
    winner(match) {
      const a = match.teamScore[TEAM.ALPHA] || 0, b = match.teamScore[TEAM.BRAVO] || 0;
      if (a === b) return { text: 'DRAW', sub: `${a} – ${b}` };
      return a > b ? { text: 'ALPHA', sub: `${a} – ${b}`, team: TEAM.ALPHA } : { text: 'BRAVO', sub: `${b} – ${a}`, team: TEAM.BRAVO };
    },
  },

  gungame: {
    id: 'gungame',
    name: 'Gun Game',
    short: 'GG',
    blurb: 'Every kill promotes you to the next weapon. Finish on the knife to win.',
    teams: false,
    defaults: { duration: 720, scoreLimit: GUN_GAME_LADDER.length, friendlyFire: false, respawn: true },
    scoreLabel: 'RUNG',
    /* The ladder replaces the loadout entirely — a Gun Game where you can
       bring your own rifle is not a Gun Game. */
    loadout: (p) => [GUN_GAME_LADDER[Math.min(p.ladderRung || 0, GUN_GAME_LADDER.length - 1)]],
    onKill(match, killer, victim) {
      if (!killer || killer === victim) {
        if (victim) victim.ladderRung = Math.max(0, (victim.ladderRung || 0) - 1);
      } else {
        killer.ladderRung = (killer.ladderRung || 0) + 1;
        killer.score = killer.ladderRung;
        match.promote(killer);
        if (killer.ladderRung < GUN_GAME_LADDER.length) {
          match.emitModeMessage(killer.id, `LEVEL ${killer.ladderRung + 1} — ${GUN_GAME_LADDER[killer.ladderRung].toUpperCase()}`);
        }
      }
      if (victim) victim.score = victim.ladderRung || 0;
    },
    leaders: (match) => [...match.players].sort((a, b) => (b.ladderRung || 0) - (a.ladderRung || 0) || a.deaths - b.deaths),
    isOver(match) {
      return match.players.some((p) => (p.ladderRung || 0) >= GUN_GAME_LADDER.length);
    },
    winner(match) {
      const s = this.leaders(match);
      if (!s.length) return { text: 'NOBODY', sub: '' };
      return { text: s[0].name, sub: `rung ${Math.min(s[0].ladderRung + 1, GUN_GAME_LADDER.length)} of ${GUN_GAME_LADDER.length}`, playerId: s[0].id };
    },
  },

  practice: {
    id: 'practice',
    name: 'Practice',
    short: 'PRAC',
    blurb: 'Bots only, no clock, no pressure. Learn the map and the guns.',
    teams: false,
    defaults: { duration: 0, scoreLimit: 0, friendlyFire: false, respawn: true },
    scoreLabel: 'KILLS',
    loadout: (p) => loadoutWeapons(p.loadout),
    onKill(match, killer, victim) { if (killer && killer !== victim) killer.score += 1; },
    leaders: (match) => [...match.players].sort((a, b) => b.score - a.score),
    isOver() { return false; },
    winner(match) { return { text: 'PRACTICE', sub: 'no winner' }; },
  },
};

export const MODE_IDS = ['ffa', 'tdm', 'gungame', 'practice'];
export const getMode = (id) => MODES[id] || MODES.ffa;
