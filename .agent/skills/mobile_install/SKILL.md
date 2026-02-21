---
name: mobile_install
description: How to install the OkBrain app on a mobile phone as a PWA or iPhone shortcut.
---

# Mobile Install

OkBrain is a Progressive Web App (PWA), which means it can be installed on your phone's home screen and used like a native app.

## Step 1: Make the App Accessible via a Domain

Your phone needs to reach the app over the network. You have two options:

**Option A: Deploy to a VM/Server**
Follow the [Deploy skill](.agent/skills/deploy/SKILL.md) to run the app on a server with a real domain name.

**Option B: Use ngrok (for local dev)**
If you're running the app locally and want to test on your phone without deploying:

1. Install ngrok: https://ngrok.com/download
2. Build and start the app in production mode:
   ```bash
   npm run build
   npm start
   ```
3. If you use RAG features (semantic search), make sure Ollama is running and the embedding model is downloaded:
   ```bash
   ollama serve
   ollama pull nomic-embed-text:v1.5
   ```
4. In another terminal, expose the app: `ngrok http 3000`
5. ngrok will give you a public URL like `https://abc123.ngrok.io` — use that on your phone

> Note: Free ngrok URLs are temporary and change each session. For a stable URL, you can pay for an ngrok plan and assign a custom/fixed domain. For fully permanent access, use Option A.

> Note: Ollama runs locally and is not exposed via ngrok. RAG-based features will work as long as the app server and Ollama are on the same machine.

## Step 2: Install as a PWA (Home Screen App)

### On iPhone / iPad (Safari)

1. Open Safari and navigate to your OkBrain URL
2. Log in if prompted
3. Tap the **Share** button (the box with an arrow pointing up) at the bottom of the screen
4. Scroll down and tap **"Add to Home Screen"**
5. Give it a name (e.g., "OkBrain") and tap **Add**

The app icon will appear on your home screen. Tapping it opens OkBrain in a full-screen app experience without the browser UI.

### On Android (Chrome)

1. Open Chrome and navigate to your OkBrain URL
2. Log in if prompted
3. Tap the **three-dot menu** (⋮) in the top-right corner
4. Tap **"Add to Home screen"** (or "Install app" if shown)
5. Confirm by tapping **Add**

The OkBrain icon will appear on your home screen just like a native app.

## Step 3: Add to iPhone Action Button (Optional)

The iPhone Action Button (available on iPhone 15 Pro and later) can be configured to open OkBrain instantly via a Safari Web View shortcut.

1. Open the **Shortcuts** app on your iPhone
2. Tap **+** to create a new shortcut
3. Tap **Add Action** and search for **"Show Web View"** (under Safari)
4. Enter your OkBrain URL (e.g., `https://yourdomain.com`)
5. Tap the shortcut name at the top and rename it to "OkBrain"
6. Go to **Settings → Action Button**
7. Swipe to select **Shortcut**, then choose your "OkBrain" shortcut
8. Press the Action Button to launch OkBrain directly in Safari

> Tip: If you want it to open in full-screen mode, use the PWA home screen icon from Step 2 in the shortcut instead — search for "Open App" and select the OkBrain home screen app.


