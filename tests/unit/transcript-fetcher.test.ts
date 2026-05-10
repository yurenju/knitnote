import { describe, it, expect } from 'vitest';
import { pickTrackUrl, extractTracklistFromHtml } from '../../src/content/transcript-fetcher';

const tracklist = {
  captionTracks: [
    { baseUrl: 'https://yt/api/timedtext?v=x&lang=en', languageCode: 'en' },
    { baseUrl: 'https://yt/api/timedtext?v=x&lang=ja', languageCode: 'ja' }
  ],
  translationLanguages: [
    { languageCode: 'zh-TW' },
    { languageCode: 'fr' }
  ]
};

describe('pickTrackUrl', () => {
  it('uses native track when languageCode matches preferred', () => {
    const r = pickTrackUrl(tracklist, 'ja');
    expect(r).toEqual({
      url: 'https://yt/api/timedtext?v=x&lang=ja&fmt=json3',
      languageCode: 'ja',
      translationLanguage: null
    });
  });

  it('falls back to captionTracks[0] + tlang when preferred is in translationLanguages', () => {
    const r = pickTrackUrl(tracklist, 'zh-TW');
    expect(r).toEqual({
      url: 'https://yt/api/timedtext?v=x&lang=en&tlang=zh-TW&fmt=json3',
      languageCode: 'en',
      translationLanguage: 'zh-TW'
    });
  });

  it('returns null when preferred lang is neither native nor translatable', () => {
    expect(pickTrackUrl(tracklist, 'xx')).toBeNull();
  });

  it('returns null when there are no caption tracks', () => {
    expect(pickTrackUrl({ captionTracks: [], translationLanguages: [] }, 'en')).toBeNull();
    expect(pickTrackUrl(null, 'en')).toBeNull();
  });
});

describe('extractTracklistFromHtml', () => {
  it('parses ytInitialPlayerResponse and pulls captions tracklist', () => {
    const html = `
      <script>var ytInitialPlayerResponse = {"captions":{"playerCaptionsTracklistRenderer":{"captionTracks":[{"baseUrl":"https://x/","languageCode":"en"}],"translationLanguages":[{"languageCode":"zh-TW"}]}}};var meta = 1;</script>
    `;
    const r = extractTracklistFromHtml(html);
    expect(r?.captionTracks[0].languageCode).toBe('en');
    expect(r?.translationLanguages[0].languageCode).toBe('zh-TW');
  });

  it('returns null when no ytInitialPlayerResponse in html', () => {
    expect(extractTracklistFromHtml('<html></html>')).toBeNull();
  });

  it('returns null when player response has no captions block', () => {
    const html = `<script>var ytInitialPlayerResponse = {};var x = 1;</script>`;
    expect(extractTracklistFromHtml(html)).toBeNull();
  });
});
