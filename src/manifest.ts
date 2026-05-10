export default {
  manifest_version: 3,
  name: 'Video Notes',
  version: '0.1.0',
  description: 'Take time-stamped notes on YouTube videos and export as Markdown literature notes.',
  background: { service_worker: 'src/background/index.ts', type: 'module' },
  action: { default_icon: { 16: 'icon-16.png', 48: 'icon-48.png', 128: 'icon-128.png' } },
  options_page: 'src/options/index.html',
  content_scripts: [
    {
      matches: ['https://www.youtube.com/*'],
      js: ['src/content/index.ts'],
      run_at: 'document_idle'
    },
    {
      matches: ['https://www.youtube.com/*'],
      js: ['src/content/main-world-interceptor.ts'],
      run_at: 'document_start',
      world: 'MAIN'
    }
  ],
  permissions: ['activeTab', 'tabs', 'storage'],
  host_permissions: ['https://www.youtube.com/*'],
  commands: {
    'toggle-panel': {
      suggested_key: { default: 'Alt+N' },
      description: 'Toggle Video Notes panel'
    }
  },
  icons: { 16: 'icon-16.png', 48: 'icon-48.png', 128: 'icon-128.png' }
} satisfies chrome.runtime.ManifestV3;
