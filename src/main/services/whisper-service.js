// Whisper subtitle service — offline speech-to-text via a whisper.cpp binary.
// Clean-room. The whisper.cpp binary + ggml model are user-provided (set in Settings),
// so we ship no third-party weights. Audio is first normalised to 16kHz mono WAV with ffmpeg.
const { spawn } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
let FFMPEG = 'ffmpeg';
try { FFMPEG = require('ffmpeg-static') || 'ffmpeg'; } catch { /* PATH */ }

function sh(bin, args, onLine) {
  return new Promise((resolve, reject) => {
    const p = spawn(bin, args, { windowsHide: true });
    let err = '';
    p.stdout.on('data', d => { if (onLine) d.toString().split(/\r|\n/).forEach(onLine); });
    p.stderr.on('data', d => { const s = d.toString(); err += s; if (onLine) s.split(/\r|\n/).forEach(onLine); });
    p.on('error', reject);
    p.on('close', c => c === 0 ? resolve(true) : reject(new Error(bin + ' exited ' + c + '\n' + err.slice(-1000))));
  });
}

function toWav(input, out) {
  return sh(FFMPEG, ['-y', '-i', input, '-ar', '16000', '-ac', '1', '-c:a', 'pcm_s16le', out]);
}

async function transcribe(job, onProgress) {
  const { input, language = 'auto', whisperBin, whisperModel, outputSrt } = job;
  if (!whisperBin || !fs.existsSync(whisperBin))
    throw new Error('Whisper binary not set. Open Settings and point to whisper.cpp (e.g. whisper-cli.exe).');
  if (!whisperModel || !fs.existsSync(whisperModel))
    throw new Error('Whisper model (.bin / .gguf) not set in Settings.');
  if (!input) throw new Error('No input audio/video file.');

  const tmp = path.join(os.tmpdir(), `museauto_${Date.now()}.wav`);
  if (onProgress) onProgress({ pct: 5, stage: 'extracting audio' });
  await toWav(input, tmp);

  // whisper.cpp writes <of>.srt ; -of takes the path WITHOUT extension
  const ofBase = (outputSrt || input).replace(/\.[^.]+$/, '');
  const args = ['-m', whisperModel, '-f', tmp, '-osrt', '-of', ofBase];
  if (language && language !== 'auto') args.push('-l', language);

  if (onProgress) onProgress({ pct: 20, stage: 'transcribing' });
  await sh(whisperBin, args, (line) => {
    const m = line.match(/\[(\d+):(\d+):(\d+)\.(\d+)\s*-->/); // progress hint from timestamps
    if (m && onProgress) onProgress({ pct: Math.min(95, 20 + Math.random() * 60 | 0), stage: 'transcribing' });
  });

  try { fs.unlinkSync(tmp); } catch { /* ignore */ }
  const srt = ofBase + '.srt';
  if (onProgress) onProgress({ pct: 100, stage: 'done' });
  return { srt, exists: fs.existsSync(srt) };
}

module.exports = { transcribe };
