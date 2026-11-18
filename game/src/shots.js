// The screenshot scenes behind ?shot=start|chase|mission|heist. Each one sets the world to
// a fixed, lively moment — the real rules, a fixed seed, a scripted drive — then steps the
// simulation forward so traffic, pedestrians and police are mid-motion when the frame is
// painted. The same seed always gives the same frame.

import { PLACES, STEP } from './config.js';
import { laneCentre, nearestLanePoint } from './city.js';
import { CAR_KIND_SPORTS } from './traffic.js';

const SCREEN_TITLE = 'title';
const SCREEN_PLAY = 'play';

/** Drive along the road grid toward a target: follow waypoints placed on roads, so the car
 *  never ploughs through a building. Waypoints are axis-aligned, one road at a time, and
 *  each leg aims at its own lane — eastbound on a street's south lane, southbound on an
 *  avenue's west lane — so the car never meets oncoming traffic head-on. */
function roadDriver(waypoints) {
  let leg = 0;
  let stuckTime = 0;
  let reverseTime = 0;
  return function drive(world) {
    const car = world.player.state.inCar;
    if (!car) return { x: 0, y: 0, punch: false, shoot: false };
    // Stuck against a wall while throttling: back up briefly, then try again.
    // (A U-turn right after a delivery can wedge the car against a building.)
    if (reverseTime > 0) {
      reverseTime -= 1 / 60;
      return { x: 0, y: 1, punch: false, shoot: false };
    }
    const cur = waypoints[Math.min(leg, waypoints.length - 1)];
    if (Math.hypot(cur.x - car.x, cur.y - car.y) < 90 && leg < waypoints.length - 1) leg += 1;
    const last = leg === waypoints.length - 1;
    const target = waypoints[leg];
    const dx = target.x - car.x;
    const dy = target.y - car.y;
    const dist = Math.hypot(dx, dy);
    // The last waypoint is the destination itself — often off the road, in front of a
    // building — so aim straight at it and stop there, instead of chasing a lane
    // offset through a wall.
    if (last && dist < 70) return { x: 0, y: 0, punch: false, shoot: false };
    let tx = target.x;
    let ty = target.y;
    if (!last) {
      // Aim at a point on the lane a short way ahead, not the far waypoint: the car
      // merges onto its lane first, instead of holding a small lateral error for a
      // whole leg and driving through the blocks beside the road.
      const look = Math.min(dist, 180);
      if (Math.abs(dx) > Math.abs(dy)) {
        ty = target.y + 27 * Math.sign(dx || 1);
        tx = car.x + Math.sign(dx || 1) * look;
      } else {
        tx = target.x - 30 * Math.sign(dy || 1);
        ty = car.y + Math.sign(dy || 1) * look;
      }
    }
    // Overtake: a slower car right ahead in our lane gets passed, not rammed.
    // Swing left into the oncoming lane while the blocker is ahead; the gap
    // (80 px off the lane) clears it, and oncoming cars sit in their own lane.
    for (const other of world.traffic.cars) {
      if (other === car || other.health <= 0 || other.driven) continue;
      const ahead = (other.x - car.x) * Math.cos(car.angle) + (other.y - car.y) * Math.sin(car.angle);
      const side = -(other.x - car.x) * Math.sin(car.angle) + (other.y - car.y) * Math.cos(car.angle);
      if (ahead > 0 && ahead < 150 && Math.abs(side) < 46) {
        tx += -Math.sin(car.angle) * 80;
        ty += Math.cos(car.angle) * 80;
        break;
      }
    }
    const want = Math.atan2(ty - car.y, tx - car.x);
    let diff = want - car.angle;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    // Brake for a sharp corner: the next leg turns away from this one, so slow
    // down before the waypoint instead of overshooting it into the blocks.
    let braking = false;
    if (!last && dist < 380 && car.speed > 160) {
      const next = waypoints[leg + 1];
      const nextDir = Math.atan2(next.y - target.y, next.x - target.x);
      let turn = nextDir - want;
      while (turn > Math.PI) turn -= Math.PI * 2;
      while (turn < -Math.PI) turn += Math.PI * 2;
      if (Math.abs(turn) > 0.5) braking = true;
    }
    const aligned = Math.abs(diff) < 0.6;
    const axes = {
      // A tight steering dead zone: 0.25 rad of slack lets the car drift 14 degrees
      // off its lane at full speed and grind the buildings. 0.08 holds the lane.
      x: diff > 0.08 ? 1 : diff < -0.08 ? -1 : 0,
      y: braking ? 1 : aligned ? -1 : 0,
      punch: false,
      shoot: false,
    };
    if (axes.y === -1 && car.speed < 50) {
      stuckTime += 1 / 60;
      if (stuckTime > 1.5) {
        stuckTime = 0;
        reverseTime = 0.8;
      }
    } else {
      stuckTime = 0;
    }
    return axes;
  };
}

