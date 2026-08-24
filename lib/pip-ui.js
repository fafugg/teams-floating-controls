// lib/pip-ui.js — Build and sync the PiP window UI

let currentView = 'participants'; // 'participants' | 'content' | 'list'
let callStartTime = Date.now();
let isPinned = false;
let prevParticipantNames = '';

// SVG icon URLs — loaded as web-accessible resources
const ICONS = {
  micOn: chrome.runtime.getURL('icons/mic-on.svg'),
  micOff: chrome.runtime.getURL('icons/mic-off.svg'),
  hand: chrome.runtime.getURL('icons/hand.svg'),
  handRaised: chrome.runtime.getURL('icons/hand-raised.svg'),
  leave: chrome.runtime.getURL('icons/leave.svg'),
  pin: chrome.runtime.getURL('icons/pin.svg'),
};

function svgIcon(url) {
  return `<img src="${url}" width="20" height="20" style="pointer-events:none">`;
}

function buildPiP(win) {
  const doc = win.document;
  callStartTime = Date.now();
  prevParticipantNames = '';
  isPinned = false;

  // Load CSS first, then HTML template — ensures styles are ready before first sync
  const cssUrl = chrome.runtime.getURL('pip-styles.css');
  const templateUrl = chrome.runtime.getURL('pip-template.html');

  fetch(cssUrl)
    .then((r) => r.text())
    .then((css) => {
      const style = doc.createElement('style');
      style.textContent = css;
      doc.head.appendChild(style);
      return fetch(templateUrl);
    })
    .then((r) => r.text())
    .then((html) => {
      doc.body.innerHTML = html;
      attachPiPListeners(win);
      syncPiP(win);
    });
}

function attachPiPListeners(win) {
  const doc = win.document;

  function setActiveView(view) {
    currentView = view;
    doc.getElementById('btn-cam').classList.toggle('active', view === 'participants');
    doc.getElementById('btn-screen').classList.toggle('active', view === 'content');
    doc.getElementById('btn-participants').classList.toggle('active', view === 'list');
    syncPiP(win);
  }

  doc.getElementById('btn-cam').addEventListener('click', () => setActiveView('participants'));
  doc.getElementById('btn-screen').addEventListener('click', () => setActiveView('content'));
  doc
    .getElementById('btn-participants')
    .addEventListener('click', () => setActiveView('list'));

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

  // Initialize button icons
  doc.getElementById('mute-btn').innerHTML = svgIcon(ICONS.micOn);
  doc.getElementById('hand-btn').innerHTML = svgIcon(ICONS.hand);
  doc.getElementById('leave-btn').innerHTML = svgIcon(ICONS.leave);
  doc.getElementById('pin-btn').innerHTML = svgIcon(ICONS.pin);

  doc.getElementById('pin-btn').addEventListener('click', async () => {
    try {
      const resp = await chrome.runtime.sendMessage({ action: 'get-pip-window-id' });
      if (resp?.windowId) {
        isPinned = !isPinned;
        chrome.windows.update(resp.windowId, { alwaysOnTop: isPinned });
        const pinBtn = doc.getElementById('pin-btn');
        pinBtn.classList.toggle('pinned', isPinned);
        pinBtn.title = isPinned ? 'Unpin from top' : 'Pin on top';
      }
    } catch {
      // Extension context invalidated — ignore
    }
  });

  // Resize handler
  win.addEventListener('resize', () => {
    const { width, height } = win;
    doc.documentElement.style.setProperty('--pip-width', `${width}px`);
    doc.documentElement.style.setProperty('--pip-height', `${height}px`);
  });
}

