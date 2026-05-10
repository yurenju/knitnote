// src/options/ThemeSection.tsx
import { useEffect, useState } from 'preact/hooks';
import { getSettings, setSettings } from '../shared/storage';
import type { Theme } from '../shared/types';

export function ThemeSection({ onChange }: { onChange: (t: Theme) => void }) {
  const [theme, setTheme] = useState<Theme>('system');

  useEffect(() => { getSettings().then(s => setTheme(s.theme)); }, []);

  const update = async (t: Theme) => {
    setTheme(t);
    const s = await getSettings();
    await setSettings({ ...s, theme: t });
    onChange(t);
  };

  return (
    <section style="margin-bottom: 24px;">
      <h3>主題</h3>
      <select value={theme} onChange={(e) => update((e.target as HTMLSelectElement).value as Theme)}>
        <option value="system">跟隨系統</option>
        <option value="light">淺色</option>
        <option value="dark">深色</option>
      </select>
    </section>
  );
}
