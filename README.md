# Teams Floating Controls

A Chrome extension that keeps your Microsoft Teams meeting visible across all tabs using a floating Picture-in-Picture window with full meeting controls.

> [Add a screenshot or GIF here showing the floating PiP window over other tabs]

## The Problem

When you're in a Teams meeting and switch to another tab, you lose sight of the call. Unlike Google Meet, Teams doesn't offer a built-in way to keep the meeting visible while working in other tabs.

## The Solution

This extension opens a small floating window (360x290) that stays on top of everything, showing the active speaker's camera (or screen share) with controls for mute, raise hand, and leave. You can switch between viewing the camera feed and the screen share with a single click.

## Features

- **Always-on-top floating window** using Chrome's Document Picture-in-Picture API
- **Meeting controls** directly in the floating window: mute/unmute, raise/lower hand, leave call
- **Live status indicator** showing whether you're live or muted
- **Camera / Screen toggle** to switch between participant video and shared content
- **Participant count badge** when multiple people have their cameras on
- **Smart screen share detection** with a 3-tier strategy to distinguish screen shares from camera feeds
- **Extension popup** with one-click access and status overview
- **Works with both** Teams for Business (`teams.microsoft.com`) and Teams Personal (`teams.live.com`)

## Requirements

- **Google Chrome 116 or later** (uses the Document Picture-in-Picture API)
- A Microsoft Teams tab with an active meeting

## Installation

1. Download or clone this repository:

   ```bash
   git clone https://github.com/YOUR_USERNAME/teams-floating-controls.git
   ```

2. Open Chrome and navigate to `chrome://extensions/`

3. Enable **Developer mode** (toggle in the top-right corner)

4. Click **Load unpacked** and select the project folder

5. The extension icon will appear in your toolbar. Pin it for easy access.

## Usage

1. Join a meeting in Microsoft Teams

2. Click the **Teams Floating Controls** icon in your toolbar

3. Click **Open floating controls**

4. A small window will appear showing the active speaker's camera feed with controls at the bottom:

   | Button | Action |
   |--------|--------|
   | Microphone | Toggle mute / unmute |
   | Hand | Raise or lower your hand |
   | Phone | Leave the meeting (with confirmation) |
   | Cam / Screen | Switch between camera view and screen share |

5. If you click the extension icon while the floating window is already open, it will raise the floating window to the front. If you're on a different tab, it will switch back to the Teams tab.

## Architecture

```
teams-floating-controls/
├── manifest.json       # Extension manifest (Manifest V3)
├── background.js       # Service worker — tracks the PiP window ID, handles focus
├── content.js          # Injected into Teams tabs — core engine
├── popup.html          # Extension popup UI
├── popup.js            # Popup logic — finds Teams tab, sends commands
└── icons/              # Extension icons (16, 48, 128px)
```

### Components

**Content Script** (`content.js`) — The core of the extension. Injected into Teams pages, it:

- Queries the Teams DOM to find mute, leave, and raise-hand buttons using multiple fallback selectors (data-tid attributes and aria-labels)
- Detects video streams on the page using a 3-tier strategy (see below)
- Opens and manages the Document PiP window, building the entire UI (HTML + CSS) inside it
- Polls every second to keep the floating window in sync with the actual meeting state

**Background Service Worker** (`background.js`) — Tracks the OS-level window ID of the PiP popup so it can be raised to the front via `chrome.windows.update()`, which works even when JavaScript `window.focus()` is blocked.

**Popup** (`popup.html` / `popup.js`) — A compact UI that finds a Teams tab (active first, then scans all tabs), queries the meeting status, and either opens the PiP window or focuses it if already open.

### Communication Flow

```
Popup ──(get-status)──▶ Content Script ──▶ Teams DOM
Popup ──(open-pip)────▶ Content Script ──▶ Document PiP API
Content Script ──(pip-about-to-open)──▶ Background (tracks window)
Content Script ──(pip-closed)──────────▶ Background (clears tracking)
Popup ──(focus-pip-window)─────────────▶ Background ──▶ chrome.windows.update()
```

### Screen Share Detection

The extension uses a 3-tier strategy to tell participant cameras apart from screen shares:

1. **`displaySurface` API** — The browser exposes this on `MediaStreamTrack.getSettings()` when a local screen capture is active. Most reliable when the local user is sharing.

2. **DOM ancestry scan** — Walks up the DOM from each `<video>` element looking for Teams container markers (`aria-label`, `data-tid`, or `id` attributes containing "screen", "content", or "sharing"). Catches remote screen shares.

3. **Resolution heuristic** — Fallback: if a video stream is ≥1280px wide with an aspect ratio >1.55, it's likely a screen share rather than a camera feed.

### Selector Resilience

Teams frequently updates its UI. Each button has 3 fallback selectors to handle changes:

```javascript
mute:      '[data-tid="toggle-mute"]',  'button[aria-label*="Unmute" i]',  'button[aria-label*="Mute" i]'
leave:     '[data-tid="hangup-button"]', 'button[aria-label*="Leave" i]',   'button[aria-label*="End call" i]'
raiseHand: '[data-tid="raise-hand-button"]', ...'
```

## Permissions

| Permission | Why it's needed |
|------------|-----------------|
| `activeTab` | Access the current Teams tab to communicate with the content script |
| `scripting` | Inject content scripts into Teams tabs on demand |
| `tabs` | Find Teams tabs across all windows |
| `windows` | Focus the PiP window and its parent Teams window via `chrome.windows.update()` |
| `host_permissions` | Limit script injection to Teams domains only (`teams.microsoft.com`, `teams.live.com`) |

## Troubleshooting

- **"No active meeting detected"** — Make sure you've joined a call (not just opened Teams). The extension looks for the mute/leave buttons in the DOM to confirm you're in a meeting.
- **"Document Picture-in-Picture requires Chrome 116 or later"** — Update Chrome to the latest version.
- **"Cannot reach Teams page"** — Try reloading the Teams tab. The content script needs to be loaded to communicate.
- **No video in the floating window** — Ensure at least one participant has their camera on. If no video is available, a "No camera" placeholder is shown.
- **Screen share not appearing** — The Screen toggle is disabled when no screen share is detected. It will enable automatically when someone starts sharing.

## License

[Add your license here]
