// popup.js

function isTeamsUrl(url) {
  return url && (
    url.includes('teams.microsoft.com') ||
    url.includes('teams.live.com')
  );
}

async function findTeamsTab() {
  const [active] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (isTeamsUrl(active?.url)) return { tab: active, isActive: true };
  const all = await chrome.tabs.query({});
  const found = all.find(t => isTeamsUrl(t.url));
  return found ? { tab: found, isActive: false } : null;
}

async function sendToContent(tabId, msg) {
  return chrome.tabs.sendMessage(tabId, msg).catch(() => null);
}

async function switchToTeamsTab(tab) {
  await chrome.tabs.update(tab.id, { active: true });
  await chrome.windows.update(tab.windowId, { focused: true });
}

// Ask the background to raise the PiP OS window via chrome.windows.update().
// This is the only reliable path — it goes through Chrome's internal window
// manager and works even when JS window.focus() is blocked.
async function focusPipWindow() {
  const resp = await chrome.runtime.sendMessage({ action: 'focus-pip-window' });
  return resp?.ok ?? false;
}

async function init() {
  const dot        = document.getElementById('dot');
  const statusText = document.getElementById('status-text');
  const btn        = document.getElementById('pip-btn');
  const errorMsg   = document.getElementById('error-msg');

  const found = await findTeamsTab();

  if (!found) {
    dot.className = 'dot off';
    statusText.textContent = 'Open a Teams tab first';
    return;
  }

  const { tab: teamsTab, isActive: onTeamsTab } = found;
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
      // Already on Teams tab → raise the PiP window to the front
      await focusPipWindow();
    } else {
      // On another tab → switch to Teams tab (PiP is already above it)
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
