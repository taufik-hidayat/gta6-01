// The city of Teluk Bayu: a grid of avenues and streets around blocks of buildings, a park,
// a mall, a port, a beach and the sea along the south edge. buildCity deals the buildings
// and trees once per seed; the query helpers below answer what the traffic, the police and
// the player need: am I on a road, which lane, and does this circle hit a building.

import { CITY, WORLD } from './config.js';
import { pick, range } from './random.js';

const ROOFS = ['#4a5266', '#565e73', '#414a5e', '#5d6a80', '#3d4a63'];

function rectsOverlap(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

function circleHitsRect(x, y, r, rect) {
  const closestX = Math.max(rect.x, Math.min(x, rect.x + rect.w));
  const closestY = Math.max(rect.y, Math.min(y, rect.y + rect.h));
  const dx = x - closestX;
  const dy = y - closestY;
  return dx * dx + dy * dy < r * r;
}

/** True when the point is on asphalt (an avenue or a street band). */
export function isOnRoad(x, y) {
  for (const avenue of CITY.avenues) {
    if (Math.abs(x - avenue) <= CITY.avenueWidth / 2) return true;
  }
  for (const street of CITY.streets) {
    if (Math.abs(y - street) <= CITY.streetWidth / 2) return true;
  }
  return false;
}

/** The lane centre for right-hand traffic: `axis` is 'v' (avenue) or 'h' (street). */
export function laneCentre(axis, line, direction) {
  if (axis === 'v') return line + (direction > 0 ? -30 : 30);
  return line + (direction > 0 ? 27 : -27);
}

/** Snap a point to the nearest lane centre on the nearest road. */
export function nearestLanePoint(x, y) {
  let best = null;
  for (const avenue of CITY.avenues) {
    const d = Math.abs(x - avenue);
    if (best === null || d < best.d) best = { d, x: avenue, y, axis: 'v', line: avenue };
  }
  for (const street of CITY.streets) {
    const d = Math.abs(y - street);
    if (best === null || d < best.d) best = { d, x, y: street, axis: 'h', line: street };
  }
  return best;
}

export function buildCity(random) {
  const buildings = [];
  const trees = [];

  // Landmark buildings first: generated blocks must not cover them.
  // Every landmark must sit fully inside a block cell, clear of every avenue
  // and street band: a landmark overlapping a road puts its walls across a
  // traffic lane, and cars drive straight through the building. (Rumah Aman,
  // Kantor Polisi and two port warehouses used to sit on avenue 1600 / street
  // 2050 that way; they now stand clear of the asphalt.)
  const landmarks = [
    { x: 1700, y: 140, w: 100, h: 70, name: 'Rumah Aman', color: '#7a5a3a' },
    { x: 190, y: 1520, w: 110, h: 80, name: 'Bengkel Darto', color: '#8a6a2f' },
    { x: 2470, y: 1030, w: 200, h: 150, name: 'Mal Bayu Plaza', color: '#5a6a8a' },
    { x: 570, y: 1520, w: 130, h: 80, name: 'Rumah Sakit Bayu', color: '#7a8a9a' },
    { x: 1700, y: 580, w: 110, h: 70, name: 'Kantor Polisi', color: '#3a5a7a' },
    { x: 2880, y: 2125, w: 80, h: 55, name: 'Kopi Dermaga', color: '#6a4a3a' },
    { x: 90, y: 1860, w: 220, h: 70, name: 'Gudang Pelabuhan', color: '#5a4a3a' },
    { x: 90, y: 1780, w: 220, h: 70, name: 'Gudang Pelabuhan', color: '#54463a' },
    { x: 90, y: 2120, w: 160, h: 60, name: 'Gudang Pelabuhan', color: '#5a4a3a' },
  ];
  for (const mark of landmarks) {
    buildings.push({ ...mark, landmark: true, roof: mark.color, shade: 0.85 });
  }

  // Block cells: the rectangles between neighbouring roads.
  const xEdges = [0];
  for (const avenue of CITY.avenues) xEdges.push(avenue - CITY.avenueWidth / 2, avenue + CITY.avenueWidth / 2);
  xEdges.push(WORLD.width);
  const yEdges = [0];
  for (const street of CITY.streets) yEdges.push(street - CITY.streetWidth / 2, street + CITY.streetWidth / 2);
  yEdges.push(CITY.sandTop);

  const parkCell = { x: 1060, y: 855, w: 480, h: 340 };

  for (let xi = 0; xi < xEdges.length - 1; xi += 1) {
    for (let yi = 0; yi < yEdges.length - 1; yi += 1) {
      // The edge lists alternate block / road / block / road, so only even pairs are
      // buildable blocks; odd pairs are the avenues and streets themselves. Building
      // on a road band would wall the street shut.
      if (xi % 2 === 1 || yi % 2 === 1) continue;
      const cell = { x: xEdges[xi], y: yEdges[yi], w: xEdges[xi + 1] - xEdges[xi], h: yEdges[yi + 1] - yEdges[yi] };
      if (cell.w < 90 || cell.h < 90) continue;
      // Nothing is built on the beach strip.
      if (cell.y + cell.h >= CITY.sandTop) continue;
      if (rectsOverlap(cell, parkCell)) {
        // The park: grass and trees, no buildings.
        for (let t = 0; t < 26; t += 1) {
          trees.push({
            x: range(random, parkCell.x + 20, parkCell.x + parkCell.w - 20),
            y: range(random, parkCell.y + 20, parkCell.y + parkCell.h - 20),
            r: range(random, 12, 20),
          });
        }
        continue;
      }
      // One to three buildings per block, kept clear of landmarks and road edges.
      const count = cell.w * cell.h > 90000 ? 3 : cell.w * cell.h > 40000 ? 2 : 1;
      for (let b = 0; b < count; b += 1) {
        const w = range(random, 70, Math.min(170, cell.w - 50));
        const h = range(random, 60, Math.min(140, cell.h - 50));
        const x = range(random, cell.x + 18, cell.x + cell.w - w - 18);
        const y = range(random, cell.y + 18, cell.y + cell.h - h - 18);
        const candidate = { x, y, w, h, landmark: false, roof: pick(random, ROOFS), shade: range(random, 0.75, 1) };
        let clear = true;
        for (const other of buildings) {
          if (rectsOverlap({ x: x - 24, y: y - 24, w: w + 48, h: h + 48 }, other)) {
            clear = false;
            break;
          }
        }
        if (clear) buildings.push(candidate);
      }
      // A few street trees along the block's edges.
      if (random() < 0.6) {
        trees.push({
          x: range(random, cell.x + 10, cell.x + cell.w - 10),
          y: cell.y + 8,
          r: range(random, 10, 15),
        });
      }
    }
  }

  // Palm trees along the beach.
  for (let x = 120; x < WORLD.width - 60; x += range(random, 90, 170)) {
    trees.push({ x, y: range(random, CITY.sandTop + 18, CITY.sandTop + 60), r: range(random, 12, 17) });
  }

  const city = { buildings, trees, landmarks };

  /** True when a circle of radius `r` at (x, y) would hit a building, the sea or the edge. */
  city.isBlocked = function isBlocked(x, y, r) {
    if (x < r || y < r || x > WORLD.width - r || y > WORLD.height - r) return true;
    if (y > CITY.waterTop - 6) return true;
    for (const building of buildings) {
      if (circleHitsRect(x, y, r, building)) return true;
    }
    return false;
  };

  /** Slide a circle out of buildings: try x-only then y-only movement. */
  city.slide = function slide(x, y, nextX, nextY, r) {
    // Already inside a building (a shove pushed us in): step straight out to the
    // nearest free spot first, or the circle is trapped here forever.
    if (city.isBlocked(x, y, r)) {
      for (const d of [r, r * 2, r * 3]) {
        for (const [ox, oy] of [[d, 0], [-d, 0], [0, d], [0, -d]]) {
          if (!city.isBlocked(x + ox, y + oy, r)) return { x: x + ox, y: y + oy };
        }
      }
      return { x, y };
    }
    let outX = nextX;
    let outY = nextY;
    if (city.isBlocked(nextX, y, r)) outX = x;
    if (city.isBlocked(outX, nextY, r)) outY = y;
    if (city.isBlocked(outX, outY, r)) {
      outX = x;
      outY = y;
    }
    return { x: outX, y: outY };
  };

  return city;
}
