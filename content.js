// content.js — injected into teams.microsoft.com and teams.live.com

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

function getMuteState() {
  const btn = find(SEL.mute);
  if (!btn) return 'unknown';
  const label = (btn.getAttribute('aria-label') || '').toLowerCase();
  // Button says "Unmute" when you're currently muted (shows what the action will do)
  return label.includes('unmute') ? 'muted' : 'unmuted';
}

function getHandState() {
  const btn = find(SEL.raiseHand);
  if (!btn) return 'unknown';
  const label = (btn.getAttribute('aria-label') || '').toLowerCase();
  return label.includes('lower') ? 'raised' : 'lowered';
}

function isInMeeting() {
  return !!(find(SEL.mute) || find(SEL.leave));
}

function clickControl(sels, name) {
  const btn = find(sels);
  if (btn) { btn.click(); return true; }
  console.warn('[Teams PiP] button not found:', name);
  return false;
}

// ── Stream detection ──────────────────────────────────────────────────────────
//
// Three-tier strategy to tell participants apart from screen share:
//   1. displaySurface API  — reliable when the *local* user is sharing
//   2. DOM ancestry scan   — catches remote shares via Teams aria-labels/data-tids
//   3. Resolution heuristic — fallback: wide high-res stream ≈ screen share
//
function detectStreams() {
  const liveVideos = Array.from(document.querySelectorAll('video')).filter(v => {
    if (!v.srcObject) return false;
    const tracks = v.srcObject.getVideoTracks();
    return tracks.length > 0 && tracks[0].readyState === 'live';
  });

  if (liveVideos.length === 0) {
    return { screenShare: null, dominant: null, participantCount: 0, hasContent: false };
  }

  let screenShare = null;
  const participants = [];

  for (const v of liveVideos) {
    const track = v.srcObject.getVideoTracks()[0];
    const settings = track.getSettings();

    // Tier 1: browser exposes displaySurface when a local screen capture is active
    if (settings.displaySurface) {
      if (!screenShare) screenShare = v;
      continue;
    }

    // Tier 2: walk up the DOM looking for Teams screen-share container markers
    let ancestor = v.parentElement;
    let isContent = false;
    for (let i = 0; i < 10 && ancestor; i++, ancestor = ancestor.parentElement) {
      const label = (ancestor.getAttribute('aria-label') || '').toLowerCase();
      const tid   = (ancestor.getAttribute('data-tid') || '').toLowerCase();
      const id    = (ancestor.id || '').toLowerCase();
      if (
        label.includes('screen') || label.includes('content') || label.includes('sharing') ||
        tid.includes('screen')   || tid.includes('content') ||
        id.includes('screen')    || id.includes('sharing')
      ) { isContent = true; break; }
    }
    if (isContent) { if (!screenShare) screenShare = v; continue; }

    participants.push(v);
  }

  // Tier 3: resolution heuristic — screen shares tend to be ≥1280px wide and landscape
  if (!screenShare && participants.length > 1) {
    const byRes = [...participants].sort((a, b) => {
      const as = a.srcObject.getVideoTracks()[0].getSettings();
      const bs = b.srcObject.getVideoTracks()[0].getSettings();
      return (bs.width * bs.height) - (as.width * as.height);
    });
    const candidate = byRes[0];
    const s = candidate.srcObject.getVideoTracks()[0].getSettings();
    if (s.width >= 1280 && s.width / s.height > 1.55) {
      screenShare = candidate;
      participants.splice(participants.indexOf(candidate), 1);
    }
  }

  // Dominant speaker = largest rendered participant video on screen
  const dominant = participants.length > 0
    ? [...participants].sort((a, b) => {
        const ar = a.getBoundingClientRect();
        const br = b.getBoundingClientRect();
        return (br.width * br.height) - (ar.width * ar.height);
      })[0]
    : null;

  return {
    screenShare,
    dominant,
    participantCount: participants.length,
    hasContent: !!screenShare,
  };
}

// ── PiP state ─────────────────────────────────────────────────────────────────

let pipWin = null;
let pollTimer = null;
let currentView = 'participants'; // 'participants' | 'content'

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

  currentView = 'participants';

  // Signal background BEFORE requestWindow so onCreated fires into the right slot
  chrome.runtime.sendMessage({ action: 'pip-about-to-open' });

  documentPictureInPicture
    .requestWindow({ width: 360, height: 290, preferInitialWindowPlacement: true })
    .then(win => {
      pipWin = win;
      buildPiP(win);
      startPolling(win);
      win.addEventListener('pagehide', () => {
        chrome.runtime.sendMessage({ action: 'pip-closed' });
        stopPolling();
        pipWin = null;
      });
    })
    .catch(err => console.error('[Teams PiP] requestWindow failed:', err));

  return { ok: true };
}

