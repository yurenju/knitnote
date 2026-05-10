// src/ui/theme.ts
import type { Theme } from '../shared/types';

export type Resolved = 'light' | 'dark';

export function resolveTheme(t: Theme): Resolved {
  if (t === 'system') {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  return t;
}

export function applyThemeClass(host: Element, t: Theme): void {
  const r = resolveTheme(t);
  host.classList.toggle('theme-dark', r === 'dark');
  host.classList.toggle('theme-light', r === 'light');
}

export function watchSystemTheme(cb: () => void): () => void {
  const mq = window.matchMedia('(prefers-color-scheme: dark)');
  mq.addEventListener('change', cb);
  return () => mq.removeEventListener('change', cb);
}
