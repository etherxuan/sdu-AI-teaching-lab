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
    display: null,
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
    ctx.drawImage(st.display || st.img, st.ox, st.oy, w, h);

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

    if (fst.on) drawScanWindow();

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
      stopScan();
      fst.done = false;
      st.display = null;
      restoreBtn.disabled = true;
      scanBtn.disabled = false;
      scanBtn.textContent = '开始扫描';
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

  /* ---------- 边缘扫描：小窗口从左到右、从上到下扫一遍 ---------- */
  var work = document.createElement('canvas');
  var wctx = work.getContext('2d', { willReadFrequently: true });
  var kSizeSel = document.getElementById('kSize');
  var kPresetSel = document.getElementById('kPreset');
  var kernelBox = document.getElementById('kernel');
  var kNote = document.getElementById('kNote');
  var scanBtn = document.getElementById('scanBtn');
  var restoreBtn = document.getElementById('restoreBtn');

  var fst = {
    size: 3,
    preset: 'gx',
    on: false,
    done: false,
    x: 0,
    y: 0,
    per: 1,
    timer: 0,
    src: null,
    out: null,
    kx: null,
    ky: null
  };

  function smoothRow(n) {
    if (n === 5) return [1, 4, 6, 4, 1];
    if (n === 7) return [1, 6, 15, 20, 15, 6, 1];
    return [1, 2, 1];
  }

  function derivRow(n) {
    if (n === 5) return [-1, -2, 0, 2, 1];
    if (n === 7) return [-1, -2, -3, 0, 3, 2, 1];
    return [-1, 0, 1];
  }

  // 竖着的边：左右相减；横着的边：上下相减
  function presetKernel(kind, n) {
    var s = smoothRow(n), d = derivRow(n), m = [], i, j, row;
    for (i = 0; i < n; i++) {
      row = [];
      for (j = 0; j < n; j++) row.push(kind === 'gy' ? d[i] * s[j] : s[i] * d[j]);
      m.push(row);
    }
    return m;
  }

  function noteOf(preset, n) {
    if (preset === 'gx') return '左边乘负数、右边乘正数：颜色左右一变，算出来的数就大，竖着的边就亮。';
    if (preset === 'gy') return '上边乘负数、下边乘正数：颜色上下一变，算出来的数就大，横着的边就亮。';
    if (preset === 'mag') return '同时算竖边和横边，再把两个结果合起来：哪里有边，哪里就亮。';
    return '每格一个权重，' + (n * n) + '个数一起乘、一起加；想改哪格就改哪格。';
  }

  function drawKernelEditor(values) {
    var n = fst.size, html = '', i, j;
    kernelBox.style.gridTemplateColumns = 'repeat(' + n + ', 26px)';
    for (i = 0; i < n; i++) {
      for (j = 0; j < n; j++) {
        html += '<input type="number" min="-16" max="16" step="1" value="' + values[i][j] + '">';
      }
    }
    kernelBox.innerHTML = html;
  }

  function readKernel() {
    var n = fst.size;
    var inputs = kernelBox.querySelectorAll('input');
    var m = [], k = 0, i, j;
    for (i = 0; i < n; i++) {
      m.push([]);
      for (j = 0; j < n; j++) m[i].push(Number(inputs[k++].value) || 0);
    }
    return m;
  }

  function refreshKernel() {
    fst.size = Number(kSizeSel.value);
    fst.preset = kPresetSel.value;
    var n = fst.size;
    drawKernelEditor(presetKernel(fst.preset === 'gy' ? 'gy' : 'gx', n));
    kNote.textContent = noteOf(fst.preset, n);
  }

  function drawScanWindow() {
    var n = fst.size;
    var half = (n - 1) / 2;
    var x = Math.min(Math.max(fst.x, half), st.iw - 1 - half);
    var y = Math.min(Math.max(fst.y, half), st.ih - 1 - half);
    var s = Math.max(n * st.scale, 20);
    var sx = st.ox + (x + 0.5) * st.scale - s / 2;
    var sy = st.oy + (y + 0.5) * st.scale - s / 2;
    ctx.save();
    ctx.fillStyle = 'rgba(245,148,30,.25)';
    ctx.fillRect(sx, sy, s, s);
    ctx.strokeStyle = '#F5941E';
    ctx.lineWidth = 2;
    ctx.strokeRect(sx + 0.5, sy + 0.5, s, s);
    ctx.restore();
  }

  function convAt(sd, x, y, k) {
    var n = k.length, half = (n - 1) >> 1;
    var sr = 0, sg = 0, sb = 0, dy, dx, sy, sx, row, w, o;
    for (dy = 0; dy < n; dy++) {
      sy = y + dy - half;
      if (sy < 0) sy = 0; else if (sy >= st.ih) sy = st.ih - 1;
      row = k[dy];
      for (dx = 0; dx < n; dx++) {
        sx = x + dx - half;
        if (sx < 0) sx = 0; else if (sx >= st.iw) sx = st.iw - 1;
        w = row[dx];
        o = (sy * st.iw + sx) << 2;
        sr += sd[o] * w;
        sg += sd[o + 1] * w;
        sb += sd[o + 2] * w;
      }
    }
    return [sr, sg, sb];
  }

  function beginScan() {
    if (!st.img || fst.on) return;
    stopScan();
    setMag(false);
    fst.src = pctx.getImageData(0, 0, st.iw, st.ih);
    work.width = st.iw;
    work.height = st.ih;
    wctx.drawImage(st.img, 0, 0);
    fst.out = wctx.getImageData(0, 0, st.iw, st.ih);

    if (fst.preset === 'custom') {
      fst.kx = readKernel();
      fst.ky = null;
    } else if (fst.preset === 'gy') {
      fst.kx = presetKernel('gy', fst.size);
      fst.ky = null;
    } else if (fst.preset === 'gx') {
      fst.kx = presetKernel('gx', fst.size);
      fst.ky = null;
    } else {
      fst.kx = presetKernel('gx', fst.size);
      fst.ky = presetKernel('gy', fst.size);
    }

    st.display = work;
    fst.on = true;
    fst.done = false;
    fst.x = 0;
    fst.y = 0;
    fst.per = Math.max(1, Math.ceil(st.iw * st.ih / (2.2 * 60)));
    scanBtn.disabled = true;
    scanBtn.textContent = '扫描中…';
    restoreBtn.disabled = true;
    setTip('小窗口正在从左往右、从上往下扫过整张图…');
    fitView();
    fst.timer = setTimeout(stepScan, 16);
  }

  function stepScan() {
    var sd = fst.src.data, od = fst.out.data;
    var y0 = fst.y, left = fst.per, x, y, a, b, o, r, g, bl, c;
    while (left > 0 && fst.y < st.ih) {
      x = fst.x;
      y = fst.y;
      a = convAt(sd, x, y, fst.kx);
      r = Math.abs(a[0]);
      g = Math.abs(a[1]);
      bl = Math.abs(a[2]);
      if (fst.ky) {
        c = convAt(sd, x, y, fst.ky);
        r = Math.sqrt(r * r + c[0] * c[0]);
        g = Math.sqrt(g * g + c[1] * c[1]);
        bl = Math.sqrt(bl * bl + c[2] * c[2]);
      }
      o = (y * st.iw + x) << 2;
      od[o] = r;
      od[o + 1] = g;
      od[o + 2] = bl;
      od[o + 3] = 255;
      fst.x++;
      if (fst.x >= st.iw) {
        fst.x = 0;
        fst.y++;
      }
      left--;
    }

    var rows = Math.min(st.ih, fst.y + 1) - y0;
    if (rows > 0) wctx.putImageData(fst.out, 0, 0, 0, y0, st.iw, rows);

    if (fst.y >= st.ih) {
      finishScan();
    } else {
      render();
      fst.timer = setTimeout(stepScan, 16);
    }
  }

  function finishScan() {
    fst.on = false;
    fst.done = true;
    fst.timer = 0;
    scanBtn.disabled = false;
    scanBtn.textContent = '再扫一次';
    restoreBtn.disabled = false;
    setTip('扫描完成：亮起来的地方就是边。点“恢复原图”，可以回到原来的照片。');
    render();
  }

  function stopScan() {
    if (fst.timer) clearTimeout(fst.timer);
    fst.timer = 0;
    fst.on = false;
  }

  function restoreOriginal() {
    stopScan();
    fst.done = false;
    st.display = null;
    restoreBtn.disabled = true;
    scanBtn.disabled = false;
    scanBtn.textContent = '再扫一次';
    setTip('已恢复原图。');
    render();
  }

  scanBtn.addEventListener('click', beginScan);
  restoreBtn.addEventListener('click', restoreOriginal);
  kSizeSel.addEventListener('change', refreshKernel);
  kPresetSel.addEventListener('change', refreshKernel);

  /* ---------- 启动 ---------- */
  refreshKernel();
  measure();
  loadImage('assets/samples/leaf-ginkgo.jpg', '银杏叶');
})();
