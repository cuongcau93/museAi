// Full-parity views: clone pipeline, studio queue, assets, library, api, theme, i18n.
const $ = (id) => document.getElementById(id);
const api = window.api;
const esc = (s) => (s || '').toString().replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const fileUrl = (p) => p ? 'file:///' + encodeURI(p.replace(/\\/g, '/')) : '';
function plog(id, msg) { const el = $(id); if (!el) return; el.style.display = 'block'; el.textContent = (el.textContent + '\n' + msg).trim().split('\n').slice(-200).join('\n'); el.scrollTop = el.scrollHeight; }

// ======== THEME + LANG ========
(function themeInit() {
  const saved = (() => { try { return localStorage.getItem('muse.theme'); } catch { return null; } })() || 'dark';
  document.body.setAttribute('data-theme', saved);
  $('theme-toggle').textContent = saved === 'light' ? '☀️' : '🌙';
  $('theme-toggle').onclick = () => {
    const next = document.body.getAttribute('data-theme') === 'light' ? 'dark' : 'light';
    document.body.setAttribute('data-theme', next);
    $('theme-toggle').textContent = next === 'light' ? '☀️' : '🌙';
    try { localStorage.setItem('muse.theme', next); } catch {}
  };
})();
const I18N = {
  vi: { clone: '🎞️ Clone', ai: '✨ AI kịch bản', storyboard: '📝 Storyboard', studio: '🧩 Studio (hàng đợi)', museai: '🤖 muse.ai', tts: '🔊 Giọng đọc', video: '🎬 Ghép video', subs: '💬 Phụ đề', assets: '📦 Tư liệu', library: '🗂️ Thư viện', social: '📣 Đăng MXH', api: '🔌 API', settings: '⚙️ Cài đặt' },
  en: { clone: '🎞️ Clone', ai: '✨ AI Script', storyboard: '📝 Storyboard', studio: '🧩 Studio (queue)', museai: '🤖 muse.ai', tts: '🔊 Voice', video: '🎬 Video', subs: '💬 Subtitles', assets: '📦 Assets', library: '🗂️ Library', social: '📣 Social', api: '🔌 API', settings: '⚙️ Settings' }
};
(function langInit() {
  const saved = (() => { try { return localStorage.getItem('muse.lang'); } catch { return null; } })() || 'vi';
  $('lang-select').value = saved;
  const apply = (lang) => { const d = I18N[lang] || I18N.vi; document.querySelectorAll('.nav button[data-view]').forEach(b => { const t = d[b.dataset.view]; if (t) b.textContent = t; }); };
  apply(saved);
  $('lang-select').onchange = () => { const l = $('lang-select').value; apply(l); try { localStorage.setItem('muse.lang', l); } catch {} };
})();

// ======== shared: projects dropdowns + studio data ========
let STUDIO = null;
async function loadStudio() { STUDIO = await api.studio.get(); fillProjectSelects(); renderAssets(); renderCast(); }
// fixed-character reference images (first image of each character that has one)
function castImages() { return (STUDIO && STUDIO.characters || []).filter(c => c.images && c.images.length).map(c => ({ name: c.name, imageLocalPath: c.images[0] })); }
function renderCast() {
  const el = $('cl-cast'); if (!el) return;
  const cast = castImages();
  el.innerHTML = cast.length ? 'Nhân vật cố định: ' + cast.map(c => esc(c.name)).join(', ') : '<span class="hint">Chưa có nhân vật nào có ảnh trong tab Tư liệu.</span>';
}
function fillProjectSelects() {
  if (!STUDIO) return;
  const opts = STUDIO.projects.map(p => `<option value="${p.id}">${esc(p.name)}</option>`).join('');
  for (const id of ['cl-project', 'st-project']) { const el = $(id); if (el) { el.innerHTML = opts; el.value = STUDIO.current; } }
}
api.on.studioUpdate((s) => { STUDIO = s; fillProjectSelects(); renderAssets(); renderCast(); });

