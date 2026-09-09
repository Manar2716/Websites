/* ═══════════════════════════════════════════════════════════
   fleet.js — eight aircraft, described twice.

   `spec` is what the aircraft is: published dimensions, range,
   capacity and powerplant for a representative variant of each
   family. Those numbers are shown to the reader, so they are
   real ones.

   `geo` is what the model builder needs to draw it: fuselage
   cross-section, wing planform, engine count and placement,
   gear arrangement, deck count. Every one of those is derived
   from the same published dimensions — the builder scales the
   model to `spec.length` and `spec.span`, so an A380 next to an
   A220 in the hangar is exactly 1.88 times as long and 2.27
   times as wide, because that is what those aircraft are.
   ═══════════════════════════════════════════════════════════ */

const KM_PER_NMI = 1.852;

/* Shared control-surface layout, in fractions of semi-span,
   measured outboard from the wing root. Airbus wings all follow
   this arrangement; only the proportions move between families. */
const SURFACES = {
  slats:    [0.16, 0.98],
  flapIn:   [0.14, 0.44],
  flapOut:  [0.47, 0.72],
  aileron:  [0.76, 0.96],
  spoilers: [0.28, 0.74]
};

export const FLEET = [
  {
    id: 'a220',
    name: 'A220-300',
    family: 'A220',
    tag: 'THE SMALLEST OF THE LARGE',
    line: 'A clean-sheet single aisle with a wing designed after the engine, not before it.',
    story: 'The A220 is the only Airbus whose wing was drawn around a geared turbofan from the first line. The fan turns at a third of the turbine speed, which is why the nacelle is enormous for the airframe it hangs on — and why the aircraft burns roughly a quarter less fuel per seat than the metal it replaced.',
    spec: {
      length: 38.71, span: 35.10, height: 11.50,
      rangeNmi: 3350, mach: 0.82, ceiling: 41000,
      seatsTypical: 130, seatsMax: 149,
      mtow: 70900,
      engines: '2 × Pratt & Whitney PW1500G',
      thrust: '23 300 lbf', fanDia: 1.85,
      firstFlight: '2013', capability: 'Regional · transcontinental'
    },
    geo: {
      fuseW: 3.70, fuseH: 3.70, decks: 1, wingLow: 0.78,
      noseLen: 0.130, tailLen: 0.260, tailUp: 0.55, tailPinch: 0.16,
      wingLE: 0.435, rootChord: 0.145, tipChord: 0.038, sweep: 25, dihedral: 5.5,
      wingTip: 'fence', twist: -3.0,
      engines: 2, engY: [0.34], engFwd: 0.055, engDrop: 0.038, nacL: 0.115, nacD: 0.058,
      vStabLE: 0.800, vStabH: 0.160, vStabRoot: 0.155, vStabTip: 0.062, vStabSweep: 42,
      hStabLE: 0.905, hStabSpan: 0.300, hStabRoot: 0.090, hStabTip: 0.035, hStabSweep: 32,
      gearMain: { wheels: 2, y: 0.115, z: 0.500, len: 0.055 },
      gearNose: { z: 0.145, len: 0.048 },
      doors: [[0.145, 'L1'], [0.800, 'L2']],
      winStart: 0.160, winEnd: 0.780,
      surfaces: SURFACES
    }
  },
  {
    id: 'a319',
    name: 'A319neo',
    family: 'A320 FAMILY',
    tag: 'SHORT BODY · LONG LEGS',
    line: 'The same wing, the same cockpit, four frames less fuselage.',
    story: 'Take an A320 and remove four fuselage frames — three forward of the wing, one behind. Everything else stays: the wing, the gear, the flight deck, the type rating. That is the whole idea of the family, and it is why a crew can fly all four in the same week.',
    spec: {
      length: 33.84, span: 35.80, height: 11.76,
      rangeNmi: 3750, mach: 0.78, ceiling: 39800,
      seatsTypical: 140, seatsMax: 160,
      mtow: 75500,
      engines: '2 × CFM LEAP-1A / PW1100G',
      thrust: '24 500 lbf', fanDia: 1.98,
      firstFlight: '1995', capability: 'Short haul · high–hot fields'
    },
    geo: {
      fuseW: 3.95, fuseH: 4.14, decks: 1, wingLow: 0.78,
      noseLen: 0.145, tailLen: 0.280, tailUp: 0.58, tailPinch: 0.17,
      wingLE: 0.400, rootChord: 0.185, tipChord: 0.048, sweep: 25, dihedral: 5.1,
      wingTip: 'sharklet', twist: -3.2,
      engines: 2, engY: [0.335], engFwd: 0.075, engDrop: 0.048, nacL: 0.135, nacD: 0.072,
      vStabLE: 0.775, vStabH: 0.185, vStabRoot: 0.185, vStabTip: 0.075, vStabSweep: 41,
      hStabLE: 0.895, hStabSpan: 0.368, hStabRoot: 0.100, hStabTip: 0.040, hStabSweep: 33,
      gearMain: { wheels: 2, y: 0.125, z: 0.545, len: 0.062 },
      gearNose: { z: 0.155, len: 0.055 },
      doors: [[0.155, 'L1'], [0.800, 'L4']],
      winStart: 0.175, winEnd: 0.775,
      surfaces: SURFACES
    }
  },
  {
    id: 'a320',
    name: 'A320neo',
    family: 'A320 FAMILY',
    tag: 'THE AIRCRAFT THAT CHANGED THE COCKPIT',
    line: 'The first airliner flown by a sidestick and a computer that argues back.',
    story: 'In 1988 the A320 put fly-by-wire and a sidestick into a narrowbody, and moved the pilot from a control column to a screen. The flight envelope protections it introduced — the aircraft will not stall, will not overspeed, will not roll past 67° — are now the industry\'s baseline. Everything in the flight deck you can open on this site descends from that aircraft.',
    spec: {
      length: 37.57, span: 35.80, height: 11.76,
      rangeNmi: 3500, mach: 0.78, ceiling: 39800,
      seatsTypical: 165, seatsMax: 194,
      mtow: 79000,
      engines: '2 × CFM LEAP-1A / PW1100G',
      thrust: '27 120 lbf', fanDia: 1.98,
      firstFlight: '1987', capability: 'Short · medium haul'
    },
    geo: {
      fuseW: 3.95, fuseH: 4.14, decks: 1, wingLow: 0.78,
      noseLen: 0.130, tailLen: 0.250, tailUp: 0.55, tailPinch: 0.17,
      wingLE: 0.415, rootChord: 0.165, tipChord: 0.044, sweep: 25, dihedral: 5.1,
      wingTip: 'sharklet', twist: -3.2,
      engines: 2, engY: [0.335], engFwd: 0.068, engDrop: 0.044, nacL: 0.122, nacD: 0.065,
      vStabLE: 0.795, vStabH: 0.165, vStabRoot: 0.165, vStabTip: 0.068, vStabSweep: 41,
      hStabLE: 0.905, hStabSpan: 0.331, hStabRoot: 0.090, hStabTip: 0.036, hStabSweep: 33,
      gearMain: { wheels: 2, y: 0.113, z: 0.490, len: 0.057 },
      gearNose: { z: 0.140, len: 0.050 },
      doors: [[0.145, 'L1'], [0.360, 'L2'], [0.865, 'L4']],
      winStart: 0.160, winEnd: 0.800,
      surfaces: SURFACES
    }
  },
  {
    id: 'a321',
    name: 'A321XLR',
    family: 'A320 FAMILY',
    tag: 'A NARROWBODY THAT CROSSES OCEANS',
    line: 'Nine and a half hours on a single aisle.',
    story: 'The XLR carries its extra fuel in a tank built into the rear fuselage structure rather than bolted into the hold, which is what buys it 4 700 nautical miles without giving up the cargo bay. It is the aircraft that lets an airline open a thin transatlantic route with 200 seats instead of gambling on 300.',
    spec: {
      length: 44.51, span: 35.80, height: 11.76,
      rangeNmi: 4700, mach: 0.78, ceiling: 39800,
      seatsTypical: 200, seatsMax: 244,
      mtow: 101000,
      engines: '2 × CFM LEAP-1A / PW1100G',
      thrust: '33 110 lbf', fanDia: 2.06,
      firstFlight: '1993', capability: 'Medium · long thin routes'
    },
    geo: {
      fuseW: 3.95, fuseH: 4.14, decks: 1, wingLow: 0.78,
      noseLen: 0.110, tailLen: 0.215, tailUp: 0.52, tailPinch: 0.17,
      wingLE: 0.435, rootChord: 0.140, tipChord: 0.037, sweep: 25, dihedral: 5.1,
      wingTip: 'sharklet', twist: -3.2,
      engines: 2, engY: [0.335], engFwd: 0.058, engDrop: 0.038, nacL: 0.104, nacD: 0.056,
      vStabLE: 0.830, vStabH: 0.140, vStabRoot: 0.140, vStabTip: 0.058, vStabSweep: 41,
      hStabLE: 0.925, hStabSpan: 0.280, hStabRoot: 0.077, hStabTip: 0.031, hStabSweep: 33,
      gearMain: { wheels: 2, y: 0.096, z: 0.505, len: 0.048 },
      gearNose: { z: 0.120, len: 0.042 },
      doors: [[0.125, 'L1'], [0.300, 'L2'], [0.630, 'L3'], [0.885, 'L4']],
      winStart: 0.140, winEnd: 0.830,
      surfaces: SURFACES
    }
  },
  {
    id: 'a330',
    name: 'A330-900',
    family: 'A330',
    tag: 'THE WIDEBODY WORKHORSE',
    line: 'An airframe from 1992 flying on a wing and an engine from 2018.',
    story: 'The A330neo kept the fuselage and kept the type rating, then took the A350\'s wingtip geometry, a new composite sharklet and the Trent 7000. The result burns 14% less fuel per seat than the aircraft it replaced without an airline having to retrain a single crew — which is the least glamorous and most valuable kind of engineering there is.',
    spec: {
      length: 63.66, span: 64.00, height: 16.79,
      rangeNmi: 7200, mach: 0.82, ceiling: 41100,
      seatsTypical: 287, seatsMax: 440,
      mtow: 251000,
      engines: '2 × Rolls-Royce Trent 7000',
      thrust: '72 000 lbf', fanDia: 3.00,
      firstFlight: '1992', capability: 'Long haul'
    },
    geo: {
      fuseW: 5.64, fuseH: 5.64, decks: 1, wingLow: 0.76,
      noseLen: 0.110, tailLen: 0.235, tailUp: 0.52, tailPinch: 0.16,
      wingLE: 0.400, rootChord: 0.175, tipChord: 0.042, sweep: 30, dihedral: 5.5,
      wingTip: 'sharklet', twist: -3.6,
      engines: 2, engY: [0.310], engFwd: 0.075, engDrop: 0.045, nacL: 0.115, nacD: 0.062,
      vStabLE: 0.805, vStabH: 0.155, vStabRoot: 0.160, vStabTip: 0.062, vStabSweep: 45,
      hStabLE: 0.905, hStabSpan: 0.315, hStabRoot: 0.090, hStabTip: 0.035, hStabSweep: 34,
      gearMain: { wheels: 4, y: 0.090, z: 0.505, len: 0.062 },
      gearNose: { z: 0.115, len: 0.055 },
      doors: [[0.125, 'L1'], [0.315, 'L2'], [0.645, 'L3'], [0.865, 'L4']],
      winStart: 0.145, winEnd: 0.815,
      surfaces: SURFACES
    }
  },
  {
    id: 'a340',
    name: 'A340-600',
    family: 'A340',
    tag: 'FOUR ENGINES · SEVENTY-FIVE METRES',
    line: 'For a decade, the longest airliner ever built.',
    story: 'The -600 stretched the A340 to 75.36 metres, which is long enough that the flight deck can be over the taxiway centreline while the main gear is still on the turn. Airbus added a four-wheel centre bogie under the belly to spread the load and gave the crew a tail camera, because at that length you cannot see where the back of your aircraft is going.',
    spec: {
      length: 75.36, span: 63.45, height: 17.30,
      rangeNmi: 7900, mach: 0.82, ceiling: 41100,
      seatsTypical: 326, seatsMax: 475,
      mtow: 380000,
      engines: '4 × Rolls-Royce Trent 556',
      thrust: '56 000 lbf', fanDia: 2.47,
      firstFlight: '2001', capability: 'Ultra long haul'
    },
    geo: {
      fuseW: 5.64, fuseH: 5.64, decks: 1, wingLow: 0.76,
      noseLen: 0.093, tailLen: 0.200, tailUp: 0.48, tailPinch: 0.16,
      wingLE: 0.410, rootChord: 0.145, tipChord: 0.034, sweep: 31.1, dihedral: 5.5,
      wingTip: 'fence', twist: -3.6,
      engines: 4, engY: [0.290, 0.550], engFwd: 0.055, engDrop: 0.033, nacL: 0.088, nacD: 0.048,
      vStabLE: 0.845, vStabH: 0.125, vStabRoot: 0.130, vStabTip: 0.050, vStabSweep: 45,
      hStabLE: 0.930, hStabSpan: 0.265, hStabRoot: 0.072, hStabTip: 0.028, hStabSweep: 34,
      gearMain: { wheels: 4, y: 0.083, z: 0.515, len: 0.052, centre: true },
      gearNose: { z: 0.100, len: 0.046 },
      doors: [[0.105, 'L1'], [0.285, 'L2'], [0.620, 'L3'], [0.875, 'L4']],
      winStart: 0.125, winEnd: 0.845,
      surfaces: SURFACES
    }
  },
  {
    id: 'a350',
    name: 'A350-1000',
    family: 'A350',
    tag: 'CARBON FIBRE FROM NOSE TO TAIL',
    line: 'A wing that changes shape in flight to suit the fuel it has left.',
    story: 'The A350 wing is 53% composite and adaptive: as fuel burns off and the aircraft gets lighter, the flaps and droop-nose devices trim the wing\'s camber to hold the optimum shape for the new weight. The trailing edge you see on the ground is not the trailing edge it cruises with.',
    spec: {
      length: 73.79, span: 64.75, height: 17.08,
      rangeNmi: 8700, mach: 0.85, ceiling: 43100,
      seatsTypical: 369, seatsMax: 480,
      mtow: 319000,
      engines: '2 × Rolls-Royce Trent XWB-97',
      thrust: '97 000 lbf', fanDia: 3.00,
      firstFlight: '2013', capability: 'Ultra long haul'
    },
    geo: {
      fuseW: 5.96, fuseH: 6.09, decks: 1, wingLow: 0.76,
      noseLen: 0.095, tailLen: 0.205, tailUp: 0.50, tailPinch: 0.15,
      wingLE: 0.405, rootChord: 0.155, tipChord: 0.036, sweep: 31.9, dihedral: 6,
      wingTip: 'curved', twist: -3.8,
      engines: 2, engY: [0.300], engFwd: 0.065, engDrop: 0.040, nacL: 0.096, nacD: 0.053,
      vStabLE: 0.830, vStabH: 0.135, vStabRoot: 0.140, vStabTip: 0.054, vStabSweep: 45,
      hStabLE: 0.925, hStabSpan: 0.285, hStabRoot: 0.078, hStabTip: 0.030, hStabSweep: 35,
      gearMain: { wheels: 6, y: 0.088, z: 0.515, len: 0.056 },
      gearNose: { z: 0.105, len: 0.050 },
      doors: [[0.115, 'L1'], [0.295, 'L2'], [0.630, 'L3'], [0.875, 'L4']],
      winStart: 0.135, winEnd: 0.840,
      surfaces: SURFACES
    }
  },
  {
    id: 'a380',
    name: 'A380-800',
    family: 'A380',
    tag: 'THE LARGEST PASSENGER AIRCRAFT EVER FLOWN',
    line: 'Two decks, four engines, eighty metres of wing.',
    story: 'The A380 is the only full-length double-deck airliner ever built. Its wing spans 79.75 metres because 80 metres is the gate box limit at the airports it was designed for — the number is not aerodynamic, it is architectural. Twenty-two wheels carry it, and it needs every one of them.',
    spec: {
      length: 72.72, span: 79.75, height: 24.09,
      rangeNmi: 8000, mach: 0.85, ceiling: 43000,
      seatsTypical: 525, seatsMax: 853,
      mtow: 575000,
      engines: '4 × Rolls-Royce Trent 970',
      thrust: '70 000 lbf', fanDia: 2.95,
      firstFlight: '2005', capability: 'Ultra long haul · hub to hub'
    },
    geo: {
      fuseW: 7.14, fuseH: 8.41, decks: 2, wingLow: 0.70,
      noseLen: 0.100, tailLen: 0.215, tailUp: 0.46, tailPinch: 0.17,
      wingLE: 0.375, rootChord: 0.220, tipChord: 0.048, sweep: 33.5, dihedral: 5.6,
      wingTip: 'winglet', twist: -4.0,
      engines: 4, engY: [0.255, 0.490], engFwd: 0.075, engDrop: 0.045, nacL: 0.100, nacD: 0.055,
      vStabLE: 0.800, vStabH: 0.165, vStabRoot: 0.170, vStabTip: 0.066, vStabSweep: 44,
      hStabLE: 0.905, hStabSpan: 0.410, hStabRoot: 0.100, hStabTip: 0.038, hStabSweep: 35,
      gearMain: { wheels: 4, y: 0.135, z: 0.535, len: 0.063, body: 6, bodyY: 0.048, bodyZ: 0.575 },
      gearNose: { z: 0.115, len: 0.058 },
      doors: [[0.115, 'L1'], [0.300, 'L2'], [0.600, 'L3'], [0.855, 'L5']],
      winStart: 0.130, winEnd: 0.830,
      surfaces: SURFACES
    }
  }
];

