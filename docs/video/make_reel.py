"""Makes the home page video files (the phone in How it works) from the ad videos Joe sends.

    python3 docs/video/make_reel.py /path/to/folder/with/the/originals

Needs ffmpeg and Pillow. Writes into static/assets/video/. The originals are 30 to 55 MB each and are NOT kept in the repo.
For each video it writes:
  NAME-sale-v1.mp4   the ad as sent, 540 by 960, no sound track, about 1 to 1.8 MB
  NAME-v1.mp4        the December cut: everything before the "first month free" captions, then the closing card
                     with the offer line taken out (not made for an ad that is only about the sale)
  NAME.jpg, NAME-360.webp, NAME-540.webp   the first frame of the web file, shown until the video plays

Why these settings: the phone on the page is about 270 px wide, so 540 wide is two pixels for each one on screen.
The footage is hand held with a cut every 0.87 seconds over gravel and turf, which is hard to shrink. CRF 31 at 540 wide
was the smallest file that still looked clean next to the original at that size (checked Nov 15, 2026).
If a file changes, give it a new name (v2), because browsers keep /assets/ files for a year.

KEEP is the number of frames before the offer caption starts to fade in. Find it by stepping through the video:
the cut must land while the caption before it is still solid. Then add the clip to _REEL in design/generator/parts.py
and to VIDEOS in build/build.mjs."""
import os
import subprocess
import sys
from PIL import Image

SRC = sys.argv[1] if len(sys.argv) > 1 else '.'
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
OUT = os.path.join(ROOT, 'static', 'assets', 'video') + os.sep
TMP = os.path.join(ROOT, 'docs', 'video', '.tmp') + os.sep
X264 = ['-c:v', 'libx264', '-preset', 'veryslow', '-crf', '31', '-profile:v', 'high', '-level', '3.1', '-g', '90', '-keyint_min', '26', '-bf', '3',
        '-x264-params', 'aq-mode=3', '-color_range', 'tv', '-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709',
        '-movflags', '+faststart', '-map_metadata', '-1', '-an']
# the originals are full range video (yuvj420p). Phones expect the normal range, so the picture is converted, not just relabeled.
VID = 'scale=540:960:flags=lanczos:in_color_matrix=bt709:in_range=pc:out_color_matrix=bt709:out_range=tv,format=yuv420p'
RGB = 'scale=540:960:flags=lanczos:out_color_matrix=bt709:out_range=tv,format=yuv420p'
# name on the site, original file, frames kept in the December cut (None: the ad is only for the sale)
CLIPS = [('dog-poop-pickup', 'APW-Ad-01-Every-Day.mp4', 156), ('gate-photo', 'APW-Ad-02-Gate-Photo.mp4', 252),
         ('free-spray', 'APW-Ad-03-Kennel-Smell.mp4', 252), ('black-friday', 'APW-Ad-04-Black-Friday.mp4', None)]
CARD_FROM = 'APW-Ad-02-Gate-Photo.mp4'  # any ad that ends on the white logo card
CARD_FRAMES = 48  # the card stays up 1.6 seconds


def sh(args):
    subprocess.run(['ffmpeg', '-v', 'error', '-y'] + args, check=True)


def card():
    """The closing card with the logo, Call or text, the number and the web address. The orange FIRST MONTH FREE line is left out."""
    sh(['-sseof', '-0.4', '-i', os.path.join(SRC, CARD_FROM), '-frames:v', '1', TMP + 'card.png'])
    src = Image.open(TMP + 'card.png').convert('RGB')
    logo = src.crop((0, 420, 1080, 745))      # the logo
    info = src.crop((0, 1170, 1080, 1575))    # Call or text, the number, the web address
    gap = 150
    y = (1920 - (logo.size[1] + gap + info.size[1])) // 2
    out = Image.new('RGB', (1080, 1920), src.getpixel((20, 20)))
    out.paste(logo, (0, y))
    out.paste(info, (0, y + logo.size[1] + gap))
    out.save(TMP + 'card-after.png')
    return TMP + 'card-after.png'


def main():
    os.makedirs(OUT, exist_ok=True)
    os.makedirs(TMP, exist_ok=True)
    after = card()
    for name, src, keep in CLIPS:
        src = os.path.join(SRC, src)
        sale = OUT + name + '-sale-v1.mp4'
        sh(['-i', src, '-vf', VID] + X264 + [sale])
        if keep:
            sh(['-i', src, '-loop', '1', '-framerate', '30', '-t', '%.4f' % (CARD_FRAMES / 30.0), '-i', after, '-filter_complex',
                '[0:v]trim=end_frame=%d,setpts=PTS-STARTPTS,%s,setsar=1[a];[1:v]%s,setsar=1[b];[a][b]concat=n=2:v=1:a=0[v]' % (keep, VID, RGB),
                '-map', '[v]', '-r', '30'] + X264 + [OUT + name + '-v1.mp4'])
        # the still is the first frame of the web file itself, so the picture does not jump when the video starts
        sh(['-i', sale, '-frames:v', '1', TMP + 'still.png'])
        im = Image.open(TMP + 'still.png').convert('RGB')
        im.save(OUT + name + '.jpg', quality=74, optimize=True, progressive=True)
        im.save(OUT + name + '-540.webp', quality=62, method=6)
        im.resize((360, 640), Image.LANCZOS).save(OUT + name + '-360.webp', quality=66, method=6)
    for f in sorted(os.listdir(OUT)):
        print('%-34s %8.1f KB' % (f, os.path.getsize(OUT + f) / 1024.0))


main()