// ======== central task bus ========
let TASKS = [];
const taskHandlers = []; // fns(task)
async function loadTasks() { const r = await api.tasks.list(); TASKS = r.tasks || []; renderQueue(); }
api.on.taskUpdate(({ task }) => {
  if (!task) return;
  if (task.removed) TASKS = TASKS.filter(t => t.id !== task.id);
  else { const i = TASKS.findIndex(t => t.id === task.id); if (i >= 0) TASKS[i] = task; else TASKS.unshift(task); }
  renderQueue();
  taskHandlers.forEach(h => { try { h(task); } catch {} });
});

// ======== CLONE pipeline ========
const clone = { scriptPath: null, audioPath: null, style: '', stylePreset: 'stick-figure', characters: [], transcript: '', cards: [], merged: null, imgTasks: {}, clipTasks: {} };
async function cloneStyles() {
  const r = await api.clone.styles();
  $('cl-style').innerHTML = (r.styles || []).map(s => `<option value="${s.key}">${esc(s.label)}</option>`).join('');
}
$('cl-script').onclick = async () => { const f = await api.media.selectFile({ title: 'Kịch bản', filters: [{ name: 'Text', extensions: ['txt', 'md', 'srt'] }] }); if (f) { clone.scriptPath = f; clone.audioPath = null; $('cl-src').textContent = f.split(/[\\/]/).pop(); } };
$('cl-audio').onclick = async () => { const f = await api.media.selectFile({ title: 'Audio', filters: [{ name: 'Audio', extensions: ['mp3', 'wav', 'm4a', 'aac'] }] }); if (f) { clone.audioPath = f; clone.scriptPath = null; $('cl-src').textContent = f.split(/[\\/]/).pop(); } };
api.on.cloneProgress(({ percent, message }) => { if (percent != null) $('cl-prog').style.width = percent + '%'; if (message) plog('cl-log', message); });

$('cl-analyze').onclick = async () => {
  if (!clone.scriptPath && !clone.audioPath) { alert('Chọn kịch bản hoặc audio.'); return; }
  clone.stylePreset = $('cl-style').value;
  $('cl-analyze').disabled = true;
  try {
    const r = await api.clone.analyze({ scriptPath: clone.scriptPath, audioPath: clone.audioPath, lang: $('cl-lang').value, stylePreset: clone.stylePreset });
    clone.style = r.style; clone.characters = r.characters || []; clone.transcript = r.transcript || '';
    $('cl-style-info').innerHTML = `<div class="card"><div class="prm"><b>Style:</b> ${esc(clone.style)}</div>
      <div class="prm"><b>Nhân vật:</b> ${esc(clone.characters.map(c => c.name).join(', ') || '(không)')}</div></div>`;
    $('cl-split').disabled = false;
    plog('cl-log', '✅ Phân tích xong.');
  } catch (e) { plog('cl-log', '❌ ' + e.message); alert(e.message); }
  $('cl-analyze').disabled = false;
};
$('cl-split').onclick = async () => {
  const r = await api.clone.split({ transcript: clone.transcript, maxSeconds: +$('cl-beat').value || 9, stylePreset: clone.stylePreset });
  clone.cards = r.cards || []; renderCards(); $('cl-write').disabled = false;
  plog('cl-log', `✅ Tách ${clone.cards.length} cảnh.`);
};
$('cl-write').onclick = async () => {
  const r = await api.clone.writeScenes({ cards: clone.cards, style: clone.style, characters: clone.characters, ratio: $('cl-ratio').value, stylePreset: clone.stylePreset, lang: $('cl-lang').value });
  clone.cards = r.cards || clone.cards; renderCards(); $('cl-images').disabled = false;
  plog('cl-log', `✅ Viết prompt cho ${r.wrote} cảnh.`);
};
$('cl-images').onclick = async () => {
  clone.imgTasks = {};
  const cast = $('cl-usecast').checked ? castImages().slice(0, 4) : [];
  for (const c of clone.cards) {
    if (!c.prompt) continue;
    const t = await api.tasks.submit({ kind: 'image', prompt: c.prompt, ratio: $('cl-ratio').value, project: $('cl-project').value, label: 'clone #' + c.n, images: cast });
    clone.imgTasks[t.id] = c.n; c.status = 'queued'; c.taskId = t.id;
  }
  renderCards(); plog('cl-log', '⏳ Đã đưa ảnh vào hàng đợi' + (cast.length ? ' (gắn ' + cast.length + ' nhân vật cố định).' : '.'));
};
$('cl-clips').onclick = async () => {
  clone.clipTasks = {};
  for (const c of clone.cards) {
    if (!c.file) continue;
    const t = await api.tasks.submit({ kind: 'video', prompt: c.prompt, ratio: $('cl-ratio').value, project: $('cl-project').value, label: 'clip #' + c.n, images: [{ imageLocalPath: c.file }] });
    clone.clipTasks[t.id] = c.n; c.clipStatus = 'queued'; c.clipTaskId = t.id;
  }
  renderCards(); plog('cl-log', '⏳ Đã đưa clip vào hàng đợi.');
};
$('cl-merge').onclick = async () => {
  const paths = clone.cards.map(c => c.clipFile).filter(Boolean);
  if (paths.length < 1) { alert('Chưa có clip.'); return; }
  plog('cl-log', '⏳ Ghép ' + paths.length + ' clip…');
  const r = await api.clone.mergeClips({ paths, name: 'clone_' + Date.now(), audio: clone.audioPath, muteVoice: false });
  if (r.success) { clone.merged = r.path; $('cl-open-merged').disabled = false; plog('cl-log', '✅ Video: ' + r.path); }
  else plog('cl-log', '❌ ' + (r.error || 'merge lỗi'));
};
$('cl-open-merged').onclick = () => clone.merged && api.media.reveal(clone.merged);