function placePlayerInCar(world, x, y, angle, kind) {
  const car = world.traffic.spawnParked(kind ?? 0, x, y, angle);
  world.traffic.addCar(car);
  world.player.enterCar(car);
  car.vx = Math.cos(angle) * 200;
  car.vy = Math.sin(angle) * 200;
  car.speed = 200;
  return car;
}

function stepWorld(world, seconds, driver) {
  const steps = Math.round(seconds / STEP);
  for (let i = 0; i < steps; i += 1) {
    const axes = driver ? driver(world) : { x: 0, y: 0, punch: false, shoot: false };
    world.advance(STEP, axes);
  }
}

/**
 * Set `world` to the named scene and return the screen to draw over it.
 * Scenes: start (title over the city at dusk), chase (night pursuit, 3 stars),
 * mission (daytime, driving to the delivery), heist (dusk, stealing the red sedan).
 */
export function stageShot(name, world) {
  const w = world;
  if (name === 'chase') {
    w.dayTime = 0.82;
    w.player.state.x = 1600;
    w.player.state.y = 1277;
    w.player.state.cash = 2400;
    placePlayerInCar(w, 1600, 1277, 0, CAR_KIND_SPORTS);
    w.player.state.wanted = 3;
    w.player.state.wantedTimer = 0;
    w.police.step(0.01, 3, w.player.state, w.player.state.inCar, {});
    for (let i = 0; i < 3; i += 1) w.police.step(0.5, 3, w.player.state, w.player.state.inCar, {});
    // East along street 1250, sirens behind — the escape in full flight. Two and a
    // half seconds keeps the car mid-flight on the straight, before the corner.
    stepWorld(w, 2.5, roadDriver([{ x: 2900, y: 1250 }]));
    // The cruisers spawn 800+ px away and a sports car outruns them, so for the
    // frame they trail the player down the same street — real cruisers, real AI,
    // placed where a pursuit that has been running a while would have them.
    // Each one snaps to the nearest lane, so it sits on the road, not in a block.
    const chaseCar = w.player.state.inCar;
    w.police.cruisers.forEach((cruiser, i) => {
      const back = 300 + i * 220;
      const fx = Math.cos(chaseCar.angle);
      const fy = Math.sin(chaseCar.angle);
      const spot = nearestLanePoint(chaseCar.x - fx * back, chaseCar.y - fy * back);
      const followDir = spot.axis === 'v'
        ? (Math.sin(chaseCar.angle) >= 0 ? 1 : -1)
        : (Math.cos(chaseCar.angle) >= 0 ? 1 : -1);
      const dir = i % 2 === 0 ? followDir : -followDir;
      const lane = laneCentre(spot.axis, spot.line, dir);
      cruiser.x = spot.axis === 'v' ? lane : spot.x;
      cruiser.y = spot.axis === 'h' ? lane : spot.y;
      cruiser.angle = spot.axis === 'v' ? (dir > 0 ? Math.PI / 2 : -Math.PI / 2) : (dir > 0 ? 0 : Math.PI);
      cruiser.speed = 480;
    });
    // Skid marks from the escape.
    for (let i = 0; i < 12; i += 1) {
      w.skids.push({ x1: 1600 + i * 26, y1: 1250 + Math.sin(i) * 8, x2: 1626 + i * 26, y2: 1250 + Math.sin(i) * 8, life: 9 });
    }
    w.missions.start(1, w.ctx);
    return { screen: SCREEN_PLAY };
  }
  if (name === 'mission') {
    w.dayTime = 0.18;
    w.player.state.x = 700;
    w.player.state.y = 827;
    w.player.state.cash = 500;
    placePlayerInCar(w, 700, 827, 0, 0);
    w.missions.start(0, w.ctx);
    // Already picked the package up: now driving to the cafe — east on street 800,
    // south on avenue 2800, then east on street 2050 to Kopi Dermaga. Nine
    // seconds catches the car mid-approach on the last straight, marker ahead.
    w.missions.state.objectiveIndex = 1;
    stepWorld(w, 9, roadDriver([{ x: 2800, y: 800 }, { x: 2800, y: 2050 }, { x: 2900, y: 2050 }]));
    return { screen: SCREEN_PLAY };
  }
  if (name === 'heist') {
    w.dayTime = 0.48;
    // On foot in the mall car park, beside the red sedan — not on the mall roof.
    w.player.state.x = 2440;
    w.player.state.y = 1130;
    w.player.state.cash = 1300;
    w.missions.start(2, w.ctx);
    // startMission already parked the red sedan in the car park (2400, 1130).
    stepWorld(w, 2, null);
    return { screen: SCREEN_PLAY };
  }
  // start: the title screen over the city at golden hour.
  w.dayTime = 0.46;
  w.player.state.x = 1600;
  w.player.state.y = 800;
  stepWorld(w, 8, null);
  return { screen: SCREEN_TITLE };
}
