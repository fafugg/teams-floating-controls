// lib/pip-window.js — PiP window lifecycle and MutationObserver-based syncing

let pipWin = null;
let pollTimer = null;
let pipObserver = null;

function openPiP() {
  if (!('documentPictureInPicture' in window)) {
    return { error: 'Document Picture-in-Picture requires Chrome 116 or later.' };
  }
  if (!isInMeeting()) {
    return { error: 'No active meeting detected. Join a call first.' };
  }
  if (pipWin && !pipWin.closed) {
    return { ok: true, alreadyOpen: true };
  }

  // Signal background BEFORE requestWindow so onCreated fires into the right slot
  chrome.runtime.sendMessage({ action: 'pip-about-to-open' });

  documentPictureInPicture
    .requestWindow({ width: 360, height: 290, preferInitialWindowPlacement: true })
    .then((win) => {
      pipWin = win;
      buildPiP(win);
      startObserving(win);

      // Notify background with actual window dimensions for validation
      chrome.runtime.sendMessage({
        action: 'pip-window-ready',
        width: win.width,
        height: win.height,
      });

      win.addEventListener('pagehide', () => {
        chrome.runtime.sendMessage({ action: 'pip-closed' });
        stopObserving();
        pipWin = null;
      });
    })
    .catch((err) => console.error('[Teams PiP] requestWindow failed:', err));

  return { ok: true };
}

// MutationObserver-based syncing with a safety-net poll
function startObserving(win) {
  stopObserving();

  // Observe the meeting container for DOM changes
  const target =
    document.querySelector('[data-tid="calling-sidebar"]') ||
    document.querySelector('.app-container') ||
    document.body;

  pipObserver = new MutationObserver(() => syncPiP(win));
  pipObserver.observe(target, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['aria-label', 'class', 'style'],
  });

  // Safety-net polling at 5s instead of 1s
  pollTimer = setInterval(() => syncPiP(win), 5000);
}

function stopObserving() {
  if (pipObserver) {
    pipObserver.disconnect();
    pipObserver = null;
  }
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
}