// clone reacts to task updates
taskHandlers.push((task) => {
  if (clone.imgTasks[task.id] != null) {
    const c = clone.cards.find(x => x.n === clone.imgTasks[task.id]); if (!c) return;
    c.status = task.status;
    if (task.status === 'succeeded' && task.files && task.files[0]) { c.file = task.files[0]; }
    renderCards();
    if (clone.cards.every(x => !x.prompt || x.file)) $('cl-clips').disabled = false;
  }
  if (clone.clipTasks[task.id] != null) {
    const c = clone.cards.find(x => x.n === clone.clipTasks[task.id]); if (!c) return;
    c.clipStatus = task.status;
    if (task.status === 'succeeded' && task.files && task.files[0]) c.clipFile = task.files[0];
    renderCards();
    if (clone.cards.some(x => x.clipFile)) $('cl-merge').disabled = false;
  }
});
function renderCards() {
  $('cl-scenes').innerHTML = clone.cards.map(c => `<div class="seg">
    <h4>Cảnh ${c.n} · ${c.duration || c.end || ''}s ${c.file ? '· ✅ ảnh' : c.status ? '· ' + esc(c.status) : ''} ${c.clipFile ? '· 🎬 clip' : c.clipStatus ? '· clip:' + esc(c.clipStatus) : ''}</h4>
    ${c.file ? `<img src="${fileUrl(c.file)}" style="max-height:120px;border-radius:6px;margin:4px 0">` : ''}
    <p>${esc(c.text)}</p>
    ${c.prompt ? `<div class="prm"><b>Prompt:</b> ${esc(c.prompt)}</div>` : ''}
  </div>`).join('');
}

