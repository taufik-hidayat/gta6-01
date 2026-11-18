// Every sound is synthesised with WebAudio — no audio files, no network. The engine hums
// with speed, sirens wail when cruisers are near, tyres screech on a drift, and gunshots,
// crashes and mission chimes are short noise or tone bursts. The context is created lazily
// on the first user gesture, because browsers block audio before one.

function makeNoiseBuffer(context, seconds) {
  const buffer = context.createBuffer(1, Math.floor(context.sampleRate * seconds), context.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i += 1) data[i] = Math.random() * 2 - 1;
  return buffer;
}

export function createAudio() {
  let context = null;
  let master = null;
  let engineOsc = null;
  let engineOsc2 = null;
  let engineGain = null;
  let engineFilter = null;
  let sirenOsc = null;
  let sirenGain = null;
  let sirenTimer = 0;
  let ambientSource = null;
  let ambientGain = null;
  let muted = false;
  let noiseBuffer = null;

  function ensure() {
    if (context) return true;
    try {
      const Ctor = window.AudioContext || window.webkitAudioContext;
      if (!Ctor) return false;
      context = new Ctor();
      master = context.createGain();
      master.gain.value = muted ? 0 : 0.5;
      master.connect(context.destination);
      noiseBuffer = makeNoiseBuffer(context, 1);

      // Engine: two detuned saws through a low-pass, pitched by speed.
      engineOsc = context.createOscillator();
      engineOsc.type = 'sawtooth';
      engineOsc.frequency.value = 55;
      engineOsc2 = context.createOscillator();
      engineOsc2.type = 'square';
      engineOsc2.frequency.value = 28;
      engineFilter = context.createBiquadFilter();
      engineFilter.type = 'lowpass';
      engineFilter.frequency.value = 420;
      engineGain = context.createGain();
      engineGain.gain.value = 0;
      engineOsc.connect(engineFilter);
      engineOsc2.connect(engineFilter);
      engineFilter.connect(engineGain);
      engineGain.connect(master);
      engineOsc.start();
      engineOsc2.start();

      // Siren: one square wave whose pitch flips between two tones.
      sirenOsc = context.createOscillator();
      sirenOsc.type = 'square';
      sirenOsc.frequency.value = 720;
      sirenGain = context.createGain();
      sirenGain.gain.value = 0;
      sirenOsc.connect(sirenGain);
      sirenGain.connect(master);
      sirenOsc.start();

      // City ambience: looped brown-ish noise, very quiet, through a low-pass.
      ambientSource = context.createBufferSource();
      ambientSource.buffer = noiseBuffer;
      ambientSource.loop = true;
      const ambientFilter = context.createBiquadFilter();
      ambientFilter.type = 'lowpass';
      ambientFilter.frequency.value = 240;
      ambientGain = context.createGain();
      ambientGain.gain.value = 0.035;
      ambientSource.connect(ambientFilter);
      ambientFilter.connect(ambientGain);
      ambientGain.connect(master);
      ambientSource.start();
      return true;
    } catch {
      context = null;
      return false;
    }
  }

  function burst({ frequency = 1200, duration = 0.12, type = 'noise', gain = 0.5, slideTo = null }) {
    if (!ensure()) return;
    const now = context.currentTime;
    if (type === 'noise') {
      const source = context.createBufferSource();
      source.buffer = noiseBuffer;
      const filter = context.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.value = frequency;
      filter.Q.value = 0.8;
      const out = context.createGain();
      out.gain.setValueAtTime(gain, now);
      out.gain.exponentialRampToValueAtTime(0.001, now + duration);
      source.connect(filter);
      filter.connect(out);
      out.connect(master);
      source.start(now, Math.random() * 0.5, duration + 0.05);
      source.stop(now + duration + 0.05);
      return;
    }
    const osc = context.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(frequency, now);
    if (slideTo !== null) osc.frequency.exponentialRampToValueAtTime(slideTo, now + duration);
    const out = context.createGain();
    out.gain.setValueAtTime(gain, now);
    out.gain.exponentialRampToValueAtTime(0.001, now + duration);
    osc.connect(out);
    out.connect(master);
    osc.start(now);
    osc.stop(now + duration + 0.02);
  }

  function chime(notes) {
    if (!ensure()) return;
    const now = context.currentTime;
    notes.forEach((frequency, index) => {
      const osc = context.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = frequency;
      const out = context.createGain();
      const start = now + index * 0.09;
      out.gain.setValueAtTime(0, start);
      out.gain.linearRampToValueAtTime(0.35, start + 0.02);
      out.gain.exponentialRampToValueAtTime(0.001, start + 0.5);
      osc.connect(out);
      out.connect(master);
      osc.start(start);
      osc.stop(start + 0.55);
    });
  }

  return {
    /** Call on any gesture so the context is allowed to start. */
    unlock() {
      if (ensure() && context.state === 'suspended') context.resume().catch(() => {});
    },
    setMuted(value) {
      muted = value;
      if (master) master.gain.value = muted ? 0 : 0.5;
    },
    isMuted() {
      return muted;
    },
    /** Called every frame: speedRatio 0..1 while driving, policeNear 0..1, drifting bool. */
    update(dt, speedRatio, policeNear, drifting) {
      if (!context || context.state !== 'running') return;
      const targetEngine = speedRatio > 0.02 ? 0.05 + speedRatio * 0.075 : 0;
      engineGain.gain.setTargetAtTime(targetEngine, context.currentTime, 0.08);
      const pitch = 52 + speedRatio * 165;
      engineOsc.frequency.setTargetAtTime(pitch, context.currentTime, 0.06);
      engineOsc2.frequency.setTargetAtTime(pitch / 2, context.currentTime, 0.06);
      engineFilter.frequency.setTargetAtTime(320 + speedRatio * 900, context.currentTime, 0.1);
      sirenTimer += dt;
      const tone = Math.floor(sirenTimer / 0.42) % 2 === 0 ? 715 : 960;
      sirenOsc.frequency.setTargetAtTime(tone, context.currentTime, 0.05);
      sirenGain.gain.setTargetAtTime(policeNear * 0.05, context.currentTime, 0.2);
      if (drifting) burst({ frequency: 2600, duration: 0.09, type: 'noise', gain: 0.06 });
    },
    gunshot() {
      burst({ frequency: 900, duration: 0.14, type: 'noise', gain: 0.6 });
      burst({ frequency: 140, duration: 0.16, type: 'sine', gain: 0.5, slideTo: 55 });
    },
    punch() {
      burst({ frequency: 220, duration: 0.09, type: 'noise', gain: 0.4 });
    },
    crash(strength) {
      const gain = Math.min(0.7, 0.2 + strength * 0.5);
      burst({ frequency: 300, duration: 0.22, type: 'noise', gain });
      burst({ frequency: 90, duration: 0.25, type: 'sine', gain: 0.5, slideTo: 40 });
    },
    explosion() {
      burst({ frequency: 160, duration: 0.7, type: 'noise', gain: 0.8 });
      burst({ frequency: 70, duration: 0.8, type: 'sine', gain: 0.7, slideTo: 30 });
    },
    pickup() {
      chime([660, 880]);
    },
    missionDone() {
      chime([523, 659, 784, 1047]);
    },
    missionFail() {
      chime([392, 330, 262]);
    },
    phone() {
      chime([880, 880, 1175]);
    },
    click() {
      burst({ frequency: 1400, duration: 0.05, type: 'square', gain: 0.15 });
    },
  };
}
