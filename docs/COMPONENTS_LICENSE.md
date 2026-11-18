# Licences of the project and its components

## Why MIT

product-walkthrough-video is released under the [MIT licence](../LICENSE). You can use, copy, change and redistribute it, also in commercial work, as long as you keep the copyright notice and the licence text.

We chose MIT for three reasons:

1. **It matches the code we reuse.** Two of the scripts come from [launch-video-kit](https://github.com/borjaperfra/launch-video-kit), which is MIT too. With the same licence everywhere, nobody has to work out how two licences combine.
2. **It is what a skill needs.** A skill is copied into other people's setups and edited there. A permissive licence lets anyone adapt it to their own videos without obligations beyond the notice.
3. **The videos it makes are not covered.** MIT applies to this repository: the scripts, the instructions and the example files. A video you render with the skill is your work, with your product, your voice-over and your music. The skill does not claim anything over it.

Like every open source licence, MIT comes **with no warranty**. The software is provided "as is", and the authors are not liable for any damage from its use.

The licensing metadata follows [REUSE 3.2](https://reuse.software/spec-3.2/): `REUSE.toml` says who holds the copyright of each file and under which licence, and `LICENSES/` has the full text of every licence used. `reuse lint` checks it.

## Components inside this repository

| Component | Files | Licence | Copyright |
|---|---|---|---|
| This skill | everything not listed below | MIT | 2026 Luis Garbayo Fernández |
| launch-video-kit | `scripts/loop-music.mjs`, `scripts/analyze-music.mjs` (copied unchanged) | MIT, text in `scripts/LICENSE-launch-video-kit` | 2026 Borja Pérez Francés |
| Layout keyframes | `assets/style/*.jpg` | MIT | 2026 Luis Garbayo Fernández (rendered by this skill from `assets/video.example.json`, with a fictional product) |

The music bed in `scripts/compose.mjs` is new code, but it follows the ideas of launch-video-kit. `CREDITS.md` says exactly what comes from it.

## Tools the skill uses but does not ship

The scripts call these tools at run time. None of them is copied into this repository. Their licences apply to your use of them, not to this repository.

| Tool | How the skill uses it | Licence or terms |
|---|---|---|
| [HyperFrames](https://www.npmjs.com/package/hyperframes) | renders the composition (`npx hyperframes@<pinned version>`) | Apache-2.0 |
| [GSAP](https://gsap.com) | the animation timeline inside the composition, loaded from a CDN | GSAP Standard "no charge" licence (free, also for commercial use; not an OSI licence) |
| [Playwright](https://playwright.dev) | records the product's app in a headless browser | Apache-2.0 |
| [FFmpeg](https://ffmpeg.org) | cuts, measures and mixes audio and video | LGPL-2.1-or-later, or GPL-2.0-or-later, depending on how your copy was built |
| [Node.js](https://nodejs.org) | runs the scripts | MIT |

## Services and the media they give you

| Service | What for | What applies |
|---|---|---|
| [ElevenLabs](https://elevenlabs.io) | the voice-over, with **your** API key | ElevenLabs' terms of service for your plan, including whether you may publish the audio commercially |
| [Openverse](https://openverse.org) | searching Creative Commons music (`scripts/find-music.mjs`) | each track keeps the licence of its source (mostly Jamendo and Freesound). The finder only offers CC0 and CC BY by default, and writes the attribution to `music/CREDITS.md` |

### Why the music finder only offers CC0 and CC BY

Putting music under a video in timed relation counts as an **adaptation** under Creative Commons. So:

- **ND** (no derivatives) licences do not allow it at all;
- **NC** (non-commercial) licences rule out any commercial use of the video;
- **SA** (share-alike) licences would force the whole video to be published under the same licence.

CC0 and CC BY have none of these limits. CC BY only requires credit: put the lines from `music/CREDITS.md` in the video description. Openverse reports what each source declares, so check the track's own page before you publish.

## Your own files

The fonts, logos, screenshots and recordings of the product you make a video about stay under their own licences. The skill copies the product's fonts into `video/fonts/`: keep each font's licence file next to it (for example the SIL Open Font Licence of Inter).
