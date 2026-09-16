/**
 * Renders the app's button sounds to WAV files.
 *
 *   node scripts/build-sounds.js
 *
 * The recipes are the ones designed in the browser preview. A phone app cannot
 * synthesise audio on the fly the way the Web Audio API does, so they are baked
 * to files here and played back with expo-audio.
 *
 * The shape of every sound is the same, and it is the shape of a good physical
 * button: a low "body" that carries the weight, a short filtered noise "tick"
 * on top that carries the click, and then nothing. Decays are deliberately
 * brutal -- anything that rings for longer than about a third of a second
 * starts to sound like a toy.
 */

const fs = require('fs');
const path = require('path');

const RATE = 32000;          // plenty for thumps and clicks; half the size of 44.1k
const OUT = path.join(__dirname, '..', 'assets', 'sounds');

// ------------------------------------------------------------- primitives --

function silence(seconds) {
  return new Float32Array(Math.ceil(seconds * RATE));
}

function mix(into, from, atSeconds) {
  const offset = Math.floor(atSeconds * RATE);
  for (let i = 0; i < from.length; i++) {
    const j = offset + i;
    if (j < into.length) into[j] += from[i];
  }
}

/** One-pole low-pass. Rounds off the edges so nothing sounds brittle. */
function lowpass(buf, cutoff) {
  const rc = 1 / (2 * Math.PI * cutoff);
  const dt = 1 / RATE;
  const a = dt / (rc + dt);
  let last = 0;
  for (let i = 0; i < buf.length; i++) {
    last += a * (buf[i] - last);
    buf[i] = last;
  }
  return buf;
}

/** Two-pole band-pass, used to give the noise tick a pitch. */
function bandpass(buf, centre, q) {
  const w = (2 * Math.PI * centre) / RATE;
  const alpha = Math.sin(w) / (2 * q);
  const b0 = alpha, b1 = 0, b2 = -alpha;
  const a0 = 1 + alpha, a1 = -2 * Math.cos(w), a2 = 1 - alpha;
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  for (let i = 0; i < buf.length; i++) {
    const x0 = buf[i];
    const y0 = (b0 / a0) * x0 + (b1 / a0) * x1 + (b2 / a0) * x2 - (a1 / a0) * y1 - (a2 / a0) * y2;
    x2 = x1; x1 = x0; y2 = y1; y1 = y0;
    buf[i] = y0;
  }
  return buf;
}

/**
 * The weight of the press: a tone that drops in pitch as it decays, which is
 * what a struck object does and what a pure tone conspicuously does not.
 */
function body({ from, to, dur, gain, type = 'sine', cutoff = 2200 }) {
  const n = Math.ceil(dur * RATE);
  const out = new Float32Array(n);
  let phase = 0;
  for (let i = 0; i < n; i++) {
    const t = i / n;
    const freq = from * Math.pow((to || from * 0.6) / from, t);
    phase += (2 * Math.PI * freq) / RATE;

    let sample;
    if (type === 'sine') sample = Math.sin(phase);
    else if (type === 'triangle') sample = (2 / Math.PI) * Math.asin(Math.sin(phase));
    else sample = Math.sign(Math.sin(phase)) * 0.6;   // square, tamed

    // Fast attack so the transient survives, exponential tail so it dies.
    const attack = Math.min(1, i / (0.004 * RATE));
    const decay = Math.pow(0.0008, t);
    out[i] = sample * attack * decay * gain;
  }
  return lowpass(out, cutoff);
}

/** The click on top. */
function tick({ freq = 2000, dur = 0.03, gain = 0.16, q = 1.1 }) {
  const n = Math.ceil(dur * RATE);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) out[i] = Math.random() * 2 - 1;
  bandpass(out, freq, q);
  for (let i = 0; i < n; i++) {
    const t = i / n;
    out[i] *= Math.pow(0.0005, t) * gain * 3;
  }
  return out;
}

// ----------------------------------------------------------------- voices --

