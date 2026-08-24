// lib/meeting-state.js — Detect mute, hand, and meeting state from the DOM

function getMuteState() {
  const btn = find(SEL.mute);
  if (!btn) return 'unknown';
  const label = (btn.getAttribute('aria-label') || '').toLowerCase();
  return label.includes('unmute') ? 'muted' : 'unmuted';
}

function getHandState() {
  const btn = find(SEL.raiseHand);
  if (!btn) return 'unknown';
  const label = (btn.getAttribute('aria-label') || '').toLowerCase();
  return label.includes('lower') ? 'raised' : 'lowered';
}

function isInMeeting() {
  return !!(find(SEL.mute) || find(SEL.leave));
}

function clickControl(sels, name) {
  const btn = find(sels);
  if (btn) {
    btn.click();
    return true;
  }
  console.warn('[Teams PiP] button not found:', name);
  return false;
}
