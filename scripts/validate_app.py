#!/usr/bin/env python3
"""Validate the static app and public-fixture snapshot before deployment."""
from html.parser import HTMLParser
from pathlib import Path
import json, subprocess, tempfile

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
payload=json.loads(Path('data/fixtures.json').read_text(encoding='utf-8'))
assert len(payload.get('matches',[]))>=10
assert len(payload.get('clubs',[]))>=10
assert all({'id','date','home','away','status','venue','time'} <= m.keys() for m in payload['matches'])
assert all('logo' in c for c in payload['clubs'])
print(f"Validated {len(p.buffers)} scripts, {len(payload['matches'])} fixtures, {len(payload['clubs'])} clubs")
