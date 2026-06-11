# Phase 4 — Audio Overhaul (Implementation Guide)

**Goal:** replace the sine drone with a procedural music loop that scales with intensity, plus layered SFX and ducking. No audio assets — everything is generated with the Web Audio API. Estimated effort: ~1 day. Requires Phase 1 (audio lifecycle).

Recommended: move all audio code into a clearly-marked section (or `audio.js` if you've split modules) with this internal API:

```js
music.start() / music.stop() / music.setIntensity(level)  // level 0..2
sfx.flap() sfx.score(combo) sfx.powerup(type) sfx.death() sfx.comboMilestone(combo) sfx.coin()
duck()  // sidechain-style dip
```

---

## Step 4.1 — Master gain graph

1. Build a small node graph once, when `audioCtx` is created in `ensureAudio()`:

   ```js
   let masterGain, musicGain, sfxGain;

   function buildAudioGraph() {
     masterGain = audioCtx.createGain();
     musicGain = audioCtx.createGain();
     sfxGain = audioCtx.createGain();
     musicGain.gain.value = 0.5;
     sfxGain.gain.value = 1.0;
     musicGain.connect(masterGain);
     sfxGain.connect(masterGain);
     masterGain.connect(audioCtx.destination);
   }
   ```

2. Route every existing `beep()` through `sfxGain` instead of `audioCtx.destination`. Delete `startAmbient()`/`ambientGain`/`ambientOsc` — the sequencer replaces them.

---

## Step 4.2 — Procedural music sequencer

A lookahead scheduler (the standard Web Audio pattern: a `setInterval` that schedules notes slightly ahead on the audio clock, so timing is sample-accurate even if the main thread hiccups).

1. Musical data — a chill 4-chord loop in A minor, 8 steps per bar:

   ```js
   const BPM = 92;
   const STEP_DUR = 60 / BPM / 2;            // 8th notes
   // chord roots (Hz): Am, F, C, G — one chord per bar
   const CHORDS = [
     [220.0, 261.6, 329.6],  // A3 C4 E4
     [174.6, 220.0, 261.6],  // F3 A3 C4
     [130.8, 164.8, 196.0],  // C3 E3 G3
     [196.0, 246.9, 293.7],  // G3 B3 D4
   ];
   ```

2. The scheduler:

   ```js
   const music = { timer: null, step: 0, nextTime: 0, intensity: 0 };

   music.start = () => {
     if (music.timer || muted || !audioCtx) return;
     music.step = 0;
     music.nextTime = audioCtx.currentTime + 0.1;
     music.timer = setInterval(() => {
       while (music.nextTime < audioCtx.currentTime + 0.12) {
         scheduleStep(music.step, music.nextTime);
         music.nextTime += STEP_DUR;
         music.step = (music.step + 1) % 32;     // 4 bars × 8 steps
       }
     }, 25);
   };

   music.stop = () => { clearInterval(music.timer); music.timer = null; };
   music.setIntensity = (n) => { music.intensity = n; };
   ```

3. One scheduled step (~the whole "composition"):

   ```js
   function note(freq, t, dur, type, gain, dest = musicGain) {
     const osc = audioCtx.createOscillator();
     const vol = audioCtx.createGain();
     osc.type = type;
     osc.frequency.value = freq;
     vol.gain.setValueAtTime(0.0001, t);
     vol.gain.exponentialRampToValueAtTime(gain, t + 0.02);
     vol.gain.exponentialRampToValueAtTime(0.0001, t + dur);
     osc.connect(vol); vol.connect(dest);
     osc.start(t); osc.stop(t + dur + 0.05);
   }

   function scheduleStep(step, t) {
     const chord = CHORDS[Math.floor(step / 8)];
     if (step % 8 === 0) note(chord[0] / 2, t, STEP_DUR * 7, "triangle", 0.05);    // bass, every bar
     if (step % 4 === 2) note(chord[0], t, STEP_DUR * 2, "sine", 0.022);           // pad pulse
     if (music.intensity >= 1)                                                      // arpeggio layer
       note(chord[step % 3] * 2, t, STEP_DUR * 0.9, "square", 0.012);
     if (music.intensity >= 2 && step % 2 === 0)                                    // hi "tick" layer
       note(2200 + (step % 4) * 180, t, 0.03, "square", 0.008);
   }
   ```

4. Wire it in: `music.start()` when a run starts (in `resetWorld(true)`), `music.stop()` on game over and pause (restart on resume). In `updatePlaying()` set intensity from progress:

   ```js
   music.setIntensity(score >= 40 ? 2 : score >= 20 ? 1 : 0);
   ```

   `toggleMute()` already suspends the context (Phase 1) — also call `music.stop()`/`music.start()` there so the interval doesn't spin while muted.

**Verify:** start a run → bass + pad loop, seamless. At score 20 an arpeggio joins; at 40 a high tick layer. Pause/mute are silent and don't drift the loop.

---

## Step 4.3 — Layered SFX

1. **Noise buffer** (shared, built once) for whooshes/impacts:

   ```js
   let noiseBuf;
   function getNoise() {
     if (!noiseBuf) {
       noiseBuf = audioCtx.createBuffer(1, audioCtx.sampleRate * 0.3, audioCtx.sampleRate);
       const d = noiseBuf.getChannelData(0);
       for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
     }
     return noiseBuf;
   }

   function noiseHit(t, dur, gain, filterFreq) {
     const src = audioCtx.createBufferSource();
     src.buffer = getNoise();
     const f = audioCtx.createBiquadFilter();
     f.type = "lowpass"; f.frequency.value = filterFreq;
     const vol = audioCtx.createGain();
     vol.gain.setValueAtTime(gain, t);
     vol.gain.exponentialRampToValueAtTime(0.0001, t + dur);
     src.connect(f); f.connect(vol); vol.connect(sfxGain);
     src.start(t); src.stop(t + dur);
   }
   ```

2. **Flap** — noise whoosh + pitch sweep (replaces the plain 520 Hz beep in `flap()`):

   ```js
   sfx.flap = () => {
     const t = audioCtx.currentTime;
     noiseHit(t, 0.08, 0.05, 1200);
     const osc = audioCtx.createOscillator(); const vol = audioCtx.createGain();
     osc.type = "triangle";
     osc.frequency.setValueAtTime(420, t);
     osc.frequency.exponentialRampToValueAtTime(780, t + 0.07);  // upward sweep
     vol.gain.setValueAtTime(0.03, t);
     vol.gain.exponentialRampToValueAtTime(0.0001, t + 0.09);
     osc.connect(vol); vol.connect(sfxGain); osc.start(t); osc.stop(t + 0.1);
   };
   ```

3. **Power-up jingles** — 3-note motifs (use `note()` with `dest = sfxGain`), one identity per type:
   - shield: rising 4ths `[440, 587, 880]`
   - slow: falling `[660, 495, 330]`, longer notes (matches time slowing)
   - shrink: quick chirp `[590, 740, 880]`
   - bonus: keep the bright 880 square, add a 1320 ping 60 ms later
   Schedule each note 90 ms apart in `activatePowerup()`.

4. **Combo milestone fanfare** — pitch rises with combo: at combo 5/10/20 play `[523, 659, 784, 1047]` (major arpeggio) transposed up `combo / 5` semitone steps (`freq * 2 ** (n / 12)`), 70 ms apart.

5. **Death sting** — in `crash()`: `noiseHit(t, 0.25, 0.08, 500)` + two descending sawtooth notes `note(220→110)`. Ground thud in `updateDying()`: `noiseHit(t, 0.12, 0.07, 300)`.

6. **Score blip** — keep today's 760/960 sine blips, but raise pitch slightly with combo: `760 * 2 ** (Math.min(combo, 12) / 24)` so streaks audibly "climb".

**Verify:** each power-up is identifiable with eyes closed; streaks rise in pitch; death has weight.

---

## Step 4.4 — Music ducking

```js
function duck() {
  if (!musicGain) return;
  const t = audioCtx.currentTime;
  musicGain.gain.cancelScheduledValues(t);
  musicGain.gain.setValueAtTime(0.25, t);                 // dip to 50% of 0.5
  musicGain.gain.linearRampToValueAtTime(0.5, t + 0.35);  // recover
}
```

Call `duck()` in `crash()` (both shield-break and fatal) and on combo fanfares.

**Verify:** death sting reads clearly over the music, music swells back in ~⅓ s.

---

## Acceptance checklist

- [ ] Music loops seamlessly at 92 BPM; layers add at score 20 / 40.
- [ ] No `setInterval` running while muted, paused, or on the menu.
- [ ] Flap, score, 4 power-ups, combo fanfare, death all have distinct sounds.
- [ ] Ducking on death/fanfares; no clipping (master peaks comfortably below 0 dBFS — keep summed gains ≤ ~0.15).
- [ ] iOS Safari: audio starts only after first user gesture (already handled by `ensureAudio()` in `inputStart()` — don't regress this).
