// Traffic: civilian cars that drive the city's roads on the right-hand lane, queue behind
// slower cars, and pick a new direction at every intersection. Each car keeps its own
// colour and body type, so the streets read as varied instead of cloned.

import { CITY, TRAFFIC, WORLD } from './config.js';
import { laneCentre } from './city.js';
import { pick, range } from './random.js';

export const CAR_KIND_SEDAN = 0;
export const CAR_KIND_TAXI = 1;
export const CAR_KIND_VAN = 2;
export const CAR_KIND_TRUCK = 3;
export const CAR_KIND_SPORTS = 4;

const BODY_COLORS = ['#c94f42', '#4f7ec9', '#c9a44f', '#5a9e6a', '#8a6fc9', '#c9c9c9', '#3a3f4a', '#d97b2f'];
const TAXI_COLOR = '#f2c94c';

function randomRoute(random) {
  const axis = random() < 0.5 ? 'v' : 'h';
  if (axis === 'v') {
    const line = pick(random, CITY.avenues);
    return { axis, line, dir: random() < 0.5 ? 1 : -1, x: line, y: range(random, 100, WORLD.height - 200) };
  }
  const line = pick(random, CITY.streets);
  return { axis, line, dir: random() < 0.5 ? 1 : -1, x: range(random, 100, WORLD.width - 200), y: line };
}

function spawnCar(random, city) {
  const route = randomRoute(random);
  const kindRoll = random();
  const kind = kindRoll < 0.55 ? CAR_KIND_SEDAN : kindRoll < 0.7 ? CAR_KIND_TAXI : kindRoll < 0.82 ? CAR_KIND_VAN : kindRoll < 0.92 ? CAR_KIND_TRUCK : CAR_KIND_SPORTS;
  const length = kind === CAR_KIND_TRUCK || kind === CAR_KIND_VAN ? 52 : kind === CAR_KIND_SPORTS ? 42 : 46;
  const width = kind === CAR_KIND_TRUCK || kind === CAR_KIND_VAN ? 26 : 23;
  const lane = laneCentre(route.axis, route.line, route.dir);
  return {
    kind,
    color: kind === CAR_KIND_TAXI ? TAXI_COLOR : pick(random, BODY_COLORS),
    x: route.axis === 'v' ? lane : route.x,
    y: route.axis === 'h' ? lane : route.y,
    angle: route.axis === 'v' ? (route.dir > 0 ? Math.PI / 2 : -Math.PI / 2) : route.dir > 0 ? 0 : Math.PI,
    speed: range(random, TRAFFIC.speedMin, TRAFFIC.speedMax),
    cruise: range(random, TRAFFIC.speedMin, TRAFFIC.speedMax),
    axis: route.axis,
    line: route.line,
    dir: route.dir,
    length,
    width,
    health: 100,
    stopped: false,
    brakeLight: false,
    driver: true,
  };
}

export function createTraffic(random, city) {
  const cars = [];
  for (let i = 0; i < TRAFFIC.count; i += 1) cars.push(spawnCar(random, city));

  /** The car ahead of `car` on the same lane, if one is close. */
  function carAhead(car) {
    let nearest = null;
    let nearestDist = Infinity;
    for (const other of cars) {
      if (other === car || other.axis !== car.axis || other.line !== car.line || other.dir !== car.dir) continue;
      const along = car.axis === 'v' ? (other.y - car.y) * car.dir : (other.x - car.x) * car.dir;
      if (along <= 0 || along > TRAFFIC.lookAhead) continue;
      const lateral = car.axis === 'v' ? Math.abs(other.x - car.x) : Math.abs(other.y - car.y);
      if (lateral > 30) continue;
      if (along < nearestDist) {
        nearestDist = along;
        nearest = other;
      }
    }
    return nearest === null ? null : { car: nearest, dist: nearestDist };
  }

  function atIntersection(car) {
    if (car.axis === 'v') {
      for (const street of CITY.streets) {
        if (Math.abs(car.y - street) < 14) return { axis: 'h', line: street };
      }
      return null;
    }
    for (const avenue of CITY.avenues) {
      if (Math.abs(car.x - avenue) < 14) return { axis: 'v', line: avenue };
    }
    return null;
  }

  function stepCar(car, dt) {
    // Queue behind a slower car instead of driving through it.
    const ahead = carAhead(car);
    let targetSpeed = car.cruise;
    if (ahead) {
      targetSpeed = Math.min(targetSpeed, ahead.car.speed);
      if (ahead.dist < TRAFFIC.followGap) targetSpeed = 0;
    }
    car.speed += Math.max(-420 * dt, Math.min(180 * dt, targetSpeed - car.speed));
    car.brakeLight = targetSpeed < car.speed - 20;

    const step = car.speed * car.dir * dt;
    if (car.axis === 'v') car.y += step;
    else car.x += step;

    // Ease back onto the lane: a shove from another car must not leave this one
    // driving through buildings parallel to its road forever.
    const lane = laneCentre(car.axis, car.line, car.dir);
    if (car.axis === 'v') car.x += (lane - car.x) * Math.min(1, 2 * dt);
    else car.y += (lane - car.y) * Math.min(1, 2 * dt);

    // At an intersection, sometimes turn onto the crossing road (a small chance each
    // frame while crossing, so roughly one turn in four intersections).
    const crossing = atIntersection(car);
    if (crossing && Math.abs(car.speed) > 20) {
      const turn = car.axis === 'v' ? Math.abs(car.x - car.line) < 40 : Math.abs(car.y - car.line) < 40;
      if (turn && random() < 0.045) {
        const newDir = random() < 0.5 ? 1 : -1;
        const lane = laneCentre(crossing.axis, crossing.line, newDir);
        if (crossing.axis === 'v') {
          car.axis = 'v';
          car.line = crossing.line;
          car.x = lane;
          car.dir = newDir;
          car.angle = newDir > 0 ? Math.PI / 2 : -Math.PI / 2;
        } else {
          car.axis = 'h';
          car.line = crossing.line;
          car.y = lane;
          car.dir = newDir;
          car.angle = newDir > 0 ? 0 : Math.PI;
        }
      }
    }

    // Reached the edge of the city: respawn on a fresh road so the streets stay full.
    if (car.x < -80 || car.x > WORLD.width + 80 || car.y < -80 || car.y > WORLD.height + 80) {
      const fresh = spawnCar(random, city);
      Object.assign(car, fresh);
    }
  }

  return {
    cars,
    step(dt) {
      for (const car of cars) {
        // Wrecks, parked cars and the car the player is driving stay where they are.
        if (car.health <= 0 || car.parked || car.driven) continue;
        stepCar(car, dt);
      }
    },
    /** The nearest drivable car to a point, within `maxDist` (for stealing). */
    nearestCar(x, y, maxDist) {
      let best = null;
      let bestDist = maxDist;
      for (const car of cars) {
        if (car.health <= 0) continue;
        const dx = car.x - x;
        const dy = car.y - y;
        const d = Math.sqrt(dx * dx + dy * dy);
        if (d < bestDist) {
          bestDist = d;
          best = car;
        }
      }
      return best;
    },
    /** A fresh parked car of a given kind at a roadside spot (used by missions). */
    spawnParked(kind, x, y, angle) {
      const car = spawnCar(random, city);
      car.kind = kind;
      car.x = x;
      car.y = y;
      car.angle = angle;
      car.speed = 0;
      car.cruise = 0;
      car.driver = false;
      car.parked = true;
      if (kind === CAR_KIND_SPORTS) car.color = '#d92038';
      return car;
    },
    addCar(car) {
      cars.push(car);
    },
  };
}
