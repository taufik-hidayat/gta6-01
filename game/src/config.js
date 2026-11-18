// Teluk Bayu — every tuning number, colour and place name in one place.
// The world is a fixed 3200x2400 coastal city; the renderer scales a 1280x720 view of it
// to the window, so no rule below depends on the screen size.

export const WORLD = { width: 3200, height: 2400 };

/** The simulation's fixed step, in seconds: 60 updates a second whatever the display's rate. */
export const STEP = 1 / 60;

/** One full day-night cycle, in seconds of play. */
export const DAY_LENGTH = 240;

/** The playfield the camera shows: 1280x720 logical pixels, scaled to the window. */
export const VIEW = { width: 1280, height: 720 };

export const PLAYER = {
  radius: 13,
  walkSpeed: 170,
  runSpeed: 265,
  health: 100,
  punchRange: 34,
  punchDamage: 34,
  punchCooldown: 0.45,
  pistolDamage: 40,
  pistolRange: 520,
  pistolCooldown: 0.28,
  magSize: 12,
  reloadTime: 1.4,
  /** Health slowly returns to this much when the player has been calm a while. */
  regenTo: 50,
  regenDelay: 10,
  regenRate: 4,
};

export const CAR = {
  radius: 21,
  accel: 340,
  sportsAccel: 430,
  brake: 620,
  reverseAccel: 260,
  maxSpeed: 520,
  sportsMaxSpeed: 660,
  truckMaxSpeed: 430,
  maxReverse: 190,
  /** How fast the heading turns at full steer, scaled down as speed rises. */
  turnRate: 2.6,
  grip: 8.5,
  driftGrip: 2.2,
  health: 100,
};

export const TRAFFIC = {
  count: 16,
  speedMin: 120,
  speedMax: 185,
  followGap: 74,
  /** How far ahead a traffic car looks for a slower car to queue behind. */
  lookAhead: 110,
};

export const PED = {
  count: 26,
  walkMin: 42,
  walkMax: 72,
  fleeSpeed: 150,
  fleeTime: 2.2,
};

export const POLICE = {
  /** Cruisers on the road for each wanted level, index = stars. */
  countByStars: [0, 1, 2, 3, 4, 5],
  /** Fast enough to catch a truck and pressure a sedan, slower than a sedan on a
   *  straight — so an escape is earned by driving, not impossible. */
  speed: 505,
  ramDamage: 5,
  /** Seconds a cruiser must touch the player on foot before the bust lands. */
  bustTime: 1.4,
  /** Seconds with no cruiser in sight before a star fades. */
  decayDelay: 8,
  decayEvery: 6,
  /** Stars at which roadblocks start appearing ahead of the player. */
  roadblockStars: 3,
};

export const WANTED_MAX = 5;

export const CITY = {
  /** Vertical avenues (road centre x) and their width. */
  avenues: [400, 1000, 1600, 2200, 2800],
  avenueWidth: 120,
  /** Horizontal streets (road centre y) and their width. */
  streets: [350, 800, 1250, 1700, 2050],
  streetWidth: 110,
  sidewalk: 16,
  /** The beach and the sea along the south edge. */
  sandTop: 2240,
  waterTop: 2320,
};

/** Named places the story and the minimap point at. */
export const PLACES = {
  port: { x: 260, y: 1950, name: 'Pelabuhan Bayu' },
  cafe: { x: 2920, y: 2120, name: 'Kopi Dermaga' },
  // The safehouse building stands east of avenue 1600 (x 1700-1800), clear of
  // both lanes; this point stays on the avenue in front of it, the way the
  // mission-3 garage delivery point sits on the road, not inside the building.
  // Babak 2 ends the moment the player pulls up here, so the escape route and
  // both test drivers aim at this exact spot.
  safehouse: { x: 1600, y: 190, name: 'Rumah Aman' },
  garage: { x: 240, y: 1560, name: 'Bengkel Darto' },
  mall: { x: 2560, y: 1120, name: 'Mal Bayu Plaza' },
  hospital: { x: 620, y: 1560, name: 'Rumah Sakit Bayu' },
  policeStation: { x: 1755, y: 615, name: 'Kantor Polisi' },
  park: { x: 1300, y: 1020, name: 'Taman Merdeka' },
};

export const MISSION_REWARD = [500, 800, 1500];
export const ENVELOPE_VALUE = 75;
export const ENVELOPE_COUNT = 8;

export const PALETTE = {
  backdrop: '#0b0e14',
  grass: '#25351f',
  block: '#20242c',
  sidewalk: '#333947',
  road: '#2b2f38',
  roadEdge: '#3d4350',
  laneDash: '#c8b45a',
  crosswalk: '#c9ced8',
  sand: '#a98f62',
  water: '#14425e',
  waterDeep: '#0e2f47',
  building: '#3a4152',
  buildingRoof: '#4a5266',
  buildingRoof2: '#565e73',
  park: '#2c4632',
  tree: '#3f7a3a',
  treeDark: '#2f5e2c',
  player: '#ffcf3d',
  playerJacket: '#e2483d',
  ped: '#d8dee9',
  police: '#e8ecf2',
  policeDark: '#1c2733',
  text: '#f2f4f8',
  muted: '#9aa3b2',
  gold: '#f2c94c',
  danger: '#ff5a4e',
  mission: '#ffd23d',
  policeBlip: '#4fc3f7',
  panel: 'rgba(12, 16, 24, 0.88)',
  panelEdge: '#3d4658',
};

export const FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif';

/** Where the save lives between visits (this browser only). */
export const SAVE_KEY = 'teluk-bayu.save.v1';
export const BEST_KEY = 'teluk-bayu.best.v1';
