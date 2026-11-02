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
  },

  // ---- full-parity feature groups ----
  tasks: {
    submit: (p) => ipcRenderer.invoke('tasks:submit', p),
    list: () => ipcRenderer.invoke('tasks:list'),
    run: (ids) => ipcRenderer.invoke('tasks:run', ids),
    cancel: (id) => ipcRenderer.invoke('tasks:cancel', id),
    retry: (id) => ipcRenderer.invoke('tasks:retry', id),
    remove: (id) => ipcRenderer.invoke('tasks:remove', id),
    stopAll: () => ipcRenderer.invoke('tasks:stop-all'),
    clearFinished: () => ipcRenderer.invoke('tasks:clear-finished')
  },
  studio: {
    get: () => ipcRenderer.invoke('studio:get'),
    save: (patch) => ipcRenderer.invoke('studio:save', patch),
    addImage: (arg) => ipcRenderer.invoke('studio:add-image', arg)
  },
  projects: {
    add: (name) => ipcRenderer.invoke('projects:add', name),
    update: (id, patch) => ipcRenderer.invoke('projects:update', { id, patch }),
    setCurrent: (id) => ipcRenderer.invoke('projects:set-current', id),
    remove: (id) => ipcRenderer.invoke('projects:remove', id)
  },
  media: {
    listLibrary: () => ipcRenderer.invoke('media:list-library'),
    listVideos: () => ipcRenderer.invoke('media:list-videos'),
    trash: (paths) => ipcRenderer.invoke('media:trash', paths),
    reveal: (p) => ipcRenderer.invoke('media:reveal', p),
    openPath: (p) => ipcRenderer.invoke('media:open-path', p),
    openOutputFolder: () => ipcRenderer.invoke('media:open-output-folder'),
    selectFile: (o) => ipcRenderer.invoke('media:select-file', o),
    selectFolder: () => ipcRenderer.invoke('media:select-folder'),
    selectImages: (multi) => ipcRenderer.invoke('media:select-images', multi),
    selectVideo: () => ipcRenderer.invoke('media:select-video'),
    copyFile: (o) => ipcRenderer.invoke('media:copy-file', o),
    merge: (o) => ipcRenderer.invoke('media:merge', o)
  },
  clone: {
    styles: () => ipcRenderer.invoke('clone:styles'),
    analyze: (o) => ipcRenderer.invoke('clone:analyze', o),
    split: (o) => ipcRenderer.invoke('clone:split', o),
    writeScenes: (o) => ipcRenderer.invoke('clone:write-scenes', o),
    mergeClips: (o) => ipcRenderer.invoke('clone:merge-clips', o)
  },
  apiServer: {
    status: () => ipcRenderer.invoke('api:status'),
    start: () => ipcRenderer.invoke('api:start'),
    stop: () => ipcRenderer.invoke('api:stop'),
    getKey: (regen) => ipcRenderer.invoke('api:get-key', regen),
    probe: () => ipcRenderer.invoke('api:probe')
  },
  on: {
    taskUpdate: (cb) => sub('event:task-update', cb),
    studioUpdate: (cb) => sub('event:studio-update', cb),
    videoCompleted: (cb) => sub('event:video-completed', cb),
    cloneProgress: (cb) => sub('event:clone-progress', cb),
    mergeProgress: (cb) => sub('event:merge-progress', cb),
    crmJob: (cb) => sub('event:crm-job', cb)
  }
});

function sub(channel, cb) {
  const h = (_e, data) => cb(data);
  ipcRenderer.on(channel, h);
  return () => ipcRenderer.removeListener(channel, h);
}
