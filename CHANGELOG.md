# Changelog

All notable changes to this project are written down here, in plain words: what changed, and why.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow [Semantic Versioning](https://semver.org/spec/v2.0.0.html), derived from the [Conventional Commits](https://www.conventionalcommits.org) of each release (a breaking change raises the major version, a `feat` or `fix` the minor, anything else the patch).

**Maintainers, contributors and AI agents:** add an entry under **Unreleased** with every change a user would notice. Say why the change was made, not only which files it touches.

## [Unreleased]

## [0.1.0] - 2026-11-18

The first public version, tested end to end by making a real three-minute explainer video.

### Added

- **The skill and its procedure** (`SKILL.md`, `references/`). Claude reads the product, writes a script with a source for every number, and waits for the user's approval before it records anything or spends voice credits. Recording and voicing a chapter is slow or paid, so a wrong claim must be caught on paper.
- **A fixed format in the product's own skin.** The chapters, layout, motion and pace come from a reference video. The colours, fonts and motif come from the product's design system, so videos are consistent without all looking the same.
- **The recorder** (`record.mjs`). It records the real app with Playwright, one take per chapter, because a long single take drifted about 10 seconds behind the clock after 80 seconds and showed the wrong screen.
- **The voice-over** (`voice.mjs`). One ElevenLabs clip per chapter with character timings, so the screen follows the words, and only a changed chapter is regenerated. There is also a free estimate mode for silent drafts.
- **The composer** (`compose.mjs`). It renders with HyperFrames, normalises speech to -16 LUFS, checks the contrast of the skin, and writes the subtitles, the YouTube chapters, one frame per scene and a style board.
- **An optional music bed**, ducked under the voice and checked by measurement: under each voice clip, the mix must measure like the voice alone, within 1 dB. The defaults (-22 LUFS, 9 dB of ducking) were chosen after the first ones left the music almost inaudible.
- **A music finder** (`find-music.mjs`). It lists the user's own audio files, or searches Creative Commons music on Openverse and keeps its attribution. It offers CC0 and CC BY only, because other licences forbid or restrict putting music under a video.
- **launch-video-kit's music scripts** (`loop-music.mjs`, `analyze-music.mjs`), copied unchanged under their MIT licence, to lengthen a track without an audible seam.
- **Neutral layout keyframes**, rendered for a fictional product with no skin, so the style board compares layout without suggesting any real product's look.
- **Project documents:** README, MIT licence with REUSE metadata, licence notes for every component, contributing guide, security policy, architecture decisions, issue and pull request templates, and CI checks.

[Unreleased]: https://github.com/lgarbayo/product-walkthrough-video/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/lgarbayo/product-walkthrough-video/releases/tag/v0.1.0
