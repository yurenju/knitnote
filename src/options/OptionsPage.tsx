// src/options/OptionsPage.tsx
import { useEffect } from 'preact/hooks';
import { getSettings } from '../shared/storage';
import { applyThemeClass, watchSystemTheme } from '../ui/theme';
import { VaultSection } from './VaultSection';
import { ThemeSection } from './ThemeSection';
import { TranscriptSection } from './TranscriptSection';
import { VideoList } from './VideoList';
import type { Theme } from '../shared/types';

export function OptionsPage() {
  useEffect(() => {
    (async () => {
      const s = await getSettings();
      applyThemeClass(document.body, s.theme);
    })();
    const stop = watchSystemTheme(async () => {
      const s = await getSettings();
      applyThemeClass(document.body, s.theme);
    });
    return stop;
  }, []);

  return (
    <div class="options-root" style="max-width: 720px; margin: 32px auto; padding: 0 16px;">
      <h1>Video Notes — 設定</h1>
      <VaultSection />
      <ThemeSection onChange={(t: Theme) => applyThemeClass(document.body, t)} />
      <TranscriptSection />
      <VideoList />
    </div>
  );
}
