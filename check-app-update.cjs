'use strict';
// Exercise the shipped module, using its real public API and native messages.
// No GitHub request, installer, browser storage, or downloaded file is touched.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, 'dist/app-update.js'), 'utf8');
const tick = () => new Promise(resolve => setImmediate(resolve));
const KEY = 'boji.appUpdate.v1';
function harness({ native = true, prefs = {}, fetchResponse = null } = {}) {
  const handlers = {}, requests = [], timers = new Map(), store = new Map([[KEY, JSON.stringify(prefs)]]), events = [], elements = [];
  let now = 1793310000000, timerId = 0;
  const dot = { hidden: true }, entry = { classList: { toggle: (name, yes) => { entry[name] = yes; } }, setAttribute() {}, querySelector: () => dot };
  const document = { readyState: 'loading', activeElement: null,
    addEventListener(name, fn) { (handlers[name] ||= []).push(fn); },
    querySelectorAll: () => [entry], body: { style: { overflow: '' }, append: el => elements.push(el) },
    createElement() {
      const el = { html: '', notes: { textContent: '' }, className: '', addEventListener() {}, remove() { el.removed = true; }, contains: n => n?.owner === el,
        querySelector: selector => selector === '.boji-update-notes p' ? el.notes : { focus() {}, dataset: {} }, querySelectorAll: () => [],
        set innerHTML(v) { el.html = v; }, get innerHTML() { return el.html; } }; return el;
    }
  };
  const bridge = { postMessage(value) { requests.push(JSON.parse(value)); } };
  const fetches = [];
  const window = { dispatchEvent: event => events.push(event), addEventListener(name, fn) { (handlers[name] ||= []).push(fn); }, ...(native ? { BaojiUpdater: bridge } : {}) };
  class Clock extends Date { static now() { return now; } }
  const context = { window, document, URL, Date: Clock, CustomEvent: class { constructor(name, args) { this.type = name; this.detail = args.detail; } }, AbortController,
    localStorage: { getItem: k => store.get(k) ?? null, setItem: (k, v) => store.set(k, v) },
    setTimeout: (fn, delay) => { const id = ++timerId; timers.set(id, { fn, delay }); return id; }, clearTimeout: id => timers.delete(id),
    fetch: async (url, options) => { fetches.push({ url, options }); if (fetchResponse instanceof Error) throw fetchResponse; return fetchResponse || { ok: false, status: 404 }; }
  };
  vm.createContext(context); vm.runInContext(source, context, { filename: 'actual-app-update.js' });
  return { api: window.BojiAppUpdate, requests, timers, store, dot, entry, elements, events, fetches,
    boot: () => handlers.DOMContentLoaded.forEach(fn => fn()), advance: n => { now += n; },
    attachBridge: () => { window.BaojiUpdater = bridge; }, ready: () => handlers['boji-updater-ready'].forEach(fn => fn()),
    reply(data, { request = requests.at(-1), type = 'result', ok = true, code, message } = {}) { bridge.onmessage({ data: JSON.stringify({ id: request.id, action: request.action, type, ok, data, code, message }) }); },
    click(action) { const el = elements.at(-1); const target = { owner: el, dataset: { updateAction: action }, closest: selector => selector === '[data-update-action]' ? target : null }; handlers.click.forEach(fn => fn({ target, preventDefault() {} })); },
    prefs: () => JSON.parse(store.get(KEY))
  };
}
const current = { versionName: '0.1.3', versionCode: 3 };
const release = { version: '0.2.10', versionCode: 10, tag: 'android-v0.2.10', title: '十月更新', notes: '<img src=x onerror=alert(1)>\n修复训练和饮食记录', size: 180000000, releasePageUrl: 'https://github.com/swaggyer/Build-up-muscles/releases/tag/android-v0.2.10' };
(async () => {
  const v = harness().api.compareVersions;
  assert.equal(v('android-v0.2.10', 'v0.2.9'), 1); assert.equal(v('1.10', '1.9.9'), 1);
  assert.equal(v('0.1.3', 'v0.1.3'), 0); assert.equal(v('1.0', '1.0.0'), 0);
  assert.equal(v('1.0.0-beta.2', '1.0.0-beta.10'), -1); assert.equal(v('1.0.0', '1.0.0-preview'), 1);
  assert.equal(v('invalid', '1.0.0'), null);
  const h = harness(); h.boot(); assert.equal(h.requests.length, 1); assert.equal(h.requests[0].action, 'check');
  assert.equal(h.api.snapshot().opened, false, 'Automatic checks must not open a modal.');
  h.reply({ current, release, available: true }); await tick();
  assert.equal(h.api.snapshot().phase, 'available'); assert.equal(h.dot.hidden, false);
  await h.api.check({ manual: false }); assert.equal(h.requests.length, 1, 'Startup checks are limited to once per 24 hours.');
  const manual = h.api.check(); assert.equal(h.requests.length, 2); h.reply({ current, release, available: true }); await manual;
  h.api.open(); h.reply({ current, release, available: true }); await tick();
  const panel = h.elements.at(-1); assert.equal(panel.notes.textContent, release.notes);
  assert.equal(panel.html.includes('<img src=x'), false, 'Release notes must be text, never injected HTML.');
  h.click('skip'); assert.equal(h.api.snapshot().opened, false); assert.equal(h.dot.hidden, true);
  assert.equal(h.prefs().skipped, '10');
  const newer = h.api.check(); h.reply({ current, release: { ...release, versionCode: 11, version: '0.2.11' }, available: true }); await newer;
  assert.equal(h.dot.hidden, false, 'Skipping one version must not suppress a newer release.');
  const downloading = h.api.download(); const downloadRequest = h.requests.at(-1);
  assert.deepEqual(Object.keys(downloadRequest).sort(), ['action', 'id'], 'The page must not send native arbitrary URLs or paths.');
  h.reply({ progress: 37, downloaded: 370, total: 1000 }, { type: 'progress' });
  assert.equal(h.api.snapshot().progress, 37); assert.equal(h.api.snapshot().phase, 'downloading');
  h.reply({ progress: 10000 }, { request: { ...downloadRequest, id: 'unrelated' }, type: 'progress' }); assert.equal(h.api.snapshot().progress, 37);
  h.reply({ state: 'downloaded', canInstall: false, requiresPermission: true }); await downloading;
  assert.equal(h.api.snapshot().phase, 'ready'); assert.equal(h.api.snapshot().canInstall, false);
  const settings = h.api.install(); assert.equal(h.requests.at(-1).action, 'settings'); h.reply({ state: 'opened' }); await settings;
  assert.equal(h.api.snapshot().code, 'permission_requested');
  h.api.open(); h.click('install-again'); assert.equal(h.requests.at(-1).action, 'openInstall');
  h.reply({}, { type: 'error', ok: false, code: 'install_permission_required', message: 'permission needed' }); await tick();
  assert.equal(h.api.snapshot().phase, 'ready'); assert.equal(h.api.snapshot().canInstall, false, 'System remains authoritative after returning from settings.');
  h.click('install'); h.reply({ state: 'settings-opened' }); await tick();
  h.click('install-again'); h.reply({ state: 'permission-required' }); await tick();
  assert.equal(h.api.snapshot().canInstall, false, 'A successful native response can still require installation permission.');
  h.api.close();
  const wrongSignature = harness(); const checking = wrongSignature.api.check(); wrongSignature.reply({ current, release, available: true }); await checking;
  const downloadBad = wrongSignature.api.download(); wrongSignature.reply({}, { type: 'error', ok: false, code: 'signature-mismatch', message: 'signature mismatch' }); await downloadBad;
  assert.equal(wrongSignature.api.snapshot().code, 'signature_mismatch'); const count = wrongSignature.requests.length; await wrongSignature.api.install(); assert.equal(wrongSignature.requests.length, count);
  const noUpdate = harness(); const noUpdateCheck = noUpdate.api.check(); noUpdate.reply({ current: { versionName: '0.3.0', versionCode: 12 }, release, available: true }); await noUpdateCheck;
  assert.equal(noUpdate.api.snapshot().available, false, 'Never offer an Android versionCode downgrade even if the response says available.');
  const offline = harness(); offline.boot(); offline.reply({}, { type: 'error', ok: false, code: 'network', message: '网络不可用' }); await tick();
  assert.equal(offline.api.snapshot().opened, false); assert.equal(offline.api.snapshot().phase, 'error');
  await offline.api.check({ manual: false }); assert.equal(offline.requests.length, 1, 'A startup network failure must not cause repeated automatic requests.');
  const late = harness({ native: false }); late.boot(); assert.equal(late.requests.length, 0);
  late.attachBridge(); late.ready(); assert.equal(late.requests.length, 1, 'A bridge injected after DOMContentLoaded must still run the startup check.');
  late.reply({ current, release, available: false }); await tick(); late.ready(); assert.equal(late.requests.length, 1);
  const web = harness({ native: false, fetchResponse: { ok: true, status: 200, json: async () => ({ tag_name: 'android-v0.2.10', name: '新版本', body: release.notes, html_url: release.releasePageUrl, assets: [{ browser_download_url: 'https://evil.example/test.apk' }, { browser_download_url: 'https://github.com/swaggyer/Build-up-muscles/releases/download/android-v0.2.10/baoji.apk', size: 180000000 }] }) } });
  web.boot(); assert.equal(web.fetches.length, 0, 'A normal website must not automatically fetch GitHub on startup.');
  await web.api.check(); assert.equal(web.fetches[0].url, 'https://api.github.com/repos/swaggyer/Build-up-muscles/releases/latest');
  assert.match(web.api.snapshot().release.downloadUrl, /^https:\/\/github\.com\/swaggyer\/Build-up-muscles\//);
  await web.api.download(); assert.equal(web.requests.length, 0, 'The web page must never claim it can invoke Android installation.');
  console.log('PASS: real update module version ordering, startup throttle, manual checks, badges/skip, text-only notes, native protocol, progress, permission retry, signature/downgrade rejection and restricted web APK links.');
})().catch(error => { console.error(error); process.exitCode = 1; });
