// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { getCapturedBaseUrl, _clearCacheForTests } from '../../src/content/transcript-cache';

describe('transcript-cache', () => {
  beforeEach(() => _clearCacheForTests());

  it('returns undefined when nothing captured', () => {
    expect(getCapturedBaseUrl('abc')).toBeUndefined();
  });

  it('caches base URL from postMessage', async () => {
    // jsdom's postMessage sets ev.source to a different object than window,
    // so we dispatch the MessageEvent directly with source set to window.
    window.dispatchEvent(
      new MessageEvent('message', {
        data: {
          type: 'video-notes:tt-base',
          videoId: 'abc',
          baseUrl: 'https://yt/api/timedtext?v=abc&pot=xxx'
        },
        source: window,
        origin: location.origin
      })
    );
    await new Promise(r => setTimeout(r, 10));
    expect(getCapturedBaseUrl('abc')).toBe('https://yt/api/timedtext?v=abc&pot=xxx');
  });

  it('ignores messages with wrong type', async () => {
    window.dispatchEvent(
      new MessageEvent('message', {
        data: { type: 'something-else', videoId: 'abc', baseUrl: 'x' },
        source: window,
        origin: location.origin
      })
    );
    await new Promise(r => setTimeout(r, 10));
    expect(getCapturedBaseUrl('abc')).toBeUndefined();
  });
});
