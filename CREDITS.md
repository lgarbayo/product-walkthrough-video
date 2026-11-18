# Credits

## launch-video-kit

This skill uses work from [launch-video-kit](https://github.com/borjaperfra/launch-video-kit) by Borja Pérez Francés, MIT licence (the full text is in [`scripts/LICENSE-launch-video-kit`](scripts/LICENSE-launch-video-kit)).

- `scripts/loop-music.mjs` and `scripts/analyze-music.mjs` are copied unchanged from its `scripts/` folder:
  - `loop-music.mjs` lengthens a track by looping it at its own periodic micro-silences, and measures every seam;
  - `analyze-music.mjs` analyses a track's tempo and energy arc.
- The music bed in `scripts/compose.mjs` is new code, but it follows the kit's ideas:
  - the bed is ducked under every voice line, and the bed level stays under the clipping ceiling;
  - the objective check that, under each line, the voice over music measures like the voice alone.
- Its README shaped several working rules of this skill:
  - one voice file per line, never one long take;
  - write the voice before cutting the video;
  - measure the mix and the frames instead of judging them by ear or eye.

## The format

The chapter format, the layout and the `record.mjs`, `voice.mjs` and `compose.mjs` pipeline come from the author's own `hk-video` producer. The reference video is https://youtu.be/6f3wKt45Vrc.

## Services

`scripts/find-music.mjs` searches the [Openverse](https://openverse.org) API. Every track keeps the licence and the attribution of its source (mostly Jamendo and Freesound), and `find-music.mjs get` writes them to `music/CREDITS.md`.
