// tests/stream-detection.test.js
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { JSDOM } = require('jsdom');
const fs = require('fs');

function setupDom(html) {
  const dom = new JSDOM(`<!DOCTYPE html><html><body>${html}</body></html>`);
  global.document = dom.window.document;
  global.window = dom.window;
  return dom;
}

function loadModules() {
  const code = fs.readFileSync('./lib/stream-detection.js', 'utf8');
  const fn = new Function(
    `${code}\nreturn { hasSpeakingIndicator, analyzeVideoAncestors, detectStreams, getMeetingTitle };`
  );
  return fn();
}

describe('hasSpeakingIndicator()', () => {
  it('detects speaking via aria-label', () => {
    setupDom('<div aria-label="John speaking"></div>');
    const { hasSpeakingIndicator } = loadModules();
    const el = document.querySelector('div');
    assert.equal(hasSpeakingIndicator(el), true);
  });

  it('detects speaking via class name', () => {
    setupDom('<div class="active-speaker"></div>');
    const { hasSpeakingIndicator } = loadModules();
    const el = document.querySelector('div');
    assert.equal(hasSpeakingIndicator(el), true);
  });

  it('returns false for plain element with no indicators', () => {
    setupDom('<div class="normal-element"></div>');
    const { hasSpeakingIndicator } = loadModules();
    const el = document.querySelector('div');
    assert.equal(hasSpeakingIndicator(el), false);
  });
});

describe('analyzeVideoAncestors()', () => {
  // Note: analyzeVideoAncestors lowercases all labels, so results are lowercase

  it('extracts name from ancestor aria-label', () => {
    setupDom(`
      <div aria-label="John Doe">
        <div><video></video></div>
      </div>
    `);
    const { analyzeVideoAncestors } = loadModules();
    const video = document.querySelector('video');
    const result = analyzeVideoAncestors(video);
    assert.equal(result.name, 'john doe');
    assert.equal(result.isContent, false);
  });

  it('sets isContent=true for screen-share container', () => {
    setupDom(`
      <div data-tid="screen-share-container">
        <div><video></video></div>
      </div>
    `);
    const { analyzeVideoAncestors } = loadModules();
    const video = document.querySelector('video');
    const result = analyzeVideoAncestors(video);
    assert.equal(result.isContent, true);
  });

  it('strips speaking suffix from name', () => {
    setupDom(`
      <div aria-label="John Doe - speaking">
        <div><video></video></div>
      </div>
    `);
    const { analyzeVideoAncestors } = loadModules();
    const video = document.querySelector('video');
    const result = analyzeVideoAncestors(video);
    assert.equal(result.name, 'john doe');
  });

  it('returns null name for screen-share containers', () => {
    setupDom(`
      <div aria-label="Screen sharing content">
        <div><video></video></div>
      </div>
    `);
    const { analyzeVideoAncestors } = loadModules();
    const video = document.querySelector('video');
    const result = analyzeVideoAncestors(video);
    assert.equal(result.name, null);
    assert.equal(result.isContent, true);
  });
});

describe('detectStreams()', () => {
  it('returns empty when no video elements exist', () => {
    setupDom('<div>No videos here</div>');
    const { detectStreams } = loadModules();
    const result = detectStreams();
    assert.equal(result.participantCount, 0);
    assert.equal(result.screenShare, null);
    assert.equal(result.dominant, null);
    assert.deepEqual(result.participants, []);
  });
});

describe('getMeetingTitle()', () => {
  it('returns null when no matching element exists', () => {
    setupDom('<div>Just a page</div>');
    const { getMeetingTitle } = loadModules();
    assert.equal(getMeetingTitle(), null);
  });

  it('returns title from data-tid="meeting-topic"', () => {
    setupDom('<div data-tid="meeting-topic">Weekly Standup</div>');
    const { getMeetingTitle } = loadModules();
    assert.equal(getMeetingTitle(), 'Weekly Standup');
  });
});
