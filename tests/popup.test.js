// tests/popup.test.js
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');

function loadIsTeamsUrl() {
  const code = fs.readFileSync('./popup.js', 'utf8');
  const match = code.match(/function isTeamsUrl\(url\) \{[\s\S]*?\n\}/);
  if (!match) throw new Error('Could not find isTeamsUrl function');
  const fn = new Function(`${match[0]}\nreturn isTeamsUrl;`);
  return fn();
}

describe('isTeamsUrl()', () => {
  it('returns truthy for teams.microsoft.com', () => {
    const isTeamsUrl = loadIsTeamsUrl();
    assert.ok(isTeamsUrl('https://teams.microsoft.com/menusomething'));
  });

  it('returns truthy for teams.live.com', () => {
    const isTeamsUrl = loadIsTeamsUrl();
    assert.ok(isTeamsUrl('https://teams.live.com/menusomething'));
  });

  it('returns falsy for other domains', () => {
    const isTeamsUrl = loadIsTeamsUrl();
    assert.ok(!isTeamsUrl('https://google.com'));
    assert.ok(!isTeamsUrl('https://slack.com'));
  });

  it('returns falsy for null/undefined', () => {
    const isTeamsUrl = loadIsTeamsUrl();
    assert.ok(!isTeamsUrl(null));
    assert.ok(!isTeamsUrl(undefined));
  });
});
