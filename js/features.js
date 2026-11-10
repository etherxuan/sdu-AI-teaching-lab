/* 把照片变成模型能读的数字：居中裁成方形、缩到 32×32、每个通道归一化到 0—1 */
(function (global) {
  'use strict';

  const SIZE = 32;
  const WORK = 256;
  const THUMB = 160;

  async function decode(blob) {
    if (global.createImageBitmap) {
      try {
        return await createImageBitmap(blob, { imageOrientation: 'from-image' });
      } catch (e) {
        try {
          return await createImageBitmap(blob);
        } catch (e2) { /* 继续用 Image 兜底 */ }
      }
    }
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(blob);
      const img = new Image();
      img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('这张图片读不出来，换一张试试。')); };
      img.src = url;
    });
  }

  function makeCanvas(size) {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = size;
    return canvas;
  }

  async function extract(blob, options) {
    const opts = options || {};
    const source = await decode(blob);
    const width = source.width || source.naturalWidth;
    const height = source.height || source.naturalHeight;
    if (!width || !height) throw new Error('这张图片没有有效的画面。');

    const side = Math.min(width, height);
    const sx = (width - side) / 2;
    const sy = (height - side) / 2;

    const work = makeCanvas(WORK);
    work.getContext('2d').drawImage(source, sx, sy, side, side, 0, 0, WORK, WORK);

    const small = makeCanvas(SIZE);
    const smallCtx = small.getContext('2d', { willReadFrequently: true });
    smallCtx.drawImage(work, 0, 0, SIZE, SIZE);
    const data = smallCtx.getImageData(0, 0, SIZE, SIZE).data;

    const features = new Float32Array(SIZE * SIZE * 3);
    for (let i = 0, j = 0; i < data.length; i += 4) {
      features[j++] = data[i] / 255;
      features[j++] = data[i + 1] / 255;
      features[j++] = data[i + 2] / 255;
    }

    let thumb = null;
    if (opts.thumb !== false) {
      const tc = makeCanvas(THUMB);
      tc.getContext('2d').drawImage(work, 0, 0, THUMB, THUMB);
      thumb = tc.toDataURL('image/jpeg', 0.8);
    }

    if (source.close) source.close();
    return { features, thumb, width, height };
  }

  global.Features = { extract, SIZE };
})(window);
