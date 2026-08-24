// lib/pip-window.js — PiP window lifecycle and MutationObserver-based syncing

let pipWin = null;
let pollTimer = null;
let pipObserver = null;

async function openPiP() {
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
  // Send immediately — don't wait for storage, which could delay the signal past the 5s timeout
  chrome.runtime.sendMessage({ action: 'pip-about-to-open' });

  try {
    const win = await documentPictureInPicture.requestWindow({
      width: 360,
      height: 290,
      preferInitialWindowPlacement: true,
    });

    pipWin = win;
    buildPiP(win);
    startObserving(win);

    // Notify background with actual window dimensions for validation
    chrome.runtime.sendMessage({
      action: 'pip-window-ready',
      windowId: win.id,
      width: win.width,
      height: win.height,
    });

    win.addEventListener('pagehide', () => {
      chrome.runtime.sendMessage({ action: 'pip-closed' });
      stopObserving();
      pipWin = null;
    });

    return { ok: true };
  } catch (err) {
    console.error('[Teams PiP] requestWindow failed:', err);
    return { error: err.message || 'Failed to open Picture-in-Picture window.' };
  }
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
