/**
 * Генерирует короткие WAV (PCM 16-bit mono 44100 Гц) для пресетов входящего звука.
 * Запуск: node scripts/generate-incoming-wavs.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.join(__dirname, "..", "public", "sounds", "incoming");

const SAMPLE_RATE = 44100;

/** @param {{ freq: number, durationMs: number, fade?: boolean }} o */
function sineSamples({ freq, durationMs, fade = true }) {
  const n = Math.floor((SAMPLE_RATE * durationMs) / 1000);
  const out = new Int16Array(n);
  for (let i = 0; i < n; i++) {
    const t = i / SAMPLE_RATE;
    let amp = Math.sin(2 * Math.PI * freq * t);
    if (fade) {
      const k = i / n;
      amp *= Math.min(1, k * 20) * Math.min(1, (1 - k) * 8);
    }
    out[i] = Math.round(amp * 0.35 * 32767);
  }
  return out;
}

/** Два тона подряд (как «уведомление»). */
function twoToneSamples(freq1, freq2, msEach) {
  const a = sineSamples({ freq: freq1, durationMs: msEach, fade: true });
  const b = sineSamples({ freq: freq2, durationMs: msEach, fade: true });
  const out = new Int16Array(a.length + b.length);
  out.set(a, 0);
  out.set(b, a.length);
  return out;
}

function writeWav(pcm, filepath) {
  const dataSize = pcm.length * 2;
  const buf = Buffer.alloc(44 + dataSize);
  buf.write("RIFF", 0);
  buf.writeUInt32LE(36 + dataSize, 4);
  buf.write("WAVE", 8);
  buf.write("fmt ", 12);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(SAMPLE_RATE, 24);
  buf.writeUInt32LE(SAMPLE_RATE * 2, 28);
  buf.writeUInt16LE(2, 32);
  buf.writeUInt16LE(16, 34);
  buf.write("data", 36);
  buf.writeUInt32LE(dataSize, 40);
  for (let i = 0; i < pcm.length; i++) {
    buf.writeInt16LE(pcm[i], 44 + i * 2);
  }
  fs.writeFileSync(filepath, buf);
}

const presets = [
  { file: "light-squeak-of-an-old-tamagotchi.wav", gen: () => sineSamples({ freq: 2200, durationMs: 80, fade: true }) },
  { file: "error-notification.wav", gen: () => twoToneSamples(400, 300, 100) },
  { file: "nice-melodic-sound.wav", gen: () => twoToneSamples(523, 659, 120) },
  { file: "sound-messages-odnoklassniki.wav", gen: () => twoToneSamples(880, 1174, 90) },
  { file: "pyk-toon-n-n.wav", gen: () => sineSamples({ freq: 660, durationMs: 55, fade: true }) },
  { file: "sms_uvedomlenie_na_iphone.wav", gen: () => twoToneSamples(1046, 1318, 70) },
];

fs.mkdirSync(outDir, { recursive: true });
for (const { file, gen } of presets) {
  const pcm = gen();
  writeWav(pcm, path.join(outDir, file));
  console.log("written", file);
}
