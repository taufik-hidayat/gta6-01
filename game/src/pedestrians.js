// Pedestrians: people who walk the sidewalks, cross at the crosswalks, and run screaming
// (well — running) when a gun goes off or a car bears down on them. They make the city
// feel inhabited, and hitting one is the fastest way to earn a wanted star.

import { CITY, PED, WORLD } from './config.js';
import { pick, range } from './random.js';

const SHIRTS = ['#e8e8e8', '#7ab5d9', '#d97b8a', '#8ad9a0', '#d9c27a', '#b58ad9', '#e07b4f'];

function randomSidewalkRoad(random) {
  // A road to walk along, a side of it, and a direction — the pedestrian stays on that
  // sidewalk until an intersection, where it may turn onto the crossing road.
  if (random() < 0.5) {
    return { axis: 'v', line: pick(random, CITY.avenues), side: random() < 0.5 ? -1 : 1, dir: random() < 0.5 ? 1 : -1 };
  }
  return { axis: 'h', line: pick(random, CITY.streets), side: random() < 0.5 ? -1 : 1, dir: random() < 0.5 ? 1 : -1 };
}

function sidewalkPoint(random, road) {
  if (road.axis === 'v') {
    return {
      x: road.line + road.side * (CITY.avenueWidth / 2 + 8),
      y: range(random, 60, WORLD.height - 220),
    };
  }
  return {
    x: range(random, 60, WORLD.width - 60),
    y: road.line + road.side * (CITY.streetWidth / 2 + 8),
  };
}

export function createPedestrians(random, city) {
  const peds = [];
  for (let i = 0; i < PED.count; i += 1) {
    const road = randomSidewalkRoad(random);
    const point = sidewalkPoint(random, road);
    peds.push({
      x: point.x,
      y: point.y,
      angle: road.axis === 'v' ? (road.dir > 0 ? Math.PI / 2 : -Math.PI / 2) : road.dir > 0 ? 0 : Math.PI,
      speed: range(random, PED.walkMin, PED.walkMax),
      walkSpeed: 0,
      shirt: pick(random, SHIRTS),
      scared: 0,
      fleeX: 0,
      fleeY: 0,
      bob: range(random, 0, Math.PI * 2),
      down: 0,
      road,
    });
    peds[i].walkSpeed = peds[i].speed;
  }

  function stepPed(ped, dt) {
    if (ped.down > 0) {
      ped.down -= dt;
      return;
    }
    if (ped.scared > 0) {
      ped.scared -= dt;
      const dx = ped.x - ped.fleeX;
      const dy = ped.y - ped.fleeY;
      const d = Math.hypot(dx, dy) || 1;
      const next = city.slide(ped.x, ped.y, ped.x + (dx / d) * PED.fleeSpeed * dt, ped.y + (dy / d) * PED.fleeSpeed * dt, 10);
      ped.x = next.x;
      ped.y = next.y;
      ped.angle = Math.atan2(dy, dx);
      ped.bob += dt * 14;
      return;
    }
    const road = ped.road;
    const step = ped.speed * dt;
    if (road.axis === 'v') {
      ped.y += road.dir * step;
      ped.angle = road.dir > 0 ? Math.PI / 2 : -Math.PI / 2;
      // At an intersection, sometimes turn onto the crossing street's sidewalk.
      for (const street of CITY.streets) {
        if (Math.abs(ped.y - street) < 16 && random() < 0.3) {
          ped.road = { axis: 'h', line: street, side: random() < 0.5 ? -1 : 1, dir: random() < 0.5 ? 1 : -1 };
          ped.y = street + ped.road.side * (CITY.streetWidth / 2 + 8);
          break;
        }
      }
      if (ped.y < 50 || ped.y > WORLD.height - 210) road.dir *= -1;
    } else {
      ped.x += road.dir * step;
      ped.angle = road.dir > 0 ? 0 : Math.PI;
      for (const avenue of CITY.avenues) {
        if (Math.abs(ped.x - avenue) < 16 && random() < 0.3) {
          ped.road = { axis: 'v', line: avenue, side: random() < 0.5 ? -1 : 1, dir: random() < 0.5 ? 1 : -1 };
          ped.x = avenue + ped.road.side * (CITY.avenueWidth / 2 + 8);
          break;
        }
      }
      if (ped.x < 50 || ped.x > WORLD.width - 50) road.dir *= -1;
    }
    ped.bob += dt * (6 + ped.speed * 0.05);
  }

  return {
    peds,
    step(dt) {
      for (const ped of peds) stepPed(ped, dt);
    },
    /** Scare every pedestrian within `radius` of a point (gunshots, near misses). */
    scare(x, y, radius) {
      for (const ped of peds) {
        if (ped.down > 0) continue;
        const dx = ped.x - x;
        const dy = ped.y - y;
        if (dx * dx + dy * dy < radius * radius) {
          ped.scared = PED.fleeTime;
          ped.fleeX = x;
          ped.fleeY = y;
        }
      }
    },
    /** The nearest pedestrian to a point, within `maxDist`. */
    nearest(x, y, maxDist) {
      let best = null;
      let bestDist = maxDist;
      for (const ped of peds) {
        if (ped.down > 0) continue;
        const d = Math.hypot(ped.x - x, ped.y - y);
        if (d < bestDist) {
          bestDist = d;
          best = ped;
        }
      }
      return best;
    },
    /** Knock a pedestrian down (they get up after a few seconds). */
    knockDown(ped, seconds) {
      ped.down = seconds;
      ped.scared = 0;
    },
  };
}
