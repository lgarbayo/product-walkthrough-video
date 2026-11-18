---
name: Bug report
about: Something is not working as expected
labels: bug
---

**Describe the bug**
A clear description of what happens. E.g. "compose.mjs exits with 3 when a chapter uses the browser device."

**To reproduce**
1. The command you ran, e.g. `node video/compose.mjs video/video.json`
2. The relevant part of `video.json` (remove any secret or personal data)
3. What you see

**Expected behavior**
What you expected to happen instead.

**Evidence**
- The script's output, and `out/report.json` if there is one
- The frame that looks wrong (`out/frames/<scene>.png`) or a short clip

**Environment**
- OS: [e.g. Ubuntu 24.04, macOS 15]
- Node.js, FFmpeg and Playwright versions (`node -v`, `ffmpeg -version`, `npx playwright --version`)
- Commit of this skill: [e.g. `git -C ~/.claude/skills/product-walkthrough-video rev-parse --short HEAD`]
