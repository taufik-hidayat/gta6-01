// The police: cruisers that spawn by wanted level, chase the player with a predicted
// intercept course, ram to stop them, and set up roadblocks ahead of a fleeing car at
// three stars and up. On foot, a cruiser that stays glued to the player fills the bust
// meter; in a car, the chase only ends when the player breaks line of sight long enough
// for the wanted level to decay.

import { CITY, POLICE, WORLD } from './config.js';
import { laneCentre } from './city.js';
import { pick, range } from './random.js';

export function createPolice(random, city) {
  const cruisers = [];
  const roadblocks = [];
  let bustMeter = 0;
  let spawnTimer = 0;
  let lightPhase = 0;

  function spawnCruiserNear(x, y) {
    // Appear on a road a little way off-screen from the player, never on top of them.
    for (let attempt = 0; attempt < 12; attempt += 1) {
      const axis = random() < 0.5 ? 'v' : 'h';
      let cx;
      let cy;
      let angle;
      if (axis === 'v') {
        const line = pick(random, CITY.avenues);
        const dir = random() < 0.5 ? 1 : -1;
        cx = laneCentre('v', line, dir);
        // Appear beyond the wanted-decay radius, so a fast getaway can actually
        // open the gap instead of a fresh cruiser landing inside it.
        cy = y + (random() < 0.5 ? -1 : 1) * range(random, 800, 1200);
        angle = dir > 0 ? Math.PI / 2 : -Math.PI / 2;
      } else {
        const line = pick(random, CITY.streets);
        const dir = random() < 0.5 ? 1 : -1;
        cy = laneCentre('h', line, dir);
        cx = x + (random() < 0.5 ? -1 : 1) * range(random, 800, 1200);
        angle = dir > 0 ? 0 : Math.PI;
      }
      cx = Math.max(40, Math.min(WORLD.width - 40, cx));
      cy = Math.max(40, Math.min(WORLD.height - 40, cy));
      const dist = Math.hypot(cx - x, cy - y);
      if (dist > 420 && !city.isBlocked(cx, cy, 24)) {
        return {
          x: cx, y: cy, angle, speed: 0,
          health: 100, stuck: 0, reverse: 0,
          siren: true, brakeLight: false, length: 46, width: 23,
        };
      }
    }
    return null;
  }

  function stepCruiser(cruiser, dt, player, playerCar) {
    lightPhase += dt;
    cruiser.ramCooldown = Math.max(0, (cruiser.ramCooldown ?? 0) - dt);
    // Chase the player's predicted position, not where they are now.
    const target = playerCar
      ? {
          x: player.x + Math.cos(playerCar.angle) * playerCar.speed * 0.55,
          y: player.y + Math.sin(playerCar.angle) * playerCar.speed * 0.55,
        }
      : { x: player.x, y: player.y };
    const dx = target.x - cruiser.x;
    const dy = target.y - cruiser.y;
    const dist = Math.hypot(dx, dy) || 1;
    const wantAngle = Math.atan2(dy, dx);
    let diff = wantAngle - cruiser.angle;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;

    const topSpeed = POLICE.speed;
    // On foot and nearly caught: creep onto the player and stay there, instead of
    // blasting past them again and again — otherwise the bust meter can never fill.
    const creeping = !playerCar && dist < 140;
    const targetSpeed = creeping ? 80 : topSpeed;
    if (cruiser.reverse > 0) {
      cruiser.reverse -= dt;
      cruiser.speed = Math.max(-160, cruiser.speed - 500 * dt);
    } else {
      cruiser.speed = Math.min(targetSpeed, cruiser.speed + 420 * dt);
    }
    const turnAuthority = 2.9 * Math.max(0.35, 1 - Math.abs(cruiser.speed) / (topSpeed * 1.4));
    cruiser.angle += Math.max(-turnAuthority * dt, Math.min(turnAuthority * dt, diff));
    const stepX = Math.cos(cruiser.angle) * cruiser.speed * dt;
    const stepY = Math.sin(cruiser.angle) * cruiser.speed * dt;
    const next = city.slide(cruiser.x, cruiser.y, cruiser.x + stepX, cruiser.y + stepY, 21);
    const moved = Math.hypot(next.x - cruiser.x, next.y - cruiser.y);
    cruiser.x = next.x;
    cruiser.y = next.y;
    // Stuck against a wall: back up briefly, then try again.
    if (Math.abs(cruiser.speed) > 60 && moved < Math.abs(cruiser.speed) * dt * 0.25) {
      cruiser.stuck += dt;
      if (cruiser.stuck > 1.2) {
        cruiser.reverse = 0.7;
        cruiser.stuck = 0;
      }
    } else {
      cruiser.stuck = 0;
    }
    return dist;
  }

  return {
    cruisers,
    roadblocks,
    get bustMeter() {
      return bustMeter;
    },
    get lightPhase() {
      return lightPhase;
    },
    reset() {
      cruisers.length = 0;
      roadblocks.length = 0;
      bustMeter = 0;
    },
    /**
     * Keep the cruiser count matched to the wanted level, move them, and update the bust
     * meter. Returns events: { rammed, busted }.
     */
    step(dt, wanted, player, playerCar, events) {
      const wantCount = POLICE.countByStars[Math.min(wanted, 5)];
      spawnTimer -= dt;
      if (cruisers.length < wantCount && spawnTimer <= 0) {
        const cruiser = spawnCruiserNear(player.x, player.y);
        if (cruiser) cruisers.push(cruiser);
        spawnTimer = 1.2;
      }
      // Extra cruisers drive off once the heat is gone.
      while (cruisers.length > wantCount) cruisers.pop();

      // Roadblocks at three stars and up: two parked cruisers across the road ahead.
      if (wanted >= POLICE.roadblockStars && roadblocks.length === 0 && playerCar) {
        const aheadX = player.x + Math.cos(playerCar.angle) * 520;
        const aheadY = player.y + Math.sin(playerCar.angle) * 520;
        const horizontal = Math.abs(Math.cos(playerCar.angle)) > Math.abs(Math.sin(playerCar.angle));
        for (let i = -1; i <= 1; i += 2) {
          roadblocks.push({
            x: aheadX + (horizontal ? 0 : i * 46),
            y: aheadY + (horizontal ? i * 46 : 0),
            angle: horizontal ? Math.PI / 2 : 0,
            health: 100, length: 46, width: 23,
          });
        }
      }
      if (wanted < POLICE.roadblockStars) roadblocks.length = 0;

      let nearestDist = Infinity;
      for (const cruiser of cruisers) {
        const dist = stepCruiser(cruiser, dt, player, playerCar);
        if (dist < nearestDist) nearestDist = dist;
        // Ramming the player: on foot it hurts, in a car it damages the car.
        const dx = player.x - cruiser.x;
        const dy = player.y - cruiser.y;
        const touch = Math.hypot(dx, dy);
        const radius = playerCar ? 34 : 30;
        if (touch < radius && Math.abs(cruiser.speed) > 40 && (cruiser.ramCooldown ?? 0) <= 0) {
          // One hard hit per cruiser every 1.6 s: a chase should wear the car
          // down, not shred it in a single straight.
          cruiser.ramCooldown = 1.6;
          if (playerCar) {
            events.rammed = (events.rammed || 0) + POLICE.ramDamage;
            cruiser.speed *= 0.4;
          } else {
            events.hurt = (events.hurt || 0) + POLICE.ramDamage * dt * 2;
          }
        }
      }

      // On foot, a cruiser sitting on the player fills the bust meter.
      if (!playerCar && cruisers.length > 0) {
        let touching = false;
        for (const cruiser of cruisers) {
          if (Math.hypot(player.x - cruiser.x, player.y - cruiser.y) < 46) touching = true;
        }
        if (touching) {
          bustMeter += dt;
          if (bustMeter >= POLICE.bustTime) {
            bustMeter = 0;
            events.busted = true;
          }
        } else {
          // The meter holds while cruisers circle: a bust is earned, not reset by
          // one pass that misses.
          bustMeter = Math.max(0, bustMeter - dt * 0.5);
        }
      } else {
        bustMeter = Math.max(0, bustMeter - dt * 0.5);
      }
      return nearestDist;
    },
  };
}
