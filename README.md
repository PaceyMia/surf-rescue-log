# 🌊 Surf Rescue 30 — Patrol Log App

A mobile-first web app for surf lifesaving patrols to record, review, and share a duty log entirely by voice — no typing, no paper, no internet connection required.

---

## Description

**Surf Rescue 30 Patrol Log** is a lightweight, single-page app built with plain HTML, CSS, and JavaScript. It is designed to be opened on a phone at the start of a patrol shift and used hands-free throughout the day. Lifesavers tap one large button, speak their observation, and the entry is automatically timestamped, formatted, and saved — ready to be compiled into an end-of-shift report and shared directly to email, notes, or any messaging app on the device.

The app requires no installation, no account, and no internet connection after the page has loaded.

---

## ✨ Key Features

### 🎙️ Voice Dictation via Web Speech API
Uses the browser's built-in [Web Speech API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Speech_API) for continuous speech recognition. Tap **Log Entry** to start recording — the microphone stays open across natural pauses — then tap **Stop & Save Entry** when you're done. No fiddling with microphone settings or third-party services.

### 💾 Automatic Local Storage Saving
Every entry is saved to the device's `localStorage` the instant it is recorded. If the screen locks, the browser refreshes, or you switch apps mid-patrol, all entries are fully restored when you return. Nothing is ever lost.

### 🕐 Automatic Timestamps
Each log entry is stamped with the exact local time and date it was saved. Timestamps are generated from the device clock and require no manual input.

### ✍️ Smart Auto-Formatting
Transcribed text is automatically cleaned up before saving — the first letter is capitalised and a full stop is added if the sentence doesn't already end in punctuation.

### 👆 Swipe to Delete
Individual log entries can be deleted by swiping them left or right. A confirmation prompt prevents accidental deletion. Confirmed deletions are removed from the screen and from `localStorage` simultaneously.

### 📤 End-of-Shift Report via Web Share API
Tap **End of Shift** to compile all entries into a clean, timestamped text report. On mobile, the device's native share sheet opens automatically via the [Web Share API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Share_API), letting you send the report to any app on your phone — email, notes, Google Docs, WhatsApp, and more. On desktop browsers that don't support the Web Share API, the report automatically downloads as a `.txt` file instead.

### 🌊 New Patrol — One-Tap Reset
Tap **New Patrol** at the start of a fresh shift. After a confirmation prompt, the log is cleared from the screen and wiped from `localStorage`, ready for a new session.

### 📱 Mobile-First Responsive Design
- Fits exactly on one screen — nothing scrolls except the log entries themselves
- Fixed header, buttons, and footer so controls are always reachable
- Large tap targets designed for wet or sandy fingers
- High-contrast colour scheme (red, yellow, and navy) for readability in direct sunlight
- Uses `height: 100dvh` to correctly account for mobile browser chrome on iOS and Android

---

## 🖥️ Browser Support

| Browser | Voice Dictation | Share Sheet |
|---|---|---|
| Chrome (Android) | ✅ | ✅ |
| Edge (Android / Desktop) | ✅ | ✅ |
| Safari (iOS 16.4+) | ✅ | ✅ |
| Chrome (Desktop) | ✅ | ⬇️ Downloads .txt |
| Firefox | ❌ | ⬇️ Downloads .txt |

> **Note:** The Web Speech API requires the page to be served over **HTTPS** or `localhost`. It will not work when opened directly as a `file://` path on mobile. Use [VS Code Live Server](https://marketplace.visualstudio.com/items?itemName=ritwickdey.LiveServer), [GitHub Pages](https://pages.github.com/), or any static web host.

---

## 🚀 How to Use

### Getting Started
1. Open `index.html` in a supported browser (Chrome or Edge recommended).
2. Allow microphone access when prompted.
3. The live clock in the header confirms the app is running.

---

### Recording a Log Entry
1. Tap the green **🎙️ Log Entry** button at the bottom of the screen.
2. The button turns red and displays **⏹️ Stop & Save Entry** — the microphone is now open.
3. Speak your observation clearly. You can pause mid-sentence; the microphone stays on.
4. Tap **⏹️ Stop & Save Entry** when you have finished speaking.
5. The entry appears immediately in the **Running Log** with a timestamp.

---

### Deleting an Entry
1. Find the entry you want to remove in the Running Log.
2. Swipe it left or right.
3. A confirmation prompt will appear — tap **OK** to delete, or **Cancel** to snap it back.

---

### Starting a New Patrol
1. Tap **🌊 New Patrol** at the top of the screen.
2. Confirm the prompt: *"Are you sure you want to start a new patrol? This will clear the current log."*
3. The log is cleared and reset, ready for a fresh shift.

---

### Sharing the End-of-Shift Report
1. Tap **📋 End of Shift** at the top of the screen.
2. On mobile, your phone's share sheet opens — choose any app to send the report (Email, Notes, WhatsApp, Google Docs, etc.).
3. On desktop, a `.txt` file named `Surf_Log_DD-MM-YYYY.txt` downloads automatically.

---

## 📁 Project Structure

```
Surf Patrol Log App/
├── index.html   — App structure and layout
├── style.css    — All styling, responsive rules, and animations
├── script.js    — Speech recognition, log management, localStorage, and share logic
└── README.md    — This file
```

---

## 🛠️ Local Development

No build tools or dependencies required.

1. Clone or download this repository.
2. Open the folder in [VS Code](https://code.visualstudio.com/).
3. Install the [Live Server extension](https://marketplace.visualstudio.com/items?itemName=ritwickdey.LiveServer).
4. Right-click `index.html` → **Open with Live Server**.
5. The app opens at `http://127.0.0.1:5500` — microphone and share features work immediately.

---

*Built for Surf Rescue 30. No frameworks. No dependencies. Just the web platform.*
