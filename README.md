# Teams Floating Controls

A Chrome extension that keeps your Microsoft Teams meeting visible across all tabs using a floating Picture-in-Picture window with full meeting controls.

> [Add a screenshot or GIF here showing the floating PiP window over other tabs]

## The Problem

When you're in a Teams meeting and switch to another tab, you lose sight of the call. Unlike Google Meet, Teams doesn't offer a built-in way to keep the meeting visible while working in other tabs.

## The Solution

This extension opens a small floating window that stays on top of everything, showing the active speaker's camera (or screen share) with controls for mute, raise hand, leave, and pin-to-top. You can switch between viewing the camera feed, screen share, and participant list with a single click.

## Features

- **Always-on-top floating window** using Chrome's Document Picture-in-Picture API
- **Meeting controls** directly in the floating window: mute/unmute, raise/lower hand, leave call
- **Pin to top** -- keeps the PiP window above all other windows with automatic re-focus
- **Live status indicator** showing whether you're live or muted
- **Meeting title** displayed in the PiP window header
- **Call duration timer** showing elapsed time since joining
- **Camera / Screen / Participants toggle** to switch between participant video, shared content, and participant list
- **Participant count badge** when multiple people have their cameras on
- **Smart screen share detection** with a 3-tier strategy to distinguish screen shares from camera feeds
- **SVG icons** that update dynamically with mute and hand state
- **Keyboard shortcut** -- press `Alt+P` to toggle the PiP window from any tab
- **Auto-open** -- optionally opens PiP automatically when you join a meeting
- **Options page** -- configure PiP window size, default view, and auto-open behavior
- **Extension popup** with one-click access and status overview
- **Works with both** Teams for Business (`teams.microsoft.com`) and Teams Personal (`teams.live.com`)

## Requirements

- **Google Chrome 116 or later** (uses the Document Picture-in-Picture API)
- A Microsoft Teams tab with an active meeting

## Installation

