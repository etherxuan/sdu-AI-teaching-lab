/* 页面逻辑：类别管理、照片入库、训练、测试 */
(function () {
  'use strict';

  const PALETTE = ['#2E7D74', '#C4841D', '#4169B8', '#B4462F', '#6B4FA8', '#3B8A5E', '#B85C86', '#5F707D'];
  const $ = (id) => document.getElementById(id);

  const state = {
    classes: [],
    modelValid: false,
    modelClassIds: [],
    modelNames: [],
    modelCount: 0,
    modelFeatures: [],
    modelLabels: [],
    lastTestFeatures: null,
    pendingData: null,
    modelStale: false,
    worker: null,
    busy: false,
    training: false,
    predicting: false,
    pendingMeta: null,
    requestId: 0,
    testUrl: null
  };

  const els = {
    className: $('className'),
    addClassBtn: $('addClassBtn'),
    suggest: $('suggest'),
    classGrid: $('classGrid'),
    classEmpty: $('classEmpty'),
    classStatus: $('classStatus'),
    statClasses: $('statClasses'),
    statPhotos: $('statPhotos'),
    reactor: $('reactor'),
    reactorTitle: $('reactorTitle'),
    reactorSub: $('reactorSub'),
    trainInfo: $('trainInfo'),
    trainBtn: $('trainBtn'),
    trainProgress: $('trainProgress'),
    trainStage: $('trainStage'),
    trainHint: $('trainHint'),
    testPanel: $('testPanel'),
    dropzone: $('dropzone'),
    testFile: $('testFile'),
    testLock: $('testLock'),
    testLockText: $('testLockText'),
    testResult: $('testResult'),
    modelBadge: $('modelBadge'),
    clearAllBtn: $('clearAllBtn'),
    toast: $('toast'),
    modal: $('modal'),
    modalTitle: $('modalTitle'),
    modalText: $('modalText'),
    modalOk: $('modalOk'),
    modalCancel: $('modalCancel')
  };

  let toastTimer = null;

  init();

  async function init() {
    bindEvents();
    initWorker();
    try {
      await reload();
    } catch (err) {
      toast(err.message || '本地数据库打不开，请换用 Chrome 或 Edge。', true);
    }
    renderAll();
  }

  function initWorker() {
    try {
      state.worker = new Worker('js/worker.js');
      state.worker.onmessage = onWorkerMessage;
      state.worker.onerror = () => toast('后台训练线程出错了，请刷新页面重试。', true);
    } catch (err) {
      toast('这个浏览器不支持后台训练，请换用 Chrome 或 Edge。', true);
    }
  }

  function bindEvents() {
    els.addClassBtn.addEventListener('click', addClass);
    els.className.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') addClass();
    });
    els.suggest.addEventListener('click', (e) => {
      const btn = e.target.closest('button[data-name]');
      if (!btn) return;
      els.className.value = btn.dataset.name;
      els.className.focus();
    });
    els.classGrid.addEventListener('click', onClassGridClick);
    els.trainBtn.addEventListener('click', startTraining);
    els.testFile.addEventListener('change', () => {
      const file = els.testFile.files && els.testFile.files[0];
      if (file) handleTestFile(file);
      els.testFile.value = '';
    });
    els.testResult.addEventListener('click', (e) => {
      if (e.target.closest('#testAgain')) resetTest();
    });
    els.dropzone.addEventListener('dragover', (e) => {
      e.preventDefault();
      els.dropzone.classList.add('drag');
    });
    els.dropzone.addEventListener('dragleave', () => els.dropzone.classList.remove('drag'));
    els.dropzone.addEventListener('drop', (e) => {
      e.preventDefault();
      els.dropzone.classList.remove('drag');
      const file = e.dataTransfer.files && e.dataTransfer.files[0];
      if (file) handleTestFile(file);
    });
    els.clearAllBtn.addEventListener('click', clearAll);
    els.modalCancel.addEventListener('click', () => closeModal(false));
    els.modalOk.addEventListener('click', () => closeModal(true));
    els.modal.addEventListener('click', (e) => {
      if (e.target === els.modal) closeModal(false);
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !els.modal.hidden) closeModal(false);
    });
  }

  async function reload() {
    const [classes, images] = await Promise.all([DB.listClasses(), DB.listAllImages()]);
    const map = new Map();
    classes.forEach((c, i) => {
      map.set(c.id, Object.assign({}, c, { images: [], color: c.color || PALETTE[i % PALETTE.length] }));
    });
    images.sort((a, b) => a.id - b.id).forEach((img) => {
      const cls = map.get(img.classId);
      if (cls) cls.images.push(img);
    });
    state.classes = Array.from(map.values());
  }

  function renderAll() {
    renderClasses();
    renderTrain();
    renderTestState();
  }

  function renderClasses() {
    const total = state.classes.reduce((n, c) => n + c.images.length, 0);
    els.classStatus.textContent = `${state.classes.length} 类 · ${total} 张`;
    els.classEmpty.hidden = state.classes.length > 0;
    els.suggest.hidden = state.classes.length > 0;
    els.classGrid.innerHTML = state.classes.map(classCardHTML).join('');
    if (els.statClasses) els.statClasses.textContent = state.classes.length;
    if (els.statPhotos) els.statPhotos.textContent = total;
  }

  function classCardHTML(c) {
    const thumbs = c.images.map((img) => `
      <div class="thumb">
        <img loading="lazy" src="${img.thumb}" alt="">
        <button class="thumb-del" data-act="del-img" data-img="${img.id}" title="删除这张照片" aria-label="删除这张照片">×</button>
      </div>`).join('');

    return `
      <article class="class-card" data-class="${c.id}" style="--accent:${c.color}">
        <div class="class-head">
          <span class="class-dot" aria-hidden="true"></span>
          <h3 class="class-name" title="${esc(c.name)}">${esc(c.name)}</h3>
          <span class="class-count">${c.images.length} 张</span>
          <div class="class-actions">
            <button class="icon-btn" data-act="rename" title="重命名">
              <svg viewBox="0 0 24 24" fill="none"><path d="M4 20h4l10.5-10.5a2.1 2.1 0 0 0-3-3L5 17.5V20Z" stroke="currentColor" stroke-width="1.8"/></svg>
            </button>
            <button class="icon-btn danger" data-act="delete" title="删除类别">
              <svg viewBox="0 0 24 24" fill="none"><path d="M5 7h14M9 7V4.8A.8.8 0 0 1 9.8 4h4.4a.8.8 0 0 1 .8.8V7M7 7l.8 12.2a1 1 0 0 0 1 .8h6.4a1 1 0 0 0 1-.8L17 7" stroke="currentColor" stroke-width="1.7"/></svg>
            </button>
          </div>
        </div>
        <div class="thumbs">
          ${thumbs}
          <button class="add-tile" data-act="pick" title="添加照片">
            <span>＋</span>加照片
          </button>
        </div>
        <div class="card-foot">
          <button class="btn ghost" data-act="pick">选照片</button>
          <button class="btn ghost" data-act="camera">拍照</button>
        </div>
      </article>`;
  }

  function renderTrain() {
    const check = canTrain();
    const total = state.classes.reduce((n, c) => n + c.images.length, 0);
    if (state.classes.length === 0) {
      els.trainInfo.innerHTML = '先建立 <b>2</b> 个类别，再启动训练。';
    } else if (state.classes.length < 2) {
      els.trainInfo.innerHTML = '再建 <b>1</b> 个类别，才能比较。';
    } else if (!check.ok) {
      els.trainInfo.innerHTML = `<span class="warn">${esc(check.message)}</span>`;
    } else {
      els.trainInfo.innerHTML = `<b>${state.classes.length}</b> 类 / <b>${total}</b> 张，数据就绪。`;
    }
    els.trainBtn.disabled = !check.ok || state.training;
    const crowded = state.classes.length > 6 || state.classes.some((c) => c.images.length > 20);
    els.trainHint.hidden = !crowded;
    els.trainHint.textContent = crowded ? '数据较多，训练可能要等十几秒。' : '';
    els.statClasses.textContent = state.classes.length;
    els.statPhotos.textContent = total;
    renderReactor(check.ok);
  }

  function renderReactor(ready) {
    if (state.training) {
      setCore('training', '学习中', '正在分析照片');
      return;
    }
    if (state.modelValid) {
      setCore('ready', '已就绪', '模型可以用了');
      return;
    }
    if (ready && state.modelStale) {
      setCore('idle', '待命', '数据有变化，请重新训练');
      return;
    }
    if (ready) {
      setCore('ready', '就绪', '可以启动训练');
      return;
    }
    setCore('idle', '待命', '等待数据');
  }

  function setCore(mode, title, sub) {
    if (!els.reactor) return;
    els.reactor.classList.toggle('is-training', mode === 'training');
    els.reactor.classList.toggle('is-ready', mode === 'ready');
    els.reactorTitle.textContent = title;
    els.reactorSub.textContent = sub;
  }

  function canTrain() {
    if (state.classes.length < 2) return { ok: false, message: '至少要有 2 个类别。' };
    const empty = state.classes.find((c) => c.images.length === 0);
    if (empty) return { ok: false, message: `“${empty.name}”还没有照片，先添加至少 1 张。` };
    return { ok: true };
  }

  function renderTestState() {
    const locked = !state.modelValid;
    els.testLock.hidden = !locked;
    els.modelBadge.hidden = !state.modelValid;
    els.testPanel.classList.toggle('has-result', !!state.testUrl || !els.testResult.hidden);
    if (locked) {
      els.testLockText.textContent = state.modelCount > 0
        ? '照片或类别变了，请重新训练一次。'
        : '先完成训练，才能开始测试。';
    }
  }

  function addClass() {
    if (state.training) {
      toast('正在训练，等它完成再改类别。');
      return;
    }
    const name = els.className.value.trim().replace(/\s+/g, ' ');
    if (!name) {
      toast('先给类别起个名字，比如“银杏叶”。', true);
      els.className.focus();
      return;
    }
    if (name.length > 12) {
      toast('名字太长，最多 12 个字。', true);
      return;
    }
    if (state.classes.some((c) => c.name === name)) {
      toast(`已经有“${name}”这个类别了。`, true);
      return;
    }
    DB.addClass(name, PALETTE[state.classes.length % PALETTE.length], state.classes.length)
      .then(reload)
      .then(() => {
        els.className.value = '';
        renderAll();
        toast(`已建立“${name}”，接着给它加照片。`);
      })
      .catch((err) => toast(err.message || '类别没有保存成功。', true));
  }

  async function onClassGridClick(e) {
    if (state.training) {
      toast('正在训练，等它完成再改照片。');
      return;
    }
    const btn = e.target.closest('[data-act]');
    if (!btn) return;
    const card = e.target.closest('.class-card');
    if (!card) return;
    const cls = state.classes.find((c) => c.id === card.dataset.class);
    if (!cls) return;
    const act = btn.dataset.act;

    if (act === 'pick') {
      const files = await pickFiles(true);
      if (files.length) addPhotos(cls.id, files);
    } else if (act === 'camera') {
      const files = await pickFiles(false, true);
      if (files.length) addPhotos(cls.id, files);
    } else if (act === 'delete') {
      const ok = await confirmDialog('删除这个类别？', `“${cls.name}”和里面的 ${cls.images.length} 张照片都会删除，不能恢复。`, '删除');
      if (!ok) return;
      try {
        await DB.deleteClass(cls.id);
        invalidateModel();
        await reload();
        renderAll();
        toast(`已删除“${cls.name}”。`);
      } catch (err) {
        toast(err.message || '删除失败。', true);
      }
    } else if (act === 'rename') {
      beginRename(card, cls);
    } else if (act === 'del-img') {
      const imgId = Number(btn.dataset.img);
      try {
        await DB.deleteImage(imgId);
        invalidateModel();
        await reload();
        renderAll();
        toast('已删除这张照片。');
      } catch (err) {
        toast(err.message || '删除失败。', true);
      }
    }
  }

  function beginRename(card, cls) {
    const nameEl = card.querySelector('.class-name');
    if (!nameEl) return;
    const input = document.createElement('input');
    input.type = 'text';
    input.maxLength = 12;
    input.value = cls.name;
    input.className = 'rename-input';
    nameEl.replaceWith(input);
    input.focus();
    input.select();

    let finished = false;
    const finish = async (save) => {
      if (finished) return;
      finished = true;
      const next = input.value.trim().replace(/\s+/g, ' ');
      if (!save || !next || next === cls.name) {
        renderClasses();
        return;
      }
      if (next.length > 12) {
        toast('名字太长，最多 12 个字。', true);
        renderClasses();
        return;
      }
      if (state.classes.some((c) => c.id !== cls.id && c.name === next)) {
        toast(`已经有“${next}”这个类别了。`, true);
        renderClasses();
        return;
      }
      try {
        await DB.renameClass(cls.id, next);
        await reload();
        renderAll();
        toast('名字已改好。');
      } catch (err) {
        toast(err.message || '改名失败。', true);
        renderClasses();
      }
    };

    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') finish(true);
      if (e.key === 'Escape') finish(false);
    });
    input.addEventListener('blur', () => finish(true));
  }

  function pickFiles(multiple, camera) {
    return new Promise((resolve) => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = 'image/*';
      if (multiple) input.multiple = true;
      if (camera) input.capture = 'environment';
      input.addEventListener('change', () => resolve(Array.from(input.files || [])));
      input.click();
    });
  }

  async function addPhotos(classId, files) {
    if (state.busy) {
      toast('上一批照片还在处理，请稍等一下。');
      return;
    }
    state.busy = true;
    let done = 0;
    let failed = 0;
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      if (!file.type || !file.type.startsWith('image/')) {
        failed++;
        continue;
      }
      toast(`正在处理 ${i + 1}/${files.length} 张照片…`);
      try {
        const result = await Features.extract(file, { thumb: true });
        await DB.addImage({ classId, features: result.features, thumb: result.thumb });
        done++;
      } catch (err) {
        console.warn(err);
        failed++;
      }
    }
    state.busy = false;
    if (done) {
      invalidateModel();
      await reload();
      renderAll();
    }
    toast(done
      ? `已添加 ${done} 张照片${failed ? `，${failed} 张没成功` : ''}。`
      : '这些照片都没能读出来，换几张试试。', !done);
  }

  function startTraining() {
    if (state.training) return;
    const check = canTrain();
    if (!check.ok) {
      toast(check.message, true);
      return;
    }
    if (!state.worker) {
      toast('训练线程没有启动，请刷新页面。', true);
      return;
    }

    const samples = [];
    const labels = [];
    const classIds = [];
    const names = [];
    state.classes.forEach((c, index) => {
      classIds.push(c.id);
      names.push(c.name);
      c.images.forEach((img) => {
        samples.push(img.features);
        labels.push(index);
      });
    });

    state.training = true;
    state.pendingMeta = { classIds, names };
    state.pendingData = { samples, labels };
    resetTest();
    setCore('training', '学习中', `分析 ${samples.length} 张照片`);
    els.trainProgress.hidden = false;
    els.trainStage.textContent = '正在读取照片…';
    els.trainBtn.disabled = true;
    els.trainHint.hidden = true;

    state.worker.postMessage({
      type: 'train',
      samples,
      labels,
      classCount: state.classes.length,
      gamma: 0.05
    });
  }

  function onWorkerMessage(event) {
    const msg = event.data || {};
    if (msg.type === 'stage') {
      if (state.training) els.trainStage.textContent = msg.text;
      return;
    }
    if (msg.type === 'trained') {
      state.training = false;
      els.trainProgress.hidden = true;
      const meta = state.pendingMeta || { classIds: [], names: [] };
      if (!meta.classIds.length) {
        toast('训练结果和类别对不上，请重新训练。', true);
        return;
      }
      state.modelValid = true;
      state.modelStale = false;
      state.modelClassIds = meta.classIds.slice();
      state.modelNames = meta.names.slice();
      state.modelCount = msg.count;
      const data = state.pendingData || { samples: [], labels: [] };
      state.modelFeatures = data.samples;
      state.modelLabels = data.labels;
      renderTrain();
      renderTestState();
      toast(`训练完成：${msg.count} 张照片，${meta.classIds.length} 个类别。现在可以考它了。`);
      return;
    }
    if (msg.type === 'predicted') {
      if (msg.requestId !== state.requestId) return;
      state.predicting = false;
      showPrediction(msg);
      return;
    }
    if (msg.type === 'error') {
      state.training = false;
      state.predicting = false;
      els.trainProgress.hidden = true;
      renderTrain();
      toast(`出错了：${msg.message}`, true);
    }
  }

  function invalidateModel() {
    state.modelValid = false;
    state.modelStale = true;
    state.modelClassIds = [];
    state.modelNames = [];
    state.modelFeatures = [];
    state.modelLabels = [];
    state.lastTestFeatures = null;
    if (state.worker) state.worker.postMessage({ type: 'reset' });
    els.modelBadge.hidden = true;
    resetTest();
    renderTestState();
    renderTrain();
  }

  async function handleTestFile(file) {
    if (!state.modelValid) {
      toast('先训练一个模型，再来考它。', true);
      return;
    }
    if (!file.type || !file.type.startsWith('image/')) {
      toast('这不是图片文件，换一张试试。', true);
      return;
    }
    if (state.predicting) return;

    state.predicting = true;
    try {
      const result = await Features.extract(file, { thumb: false });
      if (state.testUrl) URL.revokeObjectURL(state.testUrl);
      state.testUrl = URL.createObjectURL(file);

      els.testResult.hidden = false;
      els.testPanel.classList.add('has-result');
      els.testResult.innerHTML = `
        <div class="result-preview"><img src="${state.testUrl}" alt="待测试的照片"></div>
        <div class="result-body" style="--accent:var(--teal)">
          <p class="result-kicker">正在识别</p>
          <div class="result-answer"><strong>稍等…</strong></div>
          <div class="bars"><div class="prob"><span class="label">模型正在作答</span><div class="track"><div class="fill" style="width:40%"></div></div><span class="pct">…</span></div></div>
        </div>`;

      const requestId = ++state.requestId;
      state.lastTestFeatures = result.features;
      state.worker.postMessage({ type: 'predict', features: result.features, requestId });
    } catch (err) {
      state.predicting = false;
      toast(err.message || '这张照片读不出来，换一张试试。', true);
    }
  }

  function showPrediction(msg) {
    const labels = state.modelClassIds;
    if (!labels.length) return;

    const pred = Number(msg.prediction);
    if (!Number.isInteger(pred) || pred < 0 || pred >= labels.length) {
      toast('模型返回了无法识别的结果，请重新训练。', true);
      return;
    }

    const neighbors = neighborScores(state.lastTestFeatures, labels.length);
    const scores = neighbors.scores;
    const knnTop = scores.reduce((best, value, i) => (value > scores[best] ? i : best), 0);
    const topShare = scores[pred] || 0;
    const uncertain = topShare < 0.6 || knnTop !== pred;

    const rows = labels.map((id, i) => {
      const cls = state.classes.find((c) => c.id === id);
      return {
        name: cls ? cls.name : (state.modelNames[i] || `类别 ${i + 1}`),
        color: cls ? cls.color : PALETTE[i % PALETTE.length],
        p: scores[i] || 0
      };
    });
    const top = rows[pred];

    const bars = rows.map((row, i) => {
      const pct = Math.round(row.p * 1000) / 10;
      return `
        <div class="prob${i === pred ? ' top' : ''}" style="--accent:${row.color}">
          <span class="label">${esc(row.name)}</span>
          <div class="track"><div class="fill" style="width:${pct}%"></div></div>
          <span class="pct">${pct}%</span>
        </div>`;
    }).join('');

    els.testResult.innerHTML = `
      <div class="result-preview"><img src="${state.testUrl}" alt="测试照片"></div>
      <div class="result-body" style="--accent:${top.color}">
        <p class="result-kicker">它认为这是</p>
        <div class="result-answer">
          <strong>${esc(top.name)}</strong>
          <span class="conf">${topShare > 0 ? Math.round(topShare * 100) + '%' : '？'}</span>
        </div>
        ${uncertain ? '<span class="uncertain">它也不太确定</span>' : ''}
        <div class="bars">${bars}</div>
        <p class="note">条形图表示：最像的 ${neighbors.k} 张训练照片里，每个类别占几成。最终答案由 SVM 给出，不是百分百把握。</p>
        <div class="result-actions">
          <button class="btn ghost" id="testAgain">再测一张</button>
        </div>
      </div>`;
    els.testPanel.classList.add('has-result');
  }

  function neighborScores(features, classCount) {
    const k = Math.min(5, state.modelFeatures.length);
    const scores = new Array(classCount).fill(0);
    if (!features || !k) return { scores, k: 0 };

    const nearest = [];
    for (let i = 0; i < state.modelFeatures.length; i++) {
      nearest.push({ d: distance2(state.modelFeatures[i], features), y: state.modelLabels[i] });
    }
    nearest.sort((a, b) => a.d - b.d);
    for (let i = 0; i < k; i++) {
      const y = nearest[i].y;
      if (y >= 0 && y < classCount) scores[y] += 1 / k;
    }
    return { scores, k };
  }

  function distance2(a, b) {
    let sum = 0;
    for (let i = 0; i < a.length; i++) {
      const d = a[i] - b[i];
      sum += d * d;
    }
    return sum;
  }

  function resetTest() {
    state.predicting = false;
    if (state.testUrl) {
      URL.revokeObjectURL(state.testUrl);
      state.testUrl = null;
    }
    els.testResult.hidden = true;
    els.testResult.innerHTML = '';
    els.testPanel.classList.remove('has-result');
  }

  async function clearAll() {
    if (state.training) {
      toast('正在训练，等它完成再清空。');
      return;
    }
    const ok = await confirmDialog('清空全部数据？', '所有类别和照片都会被删除，不能恢复。', '全部清空');
    if (!ok) return;
    try {
      await DB.clearAll();
      invalidateModel();
      await reload();
      renderAll();
      toast('已清空，可以重新开始。');
    } catch (err) {
      toast(err.message || '清空失败。', true);
    }
  }

  let modalResolve = null;

  function confirmDialog(title, text, okText) {
    els.modalTitle.textContent = title;
    els.modalText.textContent = text;
    els.modalOk.textContent = okText || '删除';
    els.modalOk.classList.toggle('danger', true);
    els.modal.hidden = false;
    return new Promise((resolve) => { modalResolve = resolve; });
  }

  function closeModal(result) {
    els.modal.hidden = true;
    if (modalResolve) {
      const resolve = modalResolve;
      modalResolve = null;
      resolve(result);
    }
  }

  function toast(message, isError) {
    els.toast.textContent = message;
    els.toast.classList.toggle('error', !!isError);
    els.toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => els.toast.classList.remove('show'), 2800);
  }

  function esc(value) {
    return String(value).replace(/[&<>"']/g, (m) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[m]));
  }
})();
