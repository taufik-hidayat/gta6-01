// The story: three chained jobs for Raka, a getaway driver in Teluk Bayu, handed out by
// Mira on the phone. Each mission has an intro, a chain of objectives with a map marker,
// and an outro with its pay. Failing a mission (busted, wasted, or the timer running out)
// offers a retry from that mission's start. After the third job the city is free roam.

import { ENVELOPE_COUNT, ENVELOPE_VALUE, MISSION_REWARD, PLACES } from './config.js';
import { CAR_KIND_SPORTS } from './traffic.js';
import { range } from './random.js';

export const MISSION_STATE_IDLE = 'idle';
export const MISSION_STATE_ACTIVE = 'active';
export const MISSION_STATE_DONE = 'done';

const STORY = [
  {
    title: 'Babak 1 — Paket Pelabuhan',
    from: 'Mira',
    intro: 'Raka, ada paket di gudang pelabuhan. Ambil, lalu antar ke Kopi Dermaga sebelum ada yang curiga. Jangan bikin ribut.',
    outro: 'Paket sampai. Kau rapi, Raka. $500 masuk. Tapi jangan santai dulu — ada yang membuntutimu.',
    objectives: [
      { id: 'pickup', text: 'Ambil paket di Pelabuhan Bayu', x: PLACES.port.x, y: PLACES.port.y, radius: 70 },
      { id: 'deliver', text: 'Antar paket ke Kopi Dermaga', x: PLACES.cafe.x, y: PLACES.cafe.y, radius: 70 },
    ],
  },
  {
    title: 'Babak 2 — Razia',
    from: 'Mira',
    intro: 'Mereka tahu! Razia besar-besaran, semua jalan dijaga. Kabur ke Rumah Aman di utara — JANGAN sampai ketangkap!',
    outro: 'Kau lolos. Polisi kehilangan jejakmu di gang-gang utara. $800. Kau mulai dikenal di jalanan.',
    objectives: [
      { id: 'escape', text: 'Kabur ke Rumah Aman — lepas dari kejaran!', x: PLACES.safehouse.x, y: PLACES.safehouse.y, radius: 80 },
    ],
    wantedOnStart: 3,
    timeLimit: 100,
    // Reaching the safehouse shakes the heat: the point of the escape.
    clearWantedOnComplete: true,
  },
  {
    title: 'Babak 3 — Sedan Merah',
    from: 'Bang Darto',
    intro: 'Darto butuh sedan sport merah di parkiran Mal Bayu Plaza. Curi, bawa ke bengkelku. Alarmnya bakal bunyi — jadi cepat.',
    outro: 'Mobilnya mulus. Darto senang, Mira senang. Mulai malam ini, kau legenda jalanan Teluk Bayu. Cerita selesai — kotanya milikmu.',
    objectives: [
      // The sedan itself is the objective: it waits in the mall car park, off the road.
      { id: 'steal', text: 'Curi sedan merah di Mal Bayu Plaza', x: 2400, y: 1130, radius: 80 },
      // The garage door faces street 1700: the delivery point is on the road, not inside the building.
      { id: 'garage', text: 'Bawa sedan merah ke Bengkel Darto', x: PLACES.garage.x, y: 1660, radius: 80 },
    ],
    stealCar: true,
  },
];

