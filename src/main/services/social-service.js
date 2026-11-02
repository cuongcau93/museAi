// Social posting — automate composing a Facebook post (and open LadiPage) in a logged-in
// Chrome profile. Clean-room, selectors configurable. Reuses the browser-engine profiles.
//
// SAFETY: autoPublish defaults to FALSE — the post is composed and left for you to review and
// click Publish yourself. Auto-posting may violate Facebook's Terms and risks account limits.
// Use only on accounts you own.
const engine = require('./browser-engine.js');

const DEFAULT = {
  fbHome: 'https://www.facebook.com/',
  composerOpen: 'div[role="button"]:has-text("What\'s on your mind"), div[role="button"]:has-text("Bạn đang nghĩ gì")',
  composerBox: 'div[role="dialog"] div[contenteditable="true"], div[contenteditable="true"][role="textbox"]',
  publishButton: 'div[role="dialog"] div[aria-label="Post"], div[aria-label="Đăng"]'
};

async function postFacebook({ profileId, profilesRoot, chromePath, text, selectors = {}, autoPublish = false }, onProgress) {
  const sel = { ...DEFAULT, ...selectors };
  if (onProgress) onProgress({ pct: 10, stage: 'mở Facebook' });
  const { page } = await engine.launch({ profileId, profilesRoot, chromePath, headless: false });
  if (!page.url().includes('facebook.com')) await page.goto(sel.fbHome, { waitUntil: 'domcontentloaded' });

  if (/login|checkpoint/i.test(page.url()))
    throw new Error('Chưa đăng nhập Facebook trong profile này. Hãy đăng nhập trước (phiên sẽ được lưu).');

  if (onProgress) onProgress({ pct: 35, stage: 'mở ô soạn bài' });
  try { await (await page.waitForSelector(sel.composerOpen, { timeout: 15000 })).click(); }
  catch { throw new Error('Không mở được ô soạn bài — chỉnh selector "composerOpen" ở Cài đặt.'); }

  if (onProgress) onProgress({ pct: 60, stage: 'nhập nội dung' });
  const box = await page.waitForSelector(sel.composerBox, { timeout: 15000 });
  await box.click();
  await page.keyboard.type(text, { delay: 8 });

  if (autoPublish) {
    if (onProgress) onProgress({ pct: 85, stage: 'đang đăng' });
    try { await (await page.waitForSelector(sel.publishButton, { timeout: 15000 })).click(); }
    catch { throw new Error('Không bấm được nút Đăng — chỉnh selector "publishButton".'); }
    if (onProgress) onProgress({ pct: 100, stage: 'đã đăng' });
    return { published: true };
  }
  if (onProgress) onProgress({ pct: 100, stage: 'đã soạn — hãy tự bấm Đăng' });
  return { published: false, note: 'Nội dung đã soạn trong cửa sổ Facebook. Kiểm tra rồi bấm Đăng thủ công.' };
}

// LadiPage (or any site): open a URL in the logged-in profile so you can paste/arrange content.
async function openSite({ profileId, profilesRoot, chromePath, url }) {
  const r = await engine.goto({ profileId, url, profilesRoot, chromePath, headless: false });
  return { ...r, note: 'Đã mở trong profile. Đăng nhập nếu cần; phiên được lưu lại.' };
}

module.exports = { postFacebook, openSite, DEFAULT };
