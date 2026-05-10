export async function captureActiveTab(): Promise<string> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.windowId) throw new Error('No active tab');
  return await chrome.tabs.captureVisibleTab(tab.windowId, { format: 'png' });
}
