"""Render still frames of the scene with fixed transforms, to check the drawing (no browser)."""
import re, subprocess, sys
sys.path.insert(0, '.')
import scene

svg = scene.SCENE[:scene.SCENE.index('</svg>') + 6].replace('@@ID@@', 't')
svg = svg.replace('<svg viewBox', '<svg xmlns="http://www.w3.org/2000/svg" width="720" height="540" viewBox', 1)
svg = re.sub(r'<rect class="flash"[^>]*></rect>', '', svg)
svg = re.sub(r'<(circle|path) class="(mist|spark)[^"]*"[^>]*></\1>', '', svg)

def frame(name, cam, truck, tech=None, face=1, dog=0, rr=None, gone=0, gate=1.0):
    s = svg
    tx, ty, sc = cam
    s = s.replace('<g class="cam">', '<g transform="translate(%s %s) scale(%s)">' % (tx, ty, sc))
    s = s.replace('<g class="truck">', '<g transform="translate(%s 0)">' % truck)
    if tech:
        s = s.replace('<g class="tech"><g class="face">', '<g transform="translate(%s %s)"><g transform="translate(0 0) scale(%s 1)">' % (tech[0], tech[1], face))
    else:
        s = s.replace('<g class="tech"><g class="face">', '<g display="none"><g>')
    s = s.replace('<g class="dogw">', '<g transform="translate(0 %s)">' % dog)
    s = s.replace('<g class="rr">', '<g transform="translate(%s %s)">' % rr if rr else '<g display="none">')
    s = s.replace('<g class="gate"', '<g transform="translate(548 0) scale(%s 1) translate(-548 0)"' % gate)
    for i in range(1, gone + 1):
        s = s.replace('class="pile p%d"' % i, 'display="none" class="pile p%d"' % i)
    open('frames/%s.svg' % name, 'w').write(s)
    subprocess.run(['rsvg-convert', 'frames/%s.svg' % name, '-o', 'frames/%s.png' % name], check=True)

frame('1_start', (-150, 0, 1), 200, rr=(300, 188))
frame('2_arrive', (-330, 0, 1), 440, tech=(520, 188), dog=0)
frame('3_zoom', (-981, -117, 1.8), 440, tech=(700, 148), face=-1, gone=3, gate=1)
frame('4_gate', (-602, -87, 1.4), 440, tech=(557, 184), face=-1, gone=8)
frame('5_leave', (-480, 0, 1), 720, gone=8, dog=14)
print('ok')
