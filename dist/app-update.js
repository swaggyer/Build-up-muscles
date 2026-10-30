/* GitHub releases on the web; the restricted Android WebMessage bridge owns
   package verification, downloads and the system installation confirmation. */
(() => {
  'use strict';
  const REPO = 'swaggyer/Build-up-muscles';
  const RELEASES = `https://github.com/${REPO}/releases`;
  const API = `https://api.github.com/repos/${REPO}/releases/latest`;
  const KEY = 'boji.appUpdate.v1', DAY = 24 * 60 * 60 * 1000;
  const pending = new Map(), listeners = new Set();
  let serial = 0, active = null, opened = false, dialog = null, priorFocus = null, oldOverflow = '', nativeBooted = false;
  let state = { phase: 'idle', native: false, current: null, release: null, available: false, progress: 0, downloaded: 0, total: 0, error: '', code: '', canInstall: false };
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  function readPrefs() { try { return JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch { return {}; } }
  function savePrefs(changes) { try { localStorage.setItem(KEY, JSON.stringify({ ...readPrefs(), ...changes })); } catch {} }
  // Accept release tags such as android-v0.1.3; compare every numeric component
  // and stable/pre-release status, never decimal numbers or lexical strings.
  function compareVersions(left, right) {
    function parse(value) {
      const m = String(value ?? '').trim().match(/^(?:android-)?v?(\d+(?:\.\d+)*)(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/i);
      return m ? { numbers: m[1].split('.').map(Number), pre: m[2]?.split('.') || [] } : null;
    }
    const a = parse(left), b = parse(right);
    if (!a || !b) return null;
    for (let i = 0; i < Math.max(a.numbers.length, b.numbers.length); i++) {
      const d = (a.numbers[i] || 0) - (b.numbers[i] || 0); if (d) return Math.sign(d);
    }
    if (!a.pre.length || !b.pre.length) return a.pre.length === b.pre.length ? 0 : a.pre.length ? -1 : 1;
    for (let i = 0; i < Math.max(a.pre.length, b.pre.length); i++) {
      if (a.pre[i] === undefined) return -1; if (b.pre[i] === undefined) return 1;
      if (a.pre[i] === b.pre[i]) continue;
      const an = /^\d+$/.test(a.pre[i]), bn = /^\d+$/.test(b.pre[i]);
      if (an && bn) return Math.sign(Number(a.pre[i]) - Number(b.pre[i]));
      if (an !== bn) return an ? -1 : 1;
      return a.pre[i] > b.pre[i] ? 1 : -1;
    }
    return 0;
  }
  function trustedUrl(value, download = false) {
    try {
      const u = new URL(value);
      return u.protocol === 'https:' && u.hostname === 'github.com' && !u.port && !u.username && !u.password &&
        u.pathname.startsWith(`/${REPO}/releases/${download ? 'download/' : ''}`) && !u.hash && (!download || /\.apk$/i.test(u.pathname)) ? u.href : '';
    } catch { return ''; }
  }
  function nativeBridge() { return window.BaojiUpdater && typeof window.BaojiUpdater.postMessage === 'function' ? window.BaojiUpdater : null; }
  function releaseKey(release) { return release ? String(release.versionCode || release.tag || release.version) : ''; }
  function badgeAvailable() { return Boolean(state.available && releaseKey(state.release) !== String(readPrefs().skipped || '')); }
  function snapshot() { return { ...state, current: state.current && { ...state.current }, release: state.release && { ...state.release }, badge: badgeAvailable(), opened }; }
  function notify() {
    const value = snapshot();
    document.querySelectorAll('.app-update-entry').forEach(button => {
      button.classList.toggle('has-update', value.badge); button.setAttribute('aria-label', value.badge ? '更新：有新版本' : '检查应用更新');
      const dot = button.querySelector('.app-update-dot'); if (dot) dot.hidden = !value.badge;
    });
    listeners.forEach(fn => { try { fn(value); } catch {} });
    window.dispatchEvent(new CustomEvent('boji-app-update', { detail: value }));
    if (opened) render();
  }
  function set(changes) { state = { ...state, ...changes }; notify(); }
  function receive(event) {
    let message; try { message = typeof event.data === 'string' ? JSON.parse(event.data) : event.data; } catch { return; }
    if (!message || typeof message.id !== 'string') return;
    const request = pending.get(message.id);
    if (!request || message.action !== request.action) return;
    if (message.type === 'progress') {
      if (request.action !== 'download') return;
      request.arm();
      const data = message.data || {}, total = Math.max(0, Number(data.total) || 0), downloaded = Math.max(0, Number(data.downloaded) || 0);
      let progress = Number(data.progress ?? data.percent);
      if (!Number.isFinite(progress)) progress = total > 0 ? downloaded / total * 100 : 0;
      set({ progress: Math.max(0, Math.min(100, progress)), downloaded, total }); return;
    }
    if (message.type !== 'result' && message.type !== 'error') return;
    clearTimeout(request.timer); pending.delete(message.id);
    if (message.type === 'error' || message.ok === false) {
      const error = new Error(String(message.message || '更新服务暂时不可用')); error.code = String(message.code || 'update_failed').replace(/-/g, '_'); request.reject(error);
    } else request.resolve(message.data || {});
  }
  function callNative(action) {
    const bridge = nativeBridge(); if (!bridge) return Promise.reject(new Error('未连接应用更新服务'));
    bridge.onmessage = receive;
    return new Promise((resolve, reject) => {
      const id = `boji-update-${Date.now()}-${++serial}`;
      const request = { action, resolve, reject, timer: null, arm() {
        clearTimeout(this.timer); this.timer = setTimeout(() => { pending.delete(id); const error = new Error('更新连接超时，请稍后重试'); error.code = 'timeout'; reject(error); }, action === 'download' ? 120000 : 45000);
      } };
      pending.set(id, request); request.arm();
      try { bridge.postMessage(JSON.stringify({ id, action })); } catch (error) { clearTimeout(request.timer); pending.delete(id); reject(error); }
    });
  }
  function normalizeNative(data) {
    const current = data.current || { versionCode: data.currentVersionCode, versionName: data.currentVersionName };
    const raw = data.release;
    if (!raw) return { current, release: null, available: false, canInstall: Boolean(data.canInstall) };
    const version = String(raw.version || raw.versionName || raw.tag || '');
    const release = { version, versionCode: Number(raw.versionCode) || 0, tag: String(raw.tag || ''), title: String(raw.title || '暴击薄肌'), notes: String(raw.notes || ''), publishedAt: String(raw.publishedAt || ''), size: Number(raw.size ?? raw.bytes) || 0, sha256: String(raw.sha256 || ''), releasePageUrl: trustedUrl(raw.releasePageUrl) || `${RELEASES}/tag/${encodeURIComponent(raw.tag || version)}` };
    // Version codes are Android's installation ordering. Native metadata also
    // owns signature compatibility; never override its available=false.
    const currentCode = Number(current.versionCode) || 0;
    const higher = release.versionCode && currentCode ? release.versionCode > currentCode : compareVersions(version, current.versionName) === 1;
    return { current, release, available: Boolean(data.available && higher), canInstall: Boolean(data.canInstall) };
  }
  async function webCheck() {
    const controller = new AbortController(), timeout = setTimeout(() => controller.abort(), 20000);
    try {
      const response = await fetch(API, { headers: { Accept: 'application/vnd.github+json' }, cache: 'no-store', signal: controller.signal });
      if (response.status === 404) return { current: null, release: null, available: false };
      if (!response.ok) throw new Error(response.status === 403 || response.status === 429 ? 'GitHub 暂时限制了查询次数，请稍后重试' : '暂时无法读取 GitHub 版本信息');
      const data = await response.json();
      if (data.draft || data.prerelease || !data.tag_name) throw new Error('没有可用的正式版本');
      const assets = Array.isArray(data.assets) ? data.assets : [];
      const asset = assets.find(item => trustedUrl(item.browser_download_url, true));
      return { current: null, available: Boolean(asset), release: { version: String(data.tag_name).replace(/^android-/i, '').replace(/^v/i, ''), tag: String(data.tag_name), title: String(data.name || data.tag_name), notes: String(data.body || ''), publishedAt: String(data.published_at || ''), releasePageUrl: trustedUrl(data.html_url) || RELEASES, downloadUrl: asset ? trustedUrl(asset.browser_download_url, true) : '', size: Number(asset?.size) || 0 } };
    } finally { clearTimeout(timeout); }
  }
  async function check(options = {}) {
    const manual = options.manual !== false;
    if (active || ['downloading', 'installing'].includes(state.phase)) return active || snapshot();
    if (!manual && (!nativeBridge() || Date.now() - Number(readPrefs().lastCheck || 0) < DAY)) return snapshot();
    if (!manual) savePrefs({ lastCheck: Date.now() });
    set({ phase: 'checking', native: Boolean(nativeBridge()), error: '', code: '' });
    active = (async () => {
      try {
        const result = nativeBridge() ? normalizeNative(await callNative('check')) : await webCheck();
        savePrefs({ lastCheck: Date.now() });
        set({ ...result, phase: result.release ? result.available ? 'available' : 'latest' : 'none', error: '', progress: 0 });
      } catch (error) {
        // Startup checks only change the badge silently; no unsolicited popup.
        set({ phase: 'error', error: String(error.message || '检查失败，请稍后重试'), code: String(error.code || 'network') });
      } finally { active = null; }
      return snapshot();
    })();
    return active;
  }
  async function download() {
    if (!nativeBridge() || !state.available || state.phase === 'downloading') return;
    set({ phase: 'downloading', progress: 0, downloaded: 0, total: state.release?.size || 0, error: '', code: '' });
    try {
      const result = await callNative('download');
      if (result.state !== 'downloaded' && result.ready !== true) throw new Error('安装包尚未准备好，请重试');
      if (result.signatureCompatible === false) { const error = new Error('安装包签名与当前应用不一致'); error.code = 'signature_mismatch'; throw error; }
      set({ phase: 'ready', progress: 100, canInstall: Boolean(result.canInstall) && !result.requiresPermission });
    } catch (error) { set({ phase: 'error', error: String(error.message || '下载失败，请重试'), code: String(error.code || 'download_failed') }); }
  }
  async function install() {
    if (!nativeBridge() || state.phase !== 'ready') return;
    if (!state.canInstall) {
      try { await callNative('settings'); set({ phase: 'ready', code: 'permission_requested' }); }
      catch (error) { set({ phase: 'ready', error: String(error.message || '暂时无法打开设置') }); } return;
    }
    set({ phase: 'installing', error: '' });
    try {
      const result = await callNative('openInstall');
      if (result.state === 'permission-required') set({ phase: 'ready', canInstall: false, code: 'install_permission_required', error: '' });
      else set({ phase: 'ready', code: 'installer_opened' });
    }
    catch (error) {
      if (error.code === 'install_permission_required') set({ phase: 'ready', canInstall: false, code: error.code, error: '' });
      else set({ phase: 'error', error: String(error.message || '暂时无法打开安装程序'), code: String(error.code || 'install_failed') });
    }
  }
  function close() {
    if (!opened) return; opened = false; dialog?.remove(); dialog = null; document.body.style.overflow = oldOverflow;
    if (priorFocus && typeof priorFocus.focus === 'function') priorFocus.focus(); notify();
  }
  function open() {
    if (!opened) { opened = true; priorFocus = document.activeElement; oldOverflow = document.body.style.overflow; document.body.style.overflow = 'hidden'; }
    render(); if (!['downloading', 'ready', 'installing'].includes(state.phase)) check({ manual: true });
  }
  function skip() { if (state.release) savePrefs({ skipped: releaseKey(state.release) }); close(); }
  const mb = bytes => `${(Math.max(0, bytes) / 1024 / 1024).toFixed(1)} MB`;
  function render() {
    const created = !dialog;
    if (!dialog) {
      dialog = document.createElement('div'); dialog.className = 'boji-update-overlay';
      dialog.addEventListener('click', event => { if (event.target === dialog) close(); });
      document.body.append(dialog);
    }
    const focusedAction = dialog.contains(document.activeElement) ? document.activeElement?.dataset?.updateAction : '';
    const r = state.release, busy = ['checking', 'downloading', 'installing'].includes(state.phase);
    let status = '', actions = '';
    if (state.phase === 'checking') status = '正在检查最新版本…';
    else if (state.phase === 'downloading') status = `正在下载安装包 ${Math.round(state.progress)}%`;
    else if (state.phase === 'ready') status = state.code === 'installer_opened' ? '已打开系统安装程序，请按系统提示完成更新。' : '安装包已验证，可以继续安装。';
    else if (state.phase === 'installing') status = '正在打开系统安装程序…';
    else if (state.phase === 'latest') status = state.native ? '当前已是最新版本。' : '已找到最新版本说明。';
    else if (state.phase === 'none') status = '还没有公开的正式安装包，请稍后再来。';
    else if (state.phase === 'error') status = state.code === 'signature_mismatch' ? '安装包签名不匹配，已停止安装。请保留当前应用和训练记录，等待兼容的正式版本。' : state.error || '更新暂时失败，请重试。';
    else if (state.phase === 'available') status = state.native ? '发现新版本，更新内容如下。' : '你正在使用网页版。可下载 Android 安装包，在手机上安装。';
    else status = '检查新版本，看看最近有哪些改进。';
    if (state.phase === 'ready') {
      actions = `<button class="boji-update-primary" data-update-action="${state.code === 'permission_requested' ? 'install-again' : 'install'}">${state.code === 'permission_requested' ? '已允许，继续安装' : state.canInstall ? '安装更新' : '允许此来源安装'}</button>`;
    } else if (state.native && state.available && state.phase === 'available') actions = '<button class="boji-update-primary" data-update-action="download">下载更新</button>';
    else if (!state.native && r?.downloadUrl) actions = `<a class="boji-update-primary" href="${esc(r.downloadUrl)}" target="_blank" rel="noopener noreferrer">下载 Android APK</a>`;
    else if (state.phase === 'error') actions = '<button class="boji-update-primary" data-update-action="check">重新检查</button>';
    else if (!busy) actions = '<button class="boji-update-primary" data-update-action="check">检查更新</button>';
    const note = state.phase === 'ready' && !state.canInstall ? '<p class="boji-update-hint">需要在系统设置中允许本应用安装更新。授权后返回这里继续，安装仍由系统确认。</p>' : '';
    dialog.innerHTML = `<section class="boji-update-dialog" role="dialog" aria-modal="true" aria-labelledby="boji-update-title" tabindex="-1"><header><div><h2 id="boji-update-title">应用更新</h2></div><button class="boji-update-close" aria-label="关闭更新窗口" data-update-action="close">×</button></header><div class="boji-update-versions"><div><span>当前版本</span><strong>${esc(state.native ? state.current?.versionName || '正在读取' : '网页版')}</strong></div><span aria-hidden="true">→</span><div><span>最新版本</span><strong>${esc(r?.version || '待检查')}</strong></div></div><p class="boji-update-status${state.phase === 'error' ? ' is-error' : ''}" role="status">${esc(status)}</p>${state.phase === 'downloading' ? `<div class="boji-update-track" role="progressbar" aria-label="下载进度" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.round(state.progress)}"><span style="width:${state.progress}%"></span></div><p class="boji-update-hint">${esc(mb(state.downloaded))}${state.total ? ` / ${esc(mb(state.total))}` : ''} · 可以关闭窗口，下载会继续</p>` : ''}${note}${r ? '<section class="boji-update-notes"><h3>本次更新</h3><p></p></section>' : ''}<footer>${actions}${state.available && state.phase === 'available' ? '<button class="boji-update-secondary" data-update-action="skip">跳过此版本</button>' : ''}<button class="boji-update-secondary" data-update-action="close">稍后</button></footer><a class="boji-update-release" href="${esc(r?.releasePageUrl || RELEASES)}" target="_blank" rel="noopener noreferrer">在 GitHub 查看版本说明 ↗</a></section>`;
    const notes = dialog.querySelector('.boji-update-notes p'); if (notes) notes.textContent = r.notes || '此版本未提供额外说明。';
    const focus = focusedAction && dialog.querySelector(`[data-update-action="${focusedAction}"]`);
    if (focus || created) (focus || dialog.querySelector('[role="dialog"]')).focus({ preventScroll: true });
  }
  document.addEventListener('click', event => {
    const entry = event.target.closest?.('[data-action="app-update"]'); if (entry) { event.preventDefault(); open(); return; }
    const button = event.target.closest?.('[data-update-action]'); if (!button || !dialog?.contains(button)) return;
    const action = button.dataset.updateAction;
    if (action === 'close') close(); else if (action === 'check') check({ manual: true }); else if (action === 'skip') skip(); else if (action === 'download') download(); else if (action === 'install') install();
    else if (action === 'install-again') { state.canInstall = true; install(); }
  });
  document.addEventListener('keydown', event => {
    if (!opened) return;
    if (event.key === 'Escape') { event.preventDefault(); close(); }
    if (event.key === 'Tab') {
      const items = [...dialog.querySelectorAll('button:not([disabled]),a[href]')]; if (!items.length) return;
      if (event.shiftKey && (document.activeElement === items[0] || document.activeElement === dialog.querySelector('[role="dialog"]'))) { event.preventDefault(); items.at(-1).focus(); }
      else if (!event.shiftKey && document.activeElement === items.at(-1)) { event.preventDefault(); items[0].focus(); }
    }
  });
  function boot() {
    const bridge = nativeBridge();
    if (bridge && !nativeBooted) { nativeBooted = true; bridge.onmessage = receive; set({ native: true }); check({ manual: false }); }
  }
  window.BojiAppUpdate = { open, close, check, download, install, snapshot, compareVersions,
    onBadgeChange(callback) { listeners.add(callback); callback(snapshot()); return () => listeners.delete(callback); } };
  function start() { boot(); if (!nativeBooted) { setTimeout(boot, 1200); setTimeout(boot, 5000); } }
  // WebMessage injection normally precedes page scripts. These hooks cover a
  // late WebView injection without polling or starting automatic web requests.
  window.addEventListener('boji-updater-ready', boot);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) boot(); });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true }); else start();
})();