const VOICES = {
  tap: () => {
    const b = silence(0.16);
    mix(b, body({ from: 210, to: 130, dur: 0.11, gain: 0.30, cutoff: 1500 }), 0);
    mix(b, tick({ freq: 2400, gain: 0.10, dur: 0.022 }), 0);
    return b;
  },
  wake: () => {
    const b = silence(0.34);
    mix(b, body({ from: 392, to: 392, dur: 0.11, gain: 0.24, type: 'triangle', cutoff: 3200 }), 0);
    mix(b, body({ from: 587, to: 587, dur: 0.20, gain: 0.22, type: 'triangle', cutoff: 3600 }), 0.085);
    mix(b, tick({ freq: 3200, gain: 0.09, dur: 0.02 }), 0);
    return b;
  },
  restart: () => {
    const b = silence(0.22);
    mix(b, body({ from: 300, to: 260, dur: 0.07, gain: 0.24, cutoff: 1900 }), 0);
    mix(b, body({ from: 360, to: 320, dur: 0.09, gain: 0.24, cutoff: 2100 }), 0.075);
    mix(b, tick({ freq: 2600, gain: 0.10, dur: 0.02 }), 0);
    return b;
  },
  sleep: () => {
    const b = silence(0.40);
    mix(b, body({ from: 330, to: 165, dur: 0.34, gain: 0.26, cutoff: 1100 }), 0);
    mix(b, tick({ freq: 1400, gain: 0.06, dur: 0.02 }), 0);
    return b;
  },
  lock: () => {
    const b = silence(0.26);
    mix(b, body({ from: 150, to: 88, dur: 0.16, gain: 0.38, cutoff: 900 }), 0);
    mix(b, tick({ freq: 1500, gain: 0.17, dur: 0.028, q: 1.6 }), 0);
    mix(b, tick({ freq: 900, gain: 0.11, dur: 0.05 }), 0.035);
    return b;
  },
  shutdown: () => {
    const b = silence(0.60);
    mix(b, body({ from: 260, to: 100, dur: 0.42, gain: 0.32, cutoff: 1000 }), 0);
    mix(b, body({ from: 130, to: 62, dur: 0.50, gain: 0.16, cutoff: 700 }), 0.06);
    mix(b, tick({ freq: 1200, gain: 0.10, dur: 0.03 }), 0);
    return b;
  },
  cancel: () => {
    const b = silence(0.16);
    mix(b, body({ from: 240, to: 200, dur: 0.05, gain: 0.20, cutoff: 1400 }), 0);
    mix(b, body({ from: 200, to: 170, dur: 0.06, gain: 0.20, cutoff: 1200 }), 0.055);
    return b;
  },
  bios: () => {
    const b = silence(0.22);
    mix(b, body({ from: 520, to: 520, dur: 0.06, gain: 0.16, type: 'square', cutoff: 1800 }), 0);
    mix(b, body({ from: 390, to: 390, dur: 0.12, gain: 0.16, type: 'square', cutoff: 1600 }), 0.06);
    return b;
  },
  done: () => {
    const b = silence(0.46);
    mix(b, body({ from: 523, to: 523, dur: 0.10, gain: 0.18, type: 'triangle', cutoff: 3600 }), 0);
    mix(b, body({ from: 659, to: 659, dur: 0.10, gain: 0.17, type: 'triangle', cutoff: 3600 }), 0.075);
    mix(b, body({ from: 784, to: 784, dur: 0.24, gain: 0.16, type: 'triangle', cutoff: 3600 }), 0.15);
    return b;
  },
  fail: () => {
    const b = silence(0.30);
    mix(b, body({ from: 120, to: 78, dur: 0.24, gain: 0.34, cutoff: 700 }), 0);
    mix(b, tick({ freq: 700, gain: 0.08, dur: 0.04, q: 0.8 }), 0);
    return b;
  },
};

// -------------------------------------------------------------------- wav --

function toWav(samples) {
  const n = samples.length;
  const buf = Buffer.alloc(44 + n * 2);

  buf.write('RIFF', 0);
  buf.writeUInt32LE(36 + n * 2, 4);
  buf.write('WAVE', 8);
  buf.write('fmt ', 12);
  buf.writeUInt32LE(16, 16);        // PCM header size
  buf.writeUInt16LE(1, 20);         // format: PCM
  buf.writeUInt16LE(1, 22);         // mono
  buf.writeUInt32LE(RATE, 24);
  buf.writeUInt32LE(RATE * 2, 28);  // byte rate
  buf.writeUInt16LE(2, 32);         // block align
  buf.writeUInt16LE(16, 34);        // bits per sample
  buf.write('data', 36);
  buf.writeUInt32LE(n * 2, 40);

  // Normalise to a consistent headroom so no one sound jumps out.
  let peak = 0;
  for (let i = 0; i < n; i++) peak = Math.max(peak, Math.abs(samples[i]));
  const scale = peak > 0 ? 0.82 / peak : 1;

  for (let i = 0; i < n; i++) {
    let v = samples[i] * scale;
    // A short fade at the tail stops the file ending on a click of its own.
    const fade = Math.min(1, (n - i) / (0.004 * RATE));
    v *= fade;
    buf.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(v * 32767))), 44 + i * 2);
  }
  return buf;
}

fs.mkdirSync(OUT, { recursive: true });
let total = 0;
for (const [name, make] of Object.entries(VOICES)) {
  const wav = toWav(make());
  const file = path.join(OUT, `${name}.wav`);
  fs.writeFileSync(file, wav);
  total += wav.length;
  console.log(`  ${name.padEnd(10)} ${(wav.length / 1024).toFixed(1).padStart(6)} KB`);
}
console.log(`  ${''.padEnd(10)} ${(total / 1024).toFixed(1).padStart(6)} KB total`);