export const byId = (id) => FLEET.find((a) => a.id === id) || FLEET[2];

export const families = ['A220', 'A320 FAMILY', 'A330', 'A340', 'A350', 'A380'];

/* Derived reader-facing numbers, computed once so nothing has
   to convert units at render time. */
for (const a of FLEET) {
  a.spec.rangeKm = Math.round(a.spec.rangeNmi * KM_PER_NMI);
  a.spec.cruiseKts = Math.round(a.spec.mach * 573);      /* TAS at FL350, ISA */
  a.spec.cruiseKmh = Math.round(a.spec.cruiseKts * 1.852);
}

/* ── the components a visitor can walk up to and open ────── */

export const COMPONENTS = {
  engine: {
    name: 'TURBOFAN ENGINE',
    sub: 'PROPULSION',
    body: 'A modern high-bypass turbofan is mostly a ducted propeller. Around 90% of the thrust comes from the fan pushing cold air around the core; only the remaining tenth comes out of the hot nozzle. The core exists to turn the fan.',
    facts: [
      ['BYPASS RATIO', 'up to 11 : 1'],
      ['FAN DIAMETER', 'see aircraft spec'],
      ['CRUISE N1', '~ 90 %'],
      ['THRUST REVERSER', 'cold stream, cascade type']
    ],
    action: 'SPOOL UP',
    hint: 'Spin the fan and open the reverser cascades.'
  },
  wing: {
    name: 'WING',
    sub: 'AERODYNAMICS',
    body: 'The wing is swept so the airflow crossing it stays subsonic while the aircraft does not. Sweep costs lift at low speed, which is why the leading and trailing edges unfold into a completely different, much more curved wing for takeoff and landing.',
    facts: [
      ['SWEEP', 'quarter-chord, per type'],
      ['DIHEDRAL', '5 – 6°'],
      ['FUEL', 'carried inside the box'],
      ['TIP DEVICE', 'sharklet / winglet']
    ],
    action: 'FLEX',
    hint: 'Load the wing and watch the tip rise.'
  },
  gear: {
    name: 'LANDING GEAR',
    sub: 'STRUCTURE',
    body: 'An oleo-pneumatic strut is a gas spring with an oil damper inside it: nitrogen takes the load, oil forced through an orifice takes the energy. It absorbs the touchdown once and does not give it back as a bounce.',
    facts: [
      ['TYPE', 'oleo-pneumatic'],
      ['RETRACTION', 'hydraulic, inboard'],
      ['BRAKES', 'carbon multi-disc'],
      ['STEERING', 'nose wheel, ±75°']
    ],
    action: 'RETRACT',
    hint: 'Raise and lower the gear.'
  },
  flaps: {
    name: 'FLAPS & SLATS',
    sub: 'HIGH LIFT',
    body: 'Flaps and slats do not simply "add lift" — they grow the wing. The flaps slide aft on tracks before they rotate down, adding area first and camber second; the slats open a slot at the leading edge that re-energises the boundary layer so the wing can be flown to a far higher angle of attack.',
    facts: [
      ['POSITIONS', '1 · 1+F · 2 · 3 · FULL'],
      ['SLATS', 'full span, slotted'],
      ['FLAPS', 'double-slotted, tracked'],
      ['MAX EXTEND SPEED', 'placarded per position']
    ],
    action: 'EXTEND',
    hint: 'Run the flaps and slats through their travel.'
  },
  rudder:  {
    name: 'RUDDER',
    sub: 'FLIGHT CONTROL',
    body: 'The rudder is not how an airliner turns. Its real job is the day one engine fails on takeoff: it holds the aircraft straight against the asymmetric thrust of the other one, and the size of the fin is set by that single case.',
    facts: [
      ['AXIS', 'yaw'],
      ['DRIVE', 'three hydraulic servos'],
      ['TRAVEL', 'speed-limited with airspeed'],
      ['SIZING CASE', 'engine-out on rotation']
    ],
    action: 'DEFLECT',
    hint: 'Sweep the rudder through its travel.'
  },
  elevator: {
    name: 'ELEVATOR',
    sub: 'FLIGHT CONTROL',
    body: 'The elevators trim pitch moment-to-moment while the whole horizontal stabiliser trims it for the long run. On a fly-by-wire Airbus the sidestick does not command elevator deflection — it commands a load factor, and the computers work out how much elevator that needs.',
    facts: [
      ['AXIS', 'pitch'],
      ['COMMAND', 'load factor, not deflection'],
      ['TRIM', 'moving stabiliser (THS)'],
      ['PROTECTION', 'pitch limited by envelope']
    ],
    action: 'DEFLECT',
    hint: 'Move the elevators up and down.'
  },
  aileron: {
    name: 'AILERON',
    sub: 'FLIGHT CONTROL',
    body: 'The outboard ailerons roll the aircraft at low speed and are locked out at high speed, where the spoilers take over. Rolling a swept wing with ailerons alone at cruise would twist the wing box against the roll — a phenomenon called aileron reversal.',
    facts: [
      ['AXIS', 'roll'],
      ['ASSIST', 'roll spoilers'],
      ['HIGH SPEED', 'locked, spoilers only'],
      ['DRIVE', 'two independent circuits']
    ],
    action: 'ROLL',
    hint: 'Roll the aircraft with the ailerons and spoilers.'
  },
  door: {
    name: 'PASSENGER DOOR',
    sub: 'STRUCTURE',
    body: 'A plug door is larger than the hole it fills. Cabin pressure presses it into its frame rather than out of it, so the more pressurised the aircraft is, the harder the door is shut — which is why it physically cannot be opened in flight.',
    facts: [
      ['TYPE', 'plug, outward opening'],
      ['SLIDE', 'armed automatically'],
      ['ΔP LOCK', 'inhibited above 2.5 psi'],
      ['OPERATION', 'lift, swing, park']
    ],
    action: 'OPEN',
    hint: 'Open the door and board the aircraft.'
  },
  apu: {
    name: 'AUXILIARY POWER UNIT',
    sub: 'SYSTEMS',
    body: 'A small gas turbine in the tailcone that makes electricity and bleed air on the ground, so the aircraft can run its own air conditioning, its own lights and its own engine starts without a ground cart.',
    facts: [
      ['LOCATION', 'tailcone'],
      ['SUPPLIES', 'AC power + bleed air'],
      ['USE', 'ground ops, engine start'],
      ['IN FLIGHT', 'available as backup']
    ],
    action: 'START',
    hint: 'Start the APU.'
  },
  cockpit: {
    name: 'FLIGHT DECK',
    sub: 'CONTROL',
    body: 'Two sidesticks, six displays, no control column and no throttle that moves by itself. The Airbus flight deck is built on the idea that the crew sets targets and the aircraft flies them — and that the aircraft will refuse to be flown outside its envelope.',
    facts: [
      ['DISPLAYS', '2 PFD · 2 ND · 2 ECAM'],
      ['CONTROL', 'sidestick, fly-by-wire'],
      ['AUTOFLIGHT', 'FCU + 2 × MCDU'],
      ['COMMONALITY', 'one rating, many types']
    ],
    action: 'ENTER',
    hint: 'Take a seat.'
  },
  cabin: {
    name: 'CABIN',
    sub: 'INTERIOR',
    body: 'Everything you can see from a seat is a compromise between structure, evacuation certification and the fact that people have to sit in it for fourteen hours. The sidewall curve, the bin height and the aisle width are all consequences of the fuselage cross-section chosen decades ago.',
    facts: [
      ['CROSS-SECTION', 'per family'],
      ['CERTIFICATION', '90 s full evacuation'],
      ['CABIN ALTITUDE', '6 000 ft typical'],
      ['LIGHTING', 'full-spectrum LED']
    ],
    action: 'WALK',
    hint: 'Walk the aisle.'
  }
};
