#!/usr/bin/env python3
"""Validate the React app and public-fixture snapshot before deployment."""
from pathlib import Path
import json

html = Path('index.html').read_text(encoding='utf-8')
legacy = Path('src/legacy/app.ts').read_text(encoding='utf-8')
app = Path('src/App.tsx').read_text(encoding='utf-8')
react_entry = Path('src/main.tsx').read_text(encoding='utf-8')
styles = Path('src/styles/original.css').read_text(encoding='utf-8')

assert '<div id="root"></div>' in html
assert 'src="/src/main.tsx"' in html, 'Vite/React entry missing'
assert 'createRoot(root).render(<App />)' in react_entry
assert '<ScreenHost />' in app
assert 'initializeLegacy' in legacy
native_match = Path('src/components/MatchScreens.tsx').read_text(encoding='utf-8')
assert 'function FixtureCatalog' in native_match, 'Match catalog must be a React component'
native_screens = ''.join(path.read_text(encoding='utf-8') for path in Path('src/components').glob('*.tsx'))
for name in ['LoginScreen', 'DashboardScreen', 'MatchesScreen', 'AnnotationStudioScreen',
             'SponsorLibraryScreen', 'AttributesScreen', 'TeamScreen', 'InsightsScreen']:
    assert f'function {name}' in native_screens, f'{name} must have a native React implementation'
assert 'dangerouslySetInnerHTML' not in native_screens, 'Screen markup must be React-owned'
for removed_view in ['loginView', 'dashboard', 'tasksView', 'studio', 'sponsorsView',
                     'attrsView', 'usersView', 'reportsView']:
    assert f'function {removed_view}(' not in legacy, f'Obsolete HTML screen remains: {removed_view}'
for token in ['UPLOAD SPONSOR LOGO', 'chooseFixtureDay', 'app-focus',
              'deleteSponsor', 'dashboard-banner',
              'match-tile-grid', 'identity-lockup']:
    assert token in legacy or token in styles or token in native_screens, f'Missing application feature: {token}'
assert "import './styles/workspace-theme.css'" in react_entry, 'Theme CSS must be loaded after original styles'
theme=Path('src/styles/workspace-theme.css').read_text(encoding='utf-8')
for selector in ['.identity-lockup', '.ops-nav', '.dashboard-banner', '.match-tile', '.studio-grid', '.sponsor-rail', '.insight-block', '.modal', '.login-central', '@media(max-width:680px)']:
    assert selector in theme, f'Theme missing {selector}'
assert theme.count('{')==theme.count('}'), 'Theme CSS delimiters unbalanced'
logo_asset=Path('public/assets/seebot-wordmark-orange-20261029.svg')
assert logo_asset.exists(), 'Updated orange Powered by logo missing'
orange_logo=logo_asset.read_text(encoding='utf-8')
assert '#FF7A3D' in orange_logo and '#F4F5F5' not in orange_logo, 'Brand color must match user-provided orange'
shell = Path('src/components/AppShell.tsx').read_text(encoding='utf-8')
login = Path('src/components/LoginScreen.tsx').read_text(encoding='utf-8')
assert login.count('assets/seebot-wordmark-orange-20261029.svg')==1
assert shell.count('assets/seebot-wordmark-orange-20261029.svg')==1, 'React shell must use orange logo'
assert 'assets/powered-by-seebot.svg' not in legacy, 'Cached legacy logo references must not remain'
payload=json.loads(Path('public/data/fixtures.json').read_text(encoding='utf-8'))
assert len(payload.get('matches',[]))>=10
assert len(payload.get('clubs',[]))>=10
assert all({'id','date','home','away','status','venue','time'} <= m.keys() for m in payload['matches'])
assert all('logo' in c for c in payload['clubs'])
print(f"Validated React entry, legacy feature parity, {len(payload['matches'])} fixtures, {len(payload['clubs'])} clubs")
