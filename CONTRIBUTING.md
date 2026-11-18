# Contributing to product-walkthrough-video

Thank you so much for taking the time to read this. It genuinely means a lot. product-walkthrough-video is a small project, born while making the explainer video of a real product, and the fact that you are here considering contributing to it is something we do not take for granted.

## How long a contribution takes

There is one maintainer, working on this in their free time. You can expect a **first answer to an issue or a pull request within 48 to 72 hours**. Reviewing and merging can take longer when a change needs a test render. If a week goes by without an answer, a polite reminder in the thread is welcome.

## What helps most

- **Bug reports with evidence.** The video's `report.json`, the command you ran and its output, and the frame that looks wrong (`out/frames/<scene>.png`).
- **Fixes to the scripts** that make them work in more setups: other operating systems, apps that are harder to record, other voices or languages.
- **Better instructions.** If Claude keeps getting a step wrong, the fix is often a clearer sentence in `SKILL.md` or `references/`, with the reason behind it.

Before you start on something big, open an issue to talk about it, so your work fits where the project is going.

## Set up your environment

1. **Fork** the repository on GitHub and clone your fork into your Claude Code skills folder, so that Claude uses your copy:

   ```sh
   git clone https://github.com/<you>/product-walkthrough-video ~/.claude/skills/product-walkthrough-video
   ```

   If you already have the skill installed, clone somewhere else and point to it with a symbolic link while you work.

2. Install the tools from the [README](README.md#install): Node.js 22 or newer, FFmpeg and Playwright with Chromium. Check HyperFrames with `npx --yes hyperframes@0.8.216 doctor`.

3. Create a **descriptive branch** from `main`:

   ```sh
   git checkout -b fix/record-slow-pages
   ```

The scripts have no dependencies of their own, so there is nothing to install or build. To check that everything runs, render the example as in [Tests](#tests).

## Coding standards

There is no formatter or linter configured. Keep to the style the scripts already have:

- plain JavaScript ES modules (`.mjs`), Node built-ins only, no dependencies;
- two-space indentation, single quotes, no semicolons;
- a header comment in every script that explains what it does, its arguments, its outputs and its exit codes. Update it when you change any of them;
- a comment explains *why*, not what: the measurement or failure that led to a rule ("one take per chapter: a long take drifts about 10 s after 80 s");
- an SPDX header on new source files:

  ```js
  // SPDX-FileCopyrightText: 2026 Your Name <you@example.com>
  // SPDX-License-Identifier: MIT
  ```

For the instructions (`SKILL.md`, `references/`): the imperative mood, short sentences, and the reason behind each rule rather than a bare "always" or "never". They are written in Spanish. Keep changes in the same language, or open an issue if you would like to work on an English version.

## Tests

There is no unit test suite: the scripts are checked by running them. Before a pull request:

1. **Syntax and data**, the same checks as CI:

   ```sh
   for f in scripts/*.mjs; do node --check "$f"; done
   node -e "JSON.parse(require('fs').readFileSync('assets/video.example.json', 'utf8'))"
   pipx run reuse lint
   ```

2. **A render**, when you change `compose.mjs` or the format. Render the example in a scratch folder, with the voice estimated and no recordings:

   ```sh
   mkdir -p /tmp/pwv && cp assets/video.example.json /tmp/pwv/video.json && cd /tmp/pwv
   node ~/.claude/skills/product-walkthrough-video/scripts/voice.mjs video.json --estimate
   node ~/.claude/skills/product-walkthrough-video/scripts/compose.mjs video.json --allow-over
   ```

   The example's fonts and logo point to files that do not exist outside a product, so remove `theme` and `brand.logo` from the copy first, or add your own files. Look at `out/style-board.png` and the frames in `out/frames/`. Exit code 1 is expected here (silent, no recordings).

3. **A real video**, when you change `record.mjs`, `voice.mjs`, the music or the procedure. Make a short video of a product you can share, and say in the pull request what you checked.

## Commit conventions

Commits follow [Conventional Commits](https://www.conventionalcommits.org):

```
<type>(<optional scope>): <description>

<optional body: the motivation, and how it differs from before>

<optional footer: Closes #123, BREAKING CHANGE: ...>
```

- **Types:** `feat`, `fix`, `refactor`, `perf`, `style`, `test`, `docs`, `build`, `ops` (CI and infrastructure), `chore`.
- **Scopes in use:** `pipeline`, `record`, `voice`, `compose`, `music`, `skill`, `assets`, `license`, `ci`.
- **Description:** imperative, lower case, no final period: `fix(record): wait for fonts before the first mark`.
- **Breaking changes** (for example, a renamed field in `video.json`): add `!` before the colon, and explain it in a `BREAKING CHANGE:` footer.

## Pull request process

1. Keep each pull request to one change. Update `CHANGELOG.md` under **Unreleased** for anything a user would notice, saying what changed and why.
2. Fill in the pull request template, link the issue it solves, and attach a frame or a short clip when the change is visible.
3. CI must pass (the `check` workflow).
4. At least one maintainer reviews and merges it. Expect questions: they are about understanding the change, not about doubting you.

## Definition of done

A contribution is done when:

- the change does one thing, and the pull request says why it is needed;
- the CI checks pass, and a render was made when the change touches rendering;
- the header comments of the scripts and the instructions match the new behaviour;
- `CHANGELOG.md` has an entry for anything a user would notice;
- new files carry SPDX information (a header, or `REUSE.toml`), and `reuse lint` passes;
- nothing in the change contains a key, a token or personal data, including inside example files or screenshots.

## Code of conduct

Be kind and assume good intent. Critique ideas, not people.
