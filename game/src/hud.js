// The HUD and the screens, drawn on the same canvas after the world: cash and health,
// the wanted stars, the mission banner and objective, the speedometer, the minimap with
// its blips, and the title, pause, busted and wasted panels. Text is rebuilt only when
// its value changes, so a frame allocates nothing.

import { CITY, PALETTE, PLACES, VIEW, WORLD } from './config.js';

const TWO_PI = Math.PI * 2;

function starPath(context, x, y, radius) {
  context.beginPath();
  for (let i = 0; i < 10; i += 1) {
    const angle = -Math.PI / 2 + (i * Math.PI) / 5;
    const r = i % 2 === 0 ? radius : radius * 0.45;
    const px = x + Math.cos(angle) * r;
    const py = y + Math.sin(angle) * r;
    if (i === 0) context.moveTo(px, py);
    else context.lineTo(px, py);
  }
  context.closePath();
}

export function createHud(canvas) {
  const context = canvas.getContext('2d');
  let lastCash = -1;
  let cashText = '';
  let lastHealth = -1;
  let lastAmmo = -1;
  let lastSpeed = -1;
  let speedText = '';

  function text(value, x, y, size, color, align, weight) {
    context.font = `${weight ?? 600} ${size}px system-ui, sans-serif`;
    context.fillStyle = color;
    context.textAlign = align;
    context.textBaseline = 'alphabetic';
    context.fillText(value, x, y);
  }

  function bar(x, y, w, h, fraction, color) {
    context.fillStyle = 'rgba(0, 0, 0, 0.55)';
    context.fillRect(x - 1, y - 1, w + 2, h + 2);
    context.fillStyle = '#222';
    context.fillRect(x, y, w, h);
    context.fillStyle = color;
    context.fillRect(x, y, w * Math.max(0, Math.min(1, fraction)), h);
  }

  function drawStars(player, policeNear, time) {
    const cx = VIEW.width - 30;
    const cy = 34;
    const pulse = policeNear ? 1 + Math.sin(time * 9) * 0.18 : 1;
    for (let i = 0; i < 5; i += 1) {
      const x = cx - i * 34;
      context.save();
      context.translate(x, cy);
      context.scale(pulse, pulse);
      starPath(context, 0, 0, 13);
      context.fillStyle = i < player.wanted ? PALETTE.gold : 'rgba(255, 255, 255, 0.16)';
      context.fill();
      context.strokeStyle = 'rgba(0, 0, 0, 0.6)';
      context.lineWidth = 2;
      context.stroke();
      context.restore();
    }
  }

  function drawMinimap(snapshot) {
    const mw = 230;
    const mh = 172;
    const mx = 18;
    const my = VIEW.height - mh - 18;
    const sx = mw / WORLD.width;
    const sy = mh / WORLD.height;
    context.fillStyle = 'rgba(8, 12, 20, 0.82)';
    context.fillRect(mx - 4, my - 4, mw + 8, mh + 8);
    context.strokeStyle = PALETTE.panelEdge;
    context.lineWidth = 2;
    context.strokeRect(mx - 4, my - 4, mw + 8, mh + 8);
    // Water and roads.
    context.fillStyle = '#14425e';
    context.fillRect(mx, my + CITY.waterTop * sy, mw, (WORLD.height - CITY.waterTop) * sy);
    context.fillStyle = '#3a4152';
    for (const avenue of CITY.avenues) context.fillRect(mx + (avenue - 60) * sx, my, 120 * sx, mh);
    for (const street of CITY.streets) context.fillRect(mx, my + (street - 55) * sy, mw, 110 * sy);
    // Buildings.
    context.fillStyle = '#565e73';
    for (const building of snapshot.city.buildings) {
      context.fillRect(mx + building.x * sx, my + building.y * sy, Math.max(1.5, building.w * sx), Math.max(1.5, building.h * sy));
    }
    const blip = (x, y, color, radius) => {
      context.fillStyle = color;
      context.beginPath();
      context.arc(mx + x * sx, my + y * sy, radius, 0, TWO_PI);
      context.fill();
    };
    for (const envelope of snapshot.missions.state.envelopes) {
      if (!envelope.taken) blip(envelope.x, envelope.y, '#37d67a', 2.5);
    }
    const objective = snapshot.missions.currentObjective();
    if (objective && snapshot.missions.state.phase === 'active') {
      const pulse = 3.5 + Math.sin(snapshot.time * 5) * 1.5;
      blip(objective.x, objective.y, PALETTE.mission, pulse);
    }
    for (const cruiser of snapshot.police.cruisers) blip(cruiser.x, cruiser.y, '#4fc3f7', 3.5);
    // Player arrow.
    const px = mx + snapshot.player.x * sx;
    const py = my + snapshot.player.y * sy;
    context.save();
    context.translate(px, py);
    context.rotate(snapshot.player.angle);
    context.fillStyle = '#fff';
    context.beginPath();
    context.moveTo(8, 0);
    context.lineTo(-6, -5);
    context.lineTo(-6, 5);
    context.closePath();
    context.fill();
    context.restore();
    // North label.
    text('N', mx + mw - 8, my + 14, 12, PALETTE.muted, 'right');
  }

  function drawHud(snapshot) {
    const player = snapshot.player;
    const scaleX = canvas.width / VIEW.width;
    const scaleY = canvas.height / VIEW.height;
    context.setTransform(scaleX, 0, 0, scaleY, 0, 0);
    context.textBaseline = 'alphabetic';

    if (player.cash !== lastCash) {
      lastCash = player.cash;
      cashText = `$${player.cash.toLocaleString('en-US')}`;
    }
    text(cashText, 20, 40, 30, PALETTE.gold, 'left', 800);
    const healthColor = player.health > 50 ? '#37d67a' : player.health > 25 ? '#f2c94c' : '#ff5a4e';
    bar(20, 50, 180, 12, player.health / 100, healthColor);
    text('NYAWA', 206, 62, 12, PALETTE.muted, 'left', 700);
    if (!player.inCar) {
      if (player.ammo !== lastAmmo) {
        lastAmmo = player.ammo;
      }
      text(player.reloading > 0 ? 'ISI ULANG…' : `PELURU ${player.ammo}`, 20, 84, 15, PALETTE.text, 'left', 700);
    }

    drawStars(player, snapshot.nearestPoliceDist < 600 && player.wanted > 0, snapshot.time);

    // Time of day.
    const hours = 6 + snapshot.dayTime * 24;
    const hh = Math.floor(hours) % 24;
    const mm = Math.floor((hours % 1) * 60);
    const clock = `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
    const icon = snapshot.dayTime > 0.55 && snapshot.dayTime < 0.95 ? '☾' : '☀';
    text(`${icon} ${clock}`, VIEW.width - 30, 76, 16, PALETTE.text, 'right', 700);

    // Mission objective.
    const mission = snapshot.missions.current();
    const objective = snapshot.missions.currentObjective();
    if (objective && snapshot.missions.state.phase === 'active') {
      const dist = Math.round(Math.hypot(objective.x - player.x, objective.y - player.y));
      context.fillStyle = 'rgba(8, 12, 20, 0.66)';
      const label = `${mission.title} · ${objective.text} — ${dist}m`;
      context.font = '700 17px system-ui, sans-serif';
      const w = context.measureText(label).width + 28;
      context.fillRect((VIEW.width - w) / 2, 14, w, 34);
      text(label, VIEW.width / 2, 38, 17, '#fff', 'center', 700);
      if (snapshot.missions.state.timeLeft > 0) {
        text(`${Math.ceil(snapshot.missions.state.timeLeft)} dtk`, VIEW.width / 2, 66, 16, '#ff8a7a', 'center', 800);
      }
    } else if (snapshot.missions.state.storyDone) {
      text('CERITA SELESAI — Teluk Bayu milikmu. Jelajahi sesukamu!', VIEW.width / 2, 38, 16, PALETTE.gold, 'center', 700);
    }

    // Speedometer and car name.
    if (player.inCar) {
      const car = player.inCar;
      const kmh = Math.round(car.speed * 0.36);
      if (kmh !== lastSpeed) {
        lastSpeed = kmh;
        speedText = `${kmh}`;
      }
      const names = ['Sedan', 'Taksi', 'Van', 'Truk', 'Sport'];
      text(speedText, VIEW.width - 24, VIEW.height - 44, 44, '#fff', 'right', 800);
      text('km/jam', VIEW.width - 24, VIEW.height - 22, 13, PALETTE.muted, 'right', 700);
      text(names[car.kind] ?? 'Mobil', VIEW.width - 24, VIEW.height - 84, 15, PALETTE.text, 'right', 700);
      const carHealth = Math.max(0, car.health);
      bar(VIEW.width - 204, VIEW.height - 104, 180, 8, carHealth / 100, carHealth > 50 ? '#37d67a' : '#ff5a4e');
    } else {
      text('WASD jalan · E naik mobil · F pukul · Klik tembak · Shift lari', VIEW.width - 24, VIEW.height - 22, 13, 'rgba(242,244,248,0.65)', 'right', 600);
    }

    // Mission banner (intro / outro).
    const banner = snapshot.missions.state.banner;
    if (banner) {
      const alpha = Math.min(1, snapshot.missions.state.bannerTimer);
      context.fillStyle = `rgba(8, 12, 20, ${0.82 * alpha})`;
      context.fillRect(VIEW.width / 2 - 430, 96, 860, banner.sub ? 108 : 64);
      context.strokeStyle = `rgba(255, 210, 61, ${0.9 * alpha})`;
      context.lineWidth = 2;
      context.strokeRect(VIEW.width / 2 - 430, 96, 860, banner.sub ? 108 : 64);
      text(banner.text, VIEW.width / 2, 132, 26, PALETTE.mission, 'center', 800);
      if (banner.sub) {
        context.font = '400 16px system-ui, sans-serif';
        context.fillStyle = `rgba(242, 244, 248, ${0.95 * alpha})`;
        context.textAlign = 'center';
        wrapText(banner.sub, VIEW.width / 2, 160, 800, 21);
      }
    }

    // Busted progress while a cruiser sits on the player.
    if (snapshot.police.bustMeter > 0.05 && !player.inCar) {
      const w = 260;
      context.fillStyle = 'rgba(8, 12, 20, 0.8)';
      context.fillRect((VIEW.width - w) / 2, VIEW.height - 120, w, 40);
      text('DITANGKAP!', VIEW.width / 2, VIEW.height - 96, 15, '#ff8a7a', 'center', 800);
      bar((VIEW.width - w) / 2 + 14, VIEW.height - 90, w - 28, 8, snapshot.police.bustMeter / 1.4, '#ff5a4e');
    }

    drawMinimap(snapshot);

    if (player.health <= 25 && player.health > 0) {
      const pulse = 0.1 + Math.sin(snapshot.time * 6) * 0.05;
      context.fillStyle = `rgba(255, 40, 30, ${pulse})`;
      context.fillRect(0, 0, VIEW.width, VIEW.height);
    }
  }

  function wrapText(value, cx, y, maxWidth, lineHeight) {
    const words = value.split(' ');
    let line = '';
    let lineY = y;
    for (const word of words) {
      const test = line ? `${line} ${word}` : word;
      if (context.measureText(test).width > maxWidth && line) {
        context.fillText(line, cx, lineY);
        line = word;
        lineY += lineHeight;
      } else {
        line = test;
      }
    }
    if (line) context.fillText(line, cx, lineY);
  }

  function drawPanel(title, lines, prompt, accent) {
    const width = 640;
    const height = 150 + lines.length * 34;
    const x = (VIEW.width - width) / 2;
    const y = (VIEW.height - height) / 2;
    context.fillStyle = PALETTE.panel;
    context.fillRect(x, y, width, height);
    context.strokeStyle = accent ?? PALETTE.panelEdge;
    context.lineWidth = 2;
    context.strokeRect(x, y, width, height);
    text(title, VIEW.width / 2, y + 62, 40, accent ?? PALETTE.text, 'center', 800);
    for (let i = 0; i < lines.length; i += 1) {
      text(lines[i], VIEW.width / 2, y + 108 + i * 34, 18, PALETTE.muted, 'center', 600);
    }
    text(prompt, VIEW.width / 2, y + height - 26, 17, PALETTE.gold, 'center', 700);
  }

  function drawTitle(snapshot) {
    const scaleX = canvas.width / VIEW.width;
    const scaleY = canvas.height / VIEW.height;
    context.setTransform(scaleX, 0, 0, scaleY, 0, 0);
    context.fillStyle = 'rgba(6, 9, 16, 0.62)';
    context.fillRect(0, 0, VIEW.width, VIEW.height);
    text('TELUK BAYU', VIEW.width / 2, 150, 84, '#ffd23d', 'center', 900);
    text('Kota ini milik siapa yang berani.', VIEW.width / 2, 192, 22, '#fff', 'center', 600);
    // The menu panel sits below the title, so nothing overlaps.
    const lines = [
      'Raka, sopir bayaran, kembali ke kota kelahirannya.',
      'Tiga pekerjaan. Satu malam panjang. Polisi di mana-mana.',
      '',
      'WASD / Panah — jalan & mengemudi    E — naik / turun mobil',
      'F — pukul    Klik mouse — tembak    Shift — lari / rem tangan',
      'P — jeda    M — bisu',
    ];
    const prompt = snapshot.saveExists ? 'ENTER — Lanjutkan perjalananmu' : 'Tekan ENTER untuk mulai';
    const width = 640;
    const height = 150 + lines.length * 34;
    const x = (VIEW.width - width) / 2;
    const y = 250;
    context.fillStyle = PALETTE.panel;
    context.fillRect(x, y, width, height);
    context.strokeStyle = '#ffd23d';
    context.lineWidth = 2;
    context.strokeRect(x, y, width, height);
    for (let i = 0; i < lines.length; i += 1) {
      text(lines[i], VIEW.width / 2, y + 48 + i * 34, 18, PALETTE.muted, 'center', 600);
    }
    text(prompt, VIEW.width / 2, y + height - 26, 17, PALETTE.gold, 'center', 700);
    if (snapshot.best) {
      text(`Rekor: $${snapshot.best.cash.toLocaleString('en-US')} · ${snapshot.best.missions} babak selesai`, VIEW.width / 2, VIEW.height - 90, 15, PALETTE.muted, 'center', 600);
    }
    text('Kota, tokoh, dan cerita orisinal — dibuat dari nol.', VIEW.width / 2, VIEW.height - 60, 13, 'rgba(242,244,248,0.5)', 'center', 600);
  }

  function drawPaused() {
    const scaleX = canvas.width / VIEW.width;
    const scaleY = canvas.height / VIEW.height;
    context.setTransform(scaleX, 0, 0, scaleY, 0, 0);
    context.fillStyle = 'rgba(6, 9, 16, 0.6)';
    context.fillRect(0, 0, VIEW.width, VIEW.height);
    drawPanel('JEDA', ['Istirahat dulu. Kota menunggu.', '', 'P / Esc — lanjut bermain'], 'Tekan P untuk lanjut', '#fff');
  }

  function drawOver(kind, snapshot) {
    const scaleX = canvas.width / VIEW.width;
    const scaleY = canvas.height / VIEW.height;
    context.setTransform(scaleX, 0, 0, scaleY, 0, 0);
    context.fillStyle = 'rgba(6, 9, 16, 0.72)';
    context.fillRect(0, 0, VIEW.width, VIEW.height);
    if (kind === 'busted') {
      drawPanel('DITANGKAP!', ['Polisi membawamu ke kantor. Sebagian uangmu disita.', `Uang sekarang: $${snapshot.player.cash.toLocaleString('en-US')}`], 'Tekan ENTER untuk lanjut', '#4fc3f7');
    } else {
      drawPanel('TERKAPAR!', ['Kau bangun di Rumah Sakit Bayu. Tagihan rumah sakit tidak murah.', `Uang sekarang: $${snapshot.player.cash.toLocaleString('en-US')}`], 'Tekan ENTER untuk lanjut', '#ff5a4e');
    }
  }

  function drawStoryDone(snapshot) {
    const scaleX = canvas.width / VIEW.width;
    const scaleY = canvas.height / VIEW.height;
    context.setTransform(scaleX, 0, 0, scaleY, 0, 0);
    context.fillStyle = 'rgba(6, 9, 16, 0.55)';
    context.fillRect(0, 0, VIEW.width, VIEW.height);
    drawPanel('CERITA SELESAI', ['Tiga babak. Tiga kali lolos. Teluk Bayu kini mengenal namamu.', `Total penghasilan: $${snapshot.player.cash.toLocaleString('en-US')}`], 'Tekan ENTER — jelajahi kota sesukamu', '#ffd23d');
  }

  return { drawHud, drawTitle, drawPaused, drawOver, drawStoryDone };
}
