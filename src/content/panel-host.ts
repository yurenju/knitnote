// src/content/panel-host.ts
import { render, h } from 'preact';
import { Panel } from '../ui/Panel';
import { applyThemeClass } from '../ui/theme';
import { getSettings } from '../shared/storage';
import panelCss from '../ui/panel.css?raw';

const HOST_ID = 'video-notes-panel-host';

export async function mountPanel(videoId: string): Promise<void> {
  const target = document.querySelector('#secondary') ?? document.body;
  let host = document.getElementById(HOST_ID);
  if (!host) {
    host = document.createElement('div');
    host.id = HOST_ID;
    host.style.cssText = 'all: initial; display: block;';
    target.prepend(host);
  }
  const shadow = host.shadowRoot ?? host.attachShadow({ mode: 'open' });
  shadow.innerHTML = '';

  const styleEl = document.createElement('style');
  styleEl.textContent = panelCss;
  shadow.appendChild(styleEl);

  const root = document.createElement('div');
  shadow.appendChild(root);

  const settings = await getSettings();
  applyThemeClass(host, settings.theme);

  const onClose = () => unmountPanel();
  render(h(Panel, { videoId, onClose }), root);
}

export function unmountPanel(): void {
  document.getElementById(HOST_ID)?.remove();
}

export function isPanelMounted(): boolean {
  return !!document.getElementById(HOST_ID);
}
