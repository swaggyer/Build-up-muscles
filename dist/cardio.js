/* Browser-local aerobic timer. Timestamps, rather than interval ticks, measure time. */
(function (global) {
  'use strict';
  const TYPES = Object.freeze({
    running: { label: '跑步', hint: '从轻松慢跑开始，可与步行交替。', icon: '↗', unit: 'km' },
    incline: { label: '爬坡', hint: '选择能稳定行走的坡度，不扶着跑带快走。', icon: '⌁', unit: 'km' },
    stairs: { label: '爬楼梯', hint: '扶好扶手，缓慢上楼，疲劳时休息。', icon: '▥', unit: 'km' },
    swimming: { label: '游泳', hint: '请在离开水面、到达安全位置后补记，不在游泳中操作手机。', icon: '≈', unit: 'm' },
    walking: { label: '快走', hint: '选择平稳路面，保持能说完整句子的节奏。', icon: '↝', unit: 'km' }
  });
  const aliases = { run: 'running', swim: 'swimming', walk: 'walking', climb: 'incline', stair: 'stairs' };
  const typeOf = value => TYPES[value] ? value : (aliases[value] || 'walking');
  const finite = value => Number.isFinite(Number(value)) ? Number(value) : 0;
  const positive = value => Math.max(0, finite(value));
  const localDay = (date = new Date()) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  const validDay = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(new Date(`${value}T12:00:00`).getTime()) && localDay(new Date(`${value}T12:00:00`)) === value;
  const uid = () => global.crypto?.randomUUID ? global.crypto.randomUUID() : `cardio-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  const elapsed = (draft, now = Date.now()) => positive(draft?.elapsedMs) + (draft?.status === 'running' ? Math.max(0, finite(now) - finite(draft.startedAt)) : 0);
  const duration = ms => { const seconds = Math.floor(positive(ms) / 1000); return [Math.floor(seconds / 3600), Math.floor(seconds % 3600 / 60), seconds % 60].map(n => String(n).padStart(2, '0')).join(':'); };
  function makeDraft(options = {}, now = Date.now()) {
    const type = typeOf(options.plannedType || options.type);
    return { id: uid(), type, label: TYPES[type].label, date: validDay(options.date) ? options.date : localDay(new Date(now)), targetMinutes: Math.max(0, Math.min(180, finite(options.targetMinutes))), status: 'idle', mode: 'timer', elapsedMs: 0, startedAt: null, createdAt: new Date(now).toISOString(), distance: '', floors: '', manualMinutes: '', manualSeconds: '', editedSeconds: null };
  }
  function normalizeDraft(value) {
    if (!value || typeof value !== 'object' || typeof value.id !== 'string' || !validDay(value.date) || !['idle', 'running', 'paused', 'review'].includes(value.status) || !['timer', 'manual'].includes(value.mode)) return null;
    if (value.status === 'running' && (!Number.isFinite(value.startedAt) || value.startedAt <= 0)) return null;
    const type = typeOf(value.type);
    return { ...value, type, label: String(value.label || TYPES[type].label).slice(0, 40), elapsedMs: positive(value.elapsedMs), targetMinutes: Math.max(0, Math.min(180, finite(value.targetMinutes))), distance: String(value.distance ?? ''), floors: String(value.floors ?? ''), manualMinutes: String(value.manualMinutes ?? ''), manualSeconds: String(value.manualSeconds ?? ''), editedSeconds: value.editedSeconds === null || value.editedSeconds === undefined ? null : positive(value.editedSeconds) };
  }
  function start(draft, now = Date.now()) {
    if (!draft || draft.status === 'running') return draft;
    return { ...draft, status: 'running', startedAt: finite(now), mode: 'timer' };
  }
  function pause(draft, now = Date.now()) {
    if (!draft || draft.status !== 'running') return draft;
    return { ...draft, elapsedMs: elapsed(draft, now), startedAt: null, status: 'paused' };
  }
  function stop(draft, now = Date.now()) {
    if (!draft) return draft;
    const time = elapsed(draft, now);
    return { ...draft, elapsedMs: time, startedAt: null, status: 'review', editedSeconds: time > 0 ? Math.max(1, Math.ceil(time / 1000)) : 0 };
  }
  function numberField(value, max, name) {
    if (value === '' || value === null || value === undefined) return null;
    const result = Number(value);
    if (!Number.isFinite(result) || result < 0 || result > max) throw new RangeError(`请检查${name}，填写 0–${max} 之间的数字。`);
    return result;
  }
  function record(draft, now = Date.now()) {
    if (!draft || !validDay(draft.date)) throw new RangeError('记录日期无效，请重新建立记录。');
    const type = typeOf(draft.type), info = TYPES[type];
    const distance = numberField(draft.distance, type === 'swimming' ? 100000 : 500, type === 'swimming' ? '游泳距离 / 米' : '距离 / 公里');
    const floors = type === 'stairs' ? numberField(draft.floors, 2000, '爬楼层数') : null;
    if (floors !== null && !Number.isInteger(floors)) throw new RangeError('爬楼层数请填写整数。');
    let seconds;
    if (draft.mode === 'manual') {
      const minutes = numberField(draft.manualMinutes, 1440, '分钟') || 0;
      const spare = numberField(draft.manualSeconds, 59, '秒') || 0;
      if (!Number.isInteger(minutes) || !Number.isInteger(spare)) throw new RangeError('分钟与秒请填写整数。');
      seconds = minutes * 60 + spare;
      if (!seconds && !(distance > 0) && !(floors > 0)) throw new RangeError('请填写运动时长、距离或爬楼层数后再保存。');
      if (!seconds) seconds = null;
    } else {
      if (draft.status === 'running') throw new RangeError('请先结束计时，再确认本次记录。');
      seconds = draft.editedSeconds === null ? Math.ceil(elapsed(draft, now) / 1000) : finite(draft.editedSeconds);
      if (!Number.isInteger(seconds) || seconds <= 0) throw new RangeError('计时不足 1 秒，先开始运动或改用手动补记。');
    }
    if (seconds > 86400) throw new RangeError('本次时长超过 24 小时，请核对并修正实际运动时长。');
    const label = String(draft.label || info.label).trim().slice(0, 40) || info.label;
    return { id: draft.id, type, label, date: draft.date, seconds, distanceKm: distance === null ? null : Number((type === 'swimming' ? distance / 1000 : distance).toFixed(4)), ...(floors !== null ? { floors } : {}), source: draft.mode === 'manual' ? 'manual' : 'timer', ...(seconds === null ? { durationUnknown: true } : {}), createdAt: draft.createdAt || new Date(now).toISOString(), savedAt: new Date(now).toISOString() };
  }
  global.CardioClock = Object.freeze({ types: TYPES, typeOf, elapsed, duration, makeDraft, normalizeDraft, start, pause, stop, record });
  if (typeof document === 'undefined') return;

  const KEY = 'boji-cardio-draft-v1';
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  let draft = null, dialog = null, interval = null, current = null, storageWarning = '', saving = false, errorMessage = '', discardAsked = false;
  try { draft = normalizeDraft(JSON.parse(localStorage.getItem(KEY) || 'null')); } catch { storageWarning = '当前浏览器无法恢复草稿；计时仍可使用，请在离开页面前保存。'; }
  const $ = selector => dialog?.querySelector(selector);
  function signal() { global.dispatchEvent(new CustomEvent('boji-cardio-change', { detail: { status: draft?.status || 'none', date: draft?.date || null } })); }
  function persist() {
    try { if (draft) localStorage.setItem(KEY, JSON.stringify(draft)); else localStorage.removeItem(KEY); }
    catch { storageWarning = '浏览器无法保存草稿。关闭页面或刷新可能丢失本段记录，请先完成并保存。'; }
  }
  function typeButtons(selected, attribute) { return Object.entries(TYPES).map(([type, info]) => `<button type="button" class="cardio-type ${selected === type ? 'selected' : ''}" ${attribute}="${type}" aria-pressed="${selected === type}"><span>${info.icon}</span>${info.label}</button>`).join(''); }
  function recordText(item) {
    const parts = [];
    if (Number(item.seconds) > 0) parts.push(item.seconds < 60 ? `${Math.round(item.seconds)} 秒` : `${Math.floor(item.seconds / 60)} 分${item.seconds % 60 ? ` ${Math.round(item.seconds % 60)} 秒` : ''}`);
    if (Number(item.distanceKm) > 0) parts.push(typeOf(item.type) === 'swimming' ? `${Math.round(item.distanceKm * 1000)} 米` : `${Number(Number(item.distanceKm).toFixed(3))} km`);
    if (Number(item.floors) > 0) parts.push(`${item.floors} 层`);
    if (item.durationUnknown) parts.push('未记录时长');
    return parts.join(' · ') || '已保存';
  }
  function renderPanel(options = {}) {
    const date = validDay(options.date) ? options.date : localDay(), type = typeOf(options.plannedType || 'walking'), target = Math.max(0, finite(options.targetMinutes));
    const records = (Array.isArray(options.records) ? options.records : []).filter(item => item && (!item.date || item.date === date));
    const suggestion = target ? `${TYPES[type].label} · ${Math.round(target)} 分钟` : '';
    return `<section class="cardio-panel"><div class="cardio-panel-head"><div><h3>有氧训练</h3>${suggestion ? `<p>${esc(suggestion)}</p>` : ''}</div><span class="cardio-head-icon" aria-hidden="true">↝</span></div><div class="cardio-types">${typeButtons(type, 'data-cardio-type').replaceAll('data-cardio-type=', 'data-action="cardio" data-cardio-type=')}</div>${draft ? `<div class="cardio-draft"><div><b>${esc(draft.label)} · ${draft.status === 'running' ? '正在计时' : draft.status === 'paused' ? '计时已暂停' : draft.mode === 'manual' ? '未保存的补记' : '未保存的记录'}</b><span data-cardio-panel-time>${draft.mode === 'timer' ? duration(elapsed(draft)) : '继续填写后保存'}</span><small>${esc(draft.date)} · 草稿已保留</small></div><button class="primary-button" data-action="cardio">${draft.status === 'running' ? '查看计时' : draft.status === 'paused' ? '继续计时' : '继续记录'} →</button></div>` : `<button class="primary-button cardio-start-wide" data-action="cardio" data-cardio-type="${type}">开始有氧 / 手动补记 →</button>`}<p class="cardio-small">距离、层数手动填写。</p>${records.length ? `<div class="cardio-records"><div class="cardio-records-title">${esc(date)} · 已记录 ${records.length} 次</div>${records.map(item => `<div class="cardio-record-row"><span class="cardio-record-icon">${TYPES[typeOf(item.type)].icon}</span><div><b>${esc(item.label || TYPES[typeOf(item.type)].label)}</b><small>${esc(recordText(item))}</small></div><span class="cardio-record-source">${item.source === 'timer' ? '计时记录' : '手动补记'}</span></div>`).join('')}</div>` : ''}</section>`;
  }
  function startTicker() {
    clearInterval(interval); interval = null;
    if (draft?.status !== 'running') return;
    const tick = () => {
      if (!draft) return;
      const text = duration(elapsed(draft));
      if ($('#cardioTimer')) $('#cardioTimer').textContent = text;
      document.querySelectorAll('[data-cardio-panel-time]').forEach(el => { el.textContent = text; });
      const progress = $('#cardioProgress');
      if (progress && draft.targetMinutes) progress.value = Math.min(100, elapsed(draft) / (draft.targetMinutes * 600));
    };
    tick(); interval = setInterval(tick, 500);
  }
  function ensureDialog() {
    if (dialog) return;
    dialog = document.createElement('dialog'); dialog.id = 'cardioDialog'; dialog.setAttribute('aria-label', '有氧训练记录');
    document.body.appendChild(dialog);
    dialog.addEventListener('cancel', event => { event.preventDefault(); close(); });
    dialog.addEventListener('click', event => {
      if (event.target === dialog) { const box = dialog.getBoundingClientRect(); if (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom) close(); return; }
      const button = event.target.closest('button'); if (!button || saving) return;
      const action = button.dataset.cardioAction;
      if (button.dataset.cardioPick) { if (draft.status === 'idle' && !elapsed(draft)) { draft.type = typeOf(button.dataset.cardioPick); draft.label = TYPES[draft.type].label; draft.distance = ''; draft.floors = ''; persist(); renderDialog(); signal(); } return; }
      if (!action) return;
      if (action === 'close') close();
      else if (action === 'start' || action === 'resume') { draft = start(draft); persist(); renderDialog(); signal(); startTicker(); }
      else if (action === 'pause') { draft = pause(draft); persist(); renderDialog(); signal(); startTicker(); }
      else if (action === 'stop') { draft = stop(draft); persist(); renderDialog(); signal(); startTicker(); }
      else if (action === 'back') { draft.status = 'paused'; draft.editedSeconds = null; persist(); renderDialog(); signal(); }
      else if (action === 'mode') { if (draft.status !== 'idle' || elapsed(draft)) return; draft.mode = draft.mode === 'manual' ? 'timer' : 'manual'; persist(); renderDialog(); }
      else if (action === 'discard') { discardAsked = true; renderDialog(); }
      else if (action === 'keep') { discardAsked = false; renderDialog(); }
      else if (action === 'confirm-discard') { draft = null; discardAsked = false; persist(); startTicker(); signal(); close(); }
    });
    dialog.addEventListener('input', event => {
      const field = event.target.dataset.cardioField;
      if (!field || !draft) return;
      draft[field] = event.target.value;
      if (field === 'reviewMinutes' || field === 'reviewSeconds') {
        const minutes = Number($('#cardioReviewMinutes')?.value || 0), seconds = Number($('#cardioReviewSeconds')?.value || 0);
        draft.editedSeconds = minutes * 60 + seconds;
      }
      errorMessage = ''; const error = $('#cardioError'); if (error) error.textContent = ''; persist();
    });
    dialog.addEventListener('submit', async event => {
      if (event.target.id !== 'cardioSaveForm') return;
      event.preventDefault();
      if (saving || !draft) return;
      try {
        const item = record(draft);
        if (typeof current?.onSave !== 'function') throw new Error('当前页面暂时无法保存，请关闭后从今日计划重新进入；草稿会保留。');
        saving = true; renderDialog();
        await current.onSave(item);
        draft = null; persist(); saving = false; startTicker(); close(); signal();
      } catch (error) { saving = false; errorMessage = error.message || '保存未完成，草稿已保留，请重试。'; renderDialog(); }
    });
  }
  function fieldsMarkup() {
    const info = TYPES[draft.type], manual = draft.mode === 'manual';
    const seconds = draft.editedSeconds === null ? Math.ceil(elapsed(draft) / 1000) : positive(draft.editedSeconds);
    const time = manual ? `<div class="cardio-time-fields"><label>分钟<input data-cardio-field="manualMinutes" name="minutes" type="number" min="0" max="1440" step="1" inputmode="numeric" value="${esc(draft.manualMinutes)}" placeholder="可选"></label><label>秒<input data-cardio-field="manualSeconds" name="seconds" type="number" min="0" max="59" step="1" inputmode="numeric" value="${esc(draft.manualSeconds)}" placeholder="0–59"></label></div>` : `<div class="cardio-time-fields"><label>实际运动 / 分钟<input id="cardioReviewMinutes" data-cardio-field="reviewMinutes" type="number" min="0" max="1440" step="1" inputmode="numeric" value="${Math.floor(seconds / 60)}"></label><label>秒<input id="cardioReviewSeconds" data-cardio-field="reviewSeconds" type="number" min="0" max="59" step="1" inputmode="numeric" value="${seconds % 60}"></label></div>`;
    return `<form id="cardioSaveForm"><label class="cardio-field">本次记录名称<input data-cardio-field="label" name="label" type="text" maxlength="40" required value="${esc(draft.label)}"></label>${time}<div class="cardio-distance-fields"><label class="cardio-field">${draft.type === 'swimming' ? '游泳距离 / 米' : '距离 / 公里'} · 选填<input data-cardio-field="distance" name="distance" type="number" min="0" max="${draft.type === 'swimming' ? 100000 : 500}" step="${draft.type === 'swimming' ? 1 : .001}" inputmode="decimal" placeholder="手动填写，不自动测量" value="${esc(draft.distance)}"></label>${draft.type === 'stairs' ? `<label class="cardio-field">向上爬楼 / 层 · 选填<input data-cardio-field="floors" name="floors" type="number" min="0" max="2000" step="1" inputmode="numeric" placeholder="例如 12" value="${esc(draft.floors)}"></label>` : ''}</div><p class="cardio-small">${manual ? '时长、距离或层数至少填写一项。' : '可修改实际运动时长。'} ${info.unit === 'm' ? '' : ''}</p><p class="cardio-error" id="cardioError" role="alert">${esc(errorMessage)}</p><div class="cardio-save-actions">${manual ? '<button type="button" class="outline-button" data-cardio-action="mode">切换到计时</button>' : '<button type="button" class="outline-button" data-cardio-action="back">继续运动</button>'}<button class="primary-button" type="submit" ${saving ? 'disabled' : ''}>${saving ? '正在保存…' : '确认并保存记录 ✓'}</button></div></form>`;
  }
  function renderDialog() {
    if (!draft || !dialog) return;
    const info = TYPES[draft.type], review = draft.status === 'review' || draft.mode === 'manual';
    const dateNote = draft.date === localDay() ? '今天' : draft.date;
    dialog.innerHTML = `<div class="cardio-inner"><header class="cardio-dialog-head"><div><h2>${review ? '保存有氧记录' : `${esc(info.label)}计时`}</h2><p>记录日期：${esc(dateNote)}</p></div><button type="button" class="cardio-close" data-cardio-action="close" aria-label="关闭有氧记录">×</button></header>${draft.date !== current.date ? `<p class="cardio-notice">已恢复 ${esc(draft.date)} 的未保存草稿，本次记录将保存到该日。</p>` : ''}${storageWarning ? `<p class="cardio-notice">${esc(storageWarning)}</p>` : ''}${draft.status === 'idle' ? `<div class="cardio-types cardio-dialog-types">${typeButtons(draft.type, 'data-cardio-pick')}</div>` : ''}${draft.type === 'swimming' ? '<p class="cardio-guidance">游泳请上岸后补记。</p>' : ''}${review ? fieldsMarkup() : `<div class="cardio-timer-block"><span class="cardio-status">${draft.status === 'running' ? '<i></i> 正在运动' : draft.status === 'paused' ? '计时已暂停' : '未开始'}</span><div class="cardio-clock" id="cardioTimer" aria-label="已运动时长">${duration(elapsed(draft))}</div>${draft.targetMinutes ? `<progress id="cardioProgress" max="100" value="${Math.min(100, elapsed(draft) / (draft.targetMinutes * 600))}" aria-label="建议时长进度"></progress><p>计划 ${draft.targetMinutes} 分钟</p>` : ''}</div><div class="cardio-timer-actions">${draft.status === 'running' ? '<button type="button" class="outline-button" data-cardio-action="pause">暂停计时 Ⅱ</button><button type="button" class="primary-button" data-cardio-action="stop">结束并确认记录 →</button>' : draft.status === 'paused' ? '<button type="button" class="primary-button" data-cardio-action="resume">继续计时 ▶</button><button type="button" class="outline-button" data-cardio-action="stop">结束并确认记录</button>' : '<button type="button" class="primary-button" data-cardio-action="start">开始计时 ▶</button><button type="button" class="outline-button" data-cardio-action="mode">手动补记时长 / 距离</button>'}</div><p class="cardio-small">关闭或刷新保留计时状态。</p>`}<div class="cardio-bottom-note"><span>不计算消耗热量，不自动定位。</span>${discardAsked ? `<div class="cardio-discard-confirm"><b>放弃这段未保存记录？</b><button type="button" class="small-link" data-cardio-action="keep">保留</button><button type="button" class="cardio-danger" data-cardio-action="confirm-discard">确认放弃</button></div>` : '<button type="button" class="cardio-danger" data-cardio-action="discard">放弃草稿</button>'}</div></div>`;
  }
  function open(options = {}) {
    ensureDialog();
    current = { date: validDay(options.date) ? options.date : localDay(), onSave: options.onSave };
    errorMessage = ''; discardAsked = false;
    if (!draft) draft = makeDraft({ ...options, date: current.date });
    persist(); renderDialog();
    if (!dialog.open) dialog.showModal();
    startTicker();
  }
  function close() {
    persist();
    if (dialog?.open) dialog.close();
    signal();
  }
  function clearDraft() {
    draft = null; current = null; discardAsked = false; errorMessage = ''; saving = false;
    persist(); startTicker();
    if (dialog?.open) dialog.close();
    signal();
  }
  global.addEventListener('pagehide', persist);
  global.addEventListener('visibilitychange', () => { persist(); if (!document.hidden) startTicker(); });
  global.addEventListener('storage', event => { if (event.key !== KEY) return; try { draft = normalizeDraft(JSON.parse(event.newValue || 'null')); if (dialog?.open && draft) renderDialog(); if (dialog?.open && !draft) dialog.close(); startTicker(); signal(); } catch { /* Ignore invalid drafts from another tab. */ } });
  global.CardioRecorder = Object.freeze({ open, close, clearDraft, renderPanel, types: TYPES, hasDraft: () => !!draft });
  startTicker();
})(typeof window === 'undefined' ? globalThis : window);
