// lib/pip-window.js — PiP window lifecycle and MutationObserver-based syncing

let pipWin = null;
let pollTimer = null;
let pipObserver = null;

const PIP_DEFAULTS = { pipWidth: 360, pipHeight: 290, defaultView: 'auto' };

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

  let settings;
  try {
    settings = await chrome.storage.sync.get(PIP_DEFAULTS);
  } catch {
    settings = PIP_DEFAULTS;
  }
  currentView = settings.defaultView === 'auto' ? 'participants' : settings.defaultView;

  try {
    const win = await documentPictureInPicture.requestWindow({
      width: settings.pipWidth,
      height: settings.pipHeight,
      preferInitialWindowPlacement: true,
    });

    pipWin = win;
    buildPiP(win);
    startObserving(win);

    // Notify background with actual window ID and dimensions for validation
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

function closePiP() {
  if (pipWin && !pipWin.closed) {
    pipWin.close();
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
