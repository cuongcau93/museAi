// TTS service — neural text-to-speech via Microsoft Edge voices (free, no account).
// Note: text is sent to Microsoft's online TTS endpoint. Clean-room implementation.
const { MsEdgeTTS, OUTPUT_FORMAT } = require('msedge-tts');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const COMMON_VOICES = [
  { id: 'vi-VN-HoaiMyNeural', label: 'Tiếng Việt · HoaiMy (nữ)' },
  { id: 'vi-VN-NamMinhNeural', label: 'Tiếng Việt · NamMinh (nam)' },
  { id: 'en-US-AriaNeural', label: 'English US · Aria (nữ)' },
  { id: 'en-US-GuyNeural', label: 'English US · Guy (nam)' },
  { id: 'ja-JP-NanamiNeural', label: '日本語 · Nanami (nữ)' },
  { id: 'zh-CN-XiaoxiaoNeural', label: '中文 · Xiaoxiao (nữ)' }
];

function asError(e) { return e instanceof Error ? e : new Error(typeof e === 'string' ? e : JSON.stringify(e)); }

async function synthesize(job, onProgress) {
  const { text, voice = 'vi-VN-HoaiMyNeural', rate = '0%', pitch = '0%', output } = job;
  if (!text || !text.trim()) throw new Error('Chưa có nội dung để đọc.');
  if (!output) throw new Error('Chưa chọn nơi lưu file audio.');

  if (onProgress) onProgress({ pct: 10, stage: 'connecting' });
  const tts = new MsEdgeTTS();
  try {
    await tts.setMetadata(voice, OUTPUT_FORMAT.AUDIO_24KHZ_96KBITRATE_MONO_MP3);
  } catch (e) { throw asError(e); }

  if (onProgress) onProgress({ pct: 40, stage: 'synthesizing' });
  // toFile writes to <path> (handles extension). Returns the final file path.
  await new Promise((resolve, reject) => {
    try {
      const result = tts.toStream(text, { rate, pitch });
      const audio = result.audioStream || result; // v2 returns {audioStream}; be version-safe
      const ws = fs.createWriteStream(output);
      audio.pipe(ws);
      audio.on('error', (e) => reject(asError(e)));
      ws.on('finish', resolve);
      ws.on('error', (e) => reject(asError(e)));
    } catch (e) { reject(asError(e)); }
  });

  if (onProgress) onProgress({ pct: 100, stage: 'done' });
  return { output, exists: fs.existsSync(output), bytes: fs.existsSync(output) ? fs.statSync(output).size : 0 };
}

async function synthesizeBatch(job, onProgress) {
  const { segments = [], voice, rate, pitch, outDir } = job;
  const dir = outDir || path.join(os.tmpdir(), 'museauto_tts');
  fs.mkdirSync(dir, { recursive: true });
  const files = [];
  for (let i = 0; i < segments.length; i++) {
    const out = path.join(dir, `seg${String(i + 1).padStart(3, '0')}.mp3`);
    await synthesize({ text: segments[i], voice, rate, pitch, output: out });
    files.push(out);
    if (onProgress) onProgress({ pct: Math.round(((i + 1) / segments.length) * 100), stage: `segment ${i + 1}/${segments.length}` });
  }
  return { files, dir };
}

module.exports = { synthesize, synthesizeBatch, COMMON_VOICES };
