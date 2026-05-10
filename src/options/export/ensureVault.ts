import { getVaultHandle, setVaultHandle } from '../../shared/idb';

export async function pickVault(): Promise<FileSystemDirectoryHandle> {
  const handle = await (window as any).showDirectoryPicker({ mode: 'readwrite' });
  await setVaultHandle(handle);
  return handle;
}

export async function ensureVault(): Promise<FileSystemDirectoryHandle> {
  let h = await getVaultHandle();
  if (!h) h = await pickVault();
  const perm = await (h as any).queryPermission({ mode: 'readwrite' });
  if (perm !== 'granted') {
    const r = await (h as any).requestPermission({ mode: 'readwrite' });
    if (r !== 'granted') throw new Error('Vault permission denied');
  }
  return h;
}
