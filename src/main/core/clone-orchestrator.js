// Clone pipeline orchestrator. Clean-room. Chains: analyze -> split -> writeScenes -> mergeClips.
// Uses Claude when an API key is set; otherwise falls back to the offline storyboard engine so
// the whole pipeline stays runnable.
const fs = require('node:fs');
const stores = require('./stores.js');
const media = require('./media.js');
const llm = require('../services/llm-service.js');
const { buildStoryboard, STYLES } = require('../services/storyboard-service.js');
const { transcribe } = require('../services/whisper-service.js');

const MAX_SCENE_SECONDS = 9;
function settings() { return stores.readJson('settings.json', {}); }

function stylesList() {
  const keys = Object.keys(STYLES);
  return {
    styles: keys.map(k => ({ key: k, label: k, hint: STYLES[k] })),
    groups: [{ label: 'Phong cách', keys }]
  };
}

async function analyze({ scriptPath, audioPath, lang = 'vi', model = 'base', stylePreset = 'stick-figure', styleCustom } = {}, onProgress) {
  const s = settings();
  let transcript = '';
  if (onProgress) onProgress({ percent: 10, message: 'đọc nguồn' });
  if (scriptPath && fs.existsSync(scriptPath)) {
    transcript = fs.readFileSync(scriptPath, 'utf8');
  } else if (audioPath && fs.existsSync(audioPath)) {
    if (!s.whisperBin || !s.whisperModel) throw new Error('Cần cấu hình Whisper (Cài đặt) để bóc băng audio, hoặc chọn file kịch bản .txt.');
    if (onProgress) onProgress({ percent: 15, message: 'Whisper bóc băng' });
    const srtBase = audioPath.replace(/\.[^.]+$/, '');
    await transcribe({ input: audioPath, language: lang, whisperBin: s.whisperBin, whisperModel: s.whisperModel, outputSrt: srtBase });
    try { transcript = fs.readFileSync(srtBase + '.srt', 'utf8').replace(/\d+\n[\d:,>-\s]+\n/g, '').replace(/\n{2,}/g, '\n'); } catch {}
  } else {
    throw new Error('Chưa chọn kịch bản hoặc audio.');
  }

  const style = (styleCustom && styleCustom.trim()) || STYLES[stylePreset] || STYLES['flat-vector'];
  // LLM path for style + characters
  if (s.claudeApiKey) {
    if (onProgress) onProgress({ percent: 22, message: 'Claude phân tích phong cách & nhân vật' });
    try {
      const board = await llm.storyboardAI({ apiKey: s.claudeApiKey, model: s.claudeModel, script: transcript, stylePreset, language: lang });
      return { transcript, language: lang, style: board.style || style, stylePreset, characters: board.characters || [], segments: board.segments || [], count: (board.characters || []).length, castRule: '' };
    } catch (e) { /* fall through to offline */ }
  }
  return { transcript, language: lang, style, stylePreset, characters: [], segments: [], count: 0, castRule: '' };
}

function split({ transcript, maxSeconds = MAX_SCENE_SECONDS, stylePreset = 'stick-figure' } = {}) {
  const board = buildStoryboard({ script: transcript || '', stylePreset, targetWords: Math.round((maxSeconds || 9) * 2.6) });
  const cards = board.segments.map(s => ({ n: s.index, start: 0, end: s.durationSec, duration: s.durationSec, text: s.narration, prompt: '', characters: [], language: 'vi', status: 'idle', file: null }));
  return { cards, source: 'offline' };
}

async function writeScenes({ cards = [], style = '', characters = [], ratio = '16:9', stylePreset = 'stick-figure', lang = 'vi', indexes } = {}) {
  const s = settings();
  const targets = indexes && indexes.length ? cards.filter(c => indexes.includes(c.n)) : cards;
  if (s.claudeApiKey) {
    try {
      const script = targets.map(c => c.text).join('\n\n');
      const board = await llm.storyboardAI({ apiKey: s.claudeApiKey, model: s.claudeModel, script, stylePreset, language: lang });
      board.segments.forEach((seg, i) => { if (targets[i]) targets[i].prompt = seg.imagePrompt; });
      return { cards, wrote: targets.length };
    } catch (e) { /* fall through */ }
  }
  // offline: compose from style + text
  const styleText = style || STYLES[stylePreset] || '';
  const charLine = characters.filter(c => c && c.name).map(c => `${c.name}: ${c.description || ''}`).join('; ');
  for (const c of targets) {
    c.prompt = `${styleText}. Scene ${c.n}. ${c.text ? 'Depict: ' + c.text.slice(0, 120) : ''}${charLine ? ' Characters (keep identical): ' + charLine + '.' : ''} Aspect ${ratio}. No text, no logos, no watermark.`;
  }
  return { cards, wrote: targets.length };
}

async function mergeClips({ paths, folder, name, audio, muteVoice }, onProgress) {
  const r = await media.mergeVideos({ paths, folder: folder || media.outputDir(), name: name || 'clone_' + Date.now(), audio: muteVoice ? null : audio, onProgress });
  return r;
}

module.exports = { analyze, split, writeScenes, mergeClips, stylesList, MAX_SCENE_SECONDS };
