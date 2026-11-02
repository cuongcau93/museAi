// Persistent JSON stores in Electron userData. Clean-room reimplementation of the
// original app's studio.json / settings model.
const { app } = require('electron');
const fs = require('node:fs');
const path = require('node:path');

function dir() { return app.getPath('userData'); }
function filePath(name) { return path.join(dir(), name); }

function readJson(name, fallback) {
  try { return JSON.parse(fs.readFileSync(filePath(name), 'utf8')); } catch { return fallback; }
}
function writeJson(name, obj) {
  try { fs.writeFileSync(filePath(name), JSON.stringify(obj, null, 2)); return true; } catch { return false; }
}

// ---------- studio store ----------
function emptyStudio() {
  return {
    projects: [{ id: 'default', name: 'default' }],
    current: 'default',
    characters: [],                 // {id,name,images:[],description?,source?,approved?,isMain?}
    templates: [],                  // {id,name,text}
    model: { on: false, images: [] },     // fixed model, max 3
    rotate: { on: false, images: [], idx: 0 } // rotating pool, max 20
  };
}
function getStudio() {
  const s = readJson('studio.json', null);
  if (!s) { const d = emptyStudio(); writeJson('studio.json', d); return d; }
  // ensure shape
  return { ...emptyStudio(), ...s, model: { ...emptyStudio().model, ...(s.model || {}) }, rotate: { ...emptyStudio().rotate, ...(s.rotate || {}) } };
}
function saveStudio(patch) {
  const cur = getStudio();
  const next = { ...cur, ...patch };
  if (patch.model) next.model = { ...cur.model, ...patch.model };
  if (patch.rotate) next.rotate = { ...cur.rotate, ...patch.rotate };
  writeJson('studio.json', next);
  return next;
}

// ---------- image store (copies imported images into userData/assets) ----------
function assetsDir() {
  const d = path.join(dir(), 'assets');
  fs.mkdirSync(d, { recursive: true });
  return d;
}
function addImage({ filePath: src, dataUrl } = {}) {
  const d = assetsDir();
  const name = 'img_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  if (dataUrl) {
    const m = dataUrl.match(/^data:image\/(\w+);base64,(.+)$/);
    if (!m) return null;
    const out = path.join(d, `${name}.${m[1] === 'jpeg' ? 'jpg' : m[1]}`);
    fs.writeFileSync(out, Buffer.from(m[2], 'base64'));
    return out;
  }
  if (src && fs.existsSync(src)) {
    const ext = path.extname(src) || '.png';
    const out = path.join(d, `${name}${ext}`);
    fs.copyFileSync(src, out);
    return out;
  }
  return null;
}

// ---------- projects ----------
function listProjects() { return getStudio().projects; }
function addProject(name) {
  const s = getStudio();
  const id = 'prj_' + Date.now().toString(36);
  s.projects.push({ id, name: (name || 'Dự án ' + (s.projects.length)).trim() });
  saveStudio({ projects: s.projects });
  return { id, name };
}
function updateProject(id, patch) {
  const s = getStudio();
  s.projects = s.projects.map(p => p.id === id ? { ...p, ...patch } : p);
  saveStudio({ projects: s.projects });
  return s.projects;
}
function setCurrentProject(id) { saveStudio({ current: id }); return id; }
function removeProject(id) {
  if (id === 'default') return getStudio().projects;
  const s = getStudio();
  s.projects = s.projects.filter(p => p.id !== id);
  const patch = { projects: s.projects };
  if (s.current === id) patch.current = 'default';
  saveStudio(patch);
  return s.projects;
}
function projectById(id) { return getStudio().projects.find(p => p.id === id) || null; }

module.exports = {
  dir, filePath, readJson, writeJson,
  getStudio, saveStudio, emptyStudio, addImage, assetsDir,
  listProjects, addProject, updateProject, setCurrentProject, removeProject, projectById
};
