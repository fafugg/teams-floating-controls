// tests/meeting-state.test.js
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
  const selectorsCode = fs.readFileSync('./lib/selectors.js', 'utf8');
  const meetingStateCode = fs.readFileSync('./lib/meeting-state.js', 'utf8');
  const fn = new Function(
    `${selectorsCode}\n${meetingStateCode}\nreturn { SEL, find, getMuteState, getHandState, isInMeeting, clickControl };`
  );
  return fn();
}

describe('getMuteState()', () => {
  it('returns unknown when no mute button exists', () => {
    setupDom('');
    const { getMuteState } = loadModules();
    assert.equal(getMuteState(), 'unknown');
  });

  it('returns muted when aria-label contains "unmute"', () => {
    setupDom(`<button aria-label="Unmute microphone">Mute</button>`);
    const { getMuteState } = loadModules();
    assert.equal(getMuteState(), 'muted');
  });

  it('returns unmuted when aria-label does not contain "unmute"', () => {
    setupDom(`<button aria-label="Mute microphone">Mute</button>`);
    const { getMuteState } = loadModules();
    assert.equal(getMuteState(), 'unmuted');
  });
});

describe('getHandState()', () => {
  it('returns unknown when no hand button exists', () => {
    setupDom('');
    const { getHandState } = loadModules();
    assert.equal(getHandState(), 'unknown');
  });

  it('returns raised when aria-label contains "lower"', () => {
    setupDom(`<button aria-label="Lower hand">Hand</button>`);
    const { getHandState } = loadModules();
    assert.equal(getHandState(), 'raised');
  });

  it('returns lowered when aria-label does not contain "lower"', () => {
    setupDom(`<button aria-label="Raise hand">Hand</button>`);
    const { getHandState } = loadModules();
    assert.equal(getHandState(), 'lowered');
  });
});

describe('isInMeeting()', () => {
  it('returns false when no meeting buttons exist', () => {
    setupDom('');
    const { isInMeeting } = loadModules();
    assert.equal(isInMeeting(), false);
  });

  it('returns true when mute button exists', () => {
    setupDom(`<button data-tid="toggle-mute">Mute</button>`);
    const { isInMeeting } = loadModules();
    assert.equal(isInMeeting(), true);
  });

  it('returns true when leave button exists', () => {
    setupDom(`<button data-tid="hangup-button">Leave</button>`);
    const { isInMeeting } = loadModules();
    assert.equal(isInMeeting(), true);
  });
});

describe('clickControl()', () => {
  it('clicks the button and returns true', () => {
    setupDom(`<button data-tid="toggle-mute">Mute</button>`);
    const { SEL, clickControl } = loadModules();
    let clicked = false;
    document.querySelector('[data-tid="toggle-mute"]').addEventListener('click', () => {
      clicked = true;
    });
    const result = clickControl(SEL.mute, 'mute');
    assert.equal(result, true);
    assert.equal(clicked, true);
  });

  it('returns false when button not found', () => {
    setupDom('');
    const { SEL, clickControl } = loadModules();
    const result = clickControl(SEL.mute, 'mute');
    assert.equal(result, false);
  });
});
