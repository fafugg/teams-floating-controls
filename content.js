// content.js — thin orchestrator injected into teams.microsoft.com and teams.live.com
// Loads after: selectors.js, meeting-state.js, stream-detection.js, pip-ui.js, pip-window.js

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  switch (msg.action) {
    case 'ping':
      sendResponse({ ok: true });
      return true;

    case 'open-pip':
      sendResponse(openPiP());
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
