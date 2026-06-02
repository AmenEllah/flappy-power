# Flappy Power

A mobile-friendly Flappy Bird-style HTML5 Canvas game built from `flappy-game-guide.md`.

## What is included

- Responsive 400 × 600 canvas with crisp fixed-resolution game math
- Fixed timestep game loop
- Bird physics with buffered flap input, cooldown, and hold boost
- Pipes, collision detection, scoring, persistent best score, and progressive difficulty
- Power-ups: shield, slow time, bonus points, and shrink mode
- Combo feedback, run missions, stronger particles, parallax background, and night shift at higher scores
- Unlockable bird skins: every 10 best-score points unlocks one new skin
- Skin selector on the menu/game-over screen
- Menu, playing, paused, and game-over states
- Mobile-friendly tap controls plus keyboard controls
- Fullscreen, mute, pause/resume, and share-score buttons
- PWA manifest and service worker for “Add to Home Screen” support
- Lightweight generated Web Audio sound effects

## Run locally

From this folder:

```bash
python3 -m http.server 4173
```

Then open:

```text
http://127.0.0.1:4173/
```

The game can also open directly from `index.html`, but PWA/offline features require serving it over HTTP/HTTPS.

## Controls

- `Space`, `ArrowUp`, or `W` to flap
- Click/tap the canvas to flap
- Hold briefly after a flap for a softer boost
- `P` or the **Pause** button to pause/resume
- `M` or the **Sound** button to mute/unmute
- Tap an unlocked skin on the menu/game-over screen to select it
- After game over, press/click/tap again to restart

## Unlockable skins

Your best score unlocks skins permanently in local storage:

- 0 points: Sunny
- 10 points: Bubble
- 20 points: Mint
- 30 points: Rose
- 40 points: Violet
- 50 points: Cyber
- 60 points: Lava
- 70 points: Ghost

## Play on phone

Open the GitHub Pages URL on your phone. Then use your browser’s “Add to Home Screen” option to install it like a small app.

## Deploy

This is a static site. Deploy the whole folder to any static host such as GitHub Pages, Netlify, Vercel, or Cloudflare Pages.
