import type { Message, CaptureTabResponse } from './messages';
import { captureActiveTab } from './screenshot';

chrome.runtime.onMessage.addListener((msg: Message, _sender, sendResponse) => {
  if (msg.type === 'capture-tab') {
    captureActiveTab()
      .then(dataUrl => sendResponse({ dataUrl } satisfies CaptureTabResponse))
      .catch(err => sendResponse({ error: String(err) }));
    return true; // keep port open for async response
  }
  return false;
});
