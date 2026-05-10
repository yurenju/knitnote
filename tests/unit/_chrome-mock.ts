type Listener = (changes: Record<string, chrome.storage.StorageChange>, area: string) => void;

export function installChromeMock(): { reset: () => void } {
  const data: Record<string, unknown> = {};
  const listeners: Listener[] = [];
  (globalThis as any).chrome = {
    storage: {
      local: {
        get: (keys: string | string[] | null) => {
          if (keys === null || keys === undefined) return Promise.resolve({ ...data });
          const arr = Array.isArray(keys) ? keys : [keys];
          const out: Record<string, unknown> = {};
          arr.forEach(k => { if (k in data) out[k] = data[k]; });
          return Promise.resolve(out);
        },
        set: (items: Record<string, unknown>) => {
          const changes: Record<string, chrome.storage.StorageChange> = {};
          Object.entries(items).forEach(([k, v]) => {
            changes[k] = { oldValue: data[k], newValue: v };
            data[k] = v;
          });
          listeners.forEach(l => l(changes, 'local'));
          return Promise.resolve();
        },
        remove: (keys: string | string[]) => {
          const arr = Array.isArray(keys) ? keys : [keys];
          const changes: Record<string, chrome.storage.StorageChange> = {};
          arr.forEach(k => { if (k in data) { changes[k] = { oldValue: data[k], newValue: undefined }; delete data[k]; } });
          listeners.forEach(l => l(changes, 'local'));
          return Promise.resolve();
        }
      },
      onChanged: { addListener: (l: Listener) => listeners.push(l), removeListener: () => {} }
    }
  };
  return { reset: () => { for (const k of Object.keys(data)) delete data[k]; listeners.length = 0; } };
}
