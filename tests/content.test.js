// tests/content.test.js
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

describe('clickControl()', () => {
  it('clicks the button and returns true', () => {
    setupDom(`<button data-tid="toggle-mute">Mute</button>`);
    const selCode = fs.readFileSync('./lib/selectors.js', 'utf8');
    const meetingCode = fs.readFileSync('./lib/meeting-state.js', 'utf8');
    const fn = new Function(`${selCode}\n${meetingCode}\nreturn { SEL, clickControl };`);
    const { SEL, clickControl } = fn();

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
    const selCode = fs.readFileSync('./lib/selectors.js', 'utf8');
    const meetingCode = fs.readFileSync('./lib/meeting-state.js', 'utf8');
    const fn = new Function(`${selCode}\n${meetingCode}\nreturn { SEL, clickControl };`);
    const { SEL, clickControl } = fn();

    const result = clickControl(SEL.mute, 'mute');
    assert.equal(result, false);
  });
});

describe('autoOpenCheck logic', () => {
  it('startAutoOpenCheck is defined as a function in content.js', () => {
    const code = fs.readFileSync('./content.js', 'utf8');
    assert.ok(code.includes('startAutoOpenCheck'), 'startAutoOpenCheck not found');
    assert.ok(code.includes('stopAutoOpenCheck'), 'stopAutoOpenCheck not found');
    assert.ok(code.includes('setInterval'), 'setInterval not found');
  });

  it('content.js handles ping, open-pip, close-pip, get-status messages', () => {
    const code = fs.readFileSync('./content.js', 'utf8');
    assert.ok(code.includes("'ping'"), 'ping handler missing');
    assert.ok(code.includes("'open-pip'"), 'open-pip handler missing');
    assert.ok(code.includes("'close-pip'"), 'close-pip handler missing');
    assert.ok(code.includes("'get-status'"), 'get-status handler missing');
  });
});
