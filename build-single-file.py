"""Bundle the whole app into one self-contained .html.

Why: a multi-file download can fail in ways that look like a "syntax error" —
opening the zip without extracting, opening app.js instead of index.html, or the
files getting separated. One file has none of those failure modes.
"""
import base64, pathlib, re

src = pathlib.Path(__file__).resolve().parent
html = (src / 'index.html').read_text()
css = (src / 'styles.css').read_text()
js = (src / 'app.js').read_text()

assert '</script' not in js.lower(), 'app.js contains a closing script tag'

# favicon + apple touch icon as data URIs so there are no missing files
svg = (src / 'icon.svg').read_text()
svg_uri = 'data:image/svg+xml;base64,' + base64.b64encode(svg.encode()).decode()
png_uri = 'data:image/png;base64,' + base64.b64encode((src / 'apple-touch-icon.png').read_bytes()).decode()

html = html.replace('<link rel="stylesheet" href="styles.css">', '<style>\n' + css + '\n</style>')
html = html.replace('<script src="app.js" defer></script>', '<script>\n' + js + '\n</script>')
html = html.replace('<link rel="icon" href="icon.svg" type="image/svg+xml">',
                    '<link rel="icon" href="' + svg_uri + '" type="image/svg+xml">')
html = html.replace('<link rel="apple-touch-icon" href="apple-touch-icon.png">',
                    '<link rel="apple-touch-icon" href="' + png_uri + '">')
# The manifest and service worker cannot work from a file:// page; drop the link
# (the registration itself is already guarded on http/https).
html = re.sub(r'\s*<link rel="manifest"[^>]*>', '', html)

banner = ('<!-- RouteDesk V1.7 — single-file build.\n'
          '     Open this file directly. No server, no install, no other files needed. -->\n')
out = src / 'RouteDesk-Driver-Mode.html'
out.write_text(banner + html)
print('wrote', out, f'{out.stat().st_size/1024:.0f} KB')
print('remaining external refs:', re.findall(r'(?:src|href)="(?!data:|#)[^"]+"', html))
