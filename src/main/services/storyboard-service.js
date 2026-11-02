// Storyboard service — turn a narration script into scene-by-scene image prompts.
// Clean-room: a deterministic segmenter + prompt composer. Optionally, an LLM can be
// plugged in later via an HTTP endpoint; here we stay fully offline and self-contained.

const STYLE_PRESETS = {
  'stick-figure': 'minimalist stick-figure cartoon: round white heads with dot eyes, thin single-line bodies, thick black outlines, a few flat accent colors, plain light background',
  'flat-vector': 'clean flat vector illustration, bold shapes, limited harmonious palette, soft shadows, modern editorial look',
  'storybook': 'soft watercolor storybook illustration, warm textures, gentle lighting, hand-drawn feel',
  'cinematic': 'cinematic 3D render, dramatic lighting, shallow depth of field, photoreal materials',
  'anime': 'clean anime style, crisp lineart, cel shading, expressive characters, vibrant but balanced colors'
};

// Split into scenes: by blank lines first; long paragraphs are split further by sentence
// so each scene is roughly `targetWords` long (one image per scene).
function splitScenes(script, targetWords = 32) {
  const paras = script.replace(/\r/g, '').split(/\n{2,}/).map(s => s.trim()).filter(Boolean);
  const scenes = [];
  for (const p of paras) {
    const sentences = p.match(/[^.!?。！？\n]+[.!?。！？]?/g) || [p];
    let buf = [];
    let count = 0;
    for (const s of sentences) {
      const w = s.trim().split(/\s+/).length;
      buf.push(s.trim());
      count += w;
      if (count >= targetWords) { scenes.push(buf.join(' ').trim()); buf = []; count = 0; }
    }
    if (buf.length) scenes.push(buf.join(' ').trim());
  }
  return scenes.filter(Boolean);
}

// Very light keyword lift so each prompt names concrete subjects from its own text.
function keySubjects(text) {
  const stop = new Set('the a an and or but of to in on at for with without into from by is are was were be been being this that these those you your we our they he she it his her their them i me my as so if then than when while because about over under up down out off not no yes do does did done have has had will would can could should may might must co va la cua mot nhung nguoi khi vi nen'.split(/\s+/));
  const freq = {};
  for (const w of text.toLowerCase().match(/[\p{L}][\p{L}'-]{2,}/gu) || []) {
    if (stop.has(w)) continue;
    freq[w] = (freq[w] || 0) + 1;
  }
  return Object.entries(freq).sort((a, b) => b[1] - a[1]).slice(0, 5).map(x => x[0]);
}

function buildStoryboard(input = {}) {
  const {
    script = '',
    stylePreset = 'stick-figure',
    customStyle = '',
    characters = [],       // [{name, description}]
    aspect = '16:9',
    targetWords = 32
  } = input;

  const style = (customStyle && customStyle.trim()) || STYLE_PRESETS[stylePreset] || STYLE_PRESETS['flat-vector'];
  const charLine = characters.filter(c => c && c.name).map(c => `${c.name}: ${c.description || ''}`.trim());
  const charBlock = charLine.length ? ` Recurring characters (keep identical every time) — ${charLine.join('; ')}.` : '';

  const scenes = splitScenes(script, Number(targetWords) || 32);
  const segments = scenes.map((text, i) => {
    const subjects = keySubjects(text);
    const subjHint = subjects.length ? ` Focus on: ${subjects.join(', ')}.` : '';
    const prompt = `${style}. Scene ${i + 1}.${subjHint}${charBlock} Aspect ${aspect}. No text, no logos, no watermark.`;
    return {
      index: i + 1,
      narration: text,
      imagePrompt: prompt,
      negativePrompt: 'text, caption, watermark, logo, extra fingers, deformed, blurry, low quality',
      durationSec: Math.max(2.5, Math.min(8, Math.round((text.split(/\s+/).length / 2.6) * 10) / 10))
    };
  });

  return {
    style,
    aspect,
    sceneCount: segments.length,
    totalEstSec: Math.round(segments.reduce((a, s) => a + s.durationSec, 0)),
    segments
  };
}

module.exports = { buildStoryboard, STYLES: STYLE_PRESETS };
