// src/options/VaultSection.tsx
import { useEffect, useState } from 'preact/hooks';
import { getVaultHandle } from '../shared/idb';
import { pickVault } from './export/ensureVault';
import { setSettings, getSettings } from '../shared/storage';

export function VaultSection() {
  const [name, setName] = useState<string | null>(null);

  useEffect(() => { (async () => {
    const h = await getVaultHandle();
    setName(h?.name ?? null);
  })(); }, []);

  const onChange = async () => {
    try {
      const h = await pickVault();
      setName(h.name);
      const s = await getSettings();
      await setSettings({ ...s, hasVaultConfigured: true });
    } catch (e) {
      console.error(e);
    }
  };

  return (
    <section style="margin-bottom: 24px;">
      <h3>Vault 資料夾</h3>
      <div class="vn-note" style="display:flex; justify-content:space-between; align-items:center;">
        <span>📁 {name ?? '尚未設定'}</span>
        <button class="vn-btn-secondary" onClick={onChange}>{name ? '變更' : '選擇'}</button>
      </div>
    </section>
  );
}
