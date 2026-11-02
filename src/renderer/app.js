// Renderer logic
const $ = (id) => document.getElementById(id);
const api = window.api;

// ---- nav ----
document.querySelectorAll('.nav button').forEach(b => b.onclick = () => {
  document.querySelectorAll('.nav button').forEach(x => x.classList.remove('active'));
  document.querySelectorAll('.view').forEach(x => x.classList.remove('active'));
  b.classList.add('active');
  $(b.dataset.view).classList.add('active');
});

// ---- progress routing ----
const progress = {};
api.onProgress(({ channel, pct, stage }) => {
  const map = { ffmpeg: ['v-prog', 'v-log'], whisper: ['s-prog', 's-log'], tts: ['t-prog', 't-log'], muse: ['m-prog', 'm-log'], llm: ['ai-prog', 'ai-log'], social: ['so-prog', 'so-log'], burn: ['b-prog', 'b-log'] };
  const m = map[channel];
  if (m) { $(m[0]).style.width = (pct || 0) + '%'; log(m[1], stage + ' … ' + (pct || 0) + '%'); }
});
function log(id, msg) { const el = $(id); el.style.display = 'block'; el.textContent = (el.textContent + '\n' + msg).trim().split('\n').slice(-200).join('\n'); el.scrollTop = el.scrollHeight; }

// ================= STORYBOARD =================
let lastBoard = null;
$('sb-run').onclick = async () => {
  const chars = $('sb-chars').value.split('\n').map(l => l.trim()).filter(Boolean).map(l => {
    const [name, ...rest] = l.split('|'); return { name: (name || '').trim(), description: rest.join('|').trim() };
  });
  const board = await api.storyboard.build({
    script: $('sb-script').value,
    stylePreset: $('sb-style').value,
    aspect: $('sb-aspect').value,
    targetWords: +$('sb-words').value || 32,
    characters: chars
  });
  lastBoard = board;
  const out = $('sb-out');
  if (!board.segments.length) { out.innerHTML = '<div class="warn">Chưa có nội dung kịch bản.</div>'; return; }
  out.innerHTML = `<div class="card"><span class="pill">${board.sceneCount} cảnh</span>
    <span class="pill">~${board.totalEstSec}s</span>
    <span class="pill">${board.aspect}</span></div>` +
    board.segments.map(s => `<div class="seg">
      <h4>Cảnh ${s.index} · ${s.durationSec}s</h4>
      <p>${esc(s.narration)}</p>
      <div class="prm"><b>Prompt:</b> ${esc(s.imagePrompt)}</div>
    </div>`).join('');
};
$('sb-copy').onclick = async () => {
  if (!lastBoard) return;
  const txt = lastBoard.segments.map(s => `#${s.index}\n${s.imagePrompt}`).join('\n\n');
  await navigator.clipboard.writeText(txt);
  $('sb-copy').textContent = 'Đã copy!'; setTimeout(() => $('sb-copy').textContent = 'Copy tất cả prompt', 1200);
};
function esc(s) { return (s || '').replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c])); }

