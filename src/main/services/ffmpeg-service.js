// ffmpeg service — batch-assemble still images (+ voiceover + bgm) into a video.
// Clean-room implementation. Uses the bundled ffmpeg-static binary.
const { spawn } = require('node:child_process');
let FFMPEG = 'ffmpeg';
try { FFMPEG = require('ffmpeg-static') || 'ffmpeg'; } catch { /* fall back to PATH */ }

function run(args, onLine) {
  return new Promise((resolve, reject) => {
    const p = spawn(FFMPEG, args, { windowsHide: true });
    let err = '';
    p.stderr.on('data', d => { const s = d.toString(); err += s; if (onLine) s.split(/\r|\n/).forEach(onLine); });
    p.on('error', reject);
    p.on('close', code => code === 0 ? resolve(true) : reject(new Error('ffmpeg exited ' + code + '\n' + err.slice(-1200))));
  });
}

// ffprobe-like duration via ffmpeg (parse "Duration: HH:MM:SS.xx")
function probe(file) {
  return new Promise((resolve) => {
    let out = '';
    const p = spawn(FFMPEG, ['-i', file], { windowsHide: true });
    p.stderr.on('data', d => out += d.toString());
    p.on('close', () => {
      const m = out.match(/Duration:\s*(\d+):(\d+):(\d+\.\d+)/);
      const dur = m ? (+m[1]) * 3600 + (+m[2]) * 60 + (+m[3]) : null;
      resolve({ durationSec: dur });
    });
    p.on('error', () => resolve({ durationSec: null }));
  });
}

function hmsToSec(t) { const m = t.match(/(\d+):(\d+):(\d+\.\d+)/); return m ? (+m[1]) * 3600 + (+m[2]) * 60 + (+m[3]) : 0; }

// Build a per-image motion (Ken Burns) label.
function clipFilter(idx, W, H, fps, dur, kenBurns) {
  const frames = Math.max(1, Math.round(dur * fps));
  const scale = `scale=${W * 2}:${H * 2}:force_original_aspect_ratio=increase,crop=${W * 2}:${H * 2}`;
  const motion = kenBurns
    ? `zoompan=z='min(zoom+0.0012,1.25)':d=${frames}:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':s=${W}x${H}:fps=${fps}`
    : `scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},fps=${fps}`;
  return `[${idx}:v]${scale},${motion},trim=duration=${dur},setpts=PTS-STARTPTS,format=yuv420p,setsar=1[v${idx}]`;
}