// ======== STUDIO QUEUE ========
function promptsFrom(text) { return text.split(/\n\s*\n/).map(s => s.trim()).filter(Boolean); }
$('st-prompt').oninput = () => { $('st-count').textContent = promptsFrom($('st-prompt').value).length + ' prompt'; };
async function submitStudio(held) {
  const ps = promptsFrom($('st-prompt').value);
  if (!ps.length) { alert('Nhập prompt.'); return; }
  for (const p of ps) await api.tasks.submit({ kind: $('st-kind').value, ratio: $('st-ratio').value, project: $('st-project').value, prompt: p, held });
  plog('cl-log', '');
}
$('st-run').onclick = () => submitStudio(false);
$('st-hold').onclick = () => submitStudio(true);
$('sq-runall').onclick = () => api.tasks.run();
$('sq-stop').onclick = () => api.tasks.stopAll();
$('sq-clear').onclick = () => api.tasks.clearFinished();
function chip(s) { const m = { queued: '⏳ chờ', processing: '⚙️ chạy', succeeded: '✅ xong', failed: '❌ lỗi', cancelled: '⛔ huỷ' }; return m[s] || s; }
function renderQueue() {
  const el = $('sq-list'); if (!el) return;
  $('sq-count').textContent = TASKS.length + ' task';
  el.innerHTML = TASKS.map(t => `<div class="seg" style="display:flex;gap:10px;align-items:center">
    ${t.files && t.files[0] && /\.(png|jpg|jpeg|webp)$/i.test(t.files[0]) ? `<img src="${fileUrl(t.files[0])}" style="width:56px;height:56px;object-fit:cover;border-radius:6px">` : `<span class="pill">${t.kind}</span>`}
    <div style="flex:1;min-width:0">
      <div><b>${esc(t.label || t.prompt.slice(0, 40))}</b> <span class="pill">${chip(t.status)}</span> ${t.step ? '<span class="pill">' + esc(t.step) + '</span>' : ''}</div>
      <div class="prm" style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(t.prompt)}</div>
      ${t.error ? '<div class="prm" style="color:#e5534b">' + esc(t.error) + '</div>' : ''}
    </div>
    <div class="btns" style="margin:0">
      ${t.status === 'processing' ? `<button class="btn sec" data-c="${t.id}">Dừng</button>` : ''}
      ${['failed', 'cancelled', 'queued'].includes(t.status) ? `<button class="btn sec" data-r="${t.id}">Chạy</button>` : ''}
      ${t.files && t.files[0] ? `<button class="btn sec" data-o="${t.files[0]}">Mở</button>` : ''}
      <button class="btn sec" data-x="${t.id}">Xoá</button>
    </div></div>`).join('') || '<p class="hint">Chưa có task.</p>';
  el.querySelectorAll('[data-c]').forEach(b => b.onclick = () => api.tasks.cancel(b.dataset.c));
  el.querySelectorAll('[data-r]').forEach(b => b.onclick = () => api.tasks.run([b.dataset.r]));
  el.querySelectorAll('[data-x]').forEach(b => b.onclick = () => api.tasks.remove(b.dataset.x));
  el.querySelectorAll('[data-o]').forEach(b => b.onclick = () => api.media.reveal(b.dataset.o));
}

