/* 左下角“照片背包”：内置 5 类真实照片，可多选后拖到类别卡片，或拖一张到测试框 */
(function () {
  'use strict';

  var BASE = 'assets/pack/';
  var GROUPS = [
    { key: 'ginkgo', name: '银杏叶' },
    { key: 'apple', name: '苹果' },
    { key: 'pear', name: '梨子' },
    { key: 'strawberry', name: '草莓' },
    { key: 'banana', name: '香蕉' }
  ];
  var counts = { ginkgo: 20, apple: 20, pear: 20, strawberry: 20, banana: 20 };

  var pack = document.getElementById('pack');
  var toggle = document.getElementById('packToggle');
  var panel = document.getElementById('packPanel');
  var closeBtn = document.getElementById('packClose');
  var tabs = document.getElementById('packTabs');
  var grid = document.getElementById('packGrid');
  var selText = document.getElementById('packSelText');
  var clearBtn = document.getElementById('packClear');
  var classGrid = document.getElementById('classGrid');
  var dropzone = document.getElementById('dropzone');

  var active = GROUPS[0].key;
  var picked = [];

  function pad(n) {
    return ('0' + n).slice(-2);
  }

  function srcOf(key, i) {
    return BASE + key + '/' + pad(i + 1) + '.jpg';
  }

  function nameOf(key, i) {
    return key + '-' + pad(i + 1) + '.jpg';
  }

  function renderTabs() {
    tabs.innerHTML = GROUPS.map(function (g) {
      return '<button class="pack-tab' + (g.key === active ? ' is-active' : '') + '" data-key="' + g.key + '">' +
        g.name + ' ' + counts[g.key] + '</button>';
    }).join('');
    var total = 0;
    GROUPS.forEach(function (g) { total += counts[g.key]; });
    var em = toggle.querySelector('em');
    if (em) em.textContent = GROUPS.length + ' 类 · ' + total + ' 张';
  }

  function renderGrid() {
    var html = '';
    var n = counts[active] || 0;
    for (var i = 0; i < n; i++) {
      var src = srcOf(active, i);
      html += '<button class="pack-item" draggable="true" data-src="' + src + '" data-name="' + nameOf(active, i) +
        '" title="' + nameOf(active, i) + '"><img loading="lazy" src="' + src + '" alt="">' +
        '<span class="pack-tag">训练</span></button>';
    }
    grid.innerHTML = html;
    refreshPicked();
  }

  function refreshPicked() {
    var items = grid.querySelectorAll('.pack-item');
    for (var i = 0; i < items.length; i++) {
      items[i].classList.toggle('is-picked', picked.indexOf(items[i].getAttribute('data-src')) >= 0);
    }
    selText.textContent = picked.length ? ('已选 ' + picked.length + ' 张，拖到类别卡片') : '已选 0 张';
    clearBtn.disabled = picked.length === 0;
  }

  function setOpen(open) {
    panel.hidden = !open;
    toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    pack.classList.toggle('is-open', open);
    if (open) renderGrid();
  }

  /* ---------- 取图 ---------- */
  function fileOf(src) {
    return fetch(src)
      .then(function (r) { return r.blob(); })
      .then(function (blob) {
        return new File([blob], src.split('/').pop(), { type: blob.type || 'image/jpeg' });
      });
  }

  function filesOf(list) {
    return Promise.all(list.map(fileOf));
  }

  function toClass(classId, list) {
    filesOf(list).then(function (files) {
      window.AILab.addPhotos(classId, files);
    }).catch(function () { });
  }

  function toTest(src) {
    fileOf(src).then(function (file) {
      window.AILab.testFile(file);
    }).catch(function () { });
  }

  /* ---------- 拖拽 ---------- */
  grid.addEventListener('dragstart', function (e) {
    var item = e.target.closest('.pack-item');
    if (!item) return;
    var src = item.getAttribute('data-src');
    var list = picked.indexOf(src) >= 0 ? picked.slice() : [src];
    e.dataTransfer.setData('application/x-pack', JSON.stringify(list));
    e.dataTransfer.setData('text/plain', list.join('\n'));
    e.dataTransfer.effectAllowed = 'copy';
  });

  function hasPack(dt) {
    var types = dt.types || [];
    for (var i = 0; i < types.length; i++) {
      if (String(types[i]).indexOf('application/x-pack') === 0) return true;
    }
    return false;
  }

  function payloadOf(dt) {
    var raw = dt.getData('application/x-pack');
    if (!raw) return null;
    try {
      var list = JSON.parse(raw);
      return Array.isArray(list) && list.length ? list : null;
    } catch (err) {
      return [raw];
    }
  }

  function dropTarget(e) {
    return e.target.closest ? e.target.closest('.class-card, #dropzone') : null;
  }

  document.addEventListener('dragover', function (e) {
    if (!hasPack(e.dataTransfer)) return;
    var target = dropTarget(e);
    if (!target) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
    target.classList.add('is-drop');
  });

  document.addEventListener('dragleave', function (e) {
    if (!hasPack(e.dataTransfer)) return;
    var target = dropTarget(e);
    if (target) target.classList.remove('is-drop');
  });

  document.addEventListener('drop', function (e) {
    if (!hasPack(e.dataTransfer)) return;
    var target = dropTarget(e);
    if (!target) return;
    e.preventDefault();
    target.classList.remove('is-drop');
    var list = payloadOf(e.dataTransfer);
    if (!list) return;
    if (target.id === 'dropzone') {
      toTest(list[0]);
    } else {
      toClass(target.getAttribute('data-class'), list);
    }
  });

  /* ---------- 点选（多选；没有鼠标拖动时的备选） ---------- */
  grid.addEventListener('click', function (e) {
    var item = e.target.closest('.pack-item');
    if (!item) return;
    var src = item.getAttribute('data-src');
    var at = picked.indexOf(src);
    if (at >= 0) picked.splice(at, 1); else picked.push(src);
    refreshPicked();
  });

  classGrid.addEventListener('click', function (e) {
    if (!picked.length) return;
    if (e.target.closest('[data-act]')) return;
    var card = e.target.closest('.class-card');
    if (!card) return;
    toClass(card.getAttribute('data-class'), picked.slice());
  });

  dropzone.addEventListener('click', function (e) {
    if (!picked.length) return;
    e.preventDefault();
    e.stopPropagation();
    toTest(picked[0]);
  }, true);

  /* ---------- 开合 ---------- */
  toggle.addEventListener('click', function () { setOpen(panel.hidden); });
  closeBtn.addEventListener('click', function () { setOpen(false); });
  clearBtn.addEventListener('click', function () {
    picked = [];
    refreshPicked();
  });
  tabs.addEventListener('click', function (e) {
    var btn = e.target.closest('.pack-tab');
    if (!btn) return;
    active = btn.getAttribute('data-key');
    renderTabs();
    renderGrid();
  });

  renderTabs();
  renderGrid();

  // 每类实际张数（生成脚本会写 counts.json），拿不到就用默认值
  fetch(BASE + 'counts.json')
    .then(function (r) { return r.ok ? r.json() : null; })
    .then(function (data) {
      if (!data) return;
      GROUPS.forEach(function (g) {
        if (typeof data[g.key] === 'number') counts[g.key] = data[g.key];
      });
      renderTabs();
      renderGrid();
    })
    .catch(function () { });
})();