// ── PiP layout ────────────────────────────────────────────────────────────────
//
//  ┌─────────────────────────────────────────┐
//  │  video area (flex-grows)                │
//  │  [Cam] [Screen] ← overlay top-right     │
//  │              [N on cam] ← bottom-left   │
//  ├─────────────────────────────────────────┤
//  │  • Live   [🎤]  [✋]  [📵]              │  ← control bar
//  └─────────────────────────────────────────┘
//
function buildPiP(win) {
  const doc = win.document;

  const style = doc.createElement('style');
  style.textContent = `
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

    body {
      background: #0d0d14;
      color: #e0e0f0;
      font-family: 'Segoe UI', system-ui, sans-serif;
      display: flex;
      flex-direction: column;
      height: 100dvh;
      overflow: hidden;
      user-select: none;
    }

    /* ── Video area ── */
    #video-wrap {
      flex: 1;
      position: relative;
      background: #0a0a10;
      min-height: 0;
    }

    #pip-video {
      width: 100%;
      height: 100%;
      object-fit: contain;
      display: block;
    }

    /* View toggle — top-right corner, always visible */
    #view-toggle {
      position: absolute;
      top: 8px;
      right: 8px;
      display: flex;
      gap: 4px;
    }

    .v-pill {
      padding: 3px 9px;
      border-radius: 10px;
      border: 1px solid rgba(255,255,255,0.18);
      background: rgba(0,0,0,0.55);
      color: rgba(255,255,255,0.5);
      font-size: 10px;
      font-weight: 500;
      cursor: pointer;
      backdrop-filter: blur(6px);
      transition: background 0.15s, color 0.15s, border-color 0.15s;
      line-height: 1.6;
    }
    .v-pill:hover:not(:disabled):not(.active) {
      background: rgba(255,255,255,0.15);
      color: white;
    }
    .v-pill.active {
      background: rgba(79, 70, 229, 0.85);
      color: white;
      border-color: transparent;
    }
    .v-pill:disabled {
      opacity: 0.22;
      cursor: default;
    }

    /* Participant count badge */
    #count-badge {
      position: absolute;
      bottom: 8px;
      left: 8px;
      font-size: 10px;
      color: rgba(255,255,255,0.6);
      background: rgba(0,0,0,0.5);
      padding: 2px 7px;
      border-radius: 8px;
      backdrop-filter: blur(4px);
      display: none;
    }

    /* No-video placeholder */
    #no-video {
      position: absolute;
      inset: 0;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 8px;
      color: #2a2a40;
      font-size: 11px;
    }

    /* ── Control bar ── */
    #ctrl-bar {
      flex-shrink: 0;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 10px;
      padding: 8px 14px;
      background: #111120;
      border-top: 1px solid #1c1c2e;
    }

    .c-btn {
      width: 42px;
      height: 42px;
      border-radius: 50%;
      border: 2px solid transparent;
      background: #25253a;
      color: white;
      font-size: 18px;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: transform 0.1s ease, background 0.15s ease;
      outline: none;
      flex-shrink: 0;
    }
    .c-btn:hover  { transform: scale(1.1); }
    .c-btn:active { transform: scale(0.92); }

    #mute-btn.muted  { background: #b91c1c; border-color: #f87171; }
    #hand-btn.raised { background: #b45309; border-color: #fbbf24; }
    #leave-btn       { background: #7f1d1d; border-color: #dc2626; }
    #leave-btn:hover { background: #991b1b; }

    .s-dot {
      width: 6px;
      height: 6px;
      border-radius: 50%;
      background: #333350;
      flex-shrink: 0;
    }
    .s-dot.live  { background: #34d399; }
    .s-dot.muted { background: #f87171; }

    #s-text {
      font-size: 10px;
      color: #44446a;
      min-width: 32px;
      margin-right: 4px;
    }
    #s-text.live  { color: #34d399; }
    #s-text.muted { color: #f87171; }
  `;
  doc.head.appendChild(style);

  doc.body.innerHTML = `
    <div id="video-wrap">
      <video id="pip-video" autoplay muted playsinline></video>

      <div id="view-toggle">
        <button class="v-pill active" id="btn-cam">Cam</button>
        <button class="v-pill" id="btn-screen" disabled>Screen</button>
      </div>

      <div id="count-badge"></div>

      <div id="no-video">
        <svg width="28" height="28" viewBox="0 0 24 24" fill="currentColor">
          <path d="M18 10.5V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-4.5l4 4v-11l-4 4z"/>
        </svg>
        No camera
      </div>
    </div>

    <div id="ctrl-bar">
      <div class="s-dot" id="s-dot"></div>
      <span id="s-text">—</span>
      <button class="c-btn" id="mute-btn" title="Toggle mute">🎤</button>
      <button class="c-btn" id="hand-btn" title="Raise / lower hand">✋</button>
      <button class="c-btn" id="leave-btn" title="Leave meeting">📵</button>
    </div>
  `;

  doc.getElementById('btn-cam').addEventListener('click', () => {
    currentView = 'participants';
    doc.getElementById('btn-cam').classList.add('active');
    doc.getElementById('btn-screen').classList.remove('active');
    syncPiP(win);
  });

  doc.getElementById('btn-screen').addEventListener('click', () => {
    currentView = 'content';
    doc.getElementById('btn-screen').classList.add('active');
    doc.getElementById('btn-cam').classList.remove('active');
    syncPiP(win);
  });

  doc.getElementById('mute-btn').addEventListener('click', () => {
    clickControl(SEL.mute, 'mute');
    setTimeout(() => syncPiP(win), 300);
  });
  doc.getElementById('hand-btn').addEventListener('click', () => {
    clickControl(SEL.raiseHand, 'raise hand');
    setTimeout(() => syncPiP(win), 300);
  });
  doc.getElementById('leave-btn').addEventListener('click', () => {
    if (win.confirm('Leave the meeting?')) clickControl(SEL.leave, 'leave');
  });

  syncPiP(win);
}

