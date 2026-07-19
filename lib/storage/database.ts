const DATABASE_NAME = "trade-reviewer-pro";
const DATABASE_VERSION = 2;

export const PORTFOLIO_STORE = "portfolio";
export const MARKET_STORE = "market";

export function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (!("indexedDB" in globalThis)) {
      reject(new Error("Local browser storage is unavailable."));
      return;
    }
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(PORTFOLIO_STORE)) {
        request.result.createObjectStore(PORTFOLIO_STORE);
      }
      if (!request.result.objectStoreNames.contains(MARKET_STORE)) {
        request.result.createObjectStore(MARKET_STORE);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("Could not open local storage."));
  });
}

export async function readLocalValue<T>(storeName: string, key: IDBValidKey) {
  const database = await openDatabase();
  return new Promise<T | undefined>((resolve, reject) => {
    const transaction = database.transaction(storeName);
    const request = transaction.objectStore(storeName).get(key);
    request.onsuccess = () => resolve(request.result as T | undefined);
    request.onerror = () => reject(request.error);
    transaction.oncomplete = () => database.close();
  });
}

export async function writeLocalValue(
  storeName: string,
  key: IDBValidKey,
  value: unknown,
) {
  const database = await openDatabase();
  return new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(storeName, "readwrite");
    transaction.objectStore(storeName).put(value, key);
    transaction.oncomplete = () => {
      database.close();
      resolve();
    };
    transaction.onerror = () => reject(transaction.error);
  });
}

export async function deleteLocalValue(storeName: string, key: IDBValidKey) {
  const database = await openDatabase();
  return new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(storeName, "readwrite");
    transaction.objectStore(storeName).delete(key);
    transaction.oncomplete = () => {
      database.close();
      resolve();
    };
    transaction.onerror = () => reject(transaction.error);
  });
}

export function deleteLocalDatabase() {
  return new Promise<void>((resolve, reject) => {
    if (!("indexedDB" in globalThis)) {
      resolve();
      return;
    }
    const request = indexedDB.deleteDatabase(DATABASE_NAME);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error("Close other TradeReviewerPro tabs and try again."));
  });
}
