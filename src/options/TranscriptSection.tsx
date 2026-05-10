// src/options/TranscriptSection.tsx
import { useEffect, useState } from 'preact/hooks';
import { getSettings, setSettings } from '../shared/storage';
import { TRANSCRIPT_LANG_OPTIONS } from '../shared/lang-options';

const VALID = new Set(TRANSCRIPT_LANG_OPTIONS.map(o => o.code));

function normalizeLang(v: string): string {
  if (VALID.has(v)) return v;
  if (v === 'zh-TW' || v === 'zh-HK') return 'zh-Hant';
  if (v === 'zh-CN' || v === 'zh-SG' || v === 'zh') return 'zh-Hans';
  return 'en';
}

export function TranscriptSection() {
  const [before, setBefore] = useState(20);
  const [after, setAfter] = useState(20);
  const [lang, setLang] = useState('en');

  useEffect(() => {
    (async () => {
      const s = await getSettings();
      setBefore(s.transcriptBeforeSec);
      setAfter(s.transcriptAfterSec);
      const normalized = normalizeLang(s.transcriptPreferredLang);
      setLang(normalized);
      if (normalized !== s.transcriptPreferredLang) {
        await setSettings({ ...s, transcriptPreferredLang: normalized });
      }
    })();
  }, []);

  const save = async (patch: Partial<{ transcriptBeforeSec: number; transcriptAfterSec: number; transcriptPreferredLang: string }>) => {
    const s = await getSettings();
    await setSettings({ ...s, ...patch });
  };

  const clamp = (n: number, lo: number, hi: number) =>
    Number.isNaN(n) ? lo : Math.min(hi, Math.max(lo, n));

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
        偏好語言：
        <select value={lang} onChange={e => onLang((e.target as HTMLSelectElement).value)}>
          {TRANSCRIPT_LANG_OPTIONS.map(o => (
            <option key={o.code} value={o.code}>{o.label}</option>
          ))}
        </select>
      </label>
      <p style="color: var(--muted-fg); font-size: 12px;">
        匯出時在每條筆記下附上前後 N 秒的逐字稿。需先在影片中啟用 CC 字幕，擴充功能才能擷取逐字稿（player 帶 PoToken 的請求會被攔截重用）。
      </p>
    </section>
  );
}
