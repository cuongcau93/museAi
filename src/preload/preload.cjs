// Preload — safe bridge between renderer and main (contextIsolation ON)
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  settings: {
    get: () => ipcRenderer.invoke('settings:get'),
    set: (obj) => ipcRenderer.invoke('settings:set', obj)
  },
  dialog: {
    openFiles: (opts) => ipcRenderer.invoke('dialog:openFiles', opts),
    openDir: () => ipcRenderer.invoke('dialog:openDir'),
    saveFile: (opts) => ipcRenderer.invoke('dialog:saveFile', opts)
  },
  shell: { showItem: (p) => ipcRenderer.invoke('shell:showItem', p) },
  storyboard: { build: (input) => ipcRenderer.invoke('storyboard:build', input) },
  ffmpeg: {
    probe: (file) => ipcRenderer.invoke('ffmpeg:probe', file),
    assemble: (job) => ipcRenderer.invoke('ffmpeg:assemble', job),
    burnSubs: (job) => ipcRenderer.invoke('ffmpeg:burnSubs', job)
  },
  llm: {
    writeScript: (job) => ipcRenderer.invoke('llm:writeScript', job),
    storyboard: (job) => ipcRenderer.invoke('llm:storyboard', job)
  },
  social: {
    fbPost: (a) => ipcRenderer.invoke('social:fbPost', a),
    openSite: (a) => ipcRenderer.invoke('social:openSite', a)
  },
  whisper: { transcribe: (job) => ipcRenderer.invoke('whisper:transcribe', job) },
  tts: {
    voices: () => ipcRenderer.invoke('tts:voices'),
    synthesize: (job) => ipcRenderer.invoke('tts:synthesize', job),
    batch: (job) => ipcRenderer.invoke('tts:batch', job)
  },
  accounts: {
    list: () => ipcRenderer.invoke('accounts:list'),
    add: (name) => ipcRenderer.invoke('accounts:add', name),
    remove: (id) => ipcRenderer.invoke('accounts:remove', id)
  },
  muse: {
    open: (a) => ipcRenderer.invoke('muse:open', a),
    checkLogin: (a) => ipcRenderer.invoke('muse:checkLogin', a),
    generateBatch: (a) => ipcRenderer.invoke('muse:generateBatch', a),
    closeProfile: (a) => ipcRenderer.invoke('muse:closeProfile', a),
    findChrome: () => ipcRenderer.invoke('muse:findChrome')
  },
  onProgress: (cb) => {
    const h = (_e, data) => cb(data);
    ipcRenderer.on('job:progress', h);
    return () => ipcRenderer.removeListener('job:progress', h);
  }
});
