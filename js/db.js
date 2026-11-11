/* 本机数据库：类别与照片都存在浏览器 IndexedDB 里，不上传服务器 */
(function (global) {
  'use strict';

  const DB_NAME = 'ai-eye-lab';
  const DB_VERSION = 1;
  let dbPromise = null;

  function open() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve, reject) => {
      if (!global.indexedDB) {
        reject(new Error('这个浏览器不支持本地数据库，请换用 Chrome 或 Edge。'));
        return;
      }
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains('classes')) {
          db.createObjectStore('classes', { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains('images')) {
          const store = db.createObjectStore('images', { keyPath: 'id', autoIncrement: true });
          store.createIndex('classId', 'classId', { unique: false });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
      req.onblocked = () => reject(new Error('数据库被另一个标签页占用，请关闭其他页面后重试。'));
    });
    return dbPromise;
  }

  function done(transaction) {
    return new Promise((resolve, reject) => {
      transaction.oncomplete = () => resolve();
      transaction.onabort = () => reject(transaction.error || new Error('数据库操作被中止'));
      transaction.onerror = () => reject(transaction.error);
    });
  }

  function request(req) {
    return new Promise((resolve, reject) => {
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  async function listClasses() {
    const db = await open();
    const tx = db.transaction('classes', 'readonly');
    const all = await request(tx.objectStore('classes').getAll());
    return all.sort((a, b) => (a.order || 0) - (b.order || 0) || a.createdAt - b.createdAt);
  }

  async function addClass(name, color, order) {
    const db = await open();
    const tx = db.transaction('classes', 'readwrite');
    const record = {
      id: (global.crypto && crypto.randomUUID) ? crypto.randomUUID() : String(Date.now()) + Math.random().toString(16).slice(2),
      name,
      color,
      order,
      createdAt: Date.now()
    };
    tx.objectStore('classes').put(record);
    await done(tx);
    return record;
  }

  async function renameClass(id, name) {
    const db = await open();
    const tx = db.transaction('classes', 'readwrite');
    const store = tx.objectStore('classes');
    const record = await request(store.get(id));
    if (record) {
      record.name = name;
      store.put(record);
    }
    await done(tx);
  }

  async function deleteClass(id) {
    const db = await open();
    const tx = db.transaction(['classes', 'images'], 'readwrite');
    tx.objectStore('classes').delete(id);
    const index = tx.objectStore('images').index('classId');
    const cursorReq = index.openCursor(IDBKeyRange.only(id));
    cursorReq.onsuccess = () => {
      const cursor = cursorReq.result;
      if (cursor) {
        cursor.delete();
        cursor.continue();
      }
    };
    await done(tx);
  }

  async function addImage(record) {
    const db = await open();
    const tx = db.transaction('images', 'readwrite');
    const id = await request(tx.objectStore('images').add({
      classId: record.classId,
      name: record.name || '',
      thumb: record.thumb,
      features: record.features,
      createdAt: Date.now()
    }));
    await done(tx);
    return id;
  }

  async function deleteImage(id) {
    const db = await open();
    const tx = db.transaction('images', 'readwrite');
    tx.objectStore('images').delete(id);
    await done(tx);
  }

  async function listImages(classId) {
    const db = await open();
    const tx = db.transaction('images', 'readonly');
    return request(tx.objectStore('images').index('classId').getAll(IDBKeyRange.only(classId)));
  }

  async function listAllImages() {
    const db = await open();
    const tx = db.transaction('images', 'readonly');
    return request(tx.objectStore('images').getAll());
  }

  async function clearAll() {
    const db = await open();
    const tx = db.transaction(['classes', 'images'], 'readwrite');
    tx.objectStore('classes').clear();
    tx.objectStore('images').clear();
    await done(tx);
  }

  global.DB = {
    open, listClasses, addClass, renameClass, deleteClass,
    addImage, deleteImage, listImages, listAllImages, clearAll
  };
})(window);
