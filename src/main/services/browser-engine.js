// Browser engine — drives the user's installed Chrome via Playwright persistent contexts.
// Each "profile" is an isolated Chrome user-data dir, so multiple muse.ai accounts stay
// logged in independently. Clean-room implementation.
const { chromium } = require('playwright-core');
const path = require('node:path');
const fs = require('node:fs');

function findChrome() {
  const envP = process.env.MUSEAUTO_CHROME;
  const guesses = [
    envP,
    path.join(process.env['ProgramFiles'] || 'C:/Program Files', 'Google/Chrome/Application/chrome.exe'),
    path.join(process.env['ProgramFiles(x86)'] || 'C:/Program Files (x86)', 'Google/Chrome/Application/chrome.exe'),
    path.join(process.env['LOCALAPPDATA'] || '', 'Google/Chrome/Application/chrome.exe'),
    path.join(process.env['ProgramFiles(x86)'] || 'C:/Program Files (x86)', 'Microsoft/Edge/Application/msedge.exe')
  ].filter(Boolean);
  return guesses.find(p => { try { return fs.existsSync(p); } catch { return false; } }) || null;
}

const open = new Map(); // profileId -> { context, page }

async function launch({ profileId = 'default', profilesRoot, headless = false, chromePath }) {
  if (open.has(profileId)) return open.get(profileId);
  const exe = chromePath || findChrome();
  if (!exe) throw new Error('Không tìm thấy Chrome/Edge. Đặt đường dẫn ở Cài đặt hoặc biến MUSEAUTO_CHROME.');
  const userDataDir = path.join(profilesRoot, profileId);
  fs.mkdirSync(userDataDir, { recursive: true });

  const context = await chromium.launchPersistentContext(userDataDir, {
    executablePath: exe,
    headless,
    viewport: { width: 1366, height: 860 },
    args: ['--no-first-run', '--no-default-browser-check', '--disable-blink-features=AutomationControlled']
  });
  const page = context.pages()[0] || await context.newPage();
  const entry = { context, page, exe, userDataDir };
  open.set(profileId, entry);
  context.on('close', () => open.delete(profileId));
  return entry;
}

async function goto({ profileId, url, profilesRoot, chromePath, headless }) {
  const { page } = await launch({ profileId, profilesRoot, chromePath, headless });
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
  return { url: page.url(), title: await page.title() };
}

async function close(profileId) {
  const e = open.get(profileId);
  if (e) { try { await e.context.close(); } catch { /* ignore */ } open.delete(profileId); return true; }
  return false;
}

async function closeAll() { for (const id of [...open.keys()]) await close(id); }

function getPage(profileId) { const e = open.get(profileId); return e ? e.page : null; }

module.exports = { launch, goto, close, closeAll, getPage, findChrome };
