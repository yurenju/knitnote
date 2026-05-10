import type { Message, CaptureTabResponse } from './messages';
import { captureActiveTab } from './screenshot';
import { sendTogglePanel } from './commands';
import { refreshBadgeForTab } from './badge';
import { isIdbMessage, handleIdbMessage } from './idb-bridge';

chrome.runtime.onMessage.addListener((msg: Message, _sender, sendResponse) => {
  if (msg.type === 'capture-tab') {
    captureActiveTab()
      .then(dataUrl => sendResponse({ dataUrl } satisfies CaptureTabResponse))
      .catch(err => sendResponse({ error: String(err) }));
    return true; // keep port open for async response
  }
  if (isIdbMessage(msg)) {
    return handleIdbMessage(msg, sendResponse);
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

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.url || changeInfo.status === 'complete') refreshBadgeForTab(tabId, tab.url);
});
chrome.tabs.onActivated.addListener(async ({ tabId }) => {
  const tab = await chrome.tabs.get(tabId);
  refreshBadgeForTab(tabId, tab.url);
});
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local' || !changes.videos) return;
  chrome.tabs.query({}).then(tabs => {
    tabs.forEach(t => { if (t.id) refreshBadgeForTab(t.id, t.url); });
  });
});