function syncPiP(win) {
  if (!win || win.closed) return;
  const doc = win.document;
  const muteBtn = doc.getElementById('mute-btn');
  if (!muteBtn) return;

  // ── Controls state ──
  const mute    = getMuteState();
  const hand    = getHandState();
  const meeting = isInMeeting();

  muteBtn.className = 'c-btn' + (mute === 'muted' ? ' muted' : '');
  muteBtn.textContent = mute === 'muted' ? '🔇' : '🎤';
  muteBtn.title = mute === 'muted' ? 'Unmute' : 'Mute';

  const handBtn = doc.getElementById('hand-btn');
  handBtn.className = 'c-btn' + (hand === 'raised' ? ' raised' : '');
  handBtn.title = hand === 'raised' ? 'Lower hand' : 'Raise hand';

  const dot  = doc.getElementById('s-dot');
  const sTxt = doc.getElementById('s-text');
  if (!meeting) {
    dot.className = 's-dot';
    sTxt.className = '';
    sTxt.textContent = 'Ended';
  } else if (mute === 'muted') {
    dot.className = 's-dot muted';
    sTxt.className = 'muted';
    sTxt.textContent = 'Muted';
  } else {
    dot.className = 's-dot live';
    sTxt.className = 'live';
    sTxt.textContent = 'Live';
  }

  // ── Video state ──
  const { screenShare, dominant, participantCount, hasContent } = detectStreams();
  const btnScreen  = doc.getElementById('btn-screen');
  const btnCam     = doc.getElementById('btn-cam');
  const videoEl    = doc.getElementById('pip-video');
  const noVideo    = doc.getElementById('no-video');
  const countBadge = doc.getElementById('count-badge');

  btnScreen.disabled = !hasContent;

  // If screen share disappeared while in content view, fall back to cam
  if (!hasContent && currentView === 'content') {
    currentView = 'participants';
    btnCam.classList.add('active');
    btnScreen.classList.remove('active');
  }

  // Pick the video source for the current view
  const source = (currentView === 'content' && screenShare)
    ? screenShare
    : (dominant || screenShare); // fall back to screen share if no participant has camera on

  if (source) {
    noVideo.style.display = 'none';
    // Only reassign srcObject when the stream actually changed to avoid flickering
    if (videoEl.srcObject !== source.srcObject) {
      videoEl.srcObject = source.srcObject;
      videoEl.play().catch(() => {});
    }
  } else {
    noVideo.style.display = 'flex';
    if (videoEl.srcObject) videoEl.srcObject = null;
  }

  // Count badge: only useful in cam view with multiple participants
  if (currentView === 'participants' && participantCount > 1) {
    countBadge.style.display = 'block';
    countBadge.textContent = `${participantCount} on cam`;
  } else {
    countBadge.style.display = 'none';
  }
}

function startPolling(win) {
  stopPolling();
  pollTimer = setInterval(() => syncPiP(win), 1000);
}

function stopPolling() {
  if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
}

// ── Message bridge from popup ─────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.action === 'open-pip') {
    sendResponse(openPiP());
    return true;
  }
  if (msg.action === 'get-status') {
    sendResponse({
      inMeeting: isInMeeting(),
      mute: getMuteState(),
      hand: getHandState(),
      pipOpen: !!(pipWin && !pipWin.closed),
    });
    return true;
  }
});
