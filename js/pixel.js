/* 像素放大镜：把图片放大到能看见单个像素，并读出光标所在像素的 RGB */
(function () {
  'use strict';

  var stage = document.getElementById('stage');
  var canvas = document.getElementById('view');
  var ctx = canvas.getContext('2d');
  var zoomBadge = document.getElementById('zoomBadge');
  var magBtn = document.getElementById('magBtn');
  var readout = document.getElementById('readout');
  var swatch = document.getElementById('swatch');
  var rgbText = document.getElementById('rgbText');
  var hexText = document.getElementById('hexText');
  var posText = document.getElementById('posText');
  var tip = document.getElementById('tip');
  var emptyTip = document.getElementById('emptyTip');

  var MAX_SCALE = 64;
  var st = {
    img: null,
    iw: 0,
    ih: 0,
    scale: 1,
    fit: 1,
    ox: 0,
    oy: 0,
    cssW: 0,
    cssH: 0,
    dpr: Math.min(window.devicePixelRatio || 1, 2),
    mag: false,
    hover: null,
    drag: null,
    sample: null
  };

  /* ---------- 尺寸 ---------- */
  function measure() {
    var r = stage.getBoundingClientRect();
    st.cssW = Math.max(1, Math.round(r.width));
    st.cssH = Math.max(1, Math.round(r.height));
    canvas.width = Math.round(st.cssW * st.dpr);
    canvas.height = Math.round(st.cssH * st.dpr);
    canvas.style.width = st.cssW + 'px';
    canvas.style.height = st.cssH + 'px';
  }

  function computeFit() {
    if (!st.img) return 1;
    return Math.min(st.cssW / st.iw, st.cssH / st.ih) * 0.94;
  }

  function center() {
    st.ox = (st.cssW - st.iw * st.scale) / 2;
    st.oy = (st.cssH - st.ih * st.scale) / 2;
  }

  function clampOffset() {
    var w = st.iw * st.scale;
    var h = st.ih * st.scale;
    if (w <= st.cssW) {
      st.ox = (st.cssW - w) / 2;
    } else {
      st.ox = Math.min(0, Math.max(st.cssW - w, st.ox));
    }
    if (h <= st.cssH) {
      st.oy = (st.cssH - h) / 2;
    } else {
      st.oy = Math.min(0, Math.max(st.cssH - h, st.oy));
    }
  }

  /* ---------- 绘制 ---------- */
  function render() {
    ctx.setTransform(st.dpr, 0, 0, st.dpr, 0, 0);
    ctx.clearRect(0, 0, st.cssW, st.cssH);
    if (!st.img) return;

    var w = st.iw * st.scale;
    var h = st.ih * st.scale;

    ctx.imageSmoothingEnabled = st.scale < 3;
    ctx.drawImage(st.img, st.ox, st.oy, w, h);

    // 放大到一定程度后画出像素网格
    if (st.scale >= 4) {
      ctx.save();
      ctx.strokeStyle = 'rgba(20,108,98,.16)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      var x0 = Math.max(st.ox, 0);
      var y0 = Math.max(st.oy, 0);
      var x1 = Math.min(st.ox + w, st.cssW);
      var y1 = Math.min(st.oy + h, st.cssH);
      var i, x, y;
      var startI = Math.ceil((x0 - st.ox) / st.scale);
      for (i = startI; ; i++) {
        x = Math.round(st.ox + i * st.scale) + 0.5;
        if (x > x1) break;
        ctx.moveTo(x, y0);
        ctx.lineTo(x, y1);
      }
      var startJ = Math.ceil((y0 - st.oy) / st.scale);
      for (i = startJ; ; i++) {
        y = Math.round(st.oy + i * st.scale) + 0.5;
        if (y > y1) break;
        ctx.moveTo(x0, y);
        ctx.lineTo(x1, y);
      }
      ctx.stroke();
      ctx.restore();
    }

    if (st.mag && st.hover) drawHover();

    zoomBadge.textContent = '×' + (st.scale >= 10 ? Math.round(st.scale) : st.scale.toFixed(1));
  }

  function drawHover() {
    var hv = st.hover;
    var x = st.ox + hv.px * st.scale;
    var y = st.oy + hv.py * st.scale;

    // 准星
    ctx.save();
    ctx.strokeStyle = 'rgba(20,108,98,.55)';
    ctx.lineWidth = 1;
    ctx.setLineDash([6, 5]);
    ctx.beginPath();
    ctx.moveTo(0, Math.round(y + st.scale / 2) + 0.5);
    ctx.lineTo(st.cssW, Math.round(y + st.scale / 2) + 0.5);
    ctx.moveTo(Math.round(x + st.scale / 2) + 0.5, 0);
    ctx.lineTo(Math.round(x + st.scale / 2) + 0.5, st.cssH);
    ctx.stroke();
    ctx.setLineDash([]);

    // 当前像素的框
    ctx.lineWidth = 2;
    ctx.strokeStyle = '#F5941E';
    ctx.strokeRect(Math.round(x) - 1, Math.round(y) - 1, Math.ceil(st.scale) + 2, Math.ceil(st.scale) + 2);
    ctx.restore();
  }

  /* ---------- 像素取值 ---------- */
  var probe = document.createElement('canvas');
  var pctx = probe.getContext('2d', { willReadFrequently: true });

  function prepareProbe() {
    probe.width = st.iw;
    probe.height = st.ih;
    pctx.clearRect(0, 0, st.iw, st.ih);
    pctx.drawImage(st.img, 0, 0);
  }

  function pixelAt(clientX, clientY) {
    var r = canvas.getBoundingClientRect();
    var cx = clientX - r.left;
    var cy = clientY - r.top;
    var px = Math.floor((cx - st.ox) / st.scale);
    var py = Math.floor((cy - st.oy) / st.scale);
    if (px < 0 || py < 0 || px >= st.iw || py >= st.ih) return null;
    return { px: px, py: py, cx: cx, cy: cy };
  }

  function showReadout(hv) {
    var d = pctx.getImageData(hv.px, hv.py, 1, 1).data;
    var r = d[0], g = d[1], b = d[2];
    swatch.style.background = 'rgb(' + r + ',' + g + ',' + b + ')';
    rgbText.textContent = 'R ' + r + '   G ' + g + '   B ' + b;
    hexText.textContent = '#' + [r, g, b].map(function (v) {
      return ('0' + v.toString(16)).slice(-2).toUpperCase();
    }).join('');
    posText.textContent = '第 ' + (hv.px + 1) + ' 列，第 ' + (hv.py + 1) + ' 行';
    readout.hidden = false;
  }

  /* ---------- 缩放 ---------- */
  function zoomAt(factor, clientX, clientY) {
    if (!st.img) return;
    var r = canvas.getBoundingClientRect();
    var cx = (clientX == null ? st.cssW / 2 : clientX - r.left);
    var cy = (clientY == null ? st.cssH / 2 : clientY - r.top);
    var ix = (cx - st.ox) / st.scale;
    var iy = (cy - st.oy) / st.scale;

    var next = st.scale * factor;
    if (next > 4) next = Math.round(next);
    next = Math.max(st.fit * 0.9, Math.min(MAX_SCALE, next));
    if (next === st.scale) return;

    st.scale = next;
    st.ox = cx - ix * st.scale;
    st.oy = cy - iy * st.scale;
    clampOffset();
    if (st.hover) {
      var hv = pixelAt(st.hover.clientX, st.hover.clientY);
      st.hover = hv ? { px: hv.px, py: hv.py, clientX: st.hover.clientX, clientY: st.hover.clientY } : null;
      if (st.hover) showReadout(st.hover);
    }
    render();
  }

  function fitView() {
    if (!st.img) return;
    st.fit = computeFit();
    st.scale = st.fit;
    center();
    render();
  }

  function oneToOne() {
    if (!st.img) return;
    st.scale = 1;
    center();
    clampOffset();
    render();
  }

  /* ---------- 载入图片 ---------- */
  function loadImage(src, name) {
    emptyTip.hidden = false;
    emptyTip.textContent = '正在载入…';
    var img = new Image();
    img.onload = function () {
      st.img = img;
      st.iw = img.naturalWidth;
      st.ih = img.naturalHeight;
      st.hover = null;
      readout.hidden = true;
      prepareProbe();
      st.fit = computeFit();
      st.scale = st.fit;
      center();
      emptyTip.hidden = true;
      render();
      if (name) setTip('已打开：' + name + '。点右上角“放大镜”，再用滚轮或 ↑ ↓ 放大。');
    };
    img.onerror = function () {
      emptyTip.hidden = false;
      emptyTip.textContent = '这张图片打不开，换一张试试。';
    };
    img.src = src;
  }

  function setTip(text) {
    tip.textContent = text;
  }

  /* ---------- 交互 ---------- */
  function setMag(on) {
    st.mag = on;
    canvas.classList.toggle('is-mag', on);
    stage.classList.toggle('is-mag', on);
    magBtn.classList.toggle('is-on', on);
    magBtn.setAttribute('aria-pressed', on ? 'true' : 'false');
    if (!on) {
      st.hover = null;
      readout.hidden = true;
      setTip('点右上角“放大镜”，再用滚轮或 ↑ ↓ 放大');
      render();
    } else {
      setTip('滚轮或 ↑ ↓ 放大；按住鼠标拖动可以移动画面。');
    }
  }

  magBtn.addEventListener('click', function () {
    setMag(!st.mag);
  });

  canvas.addEventListener('pointermove', function (e) {
    if (st.drag) {
      st.ox += e.clientX - st.drag.x;
      st.oy += e.clientY - st.drag.y;
      st.drag.x = e.clientX;
      st.drag.y = e.clientY;
      clampOffset();
      render();
      return;
    }
    if (!st.mag || !st.img) return;
    var hv = pixelAt(e.clientX, e.clientY);
    st.hover = hv ? { px: hv.px, py: hv.py, clientX: e.clientX, clientY: e.clientY } : null;
    if (hv) showReadout(hv);
    readout.hidden = !hv;
    render();
  });

  canvas.addEventListener('pointerdown', function (e) {
    if (!st.img) return;
    st.drag = { x: e.clientX, y: e.clientY };
    canvas.setPointerCapture(e.pointerId);
    canvas.classList.add('is-drag');
  });

  canvas.addEventListener('pointerup', function (e) {
    st.drag = null;
    canvas.classList.remove('is-drag');
    try { canvas.releasePointerCapture(e.pointerId); } catch (err) {}
  });

  canvas.addEventListener('pointerleave', function () {
    if (!st.mag) return;
    st.hover = null;
    readout.hidden = true;
    render();
  });

  canvas.addEventListener('wheel', function (e) {
    if (!st.img) return;
    if (!st.mag) {
      setTip('先点右上角的“放大镜”，滚轮才有用。');
      return;
    }
    e.preventDefault();
    zoomAt(e.deltaY < 0 ? 1.2 : 1 / 1.2, e.clientX, e.clientY);
  }, { passive: false });

  window.addEventListener('keydown', function (e) {
    if (e.key === 'm' || e.key === 'M') {
      setMag(!st.mag);
      return;
    }
    if (e.key === 'Escape' && st.mag) {
      setMag(false);
      return;
    }
    if (!st.mag || !st.img) return;
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      zoomAt(1.25);
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      zoomAt(1 / 1.25);
    }
  });

  document.getElementById('zoomIn').addEventListener('click', function () { zoomAt(1.3); });
  document.getElementById('zoomOut').addEventListener('click', function () { zoomAt(1 / 1.3); });
  document.getElementById('fitBtn').addEventListener('click', fitView);
  document.getElementById('oneBtn').addEventListener('click', oneToOne);

  /* 例子图 */
  document.getElementById('samples').addEventListener('click', function (e) {
    var btn = e.target.closest('.px-sample');
    if (!btn) return;
    var all = this.querySelectorAll('.px-sample');
    for (var i = 0; i < all.length; i++) all[i].classList.remove('is-active');
    btn.classList.add('is-active');
    loadImage(btn.getAttribute('data-src'), btn.getAttribute('title'));
  });

  document.getElementById('uploadInput').addEventListener('change', function (e) {
    var f = e.target.files && e.target.files[0];
    if (!f) return;
    var all = document.querySelectorAll('.px-sample');
    for (var i = 0; i < all.length; i++) all[i].classList.remove('is-active');
    if (st.sample) URL.revokeObjectURL(st.sample);
    st.sample = URL.createObjectURL(f);
    loadImage(st.sample, f.name);
  });

  /* 拖拽图片进来 */
  ['dragover', 'drop'].forEach(function (type) {
    stage.addEventListener(type, function (e) {
      e.preventDefault();
      if (type !== 'drop') return;
      var f = e.dataTransfer.files && e.dataTransfer.files[0];
      if (!f || !f.type || f.type.indexOf('image/') !== 0) return;
      if (st.sample) URL.revokeObjectURL(st.sample);
      st.sample = URL.createObjectURL(f);
      loadImage(st.sample, f.name);
    });
  });

  window.addEventListener('resize', function () {
    var oldFit = st.fit;
    var wasFit = st.img && Math.abs(st.scale - oldFit) < 0.001;
    measure();
    if (!st.img) return;
    st.fit = computeFit();
    if (wasFit) {
      st.scale = st.fit;
      center();
    } else {
      clampOffset();
    }
    render();
  });

  /* ---------- 启动 ---------- */
  measure();
  loadImage('assets/samples/leaf-ginkgo.jpg', '银杏叶');
})();
