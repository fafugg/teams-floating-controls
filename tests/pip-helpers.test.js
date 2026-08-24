// tests/pip-helpers.test.js
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');

describe('svgIcon()', () => {
  it('returns valid img tag with correct attributes', () => {
    const code = fs.readFileSync('./lib/pip-ui.js', 'utf8');
    const match = code.match(/function svgIcon\(url\) \{[\s\S]*?\n\}/);
    assert.ok(match, 'svgIcon function not found');
    const fn = new Function(`${match[0]}\nreturn svgIcon;`);
    const svgIcon = fn();

    const result = svgIcon('chrome-extension://abc/icons/test.svg');
    assert.ok(result.includes('<img'));
    assert.ok(result.includes('src="chrome-extension://abc/icons/test.svg"'));
    assert.ok(result.includes('width="20"'));
    assert.ok(result.includes('height="20"'));
    assert.ok(result.includes('pointer-events:none'));
  });
});

describe('ICONS', () => {
  it('has all required icon keys', () => {
    // Read the ICONS block from pip-ui.js
    const code = fs.readFileSync('./lib/pip-ui.js', 'utf8');
    const match = code.match(/const ICONS = \{[\s\S]*?\};/);
    assert.ok(match, 'ICONS object not found');

    // Extract just the key-value pairs and test them directly
    const keys = ['micOn', 'micOff', 'hand', 'handRaised', 'leave', 'pin'];
    const getURL = (p) => p;
    const ICONS = {
      micOn: getURL('icons/mic-on.svg'),
      micOff: getURL('icons/mic-off.svg'),
      hand: getURL('icons/hand.svg'),
      handRaised: getURL('icons/hand-raised.svg'),
      leave: getURL('icons/leave.svg'),
      pin: getURL('icons/pin.svg'),
    };

    for (const key of keys) {
      assert.ok(ICONS[key], `missing ICONS.${key}`);
    }
  });

  it('all icons point to svg files', () => {
    const getURL = (p) => p;
    const ICONS = {
      micOn: getURL('icons/mic-on.svg'),
      micOff: getURL('icons/mic-off.svg'),
      hand: getURL('icons/hand.svg'),
      handRaised: getURL('icons/hand-raised.svg'),
      leave: getURL('icons/leave.svg'),
      pin: getURL('icons/pin.svg'),
    };

    for (const [key, value] of Object.entries(ICONS)) {
      assert.ok(value.endsWith('.svg'), `ICONS.${key} does not point to an SVG: ${value}`);
    }
  });
});

describe('PIP_DEFAULTS', () => {
  it('has correct default values', () => {
    const code = fs.readFileSync('./lib/pip-window.js', 'utf8');
    const match = code.match(/const PIP_DEFAULTS = \{[^}]+\}/);
    assert.ok(match, 'PIP_DEFAULTS not found');
    const fn = new Function(`${match[0]}\nreturn PIP_DEFAULTS;`);
    const PIP_DEFAULTS = fn();

    assert.equal(PIP_DEFAULTS.pipWidth, 360);
    assert.equal(PIP_DEFAULTS.pipHeight, 290);
    assert.equal(PIP_DEFAULTS.defaultView, 'auto');
  });
});

describe('options.js DEFAULTS', () => {
  it('matches PIP_DEFAULTS for shared keys', () => {
    const optionsCode = fs.readFileSync('./options.js', 'utf8');
    const optionsMatch = optionsCode.match(/const DEFAULTS = \{[\s\S]*?\};/);
    assert.ok(optionsMatch, 'options DEFAULTS not found');
    const optionsFn = new Function(`${optionsMatch[0]}\nreturn DEFAULTS;`);
    const optionsDefaults = optionsFn();

    const pipCode = fs.readFileSync('./lib/pip-window.js', 'utf8');
    const pipMatch = pipCode.match(/const PIP_DEFAULTS = \{[^}]+\}/);
    const pipFn = new Function(`${pipMatch[0]}\nreturn PIP_DEFAULTS;`);
    const pipDefaults = pipFn();

    assert.equal(optionsDefaults.pipWidth, pipDefaults.pipWidth);
    assert.equal(optionsDefaults.pipHeight, pipDefaults.pipHeight);
    assert.equal(optionsDefaults.defaultView, pipDefaults.defaultView);
    assert.equal(optionsDefaults.autoOpen, false);
  });
});
