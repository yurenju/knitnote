export function sendTogglePanel(tabId: number): void {
  chrome.tabs.sendMessage(tabId, { type: 'toggle-panel' }).catch(() => {});
}
