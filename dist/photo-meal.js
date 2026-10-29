/* Photo-assisted meal records. Photos stay in this browser; only model assets are downloaded. */
(function () {
  'use strict';

  const WORKER_URL = new URL('photo-model-worker.js', document.currentScript ? document.currentScript.src : location.href).href;
  const MAX_FILE_BYTES = 15 * 1024 * 1024;
  const OIL_KCAL_100 = 884;
  const negatives = ['a person', 'a landscape', 'a document with text', 'a cartoon character', 'an animal', 'a non-food object'];
  let dialog = null;
  let current = null;
  let worker = null;
  let runCounter = 0;
  let modelReady = false;
  const esc = value => String(value == null ? '' : value).replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
  const catalog = () => (Array.isArray(window.FOOD_CATALOG) ? window.FOOD_CATALOG : []).filter(f => f && typeof f.name === 'string' && Number.isFinite(Number(f.kcal100)) && Number(f.kcal100) >= 0);
  const findFood = id => catalog().find(f => f.id === id);
  const isOpen = () => !!(dialog && dialog.open && current);
  const $ = selector => dialog && dialog.querySelector(selector);

  function stopCamera() {
    if (current && current.stream) {
      current.stream.getTracks().forEach(track => track.stop());
      current.stream = null;
    }
    const video = $('#fpmCameraVideo');
    if (video) { video.pause(); video.srcObject = null; }
  }

  function stopWorker() {
    if (worker) worker.terminate();
    worker = null;
    modelReady = false;
    ++runCounter;
    if (current) current.busy = false;
  }

  function cleanup() {
    stopCamera();
    stopWorker();
    if (current && current.photoURL) URL.revokeObjectURL(current.photoURL);
    if (current && current.modelTimer) clearTimeout(current.modelTimer);
    current = null;
  }

  function close() {
    if (dialog && dialog.open) dialog.close();
    else cleanup();
  }

  function setStatus(message, kind) {
    if (!current) return;
    current.status = message;
    current.statusKind = kind || 'info';
    const el = $('#fpmStatus');
    if (el) { el.textContent = message; el.className = 'fpm-status ' + current.statusKind; }
  }

  function ensureDialog() {
    if (dialog) return;
    dialog = document.createElement('dialog');
    dialog.id = 'foodPhotoDialog';
    dialog.className = 'fpm-dialog';
    dialog.setAttribute('aria-labelledby', 'fpmTitle');
    document.body.appendChild(dialog);
    dialog.addEventListener('cancel', event => { event.preventDefault(); close(); });
    dialog.addEventListener('close', () => { if (!dialog.open) cleanup(); });
    dialog.addEventListener('click', event => {
      if (event.target === dialog) {
        const r = dialog.getBoundingClientRect();
        if (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom) close();
        return;
      }
      const button = event.target.closest('button');
      if (!button || !current) return;
      if (button.hasAttribute('data-fpm-close')) { close(); return; }
      if (button.hasAttribute('data-fpm-upload')) { $('#fpmUpload').click(); return; }
      if (button.hasAttribute('data-fpm-camera')) { startCamera(); return; }
      if (button.hasAttribute('data-fpm-shutter')) { captureFrame(); return; }
      if (button.hasAttribute('data-fpm-stop-camera')) { stopCamera(); render(); return; }
      if (button.hasAttribute('data-fpm-analyse')) { analysePhoto(); return; }
      if (button.hasAttribute('data-fpm-cancel-analysis')) {
        stopWorker();
        setStatus('本次识别已取消。可以继续手动确认食物和份量。', 'info');
        render();
        return;
      }
      if (button.hasAttribute('data-fpm-add')) {
        const id = $('#fpmAddFood').value;
        addFood(id);
        return;
      }
      if (button.hasAttribute('data-fpm-suggest')) { addFood(button.dataset.fpmSuggest); return; }
      if (button.hasAttribute('data-fpm-remove')) {
        current.items.splice(Number(button.dataset.fpmRemove), 1);
        render();
      }
    });
    dialog.addEventListener('change', event => {
      if (!current) return;
      if (event.target.id === 'fpmUpload' || event.target.id === 'fpmCapture') {
        const file = event.target.files && event.target.files[0];
        if (file) acceptPhoto(file);
      }
      if (event.target.id === 'fpmConfirmed') updateTotals();
    });
    dialog.addEventListener('input', event => {
      if (!current) return;
      if (event.target.hasAttribute('data-fpm-grams')) {
        const row = current.items[Number(event.target.dataset.fpmGrams)];
        if (row) row.grams = Number(event.target.value);
        updateTotals();
      }
      if (event.target.id === 'fpmOil') { current.oil = Number(event.target.value); updateTotals(); }
      if (event.target.id === 'fpmMealName') current.name = event.target.value;
    });
    dialog.addEventListener('submit', event => {
      if (event.target.id !== 'fpmSaveForm') return;
      event.preventDefault();
      saveMeal();
    });
  }

  function render() {
    if (!current || !dialog) return;
    const foods = catalog();
    const hasPhoto = !!current.photoURL;
    const hasItems = current.items.length > 0;
    const camera = current.stream;
    dialog.innerHTML = `<div class="fpm-inner">
      <div class="fpm-head"><div><h2 id="fpmTitle">拍照记录</h2><p>${esc(current.date || '')} · 照片只在本机处理</p></div><button type="button" class="fpm-close" data-fpm-close aria-label="关闭拍照记录">×</button></div>
      <input class="fpm-file" id="fpmUpload" type="file" accept="image/jpeg,image/png,image/webp,image/avif,image/heic,image/heif" aria-label="上传食物照片">
      <input class="fpm-file" id="fpmCapture" type="file" accept="image/*" capture="environment" aria-label="拍摄食物照片">
      ${camera ? `<div class="fpm-camera"><video id="fpmCameraVideo" autoplay playsinline muted aria-label="相机预览"></video><div class="fpm-camera-actions"><button type="button" class="fpm-primary" data-fpm-shutter>拍下这顿饭</button><button type="button" class="fpm-outline" data-fpm-stop-camera>关闭相机</button></div></div>` : hasPhoto ? `<div class="fpm-photo"><img src="${esc(current.photoURL)}" alt="本次选择的餐食照片"><span>本地预览 · 不上传原图</span></div>` : `<div class="fpm-drop"><svg viewBox="0 0 48 48" aria-hidden="true"><path d="M6 15h9l3-6h12l3 6h9v27H6z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><circle cx="24" cy="28" r="9" fill="none" stroke="currentColor" stroke-width="2"/><path d="M36 21h1" stroke="currentColor" stroke-width="3" stroke-linecap="round"/></svg><strong>选择餐食照片</strong><p>餐盘完整入镜，一次记录一餐。</p></div>`}
      <div class="fpm-pick-actions"><button class="fpm-outline" type="button" data-fpm-camera ${current.busy ? 'disabled' : ''}>打开相机 / 拍摄</button><button class="fpm-outline" type="button" data-fpm-upload ${current.busy ? 'disabled' : ''}>${hasPhoto ? '换一张照片' : '从相册上传'}</button></div>
      <div class="fpm-model-box"><div><b>本机食物识别</b><span>${modelReady ? '模型已就绪' : '首次需下载约 150 MB 模型。'}</span></div><button type="button" class="fpm-primary" data-fpm-analyse ${!hasPhoto || current.busy || !foods.length ? 'disabled' : ''}>${current.analysisStatus === 'success' ? '重新识别' : '下载模型并识别'}</button></div>
      <div id="fpmStatus" class="fpm-status ${esc(current.statusKind)}" role="status" aria-live="polite">${esc(current.status || '克重、用油需手动确认。')}</div>
      ${current.busy ? `<div class="fpm-load-row"><progress id="fpmModelProgress" max="100" ${Number.isFinite(current.progress) ? `value="${current.progress}"` : ''}></progress><button class="fpm-text" type="button" data-fpm-cancel-analysis>取消识别</button></div>` : ''}
      ${current.suggestions.length ? `<div class="fpm-suggestions"><small>其他候选食物</small><div>${current.suggestions.map(id => { const f = findFood(id); return f ? `<button type="button" data-fpm-suggest="${esc(id)}">+ ${esc(f.name)}</button>` : ''; }).join('')}</div></div>` : ''}
      <div class="fpm-section-title"><h3>确认食物与实际份量</h3><span>${current.analysisStatus === 'success' ? '请核对候选' : hasPhoto ? '可手动添加' : '先选择照片'}</span></div>
      <p class="fpm-explain">请补充漏项，并修改实际克重。</p>
      <div class="fpm-add-row"><select id="fpmAddFood" aria-label="选择要添加的食物">${foods.map(f => `<option value="${esc(f.id)}">${esc(f.name)}</option>`).join('')}</select><button class="fpm-outline" type="button" data-fpm-add ${!foods.length ? 'disabled' : ''}>+ 添加食物</button></div>
      ${!foods.length ? '<p class="fpm-status error">食物目录尚未加载，请关闭弹窗并刷新页面。</p>' : ''}
      <form id="fpmSaveForm">
        <div class="fpm-food-rows">${hasItems ? current.items.map((item, index) => { const food = findFood(item.id); return `<div class="fpm-food-row"><div class="fpm-food-name"><b>${esc(item.name)}</b><small>${esc(food && food.measureNote ? food.measureNote : '按可食部分称重；额外油和酱料另计。')}</small></div><label class="fpm-grams"><input type="number" min="1" max="2000" step="1" value="${item.grams}" required data-fpm-grams="${index}" aria-label="${esc(item.name)}重量">g</label><span class="fpm-row-energy" data-fpm-row-energy="${index}">${Math.round(item.grams * item.kcal100 / 100)}<small>kcal</small></span><button class="fpm-remove" type="button" data-fpm-remove="${index}" aria-label="移除${esc(item.name)}">×</button></div>`; }).join('') : '<div class="fpm-empty">识别照片或手动添加食物。</div>'}</div>
        <div class="fpm-oil-row"><div><b>本餐额外烹调油</b><small>填写本餐实际用油；未填写的用油不计。</small></div><label class="fpm-grams"><input id="fpmOil" type="number" min="0" max="100" step="1" value="${current.oil}" aria-label="本餐额外烹调油克重">g</label></div>
        <label class="fpm-label">餐食名称<input id="fpmMealName" type="text" maxlength="50" value="${esc(current.name)}" placeholder="例如：今天的午餐" required></label>
        <div class="fpm-total"><div><span>参考热量合计</span><strong id="fpmTotal">${totalCalories()}</strong> <small>kcal</small></div><span class="fpm-estimate-tag">估算值</span></div>

        <label class="fpm-confirm"><input id="fpmConfirmed" type="checkbox" required ${current.confirmed ? 'checked' : ''}><span>已核对食物种类和份量，按估算值记录。</span></label>
        <div class="fpm-footer"><small>仅保存缩略图和饮食记录。</small><button type="submit" id="fpmSaveButton" class="fpm-primary" ${!hasItems || !current.confirmed || !hasPhoto ? 'disabled' : ''}>确认并记入饮食 ✓</button></div>
      </form>
      <p class="fpm-privacy"><a href="https://huggingface.co/Xenova/clip-vit-base-patch32" target="_blank" rel="noopener noreferrer">模型说明</a> · 照片在本机识别。</p>
    </div>`;
    if (camera) {
      const video = $('#fpmCameraVideo');
      video.srcObject = camera;
      video.play().catch(() => setStatus('相机预览暂未开始，请关闭相机后重试，或上传照片。', 'error'));
    }
  }

  function totalCalories() {
    if (!current) return 0;
    return Math.round(current.items.reduce((sum, item) => sum + (Number.isFinite(item.grams) ? Math.max(0, item.grams) : 0) * item.kcal100 / 100, 0) + (Number.isFinite(current.oil) ? Math.max(0, current.oil) : 0) * OIL_KCAL_100 / 100);
  }

  function updateTotals() {
    if (!current) return;
    current.confirmed = !!($('#fpmConfirmed') && $('#fpmConfirmed').checked);
    const total = $('#fpmTotal');
    if (total) total.textContent = totalCalories();
    current.items.forEach((item, index) => {
      const energy = $(`[data-fpm-row-energy="${index}"]`);
      if (energy) energy.innerHTML = `${Math.round((Number.isFinite(item.grams) ? Math.max(0, item.grams) : 0) * item.kcal100 / 100)}<small>kcal</small>`;
    });
    const valid = !!current.photo && current.items.length > 0 && current.items.every(item => Number.isFinite(item.grams) && item.grams > 0 && item.grams <= 2000) && Number.isFinite(current.oil) && current.oil >= 0 && current.oil <= 100;
    const save = $('#fpmSaveButton');
    if (save) save.disabled = !valid || !current.confirmed;
  }

  function addFood(id) {
    const food = findFood(id);
    if (!food || !current) return;
    if(current.busy){stopWorker();current.analysisStatus='cancelled';setStatus('已停止照片识别，改为手动确认食物与份量。','info');}
    const existing=current.items.find(item=>item.id===food.id);
    if(existing)existing.grams=Math.min(2000,existing.grams+Math.max(1,Number(food.grams)||100));
    else current.items.push({ id: food.id, name: food.name, grams: Math.max(1, Number(food.grams) || 100), kcal100: Number(food.kcal100) });
    current.suggestions=current.suggestions.filter(value=>value!==food.id);
    current.confirmed = false;
    render();
  }

  async function startCamera() {
    if (!current) return;
    if (current.busy) return;
    if (/Android|iPhone|iPad|iPod/i.test(navigator.userAgent) || !navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      $('#fpmCapture').click();
      return;
    }
    const context = current;
    try {
      stopCamera();
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 960 } }, audio: false });
      if (!isOpen() || current !== context) { stream.getTracks().forEach(track => track.stop()); return; }
      current.stream = stream;
      setStatus('将餐盘完整放入画面，再点击拍摄。', 'info');
      render();
    } catch (error) {
      if (current !== context) return;
      const denied = error && (error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError');
      setStatus(denied ? '相机权限未开启。你可以使用“从相册上传”，或在浏览器中允许此网站使用相机后重试。' : '这台设备的相机暂时不可用，可以从相册上传图片。', 'error');
      render();
    }
  }

  function captureFrame() {
    const video = $('#fpmCameraVideo');
    if (!video || !video.videoWidth || !video.videoHeight) { setStatus('相机画面还没准备好，请稍后再拍摄。', 'error'); return; }
    const canvas = document.createElement('canvas');
    const scale = Math.min(1, 1280 / Math.max(video.videoWidth, video.videoHeight));
    canvas.width = Math.round(video.videoWidth * scale);
    canvas.height = Math.round(video.videoHeight * scale);
    canvas.getContext('2d').drawImage(video, 0, 0, canvas.width, canvas.height);
    const context = current;
    canvas.toBlob(blob => { if (blob && current === context) acceptPhoto(blob); }, 'image/jpeg', 0.9);
  }

  async function acceptPhoto(file) {
    if (!current) return;
    if (!file.type.startsWith('image/')) { setStatus('请选择 JPEG、PNG、WebP 等图片文件。', 'error'); return; }
    if (file.size > MAX_FILE_BYTES) { setStatus('这张图片超过15 MB，请选择较小的照片。', 'error'); return; }
    const context = current;
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.src = url;
    try {
      await image.decode();
      if (current !== context) { URL.revokeObjectURL(url); return; }
      if (!image.naturalWidth || !image.naturalHeight) throw new Error('empty-image');
      // Decode validation also prevents passing unsupported HEIC/HEIF files to the model.
      stopCamera();
      stopWorker();
      if (current.photoURL) URL.revokeObjectURL(current.photoURL);
      current.photo = file;
      current.photoURL = url;
      current.width = image.naturalWidth;
      current.height = image.naturalHeight;
      current.thumbnail = makeThumbnail(image);
      current.analysisStatus = 'idle';
      current.suggestions = [];
      current.items = [];
      current.oil = 0;
      current.confirmed = false;
      setStatus('照片已在本机打开。点击识别后才会下载模型；也可直接手动选择食物。', 'info');
      render();
    } catch (_) {
      URL.revokeObjectURL(url);
      if (current === context) setStatus('浏览器无法读取这张图片。请转换成 JPEG、PNG 或 WebP 后重试。', 'error');
    }
  }

  function makeThumbnail(image) {
    const canvas = document.createElement('canvas');
    const scale = Math.min(1, 240 / Math.max(image.naturalWidth, image.naturalHeight));
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    const ctx=canvas.getContext('2d');
    ctx.fillStyle='#f3f0e8';ctx.fillRect(0,0,canvas.width,canvas.height);
    ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/jpeg', 0.7);
  }

  function createWorker() {
    if (worker) return worker;
    worker = new Worker(WORKER_URL, { type: 'module', name: 'boji-local-food-recognition' });
    worker.onmessage = handleWorkerMessage;
    worker.onerror = () => failAnalysis('本机识别程序未能启动。可能是网络或浏览器限制；没有生成识别结果。可以重试，或手动选择食物。');
    worker.onmessageerror = () => failAnalysis('本机识别无法读取这张图片。请尝试另一张照片，或手动选择食物。');
    return worker;
  }

  async function analysePhoto() {
    if (!current || !current.photo || current.busy) return;
    const foods = catalog().filter(f => Number(f.kcal100) < 700);
    if (!foods.length) { setStatus('食物目录尚未加载，暂时无法识别。请刷新页面重试。', 'error'); return; }
    current.items=[];
    current.busy = true;
    current.progress = NaN;
    current.analysisStatus = 'loading';
    current.confirmed = false;
    current.suggestions = [];
    const id = ++runCounter;
    current.runId = id;
    current.labelMap = new Map(foods.map(f => [String(f.label || f.englishName || f.id).trim(), f.id]));
    const labels = [...current.labelMap.keys(), ...negatives];
    current.status = modelReady ? '正在本机比对食物候选，照片不会发送到服务器。' : '正在联网加载本机识别模型。首次下载较大，请保持页面打开；照片不会发送到服务器。';
    current.statusKind = 'loading';
    render();
    try {
      const activeWorker = createWorker();
      activeWorker.postMessage({ id, photo: current.photo, labels });
      current.modelTimer = setTimeout(() => {
        if (current && current.runId === id && current.busy) {
          setStatus('模型仍在加载或运行。首次可能需要数分钟；如网络较慢，可以取消并手动记餐。', 'loading');
        }
      }, 45000);
    } catch (_) {
      failAnalysis('此浏览器暂不支持本机识别，或程序未能加载。没有生成识别结果，你仍可手动选择食物。');
    }
  }

  function handleWorkerMessage(event) {
    if (!current || !dialog.open) return;
    const message = event.data || {};
    if (message.id && message.id !== current.runId) return;
    if (message.type === 'progress') {
      const data = message.data || {};
      if (data.status === 'progress' && Number.isFinite(data.progress)) {
        current.progress = Math.max(0, Math.min(100, data.progress));
        const bar = $('#fpmModelProgress');
        if (bar) bar.value = current.progress;
        const file = String(data.file || '模型文件').split('/').pop();
        setStatus(`正在下载本机模型文件 ${file}：${Math.round(current.progress)}%。照片仍在本机。`, 'loading');
      } else if (data.status === 'initiate' || data.status === 'download') {
        setStatus('正在准备模型文件。首次需联网下载约150 MB，缓存后通常会更快。', 'loading');
      }
      return;
    }
    if (message.type === 'ready') {
      modelReady = true;
      current.progress = 100;
      const bar = $('#fpmModelProgress');
      if (bar) bar.value = 100;
      setStatus('模型已就绪，正在本机分析食物候选。', 'loading');
      return;
    }
    if (message.type === 'error') {
      failAnalysis('本机识别未完成。模型下载或浏览器计算可能受网络、内存或权限限制；本次没有生成识别结果。可以重试，或手动选择食物。');
      return;
    }
    if (message.type !== 'result') return;
    if (current.modelTimer) clearTimeout(current.modelTimer);
    current.busy = false;
    const results = Array.isArray(message.result) ? message.result.filter(r => r && Number.isFinite(r.score)) : [];
    const best = results[0];
    const bestFood = best && current.labelMap.get(best.label);
    const foodResults = results.filter(r => current.labelMap.has(r.label));
    const top = foodResults[0];
    const next = foodResults[1];
    // This product-level rejection rule is not a confidence estimate. The model
    // scores are relative to these labels and are not calibrated probabilities.
    const unclear = !bestFood || !top || top.score < 0.16 || (next && top.score < next.score * 1.08);
    current.suggestions = [...new Set(foodResults.slice(0, 4).map(r => current.labelMap.get(r.label)))];
    if (unclear) {
      current.analysisStatus = 'uncertain';
      setStatus('模型没有得到足够清楚的主要食物候选。本次未自动预填食物或热量，请从下方手动确认。', 'warning');
    } else {
      current.analysisStatus = 'success';
      const food = findFood(bestFood);
      if (food) {
        // Only a candidate identity comes from the image. No amount is inferred.
        current.items = [{ id: food.id, name: food.name, grams: Math.max(1, Number(food.grams) || 100), kcal100: Number(food.kcal100) }];
        current.suggestions=current.suggestions.filter(id=>id!==food.id);
        if (!current.name) current.name = food.name + ' · 照片记录';
      }
      setStatus(`照片中的主要食物可能是“${food ? food.name : '所列候选'}”。已放入一份目录参考份量，请核对并补上其他实际食物；份量不是从照片测得。`, 'success');
    }
    current.confirmed = false;
    render();
  }

  function failAnalysis(message) {
    if (!current) return;
    if (current.modelTimer) clearTimeout(current.modelTimer);
    stopWorker();
    current.analysisStatus = 'error';
    current.suggestions = [];
    current.confirmed = false;
    setStatus(message, 'error');
    render();
  }

  function saveMeal() {
    if (!current || !current.photo || !current.items.length || !current.confirmed) return;
    const form = $('#fpmSaveForm');
    if (!form.reportValidity()) return;
    const name = ($('#fpmMealName').value || '').trim();
    if (!name) { $('#fpmMealName').focus(); return; }
    const items = current.items.map(item => ({ id: item.id, name: item.name, grams: item.grams, kcal100: item.kcal100 }));
    if (current.oil > 0) items.push({ id: 'added-cooking-oil', name: '额外烹调油', grams: current.oil, kcal100: OIL_KCAL_100 });
    const record = {
      name, calories: totalCalories(), items, photoThumbnail: current.thumbnail,
      source: current.analysisStatus === 'success' ? 'photo-estimate' : 'photo-manual',
      recognitionStatus: current.analysisStatus,
      portionConfirmed: true,
      oilGrams: current.oil
    };
    const onSave = current.onSave;
    close();
    if (typeof onSave === 'function') onSave(record);
  }

  window.FoodPhoto = Object.freeze({
    open(options = {}) {
      ensureDialog();
      cleanup();
      current = { date: options.date || '', onSave: options.onSave, photo: null, photoURL: null, thumbnail: '', items: [], oil: 0, name: '', confirmed: false, stream: null, busy: false, progress: NaN, analysisStatus: 'idle', suggestions: [], status: '', statusKind: 'info', labelMap: new Map() };
      render();
      if (!dialog.open) dialog.showModal();
      dialog.scrollTop=0;
    },
    close
  });
})();