1. Download or clone this repository:

   ```bash
   git clone https://github.com/fafugg/teams-floating-controls.git
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
   | Pin | Pin the window on top of all other windows |
   | Cam / Screen / Participants | Switch between camera view, screen share, and participant list |

5. If you click the extension icon while the floating window is already open, it will raise the floating window to the front. If you're on a different tab, it will switch back to the Teams tab.

6. Press `Alt+P` to toggle the PiP window from any Teams tab.

7. Right-click the extension icon and select **Options** to configure window size, default view, and auto-open behavior.

## Architecture

```
teams-floating-controls/
├── manifest.json              # Extension manifest (Manifest V3)
├── background.js              # Service worker -- tracks PiP window ID, keyboard shortcuts, focus
├── content.js                 # Thin orchestrator -- message routing, autoOpen polling
├── popup.html / popup.js      # Extension popup UI
├── options.html / options.js  # Settings page (PiP size, auto-open, default view)
├── lib/
│   ├── selectors.js           # DOM selectors with fallbacks for Teams UI variants
│   ├── meeting-state.js       # Detect mute, hand, and meeting state from the DOM
│   ├── stream-detection.js    # Detect video streams, screen shares, dominant speaker
│   ├── pip-ui.js              # Build and sync the PiP window UI (icons, title, duration)
│   └── pip-window.js          # PiP window lifecycle, MutationObserver-based syncing
├── icons/                     # Extension icons (16, 48, 128px PNG + SVG meeting controls)
├── tests/                     # Unit tests (Node built-in test runner)
└── pip-styles.css             # Styles for the PiP window
```

### Modules

**Selectors** (`lib/selectors.js`) -- Defines CSS selector arrays with progressive fallbacks for mute, leave, and raise-hand buttons. The `find()` function tries each selector in order and returns the first match.

**Meeting State** (`lib/meeting-state.js`) -- Reads the Teams DOM to determine mute state (`muted` / `unmuted` / `unknown`), hand state (`raised` / `lowered` / `unknown`), and whether the user is in a meeting.

**Stream Detection** (`lib/stream-detection.js`) -- Uses a 3-tier strategy to detect video streams and distinguish screen shares from camera feeds. Also identifies the dominant speaker and extracts participant names.

**PiP UI** (`lib/pip-ui.js`) -- Builds the PiP window UI by loading CSS and HTML templates. Attaches event listeners for all controls and runs `syncPiP()` to keep button states, video elements, meeting title, and duration in sync with the actual meeting state.

**PiP Window** (`lib/pip-window.js`) -- Manages the Document PiP window lifecycle: opening via `documentPictureInPicture.requestWindow()`, closing, and setting up a MutationObserver with 5-second safety-net polling to sync DOM changes.

**Content Script** (`content.js`) -- Thin orchestrator that routes messages between the background/popup and the lib modules. Also runs auto-open polling to automatically open PiP when a meeting starts (if enabled in settings).

**Background Service Worker** (`background.js`) -- Tracks the OS-level window ID of the PiP popup for reliable focus control. Handles keyboard shortcuts (`Alt+P`) and routes messages between components.

**Popup** (`popup.html` / `popup.js`) -- Finds a Teams tab (active first, then scans all tabs), ensures the content script is injected, queries meeting status, and either opens the PiP window or focuses it if already open.

**Options** (`options.html` / `options.js`) -- Settings page for configuring PiP window dimensions, default view (auto/camera/screen/participants), and auto-open behavior.

### Communication Flow

```
Popup --(get-status)------> Content Script --> Teams DOM
Popup --(open-pip)--------> Content Script --> Document PiP API
Popup --(focus-pip-window)> Background -----> chrome.windows.update()
Content Script --(pip-about-to-open)--> Background (tracks window)
Content Script --(pip-window-ready)---> Background (validates window ID)
Content Script --(pip-closed)----------> Background (clears tracking)
Content Script --(get-pip-window-id)---> Background (for pin-to-top)
```

### Screen Share Detection

The extension uses a 3-tier strategy to tell participant cameras apart from screen shares:

1. **`displaySurface` API** -- The browser exposes this on `MediaStreamTrack.getSettings()` when a local screen capture is active. Most reliable when the local user is sharing.

2. **DOM ancestry scan** -- Walks up the DOM from each `<video>` element looking for Teams container markers (`aria-label`, `data-tid`, or `id` attributes containing "screen", "content", or "sharing"). Catches remote screen shares.

3. **Resolution heuristic** -- Fallback: if a video stream is >=1280px wide with an aspect ratio >1.55, it's likely a screen share rather than a camera feed.

### Selector Resilience

Teams frequently updates its UI. Each button has multiple fallback selectors to handle changes:

```javascript
mute:      '[data-tid="toggle-mute"]', 'button[aria-label*="Unmute" i]', 'button[aria-label*="Mute" i]'
leave:     '[data-tid="hangup-button"]', 'button[aria-label*="Leave" i]', 'button[aria-label*="End call" i]'
raiseHand: '#raisehands-button', 'button[data-inp="raisehands-button"]', '[data-tid="raise-hand-button"]', ...
```

## Permissions

| Permission | Why it's needed |
|------------|-----------------|
| `activeTab` | Access the current Teams tab to communicate with the content script |
| `scripting` | Inject content scripts into Teams tabs on demand |
| `tabs` | Find Teams tabs across all windows |
| `windows` | Focus the PiP window and its parent Teams window via `chrome.windows.update()` |
| `storage` | Persist user settings (PiP size, auto-open, default view) |
| `host_permissions` | Limit script injection to Teams domains only (`teams.microsoft.com`, `teams.live.com`) |

## Troubleshooting

- **"No active meeting detected"** -- Make sure you've joined a call (not just opened Teams). The extension looks for the mute/leave buttons in the DOM to confirm you're in a meeting.
- **"Document Picture-in-Picture requires Chrome 116 or later"** -- Update Chrome to the latest version.
- **"Cannot reach Teams page"** -- Try reloading the Teams tab. The content script needs to be loaded to communicate.
- **No video in the floating window** -- Ensure at least one participant has their camera on. If no video is available, a "No camera" placeholder is shown.
- **Screen share not appearing** -- The Screen toggle is disabled when no screen share is detected. It will enable automatically when someone starts sharing.
- **Raise hand button not working** -- The raise hand button may be collapsed into the Teams toolbar overflow menu. The extension tries multiple selectors but cannot click buttons that aren't rendered in the DOM.

## License

MIT License - do whatever you want, hope it helps
