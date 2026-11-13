# Prompt for Claude Design: UI, UX and flow round v3 (prompt-first)

Paste everything below the line into Claude Design. Attach: screenshots of the current app
(Studio/Import, Draft, Refine, Deliver), the approved design canvas from the last round, and
`docs/ui-handover.md` (tokens and components). If you have reference videos you like, attach a
couple so the designs show real content.

---

## Context

Motion Builder 2.0 is a browser app for making short, smooth motion graphics assets: titles,
lower thirds, icon pops, kinetic type, logo stings, 3D type, loops. Single assets of 2 to 10
seconds, 2D and 3D, made to feel fluent rather than to be high-end. It is used by a small team at
a content agency: 2 motion designers (know After Effects and Cinema 4D) and 2 graphic designers
(know Figma, little animation).

The engine is mature (node-based scene, keyframes, eases, 3D, materials, cloners, export to
ProRes/MP4 and After Effects passes). What changes now is the product focus: **from an editor with
AI help to an AI motion designer with an editor behind it.** You describe or show what you want,
the AI builds it with the engine, you steer it in words, and the timeline is only needed for the
last 10 percent.

How the AI works (design for this, make it visible but calm):
1. Input: a prompt, a reference video or still, and/or a design file (Figma, SVG, PDF, image).
2. The app analyses the reference (cuts, holds, motion curves, text), searches the team's asset
   library for similar approved assets, then the AI builds the animation from engine parts.
3. Every result is rendered and scored against the reference or prompt (artwork, timing, easing,
   loop); the AI fixes the weakest part and repeats until the score passes.
4. You get 3 options (smooth, punchy, playful). You pick one and steer it in words: "snappier",
   "hold the title longer", "less bounce on the second word". You can click a layer, word or time
   range first, so the instruction applies there.
5. "Teach": approved results, with a rating, go into the shared library and make the next drafts better.

## What to design

Desktop app, Chrome. Design at 1440 x 900 and check 1280 x 800 and 1920 x 1080. Light theme first,
then dark for the Steer screen.

1. **Studio (start).** One generous input: prompt field + drop zone for reference/design, with
   the reference shown as a thumbnail chip once added. Below: recent projects and a live,
   hover-to-play row of library assets by category ("Start from a title / lower third / loop…").
   No setup forms. Format (16:9, 9:16, 1:1, 4:5) and duration as small pills.
2. **Building.** A calm progress view while the AI works (10 to 60 seconds): the steps in plain
   words ("Found 3 cuts and a 1.2 s hold", "Using 4 library assets", "Score 72, fixing the timing
   of the title", "Score 88"), with the current render visible as it improves. Cancellable.
3. **Options.** Three results looping side by side, plus the reference if there is one, all in
   sync. Per option: name, one-line description, score chips (artwork, timing, motion). Actions:
   pick, "more like this", "mix: timing of A with the look of B".
4. **Steer (the main screen).** The viewer gets most of the space. A steer panel with a chat-like
   input that accepts selection chips (click a word in the viewer → "word: Motion" chip appears in
   the input). Quick-steer chips that adapt to the asset ("snappier", "smoother", "less overshoot",
   "hold longer", "slower exit", "add a loop"). A light **timing ribbon** under the viewer: each
   layer as a coloured block for enter / hold / exit you can drag, but no keyframes. A **version
   strip**: every steer makes a version (named `_v02`, `_v03`…), click to compare two versions A/B.
   A clear way into the full editor ("Open in editor") and back.
   Please show two layout directions for this screen: (a) steer panel on the right, (b) a command
   bar under the viewer with the history in a drawer.
5. **Compare.** Reference vs result: side by side, overlay with opacity slider, difference view,
   synced scrubbing and frame stepping. The score per aspect along the timeline (where timing or
   motion drifts), and "fix this" on a time range or region, which sends a scoped steer.
6. **Library.** Grid of assets with live previews on hover, filters (category, 2D/3D, character
   smooth/punchy/playful, rating), asset detail (preview, motion notes, controls, source, licence),
   an **Inbox** for new assets from After Effects / Cinema 4D / Teach with an approve step that
   shows what the importer couldn't convert, and the **Teach** dialog (name, category, rating 1–5,
   note).
7. **Deliver.** Formats: MP4, ProRes 4444 with alpha, After Effects passes + AOVs (beauty per
   layer, alpha and puzzle mattes, depth), batch from a sheet. An "Editable in After Effects where
   possible" toggle that shows, per layer, whether it goes out as an editable AE layer or as a
   rendered pass, and why. Render queue with progress.
8. **Editor (existing Refine screen).** Don't redesign it; show only how you enter and leave it
   from Steer and how a manual change shows up in the version strip.

States to include: empty Studio, AI busy, AI failed (credits, timeout, "couldn't read this
reference": offer to describe it instead), low score after the max rounds ("This is as close as I
get: timing 61. What matters most?"), unsupported parts of an import, and a designer vs a motion
designer view (designers see promoted controls and steering; motion designers can also open the
editor and library inbox).

## Design language (keep it)

The soft direction approved last round: floating cards on a soft grey canvas, light by default,
viewer gets the most space, borders rare. Tokens, radii, type and components as in
`docs/ui-handover.md`. Key rules:
- **Black pill** (ink background) = where you are or the one main action.
- **White raised pill** = selected inside a list or segmented control.
- **Volt `#c3fc2f`** = live only (playhead, running progress, the selection outline, the AI
  "working" indicator), always with ink. Never decorative.
- Inter for UI, Inter Tight 600 for titles, JetBrains Mono for times, values and ease names.
  Sentence case, no tiny uppercase labels.
- Motion in the UI itself should feel like the product: short, fluid, outExpo-style arrivals.

## What I want back

- A flow map of the screens above and how you move between them.
- High-fidelity screens for 1 to 7 (two directions for 4), light theme, plus Steer in dark.
- The states listed above.
- New components (steer input with selection chips, quick-steer chips, timing ribbon, version
  strip, score chips, compare overlay controls, asset card with hover preview, inbox row) with
  their states.
- Short interaction notes per screen and the actual copy, written plainly.
- Anything in this brief that you think is wrong for the users, say so and show your alternative.
