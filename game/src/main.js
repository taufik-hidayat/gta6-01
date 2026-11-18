// Boot and the one loop: the world is built once from a seed, then every frame reads the
// input, advances the simulation in fixed 1/60 s steps, and paints what is there. The game
// moves between six screens: title, play, paused, busted, wasted and story-done. Progress
// (cash, mission, position) is saved to localStorage, so a visit can continue where the
// last one stopped.
//
// ?seed=N fixes the city and the traffic. ?shot=start|chase|mission|heist (with &seed=N)
// stages that scene instead of running the loop, paints it twice and sets window.__shotReady.
import { BEST_KEY, DAY_LENGTH, SAVE_KEY, STEP } from './config.js';
import { createRandom } from './random.js';
import { createAudio } from './audio.js';
import { ACTION_CONFIRM, ACTION_INTERACT, ACTION_MUTE, ACTION_PAUSE, ACTION_PUNCH, ACTION_RETRY, createInput } from './input.js';
import { buildCity } from './city.js';
import { createTraffic } from './traffic.js';
import { createPedestrians } from './pedestrians.js';
import { createPolice } from './police.js';
import { createPlayer } from './player.js';
import { createMissions } from './missions.js';
import { createRenderer } from './render.js';
import { createHud } from './hud.js';
import { stageShot } from './shots.js';

const MAX_FRAME = 0.25;
const SAVE_EVERY = 20;

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : Math.floor(Math.random() * 4294967296);

const canvas = document.getElementById('game');
const status = document.getElementById('status');
const random = createRandom(seed);
const city = buildCity(random);
const audio = createAudio();
const input = createInput(canvas);
const renderer = createRenderer(canvas);
const hud = createHud(canvas);

const traffic = createTraffic(random, city);
const peds = createPedestrians(random, city);
const police = createPolice(random, city);
const player = createPlayer(city, { x: 1600, y: 900 });
const missions = createMissions(random, city);

const world = {
  time: 0,
  dayTime: 0.15,
  city,
  random,
  traffic,
  peds,
  police,
  player,
  missions,
  audio,
  input,
  particles: [],
  skids: [],
  bullets: [],
  muzzle: null,
  nearestPoliceDist: Infinity,
  camera: { x: 1600, y: 900, zoom: 1, shakeX: 0, shakeY: 0 },
  shake: 0,
  saveTimer: SAVE_EVERY,
  ctx: null,
};

function addShake(amount) {
  world.shake = Math.min(1, world.shake + amount);
}

function addSparks(x, y, count) {
  for (let i = 0; i < count; i += 1) {
    const angle = Math.random() * Math.PI * 2;
    const speed = 60 + Math.random() * 220;
    world.particles.push({
      kind: 'spark', x, y,
      vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed,
      life: 0.35, maxLife: 0.35, size: 2,
    });
  }
}

function addSkid(x, y, angle) {
  const backX = x - Math.cos(angle) * 14;
  const backY = y - Math.sin(angle) * 14;
  world.skids.push({ x1: backX, y1: backY, x2: x, y2: y, life: 9 });
  if (world.skids.length > 500) world.skids.splice(0, world.skids.length - 500);
}

function addSmoke(x, y) {
  world.particles.push({
    kind: 'smoke', x: x + (Math.random() - 0.5) * 10, y: y + (Math.random() - 0.5) * 10,
    vx: (Math.random() - 0.5) * 20, vy: -30 - Math.random() * 20,
    life: 1.2, maxLife: 1.2, size: 7,
  });
}

world.ctx = {
  city,
  traffic,
  peds,
  police,
  audio,
  bullets: world.bullets,
  particles: world.particles,
  skids: world.skids,
  player,
  addShake,
  addSparks,
  addSkid,
  addSmoke,
  get nearestPoliceDist() {
    return world.nearestPoliceDist;
  },
  aimWorld: { x: 1600, y: 900 },
  punchPressed: false,
  shootPressed: false,
};

