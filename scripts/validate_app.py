#!/usr/bin/env python3
"""Validate the static app and public-fixture snapshot before deployment."""
from html.parser import HTMLParser
from pathlib import Path
import json, re, subprocess, tempfile

class Scripts(HTMLParser):
    def __init__(self):
        super().__init__()
        self.capture = False
        self.buffers = []
    def handle_starttag(self, tag, attrs):
        if tag == 'script' and not dict(attrs).get('src'):
            self.capture = True
            self.buffers.append('')
    def handle_data(self, data):
        if self.capture:
            self.buffers[-1] += data
    def handle_endtag(self, tag):
        if tag == 'script':
            self.capture = False

html = Path('index.html').read_text(encoding='utf-8')
p=Scripts();p.feed(html)
if not p.buffers:
    raise RuntimeError('No inline scripts in index.html')
for code in p.buffers:
    if not code.strip():
        continue
    with tempfile.NamedTemporaryFile('w', suffix='.js', delete=False) as tmp:
        tmp.write(code)
    try:
        subprocess.run(['node','--check',tmp.name], check=True)
    finally:
        Path(tmp.name).unlink(missing_ok=True)
assert 'UPLOAD SPONSOR LOGO' in html
assert 'chooseFixtureDay' in html
assert 'app-focus' in html
assert 'deleteSponsor' in html
assert 'fixtureCatalog' in html
assert 'assets/workspace-theme.css' in html, 'Theme CSS must be linked by the application'
assert 'assets/fonts.css?v=typography-20261029-r2' in html, 'Self-hosted font stylesheet must load early with a fresh cache key'
assert 'rel="preload" href="assets/fonts/manrope-400-800-latin.woff2"' in html, 'Primary font must be preloaded'
assert 'rel="preload" href="assets/fonts/ibm-plex-mono-700-latin.woff2"' in html, 'Used metadata font weight must be preloaded'
assert 'assets/workspace-theme.css?v=typography-20261029-r2' in html, 'Theme stylesheet cache key must be refreshed'
assert "html,body{background:#050505!important;color:#f5f5f5!important;font-family:'Manrope'" in html, 'Base font must match final Manrope theme before stylesheet loads'
assert 'identity-lockup' in html, 'Partner logo lockup missing'
assert 'dashboard-banner' in html, 'Orange workspace dashboard ribbon missing'
assert 'match-tile-grid' in html, 'Responsive match cards missing'
theme=Path('assets/workspace-theme.css').read_text(encoding='utf-8')
fonts_css=Path('assets/fonts.css').read_text(encoding='utf-8')
for stylesheet in [html,theme,fonts_css]:
    assert 'fonts.googleapis.com' not in stylesheet and 'fonts.gstatic.com' not in stylesheet, 'Fonts must never depend on external Google services'
font_files=re.findall(r"url\('fonts/([^']+\.woff2)'\)",fonts_css)
assert len(font_files)==22 and len(set(font_files))==22, 'Expected all 22 self-hosted font subsets'
for filename in font_files:
    font_path=Path('assets/fonts')/filename
    assert font_path.exists() and font_path.stat().st_size>5000, f'Missing or incomplete font: {filename}'
    assert font_path.read_bytes()[:4]==b'wOF2', f'Invalid WOFF2 font: {filename}'
for family in ['manrope','dmsans','ibmplexmono','barlowcondensed']:
    assert (Path('assets/fonts')/f'OFL-{family}.txt').exists(), f'Missing font license for {family}'
for selector in ['.identity-lockup', '.ops-nav', '.dashboard-banner', '.match-tile', '.studio-grid', '.sponsor-rail', '.insight-block', '.modal', '.login-central', '@media(max-width:680px)']:
    assert selector in theme, f'Theme missing {selector}'
assert theme.count('{')==theme.count('}'), 'Theme CSS delimiters unbalanced'
logo_asset=Path('assets/seebot-wordmark-orange-20261029.svg')
assert logo_asset.exists(), 'Updated orange Powered by logo missing'
orange_logo=logo_asset.read_text(encoding='utf-8')
assert '#FF7A3D' in orange_logo and '#F4F5F5' not in orange_logo, 'Brand color must match user-provided orange'
assert html.count('assets/seebot-wordmark-orange-20261029.svg')==3, 'All header views must use new orange logo'
assert 'assets/powered-by-seebot.svg' not in html, 'Cached legacy logo references must not remain'
payload=json.loads(Path('data/fixtures.json').read_text(encoding='utf-8'))
assert len(payload.get('matches',[]))>=10
assert len(payload.get('clubs',[]))>=10
assert all({'id','date','home','away','status','venue','time'} <= m.keys() for m in payload['matches'])
assert all('logo' in c for c in payload['clubs'])
print(f"Validated {len(p.buffers)} scripts, {len(payload['matches'])} fixtures, {len(payload['clubs'])} clubs")
