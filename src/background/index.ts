import type { Message, CaptureTabResponse } from './messages';
import { captureActiveTab } from './screenshot';
import { sendTogglePanel } from './commands';

chrome.runtime.onMessage.addListener((msg: Message, _sender, sendResponse) => {
  if (msg.type === 'capture-tab') {
    captureActiveTab()
      .then(dataUrl => sendResponse({ dataUrl } satisfies CaptureTabResponse))
      .catch(err => sendResponse({ error: String(err) }));
    return true; // keep port open for async response
  }
  return false;
});

chrome.action.onClicked.addListener((tab) => {
  if (tab.id) sendTogglePanel(tab.id);
});

chrome.commands.onCommand.addListener((command) => {
  if (command === 'toggle-panel') {
    chrome.tabs.query({ active: true, currentWindow: true }).then(([tab]) => {
      if (tab?.id) sendTogglePanel(tab.id);
    });
  }
});
