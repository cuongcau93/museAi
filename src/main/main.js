// MuseAuto Studio — main process (clean-room implementation, not derived from any other app's code)
const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const path = require('node:path');
const fs = require('node:fs');

const { buildStoryboard } = require('./services/storyboard-service.js');
const { assembleVideo, probe, burnSubtitles } = require('./services/ffmpeg-service.js');
const { transcribe } = require('./services/whisper-service.js');
const tts = require('./services/tts-service.js');
const museai = require('./services/museai-automation.js');
const engine = require('./services/browser-engine.js');
const llm = require('./services/llm-service.js');
const social = require('./services/social-service.js');
const stores = require('./core/stores.js');
const media = require('./core/media.js');
const queue = require('./core/task-queue.js');
const apiServer = require('./core/api-server.js');
const clone = require('./core/clone-orchestrator.js');

const ROOT = path.resolve(__dirname, '..', '..');

function profilesRoot() { return path.join(app.getPath('userData'), 'profiles'); }

// forward a named event to the renderer: event:<name>
function sendEvent(name, payload) {
  if (win && !win.isDestroyed()) win.webContents.send('event:' + name, payload);
}

// ---- accounts stored in settings (array of {id,name}) ----
function listAccounts() { const s = loadSettings(); return s.accounts || []; }
function saveAccounts(arr) { const s = loadSettings(); s.accounts = arr; saveSettings(s); return arr; }

// ---- tiny JSON settings store (user data dir) ----
function settingsPath() { return path.join(app.getPath('userData'), 'settings.json'); }
function loadSettings() {
  try { return JSON.parse(fs.readFileSync(settingsPath(), 'utf8')); } catch { return {}; }
}
function saveSettings(obj) {
  try { fs.writeFileSync(settingsPath(), JSON.stringify(obj, null, 2)); return true; } catch { return false; }
}

