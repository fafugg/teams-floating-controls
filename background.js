// background.js — service worker

// Track the Chrome window ID of the Document PiP window so we can focus it
// via chrome.windows.update(), which goes through the OS window manager and
// works even when JS window.focus() is blocked (no user gesture, WM restrictions).

let pipWindowId = null;
let expectingPip = false;

chrome.windows.onCreated.addListener(win => {
  if (expectingPip) {
    pipWindowId = win.id;
    expectingPip = false;
  }
});

chrome.windows.onRemoved.addListener(windowId => {
  if (windowId === pipWindowId) pipWindowId = null;
});

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {

  if (msg.action === 'pip-about-to-open') {
    expectingPip = true;
    setTimeout(() => { expectingPip = false; }, 5000);
    sendResponse({ ok: true });
    return true;
  }

  if (msg.action === 'pip-closed') {
    pipWindowId = null;
    sendResponse({ ok: true });
    return true;
  }

  if (msg.action === 'get-pip-window-id') {
    sendResponse({ windowId: pipWindowId });
    return true;
  }

  if (msg.action === 'focus-pip-window') {
    const tryFocus = (id) => {
      chrome.windows.update(id, { focused: true }, () => {
        if (chrome.runtime.lastError) {
          if (id === pipWindowId) pipWindowId = null;
          sendResponse({ ok: false });
        } else {
          sendResponse({ ok: true });
        }
      });
    };

    if (pipWindowId !== null) {
      tryFocus(pipWindowId);
    } else {
      // Fallback: scan for a small popup that is likely the PiP window
      chrome.windows.getAll({ windowTypes: ['popup'] }, wins => {
        const candidate = wins.find(w => w.width < 500 && w.height < 400);
        if (candidate) {
          pipWindowId = candidate.id;
          tryFocus(candidate.id);
        } else {
          sendResponse({ ok: false });
        }
      });
    }
    return true;
  }
});
