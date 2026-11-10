/* 左下角“照片背包”：内置 5 类照片，可以拖到类别卡片（当训练照片）或测试框 */
(function () {
  'use strict';

  var BASE = 'assets/pack/';
  var COUNT = 20;
  var GROUPS = [
    { key: 'ginkgo', name: '银杏叶' },
    { key: 'apple', name: '苹果' },
    { key: 'pear', name: '梨子' },
    { key: 'strawberry', name: '草莓' },
    { key: 'banana', name: '香蕉' }
  ];

  var pack = document.getElementById('pack');
  var toggle = document.getElementById('packToggle');
  var panel = document.getElementById('packPanel');
  var closeBtn = document.getElementById('packClose');
  var tabs = document.getElementById('packTabs');
  var grid = document.getElementById('packGrid');
  var allBtn = document.getElementById('packAll');
  var tip = document.getElementById('packTip');
  var classGrid = document.getElementById('classGrid');
  var dropzone = document.getElementById('dropzone');

  var active = GROUPS[0].key;
  var picked = null;

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
        g.name + ' ' + COUNT + '</button>';
    }).join('');
  }

  function renderGrid() {
    var html = '';
    for (var i = 0; i < COUNT; i++) {
      var src = srcOf(active, i);
      html += '<button class="pack-item" draggable="true" data-src="' + src + '" data-name="' + nameOf(active, i) +
        '" title="' + nameOf(active, i) + '"><img loading="lazy" src="' + src + '" alt=""></button>';
    }
    grid.innerHTML = html;
    refreshPicked();
  }

  function refreshPicked() {
    var items = grid.querySelectorAll('.pack-item');
    for (var i = 0; i < items.length; i++) {
      items[i].classList.toggle('is-picked', !!picked && items[i].getAttribute('data-src') === picked.src);
    }
    tip.textContent = picked ? ('已选 ' + picked.name + '，点一个类别卡片放进去') : '也可以先点一张，再点类别卡片';
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

  function filesOf(key) {
    var list = [];
    for (var i = 0; i < COUNT; i++) list.push(fileOf(srcOf(key, i)));
    return Promise.all(list);
  }

  function toClass(classId, payload) {
    var p = payload.group ? filesOf(payload.group) : Promise.all([fileOf(payload.src)]);
    p.then(function (files) { window.AILab.addPhotos(classId, files); })
      .catch(function () { /* 读不出来就不动，页面会自己提示 */ });
  }

  function toTest(payload) {
    var p = payload.group ? fileOf(srcOf(payload.group, 0)) : fileOf(payload.src);
    p.then(function (file) { window.AILab.testFile(file); })
      .catch(function () { });
  }

  /* ---------- 拖拽 ---------- */
  panel.addEventListener('dragstart', function (e) {
    var item = e.target.closest ? e.target.closest('.pack-item') : null;
    if (item) {
      e.dataTransfer.setData('application/x-pack', item.getAttribute('data-src'));
      e.dataTransfer.setData('text/plain', item.getAttribute('data-src'));
      e.dataTransfer.effectAllowed = 'copy';
      return;
    }
    if (e.target === allBtn) {
      e.dataTransfer.setData('application/x-pack-all', active);
      e.dataTransfer.setData('text/plain', active);
      e.dataTransfer.effectAllowed = 'copy';
    }
  });

  function hasPack(dt) {
    var types = dt.types || [];
    for (var i = 0; i < types.length; i++) {
      if (String(types[i]).indexOf('application/x-pack') === 0) return true;
    }
    return false;
  }

  function payloadOf(dt) {
    var group = dt.getData('application/x-pack-all');
    if (group) return { group: group };
    var one = dt.getData('application/x-pack');
    return one ? { src: one } : null;
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
    var payload = payloadOf(e.dataTransfer);
    if (!payload) return;
    if (target.id === 'dropzone') {
      toTest(payload);
    } else {
      toClass(target.getAttribute('data-class'), payload);
    }
  });

  /* ---------- 点选（没有鼠标拖动时的备选） ---------- */
  grid.addEventListener('click', function (e) {
    var item = e.target.closest('.pack-item');
    if (!item) return;
    var src = item.getAttribute('data-src');
    picked = (picked && picked.src === src) ? null : { src: src, name: item.getAttribute('data-name') };
    refreshPicked();
  });

  classGrid.addEventListener('click', function (e) {
    if (!picked) return;
    if (e.target.closest('[data-act]')) return;
    var card = e.target.closest('.class-card');
    if (!card) return;
    toClass(card.getAttribute('data-class'), { src: picked.src });
  });

  dropzone.addEventListener('click', function (e) {
    if (!picked) return;
    e.preventDefault();
    e.stopPropagation();
    toTest({ src: picked.src });
  }, true);

  /* ---------- 开合 ---------- */
  toggle.addEventListener('click', function () { setOpen(panel.hidden); });
  closeBtn.addEventListener('click', function () { setOpen(false); });
  tabs.addEventListener('click', function (e) {
    var btn = e.target.closest('.pack-tab');
    if (!btn) return;
    active = btn.getAttribute('data-key');
    renderTabs();
    renderGrid();
  });

  renderTabs();
  renderGrid();
})();
