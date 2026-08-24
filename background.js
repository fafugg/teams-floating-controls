// background.js — service worker
// Tracks the OS-level window ID of the Document PiP window for reliable focus control.

let pipWindowId = null;
let expectingPip = false;

// ── Window lifecycle tracking ──────────────────────────────────────────────────

chrome.windows.onCreated.addListener((win) => {
  if (expectingPip && win.type === 'popup') {
    pipWindowId = win.id;
    expectingPip = false;
  }
});

chrome.windows.onRemoved.addListener((windowId) => {
  if (windowId === pipWindowId) pipWindowId = null;
});

// ── Extension lifecycle ────────────────────────────────────────────────────────

chrome.runtime.onInstalled.addListener(() => {
  pipWindowId = null;
  expectingPip = false;
});

// ── Keyboard shortcut handler ──────────────────────────────────────────────────

function isTeamsUrl(url) {
  return url && (url.includes('teams.microsoft.com') || url.includes('teams.live.com'));
}

chrome.commands.onCommand.addListener(async (command) => {
  if (command === 'toggle-pip') {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab || !isTeamsUrl(tab.url)) return;

    try {
      const status = await chrome.tabs.sendMessage(tab.id, { action: 'get-status' });
      if (!status) return;

      if (status.pipOpen) {
        await chrome.tabs.sendMessage(tab.id, { action: 'close-pip' });
      } else {
        await chrome.tabs.sendMessage(tab.id, { action: 'open-pip' });
      }
    } catch {
      // Content script may not be injected yet
    }
  }
});

// ── Message handler ────────────────────────────────────────────────────────────

function handleFocusPip(sendResponse) {
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
    chrome.windows.getAll({ windowTypes: ['popup'] }, (wins) => {
      const candidate = wins.find((w) => w.width < 500 && w.height < 400);
      if (candidate) {
        pipWindowId = candidate.id;
        tryFocus(candidate.id);
      } else {
        sendResponse({ ok: false });
      }
    });
  }
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  switch (msg.action) {
    case 'pip-about-to-open':
      expectingPip = true;
      setTimeout(() => {
        expectingPip = false;
      }, 5000);
      sendResponse({ ok: true });
      return true;

    case 'pip-closed':
      pipWindowId = null;
      sendResponse({ ok: true });
      return true;

    case 'pip-window-ready':
      // Content script confirms the PiP window was created — validate and correct ID if needed
      if (msg.windowId && msg.width < 500 && msg.height < 400) {
        pipWindowId = msg.windowId;
        sendResponse({ ok: true });
      } else {
        sendResponse({ ok: false });
      }
      return true;

    case 'get-pip-window-id':
      sendResponse({ windowId: pipWindowId });
      return true;

    case 'focus-pip-window':
      handleFocusPip(sendResponse);
      return true; // async response

    default:
      return false;
  }
});
