import { openDB, IDBPDatabase } from 'idb';

const DB_NAME = 'video-notes';
const DB_VERSION = 1;

let dbPromise: Promise<IDBPDatabase> | null = null;

function getDb(): Promise<IDBPDatabase> {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains('screenshots')) db.createObjectStore('screenshots');
        if (!db.objectStoreNames.contains('meta')) db.createObjectStore('meta');
      }
    });
  }
  return dbPromise;
}

export async function putScreenshot(key: string, blob: Blob): Promise<void> {
  const db = await getDb();
  await db.put('screenshots', blob, key);
}

export async function getScreenshot(key: string): Promise<Blob | undefined> {
  const db = await getDb();
  return db.get('screenshots', key);
}

export async function deleteScreenshot(key: string): Promise<void> {
  const db = await getDb();
  await db.delete('screenshots', key);
}

export async function listScreenshotKeys(): Promise<string[]> {
  const db = await getDb();
  return (await db.getAllKeys('screenshots')) as string[];
}

export async function getVaultHandle(): Promise<FileSystemDirectoryHandle | undefined> {
  const db = await getDb();
  return db.get('meta', 'vaultHandle');
}

export async function setVaultHandle(handle: FileSystemDirectoryHandle): Promise<void> {
  const db = await getDb();
  await db.put('meta', handle, 'vaultHandle');
}

export async function clearVaultHandle(): Promise<void> {
  const db = await getDb();
  await db.delete('meta', 'vaultHandle');
}
