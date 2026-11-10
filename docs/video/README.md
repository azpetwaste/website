# How to rebuild the training video

The video is phone shaped (1080 by 1920), about two minutes, with a computer voice. It is built from screenshots of the live demo, one screen for each line of narration.

1. Voice. `pip install kokoro-onnx soundfile`, then download `kokoro-v1.0.onnx` and `voices-v1.0.bin` from the kokoro-onnx GitHub releases (tag `model-files-v1.0`). `say.py` reads `lines.json` and writes one wav for each line. Voice `am_michael`. Fix the two paths at the top of `say.py` for your machine.
2. Screens. Open `arizonapetwaste.com/crew/?demo` at phone size (375 by 812) and take one screenshot for each line, in the same order as `lines.json`. `?demo&photofail=3` shows the "Photo not sent" screen.
3. Build. For each line make a clip: the screenshot scaled to 1620 tall on a black 1080 by 1920 frame, a short title on top, the wav as sound, clip length is the wav plus 0.7 seconds. Join the clips with ffmpeg concat and run `loudnorm=I=-16`.
4. Publish. Copy the mp4 to `static/crew/how-it-works.mp4` and `static/staff-73d752e4/training.mp4`. Make the posters from the frame at 3 seconds. Update the written steps on the training page.

Rule: keep `lines.json` true to the app. Never say the app does something it does not do.
