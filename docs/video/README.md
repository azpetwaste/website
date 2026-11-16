# How to rebuild the training video

The video is phone shaped (1080 by 1920), about two minutes, with a computer voice. It is built from screenshots of the live demo, one screen for each line of narration.

1. Voice. `pip install kokoro-onnx soundfile`, then download `kokoro-v1.0.onnx` and `voices-v1.0.bin` from the kokoro-onnx GitHub releases (tag `model-files-v1.0`). `say.py` reads `lines.json` and writes one wav for each line. Voice `am_michael`. Fix the two paths at the top of `say.py` for your machine.
2. Screens. Open `arizonapetwaste.com/crew/?demo` at phone size (375 by 812) and take one screenshot for each line, in the same order as `lines.json`. `?demo&photofail=3` shows the "Photo not sent" screen.
3. Build. For each line make a clip: the screenshot scaled to 1620 tall on a black 1080 by 1920 frame, a short title on top, the wav as sound, clip length is the wav plus 0.7 seconds. Join the clips with ffmpeg concat and run `loudnorm=I=-16`.
4. Publish. Copy the mp4 to `static/crew/how-it-works.mp4` and `static/staff-73d752e4/training.mp4`. Make the posters from the frame at 3 seconds. Update the written steps on the training page.

Rule: keep `lines.json` true to the app. Never say the app does something it does not do.

# The home page videos (the phone in How it works)

Real video from the November 2026 shoot. Joe sends ads cut for phones (1080 by 1920, 10 to 15 seconds, 30 to 55 MB each). The site never serves those files.

- `python3 docs/video/make_reel.py /folder/with/the/originals` writes the web files into `static/assets/video/`: a 540 by 960 mp4 with no sound track (about 1 to 1.8 MB), a still of the first frame, and a December cut with the free month captions taken out. The notes at the top of that file say why each setting is what it is.
- The originals are not in the repo. Four ads went from 183 MB to 6.1 MB.
- The files have no sound. The ads carry music only, no voice, and we do not know yet if the music may be used on a website. If Joe says it may, keep the sound track (drop `-an`, add `-c:a aac -b:a 64k`) and add a sound button to `src/runtime/reel.js`.
- The words on the page for each clip are `_REEL` in `design/generator/parts.py`. The data for Google is `VIDEOS` in `build/build.mjs`.
