// Drawing only: the city, its people and its cars, and the light that falls on them. The
// camera's view is 1280x720 logical pixels scaled to the window; everything outside the
// view is culled before it is drawn. Night is a dark overlay with pools of light punched
// through it — headlights, street lamps and the player's own glow.

import { CITY, PALETTE, VIEW, WORLD } from './config.js';
import { isOnRoad } from './city.js';

const TWO_PI = Math.PI * 2;

function roundedRect(context, x, y, w, h, r) {
  context.beginPath();
  context.moveTo(x + r, y);
  context.arcTo(x + w, y, x + w, y + h, r);
  context.arcTo(x + w, y + h, x, y + h, r);
  context.arcTo(x, y + h, x, y, r);
  context.arcTo(x, y, x + w, y, r);
  context.closePath();
}

export function createRenderer(canvas) {
  const context = canvas.getContext('2d');
  const view = { scale: 1, x: 0, y: 0 };
  const lightCanvas = document.createElement('canvas');
  const lightContext = lightCanvas.getContext('2d');

  function resize() {
    const ratio = window.devicePixelRatio || 1;
    const width = Math.round(window.innerWidth * ratio);
    const height = Math.round(window.innerHeight * ratio);
    canvas.width = width;
    canvas.height = height;
    lightCanvas.width = width;
    lightCanvas.height = height;
    view.scale = Math.min(width / VIEW.width, height / VIEW.height);
    view.x = (width - VIEW.width * view.scale) / 2;
    view.y = (height - VIEW.height * view.scale) / 2;
  }

  /** Sun position 0..1 across the day; returns { darkness, tint }. */
  function daylight(dayTime) {
    // 0 = dawn, 0.25 = noon, 0.5 = dusk, 0.75 = midnight.
    const sun = Math.sin(dayTime * TWO_PI);
    const darkness = Math.max(0, Math.min(0.62, 0.62 - (sun + 0.25) * 0.9));
    const duskness = Math.max(0, 1 - Math.abs(dayTime - 0.5) * 6);
    return { darkness, tint: duskness > 0 ? `rgba(255, 120, 40, ${duskness * 0.12})` : null };
  }

  function drawGround(camera) {
    const left = camera.x - VIEW.width / 2 / camera.zoom - 40;
    const top = camera.y - VIEW.height / 2 / camera.zoom - 40;
    const right = camera.x + VIEW.width / 2 / camera.zoom + 40;
    const bottom = camera.y + VIEW.height / 2 / camera.zoom + 40;
    context.fillStyle = PALETTE.grass;
    context.fillRect(left, top, right - left, bottom - top);

    // Roads: asphalt bands with edge lines.
    context.fillStyle = PALETTE.road;
    for (const avenue of CITY.avenues) {
      context.fillRect(avenue - CITY.avenueWidth / 2, 0, CITY.avenueWidth, CITY.sandTop);
    }
    for (const street of CITY.streets) {
      context.fillRect(0, street - CITY.streetWidth / 2, WORLD.width, CITY.streetWidth);
    }
    // Centre dashes.
    context.fillStyle = PALETTE.laneDash;
    for (const avenue of CITY.avenues) {
      for (let y = 40; y < CITY.sandTop; y += 64) {
        if (isOnRoad(avenue, y)) continue;
        context.fillRect(avenue - 2, y, 4, 30);
      }
    }
    for (const street of CITY.streets) {
      for (let x = 40; x < WORLD.width; x += 64) {
        if (isOnRoad(x, street)) continue;
        context.fillRect(x, street - 2, 30, 4);
      }
    }
    // Crosswalks at every intersection.
    context.fillStyle = PALETTE.crosswalk;
    for (const avenue of CITY.avenues) {
      for (const street of CITY.streets) {
        for (let i = -3; i <= 3; i += 1) {
          context.fillRect(avenue - 52 + i * 15, street - CITY.streetWidth / 2 + 6, 8, 18);
          context.fillRect(avenue - 52 + i * 15, street + CITY.streetWidth / 2 - 24, 8, 18);
        }
      }
    }
    // Beach and sea.
    context.fillStyle = PALETTE.sand;
    context.fillRect(0, CITY.sandTop, WORLD.width, CITY.waterTop - CITY.sandTop);
    context.fillStyle = PALETTE.water;
    context.fillRect(0, CITY.waterTop, WORLD.width, WORLD.height - CITY.waterTop);
    context.fillStyle = PALETTE.waterDeep;
    for (let x = 0; x < WORLD.width; x += 90) {
      context.fillRect(x + ((camera.x * 0.2) % 90), CITY.waterTop + 26, 46, 3);
      context.fillRect(x + 40 + ((camera.x * 0.13) % 90), CITY.waterTop + 62, 52, 3);
    }
  }

  function drawBuildings(camera, city) {
    const left = camera.x - VIEW.width / 2 / camera.zoom - 80;
    const top = camera.y - VIEW.height / 2 / camera.zoom - 80;
    const right = camera.x + VIEW.width / 2 / camera.zoom + 80;
    const bottom = camera.y + VIEW.height / 2 / camera.zoom + 80;
    for (const building of city.buildings) {
      if (building.x + building.w < left || building.x > right || building.y + building.h < top || building.y > bottom) continue;
      context.fillStyle = 'rgba(0, 0, 0, 0.35)';
      context.fillRect(building.x + 7, building.y + 9, building.w, building.h);
      context.fillStyle = building.roof;
      context.fillRect(building.x, building.y, building.w, building.h);
      context.fillStyle = 'rgba(255, 255, 255, 0.10)';
      context.fillRect(building.x + 8, building.y + 8, building.w - 16, 10);
      context.fillStyle = 'rgba(0, 0, 0, 0.25)';
      context.fillRect(building.x + building.w * 0.2, building.y + building.h * 0.3, building.w * 0.24, building.h * 0.28);
      context.fillRect(building.x + building.w * 0.62, building.y + building.h * 0.55, building.w * 0.18, building.h * 0.22);
      if (building.landmark) {
        context.font = '600 13px system-ui, sans-serif';
        context.textAlign = 'center';
        context.textBaseline = 'middle';
        context.fillStyle = 'rgba(242, 244, 248, 0.85)';
        context.fillText(building.name, building.x + building.w / 2, building.y + building.h / 2);
      }
    }
    // Park.
    context.fillStyle = PALETTE.park;
    context.fillRect(1060, 855, 480, 340);
    for (const tree of city.trees) {
      if (tree.x < left || tree.x > right || tree.y < top || tree.y > bottom) continue;
      context.fillStyle = 'rgba(0, 0, 0, 0.3)';
      context.beginPath();
      context.arc(tree.x + 4, tree.y + 5, tree.r, 0, TWO_PI);
      context.fill();
      context.fillStyle = PALETTE.tree;
      context.beginPath();
      context.arc(tree.x, tree.y, tree.r, 0, TWO_PI);
      context.fill();
      context.fillStyle = PALETTE.treeDark;
      context.beginPath();
      context.arc(tree.x - tree.r * 0.3, tree.y - tree.r * 0.3, tree.r * 0.55, 0, TWO_PI);
      context.fill();
    }
  }

  function drawSkids(skids, camera) {
    context.lineCap = 'round';
    for (const skid of skids) {
      const alpha = Math.min(0.5, skid.life * 0.08);
      context.strokeStyle = `rgba(10, 10, 12, ${alpha})`;
      context.lineWidth = 5;
      context.beginPath();
      context.moveTo(skid.x1, skid.y1);
      context.lineTo(skid.x2, skid.y2);
      context.stroke();
    }
  }

  function drawCarShape(car, isPolice, time) {
    context.save();
    context.translate(car.x, car.y);
    context.rotate(car.angle);
    const halfL = car.length / 2;
    const halfW = car.width / 2;
    context.fillStyle = 'rgba(0, 0, 0, 0.35)';
    roundedRect(context, -halfL + 4, -halfW + 5, car.length, car.width, 8);
    context.fill();
    context.fillStyle = isPolice ? PALETTE.police : car.color;
    roundedRect(context, -halfL, -halfW, car.length, car.width, 8);
    context.fill();
    if (isPolice) {
      context.fillStyle = PALETTE.policeDark;
      roundedRect(context, -halfL + 4, -halfW + 3, car.length - 8, 7, 3);
      context.fill();
      roundedRect(context, -halfL + 4, halfW - 10, car.length - 8, 7, 3);
      context.fill();
    }
    // Windshield and rear window.
    context.fillStyle = '#10151f';
    roundedRect(context, halfL - 16, -halfW + 4, 10, car.width - 8, 3);
    context.fill();
    roundedRect(context, -halfL + 5, -halfW + 4, 8, car.width - 8, 3);
    context.fill();
    // Roof.
    context.fillStyle = 'rgba(255, 255, 255, 0.14)';
    roundedRect(context, -halfL + 16, -halfW + 5, car.length - 34, car.width - 10, 5);
    context.fill();
    if (car.kind === 1) {
      context.fillStyle = '#f2c94c';
      context.fillRect(-6, -halfW - 2, 12, 5);
    }
    // Headlights and brake lights.
    context.fillStyle = '#ffe9a8';
    context.fillRect(halfL - 2, -halfW + 3, 3, 5);
    context.fillRect(halfL - 2, halfW - 8, 3, 5);
    context.fillStyle = car.brakeLight ? '#ff2f24' : '#a33';
    context.fillRect(-halfL - 1, -halfW + 3, 3, 5);
    context.fillRect(-halfL - 1, halfW - 8, 3, 5);
    if (isPolice) {
      const phase = Math.floor(time * 6) % 2 === 0;
      context.fillStyle = phase ? '#ff2f3f' : '#2f7bff';
      context.fillRect(-4, -halfW - 3, 8, 6);
      context.fillStyle = phase ? '#2f7bff' : '#ff2f3f';
      context.fillRect(-4, halfW - 3, 8, 6);
    }
    if (car.health < 45 && car.health > 0) {
      context.fillStyle = 'rgba(20, 20, 20, 0.85)';
      context.beginPath();
      context.arc(-halfL + 8, 0, 6, 0, TWO_PI);
      context.fill();
    }
    context.restore();
  }

  function drawPedestrian(ped, time) {
    if (ped.down > 0) {
      context.fillStyle = ped.shirt;
      context.beginPath();
      context.ellipse(ped.x, ped.y, 14, 8, ped.angle, 0, TWO_PI);
      context.fill();
      return;
    }
    const bob = Math.sin(ped.bob) * 2;
    context.fillStyle = 'rgba(0, 0, 0, 0.3)';
    context.beginPath();
    context.ellipse(ped.x + 2, ped.y + 3, 9, 6, 0, 0, TWO_PI);
    context.fill();
    context.fillStyle = ped.shirt;
    context.beginPath();
    context.arc(ped.x, ped.y + bob * 0.3, 9, 0, TWO_PI);
    context.fill();
    context.fillStyle = '#e8b98a';
    context.beginPath();
    context.arc(ped.x + Math.cos(ped.angle) * 3, ped.y + Math.sin(ped.angle) * 3 + bob * 0.3, 5, 0, TWO_PI);
    context.fill();
    if (ped.scared > 0) {
      context.font = '700 16px system-ui, sans-serif';
      context.textAlign = 'center';
      context.fillStyle = '#ffd23d';
      context.fillText('!', ped.x, ped.y - 20);
    }
  }

  function drawPlayerOnFoot(player, time) {
    context.fillStyle = 'rgba(0, 0, 0, 0.35)';
    context.beginPath();
    context.ellipse(player.x + 2, player.y + 4, 11, 7, 0, 0, TWO_PI);
    context.fill();
    context.fillStyle = PALETTE.playerJacket;
    context.beginPath();
    context.arc(player.x, player.y, 11, 0, TWO_PI);
    context.fill();
    context.fillStyle = PALETTE.player;
    context.beginPath();
    context.arc(player.x + Math.cos(player.angle) * 4, player.y + Math.sin(player.angle) * 4, 6, 0, TWO_PI);
    context.fill();
    // Facing tick.
    context.strokeStyle = '#fff';
    context.lineWidth = 2;
    context.beginPath();
    context.moveTo(player.x + Math.cos(player.angle) * 11, player.y + Math.sin(player.angle) * 11);
    context.lineTo(player.x + Math.cos(player.angle) * 18, player.y + Math.sin(player.angle) * 18);
    context.stroke();
    if (player.invulnerable > 0 && Math.floor(time * 12) % 2 === 0) {
      context.strokeStyle = 'rgba(255, 255, 255, 0.7)';
      context.lineWidth = 2;
      context.beginPath();
      context.arc(player.x, player.y, 17, 0, TWO_PI);
      context.stroke();
    }
  }

  function drawParticles(particles) {
    for (const particle of particles) {
      const alpha = Math.max(0, particle.life / particle.maxLife);
      if (particle.kind === 'smoke') {
        context.fillStyle = `rgba(90, 90, 95, ${alpha * 0.5})`;
        context.beginPath();
        context.arc(particle.x, particle.y, particle.size * (1.6 - alpha * 0.6), 0, TWO_PI);
        context.fill();
      } else if (particle.kind === 'spark') {
        context.fillStyle = `rgba(255, 205, 80, ${alpha})`;
        context.fillRect(particle.x - 2, particle.y - 2, 4, 4);
      } else {
        context.fillStyle = `rgba(200, 200, 210, ${alpha * 0.6})`;
        context.beginPath();
        context.arc(particle.x, particle.y, particle.size, 0, TWO_PI);
        context.fill();
      }
    }
  }

  function drawBullets(bullets) {
    context.fillStyle = '#ffe9a8';
    for (const bullet of bullets) {
      context.fillRect(bullet.x - 3, bullet.y - 1, 6, 2);
    }
  }

  function drawLighting(camera, day, snapshot) {
    const { darkness } = day;
    if (darkness <= 0.02) return;
    const screenW = canvas.width;
    const screenH = canvas.height;
    lightContext.setTransform(1, 0, 0, 1, 0, 0);
    lightContext.clearRect(0, 0, screenW, screenH);
    lightContext.fillStyle = `rgba(6, 10, 26, ${darkness})`;
    lightContext.fillRect(0, 0, screenW, screenH);
    // Punch light pools through the dark with destination-out.
    lightContext.globalCompositeOperation = 'destination-out';
    const toScreen = (wx, wy) => [
      (wx - camera.x) * view.scale * camera.zoom + screenW / 2,
      (wy - camera.y) * view.scale * camera.zoom + screenH / 2,
    ];
    function pool(x, y, radius, strength) {
      const [sx, sy] = toScreen(x, y);
      const gradient = lightContext.createRadialGradient(sx, sy, 4, sx, sy, radius);
      gradient.addColorStop(0, `rgba(0, 0, 0, ${strength})`);
      gradient.addColorStop(1, 'rgba(0, 0, 0, 0)');
      lightContext.fillStyle = gradient;
      lightContext.beginPath();
      lightContext.arc(sx, sy, radius, 0, TWO_PI);
      lightContext.fill();
    }
    const player = snapshot.player;
    pool(player.x, player.y, 260 * view.scale * camera.zoom, 0.9);
    if (player.inCar) {
      const car = player.inCar;
      const hx = car.x + Math.cos(car.angle) * 70;
      const hy = car.y + Math.sin(car.angle) * 70;
      pool(hx, hy, 190 * view.scale * camera.zoom, 0.75);
    }
    for (const cruiser of snapshot.police.cruisers) {
      pool(cruiser.x, cruiser.y, 150 * view.scale * camera.zoom, 0.5);
    }
    // Street lamps at intersections.
    for (const avenue of CITY.avenues) {
      for (const street of CITY.streets) {
        if (Math.abs(avenue - camera.x) > 900 || Math.abs(street - camera.y) > 700) continue;
        pool(avenue - 64, street - 58, 130 * view.scale * camera.zoom, 0.55);
      }
    }
    lightContext.globalCompositeOperation = 'source-over';
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.drawImage(lightCanvas, 0, 0);
  }

  return {
    resize,
    /** Paint one frame of the world (no HUD, no screens — hud.js owns those). */
    drawWorld(snapshot) {
      const camera = snapshot.camera;
      const scale = view.scale * camera.zoom;
      resize();
      context.setTransform(1, 0, 0, 1, 0, 0);
      context.fillStyle = PALETTE.backdrop;
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.setTransform(scale, 0, 0, scale, canvas.width / 2 - camera.x * scale + camera.shakeX, canvas.height / 2 - camera.y * scale + camera.shakeY);
      drawGround(camera);
      drawBuildings(camera, snapshot.city);
      drawSkids(snapshot.skids, camera);
      // Mission envelopes.
      for (const envelope of snapshot.missions.state.envelopes) {
        if (envelope.taken) continue;
        const pulse = 1 + Math.sin(snapshot.time * 4) * 0.15;
        context.fillStyle = '#37d67a';
        context.save();
        context.translate(envelope.x, envelope.y);
        context.scale(pulse, pulse);
        context.fillRect(-8, -5, 16, 10);
        context.fillStyle = '#0b0e14';
        context.fillRect(-8, -1, 16, 2);
        context.restore();
      }
      // Mission marker: a pulsing ring where the player must go.
      const objective = snapshot.missions.currentObjective();
      if (objective && snapshot.missions.state.phase === 'active') {
        const pulse = 1 + Math.sin(snapshot.time * 5) * 0.25;
        context.strokeStyle = 'rgba(255, 210, 61, 0.9)';
        context.lineWidth = 4;
        context.beginPath();
        context.arc(objective.x, objective.y, 34 * pulse, 0, TWO_PI);
        context.stroke();
        context.fillStyle = 'rgba(255, 210, 61, 0.25)';
        context.beginPath();
        context.arc(objective.x, objective.y, 30 * pulse, 0, TWO_PI);
        context.fill();
      }
      for (const ped of snapshot.peds.peds) drawPedestrian(ped, snapshot.time);
      for (const car of snapshot.traffic.cars) {
        if (car === snapshot.player.inCar || car.health <= 0) continue;
        if (Math.abs(car.x - camera.x) > 900 || Math.abs(car.y - camera.y) > 700) continue;
        drawCarShape(car, false, snapshot.time);
      }
      // Wrecks (dead cars) stay on the street, blackened.
      for (const car of snapshot.traffic.cars) {
        if (car.health > 0) continue;
        context.save();
        context.translate(car.x, car.y);
        context.rotate(car.angle);
        context.fillStyle = '#17191d';
        roundedRect(context, -car.length / 2, -car.width / 2, car.length, car.width, 8);
        context.fill();
        context.restore();
      }
      for (const cruiser of snapshot.police.cruisers) drawCarShape(cruiser, true, snapshot.time);
      for (const block of snapshot.police.roadblocks) drawCarShape(block, true, snapshot.time);
      if (snapshot.player.inCar) drawCarShape(snapshot.player.inCar, false, snapshot.time);
      else drawPlayerOnFoot(snapshot.player, snapshot.time);
      drawParticles(snapshot.particles);
      drawBullets(snapshot.bullets);
      if (snapshot.muzzle && snapshot.muzzle.t > 0) {
        context.fillStyle = 'rgba(255, 230, 150, 0.9)';
        context.beginPath();
        context.arc(snapshot.muzzle.x, snapshot.muzzle.y, 10, 0, TWO_PI);
        context.fill();
      }
      const day = daylight(snapshot.dayTime);
      if (day.tint) {
        context.fillStyle = day.tint;
        context.fillRect(camera.x - VIEW.width, camera.y - VIEW.height, VIEW.width * 2, VIEW.height * 2);
      }
      drawLighting(camera, day, snapshot);
      // Damage flash: a red vignette while hurt.
      if (snapshot.player.hurtFlash > 0) {
        context.setTransform(1, 0, 0, 1, 0, 0);
        const gradient = context.createRadialGradient(
          canvas.width / 2, canvas.height / 2, Math.min(canvas.width, canvas.height) * 0.35,
          canvas.width / 2, canvas.height / 2, Math.max(canvas.width, canvas.height) * 0.7,
        );
        gradient.addColorStop(0, 'rgba(255, 40, 30, 0)');
        gradient.addColorStop(1, `rgba(255, 40, 30, ${snapshot.player.hurtFlash * 0.9})`);
        context.fillStyle = gradient;
        context.fillRect(0, 0, canvas.width, canvas.height);
      }
    },
  };
}
