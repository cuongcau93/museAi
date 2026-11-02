// In-process task queue. Clean-room reimplementation of the original app's render queue.
const stores = require('./stores.js');
const executors = require('./executors.js');

let tasks = [];
let emit = () => {};        // (task) => void  -> forwarded to renderer as 'task-update'
let ctxProvider = () => ({});
let running = 0;
let MAX_CONCURRENT = 1;
let loaded = false;

function load() {
  if (loaded) return;
  tasks = stores.readJson('tasks.json', []) || [];
  // reset interrupted tasks
  for (const t of tasks) if (t.status === 'processing') { t.status = 'queued'; t.held = true; t.step = ''; }
  loaded = true;
}
function persist() { stores.writeJson('tasks.json', tasks); }

function init({ emit: e, ctx, maxConcurrent }) {
  emit = e || emit; ctxProvider = ctx || ctxProvider; if (maxConcurrent) MAX_CONCURRENT = maxConcurrent;
  load();
}

function snapshot(t) { return { ...t }; }
function fire(t) { persist(); try { emit(snapshot(t)); } catch {} }

function submit(params = {}) {
  load();
  const t = {
    id: 'task_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    status: 'queued',
    held: !!params.held,
    kind: params.kind === 'video' ? 'video' : 'image',
    ratio: params.ratio || '16:9',
    prompt: params.prompt || '',
    label: params.label || '',
    project: params.project || stores.getStudio().current || 'default',
    accountId: params.accountId || null,
    source: params.source || 'ui',
    expect: params.expect || null,
    images: params.images || [],
    step: '', error: '', files: [],
    createdAt: Date.now(), startedAt: null
  };
  tasks.unshift(t);
  fire(t);
  if (!t.held) pump();
  return snapshot(t);
}

function list() { load(); return { tasks: tasks.map(snapshot) }; }

function run(ids) {
  load();
  const set = new Set(ids || []);
  for (const t of tasks) {
    if ((!ids || set.has(t.id)) && (t.status === 'queued' || t.status === 'failed' || t.status === 'cancelled')) {
      t.status = 'queued'; t.held = false; t.error = ''; fire(t);
    }
  }
  pump();
  return { ok: true };
}
function cancel(id) {
  const t = tasks.find(x => x.id === id); if (!t) return { ok: false };
  if (t.status === 'processing') { t._cancel = true; t.step = 'đang huỷ…'; }
  else { t.status = 'cancelled'; }
  fire(t); return { ok: true };
}
function retry(id) { const t = tasks.find(x => x.id === id); if (t) { t.status = 'queued'; t.held = false; t.error = ''; fire(t); pump(); } return { ok: true }; }
function remove(id) { const t = tasks.find(x => x.id === id); if (t && t.status === 'processing') t._cancel = true; tasks = tasks.filter(x => x.id !== id); persist(); try { emit({ id, removed: true }); } catch {} return { ok: true }; }
function stopAll() { for (const t of tasks) { if (t.status === 'processing') { t._cancel = true; } else if (t.status === 'queued') { t.status = 'cancelled'; fire(t); } } return { ok: true }; }
function clearFinished() { const before = tasks.length; const removed = tasks.filter(t => ['succeeded', 'failed', 'cancelled'].includes(t.status)); tasks = tasks.filter(t => !['succeeded', 'failed', 'cancelled'].includes(t.status)); persist(); for (const t of removed) { try { emit({ id: t.id, removed: true }); } catch {} } return { cleared: before - tasks.length }; }

function nextQueued() { return tasks.filter(t => t.status === 'queued' && !t.held).sort((a, b) => a.createdAt - b.createdAt)[0]; }

async function pump() {
  if (running >= MAX_CONCURRENT) return;
  const t = nextQueued();
  if (!t) return;
  running++;
  t.status = 'processing'; t.startedAt = Date.now(); t.step = 'bắt đầu'; t._cancel = false; fire(t);
  const ctx = ctxProvider() || {};
  try {
    const r = await executors.execute(t, ctx, (step) => { if (!t._cancel) { t.step = step; fire(t); } });
    if (t._cancel) { t.status = 'cancelled'; t.step = ''; fire(t); }
    else { t.status = 'succeeded'; t.step = ''; t.files = r.files || []; fire(t); }
  } catch (e) {
    t.status = t._cancel ? 'cancelled' : 'failed';
    t.error = e.message || String(e); t.step = ''; fire(t);
  } finally {
    running--;
    setImmediate(pump);
  }
}

module.exports = { init, submit, list, run, cancel, retry, remove, stopAll, clearFinished, pump, _tasks: () => tasks };
