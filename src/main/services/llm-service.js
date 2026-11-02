// LLM service — write narration scripts and art-director storyboards with Claude.
// Uses the official Anthropic SDK. API key is user-provided (Settings), never hardcoded.
const AnthropicNS = require('@anthropic-ai/sdk');
const Anthropic = AnthropicNS.default || AnthropicNS;

const DEFAULT_MODEL = 'claude-opus-5-5';

function clientFor(apiKey) {
  if (!apiKey) throw new Error('Chưa có Claude API key. Mở Cài đặt → dán API key (sk-ant-...).');
  return new Anthropic({ apiKey });
}

function extractText(resp) {
  return (resp.content || []).filter(b => b.type === 'text').map(b => b.text).join('\n').trim();
}

function parseJson(text) {
  let t = text.trim();
  // strip ```json fences if the model added them despite instructions
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) t = fence[1].trim();
  // or grab the outermost {...}
  if (!t.startsWith('{')) { const m = t.match(/\{[\s\S]*\}/); if (m) t = m[0]; }
  return JSON.parse(t);
}

// 1) Write a narration script from a topic.
async function writeScript({ apiKey, model, topic, language = 'Tiếng Việt', minutes = 3, tone = 'cuốn hút, dễ hiểu' }, onProgress) {
  const client = clientFor(apiKey);
  if (onProgress) onProgress({ pct: 20, stage: 'đang viết kịch bản' });
  const words = Math.round(minutes * 150);
  const resp = await client.messages.create({
    model: model || DEFAULT_MODEL,
    max_tokens: 16000,
    thinking: { type: 'adaptive' },
    system: `Bạn là người viết kịch bản video faceless chuyên nghiệp. Viết bằng ${language}, giọng ${tone}. Chỉ trả về nội dung lời dẫn (narration) thuần, chia đoạn rõ ràng bằng dòng trống, KHÔNG chú thích cảnh quay, KHÔNG markdown.`,
    messages: [{ role: 'user', content: `Viết kịch bản khoảng ${words} từ (~${minutes} phút) cho chủ đề: ${topic}` }]
  });
  if (onProgress) onProgress({ pct: 100, stage: 'done' });
  return { script: extractText(resp), model: resp.model, usage: resp.usage };
}

// 2) Turn a script into an art-director storyboard (consistent style + characters).
async function storyboardAI({ apiKey, model, script, stylePreset = 'stick-figure', language = 'Tiếng Việt' }, onProgress) {
  const client = clientFor(apiKey);
  if (onProgress) onProgress({ pct: 20, stage: 'đang phân cảnh' });
  const system = `Bạn là art director cho video faceless. Phân tích kịch bản và trả về JSON MÔ TẢ HÌNH ẢNH (prompt bằng tiếng Anh) để nhất quán nhân vật qua mọi cảnh.
Phong cách gợi ý: ${stylePreset}.
Trả về DUY NHẤT JSON, không markdown:
{"style":"<one-sentence English style>","characters":[{"name":"<short>","description":"<English visual description, reusable word-for-word>"}],"scenes":[{"narration":"<câu lời dẫn gốc>","imagePrompt":"<English prompt mô tả cảnh, bao gồm style + nhân vật liên quan, không chữ/logo>","durationSec":<number>}]}`;
  const resp = await client.messages.create({
    model: model || DEFAULT_MODEL,
    max_tokens: 16000,
    thinking: { type: 'adaptive' },
    system,
    messages: [{ role: 'user', content: `Kịch bản (${language}):\n\n${script}` }]
  });
  if (onProgress) onProgress({ pct: 90, stage: 'parse' });
  let data;
  try { data = parseJson(extractText(resp)); }
  catch (e) { throw new Error('Không parse được JSON từ model: ' + e.message); }
  const scenes = (data.scenes || []).map((s, i) => ({
    index: i + 1,
    narration: s.narration || '',
    imagePrompt: s.imagePrompt || '',
    durationSec: Math.max(2, Number(s.durationSec) || 4)
  }));
  if (onProgress) onProgress({ pct: 100, stage: 'done' });
  return {
    style: data.style || '',
    characters: data.characters || [],
    sceneCount: scenes.length,
    totalEstSec: Math.round(scenes.reduce((a, s) => a + s.durationSec, 0)),
    segments: scenes,
    model: resp.model
  };
}

module.exports = { writeScript, storyboardAI, DEFAULT_MODEL };
