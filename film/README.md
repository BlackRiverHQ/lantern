# Lantern launch film

A 30-second film, `site/assets/video/lantern-16x9.mp4`, plays on the landing page. All of it is code:

- **Animation:** one GSAP timeline drives every scene.
- **3D:** Three.js draws the bonus slab and the bond column.
- **Type:** DOM text.
- **Rendering:** each frame is rendered deterministically in headless Chromium and piped into ffmpeg.

There is no screen recording or stock footage. Every number on screen comes from
[`FACTS.md`](FACTS.md), which cites the contract, the test run or the chain read behind it.

## Rebuild it

You need Node 20+, Python 3, and ffmpeg on the `PATH`.

```
cd film
npm ci                                # gsap, three, playwright
npx playwright install chromium       # the browser the renderer drives
python3 -m venv .venv && .venv/bin/pip install -r requirements.txt   # numpy, scipy for the mix

npm run render                        # 1920x1080, 60 fps, 4 subframes of motion blur -> out/lantern-picture.mp4
.venv/bin/python tools/offline-mix.py out/lantern-picture.mp4 out/lantern-16x9.mp4   # music + sound effects
```

- **Mix:** `offline-mix.py` levels the score (`assets/music/130.mp3`) to −14 LUFS, then places each
  effect listed in `assets/sfx/plan.json` at its film time.
- **Faster draft:** `npm run render:fast` renders 30 fps with no motion blur, about 3 minutes
  instead of about 15.
- **One section:** pass `--from` and `--to` in seconds to `tools/render.mjs`.
- **Preview in a browser:** run `npm run preview` and open `http://localhost:8090/src/`.
  `window.seek(t)` jumps to any time.
- **Your own browser:** set `CHROME=/path/to/chrome` to use an installed Chrome instead of the
  Playwright one.
- **No GPU:** set `SWGL=1` to force software GL. It is slower.

Where things live:

| What | Where |
|---|---|
| Scenes and timeline | `src/main.js` |
| Positions | `src/layout.js` |
| 3D world | `src/lib/world.js` |
| Brand tokens | `src/lib/tokens.js`, the same fonts and colours as the site |
| Shot plan | `STORYBOARD.md` |

