// Minimal IndexedDB wrapper used to persist the exported SQLite database
// bytes between sessions. No external dependency — just the native API.

const DB_NAME = 'spliteasy-storage';
const DB_VERSION = 1;
const STORE_NAME = 'sqlite';
const RECORD_KEY = 'main';

function openIdb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/** Save the database bytes + a monotonic revision number. */
export async function saveSnapshot(bytes, revision) {
  const db = await openIdb();
  await new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).put({ bytes, revision, savedAt: new Date().toISOString() }, RECORD_KEY);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

/** Load the most recently saved snapshot, or null if none exists. */
export async function loadSnapshot() {
  const db = await openIdb();
  const result = await new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const req = tx.objectStore(STORE_NAME).get(RECORD_KEY);
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = () => reject(req.error);
  });
  db.close();
  return result;
}

/** Permanently delete the stored database (used by "reset data"). */
export async function clearSnapshot() {
  const db = await openIdb();
  await new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).delete(RECORD_KEY);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}
