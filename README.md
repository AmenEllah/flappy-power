# Flappy Power

A Flappy Bird-style HTML5 Canvas game built from `flappy-game-guide.md`.

## What is included

- Responsive 400 × 600 canvas with crisp fixed-resolution game math
- Fixed timestep game loop
- Bird physics with buffered flap input, cooldown, and hold boost
- Pipes, collision detection, scoring, and persistent best score
- Power-ups: shield, slow time, bonus points, and shrink mode
- Menu, playing, and game-over states
- Mobile-friendly tap controls plus keyboard controls
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

Controls:

- `Space`, `ArrowUp`, or `W` to flap
- Click/tap to flap
- Hold briefly after a flap for a softer boost
- After game over, press/click/tap again to restart

## Deploy

This is a static site. Deploy the whole folder to any static host such as GitHub Pages, Netlify, Vercel, or Cloudflare Pages.
