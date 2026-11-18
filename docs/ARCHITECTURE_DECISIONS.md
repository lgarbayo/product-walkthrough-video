# Architecture decisions

This document records how product-walkthrough-video came to be what it is: the decisions, the attempts that did not work, and what each choice costs. Each decision follows a light ADR format: context, decision, consequences. When a decision changes, add a new one and mark the old one as superseded; do not rewrite history.

The skill was built and tested on 18 November 2026, by making a real three-minute explainer video for a web app (Mecena) from start to finish. Most numbers below come from that run.

## Index

| ADR | Decision | Status |
|---|---|---|
| [001](#adr-001-a-fixed-format-in-the-products-own-skin) | A fixed format, in the product's own skin | Accepted |
| [002](#adr-002-hyperframes-for-the-composition) | HyperFrames for the composition | Accepted |
| [003](#adr-003-the-user-approves-the-script-before-anything-is-recorded) | The user approves the script before anything is recorded | Accepted |
| [004](#adr-004-the-real-app-recorded-never-a-mock-up) | The real app, recorded, never a mock-up | Accepted |
| [005](#adr-005-one-voice-clip-per-chapter-and-the-timeline-follows-the-voice) | One voice clip per chapter, and the timeline follows the voice | Accepted |
| [006](#adr-006-one-recording-take-per-chapter) | One recording take per chapter | Accepted |
| [007](#adr-007-an-optional-music-bed-mixed-after-the-render-and-measured) | An optional music bed, mixed after the render and measured | Accepted |
| [008](#adr-008-the-user-picks-the-music-cc0-and-cc-by-only-by-default) | The user picks the music; CC0 and CC BY only by default | Accepted |
| [009](#adr-009-reuse-launch-video-kits-music-scripts-unchanged) | Reuse launch-video-kit's music scripts unchanged | Accepted |
| [010](#adr-010-neutral-layout-keyframes-instead-of-frames-of-the-reference-video) | Neutral layout keyframes instead of frames of the reference video | Accepted |
| [011](#adr-011-two-line-headlines-push-the-content-down) | Two-line headlines push the content down | Accepted |
| [012](#adr-012-four-voice-providers-and-the-user-always-chooses) | Four voice providers, and the user always chooses | Accepted |

---

## ADR-001: A fixed format, in the product's own skin

- **Status:** Accepted
- **Date:** 2026-11-18

**Context.** A product walkthrough has to be calm, exact and easy to follow. Inventing a new layout for every video is slow, and the result is uneven. But two products shown in the same colours and fonts look like the same template.

**Decision.** Split the look in two:

- **The format is fixed.** It covers the chapters, the grid, the chapter layout (the app on the left, "behind the screen" cards on the right), the motion and the pace. It comes from a reference video, <https://youtu.be/6f3wKt45Vrc>.
- **The skin belongs to each product.** It covers the background, palette, fonts, radius and a drawn motif, and comes from the product's own design system.

`compose.mjs` holds the format. `video.json` holds the skin as `theme`.

**Consequences.**
- Videos look consistent, and Claude only has to decide the content and the skin.
- The skin has tests: a WCAG AA contrast check on every render; a "cover the logo" test for generic skins; a ban on common AI-generated looks; and a rule against reusing an earlier video's skin by habit.
- Changing the format means changing `compose.mjs`. That is deliberate.

## ADR-002: HyperFrames for the composition

- **Status:** Accepted
- **Date:** 2026-11-18

**Context.** We looked at two ways to render video from code. Remotion (React) is mature and was what launch-video-kit used. HyperFrames (HTML with a single GSAP timeline) is what the pipeline this skill grew from already used.

**Decision.** Use HyperFrames. A composition is one HTML file, a seek-safe GSAP timeline and media elements. It is easy to generate from a script without a build step or a React project.

**Consequences.**
- The pipeline needs no `npm install`: `compose.mjs` runs a pinned HyperFrames version with `npx`.
- launch-video-kit's React helpers (ducking, subtitles, camera) could not be reused as code. Their ideas were ported: see ADR-007 and ADR-009.

## ADR-003: The user approves the script before anything is recorded

- **Status:** Accepted
- **Date:** 2026-11-18

**Context.** Recording takes minutes and the voice spends the user's ElevenLabs credits. A wrong claim found after the render means a new recording, new voice clips and a new render. In the test run, checking the script against the code found three numbers from an earlier version of the product that were no longer true (the test count, the number of decision records and a jury score).

**Decision.** Claude writes `video/SCRIPT.md` first. It gives every number a source in a comment, and lists the open decisions and any figure it could not check. Then it stops until the user approves.

**Consequences.**
- One extra round-trip with the user, in exchange for not redoing paid and slow work.
- The script is also the brief: `video.json` is translated from it almost line by line.

## ADR-004: The real app, recorded, never a mock-up

- **Status:** Accepted
- **Date:** 2026-11-18

**Context.** A walkthrough is only convincing if it shows the product working. Some things cannot be recorded headless, though: dictation with the Web Speech API, two-factor authentication, a real payment. And some products have no AI or no live data in a test environment.

**Decision.** Record the real app with Playwright, from a deployed URL or a local production build. When something on screen is staged, the scene says so in an honesty note: answers typed instead of spoken, test mode, simulated AI. A chapter that needs a person gets a manual take, never a fake screen.

**Consequences.**
- Each chapter logs in and loads its own demo state, so it can be re-recorded alone.
- Recording against a local build with demo data is allowed and honest, if the notes and `NOTES.md` say so.

## ADR-005: One voice clip per chapter, and the timeline follows the voice

- **Status:** Accepted
- **Date:** 2026-11-18

**Context.** If the video is cut first and the voice comes later, every real take shifts the cuts. launch-video-kit learned the same thing: write the voice before cutting. A single long voice file makes a one-chapter change regenerate everything.

**Decision.** Use one ElevenLabs clip per chapter, with character timings. Each scene lasts a 0.4 s lead-in, its clip and a 1.2 s pause. Each card appears on the word its `cue` names. Speech is normalised to -16 LUFS with one constant gain and a limiter at -1.5 dBTP, never a dynamic normaliser (it pumps). An `--estimate` mode writes timings without audio, for a silent draft.

**Consequences.**
- Editing a chapter regenerates one clip and its credits only.
- The estimate runs about 8 % longer than the words-per-minute formula, because it adds rests at punctuation. Real clips came out shorter: the test video was 2:56 estimated and 2:40 voiced.

## ADR-006: One recording take per chapter

- **Status:** Accepted
- **Date:** 2026-11-18

**Context.** The pipeline first recorded every chapter in one continuous Playwright take, and cut it using wall-clock marks. In the test run, the video file fell behind the clock: about 10 seconds late after 80 seconds. The last chapter's cut showed the end of the previous one (the jury score instead of the justification screen). The early chapters were fine, so the error grew with the take.

**Decision.** Open a fresh browser context for every chapter, so each chapter is a short take of its own. `"takePerScene": false` keeps the old single take for anyone who needs it.

**Consequences.**
- The drift can no longer pile up across chapters, and every chapter frame matched its voice in the test run.
- Each chapter must log in and seed its own state. It already had to, to be re-recordable alone (ADR-004).

## ADR-007: An optional music bed, mixed after the render and measured

- **Status:** Accepted
- **Date:** 2026-11-18

**Context.** The reference video has no music, and some videos are better without it. Others gain from a quiet bed. Whether music "drowns" the voice is easy to argue about and hard to judge by ear, especially for an agent that cannot hear.

**Decision.** `video.json` can have a `music` block. `compose.mjs` mixes the bed after the render and after the speech is normalised, so the voice keeps its -16 LUFS. The bed is set to `bedLufs` where nobody speaks and lowered by `duckDb` under every voice clip, with ramps that are linear in dB. Following launch-video-kit, the check is objective: under each clip, the mix must measure like the voice alone, within 1 dB. `report.json` lists every clip.

**Consequences.**
- The first defaults (-26 LUFS, 12 dB of ducking) passed the check easily, with 0.01 dB of difference, but left the music 22 dB under the voice, barely audible. In this format the voice almost never stops (the pauses are 1.6 s), so the ducked level is what the viewer hears. The defaults became -22 LUFS and 9 dB: about 15 dB under the voice, with a worst difference of 0.13 dB.
- "Does it sound good" is still a person's call. "Does it cover the voice" is a number.

## ADR-008: The user picks the music; CC0 and CC BY only by default

- **Status:** Accepted
- **Date:** 2026-11-18

**Context.** A track found on the user's disk may be a voice note or may not be licensed for publishing. A track found online comes with a licence that may not allow this use. An agent cannot listen to a track to judge it.

**Decision.** The skill asks the user for one of two things:

- **A file on the machine.** `find-music.mjs local` lists the audio files with their length.
- **A kind of music.** `find-music.mjs search` queries Openverse and shows candidates with their licence and a link to listen. The user picks one, and `get` downloads it and writes its attribution.

The skill never picks a track on its own. The search only offers CC0 and CC BY, because music under a video is an adaptation: ND forbids it, NC rules out commercial use, and SA would bind the video.

**Consequences.**
- Openverse needs no key, but anonymous use is limited to 20 requests a minute, 200 a day, and 20 results a page (the first version asked for 40 and got HTTP 401).
- CC BY tracks need the credit lines in the video description. `music/CREDITS.md` keeps them.

## ADR-009: Reuse launch-video-kit's music scripts unchanged

- **Status:** Accepted
- **Date:** 2026-11-18

**Context.** A video often needs a track longer than the one you have. launch-video-kit had already solved looping a track without an audible seam: cut at the track's own periodic micro-silences, not at bar boundaries, and measure every seam. Its author documented that crossfades at bar boundaries fail because the arrangement jumps.

**Decision.** Copy `loop-music.mjs` and `analyze-music.mjs` unchanged, with the original MIT licence text and a header saying where they come from. Credit the kit in `CREDITS.md`, `README.md` and `REUSE.toml`. Port its ducking criterion into our own code instead of its React helper (ADR-002).

**Consequences.**
- Fixes to those scripts should go upstream first, so the copies stay identical to the source.
- The two scripts keep their original Spanish comments.

## ADR-010: Neutral layout keyframes instead of frames of the reference video

- **Status:** Accepted
- **Date:** 2026-11-18

**Context.** `compose.mjs` builds a style board: each scene next to a reference keyframe of its kind, to compare layout and rhythm. The first keyframes were frames of the reference video, which shows a real product with its own colours, fonts, screens and example data. That contradicts ADR-001: an agent, or a person, shown those frames tends to copy their skin. It would also publish screenshots of one specific product.

**Decision.** Render the keyframes from `assets/video.example.json`, for a fictional product, with no skin: neutral greys, system fonts, no motif. Demo chapters show a grey wireframe instead of an app.

**Consequences.**
- The board compares composition only, which is all it is for.
- When the format changes, re-render the keyframes the same way and replace `assets/style/*.jpg`.

## ADR-011: Two-line headlines push the content down

- **Status:** Accepted
- **Date:** 2026-11-18

**Context.** The panels of the "under the hood" scenes and the terminal sit at a fixed height under a one-line headline. Rendering the neutral keyframes showed that a longer headline wraps, and its second line nearly touches the panels.

**Decision.** If a headline that is not stacked is longer than about 48 characters, `compose.mjs` moves the panels or the terminal down by one line (at 66 px, about 48 characters fill the 1,680 px measure).

**Consequences.**
- A simple heuristic, not a measurement of the rendered text. A very wide or very narrow font can still need a shorter headline, which is the better fix anyway.

## ADR-012: Four voice providers, and the user always chooses

- **Status:** Accepted
- **Date:** 2026-11-18

**Context.** The voice-over only came from ElevenLabs. Without an account, the skill could only make a silent draft, which is a preview, not a video anyone would publish. ElevenLabs costs money, and some people would rather use their own voice. The cards are cued to the words using ElevenLabs' per-character timings, which other voices do not give.

**Decision.** `voice.provider` selects one of four providers, and Claude always presents all four and lets the user pick, with ElevenLabs as the recommended one:

- `elevenlabs`: as before, billed to the user's own account.
- `kokoro`: Kokoro-82M, local and free, through `hyperframes tts`.
- `recorded`: the user's own voice, one recording per chapter. The first run writes the text of each chapter to `vo-takes/READ.md`.
- `none`: estimated timings and a silent draft.

Kokoro and recorded clips get their timings by transcribing each clip locally (`hyperframes transcribe`, Whisper). The script's words are then aligned to the transcribed words with a longest common subsequence. Words the transcript spells differently ("thirty-seven" and "37") take times interpolated between their matched neighbours. HyperFrames already ships both tools, so no new dependency enters the scripts. Kokoro only needs a Python environment with `kokoro-onnx` and `soundfile`, which the user creates outside the project.

**Consequences.**
- **Kokoro on the test video:** the whole Mecena video was voiced with `bm_george` in 1 min 17 s for 11 clips, once the model was downloaded (the first run took about 2 min). The render came out at 2:42, against 2:40 with ElevenLabs, with no warning.
- **Alignment:** it matched 80 % to 100 % of each chapter's words. The misses were numbers and one mishearing ("past" as "passed"), all interpolated correctly.
- **Recorded voices:** silence is trimmed at both ends. A take padded with 2.4 s of silence came back at its spoken length.
- **First use:** transcription downloads Whisper, a few minutes on the first run.
- **The compositor:** `compose.mjs` takes audio from any provider. `report.json` says which one voiced the video.
