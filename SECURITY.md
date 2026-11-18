# Security policy

## Supported versions

| Version | Supported |
|---|---|
| latest `main` | Yes |
| anything else | No |

## Reporting a vulnerability

Please report it **privately**, never in a public issue:

- **Preferred:** GitHub's private vulnerability reporting: the [Security tab](https://github.com/lgarbayo/product-walkthrough-video/security) → "Report a vulnerability".
- **Or by email** to Luis Garbayo Fernández, <lugarbayo@gmail.com>, with "security" in the subject.

Include what you found, how to reproduce it (the `video.json` and the command, if relevant) and what an attacker could do with it.

## Response timelines

- **Acknowledgement:** within 48 to 72 hours.
- **Assessment and fix:** best effort. This is a free-time project with one maintainer, so a fix can take days or weeks depending on its size. You will hear how it is going.

## Known limitations

Be aware of these before you use the skill:

- **`video.json` is trusted input.** The recorder runs whatever its steps say in a real browser, including `eval` steps (arbitrary JavaScript in the recorded page) and HTTP requests to `baseUrl`. Only run a `video.json` you wrote or reviewed, against apps and accounts meant for testing.
- **Secrets.** `voice.mjs` reads the ElevenLabs key from the environment and never writes it to disk or to its output. Recording steps take passwords from environment variables (`{"fill": ..., "env": "NAME"}`), but any value written literally in `video.json` ends up in your repository. Use test accounts only, and check every frame for secrets or personal data before you publish.
- **Downloaded code and media.** `compose.mjs` runs HyperFrames through `npx` (a pinned version, downloaded on the first run), and the composition loads GSAP from a CDN. `find-music.mjs` downloads audio from the sources Openverse lists. Treat downloads as untrusted.
- **No external audit.** The scripts have not been reviewed by a third party.

## Disclosure policy

We ask for coordinated disclosure. Please do not publish details until a fix is released, or until 90 days have passed since your report, whichever comes first. We will credit you in the changelog unless you prefer otherwise.