// ======== ASSETS ========
$('as-prj-add').onclick = async () => { const n = $('as-prj-name').value.trim(); if (!n) return; await api.projects.add(n); $('as-prj-name').value = ''; };
$('as-char-add').onclick = async () => { const s = await api.studio.get(); s.characters.push({ id: 'chr_' + Date.now().toString(36), name: 'Nhân vật', images: [] }); await api.studio.save({ characters: s.characters }); };
$('as-tpl-add').onclick = async () => { const s = await api.studio.get(); s.templates.push({ id: 'tpl_' + Date.now().toString(36), name: 'Mẫu', text: '' }); await api.studio.save({ templates: s.templates }); };
function renderAssets() {
  if (!STUDIO) return;
  const pl = $('as-prj-list'); if (pl) pl.innerHTML = STUDIO.projects.map(p => `<div class="seg" style="display:flex;justify-content:space-between;align-items:center">
    <span>${esc(p.name)} ${p.id === STUDIO.current ? '<span class="pill">hiện tại</span>' : ''}</span>
    <div class="btns" style="margin:0">${p.id !== 'default' ? `<button class="btn sec" data-use="${p.id}">Chọn</button><button class="btn sec" data-pdel="${p.id}">Xoá</button>` : ''}</div></div>`).join('');
  if (pl) { pl.querySelectorAll('[data-use]').forEach(b => b.onclick = () => api.projects.setCurrent(b.dataset.use)); pl.querySelectorAll('[data-pdel]').forEach(b => b.onclick = () => confirm('Xoá dự án?') && api.projects.remove(b.dataset.pdel)); }

  const cc = $('as-chars'); if (cc) cc.innerHTML = STUDIO.characters.map((c, i) => `<div class="seg">
    <div class="row"><input data-cname="${i}" value="${esc(c.name)}"><button class="btn sec" data-cdel="${i}" style="flex:0 0 auto">Xoá</button></div>
    <div style="display:flex;gap:6px;margin-top:6px;flex-wrap:wrap">${(c.images || []).map((im, j) => `<span style="position:relative"><img src="${fileUrl(im)}" style="width:54px;height:54px;object-fit:cover;border-radius:6px"><button class="btn sec" data-cimgx="${i}:${j}" style="position:absolute;top:-6px;right:-6px;padding:0 6px">✕</button></span>`).join('')}
      ${(c.images || []).length < 3 ? `<button class="btn sec" data-cimgadd="${i}">+ Ảnh</button>` : ''}</div></div>`).join('') || '<p class="hint">Chưa có nhân vật.</p>';
  if (cc) {
    cc.querySelectorAll('[data-cname]').forEach(inp => inp.onchange = async () => { const s = await api.studio.get(); s.characters[+inp.dataset.cname].name = inp.value; api.studio.save({ characters: s.characters }); });
    cc.querySelectorAll('[data-cdel]').forEach(b => b.onclick = async () => { const s = await api.studio.get(); s.characters.splice(+b.dataset.cdel, 1); api.studio.save({ characters: s.characters }); });
    cc.querySelectorAll('[data-cimgadd]').forEach(b => b.onclick = async () => { const imgs = await api.media.selectImages(true); if (!imgs.length) return; const s = await api.studio.get(); const idx = +b.dataset.cimgadd; for (const im of imgs) { const stored = await api.studio.addImage({ filePath: im.filePath }); if (stored) s.characters[idx].images.push(stored); } api.studio.save({ characters: s.characters }); });
    cc.querySelectorAll('[data-cimgx]').forEach(b => b.onclick = async () => { const [i, j] = b.dataset.cimgx.split(':').map(Number); const s = await api.studio.get(); s.characters[i].images.splice(j, 1); api.studio.save({ characters: s.characters }); });
  }
  const tc = $('as-tpls'); if (tc) tc.innerHTML = STUDIO.templates.map((t, i) => `<div class="seg">
    <div class="row"><input data-tname="${i}" value="${esc(t.name)}"><button class="btn sec" data-tdel="${i}" style="flex:0 0 auto">Xoá</button></div>
    <textarea data-ttext="${i}" style="min-height:60px;margin-top:6px">${esc(t.text)}</textarea></div>`).join('') || '<p class="hint">Chưa có mẫu.</p>';
  if (tc) {
    tc.querySelectorAll('[data-tname]').forEach(inp => inp.onchange = async () => { const s = await api.studio.get(); s.templates[+inp.dataset.tname].name = inp.value; api.studio.save({ templates: s.templates }); });
    tc.querySelectorAll('[data-ttext]').forEach(inp => inp.onchange = async () => { const s = await api.studio.get(); s.templates[+inp.dataset.ttext].text = inp.value; api.studio.save({ templates: s.templates }); });
    tc.querySelectorAll('[data-tdel]').forEach(b => b.onclick = async () => { const s = await api.studio.get(); s.templates.splice(+b.dataset.tdel, 1); api.studio.save({ templates: s.templates }); });
  }
}

