# Device Lab page builder: template head + Machine Skill kit (inlined) + XR add-on + device script
# Usage: python3 build.py [name ...]   -> writes ../itu-mirror-worlds/lab/<name>.html
import sys, os, re, json
HERE = os.path.dirname(os.path.abspath(__file__))
KIT = os.environ.get('LAB_KIT', 'machine-skill/kit/lab-kit.js')   # clone github.com/AirsupHQ/machine-skill next to this file
OUT = os.path.join(HERE, '..', 'lab')   # pages are written next to src/
os.makedirs(OUT, exist_ok=True)
kit = open(KIT).read().replace('</script', '<\\/script')
xr = open(os.path.join(HERE, 'xr.js')).read().replace('</script', '<\\/script')
meta = json.load(open(os.path.join(HERE, 'devices.json')))

HEAD = '''<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{title} · Device Lab</title>
<meta name="description" content="{desc}">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&family=Inter:wght@400;500;600&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
<script type="importmap">
{{ "imports": {{
  "three": "https://cdn.jsdelivr.net/npm/three@0.170.0/build/three.module.js",
  "three/addons/": "https://cdn.jsdelivr.net/npm/three@0.170.0/examples/jsm/"
}} }}
</script>
</head>
<body>
'''
names = sys.argv[1:] or [m['id'] for m in meta]
for m in meta:
    if m['id'] not in names: continue
    dev = open(os.path.join(HERE, 'devices', m['id'] + '.js')).read()
    html = (HEAD.format(title=m['title'], desc=m['desc'])
        + '<!-- lab-kit:start -->\n<script type="module">\n' + kit + '\n</script>\n<!-- lab-kit:end -->\n'
        + '<!-- device-lab-xr -->\n<script type="module">\n' + xr + '\n</script>\n'
        + '<script type="module">\n' + dev + '\n</script>\n</body>\n</html>\n')
    open(os.path.join(OUT, m['id'] + '.html'), 'w').write(html)
    print('built', m['id'], len(html)//1024, 'KB')
