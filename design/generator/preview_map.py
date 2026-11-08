import re, subprocess, sys
import truemap
dark = len(sys.argv) > 1 and sys.argv[1] == 'dark'
sel = sys.argv[2] if len(sys.argv) > 2 else 'bV'
svg = truemap.build('pickV', 'pickC', 'pickG', 'pickL')
for h in ('bV', 'bC', 'bG', 'bL'):
    svg = svg.replace('{{ %s }}' % h, 'rgba(255,74,28,.40)' if h == sel else 'rgba(255,74,28,0)')
svg = re.sub(r' onClick="\{\{ \w+ \}\}"', '', svg)
svg = svg.replace('<g class="mtruck">', '<g class="mtruck" transform="translate(193 190)">')
css = truemap.MAP_CSS
css = re.sub(r'@keyframes[^}]*\}[^}]*\}', '', css)
head, rest = svg.split('>', 1)
head = head.replace('<svg ', '<svg xmlns="http://www.w3.org/2000/svg" width="1170" height="963" ')
svg = head + '><style>' + css + '</style><g class="%s">' % ('dark' if dark else '') + rest.replace('</svg>', '</g></svg>')
open('/tmp/map_prev.svg', 'w').write(svg)
out = '/tmp/map_prev_%s.png' % ('dark' if dark else 'light')
subprocess.run(['rsvg-convert', '-o', out, '/tmp/map_prev.svg'], check=True)
print(out)
