import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SAMPLE_RATE = 44100;

function sineSamples(freq, durationMs) {
  const n = Math.floor((SAMPLE_RATE * durationMs) / 1000);
  const out = new Int16Array(n);
  for (let i = 0; i < n; i++) {
    const t = i / SAMPLE_RATE;
    const k = i / n;
    const amp = Math.sin(2 * Math.PI * freq * t) * Math.min(1, k * 30) * Math.min(1, (1 - k) * 10);
    out[i] = Math.round(amp * 0.25 * 32767);
  }
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

const outDir = path.join(__dirname, "..", "public", "sounds");
fs.mkdirSync(outDir, { recursive: true });
writeWav(sineSamples(1200, 90), path.join(outDir, "sentmessage.wav"));
console.log("written sentmessage.wav");
