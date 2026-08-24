// lib/selectors.js — DOM selectors with fallbacks for Teams UI variants

const SEL = {
  mute: [
    '[data-tid="toggle-mute"]',
    'button[aria-label*="Unmute" i]',
    'button[aria-label*="Mute" i]',
  ],
  leave: [
    '[data-tid="hangup-button"]',
    'button[aria-label*="Leave" i]',
    'button[aria-label*="End call" i]',
  ],
  raiseHand: [
    '[data-tid="raise-hand-button"]',
    '[data-tid="callingbuttons-raise-hand"]',
    'button[aria-label*="raise hand" i]',
    'button[aria-label*="lower hand" i]',
  ],
};

function find(sels) {
  for (const s of sels) {
    const el = document.querySelector(s);
    if (el) return el;
  }
  return null;
}
