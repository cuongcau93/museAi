// Media / Library operations. Clean-room.
const { app, dialog, shell, BrowserWindow } = require('electron');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const stores = require('./stores.js');
let FFMPEG = 'ffmpeg';
try { FFMPEG = require('ffmpeg-static') || 'ffmpeg'; } catch {}

const IMG = ['.png', '.jpg', '.jpeg', '.webp', '.bmp'];
const VID = ['.mp4', '.mov', '.mkv', '.webm'];

function outputDir() {
  const s = stores.readJson('settings.json', {});
  const d = s.outputDir || path.join(stores.dir(), 'output');
  fs.mkdirSync(d, { recursive: true });
  return d;
}
function win() { return BrowserWindow.getAllWindows()[0] || null; }

function walk(dir, acc = []) {
  let entries = [];
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return acc; }
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) walk(full, acc);
    else acc.push(full);
  }
  return acc;
}
function kindOf(p) {
  const ext = path.extname(p).toLowerCase();
  if (IMG.includes(ext)) return 'image';
  if (VID.includes(ext)) return 'video';
  return null;
}
function listLibrary() {
  const base = outputDir();
  const files = walk(base).map(p => { const k = kindOf(p); if (!k) return null; let st; try { st = fs.statSync(p); } catch { return null; } return { localPath: p, filename: path.basename(p), kind: k, timestamp: st.mtimeMs, size: st.size }; }).filter(Boolean);
  files.sort((a, b) => b.timestamp - a.timestamp);
  return files;
}
function listVideos() { return listLibrary().filter(f => f.kind === 'video'); }

async function trash(paths) {
  let n = 0;
  for (const p of paths || []) { try { await shell.trashItem(p); n++; } catch {} }
  return n;
}
function reveal(p) { if (p) shell.showItemInFolder(p); return true; }
function openPath(p) { if (p) shell.openPath(p); return true; }
function openOutputFolder() { shell.openPath(outputDir()); return true; }

async function selectFile({ title, filters } = {}) { const r = await dialog.showOpenDialog(win(), { title, filters, properties: ['openFile'] }); return r.canceled ? null : r.filePaths[0]; }
async function selectFolder() { const r = await dialog.showOpenDialog(win(), { properties: ['openDirectory'] }); return r.canceled ? null : r.filePaths[0]; }
async function selectImages(multi) { const r = await dialog.showOpenDialog(win(), { properties: multi ? ['openFile', 'multiSelections'] : ['openFile'], filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp', 'bmp'] }] }); return r.canceled ? [] : r.filePaths.map(p => ({ filePath: p, dataUrl: null })); }
async function selectVideo() { const r = await dialog.showOpenDialog(win(), { properties: ['openFile'], filters: [{ name: 'Video', extensions: ['mp4', 'mov', 'mkv', 'webm'] }] }); return r.canceled ? null : r.filePaths[0]; }

function copyFile({ path: src, folder, subdir }) {
  if (!src) return null;
  const base = folder || outputDir();
  const dest = subdir ? path.join(base, subdir) : base;
  fs.mkdirSync(dest, { recursive: true });
  const out = path.join(dest, path.basename(src));
  fs.copyFileSync(src, out);
  return out;
}

// Merge video clips (re-encode for compatibility) into one file.
function mergeVideos({ paths, folder, name, audio, onProgress }) {
  return new Promise((resolve) => {
    if (!paths || paths.length === 0) return resolve({ success: false, error: 'Không có clip để ghép.' });
    const outDir = folder || outputDir();
    fs.mkdirSync(outDir, { recursive: true });
    const out = path.join(outDir, (name || 'merged_' + Date.now()) + '.mp4');
    const args = [];
    for (const p of paths) args.push('-i', p);
    if (audio && fs.existsSync(audio)) args.push('-i', audio);
    const n = paths.length;
    const vparts = paths.map((_, i) => `[${i}:v:0]scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2,setsar=1[v${i}]`).join(';');
    const vconcat = paths.map((_, i) => `[v${i}]`).join('') + `concat=n=${n}:v=1:a=0[vout]`;
    const fc = vparts + ';' + vconcat;
    args.push('-filter_complex', fc, '-map', '[vout]');
    if (audio && fs.existsSync(audio)) { args.push('-map', `${n}:a:0`, '-c:a', 'aac', '-shortest'); }
    args.push('-c:v', 'libx264', '-preset', 'veryfast', '-crf', '21', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', '-y', out);
    const pr = spawn(FFMPEG, args, { windowsHide: true });
    let err = '';
    pr.stderr.on('data', d => { err += d; const m = d.toString().match(/time=(\d+:\d+:\d+)/); if (m && onProgress) onProgress({ stage: 'merge ' + m[1] }); });
    pr.on('error', e => resolve({ success: false, error: e.message }));
    pr.on('close', c => c === 0 ? resolve({ success: true, path: out }) : resolve({ success: false, error: err.slice(-400) }));
  });
}

module.exports = {
  outputDir, listLibrary, listVideos, trash, reveal, openPath, openOutputFolder,
  selectFile, selectFolder, selectImages, selectVideo, copyFile, mergeVideos
};
