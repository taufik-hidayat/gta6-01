// Raka, the player: on foot he walks, runs, punches and shoots; in a car he drives it with
// arcade physics — acceleration, braking, reverse, and a handbrake that breaks the rear
// loose into a drift, leaving skid marks. Crimes raise the wanted level; the level decays
// only once no cruiser can see him.

import { CAR, PLAYER, POLICE, WANTED_MAX } from './config.js';
import { CAR_KIND_SPORTS, CAR_KIND_TRUCK } from './traffic.js';

function clamp(value, low, high) {
  return Math.max(low, Math.min(high, value));
}

export function createPlayer(city, spawn) {
  const player = {
    x: spawn.x,
    y: spawn.y,
    angle: -Math.PI / 2,
    health: PLAYER.health,
    cash: 0,
    wanted: 0,
    wantedTimer: 0,
    ammo: PLAYER.magSize,
    reloading: 0,
    punchTimer: 0,
    shootTimer: 0,
    hurtFlash: 0,
    invulnerable: 0,
    inCar: null,
    lastDamageAt: -100,
    time: 0,
  };

  function addWanted(amount) {
    if (amount <= 0) return;
    player.wanted = Math.min(WANTED_MAX, player.wanted + amount);
    player.wantedTimer = 0;
  }

  function addCash(amount) {
    player.cash += amount;
  }

  function hurt(amount) {
    if (player.invulnerable > 0 || amount <= 0) return;
    player.health = Math.max(0, player.health - amount);
    player.hurtFlash = 0.35;
    player.invulnerable = 0.4;
    player.lastDamageAt = player.time;
  }

  function stepOnFoot(dt, input, ctx) {
    const axes = input.axes();
    const running = input.isRunning();
    const speed = running ? PLAYER.runSpeed : PLAYER.walkSpeed;
    let mx = axes.x;
    let my = axes.y;
    const len = Math.hypot(mx, my);
    if (len > 1) {
      mx /= len;
      my /= len;
    }
    const next = city.slide(player.x, player.y, player.x + mx * speed * dt, player.y + my * speed * dt, PLAYER.radius);
    player.x = next.x;
    player.y = next.y;
    if (len > 0.1) player.angle = Math.atan2(my, mx);

    // Punch: a short arc in front of the player.
    player.punchTimer -= dt;
    if (player.punchTimer <= 0 && ctx.punchPressed) {
      player.punchTimer = PLAYER.punchCooldown;
      ctx.audio.punch();
      const target = ctx.peds.nearest(player.x + Math.cos(player.angle) * 20, player.y + Math.sin(player.angle) * 20, PLAYER.punchRange);
      if (target) {
        ctx.peds.knockDown(target, 4);
        addWanted(1);
        ctx.peds.scare(player.x, player.y, 260);
      }
    }

    // Pistol: click to fire toward the mouse; the magazine reloads itself.
    player.shootTimer -= dt;
    if (player.reloading > 0) {
      player.reloading -= dt;
      if (player.reloading <= 0) player.ammo = PLAYER.magSize;
    } else if (ctx.shootPressed && player.shootTimer <= 0 && player.ammo > 0) {
      player.shootTimer = PLAYER.pistolCooldown;
      player.ammo -= 1;
      if (player.ammo === 0) player.reloading = PLAYER.reloadTime;
      const mouse = ctx.aimWorld;
      const aim = Math.atan2(mouse.y - player.y, mouse.x - player.x);
      player.angle = aim;
      ctx.bullets.push({
        x: player.x + Math.cos(aim) * 20,
        y: player.y + Math.sin(aim) * 20,
        vx: Math.cos(aim) * 900,
        vy: Math.sin(aim) * 900,
        life: 0.7,
      });
      ctx.audio.gunshot();
      ctx.addShake(0.12);
      ctx.peds.scare(player.x, player.y, 320);
      // A shot is a crime only when a cruiser is close enough to hear it.
      if (ctx.nearestPoliceDist < 550) addWanted(1);
      ctx.muzzle = { x: player.x + Math.cos(aim) * 24, y: player.y + Math.sin(aim) * 24, t: 0.06 };
    }
  }

  function stepDriving(dt, input, ctx) {
    const car = player.inCar;
    const axes = input.axes();
    const forwardX = Math.cos(car.angle);
    const forwardY = Math.sin(car.angle);
    const forwardSpeed = car.vx * forwardX + car.vy * forwardY;
    let lateralX = car.vx - forwardX * forwardSpeed;
    let lateralY = car.vy - forwardY * forwardSpeed;

    const topSpeed = car.kind === CAR_KIND_SPORTS ? CAR.sportsMaxSpeed : car.kind === CAR_KIND_TRUCK ? CAR.truckMaxSpeed : CAR.maxSpeed;
    const accel = car.kind === CAR_KIND_SPORTS ? CAR.sportsAccel : CAR.accel;
    let newForward = forwardSpeed;
    if (car.health <= 0) {
      // Wrecked: the engine is dead — rolling resistance alone brings it to a stop.
      newForward -= Math.sign(newForward) * Math.min(Math.abs(newForward), 70 * dt);
    } else if (axes.y < 0) newForward += accel * dt;
    else if (axes.y > 0) {
      if (forwardSpeed > 12) newForward -= CAR.brake * dt;
      else newForward = Math.max(-CAR.maxReverse, newForward - CAR.reverseAccel * dt);
    } else {
      // Rolling resistance.
      newForward -= Math.sign(newForward) * Math.min(Math.abs(newForward), 70 * dt);
    }
    newForward = clamp(newForward, -CAR.maxReverse, topSpeed);

    const handbrake = input.isRunning();
    // A stopped car can still turn its wheels: the authority never falls to zero, or a
    // car that overshoots a corner could never turn around again.
    const speedFactor = clamp(Math.abs(newForward) / 140, 0.25, 1);
    const turnAuthority = CAR.turnRate * (1 - Math.min(0.55, Math.abs(newForward) / topSpeed) * 0.55);
    car.angle += axes.x * turnAuthority * speedFactor * dt * (newForward >= 0 ? 1 : -1);

    const grip = handbrake ? CAR.driftGrip : CAR.grip;
    const decay = Math.exp(-grip * dt);
    lateralX *= decay;
    lateralY *= decay;
    const newForwardX = Math.cos(car.angle);
    const newForwardY = Math.sin(car.angle);
    car.vx = newForwardX * newForward + lateralX;
    car.vy = newForwardY * newForward + lateralY;
    car.speed = Math.hypot(car.vx, car.vy);

    const lateralSpeed = Math.hypot(lateralX, lateralY);
    car.drifting = handbrake && car.speed > 180 && lateralSpeed > 40;
    if (car.drifting || (lateralSpeed > 90 && car.speed > 220)) {
      ctx.addSkid(car.x - newForwardX * 16, car.y - newForwardY * 16, car.angle);
    }

    const intendedX = car.x + car.vx * dt;
    const intendedY = car.y + car.vy * dt;
    const next = city.slide(car.x, car.y, intendedX, intendedY, CAR.radius);
    const moved = Math.hypot(next.x - car.x, next.y - car.y);
    const wanted = Math.hypot(intendedX - car.x, intendedY - car.y);
    car.x = next.x;
    car.y = next.y;
    if (wanted > 4 && moved < wanted * 0.3 && car.speed > 140) {
      // Hard hit on a wall: bounce off, and damage only once per short window, so
      // grinding along a wall does not shred the car in a single second.
      const impact = car.speed / CAR.maxSpeed;
      car.vx *= -0.4;
      car.vy *= -0.4;
      if ((car.hitCooldown ?? 0) <= 0) {
        car.hitCooldown = 1.2;
        car.health -= Math.round(impact * 16);
        hurt(Math.round(impact * 10));
        ctx.audio.crash(impact);
        ctx.addShake(0.3 + impact * 0.4);
        ctx.addSparks(car.x, car.y, 10);
        if (car.health <= 0) {
          ctx.audio.explosion();
          ctx.addShake(0.9);
          ctx.addSparks(car.x, car.y, 30);
        }
      }
    }
    player.x = car.x;
    player.y = car.y;
    player.angle = car.angle;

    // Running a pedestrian over.
    for (const ped of ctx.peds.peds) {
      if (ped.down > 0) continue;
      if (Math.hypot(ped.x - car.x, ped.y - car.y) < 30 && car.speed > 40) {
        ctx.peds.knockDown(ped, 5);
        addWanted(1);
        ctx.audio.crash(0.4);
        ctx.addShake(0.25);
        ctx.peds.scare(car.x, car.y, 300);
      }
    }
  }

  function stepBullets(dt, ctx) {
    for (let i = ctx.bullets.length - 1; i >= 0; i -= 1) {
      const bullet = ctx.bullets[i];
      bullet.x += bullet.vx * dt;
      bullet.y += bullet.vy * dt;
      bullet.life -= dt;
      let dead = bullet.life <= 0 || city.isBlocked(bullet.x, bullet.y, 2);
      if (!dead) {
        for (const ped of ctx.peds.peds) {
          if (ped.down > 0) continue;
          if (Math.hypot(ped.x - bullet.x, ped.y - bullet.y) < 13) {
            ctx.peds.knockDown(ped, 5);
            addWanted(1);
            ctx.peds.scare(bullet.x, bullet.y, 300);
            dead = true;
            break;
          }
        }
      }
      if (!dead) {
        for (const cruiser of ctx.police.cruisers) {
          if (Math.hypot(cruiser.x - bullet.x, cruiser.y - bullet.y) < 24) {
            cruiser.health -= PLAYER.pistolDamage;
            addWanted(1);
            ctx.addSparks(bullet.x, bullet.y, 6);
            dead = true;
            break;
          }
        }
      }
      if (!dead) {
        for (const car of ctx.traffic.cars) {
          if (car === player.inCar) continue;
          if (Math.hypot(car.x - bullet.x, car.y - bullet.y) < 24) {
            car.health -= PLAYER.pistolDamage;
            ctx.addSparks(bullet.x, bullet.y, 6);
            dead = true;
            break;
          }
        }
      }
      if (dead) ctx.bullets.splice(i, 1);
    }
  }

  return {
    state: player,
    addWanted,
    addCash,
    hurt,
    /** `ctx` carries the world systems; `flags` carries this frame's one-shot inputs. */
    step(dt, input, ctx, flags) {
      player.time += dt;
      player.hurtFlash = Math.max(0, player.hurtFlash - dt);
      player.invulnerable = Math.max(0, player.invulnerable - dt);
      if (player.time - player.lastDamageAt > PLAYER.regenDelay && player.health > 0 && player.health < PLAYER.regenTo) {
        player.health = Math.min(PLAYER.regenTo, player.health + PLAYER.regenRate * dt);
      }
      ctx.punchPressed = flags.punch;
      ctx.shootPressed = flags.shoot;
      if (player.inCar) stepDriving(dt, input, ctx);
      else stepOnFoot(dt, input, ctx);
      stepBullets(dt, ctx);

      // Wanted decay: only when no cruiser is anywhere near.
      if (player.wanted > 0) {
        if (ctx.nearestPoliceDist > 650) {
          player.wantedTimer += dt;
          if (player.wantedTimer > POLICE.decayDelay + POLICE.decayEvery) {
            player.wanted -= 1;
            player.wantedTimer = POLICE.decayDelay;
          }
        } else {
          player.wantedTimer = 0;
        }
      }
    },
    enterCar(car) {
      player.inCar = car;
      car.driven = true;
      car.parked = false;
      car.vx = 0;
      car.vy = 0;
      car.speed = 0;
    },
    exitCar() {
      const car = player.inCar;
      if (!car) return;
      car.driven = false;
      car.parked = true;
      player.inCar = null;
      const sideX = Math.cos(car.angle + Math.PI / 2);
      const sideY = Math.sin(car.angle + Math.PI / 2);
      const spot = city.slide(car.x, car.y, car.x + sideX * 34, car.y + sideY * 34, PLAYER.radius);
      player.x = spot.x;
      player.y = spot.y;
      player.angle = car.angle;
    },
  };
}
