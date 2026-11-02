// Task executors. A task asks for an image or a short video from a prompt.
//  - 'muse'  : drive muse.ai in a logged-in Chrome (real generation).
//  - 'demo'  : render a labelled placeholder with ffmpeg so the whole pipeline
//              is runnable/testable without a muse.ai account.
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
let FFMPEG = 'ffmpeg';
try { FFMPEG = require('ffmpeg-static') || 'ffmpeg'; } catch { /* PATH */ }
const museai = require('../services/museai-automation.js');

function dims(ratio) {
  if (ratio === '9:16') return [720, 1280];
  if (ratio === '1:1') return [1024, 1024];
  return [1280, 720];
}
function run(args) {
  return new Promise((res, rej) => {
    const p = spawn(FFMPEG, args, { windowsHide: true });
    let err = ''; p.stderr.on('data', d => err += d);
    p.on('error', rej);
    p.on('close', c => c === 0 ? res(true) : rej(new Error('ffmpeg ' + c + ': ' + err.slice(-400))));
  });
}
function wrap(text, width = 28) {
  const words = (text || '').split(/\s+/);
  const lines = []; let line = '';
  for (const w of words) {
    if ((line + ' ' + w).trim().length > width) { lines.push(line.trim()); line = w; }
    else line += ' ' + w;
  }
  if (line.trim()) lines.push(line.trim());
  return lines.slice(0, 12).join('\n');
}
function hue(seed) { let h = 0; for (const c of seed) h = (h * 31 + c.charCodeAt(0)) % 360; return h; }

const FONT = 'C\\:/Windows/Fonts/arial.ttf';

async function demoImage({ prompt, ratio, outPath, label }) {
  const [w, h] = dims(ratio);
  const fontsize = Math.max(18, Math.round(w / 26));
  const wrapWidth = Math.max(16, Math.floor(w / (fontsize * 0.52)));
  const txtFile = path.join(os.tmpdir(), 'demo_' + Date.now() + Math.random().toString(36).slice(2) + '.txt');
  fs.writeFileSync(txtFile, wrap(label ? label + '\n\n' + prompt : prompt, wrapWidth), 'utf8');
  const H = hue(prompt || 'x');
  const vf = `hue=h=${H},` +
    `drawtext=fontfile='${FONT}':textfile='${escPath(txtFile)}':fontcolor=white:fontsize=${fontsize}:` +
    `x=(w-text_w)/2:y=(h-text_h)/2:line_spacing=8:box=1:boxcolor=0x00000066:boxborderw=24`;
  await run(['-f', 'lavfi', '-i', `color=c=0x1e2a44:s=${w}x${h}`, '-frames:v', '1', '-vf', vf, '-y', outPath]);
  try { fs.unlinkSync(txtFile); } catch {}
  return outPath;
}
function escPath(p) { return p.replace(/\\/g, '/').replace(/:/g, '\\:'); }

async function demoVideo({ prompt, ratio, outPath, imagePath, label, seconds = 5 }) {
  const [w, h] = dims(ratio);
  let img = imagePath;
  if (!img || !fs.existsSync(img)) { img = outPath.replace(/\.\w+$/, '.png'); await demoImage({ prompt, ratio, outPath: img, label }); }
  const frames = seconds * 30;
  const vf = `scale=${w * 2}:${h * 2}:force_original_aspect_ratio=increase,crop=${w * 2}:${h * 2},` +
    `zoompan=z='min(zoom+0.0015,1.3)':d=${frames}:s=${w}x${h}:fps=30,format=yuv420p`;
  await run(['-loop', '1', '-t', String(seconds), '-i', img, '-vf', vf, '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '22', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', '-y', outPath]);
  return outPath;
}

// Execute one task. Returns { files: [...] }.
async function execute(task, ctx, onStep) {
  const { executor, outputDir, profilesRoot, chromePath, selectors } = ctx;
  const [, ] = dims(task.ratio);
  const base = path.join(outputDir, (task.project || 'default'));
  fs.mkdirSync(base, { recursive: true });
  const stamp = Date.now().toString(36) + Math.random().toString(36).slice(2, 5);

  if (executor === 'muse') {
    if (onStep) onStep('muse.ai: đang tạo');
    if (task.kind === 'video') {
      // muse video generation would go here; reuse image flow as a stand-in call point
      const r = await museai.generateImage({ profileId: task.accountId || 'default', profilesRoot, chromePath, prompt: task.prompt, selectors, downloadDir: base, index: 1 });
      return { files: [r.output] };
    }
    const r = await museai.generateImage({ profileId: task.accountId || 'default', profilesRoot, chromePath, prompt: task.prompt, selectors, downloadDir: base, index: 1 });
    return { files: [r.output] };
  }

  // demo executor
  if (task.kind === 'video') {
    if (onStep) onStep('demo: render clip');
    const img = task.images && task.images[0] && task.images[0].imageLocalPath;
    const out = path.join(base, `clip_${stamp}.mp4`);
    await demoVideo({ prompt: task.prompt, ratio: task.ratio, outPath: out, imagePath: img, label: task.label });
    return { files: [out] };
  }
  if (onStep) onStep('demo: render ảnh');
  const out = path.join(base, `img_${stamp}.png`);
  await demoImage({ prompt: task.prompt, ratio: task.ratio, outPath: out, label: task.label });
  return { files: [out] };
}

module.exports = { execute, demoImage, demoVideo, dims };