// ======== LIBRARY ========
let libFiles = [], libFilter = 'all', libSel = [];
async function loadLibrary() { libFiles = await api.media.listLibrary(); const st = await api.apiServer.status(); renderLibrary(); }
document.querySelectorAll('#library [data-f]').forEach(b => b.onclick = () => { libFilter = b.dataset.f; renderLibrary(); });
$('lib-reload').onclick = loadLibrary;
$('lib-open').onclick = () => api.media.openOutputFolder();
$('lib-trash').onclick = async () => { if (!libSel.length) return; if (!confirm('Xoá ' + libSel.length + ' mục vào Thùng rác?')) return; await api.media.trash(libSel); libSel = []; loadLibrary(); };
$('lib-merge').onclick = async () => { const vids = libSel.filter(p => /\.(mp4|mov|mkv|webm)$/i.test(p)); if (vids.length < 2) { alert('Chọn ≥2 video.'); return; } const r = await api.media.merge({ paths: vids, name: 'merge_' + Date.now() }); if (r.success) { alert('Đã ghép: ' + r.path); libSel = []; loadLibrary(); } else alert('Lỗi: ' + r.error); };
api.on.videoCompleted(() => loadLibrary());
function renderLibrary() {
  $('lib-path').textContent = '';
  const items = libFiles.filter(f => libFilter === 'all' || f.kind === libFilter);
  $('lib-sel').textContent = 'Đã chọn ' + libSel.length;
  $('lib-merge').disabled = libSel.filter(p => /\.(mp4|mov|mkv|webm)$/i.test(p)).length < 2;
  $('lib-trash').disabled = libSel.length === 0;
  $('library-grid').innerHTML = items.map(f => `<div class="seg" style="padding:6px;cursor:pointer;${libSel.includes(f.localPath) ? 'outline:2px solid var(--accent)' : ''}" data-pick="${esc(f.localPath)}">
    ${f.kind === 'video' ? `<video src="${fileUrl(f.localPath)}#t=0.1" muted style="width:100%;height:110px;object-fit:cover;border-radius:6px"></video>` : `<img src="${fileUrl(f.localPath)}" style="width:100%;height:110px;object-fit:cover;border-radius:6px">`}
    <div class="prm" style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(f.filename)}</div>
    <button class="btn sec" data-rev="${esc(f.localPath)}" style="padding:2px 8px;margin-top:4px">Mở</button></div>`).join('') || '<p class="hint">Chưa có media. Tạo ảnh/clip ở tab Studio hoặc Clone.</p>';
  $('library-grid').querySelectorAll('[data-pick]').forEach(el => el.onclick = (ev) => { if (ev.target.closest('[data-rev]')) return; const p = el.dataset.pick; const i = libSel.indexOf(p); if (i >= 0) libSel.splice(i, 1); else libSel.push(p); renderLibrary(); });
  $('library-grid').querySelectorAll('[data-rev]').forEach(b => b.onclick = (ev) => { ev.stopPropagation(); api.media.reveal(b.dataset.rev); });
}

// ======== API ========
async function loadApi() {
  const st = await api.apiServer.status();
  $('api-state').textContent = st.running ? '🟢 đang chạy' : '🔴 tắt';
  $('api-endpoint').value = st.endpoint;
  const key = await api.apiServer.getKey(false);
  $('api-key').value = key;
  $('api-curl').textContent = `curl -X POST ${st.endpoint}/api/v1/tasks \\\n  -H "Authorization: Bearer ${key}" \\\n  -H "Content-Type: application/json" \\\n  -d '{"prompt":"a cat astronaut","label":"test"}'`;
}
$('api-start').onclick = async () => { await api.apiServer.start(); loadApi(); };
$('api-stop').onclick = async () => { await api.apiServer.stop(); loadApi(); };
$('api-key-copy').onclick = () => { navigator.clipboard.writeText($('api-key').value); };
$('api-key-new').onclick = async () => { if (!confirm('Tạo key mới? Key cũ sẽ bị vô hiệu.')) return; await api.apiServer.getKey(true); loadApi(); };
$('api-test').onclick = async () => { const r = await api.apiServer.probe(); plog('api-log', 'HTTP ' + (r.status || 0) + ' ' + (r.error || r.body || '')); };

// ======== init ========
loadStudio(); loadTasks(); cloneStyles();
// lazy-load library & api when their tab opens
document.querySelectorAll('.nav button[data-view]').forEach(b => b.addEventListener('click', () => {
  if (b.dataset.view === 'library') loadLibrary();
  if (b.dataset.view === 'api') loadApi();
}));
