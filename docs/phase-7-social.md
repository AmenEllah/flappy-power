# Phase 7 — Social & Share Polish (Implementation Guide)

**Goal:** image share cards instead of plain text, and a local top-10 leaderboard on the game-over screen. Estimated effort: ~half a day. Requires Phase 3 (sprites/biomes look good on the card) and Phase 6 (save object, daily mode) for full effect, but degrades gracefully without them.

---

## Step 7.1 — Share card image

Replace the text-only `shareScore()` with a rendered card + file share, falling back progressively.

1. Render the card to an offscreen canvas (1200×630 — standard OG-image ratio, looks right in every chat app):

   ```js
   function renderShareCard() {
     const c = document.createElement("canvas");
     c.width = 1200; c.height = 630;
     const s = c.getContext("2d");

     // 1. Background: current biome sky gradient, full bleed
     const biome = BIOMES[biomeIndex()];
     const sky = s.createLinearGradient(0, 0, 0, 630);
     biome.sky.forEach((col, i) => sky.addColorStop(i / (biome.sky.length - 1), col));
     s.fillStyle = sky; s.fillRect(0, 0, 1200, 630);

     // 2. Decorations: a few cloud sprites + ground strip (reuse Phase 3 sprites, scaled up)
     s.drawImage(cloudSprites[0], 80, 70, 240, 150);
     s.drawImage(cloudSprites[1], 860, 120, 200, 125);
     s.fillStyle = biome.ground?.[0] ?? "#f59e0b"; s.fillRect(0, 560, 1200, 70);

     // 3. Bird portrait: current skin sprite, big, slight tilt
     s.save(); s.translate(950, 330); s.rotate(-0.12);
     s.drawImage(birdSprite(selectedSkin, 1), -130, -130, 260, 260);
     s.restore();

     // 4. Text block
     s.fillStyle = "rgba(15,23,42,.55)"; s.fillRect(0, 0, 640, 630);
     s.fillStyle = "#fff"; s.textAlign = "left";
     s.font = "900 64px system-ui";  s.fillText("Flappy Power", 70, 130);
     s.font = "900 200px system-ui"; s.fillText(String(score), 70, 360);
     s.font = "700 40px system-ui";  s.fillStyle = "#fde68a";
     s.fillText(dailyMode ? `Daily #${dayNumber()}` : `Best: ${best}`, 70, 440);
     s.font = "600 30px system-ui";  s.fillStyle = "rgba(255,255,255,.85)";
     s.fillText(`${biome.name} · ${skin().name} bird`, 70, 500);
     s.fillText(location.host + location.pathname, 70, 570);
     return c;
   }
   ```

   (Without Phase 3, draw the procedural bird/cloud directly to `s` — same code as today's `drawBird` body at a larger scale.)

2. Share with progressive fallback:

   ```js
   async function shareScore(event) {
     event?.preventDefault?.();
     const text = dailyMode
       ? `Flappy Power Daily #${dayNumber()}: ${score} pts 🐤`
       : `I scored ${score} in Flappy Power! 🐤`;
     try {
       const blob = await new Promise((res) => renderShareCard().toBlob(res, "image/png"));
       const file = new File([blob], "flappy-power.png", { type: "image/png" });

       if (navigator.canShare?.({ files: [file] })) {            // 1) image share (mobile)
         await navigator.share({ files: [file], title: "Flappy Power", text });
       } else if (navigator.clipboard?.write && window.ClipboardItem) { // 2) image to clipboard (desktop)
         await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
         showMessage("Score card copied!", 90);
       } else if (navigator.share) {                              // 3) text share
         await navigator.share({ title: "Flappy Power", text, url: location.href });
       } else {                                                   // 4) text to clipboard
         await navigator.clipboard.writeText(`${text} ${location.href}`);
         showMessage("Score copied!", 90);
       }
     } catch (_) {} // user canceled the share sheet — not an error
   }
   ```

3. Gotchas:
   - `navigator.share({ files })` must run in the same user-gesture tick — don't `await` anything *before* `toBlob` finishes if Safari complains; pre-render the card at the moment of death (cache it on the gameover transition) so the button handler only blobs+shares.
   - `ClipboardItem` is gated behind HTTPS — already satisfied by the PWA requirement.

**Verify:** on Android/iOS the share sheet shows the image; on desktop Chrome the PNG lands in the clipboard (paste into a chat to confirm); with all APIs blocked it still copies text.

---

## Step 7.2 — Local leaderboard (run history)

1. Record every run at the fatal-crash point:

   ```js
   function recordRun() {
     save.runs = save.runs || [];
     save.runs.push({ score, coins: runCoins, date: Date.now(), diff: difficultyKey, daily: dailyMode });
     save.runs.sort((a, b) => b.score - a.score);
     save.runs = save.runs.slice(0, 10);          // keep top 10
     persist();
   }
   ```

2. Display on the game-over overlay, below the NEW BEST badge area: a compact 5-row table (rank, score, difficulty letter, relative date). The panel is 300 px tall — shrink the subtitle to one line and use 16 px rows:

   ```js
   const rows = save.runs.slice(0, 5);
   ctx.font = "700 12px system-ui"; ctx.textAlign = "left";
   rows.forEach((r, i) => {
     const isThis = r.date === lastRunDate;       // highlight the run just played
     ctx.fillStyle = isThis ? "#f97316" : "#475569";
     ctx.fillText(`${i + 1}. ${r.score} pts`, 60, 240 + i * 17);
     ctx.textAlign = "right";
     ctx.fillText(`${r.diff[0].toUpperCase()} · ${relDate(r.date)}`, W - 60, 240 + i * 17);
     ctx.textAlign = "left";
   });
   ```

   `relDate`: "now", "2h", "3d" — `const m = (Date.now() - t) / 60000; ...`.

3. Highlight: store `lastRunDate = Date.now()` in `recordRun()` so the just-finished run glows orange in the table — instant "I'm rank 3!" feedback.

4. If Phase 6's save object isn't in yet, store under its own key `flappy-power-runs` with the same shape.

**Verify:** finish several runs at different scores → table ranks them, current run highlighted, persists across reloads, never exceeds 10 entries.

---

## Acceptance checklist

- [ ] Share produces a 1200×630 PNG card with score, skin, biome, and (daily) day number.
- [ ] Four-level fallback chain works: file share → image clipboard → text share → text clipboard.
- [ ] Share never throws on user cancel.
- [ ] Game-over screen shows top-5 with the fresh run highlighted; top-10 persisted.
