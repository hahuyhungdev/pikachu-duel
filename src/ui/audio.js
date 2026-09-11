/** Tiny synth for feedback blips — no audio assets, no autoplay until a click. */

let ctx = null;
let muted = false;

function context() {
  if (!ctx) {
    const Ctor = globalThis.AudioContext || globalThis.webkitAudioContext;
    if (!Ctor) return null;
    ctx = new Ctor();
  }
  if (ctx.state === 'suspended') ctx.resume().catch(() => {});
  return ctx;
}

function tone({ freq, to = freq, duration = 0.1, type = 'square', gain = 0.05, delay = 0 }) {
  const audio = context();
  if (!audio || muted) return;
  const start = audio.currentTime + delay;
  const osc = audio.createOscillator();
  const amp = audio.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, start);
  if (to !== freq) osc.frequency.exponentialRampToValueAtTime(to, start + duration);
  amp.gain.setValueAtTime(gain, start);
  amp.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  osc.connect(amp).connect(audio.destination);
  osc.start(start);
  osc.stop(start + duration + 0.02);
}

export const sfx = {
  pick: () => tone({ freq: 520, duration: 0.05, gain: 0.035 }),
  match: (streak = 1) => {
    const base = 640 + Math.min(streak - 1, 6) * 60;
    tone({ freq: base, to: base * 1.5, duration: 0.09, gain: 0.045 });
    tone({ freq: base * 2, duration: 0.07, gain: 0.03, delay: 0.06 });
  },
  reject: () => tone({ freq: 190, to: 110, duration: 0.14, type: 'sawtooth', gain: 0.035 }),
  shuffle: () => {
    for (let i = 0; i < 4; i += 1) {
      tone({ freq: 300 + i * 130, duration: 0.05, gain: 0.025, delay: i * 0.04 });
    }
  },
  win: () => {
    [523, 659, 784, 1047].forEach((freq, i) => {
      tone({ freq, duration: 0.16, type: 'triangle', gain: 0.06, delay: i * 0.1 });
    });
  },
  tick: () => tone({ freq: 880, duration: 0.04, type: 'triangle', gain: 0.03 }),
};

export function setMuted(value) {
  muted = Boolean(value);
  return muted;
}

export function isMuted() {
  return muted;
}