function readSave() {
  try {
    const raw = window.localStorage.getItem(SAVE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function readBest() {
  try {
    const raw = window.localStorage.getItem(BEST_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function writeSave() {
  try {
    const state = player.state;
    window.localStorage.setItem(SAVE_KEY, JSON.stringify({
      cash: state.cash,
      missionIndex: missions.state.storyDone ? 3 : missions.state.index,
      storyDone: missions.state.storyDone,
      x: state.x,
      y: state.y,
      dayTime: world.dayTime,
    }));
    const best = readBest();
    if (!best || state.cash > best.cash) {
      window.localStorage.setItem(BEST_KEY, JSON.stringify({
        cash: state.cash,
        missions: missions.state.storyDone ? 3 : missions.state.index,
      }));
    }
  } catch {
    // Storage can be off (private windows): progress then lasts this visit only.
  }
}

function snapshot() {
  return {
    player: player.state,
    traffic,
    peds,
    police,
    missions,
    city,
    time: world.time,
    dayTime: world.dayTime,
    camera: world.camera,
    particles: world.particles,
    skids: world.skids,
    bullets: world.bullets,
    muzzle: world.muzzle,
    nearestPoliceDist: world.nearestPoliceDist,
    saveExists: readSave() !== null,
    best: readBest(),
  };
}

function carCollision(a, b) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const dist = Math.hypot(dx, dy);
  const min = 26;
  if (dist >= min || dist === 0) return;
  const push = (min - dist) / 2;
  const nx = dx / dist;
  const ny = dy / dist;
  a.x -= nx * push;
  a.y -= ny * push;
  b.x += nx * push;
  b.y += ny * push;
  const relSpeed = Math.abs((a.vx ?? 0) - (b.vx ?? 0)) + Math.abs((a.vy ?? 0) - (b.vy ?? 0));
  if (relSpeed > 120) {
    if (a === player.state.inCar || b === player.state.inCar) {
      const impact = relSpeed / 700;
      // One damage tick per short window: a long scrape is one crash, not sixty.
      if ((player.state.inCar.hitCooldown ?? 0) <= 0) {
        player.state.inCar.hitCooldown = 0.6;
        player.state.inCar.health -= Math.round(impact * 14);
        audio.crash(Math.min(0.8, impact));
        addShake(0.25 + impact * 0.3);
        addSparks((a.x + b.x) / 2, (a.y + b.y) / 2, 8);
      }
    }
    if (a.vx !== undefined) {
      a.vx *= 0.5;
      a.vy *= 0.5;
    }
    if (b.vx !== undefined) {
      b.vx *= 0.5;
      b.vy *= 0.5;
    }
  }
}

function advance(dt, scripted) {
  world.time += dt;
  world.dayTime = (world.dayTime + dt / DAY_LENGTH) % 1;
  const state = player.state;

  // Input: scripted axes for staged shots, the real keyboard and mouse otherwise.
  // One-shot presses are taken on every step, scripted or not: the title screen
  // runs on scripted axes, and if the presses were only read on the live branch
  // ENTER could never start the game.
  const actions = input.takeActions();
  // Accumulate: several fixed steps can run in one frame, and handleActions reads
  // the flags only after the loop.
  world.ctx.actions = (world.ctx.actions ?? 0) | actions;
  let axes;
  let flags;
  if (scripted) {
    axes = { x: scripted.x, y: scripted.y };
    flags = { punch: !!scripted.punch, shoot: !!scripted.shoot };
    world.ctx.aimWorld = { x: state.x + Math.cos(state.angle) * 100, y: state.y + Math.sin(state.angle) * 100 };
  } else {
    axes = input.axes();
    flags = { punch: !!(actions & ACTION_PUNCH), shoot: input.takeClick() };
    const mouse = input.mouse();
    const scale = VIEW_SCALE();
    world.ctx.aimWorld = {
      x: world.camera.x + (mouse.x - canvas.width / 2 / scale.x) / world.camera.zoom,
      y: world.camera.y + (mouse.y - canvas.height / 2 / scale.y) / world.camera.zoom,
    };
  }

  const events = {};
  world.nearestPoliceDist = police.step(dt, state.wanted, state, state.inCar, events);
  if (events.rammed && state.inCar) {
    state.inCar.health -= events.rammed;
    addShake(0.3);
    audio.crash(0.5);
  }
  if (events.hurt) player.hurt(events.hurt);
  if (events.busted) {
    world.screen = 'busted';
    state.cash = Math.floor(state.cash * 0.8);
    state.wanted = 0;
    police.reset();
    writeSave();
    return;
  }

  const playerInput = {
    axes: () => axes,
    isRunning: () => (scripted ? false : input.isRunning()),
    mouse: () => input.mouse(),
    takeClick: () => false,
    takeActions: () => 0,
  };
  player.step(dt, playerInput, world.ctx, flags);
  if (state.inCar && state.inCar.hitCooldown > 0) state.inCar.hitCooldown -= dt;
  traffic.step(dt);
  peds.step(dt);
  missions.step(dt, world.ctx);
  missions.collectEnvelopes(state, world.ctx);

  // Car-to-car contact: the player's car against traffic, cruisers and roadblocks.
  if (state.inCar) {
    for (const car of traffic.cars) {
      if (car === state.inCar || car.health <= 0 || car.driven) continue;
      carCollision(state.inCar, car);
    }
    for (const cruiser of police.cruisers) carCollision(state.inCar, cruiser);
    for (const block of police.roadblocks) carCollision(state.inCar, block);
    if (state.inCar.health <= 0) {
      addSmoke(state.inCar.x, state.inCar.y);
      if (Math.random() < 0.02) addSparks(state.inCar.x, state.inCar.y, 4);
    }
  }
  for (const cruiser of police.cruisers) {
    if (cruiser.health <= 0) {
      addSmoke(cruiser.x, cruiser.y);
      cruiser.speed *= 0.95;
      if (Math.random() < 0.3) cruiser.health = 0;
    }
  }

  // Particles, skid marks and the muzzle flash age out.
  for (let i = world.particles.length - 1; i >= 0; i -= 1) {
    const particle = world.particles[i];
    particle.x += particle.vx * dt;
    particle.y += particle.vy * dt;
    particle.life -= dt;
    if (particle.life <= 0) world.particles.splice(i, 1);
  }
  for (let i = world.skids.length - 1; i >= 0; i -= 1) {
    world.skids[i].life -= dt;
    if (world.skids[i].life <= 0) world.skids.splice(i, 1);
  }
  if (world.muzzle) {
    world.muzzle.t -= dt;
    if (world.muzzle.t <= 0) world.muzzle = null;
  }
  // The player's own muzzle flash is set by player.step through the context.
  if (world.ctx.muzzle) {
    world.muzzle = world.ctx.muzzle;
    world.ctx.muzzle = null;
  }

  // Camera: follow the player, pull back a little at speed, shake on impacts.
  const targetZoom = state.inCar ? Math.max(0.82, 1 - state.inCar.speed / 2600) : 1;
  world.camera.zoom += (targetZoom - world.camera.zoom) * Math.min(1, dt * 3);
  world.camera.x += (state.x - world.camera.x) * Math.min(1, dt * 5);
  world.camera.y += (state.y - world.camera.y) * Math.min(1, dt * 5);
  world.shake = Math.max(0, world.shake - dt * 1.8);
  world.camera.shakeX = (Math.random() - 0.5) * world.shake * 16;
  world.camera.shakeY = (Math.random() - 0.5) * world.shake * 16;

  // Sound follows the drive: engine by speed, sirens by the nearest cruiser.
  const speedRatio = state.inCar ? Math.min(1, state.inCar.speed / 660) : 0;
  const policeNear = world.nearestPoliceDist < 700 ? 1 - world.nearestPoliceDist / 700 : 0;
  audio.update(dt, speedRatio, policeNear, !!(state.inCar && state.inCar.drifting));

  if (state.health <= 0) {
    world.screen = 'wasted';
    state.cash = Math.floor(state.cash * 0.85);
    state.wanted = 0;
    police.reset();
    writeSave();
  }
}

// Staged shots drive the same simulation through this one entry point.
world.advance = advance;

function VIEW_SCALE() {
  return { x: canvas.width / 1280, y: canvas.height / 720 };
}

function runShot(name) {
  const scene = stageShot(name, world);
  let painted = 0;
  function paint() {
    renderer.drawWorld(snapshot());
    // The title scene is a clean cover: no HUD over the menu, like the real title screen.
    if (scene.screen === 'title') hud.drawTitle(snapshot());
    else hud.drawHud(snapshot());
    painted += 1;
    if (painted < 2) requestAnimationFrame(paint);
    else window.__shotReady = true;
  }
  requestAnimationFrame(paint);
}

function runGame() {
  let screen = 'title';
  let accumulator = 0;
  let last = performance.now();
  let storyShown = false;
  world.screen = 'title';

  function announce(message) {
    status.textContent = message;
  }

  function startStory() {
    const save = readSave();
    if (save && save.storyDone) {
      // A finished story resumes as free roam, not from mission one again.
      missions.state.storyDone = true;
      player.state.cash = save.cash;
      player.state.x = save.x;
      player.state.y = save.y;
      player.state.health = 100;
      world.dayTime = save.dayTime;
      world.camera.x = save.x;
      world.camera.y = save.y;
      screen = 'play';
      world.screen = 'play';
      announce('Bermain. Teluk Bayu milikmu.');
      return;
    }
    player.state.health = 100;
    missions.start(save && save.missionIndex > 0 && save.missionIndex < 3 ? save.missionIndex : 0, world.ctx);
    if (save) {
      player.state.cash = save.cash;
      player.state.x = save.x;
      player.state.y = save.y;
      world.dayTime = save.dayTime;
      world.camera.x = save.x;
      world.camera.y = save.y;
    }
    screen = 'play';
    world.screen = 'play';
    announce('Bermain. Ikuti penanda kuning di peta.');
  }

  function continueGame() {
    const save = readSave();
    if (!save) {
      startStory();
      return;
    }
    player.state.cash = save.cash;
    player.state.x = save.x;
    player.state.y = save.y;
    player.state.health = 100;
    world.dayTime = save.dayTime;
    world.camera.x = save.x;
    world.camera.y = save.y;
    if (save.storyDone) {
      missions.state.storyDone = true;
      screen = 'play';
      world.screen = 'play';
    } else {
      missions.start(save.missionIndex, world.ctx);
      screen = 'play';
      world.screen = 'play';
    }
    announce('Lanjutan dimuat. Selamat datang kembali di Teluk Bayu.');
  }

  function respawnAt(x, y) {
    const state = player.state;
    state.health = 100;
    state.x = x;
    state.y = y;
    state.wanted = 0;
    if (state.inCar) {
      state.inCar.parked = true;
      state.inCar.driven = false;
      state.inCar = null;
    }
    world.camera.x = x;
    world.camera.y = y;
    screen = 'play';
    world.screen = 'play';
  }

  function handleActions() {
    const actions = world.ctx.actions ?? 0;
    world.ctx.actions = 0;
    if (actions & ACTION_MUTE) {
      audio.setMuted(!audio.isMuted());
    }
    if (screen === 'title') {
      if (actions & ACTION_CONFIRM) {
        audio.unlock();
        audio.click();
        // ENTER resumes a saved visit (cash, mission, position) or starts the story.
        if (readSave()) continueGame();
        else startStory();
      }
      return;
    }
    if (screen === 'play') {
      if (actions & ACTION_PAUSE) {
        screen = 'paused';
        world.screen = 'paused';
        announce('Jeda.');
      } else if (actions & ACTION_INTERACT) {
        const state = player.state;
        if (state.inCar) {
          player.exitCar();
          audio.click();
        } else {
          const car = traffic.nearestCar(state.x, state.y, 64);
          if (car) {
            if (car.driver) {
              car.driver = false;
              peds.scare(car.x, car.y, 200);
              if (world.nearestPoliceDist < 600) player.addWanted(1);
            }
            player.enterCar(car);
            audio.click();
          }
        }
      } else if (actions & ACTION_RETRY && missions.state.failed) {
        missions.retry(world.ctx);
        announce('Babak diulang.');
      }
      if (missions.state.phase === 'done' && !missions.state.storyDone && (actions & ACTION_CONFIRM)) {
        missions.advanceIfDone(world.ctx);
      }
      return;
    }
    if (screen === 'paused') {
      if (actions & (ACTION_PAUSE | ACTION_CONFIRM)) {
        screen = 'play';
        world.screen = 'play';
        announce('Bermain.');
      }
      return;
    }
    if (screen === 'busted' || screen === 'wasted') {
      if (actions & ACTION_CONFIRM) {
        if (screen === 'busted') respawnAt(1600, 620);
        else respawnAt(620, 1560);
        announce('Bermain.');
      }
      return;
    }
    if (screen === 'storydone' && (actions & ACTION_CONFIRM)) {
      screen = 'play';
      world.screen = 'play';
    }
  }

  function frame(now) {
    requestAnimationFrame(frame);
    accumulator += Math.min((now - last) / 1000, MAX_FRAME);
    last = now;
    if (screen === 'play' || screen === 'title') {
      while (accumulator >= STEP) {
        advance(STEP, screen === 'title' ? { x: 0, y: 0, punch: false, shoot: false } : null);
        accumulator -= STEP;
        if (world.screen === 'busted' || world.screen === 'wasted') {
          screen = world.screen;
          accumulator = 0;
          break;
        }
      }
      handleActions();
      if (missions.state.storyDone && !storyShown && screen === 'play') {
        storyShown = true;
        screen = 'storydone';
        world.screen = 'storydone';
        writeSave();
      }
      world.saveTimer -= 1 / 60;
      if (world.saveTimer <= 0 && screen === 'play') {
        world.saveTimer = SAVE_EVERY;
        writeSave();
      }
    } else {
      // Paused, busted, wasted, story done: advance() never runs here, so the
      // one-shot presses would never be read and P could never resume the game.
      world.ctx.actions = (world.ctx.actions ?? 0) | input.takeActions();
      handleActions();
      accumulator = 0;
    }
    const snap = snapshot();
    renderer.drawWorld(snap);
    if (screen === 'play' || screen === 'paused' || screen === 'busted' || screen === 'wasted' || screen === 'storydone') {
      hud.drawHud(snap);
    }
    if (screen === 'title') hud.drawTitle(snap);
    else if (screen === 'paused') hud.drawPaused();
    else if (screen === 'busted') hud.drawOver('busted', snap);
    else if (screen === 'wasted') hud.drawOver('wasted', snap);
    else if (screen === 'storydone') hud.drawStoryDone(snap);
  }

  document.addEventListener('visibilitychange', () => {
    if (document.hidden && screen === 'play') {
      screen = 'paused';
      world.screen = 'paused';
      announce('Jeda.');
    }
  });
  window.addEventListener('keydown', () => audio.unlock(), { once: true });
  window.addEventListener('pointerdown', () => audio.unlock(), { once: true });

  announce('Teluk Bayu. Tekan Enter untuk mulai.');
  requestAnimationFrame(frame);
}

// For play-testing from a script: the live world, its screen and its helpers.
window.__game = world;
window.__advance = advance;

if (shot) runShot(shot);
else runGame();
