'use strict';
// 저장소: config.js에 Firebase 설정이 있으면 Firestore(실시간 공유), 없으면 이 기기의 IndexedDB.
// 구조: trips/{tripId} (여행 정보), trips/{tripId}/{places|expenses|photos|photofull}/{id}
const Store = (() => {
  const fb = (window.APP_CONFIG || {}).firebase || {};
  const cloud = !!fb.projectId;
  const clean = o => JSON.parse(JSON.stringify(o));
  let db;

  // ---------- 기기 저장 (IndexedDB) ----------
  const L = {
    idb: null, docs: new Map(), subs: new Set(),
    open() {
      return new Promise((res, rej) => {
        const r = indexedDB.open('tripnote', 1);
        r.onupgradeneeded = () => { r.result.createObjectStore('docs'); r.result.createObjectStore('blobs'); };
        r.onerror = () => rej(r.error);
        r.onsuccess = () => {
          this.idb = r.result;
          const os = this.idb.transaction('docs').objectStore('docs');
          const kr = os.getAllKeys(), vr = os.getAll();
          vr.onsuccess = () => { kr.result.forEach((k, i) => this.docs.set(k, vr.result[i])); res(); };
        };
      });
    },
    os(col, mode) { const n = col === 'photofull' ? 'blobs' : 'docs'; return this.idb.transaction(n, mode).objectStore(n); },
    req(r) { return new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); }); },
    list(tripId, col) {
      const pre = `${tripId}/${col}/`, out = [];
      for (const [k, v] of this.docs) if (k.startsWith(pre)) out.push({ id: k.slice(pre.length), ...v });
      return out;
    },
    notify(tripId, col) { for (const s of this.subs) if (s.tripId === tripId && s.col === col) s.fire(); },
    async put(tripId, col, id, data) {
      const key = `${tripId}/${col}/${id}`;
      if (col === 'photofull') return this.req(this.os(col, 'readwrite').put(clean(data), key));
      const v = { ...(this.docs.get(key) || {}), ...clean(data) };
      this.docs.set(key, v);
      await this.req(this.os(col, 'readwrite').put(v, key));
      this.notify(tripId, col);
    },
    async get(tripId, col, id) {
      const key = `${tripId}/${col}/${id}`;
      if (col === 'photofull') return this.req(this.os(col).get(key));
      return this.docs.get(key);
    },
    async remove(tripId, col, id) {
      const key = `${tripId}/${col}/${id}`;
      this.docs.delete(key);
      await this.req(this.os(col, 'readwrite').delete(key));
      this.notify(tripId, col);
    },
    watch(tripId, col, cb, single) {
      const s = { tripId, col, fire: () => cb(single ? (this.docs.has(`${tripId}/_trip/_`) ? { id: tripId, ...this.docs.get(`${tripId}/_trip/_`) } : null) : this.list(tripId, col)) };
      this.subs.add(s); setTimeout(s.fire);
      return () => this.subs.delete(s);
    },
  };

  const onErr = e => { console.error(e); toast('동기화 오류: ' + (e.code || e.message)); };
  const col = (tripId, c) => db.collection('trips').doc(tripId).collection(c);

  return {
    cloud,
    async init() {
      if (!cloud) return L.open();
      const v = '10.12.2';
      await loadScript(`https://www.gstatic.com/firebasejs/${v}/firebase-app-compat.js`);
      await loadScript(`https://www.gstatic.com/firebasejs/${v}/firebase-firestore-compat.js`);
      firebase.initializeApp(fb);
      db = firebase.firestore();
      try { await db.enablePersistence({ synchronizeTabs: true }); } catch (e) { console.warn('offline cache off', e.code); }
    },
    async createTrip(data) {
      const id = uid();
      await this.updateTrip(id, { ...data, createdAt: Date.now() });
      return id;
    },
    updateTrip(id, patch) {
      return cloud ? db.collection('trips').doc(id).set(clean(patch), { merge: true }) : L.put(id, '_trip', '_', patch);
    },
    watchTrip(id, cb) {
      return cloud ? db.collection('trips').doc(id).onSnapshot(s => cb(s.exists ? { id, ...s.data() } : null), onErr) : L.watch(id, '_trip', cb, true);
    },
    watch(tripId, c, cb) {
      return cloud ? col(tripId, c).onSnapshot(s => cb(s.docs.map(d => ({ id: d.id, ...d.data() }))), onErr) : L.watch(tripId, c, cb);
    },
    async put(tripId, c, id, data) {
      id = id || uid();
      await (cloud ? col(tripId, c).doc(id).set(clean(data), { merge: true }) : L.put(tripId, c, id, data));
      return id;
    },
    async get(tripId, c, id) {
      if (!cloud) return L.get(tripId, c, id);
      const s = await col(tripId, c).doc(id).get();
      return s.exists ? s.data() : null;
    },
    remove(tripId, c, id) { return cloud ? col(tripId, c).doc(id).delete() : L.remove(tripId, c, id); },
  };
})();