async function assembleVideo(job, onProgress) {
  const {
    segments = [], width = 1920, height = 1080, fps = 30,
    transition = 'fade', transitionSec = 0.6, kenBurns = true,
    voiceover = null, bgm = null, bgmVolume = 0.18, output
  } = job;

  if (!segments.length) throw new Error('No segments/images provided.');
  if (!output) throw new Error('No output path.');

  const W = Math.round(width), H = Math.round(height);
  const xf = transition === 'none' ? 0 : Math.max(0, Number(transitionSec) || 0);
  const durs = segments.map(s => Math.max(0.5, Number(s.durationSec) || 3));
  const totalVideo = durs.reduce((a, b) => a + b, 0) - xf * Math.max(0, segments.length - 1);

  const args = [];
  for (const s of segments) { args.push('-loop', '1', '-t', '0', '-i', s.image); } // -t replaced below
  // fix per-input -t to its duration
  let ti = 0;
  for (let k = 0; k < args.length; k++) { if (args[k] === '-t') { args[k + 1] = String(durs[ti]); ti++; } }

  let audioInputIndex = -1, bgmInputIndex = -1;
  if (voiceover) { audioInputIndex = segments.length + (bgm ? 0 : 0); args.push('-i', voiceover); }
  if (bgm) { bgmInputIndex = segments.length + (voiceover ? 1 : 0); args.push('-i', bgm); }

  const fc = [];
  segments.forEach((s, i) => fc.push(clipFilter(i, W, H, fps, durs[i], kenBurns)));

  let vLabel;
  if (segments.length === 1) {
    vLabel = '[v0]';
  } else if (xf === 0) {
    const ins = segments.map((_, i) => `[v${i}]`).join('');
    fc.push(`${ins}concat=n=${segments.length}:v=1:a=0[vout]`);
    vLabel = '[vout]';
  } else {
    // chain xfade; offset accumulates by (duration so far - xf*index)
    let prev = '[v0]';
    let acc = durs[0];
    for (let i = 1; i < segments.length; i++) {
      const off = (acc - xf).toFixed(3);
      const out = (i === segments.length - 1) ? '[vout]' : `[x${i}]`;
      fc.push(`${prev}[v${i}]xfade=transition=fade:duration=${xf}:offset=${off}${out}`);
      prev = out;
      acc = acc - xf + durs[i];
    }
    vLabel = '[vout]';
  }

  // audio graph
  let aLabel = null;
  if (voiceover && bgm) {
    fc.push(`[${audioInputIndex}:a]aresample=48000[vo]`);
    fc.push(`[${bgmInputIndex}:a]volume=${bgmVolume},aresample=48000[bg]`);
    fc.push(`[vo][bg]amix=inputs=2:duration=first:dropout_transition=2[aout]`);
    aLabel = '[aout]';
  } else if (voiceover) {
    fc.push(`[${audioInputIndex}:a]aresample=48000[aout]`); aLabel = '[aout]';
  } else if (bgm) {
    fc.push(`[${bgmInputIndex}:a]volume=${bgmVolume},aresample=48000[aout]`); aLabel = '[aout]';
  }

  args.push('-filter_complex', fc.join(';'));
  args.push('-map', vLabel);
  if (aLabel) args.push('-map', aLabel);
  args.push('-r', String(fps), '-pix_fmt', 'yuv420p', '-c:v', 'libx264', '-preset', 'medium', '-crf', '20');
  if (aLabel) args.push('-c:a', 'aac', '-b:a', '192k', '-shortest');
  args.push('-movflags', '+faststart', '-y', output);

  if (onProgress) onProgress({ pct: 0, stage: 'start', total: Math.round(totalVideo) });
  await run(args, (line) => {
    const m = line.match(/time=(\d+:\d+:\d+\.\d+)/);
    if (m && onProgress) {
      const cur = hmsToSec(m[1]);
      onProgress({ pct: Math.min(99, Math.round((cur / totalVideo) * 100)), stage: 'encoding' });
    }
  });
  if (onProgress) onProgress({ pct: 100, stage: 'done' });
  return { output, durationSec: Math.round(totalVideo) };
}

// Escape a path for use inside ffmpeg's subtitles filter (Windows-safe).
function escapeSubPath(p) {
  return p.replace(/\\/g, '/').replace(/:/g, '\\:').replace(/'/g, "\\'");
}

// Burn an .srt onto a video (hardcoded captions). Great for Shorts/TikTok.
async function burnSubtitles(job, onProgress) {
  const { input, srt, output, fontSize = 22, primaryColour = '&H00FFFFFF', outline = 2, marginV = 40, vertical = false } = job;
  if (!input || !srt || !output) throw new Error('Thiếu input / srt / output.');
  const style = `FontName=Arial,FontSize=${fontSize},PrimaryColour=${primaryColour},BorderStyle=1,Outline=${outline},Shadow=0,Alignment=2,MarginV=${marginV}`;
  const vf = `subtitles='${escapeSubPath(srt)}':force_style='${style}'`;
  const info = await probe(input);
  const total = info.durationSec || 0;
  const args = ['-i', input, '-vf', vf, '-c:v', 'libx264', '-preset', 'medium', '-crf', '20',
    '-c:a', 'copy', '-movflags', '+faststart', '-y', output];
  if (onProgress) onProgress({ pct: 0, stage: 'start' });
  await run(args, (line) => {
    const m = line.match(/time=(\d+:\d+:\d+\.\d+)/);
    if (m && total && onProgress) onProgress({ pct: Math.min(99, Math.round((hmsToSec(m[1]) / total) * 100)), stage: 'burning subtitles' });
  });
  if (onProgress) onProgress({ pct: 100, stage: 'done' });
  return { output };
}

module.exports = { assembleVideo, probe, burnSubtitles };
