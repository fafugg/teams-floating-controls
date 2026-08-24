// popup.js

function isTeamsUrl(url) {
  return url && (url.includes('teams.microsoft.com') || url.includes('teams.live.com'));
}

async function findTeamsTab() {
  const [active] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (isTeamsUrl(active?.url)) return { tab: active, isActive: true };
  const all = await chrome.tabs.query({});
  const found = all.find((t) => isTeamsUrl(t.url));
  return found ? { tab: found, isActive: false } : null;
}

async function sendToContent(tabId, msg) {
  return chrome.tabs.sendMessage(tabId, msg).catch(() => null);
}

async function switchToTeamsTab(tab) {
  await chrome.tabs.update(tab.id, { active: true });
  await chrome.windows.update(tab.windowId, { focused: true });
}

async function focusPipWindow() {
  const resp = await chrome.runtime.sendMessage({ action: 'focus-pip-window' });
  return resp?.ok ?? false;
}

// Ensure the content script is injected — auto-inject if missing
async function ensureContentScript(tabId) {
  try {
    await chrome.tabs.sendMessage(tabId, { action: 'ping' });
    return true;
  } catch {
    // Content script not injected — inject on demand
    try {
      await chrome.scripting.executeScript({
        target: { tabId },
        files: [
          'lib/selectors.js',
          'lib/meeting-state.js',
          'lib/stream-detection.js',
          'lib/pip-ui.js',
          'lib/pip-window.js',
          'content.js',
        ],
      });
      // Wait for injection to complete
      await new Promise((r) => setTimeout(r, 150));
      return true;
    } catch {
      return false;
    }
  }
}

async function init() {
  const dot = document.getElementById('dot');
  const statusText = document.getElementById('status-text');
  const btn = document.getElementById('pip-btn');
  const errorMsg = document.getElementById('error-msg');

  const found = await findTeamsTab();

  if (!found) {
    dot.className = 'dot off';
    statusText.textContent = 'Open a Teams tab first';
    return;
  }

  const { tab: teamsTab, isActive: onTeamsTab } = found;

  // Ensure content script is injected
  const injected = await ensureContentScript(teamsTab.id);
  if (!injected) {
    statusText.textContent = 'Could not inject extension script — try reloading';
    dot.className = 'dot off';
    return;
  }

  const status = await sendToContent(teamsTab.id, { action: 'get-status' });

  if (!status) {
    statusText.textContent = 'Cannot reach Teams page — try reloading it';
    return;
  }

  if (!status.inMeeting) {
    dot.className = 'dot off';
    statusText.textContent = 'No active meeting';
    return;
  }

  const muted = status.mute === 'muted';
  dot.className = 'dot ' + (muted ? 'muted' : 'live');
  statusText.textContent = muted ? 'In meeting — Muted' : 'In meeting — Live';

  if (status.pipOpen) {
    if (onTeamsTab) {
      await focusPipWindow();
    } else {
      await switchToTeamsTab(teamsTab);
    }
    window.close();
    return;
  }

  btn.disabled = false;
  btn.textContent = 'Open floating controls';

  btn.addEventListener('click', async () => {
    const result = await sendToContent(teamsTab.id, { action: 'open-pip' });
    if (!result) {
      showError('Could not communicate with the Teams tab.');
      return;
    }
    if (result.error) {
      showError(result.error);
      return;
    }
    window.close();
  });

  function showError(msg) {
    errorMsg.textContent = msg;
    errorMsg.style.display = 'block';
  }
}

init();
