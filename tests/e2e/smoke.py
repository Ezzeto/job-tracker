"""Loads the unpacked extension in Chromium, seeds fictional data, opens every view,
captures a fake job page, and reports console errors. Optional screenshots."""
import sys, json, asyncio, os, shutil, tempfile
sys.path.insert(0, os.path.dirname(__file__))
from demo_data import APPS
from playwright.async_api import async_playwright

# Usage: python3 tests/e2e/smoke.py <path-to-extension> [screenshot-dir]
EXT = os.path.abspath(sys.argv[1] if len(sys.argv) > 1 else "."); OUT = sys.argv[2] if len(sys.argv) > 2 else None
JOB_HTML = """<!doctype html><html><head><title>Junior Python Developer - Fernhill Digital - Cambridge | Indeed.com</title>
<script type="application/ld+json">{"@context":"https://schema.org","@type":"JobPosting","title":"Junior Python Developer",
"hiringOrganization":{"@type":"Organization","name":"Fernhill Digital"},"jobLocation":{"@type":"Place","address":{"addressLocality":"Cambridge","addressRegion":"Cambridgeshire"}},
"employmentType":"PART_TIME","baseSalary":{"@type":"MonetaryAmount","currency":"GBP","value":{"@type":"QuantitativeValue","minValue":14,"maxValue":16,"unitText":"HOUR"}},
"description":"<p>We are a small product studio.</p><h3>Requirements</h3><ul><li>Strong Python and SQL</li><li>Experience with Git</li><li>Docker is essential</li></ul><h3>Nice to have</h3><ul><li>Django or FastAPI would be a plus</li></ul><h3>Benefits</h3><ul><li>25 days annual leave</li><li>Flexible working</li></ul><p>Contact Jane Porter at jobs@fernhill.example for questions. Training provided.</p>"}</script></head>
<body><main><div id="jobsearch-ViewjobPaneWrapper"><h1 data-testid="jobsearch-JobInfoHeader-title">Junior Python Developer</h1>
<div data-testid="inlineHeader-companyName">Fernhill Digital</div><div data-testid="inlineHeader-companyLocation">Cambridge</div>
<div id="jobDescriptionText"><p>We are a small product studio building internal tools for clients.</p><h3>Requirements</h3><ul><li>Strong Python and SQL</li><li>Experience with Git</li><li>Docker is essential</li></ul><h3>Nice to have</h3><ul><li>Django or FastAPI would be a plus</li></ul><h3>Benefits</h3><ul><li>25 days annual leave</li><li>Flexible working</li></ul><p>Contact Jane Porter at jobs@fernhill.example for questions. Training provided. Part-time, 3 days a week.</p></div>
<button id="jobsearch-ApplyButton">Apply now</button></div></main></body></html>"""

async def main():
    errors = []
    user = tempfile.mkdtemp()
    async with async_playwright() as p:
        ctx = await p.chromium.launch_persistent_context(user, headless=True, channel='chromium',
            args=[f'--disable-extensions-except={EXT}', f'--load-extension={EXT}'], viewport={'width': 1360, 'height': 860})
        sw = ctx.service_workers[0] if ctx.service_workers else await ctx.wait_for_event('serviceworker')
        ext_id = sw.url.split('/')[2]
        sw.on('console', lambda m: m.type == 'error' and errors.append('SW: ' + m.text))
        await asyncio.sleep(1.5)
        # onInstalled opens the dashboard on install; close extra tabs
        profile = await sw.evaluate("JT_Store.getProfile()")
        profile.update({'skills': {'Python': 'strong', 'SQL': 'strong', 'Git': 'strong', 'Linux': 'strong', 'Windows 10/11': 'strong',
            'REST APIs': 'basic', 'PostgreSQL': 'basic', 'FastAPI': 'basic', 'Docker': 'basic', 'Active Directory': 'basic', 'Microsoft 365': 'basic', 'LLMs / RAG': 'basic', 'pandas': 'basic'},
            'signName': 'Alex Example', 'areas': ['London', 'Cambridge', 'Hertfordshire', 'Stevenage', 'Hertford'], 'languages': ['Polish'],
            'pitch': 'second-year Computing student building Python and FastAPI projects'})
        await sw.evaluate("async ([apps, profile]) => { await chrome.storage.local.set({ apps, profile, counter: 8 }); }", [APPS, profile])
        page = await ctx.new_page()
        page.on('pageerror', lambda e: errors.append('PAGE: ' + str(e)))
        page.on('console', lambda m: m.type == 'error' and errors.append('CONSOLE: ' + m.text))
        base = f'chrome-extension://{ext_id}/dashboard.html'
        for view in ['overview', 'apps', 'offers', 'settings', 'data']:
            await page.goto(base + '#' + view); await asyncio.sleep(0.8)
            if OUT: await page.screenshot(path=f'{OUT}/dashboard-{view}.png', full_page=False)
        await page.goto(base + '#app=demo1'); await asyncio.sleep(0.8)
        if OUT: await page.screenshot(path=f'{OUT}/dashboard-drawer.png')
        await page.goto(f'chrome-extension://{ext_id}/popup.html'); await page.set_viewport_size({'width': 340, 'height': 560}); await asyncio.sleep(0.6)
        if OUT: await page.screenshot(path=f'{OUT}/popup.png', full_page=True)
        await page.set_viewport_size({'width': 1360, 'height': 860})
        # Fake Indeed job page
        job = await ctx.new_page()
        job.on('pageerror', lambda e: errors.append('JOB: ' + str(e)))
        job.on('console', lambda m: m.type in ('error', 'warning') and '[Job Tracker]' in m.text and errors.append('JOB: ' + m.text))
        await ctx.route('https://uk.indeed.com/**', lambda r: r.fulfill(status=200, content_type='text/html', body=JOB_HTML))
        await job.goto('https://uk.indeed.com/viewjob?jk=abcdef1234'); await asyncio.sleep(3)
        badge = await job.evaluate("(() => { const h = document.getElementById('job-tracker-host'); if (!h) return null; const b = h.shadowRoot.querySelector('.badge'); return b && b.innerText; })()")
        print('BADGE:', badge)
        await job.evaluate("document.getElementById('job-tracker-host').shadowRoot.querySelector('.badge').click()")
        await asyncio.sleep(0.6)
        if OUT: await job.screenshot(path=f'{OUT}/job-preview.png')
        await job.click('#jobsearch-ApplyButton'); await asyncio.sleep(2)
        panel = await job.evaluate("(() => { const p = document.getElementById('job-tracker-host').shadowRoot.querySelector('.jt'); return p && p.innerText.slice(0, 300); })()")
        print('PANEL:', (panel or '').replace('\n', ' | '))
        if OUT: await job.screenshot(path=f'{OUT}/job-saved.png')
        apps = await sw.evaluate("JT_Store.getApps()")
        new = [a for a in apps if not a['id'].startswith('demo')]
        print('CAPTURED:', [(a['ticket'], a['title'], a['company'], a['location'], a['salaryText'], a['chance']['score'], a['chance']['matched'], a['chance']['missing'], [c['value'] for c in a['contacts']]) for a in new])
        await ctx.close()
    shutil.rmtree(user, ignore_errors=True)
    print('ERRORS:', json.dumps(errors, indent=1) if errors else 'none')

asyncio.run(main())
