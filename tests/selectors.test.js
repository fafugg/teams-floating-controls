// tests/selectors.test.js
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

// Wrap source in a function to avoid const re-declaration issues
function loadSelectors() {
  const code = fs.readFileSync('./lib/selectors.js', 'utf8');
  const fn = new Function(`${code}\nreturn { SEL, find };`);
  return fn();
}

describe('find()', () => {
  it('returns first matching element', () => {
    setupDom(`
      <button data-tid="toggle-mute">Mute 1</button>
      <button data-tid="toggle-mute">Mute 2</button>
    `);
    const { SEL, find } = loadSelectors();
    const el = find(SEL.mute);
    assert.ok(el);
    assert.equal(el.textContent, 'Mute 1');
  });

  it('returns fallback selector when first fails', () => {
    setupDom(`<button aria-label="Unmute microphone">Mute</button>`);
    const { SEL, find } = loadSelectors();
    const el = find(SEL.mute);
    assert.ok(el);
    assert.equal(el.getAttribute('aria-label'), 'Unmute microphone');
  });

  it('returns null when no selector matches', () => {
    setupDom(`<div>Nothing here</div>`);
    const { SEL, find } = loadSelectors();
    const el = find(SEL.mute);
    assert.equal(el, null);
  });

  it('tries leave selectors', () => {
    setupDom(`<button aria-label="Leave call">Leave</button>`);
    const { SEL, find } = loadSelectors();
    const el = find(SEL.leave);
    assert.ok(el);
    assert.equal(el.textContent, 'Leave');
  });

  it('tries raise hand selectors', () => {
    setupDom(`<button data-tid="callingbuttons-raise-hand">Hand</button>`);
    const { SEL, find } = loadSelectors();
    const el = find(SEL.raiseHand);
    assert.ok(el);
    assert.equal(el.textContent, 'Hand');
  });
});
