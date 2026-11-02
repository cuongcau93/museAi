// muse.ai automation — drives muse.ai inside a logged-in Chrome profile to batch-generate
// images/videos from prompts. Clean-room: no muse.ai code is used; selectors are CONFIGURABLE
// because the real DOM may change. Adjust them in Settings → muse.ai selectors.
//
// IMPORTANT: Automating a web service may violate its Terms of Service. Use only on accounts
// you own and are permitted to automate. This module performs no login credential handling —
// you log in manually once per profile; the session is then reused.
const engine = require('./browser-engine.js');
const path = require('node:path');
const fs = require('node:fs');

const DEFAULT_SELECTORS = {
  generateUrl: 'https://muse.ai/',          // page where you create images/videos
  promptInput: 'textarea, [contenteditable="true"], input[type="text"]',
  generateButton: 'button:has-text("Generate"), button:has-text("Create"), button[type="submit"]',
  resultImage: 'img[src^="blob:"], img[src*="muse"], .result img, [data-result] img',
  uploadInput: 'input[type="file"]',        // for fixed-character reference images (optional)
  resultTimeoutMs: 180000
};

async function openMuseAI({ profileId, profilesRoot, chromePath, url }) {
  const target = url || DEFAULT_SELECTORS.generateUrl;
  const r = await engine.goto({ profileId, url: target, profilesRoot, chromePath, headless: false });
  return { ...r, note: 'Nếu chưa đăng nhập, hãy đăng nhập muse.ai trong cửa sổ Chrome vừa mở. Phiên sẽ được lưu lại cho lần sau.' };
}

// Check whether this profile appears logged in (heuristic: not on a login/sign-in page).
async function checkLogin({ profileId }) {
  const page = engine.getPage(profileId);
  if (!page) return { open: false };
  const url = page.url();
  const loggedOut = /login|signin|sign-in|auth/i.test(url);
  return { open: true, url, loggedIn: !loggedOut };
}

async function downloadImageElement(page, handle, outPath) {
  const src = await handle.getAttribute('src');
  if (src && /^https?:/i.test(src)) {
    const resp = await page.request.get(src);
    fs.writeFileSync(outPath, Buffer.from(await resp.body()));
    return outPath;
  }
  // blob:/canvas/unknown → screenshot the element as a fallback
  await handle.screenshot({ path: outPath });
  return outPath;
}

// Generate one image from a prompt. Returns the saved file path.
async function generateImage({ profileId, profilesRoot, chromePath, prompt, selectors = {}, downloadDir, index = 1, refImages = [] }) {
  const sel = { ...DEFAULT_SELECTORS, ...selectors };
  const { page } = await engine.launch({ profileId, profilesRoot, chromePath, headless: false });
  if (!page.url().startsWith('http')) await page.goto(sel.generateUrl, { waitUntil: 'domcontentloaded' });

  // Fixed-character reference images: upload before generating, if a file input is present.
  if (refImages && refImages.length && sel.uploadInput) {
    try {
      const up = await page.waitForSelector(sel.uploadInput, { timeout: 8000, state: 'attached' });
      await up.setInputFiles(refImages.slice(0, 4));
      await page.waitForTimeout(1500);
    } catch { /* no upload control / not supported — continue text-only */ }
  }

  // snapshot current result images so we can detect the NEW one
  const before = new Set(await page.$$eval(sel.resultImage, els => els.map(e => e.getAttribute('src') || '')).catch(() => []));

  const input = await page.waitForSelector(sel.promptInput, { timeout: 30000 });
  await input.click();
  // clear then type
  await page.keyboard.press('Control+A').catch(() => {});
  await input.fill?.(prompt).catch(async () => { await page.keyboard.type(prompt); });
  if (!input.fill) await page.keyboard.type(prompt);

  await (await page.waitForSelector(sel.generateButton, { timeout: 15000 })).click();

  // wait for a NEW result image to appear
  const deadline = Date.now() + sel.resultTimeoutMs;
  let handle = null;
  while (Date.now() < deadline) {
    const imgs = await page.$$(sel.resultImage);
    for (const img of imgs) {
      const src = await img.getAttribute('src');
      if (src && !before.has(src)) { handle = img; break; }
    }
    if (handle) break;
    await page.waitForTimeout(1500);
  }
  if (!handle) throw new Error('Hết thời gian chờ kết quả. Kiểm tra lại selector "resultImage" ở Cài đặt.');

  fs.mkdirSync(downloadDir, { recursive: true });
  const out = path.join(downloadDir, `muse_${String(index).padStart(3, '0')}.png`);
  await downloadImageElement(page, handle, out);
  return { output: out };
}

// Batch: run a list of prompts sequentially through one profile.
async function generateBatch({ profileId, profilesRoot, chromePath, prompts = [], selectors, downloadDir }, onProgress) {
  const results = [];
  for (let i = 0; i < prompts.length; i++) {
    if (onProgress) onProgress({ pct: Math.round((i / prompts.length) * 100), stage: `prompt ${i + 1}/${prompts.length}` });
    try {
      const r = await generateImage({ profileId, profilesRoot, chromePath, prompt: prompts[i], selectors, downloadDir, index: i + 1 });
      results.push({ ok: true, prompt: prompts[i], ...r });
    } catch (e) {
      results.push({ ok: false, prompt: prompts[i], error: e.message });
    }
  }
  if (onProgress) onProgress({ pct: 100, stage: 'done' });
  return { results };
}

module.exports = { openMuseAI, checkLogin, generateImage, generateBatch, DEFAULT_SELECTORS };
