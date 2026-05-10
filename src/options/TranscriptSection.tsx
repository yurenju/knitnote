// src/options/TranscriptSection.tsx
import { useEffect, useState } from 'preact/hooks';
import { getSettings, setSettings } from '../shared/storage';

export function TranscriptSection() {
  const [before, setBefore] = useState(20);
  const [after, setAfter] = useState(20);
  const [lang, setLang] = useState('en');

  useEffect(() => {
    getSettings().then(s => {
      setBefore(s.transcriptBeforeSec);
      setAfter(s.transcriptAfterSec);
      setLang(s.transcriptPreferredLang);
    });
  }, []);

  const save = async (patch: Partial<{ transcriptBeforeSec: number; transcriptAfterSec: number; transcriptPreferredLang: string }>) => {
    const s = await getSettings();
    await setSettings({ ...s, ...patch });
  };

  const onBefore = (v: string) => {
    const n = clamp(parseInt(v, 10), 1, 300);
    setBefore(n);
    void save({ transcriptBeforeSec: n });
  };
  const onAfter = (v: string) => {
    const n = clamp(parseInt(v, 10), 1, 300);
    setAfter(n);
    void save({ transcriptAfterSec: n });
  };
  const onLang = (v: string) => {
    setLang(v);
    void save({ transcriptPreferredLang: v });
  };

  return (
    <section style="margin-bottom: 24px;">
      <h3>逐字稿</h3>
      <label style="display:block; margin: 8px 0;">
        前文秒數：
        <input type="number" min={1} max={300} value={before}
          onInput={e => onBefore((e.target as HTMLInputElement).value)} />
      </label>
      <label style="display:block; margin: 8px 0;">
        後文秒數：
        <input type="number" min={1} max={300} value={after}
          onInput={e => onAfter((e.target as HTMLInputElement).value)} />
      </label>
      <label style="display:block; margin: 8px 0;">
        偏好語言（BCP-47，例如 zh-TW、en、ja）：
        <input type="text" value={lang}
          onInput={e => onLang((e.target as HTMLInputElement).value.trim())} />
      </label>
      <p style="color: var(--muted-fg); font-size: 12px;">
        匯出時，在每條筆記下附上前後 N 秒的逐字稿。語言用於沒有原生軌時觸發 YouTube 自動翻譯。
      </p>
    </section>
  );
}

function clamp(n: number, lo: number, hi: number): number {
  if (Number.isNaN(n)) return lo;
  return Math.min(hi, Math.max(lo, n));
}
