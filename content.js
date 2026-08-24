// content.js — thin orchestrator injected into teams.microsoft.com and teams.live.com
// Loads after: selectors.js, meeting-state.js, stream-detection.js, pip-ui.js, pip-window.js

// Auto-open PiP when a meeting starts (if enabled in settings)
let autoOpenCheck = null;
let wasInMeeting = false;

function startAutoOpenCheck() {
  if (autoOpenCheck) return;
  wasInMeeting = false;

  autoOpenCheck = setInterval(async () => {
    // Skip if PiP is already open
    if (pipWin && !pipWin.closed) return;

    const settings = await chrome.storage.sync.get({ autoOpen: false });
    if (!settings.autoOpen) {
      wasInMeeting = false;
      return;
    }

    const inMeeting = isInMeeting();
    if (inMeeting && !wasInMeeting) {
      // Meeting just started — open PiP
      openPiP();
    }
    wasInMeeting = inMeeting;
  }, 3000);
}

function stopAutoOpenCheck() {
  if (autoOpenCheck) {
    clearInterval(autoOpenCheck);
    autoOpenCheck = null;
  }
}

// Start checking after a short delay to let the page load
setTimeout(startAutoOpenCheck, 5000);

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  switch (msg.action) {
    case 'ping':
      sendResponse({ ok: true });
      return true;

    case 'open-pip':
      openPiP().then((result) => sendResponse(result));
      return true; // keep channel open for async response

    case 'close-pip':
      closePiP();
      sendResponse({ ok: true });
      return true;

    case 'get-status':
      sendResponse({
        inMeeting: isInMeeting(),
        mute: getMuteState(),
        hand: getHandState(),
        pipOpen: !!(pipWin && !pipWin.closed),
      });
      return true;

    default:
      return false;
  }
});
