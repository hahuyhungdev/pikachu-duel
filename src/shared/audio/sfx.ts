/** Tiny synth for feedback blips — no audio assets, no autoplay until a click. */

let ctx: AudioContext | null = null;
let muted = false;

function context(): AudioContext | null {
  if (!ctx) {
    const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    ctx = new Ctor();
  }
  if (ctx.state === 'suspended') ctx.resume().catch(() => {});
  return ctx;
}

interface ToneOptions {
  freq: number;
  to?: number;
  duration?: number;
  type?: OscillatorType;
  gain?: number;
  delay?: number;
}

function tone({ freq, to = freq, duration = 0.1, type = 'square', gain = 0.05, delay = 0 }: ToneOptions) {
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

export function setMuted(value: boolean): boolean {
  muted = Boolean(value);
  return muted;
}

export function isMuted(): boolean {
  return muted;
}
