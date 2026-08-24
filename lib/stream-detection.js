// lib/stream-detection.js — Detect video streams, screen shares, and dominant speaker

function hasSpeakingIndicator(element) {
  const label = (element.getAttribute('aria-label') || '').toLowerCase();
  if (label.includes('speaking')) return true;
  const cls = (element.className || '').toString().toLowerCase();
  if (cls.includes('speaking') || cls.includes('active-speaker') || cls.includes('dominant'))
    return true;
  try {
    const computed = window.getComputedStyle(element);
    const bw = computed.borderWidth;
    if (bw && bw !== '0px' && bw !== '0') {
      const bc = computed.borderColor;
      if (
        bc.includes('52, 211, 153') ||
        bc.includes('79, 70, 229') ||
        bc.includes('0, 128')
      )
        return true;
    }
  } catch (_) {
    /* ignore */
  }
  return false;
}

// Combined ancestor walk — does screen share detection, speaking detection,
// and name extraction in a single pass instead of walking 3 separate times.
function analyzeVideoAncestors(videoEl) {
  let isContent = false;
  let isSpeaking = false;
  let name = null;
  let ancestor = videoEl.parentElement;

  for (let i = 0; i < 10 && ancestor; i++, ancestor = ancestor.parentElement) {
    const label = (ancestor.getAttribute('aria-label') || '').toLowerCase();
    const tid = (ancestor.getAttribute('data-tid') || '').toLowerCase();
    const id = (ancestor.id || '').toLowerCase();

    // Screen share detection (Tier 2)
    if (
      label.includes('screen') ||
      label.includes('content') ||
      label.includes('sharing') ||
      tid.includes('screen') ||
      tid.includes('content') ||
      id.includes('screen') ||
      id.includes('sharing')
    ) {
      isContent = true;
    }

    // Speaking detection
    if (hasSpeakingIndicator(ancestor)) isSpeaking = true;

    // Name extraction — skip screen-share containers
    if (
      !name &&
      label &&
      !label.includes('screen') &&
      !label.includes('sharing') &&
      !label.includes('content')
    ) {
      name =
        label
          .replace(/\s*[-–]\s*(speaking|presenting|in call).*$/i, '')
          .trim() || null;
    }
  }

  return { isContent, isSpeaking, name };
}

// Three-tier strategy to tell participants apart from screen share:
//   1. displaySurface API  — reliable when the *local* user is sharing
//   2. DOM ancestry scan   — catches remote shares via Teams aria-labels/data-tids
//   3. Resolution heuristic — fallback: wide high-res stream ≈ screen share
function detectStreams() {
  const liveVideos = Array.from(document.querySelectorAll('video')).filter((v) => {
    if (!v.srcObject) return false;
    const tracks = v.srcObject.getVideoTracks();
    return tracks.length > 0 && tracks[0].readyState === 'live';
  });

  if (liveVideos.length === 0) {
    return {
      screenShare: null,
      dominant: null,
      dominantName: null,
      participantCount: 0,
      hasContent: false,
      participants: [],
    };
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

    // Tier 2 + speaking + name: single combined ancestor walk
    const analysis = analyzeVideoAncestors(v);
    if (analysis.isContent) {
      if (!screenShare) screenShare = v;
      continue;
    }

    const name = analysis.name || 'Unknown';
    participants.push({ video: v, name, isSpeaking: analysis.isSpeaking });
  }

  // Tier 3: resolution heuristic — screen shares tend to be ≥1280px wide and landscape
  if (!screenShare && participants.length > 1) {
    const byRes = [...participants].sort((a, b) => {
      const as = a.video.srcObject.getVideoTracks()[0].getSettings();
      const bs = b.video.srcObject.getVideoTracks()[0].getSettings();
      return bs.width * bs.height - as.width * as.height;
    });
    const candidate = byRes[0];
    const s = candidate.video.srcObject.getVideoTracks()[0].getSettings();
    if (s.width >= 1280 && s.width / s.height > 1.55) {
      screenShare = candidate.video;
      participants.splice(participants.indexOf(candidate), 1);
    }
  }

  // Dominant speaker: prefer DOM speaking indicator, then fall back to bounding rect size
  let dominant = null;
  const domSpeaker = participants.find((p) => p.isSpeaking);
  if (domSpeaker) {
    dominant = domSpeaker.video;
  } else if (participants.length > 0) {
    dominant = [...participants]
      .sort((a, b) => {
        const ar = a.video.getBoundingClientRect();
        const br = b.video.getBoundingClientRect();
        return br.width * br.height - ar.width * ar.height;
      })[0].video;
  }

  const dominantName = dominant
    ? (participants.find((p) => p.video === dominant) || {}).name || null
    : null;

  return {
    screenShare,
    dominant,
    dominantName,
    participantCount: participants.length,
    hasContent: !!screenShare,
    participants,
  };
}

function getMeetingTitle() {
  const el =
    document.querySelector('[data-tid="meeting-topic"]') ||
    document.querySelector('.meeting-title') ||
    document.querySelector('[aria-label*="meeting" i]');
  return el?.textContent?.trim() || null;
}
