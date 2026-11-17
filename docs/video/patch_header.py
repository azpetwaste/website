"""Patch the training video when only the top bar of the app changed (Nov 16, 2026: the Back button).

Why this exists: a full rebuild needs screenshots of the live demo with the Google maps on them, and a cloud session
cannot reach the live site or Google. When the only thing that changed is the header, this keeps every old screen and
its voice line, pastes the new header over the old one, and adds new clips for new lines.

    python3 docs/video/patch_header.py WORK_DIR

WORK_DIR must hold:
  new/plan.png, new/route.png   phone screenshots (375 by 812 at 2x) of the demo with the new header: Plan the week, My route
  new/<name>.png                a full screenshot for each new clip in NEW below
  fonts/node_modules/@fontsource/{ibm-plex-mono,schibsted-grotesk}   (npm install, for the title)
  tts/kokoro-v1.0.onnx, tts/voices-v1.0.bin                            (see README, step 1)
It reads static/crew/how-it-works.mp4, writes WORK_DIR/out.mp4 and prints the length. Copy it to both video paths,
remake the posters, and add the new lines to lines.json by hand. Check a frame of every clip by eye before you push.
"""
import base64, json, os, subprocess, sys
import numpy as np
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
W = sys.argv[1]
SRC = os.path.join(ROOT, 'static/crew/how-it-works.mp4')
X, Y, SW, SH, BAND = 166, 241, 748, 1620, 178   # where the phone screenshot sits in a 1080 by 1920 frame, and how tall the header is
# Which old clips show which header. Clips are counted from 0 in the order they play. DIM: a pop up is open over the page.
PLAN, ROUTE, DIM = (2, 3, 4, 5), (9, 10, 11, 15, 16), (13, 14)
# New clips: (play after old clip N, screenshot name, title, voice line)
NEW = [(1, 'customers', 'Back is top left', 'To move around, tap a tab. Back, at the top left, takes you to the Schedule. So does the logo. The back button on your phone works too.')]

def run(*a): subprocess.run(a, check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
os.makedirs(W + '/clips', exist_ok=True)
info = subprocess.run(['ffmpeg', '-hide_banner', '-i', SRC, '-vf', "select='gt(scene,0.02)',showinfo", '-an', '-f', 'null', '-'], capture_output=True, text=True).stderr
cuts = [0.0] + [float(x.split('pts_time:')[1].split()[0]) for x in info.split('\n') if 'pts_time:' in x]
dur = float(subprocess.run(['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', SRC], capture_output=True, text=True).stdout)
cuts.append(dur)
print(len(cuts) - 1, 'old clips')

band = {k: np.asarray(Image.open('%s/new/%s.png' % (W, k)).convert('RGB').resize((SW, round(1624 * SW / 750)), Image.LANCZOS))[:BAND] for k in ('plan', 'route')}
parts = []
for i in range(len(cuts) - 1):
    a, b = cuts[i], cuts[i + 1]
    png, wav, mp4 = ('%s/clips/o%02d.%s' % (W, i, e) for e in ('png', 'wav', 'mp4'))
    run('ffmpeg', '-y', '-ss', str((a + b) / 2), '-i', SRC, '-frames:v', '1', png)
    run('ffmpeg', '-y', '-ss', str(a), '-t', str(b - a), '-i', SRC, '-vn', '-ac', '1', '-ar', '24000', wav)
    kind = 'plan' if i in PLAN else 'route' if i in ROUTE + DIM else None
    if kind:
        im = np.asarray(Image.open(png).convert('RGB')).copy()
        im[Y:Y + BAND, X:X + SW] = (band[kind] * (0.3 if i in DIM else 1)).astype('uint8')
        Image.fromarray(im).save(png)
    parts.append((png, wav, b - a, mp4))
    for after, name, title, line in NEW:
        if after != i: continue
        from kokoro_onnx import Kokoro
        import soundfile as sf
        k = Kokoro(W + '/tts/kokoro-v1.0.onnx', W + '/tts/voices-v1.0.bin')
        audio, sr = k.create(line, voice='am_michael', speed=0.98, lang='en-us')
        raw, wav2, png2 = ('%s/clips/n_%s.%s' % (W, name, e) for e in ('raw.wav', 'wav', 'png'))
        sf.write(raw, audio, sr)
        run('ffmpeg', '-y', '-i', raw, '-af', 'loudnorm=I=-16:TP=-1.5:LRA=11,apad=pad_dur=0.7', '-ac', '1', '-ar', '24000', wav2)
        n = float(subprocess.run(['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', wav2], capture_output=True, text=True).stdout)
        # The frame: black, the title and the orange bar where the old clips have them, the screenshot under it.
        F = W + '/fonts/node_modules/@fontsource/schibsted-grotesk/files/schibsted-grotesk-latin-700-normal.woff2'
        shot = base64.b64encode(open('%s/new/%s.png' % (W, name), 'rb').read()).decode()
        html = ("<style>@font-face{font-family:T;font-weight:700;src:url(data:font/woff2;base64,%s)}html,body{margin:0;background:#000}"
                "h1{position:absolute;left:0;right:0;top:98px;margin:0;text-align:center;color:#fff;font:700 52px/60px T;letter-spacing:-.01em}"
                "i{position:absolute;left:490px;top:206px;width:100px;height:6px;background:#FF4A1C}img{position:absolute;left:%dpx;top:%dpx;width:%dpx;height:%dpx}</style>"
                "<h1>%s</h1><i></i><img src='data:image/png;base64,%s'>") % (base64.b64encode(open(F, 'rb').read()).decode(), X, Y, SW, SH, title, shot)
        from playwright.sync_api import sync_playwright
        with sync_playwright() as p:
            br = p.chromium.launch(executable_path=os.environ.get('CHROME', '/usr/bin/google-chrome'), args=['--no-sandbox'])
            pg = br.new_context(viewport={'width': 1080, 'height': 1920}).new_page(); pg.set_content(html); pg.wait_for_timeout(600); pg.screenshot(path=png2); br.close()
        parts.append((png2, wav2, n, '%s/clips/n_%s.mp4' % (W, name)))
        print('new clip', name, round(n, 1), 's')

with open(W + '/clips/list.txt', 'w') as f:
    for png, wav, n, mp4 in parts:
        run('ffmpeg', '-y', '-loop', '1', '-framerate', '30', '-i', png, '-i', wav, '-t', '%.3f' % n, '-c:v', 'libx264', '-tune', 'stillimage', '-crf', '20', '-pix_fmt', 'yuv420p', '-r', '30',
            '-c:a', 'aac', '-b:a', '96k', '-ar', '44100', '-ac', '1', '-shortest', mp4)
        f.write("file '%s'\n" % mp4)
run('ffmpeg', '-y', '-f', 'concat', '-safe', '0', '-i', W + '/clips/list.txt', '-c:v', 'libx264', '-crf', '21', '-preset', 'slow', '-pix_fmt', 'yuv420p', '-r', '30', '-c:a', 'aac', '-b:a', '96k', '-movflags', '+faststart', W + '/out.mp4')
print('wrote', W + '/out.mp4', subprocess.run(['ffprobe', '-v', 'error', '-show_entries', 'format=duration,size', '-of', 'csv=p=0', W + '/out.mp4'], capture_output=True, text=True).stdout.strip())