function syncPiP(win) {
  if (!win || win.closed) return;
  const doc = win.document;
  const muteBtn = doc.getElementById('mute-btn');
  if (!muteBtn) return;

  // ── Controls state ──
  const mute = getMuteState();
  const hand = getHandState();
  const meeting = isInMeeting();

  const newMuted = mute === 'muted';
  if (muteBtn.dataset.muted !== String(newMuted)) {
    muteBtn.dataset.muted = newMuted;
    muteBtn.className = 'c-btn' + (newMuted ? ' muted' : '');
    muteBtn.innerHTML = svgIcon(newMuted ? ICONS.micOff : ICONS.micOn);
    muteBtn.title = newMuted ? 'Unmute' : 'Mute';
  }

  const handBtn = doc.getElementById('hand-btn');
  const newRaised = hand === 'raised';
  if (handBtn.dataset.raised !== String(newRaised)) {
    handBtn.dataset.raised = newRaised;
    handBtn.className = 'c-btn' + (newRaised ? ' raised' : '');
    handBtn.innerHTML = svgIcon(newRaised ? ICONS.handRaised : ICONS.hand);
    handBtn.title = newRaised ? 'Lower hand' : 'Raise hand';
  }

  const dot = doc.getElementById('s-dot');
  const sTxt = doc.getElementById('s-text');
  if (!meeting) {
    dot.className = 's-dot';
    sTxt.className = '';
    sTxt.textContent = '\u2014';
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
  const {
    screenShare,
    dominant,
    dominantName,
    participantCount,
    hasContent,
    participants,
  } = detectStreams();
  const btnScreen = doc.getElementById('btn-screen');
  const btnCam = doc.getElementById('btn-cam');
  const btnParticipants = doc.getElementById('btn-participants');
  const videoEl = doc.getElementById('pip-video');
  const noVideo = doc.getElementById('no-video');
  const countBadge = doc.getElementById('count-badge');
  const participantsList = doc.getElementById('participants-list');
  const speakerNameEl = doc.getElementById('speaker-name');

  // ── Button visibility ──
  btnCam.style.display = participantCount > 0 ? '' : 'none';
  btnScreen.style.display = hasContent ? '' : 'none';
  const showParticipantsBtn = !hasContent && participantCount === 0 && participants.length > 0;
  btnParticipants.style.display = showParticipantsBtn ? '' : 'none';

  // ── Auto-fallback views ──
  let viewChanged = false;
  if (!hasContent && currentView === 'content') {
    currentView =
      participantCount > 0
        ? 'participants'
        : showParticipantsBtn
          ? 'list'
          : 'participants';
    viewChanged = true;
  }
  if (participantCount === 0 && currentView === 'participants') {
    currentView = hasContent
      ? 'content'
      : showParticipantsBtn
        ? 'list'
        : 'participants';
    viewChanged = true;
  }
  if (viewChanged) {
    btnCam.classList.toggle('active', currentView === 'participants');
    btnScreen.classList.toggle('active', currentView === 'content');
    btnParticipants.classList.toggle('active', currentView === 'list');
  }

  // ── Video / list source ──
  const showVideo = currentView !== 'list';
  videoEl.style.display = showVideo ? '' : 'none';

  const source =
    currentView === 'content' && screenShare ? screenShare : dominant || screenShare;

  if (showVideo && source) {
    noVideo.style.display = 'none';
    if (videoEl.srcObject !== source.srcObject) {
      videoEl.srcObject = source.srcObject;
      videoEl.play().catch(() => {});
    }
  } else if (showVideo) {
    noVideo.style.display = 'flex';
    if (videoEl.srcObject) videoEl.srcObject = null;
  } else {
    noVideo.style.display = 'none';
    if (videoEl.srcObject) videoEl.srcObject = null;
  }

  // ── Speaker name in control bar (screen mode only) ──
  if (currentView === 'content' && dominantName) {
    speakerNameEl.textContent = dominantName;
    speakerNameEl.style.display = '';
  } else {
    speakerNameEl.style.display = 'none';
  }

  // ── Participants list (only rebuild if changed) ──
  if (currentView === 'list') {
    participantsList.style.display = 'block';
    const newNames = participants.map((p) => p.name + (p.isSpeaking ? '*' : '')).join(',');
    if (newNames !== prevParticipantNames) {
      prevParticipantNames = newNames;
      participantsList.innerHTML = participants
        .map(
          (p) =>
            `<div class="p-row"><span class="p-dot${p.isSpeaking ? ' speaking' : ''}"></span><span>${p.name}</span></div>`,
        )
        .join('');
    }
  } else {
    participantsList.style.display = 'none';
    prevParticipantNames = '';
  }

  // ── Count badge ──
  if (currentView === 'participants' && participantCount > 1) {
    countBadge.style.display = 'block';
    countBadge.textContent = `${participantCount} on cam`;
  } else {
    countBadge.style.display = 'none';
  }

  // ── Meeting title ──
  const titleEl = doc.getElementById('meeting-title');
  if (titleEl) {
    const title = getMeetingTitle();
    if (title) {
      titleEl.textContent = title;
      titleEl.style.display = '';
    } else {
      titleEl.style.display = 'none';
    }
  }

  // ── Duration ──
  const durationEl = doc.getElementById('duration');
  if (durationEl) {
    const elapsed = Math.floor((Date.now() - callStartTime) / 1000);
    const mins = Math.floor(elapsed / 60);
    const secs = elapsed % 60;
    durationEl.textContent = `${mins}:${secs.toString().padStart(2, '0')}`;
  }
}
