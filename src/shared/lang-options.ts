export interface LangOption {
  code: string;
  label: string;
}

export const TRANSCRIPT_LANG_OPTIONS: LangOption[] = [
  { code: 'en',      label: 'English' },
  { code: 'zh-Hant', label: '繁體中文' },
  { code: 'zh-Hans', label: '简体中文' },
  { code: 'ja',      label: '日本語' }
];
