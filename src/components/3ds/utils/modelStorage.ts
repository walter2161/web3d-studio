// Tiny IndexedDB wrapper for persisting imported model files.
// Stores the original file bytes + filename keyed by object id so we can
// re-import automatically after a page refresh.

const DB_NAME = '3dsled';
const STORE = 'imported_models';
const DB_VERSION = 1;

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: 'id' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export interface StoredModel {
  id: string;
  filename: string;
  bytes: ArrayBuffer;
}

export async function saveModelBlob(id: string, filename: string, bytes: ArrayBuffer): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put({ id, filename, bytes });
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

export async function loadModelBlob(id: string): Promise<StoredModel | null> {
  const db = await openDb();
  const result = await new Promise<StoredModel | null>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly');
    const req = tx.objectStore(STORE).get(id);
    req.onsuccess = () => resolve((req.result as StoredModel) || null);
    req.onerror = () => reject(req.error);
  });
  db.close();
  return result;
}

export async function deleteModelBlob(id: string): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

export async function listModelBlobs(): Promise<StoredModel[]> {
  const db = await openDb();
  const results = await new Promise<StoredModel[]>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly');
    const req = tx.objectStore(STORE).getAll();
    req.onsuccess = () => resolve((req.result as StoredModel[]) || []);
    req.onerror = () => reject(req.error);
  });
  db.close();
  return results;
}
