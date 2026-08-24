// lib/pip-ui.js — Build and sync the PiP window UI

let currentView = 'participants'; // 'participants' | 'content' | 'list'
let callStartTime = Date.now();
let prevParticipantNames = '';

function buildPiP(win) {
  const doc = win.document;
  callStartTime = Date.now();
  prevParticipantNames = '';

  // Load external CSS
  const cssUrl = chrome.runtime.getURL('pip-styles.css');
  fetch(cssUrl)
    .then((r) => r.text())
    .then((css) => {
      const style = doc.createElement('style');
      style.textContent = css;
      doc.head.appendChild(style);
    });

  // Load HTML template
  const templateUrl = chrome.runtime.getURL('pip-template.html');
  fetch(templateUrl)
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

  syncPiP(win);
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

  muteBtn.className = 'c-btn' + (mute === 'muted' ? ' muted' : '');
  muteBtn.textContent = mute === 'muted' ? '\u{1f507}' : '\u{1f3a4}';
  muteBtn.title = mute === 'muted' ? 'Unmute' : 'Mute';

  const handBtn = doc.getElementById('hand-btn');
  handBtn.className = 'c-btn' + (hand === 'raised' ? ' raised' : '');
  handBtn.title = hand === 'raised' ? 'Lower hand' : 'Raise hand';

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
}
