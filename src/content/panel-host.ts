// src/content/panel-host.ts
import { render, h } from 'preact';
import { Panel, type PanelDeps } from '../ui/Panel';
import { applyThemeClass, watchSystemTheme } from '../ui/theme';
import { getSettings } from '../shared/storage';
import panelCss from '../ui/panel.css?raw';
import { findVideoElement } from './yt-navigation';
import { captureAndCrop } from './screenshot-client';

const HOST_ID = 'video-notes-panel-host';

let stopThemeWatch: (() => void) | null = null;

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

  stopThemeWatch?.();
  stopThemeWatch = watchSystemTheme(async () => {
    const s = await getSettings();
    applyThemeClass(host!, s.theme);
  });

  const deps: PanelDeps = {
    videoId,
    getVideoMeta: () => ({
      title: document.querySelector('h1.ytd-watch-metadata yt-formatted-string')?.textContent?.trim() ?? document.title.replace(/ - YouTube$/, ''),
      channel: document.querySelector('ytd-channel-name #text a')?.textContent?.trim() ?? '',
      url: location.href
    }),
    getCurrentSec: () => findVideoElement()?.currentTime ?? 0,
    pauseVideo: () => { const v = findVideoElement(); if (v && !v.paused) v.pause(); },
    seekVideo: (sec) => { const v = findVideoElement(); if (v) v.currentTime = sec; },
    captureScreenshot: () => captureAndCrop(),
    onClose: () => unmountPanel()
  };

  render(h(Panel, deps), root);
}

export function unmountPanel(): void {
  stopThemeWatch?.();
  stopThemeWatch = null;
  document.getElementById(HOST_ID)?.remove();
}

export function isPanelMounted(): boolean { return !!document.getElementById(HOST_ID); }
