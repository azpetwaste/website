"""Makes the header video for the home page (the video behind the H1) from the header film Joe sends.

    python3 docs/video/make_header.py /path/to/Pet_Waste_Website_Header.mp4

Needs ffmpeg and Pillow. Writes into static/assets/video/. The original is 4K and 127 MB and is NOT kept in the repo.
  header-wide-v1.mp4   1280 by 720, for computers, tablets and a phone held sideways. About 1.9 MB
  header-tall-v1.mp4   540 by 864, the middle of the picture, for a phone held upright. About 1 MB
  header-wide.webp, header-tall.webp   the first frame of each file. The page shows this picture first.
No sound track. The film sits under a dark navy layer on the page, so a little softness does not show:
CRF 32 was the smallest that still looked clean under that layer (checked Nov 15, 2026).
If a file changes, give it a new name (v2), because browsers keep /assets/ files for a year. Then change the names on the hero in design/generator/main.tpl.html."""
import os
import subprocess
import sys
from PIL import Image

SRC = sys.argv[1]
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
OUT = os.path.join(ROOT, 'static', 'assets', 'video') + os.sep
TMP = os.path.join(ROOT, 'docs', 'video', '.tmp') + os.sep
X264 = ['-c:v', 'libx264', '-preset', 'veryslow', '-crf', '32', '-profile:v', 'high', '-pix_fmt', 'yuv420p', '-g', '96', '-bf', '3',
        '-x264-params', 'aq-mode=3', '-color_range', 'tv', '-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709',
        '-movflags', '+faststart', '-map_metadata', '-1', '-an']
# name, picture filter, picture quality
CUTS = [('header-wide', 'scale=1280:720:flags=lanczos', 58),
        ('header-tall', 'crop=ih*5/8:ih,scale=540:864:flags=lanczos', 60)]


def sh(args):
    subprocess.run(['ffmpeg', '-v', 'error', '-y'] + args, check=True)


os.makedirs(OUT, exist_ok=True)
os.makedirs(TMP, exist_ok=True)
for name, vf, q in CUTS:
    mp4 = OUT + name + '-v1.mp4'
    sh(['-i', SRC, '-vf', vf] + X264 + [mp4])
    sh(['-i', mp4, '-frames:v', '1', TMP + name + '.png'])
    Image.open(TMP + name + '.png').convert('RGB').save(OUT + name + '.webp', 'WEBP', quality=q, method=6)
    print(name, os.path.getsize(mp4), 'bytes video,', os.path.getsize(OUT + name + '.webp'), 'bytes picture')
