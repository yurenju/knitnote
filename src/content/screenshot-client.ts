// src/content/screenshot-client.ts
import { findVideoElement } from './yt-navigation';

export async function captureAndCrop(): Promise<Blob> {
  const video = findVideoElement();
  if (!video) throw new Error('Video element not found');
  video.scrollIntoView({ block: 'center' });
  await new Promise(r => setTimeout(r, 100));

  const resp = await chrome.runtime.sendMessage({ type: 'capture-tab' });
  if (!resp || !resp.dataUrl) throw new Error('Screenshot failed: ' + (resp?.error ?? 'unknown'));

  const img = await loadImage(resp.dataUrl);
  const rect = video.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  const sx = rect.left * dpr, sy = rect.top * dpr;
  const sw = rect.width * dpr, sh = rect.height * dpr;

  const canvas = document.createElement('canvas');
  canvas.width = sw; canvas.height = sh;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas context unavailable');
  ctx.drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh);

  return await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(b => b ? resolve(b) : reject(new Error('toBlob returned null')), 'image/png');
  });
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Image load failed'));
    img.src = src;
  });
}