export function createMissions(random, city) {
  const state = {
    index: 0,
    phase: MISSION_STATE_IDLE,
    objectiveIndex: 0,
    timeLeft: 0,
    banner: null,
    bannerTimer: 0,
    failed: false,
    failReason: '',
    storyDone: false,
    targetCar: null,
    envelopes: [],
  };

  // Cash envelopes scattered around the city: small side income, shown on the minimap.
  for (let i = 0; i < ENVELOPE_COUNT; i += 1) {
    state.envelopes.push({
      x: range(random, 300, 2900),
      y: range(random, 200, 2100),
      taken: false,
    });
  }

  function current() {
    return STORY[state.index] ?? null;
  }

  function currentObjective() {
    const mission = current();
    if (!mission) return null;
    return mission.objectives[state.objectiveIndex] ?? null;
  }

  function showBanner(text, sub, seconds) {
    state.banner = { text, sub: sub ?? '', t: seconds };
    state.bannerTimer = seconds;
  }

  function startMission(index, ctx) {
    state.index = index;
    state.objectiveIndex = 0;
    state.phase = MISSION_STATE_ACTIVE;
    state.failed = false;
    const mission = STORY[index];
    state.timeLeft = mission.timeLimit ?? 0;
    if (mission.wantedOnStart) ctx.player.addWanted(mission.wantedOnStart);
    if (mission.stealCar) {
      // The red sedan waits in the mall car park, off the road, so it never blocks traffic.
      const car = ctx.traffic.spawnParked(CAR_KIND_SPORTS, 2400, 1130, Math.PI / 2);
      ctx.traffic.addCar(car);
      state.targetCar = car;
    }
    showBanner(mission.title, `${mission.from}: “${mission.intro}”`, 6);
    ctx.audio.phone();
  }

  function completeMission(ctx) {
    const mission = current();
    const reward = MISSION_REWARD[state.index];
    ctx.player.addCash(reward);
    ctx.audio.missionDone();
    if (mission.clearWantedOnComplete) ctx.player.state.wanted = 0;
    showBanner('Misi selesai!', `${mission.outro}  (+$${reward})`, 7);
    state.phase = MISSION_STATE_DONE;
    if (state.index >= STORY.length - 1) {
      state.storyDone = true;
    }
  }

  function failMission(reason, ctx) {
    state.failed = true;
    state.failReason = reason;
    ctx.audio.missionFail();
    showBanner('Misi gagal', `${reason} — tekan R untuk mengulang babak ini.`, 999);
  }

  return {
    state,
    current,
    currentObjective,
    showBanner,
    /** Begin the story (or resume at the saved mission). */
    start(index, ctx) {
      startMission(index, ctx);
    },
    /** Retry the current mission from its start. */
    retry(ctx) {
      if (state.targetCar) {
        state.targetCar.health = 0;
        state.targetCar = null;
      }
      ctx.player.state.wanted = 0;
      ctx.player.state.health = 100;
      startMission(state.index, ctx);
    },
    /** Advance objectives; call every frame with the player's position and car. */
    step(dt, ctx) {
      if (state.banner) {
        state.bannerTimer -= dt;
        if (state.bannerTimer <= 0) state.banner = null;
      }
      if (state.phase !== MISSION_STATE_ACTIVE) return;
      const mission = current();
      const objective = currentObjective();
      if (!objective) return;
      if (mission.timeLimit) {
        state.timeLeft -= dt;
        if (state.timeLeft <= 0) {
          failMission('Waktu habis — polisi menutup semua jalan.', ctx);
          return;
        }
      }
      const player = ctx.player.state;
      const dx = objective.x - player.x;
      const dy = objective.y - player.y;
      const dist = Math.hypot(dx, dy);
      if (dist > objective.radius) return;

      if (objective.id === 'steal') {
        // The job is only done once the player is actually driving the red sedan.
        if (player.inCar === state.targetCar) {
          state.objectiveIndex += 1;
          ctx.player.addWanted(2);
          showBanner('Sedan merah didapat!', 'Alarm berbunyi — polisi datang! Bawa ke bengkel, cepat!', 4);
          ctx.audio.phone();
        }
        return;
      }
      if (objective.id === 'garage') {
        if (player.inCar === state.targetCar) {
          completeMission(ctx);
        }
        return;
      }
      state.objectiveIndex += 1;
      if (state.objectiveIndex >= mission.objectives.length) {
        completeMission(ctx);
      } else {
        ctx.audio.pickup();
      }
    },
    /** The next mission starts when the player confirms the outro (or automatically). */
    advanceIfDone(ctx) {
      if (state.phase === MISSION_STATE_DONE && !state.storyDone) {
        startMission(state.index + 1, ctx);
        return true;
      }
      return false;
    },
    /** Cash envelopes: collect one by walking or driving over it. */
    collectEnvelopes(player, ctx) {
      for (const envelope of state.envelopes) {
        if (envelope.taken) continue;
        if (Math.hypot(envelope.x - player.x, envelope.y - player.y) < 34) {
          envelope.taken = true;
          ctx.player.addCash(ENVELOPE_VALUE);
          ctx.audio.pickup();
          showBanner(`Amplop +$${ENVELOPE_VALUE}`, '', 1.6);
        }
      }
    },
  };
}