// ================= VIDEO =================
let images = [], voiceover = null, bgm = null, lastVideo = null;
$('v-pick-imgs').onclick = async () => {
  const f = await api.dialog.openFiles({ filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp', 'bmp'] }] });
  if (f.length) { images = f; $('v-img-count').textContent = f.length + ' ảnh';
    $('v-imglist').innerHTML = f.map(p => esc(p.split(/[\\/]/).pop())).join('<br>'); }
};
$('v-pick-vo').onclick = async () => { const f = await api.dialog.openFiles({ filters: [{ name: 'Audio', extensions: ['mp3', 'wav', 'm4a', 'aac'] }] }); if (f[0]) { voiceover = f[0]; $('v-vo').textContent = f[0].split(/[\\/]/).pop(); } };
$('v-pick-bgm').onclick = async () => { const f = await api.dialog.openFiles({ filters: [{ name: 'Audio', extensions: ['mp3', 'wav', 'm4a', 'aac'] }] }); if (f[0]) { bgm = f[0]; $('v-bgm').textContent = f[0].split(/[\\/]/).pop(); } };
$('v-run').onclick = async () => {
  if (!images.length) { alert('Hãy chọn ảnh trước.'); return; }
  const out = await api.dialog.saveFile({ defaultPath: 'video.mp4', filters: [{ name: 'MP4', extensions: ['mp4'] }] });
  if (!out) return;
  const [w, h] = $('v-res').value.split('x').map(Number);
  const dur = +$('v-dur').value || 3.5;
  $('v-run').disabled = true; $('v-prog').style.width = '0%';
  try {
    const r = await api.ffmpeg.assemble({
      segments: images.map(img => ({ image: img, durationSec: dur })),
      width: w, height: h, fps: +$('v-fps').value || 30,
      transition: (+$('v-xf').value > 0) ? 'fade' : 'none', transitionSec: +$('v-xf').value || 0,
      kenBurns: $('v-kb').checked,
      voiceover, bgm, bgmVolume: +$('v-bgmvol').value || 0.18,
      output: out
    });
    lastVideo = r.output; $('v-open').disabled = false; log('v-log', '✅ Xong: ' + r.output + ' (' + r.durationSec + 's)');
  } catch (e) { log('v-log', '❌ ' + e.message); alert('Lỗi: ' + e.message); }
  $('v-run').disabled = false;
};
$('v-open').onclick = () => lastVideo && api.shell.showItem(lastVideo);

// ================= SUBTITLES =================
let subInput = null, lastSrt = null;
$('s-pick').onclick = async () => { const f = await api.dialog.openFiles({ filters: [{ name: 'Media', extensions: ['mp4', 'mkv', 'mov', 'mp3', 'wav', 'm4a', 'aac', 'webm'] }] }); if (f[0]) { subInput = f[0]; $('s-file').textContent = f[0].split(/[\\/]/).pop(); } };
$('s-run').onclick = async () => {
  if (!subInput) { alert('Chọn file video/audio trước.'); return; }
  $('s-run').disabled = true; $('s-prog').style.width = '0%';
  try {
    const r = await api.whisper.transcribe({ input: subInput, language: $('s-lang').value });
    if (r.exists) { lastSrt = r.srt; $('s-open').disabled = false; log('s-log', '✅ Đã tạo: ' + r.srt); }
    else log('s-log', '⚠️ Không thấy file .srt — kiểm tra lại whisper.');
  } catch (e) { log('s-log', '❌ ' + e.message); alert('Lỗi: ' + e.message); }
  $('s-run').disabled = false;
};
$('s-open').onclick = () => lastSrt && api.shell.showItem(lastSrt);

// ================= SETTINGS =================
async function refreshSettings() {
  const s = await api.settings.get();
  $('set-wbin-v').textContent = s.whisperBin ? s.whisperBin.split(/[\\/]/).pop() : '—';
  $('set-wmodel-v').textContent = s.whisperModel ? s.whisperModel.split(/[\\/]/).pop() : '—';
}
$('set-wbin').onclick = async () => { const f = await api.dialog.openFiles({ filters: [{ name: 'exe', extensions: ['exe'] }] }); if (f[0]) { await api.settings.set({ whisperBin: f[0] }); refreshSettings(); } };
$('set-wmodel').onclick = async () => { const f = await api.dialog.openFiles({ filters: [{ name: 'model', extensions: ['bin', 'gguf'] }] }); if (f[0]) { await api.settings.set({ whisperModel: f[0] }); refreshSettings(); } };
$('set-chrome').onclick = async () => { const f = await api.dialog.openFiles({ filters: [{ name: 'exe', extensions: ['exe'] }] }); if (f[0]) { await api.settings.set({ chromePath: f[0] }); loadMuseSettings(); } };
$('sel-save').onclick = async () => {
  await api.settings.set({
    taskExecutor: $('sel-exec').value,
    museSelectors: {
      generateUrl: $('sel-url').value.trim() || undefined,
      promptInput: $('sel-input').value.trim() || undefined,
      generateButton: $('sel-btn').value.trim() || undefined,
      resultImage: $('sel-img').value.trim() || undefined,
      uploadInput: $('sel-upload').value.trim() || undefined
    }
  });
  $('sel-saved').style.display = 'inline-block'; setTimeout(() => $('sel-saved').style.display = 'none', 1500);
};
async function loadMuseSettings() {
  const s = await api.settings.get();
  $('set-chrome-v').textContent = s.chromePath ? s.chromePath.split(/[\\/]/).pop() : 'tự dò';
  const sel = s.museSelectors || {};
  $('sel-url').value = sel.generateUrl || '';
  $('sel-input').value = sel.promptInput || '';
  $('sel-btn').value = sel.generateButton || '';
  $('sel-img').value = sel.resultImage || '';
  $('sel-upload').value = sel.uploadInput || '';
  $('sel-exec').value = s.taskExecutor || 'demo';
}
refreshSettings(); loadMuseSettings();

// ================= ACCOUNTS =================
async function refreshAccounts() {
  const accs = await api.accounts.list();
  $('acc-list').innerHTML = accs.length ? accs.map(a =>
    `<div class="seg" style="display:flex;justify-content:space-between;align-items:center">
      <span>${esc(a.name)} <span class="pill">${a.id}</span></span>
      <button class="btn sec" data-del="${a.id}" style="flex:0 0 auto">Xoá</button></div>`).join('')
    : '<p class="hint">Chưa có tài khoản nào. Thêm một tài khoản để bắt đầu.</p>';
  $('acc-list').querySelectorAll('[data-del]').forEach(b => b.onclick = async () => { await api.accounts.remove(b.dataset.del); refreshAccounts(); });
  const opts = accs.map(a => `<option value="${a.id}">${esc(a.name)}</option>`).join('');
  $('m-acc').innerHTML = opts;
  if ($('so-acc')) $('so-acc').innerHTML = opts;
}
$('acc-add').onclick = async () => { const n = $('acc-name').value.trim(); await api.accounts.add(n); $('acc-name').value = ''; refreshAccounts(); };
refreshAccounts();

// ================= MUSE.AI =================
let museDir = null;
function curProfile() { return $('m-acc').value || 'default'; }
$('m-open').onclick = async () => {
  try { const r = await api.muse.open({ profileId: curProfile() }); $('m-status').textContent = 'đã mở: ' + (r.title || r.url); log('m-log', r.note || ''); }
  catch (e) { log('m-log', '❌ ' + e.message); alert(e.message); }
};
$('m-check').onclick = async () => {
  const r = await api.muse.checkLogin({ profileId: curProfile() });
  $('m-status').textContent = !r.open ? 'chưa mở' : (r.loggedIn ? '✅ đã đăng nhập' : '⚠️ chưa đăng nhập');
};
$('m-from-sb').onclick = () => {
  if (!lastBoard) { alert('Hãy tạo Storyboard trước.'); return; }
  $('m-prompts').value = lastBoard.segments.map(s => s.imagePrompt).join('\n');
};
$('m-pick-dir').onclick = async () => { const d = await api.dialog.openDir(); if (d) { museDir = d; $('m-dir').textContent = d; } };
$('m-run').onclick = async () => {
  const prompts = $('m-prompts').value.split('\n').map(s => s.trim()).filter(Boolean);
  if (!prompts.length) { alert('Chưa có prompt.'); return; }
  if (!museDir) { alert('Chọn thư mục lưu ảnh.'); return; }
  $('m-run').disabled = true; $('m-prog').style.width = '0%';
  try {
    const r = await api.muse.generateBatch({ profileId: curProfile(), prompts, downloadDir: museDir });
    const ok = r.results.filter(x => x.ok).length;
    log('m-log', `✅ Xong: ${ok}/${r.results.length} ảnh. Lưu tại ${museDir}`);
    r.results.filter(x => !x.ok).forEach(x => log('m-log', '  ✗ ' + x.prompt.slice(0, 40) + ' → ' + x.error));
  } catch (e) { log('m-log', '❌ ' + e.message); alert(e.message); }
  $('m-run').disabled = false;
};

// ================= TTS =================
let lastTts = null;
async function loadVoices() {
  const vs = await api.tts.voices();
  $('t-voice').innerHTML = vs.map(v => `<option value="${v.id}">${esc(v.label)}</option>`).join('');
}
loadVoices();
$('t-from-sb').onclick = () => {
  if (!lastBoard) { alert('Hãy tạo Storyboard trước.'); return; }
  $('t-text').value = lastBoard.segments.map(s => s.narration).join('\n');
};
$('t-run').onclick = async () => {
  const text = $('t-text').value.trim();
  if (!text) { alert('Nhập nội dung.'); return; }
  const out = await api.dialog.saveFile({ defaultPath: 'voiceover.mp3', filters: [{ name: 'MP3', extensions: ['mp3'] }] });
  if (!out) return;
  $('t-run').disabled = true; $('t-prog').style.width = '0%';
  try {
    const r = await api.tts.synthesize({ text, voice: $('t-voice').value, rate: $('t-rate').value, output: out });
    if (r.exists) { lastTts = r.output; $('t-open').disabled = false; log('t-log', `✅ Xong: ${r.output} (${Math.round(r.bytes / 1024)} KB)`); }
    else log('t-log', '⚠️ Không tạo được file.');
  } catch (e) { log('t-log', '❌ ' + e.message); alert(e.message); }
  $('t-run').disabled = false;
};
$('t-open').onclick = () => lastTts && api.shell.showItem(lastTts);

// ================= AI SCRIPT (Claude) =================
$('ai-write').onclick = async () => {
  const topic = $('ai-topic').value.trim();
  if (!topic) { alert('Nhập chủ đề.'); return; }
  $('ai-write').disabled = true; $('ai-prog').style.width = '0%';
  try {
    const r = await api.llm.writeScript({ topic, language: $('ai-lang').value, minutes: +$('ai-min').value || 3 });
    $('ai-script').value = r.script; $('ai-board').disabled = false;
    log('ai-log', '✅ Đã viết kịch bản (' + (r.usage ? r.usage.output_tokens + ' tokens' : '') + ')');
  } catch (e) { log('ai-log', '❌ ' + e.message); alert(e.message); }
  $('ai-write').disabled = false;
};
$('ai-board').onclick = async () => {
  const script = $('ai-script').value.trim();
  if (!script) { alert('Chưa có kịch bản.'); return; }
  $('ai-board').disabled = true; $('ai-prog').style.width = '0%';
  try {
    const b = await api.llm.storyboard({ script, stylePreset: $('ai-style').value, language: $('ai-lang').value });
    lastBoard = b; // share with muse.ai / TTS / video tabs
    $('ai-out').innerHTML = `<div class="card"><span class="pill">${b.sceneCount} cảnh</span>
      <span class="pill">~${b.totalEstSec}s</span> <span class="pill">${esc(b.model || '')}</span>
      <div class="prm" style="margin-top:8px"><b>Style:</b> ${esc(b.style)}</div>
      <div class="prm"><b>Nhân vật:</b> ${esc((b.characters || []).map(c => c.name).join(', '))}</div></div>` +
      b.segments.map(s => `<div class="seg"><h4>Cảnh ${s.index} · ${s.durationSec}s</h4>
        <p>${esc(s.narration)}</p><div class="prm"><b>Prompt:</b> ${esc(s.imagePrompt)}</div></div>`).join('');
    log('ai-log', '✅ Phân cảnh xong — đã đồng bộ sang muse.ai / Giọng đọc. Dùng nút "Lấy từ Storyboard" ở các tab đó.');
  } catch (e) { log('ai-log', '❌ ' + e.message); alert(e.message); }
  $('ai-board').disabled = false;
};

// ================= BURN SUBTITLES =================
let bVid = null, bSrt = null, lastBurn = null;
$('b-vid').onclick = async () => { const f = await api.dialog.openFiles({ filters: [{ name: 'Video', extensions: ['mp4', 'mkv', 'mov', 'webm'] }] }); if (f[0]) { bVid = f[0]; $('b-vid-v').textContent = f[0].split(/[\\/]/).pop(); } };
$('b-srt').onclick = async () => { const f = await api.dialog.openFiles({ filters: [{ name: 'Subtitle', extensions: ['srt', 'ass'] }] }); if (f[0]) { bSrt = f[0]; $('b-srt-v').textContent = f[0].split(/[\\/]/).pop(); } };
$('b-run').onclick = async () => {
  if (!bVid || !bSrt) { alert('Chọn video và file .srt.'); return; }
  const out = await api.dialog.saveFile({ defaultPath: 'video-sub.mp4', filters: [{ name: 'MP4', extensions: ['mp4'] }] });
  if (!out) return;
  $('b-run').disabled = true; $('b-prog').style.width = '0%';
  try {
    const r = await api.ffmpeg.burnSubs({ input: bVid, srt: bSrt, output: out, fontSize: +$('b-font').value || 22 });
    lastBurn = r.output; $('b-open').disabled = false; log('b-log', '✅ Xong: ' + r.output);
  } catch (e) { log('b-log', '❌ ' + e.message); alert(e.message); }
  $('b-run').disabled = false;
};
$('b-open').onclick = () => lastBurn && api.shell.showItem(lastBurn);

// ================= SOCIAL =================
$('so-fb').onclick = async () => {
  const text = $('so-text').value.trim();
  if (!text) { alert('Nhập nội dung.'); return; }
  const pid = $('so-acc').value || 'default';
  $('so-fb').disabled = true; $('so-prog').style.width = '0%';
  try {
    const r = await api.social.fbPost({ profileId: pid, text, autoPublish: $('so-auto').checked });
    log('so-log', (r.published ? '✅ Đã đăng.' : '✅ ' + (r.note || 'Đã soạn, hãy tự bấm Đăng.')));
  } catch (e) { log('so-log', '❌ ' + e.message); alert(e.message); }
  $('so-fb').disabled = false;
};
$('so-open').onclick = async () => {
  const url = $('so-url').value.trim(); if (!url) { alert('Nhập URL.'); return; }
  try { await api.social.openSite({ profileId: $('so-acc').value || 'default', url }); }
  catch (e) { alert(e.message); }
};

// ================= CLAUDE SETTINGS =================
$('set-claude-save').onclick = async () => {
  await api.settings.set({ claudeApiKey: $('set-claude-key').value.trim() || undefined, claudeModel: $('set-claude-model').value.trim() || undefined });
  $('set-claude-saved').style.display = 'inline-block'; setTimeout(() => $('set-claude-saved').style.display = 'none', 1500);
};
(async () => {
  const s = await api.settings.get();
  if (s.claudeApiKey) $('set-claude-key').value = s.claudeApiKey;
  $('set-claude-model').value = s.claudeModel || 'claude-opus-5-5';
})();