let win;
function createWindow() {
  win = new BrowserWindow({
    width: 1180, height: 780, minWidth: 900, minHeight: 600,
    backgroundColor: '#0f1117',
    title: 'MuseAuto Studio',
    webPreferences: {
      preload: path.join(__dirname, '..', 'preload', 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });
  win.removeMenu();
  win.loadFile(path.join(ROOT, 'src', 'renderer', 'index.html'));
}

app.whenReady().then(() => {
  createWindow();
  // init task queue (executor context from settings) and local API server
  queue.init({
    emit: (task) => {
      sendEvent('task-update', { task });
      if (task && task.status === 'succeeded' && task.kind === 'video') sendEvent('video-completed', { task });
    },
    ctx: () => {
      const s = loadSettings();
      return {
        executor: s.taskExecutor || 'demo',
        outputDir: media.outputDir(),
        profilesRoot: profilesRoot(),
        chromePath: s.chromePath,
        selectors: s.museSelectors || {}
      };
    },
    maxConcurrent: 1
  });
  try { apiServer.start({ onCrmJob: (job) => sendEvent('crm-job', job) }); } catch (e) { /* ignore */ }
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });

// progress helper: forward to renderer
function emitProgress(channel, payload) {
  if (win && !win.isDestroyed()) win.webContents.send('job:progress', { channel, ...payload });
}

// ---------------- IPC ----------------
ipcMain.handle('settings:get', () => loadSettings());
ipcMain.handle('settings:set', (_e, obj) => { const cur = loadSettings(); const next = { ...cur, ...obj }; saveSettings(next); return next; });

ipcMain.handle('dialog:openFiles', async (_e, opts) => {
  const r = await dialog.showOpenDialog(win, { properties: ['openFile', 'multiSelections'], ...(opts || {}) });
  return r.canceled ? [] : r.filePaths;
});
ipcMain.handle('dialog:openDir', async () => {
  const r = await dialog.showOpenDialog(win, { properties: ['openDirectory'] });
  return r.canceled ? null : r.filePaths[0];
});
ipcMain.handle('dialog:saveFile', async (_e, opts) => {
  const r = await dialog.showSaveDialog(win, opts || {});
  return r.canceled ? null : r.filePath;
});
ipcMain.handle('shell:showItem', (_e, p) => { if (p) shell.showItemInFolder(p); });

ipcMain.handle('storyboard:build', (_e, input) => buildStoryboard(input));

ipcMain.handle('ffmpeg:probe', (_e, file) => probe(file));
ipcMain.handle('ffmpeg:assemble', async (_e, job) => {
  return assembleVideo(job, (p) => emitProgress('ffmpeg', p));
});

ipcMain.handle('whisper:transcribe', async (_e, job) => {
  const s = loadSettings();
  return transcribe({ ...job, whisperBin: s.whisperBin, whisperModel: s.whisperModel },
    (p) => emitProgress('whisper', p));
});

// ---- TTS ----
ipcMain.handle('tts:voices', () => tts.COMMON_VOICES);
ipcMain.handle('tts:synthesize', (_e, job) => tts.synthesize(job, (p) => emitProgress('tts', p)));
ipcMain.handle('tts:batch', (_e, job) => tts.synthesizeBatch(job, (p) => emitProgress('tts', p)));

// ---- accounts / profiles ----
ipcMain.handle('accounts:list', () => listAccounts());
ipcMain.handle('accounts:add', (_e, name) => {
  const arr = listAccounts();
  const id = 'acc_' + Date.now().toString(36);
  arr.push({ id, name: name || ('Tài khoản ' + (arr.length + 1)) });
  return saveAccounts(arr);
});
ipcMain.handle('accounts:remove', (_e, id) => saveAccounts(listAccounts().filter(a => a.id !== id)));

// ---- muse.ai automation ----
function museCtx(extra = {}) {
  const s = loadSettings();
  return { profilesRoot: profilesRoot(), chromePath: s.chromePath, selectors: s.museSelectors || {}, ...extra };
}
ipcMain.handle('muse:open', (_e, { profileId, url }) => museai.openMuseAI(museCtx({ profileId, url })));
ipcMain.handle('muse:checkLogin', (_e, { profileId }) => museai.checkLogin({ profileId }));
ipcMain.handle('muse:generateBatch', (_e, { profileId, prompts, downloadDir }) =>
  museai.generateBatch(museCtx({ profileId, prompts, downloadDir }), (p) => emitProgress('muse', p)));
ipcMain.handle('muse:closeProfile', (_e, { profileId }) => engine.close(profileId));
ipcMain.handle('muse:findChrome', () => engine.findChrome());

// ---- LLM (Claude) ----
ipcMain.handle('llm:writeScript', (_e, job) => {
  const s = loadSettings();
  return llm.writeScript({ ...job, apiKey: s.claudeApiKey, model: s.claudeModel }, (p) => emitProgress('llm', p));
});
ipcMain.handle('llm:storyboard', (_e, job) => {
  const s = loadSettings();
  return llm.storyboardAI({ ...job, apiKey: s.claudeApiKey, model: s.claudeModel }, (p) => emitProgress('llm', p));
});

// ---- burn subtitles ----
ipcMain.handle('ffmpeg:burnSubs', (_e, job) => burnSubtitles(job, (p) => emitProgress('burn', p)));

// ---- social ----
ipcMain.handle('social:fbPost', (_e, { profileId, text, autoPublish }) => {
  const s = loadSettings();
  return social.postFacebook({ profileId, text, autoPublish, profilesRoot: profilesRoot(), chromePath: s.chromePath, selectors: s.fbSelectors || {} },
    (p) => emitProgress('social', p));
});
ipcMain.handle('social:openSite', (_e, { profileId, url }) => {
  const s = loadSettings();
  return social.openSite({ profileId, url, profilesRoot: profilesRoot(), chromePath: s.chromePath });
});

// ---- tasks ----
ipcMain.handle('tasks:submit', (_e, p) => queue.submit(p));
ipcMain.handle('tasks:list', () => queue.list());
ipcMain.handle('tasks:run', (_e, ids) => queue.run(ids));
ipcMain.handle('tasks:cancel', (_e, id) => queue.cancel(id));
ipcMain.handle('tasks:retry', (_e, id) => queue.retry(id));
ipcMain.handle('tasks:remove', (_e, id) => queue.remove(id));
ipcMain.handle('tasks:stop-all', () => queue.stopAll());
ipcMain.handle('tasks:clear-finished', () => queue.clearFinished());

// ---- studio store ----
ipcMain.handle('studio:get', () => stores.getStudio());
ipcMain.handle('studio:save', (_e, patch) => { const n = stores.saveStudio(patch); sendEvent('studio-update', n); return n; });
ipcMain.handle('studio:add-image', (_e, arg) => stores.addImage(arg));

// ---- projects ----
ipcMain.handle('projects:add', (_e, name) => { const r = stores.addProject(name); sendEvent('studio-update', stores.getStudio()); return r; });
ipcMain.handle('projects:update', (_e, { id, patch }) => { const r = stores.updateProject(id, patch); sendEvent('studio-update', stores.getStudio()); return r; });
ipcMain.handle('projects:set-current', (_e, id) => { const r = stores.setCurrentProject(id); sendEvent('studio-update', stores.getStudio()); return r; });
ipcMain.handle('projects:remove', (_e, id) => { const r = stores.removeProject(id); sendEvent('studio-update', stores.getStudio()); return r; });

// ---- media / library ----
ipcMain.handle('media:list-library', () => media.listLibrary());
ipcMain.handle('media:list-videos', () => media.listVideos());
ipcMain.handle('media:trash', (_e, paths) => media.trash(paths));
ipcMain.handle('media:reveal', (_e, p) => media.reveal(p));
ipcMain.handle('media:open-path', (_e, p) => media.openPath(p));
ipcMain.handle('media:open-output-folder', () => media.openOutputFolder());
ipcMain.handle('media:select-file', (_e, o) => media.selectFile(o));
ipcMain.handle('media:select-folder', () => media.selectFolder());
ipcMain.handle('media:select-images', (_e, multi) => media.selectImages(multi));
ipcMain.handle('media:select-video', () => media.selectVideo());
ipcMain.handle('media:copy-file', (_e, o) => media.copyFile(o));
ipcMain.handle('media:merge', (_e, o) => media.mergeVideos({ ...o, onProgress: (p) => sendEvent('merge-progress', p) }));

// ---- clone pipeline ----
ipcMain.handle('clone:styles', () => clone.stylesList());
ipcMain.handle('clone:analyze', (_e, o) => clone.analyze(o, (p) => sendEvent('clone-progress', p)));
ipcMain.handle('clone:split', (_e, o) => clone.split(o));
ipcMain.handle('clone:write-scenes', (_e, o) => clone.writeScenes(o));
ipcMain.handle('clone:merge-clips', (_e, o) => clone.mergeClips(o, (p) => sendEvent('clone-progress', p)));

// ---- local API server ----
ipcMain.handle('api:status', () => apiServer.status());
ipcMain.handle('api:start', () => apiServer.start({ onCrmJob: (job) => sendEvent('crm-job', job) }));
ipcMain.handle('api:stop', () => apiServer.stop());
ipcMain.handle('api:get-key', (_e, regen) => apiServer.getApiKey(!!regen));
ipcMain.handle('api:probe', () => apiServer.probe());

app.on('before-quit', () => { engine.closeAll().catch(() => {}); });
