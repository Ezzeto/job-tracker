"""Internships + CV & ATS end-to-end check: pastes placement rules, imports CV files,
captures a fake internship page and opens the drawer. Reports console errors.

Usage: python3 tests/e2e/intern.py <path-to-extension> [cv.pdf|cv.docx ...] [--shots DIR]
"""
import sys, json, asyncio, os, shutil, tempfile
from playwright.async_api import async_playwright

args = sys.argv[1:]
OUT = None
if '--shots' in args:
    i = args.index('--shots'); OUT = args[i + 1]; del args[i:i + 2]
EXT = os.path.abspath(args[0] if args else '.')
CVS = [os.path.abspath(a) for a in args[1:]]

RULES = """Placement period: 25 January 2027 – 28 May 2027. Minimum length 12 weeks.
Full-time, 35-40 hours per week, Monday to Friday. Computing students work 4 days per week (one day for classes).
Overseas companies: the placement must be fully remote. Paid placements are recommended.
18 November – submit your placement on My Placement.
27 November – employer risk assessment.
4 December – student risk assessment."""

JOB_HTML = """<!doctype html><html><head><title>AI Engineering Intern - Brightloop Labs - Remote | Indeed.com</title>
<script type="application/ld+json">{"@context":"https://schema.org","@type":"JobPosting","title":"AI Engineering Intern (Spring 2027)",
"hiringOrganization":{"@type":"Organization","name":"Brightloop Labs"},"jobLocationType":"TELECOMMUTE",
"employmentType":"INTERN","description":"<p>Spring internship, February 2027 to May 2027 (14 weeks), 37.5 hours per week, fully remote.</p><h3>Requirements</h3><ul><li>Python and SQL</li><li>Git</li><li>Some PyTorch or scikit-learn</li></ul><p>Paid: £22,000 pro rata. Currently studying Computer Science or a related degree.</p>"}</script></head>
<body><main><div id="jobsearch-ViewjobPaneWrapper"><h1 data-testid="jobsearch-JobInfoHeader-title">AI Engineering Intern (Spring 2027)</h1>
<div data-testid="inlineHeader-companyName">Brightloop Labs</div><div data-testid="inlineHeader-companyLocation">Remote</div>
<div id="jobDescriptionText"><p>Spring internship, February 2027 to May 2027 (14 weeks), 37.5 hours per week, fully remote.</p><h3>Requirements</h3><ul><li>Python and SQL</li><li>Git</li><li>Some PyTorch or scikit-learn</li></ul><p>Paid: £22,000 pro rata. Currently studying Computer Science or a related degree. You will join our applied AI team, building retrieval tools and evaluation pipelines for language models, writing tests and documentation, and presenting your work to the wider engineering group every fortnight. A mentor will support you throughout the programme.</p></div>
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
        page = await ctx.new_page()
        page.on('pageerror', lambda e: errors.append('PAGE: ' + str(e)))
        page.on('console', lambda m: m.type == 'error' and errors.append('CONSOLE: ' + m.text))
        base = f'chrome-extension://{ext_id}/dashboard.html'

        # 1. Placement rules from pasted text
        await page.goto(base + '#intern'); await asyncio.sleep(0.8)
        await page.fill('#plPaste', RULES); await page.click('#plRead'); await asyncio.sleep(0.8)
        print('RULES MSG:', await page.inner_text('#plMsg'))
        pl = await sw.evaluate("JT_Store.getProfile().then(p => p.intern.placement)")
        print('RULES:', json.dumps(pl))
        if OUT: await page.screenshot(path=f'{OUT}/intern.png', full_page=True)

        # 2. CV import (internship CV)
        await page.goto(base + '#cv'); await asyncio.sleep(0.8)
        await page.wait_for_function("!!globalThis.JT_ReadCV", timeout=8000)
        for f in CVS:
            await page.set_input_files('#cvCards input[data-file="intern"]', f); await asyncio.sleep(2.5)
            cvs = await sw.evaluate("chrome.storage.local.get('cvs').then(r => r.cvs || {})")
            c = cvs.get('intern') or {}
            skills = await sw.evaluate("JT_Store.getProfile().then(p => p.intern.skills)")
            print(f'CV {os.path.basename(f)}: kind={c.get("kind")} pages={c.get("pages")} chars={len(c.get("text") or "")} skills={len(skills)}',
                  json.dumps(dict(list(skills.items())[:12])))
        if CVS:
            txt = await page.inner_text('#cvCards')
            print('CV CARD:', txt[:400].replace('\n', ' | '))
            if OUT: await page.screenshot(path=f'{OUT}/cv.png', full_page=True)

        # 3. Capture an internship from a job page
        job = await ctx.new_page()
        job.on('pageerror', lambda e: errors.append('JOB: ' + str(e)))
        job.on('console', lambda m: m.type in ('error', 'warning') and errors.append('JOB console: ' + m.text))
        await ctx.route('https://uk.indeed.com/**', lambda r: r.fulfill(status=200, content_type='text/html', body=JOB_HTML))
        await job.goto('https://uk.indeed.com/viewjob?jk=intern12345'); await asyncio.sleep(3)
        badge = await job.evaluate("(() => { const h = document.getElementById('job-tracker-host'); const b = h && h.shadowRoot.querySelector('.badge'); return b && b.innerText; })()")
        print('BADGE:', badge)
        if not badge:
            await ctx.close(); print('ERRORS:', json.dumps(errors, indent=1)); return
        await job.evaluate("document.getElementById('job-tracker-host').shadowRoot.querySelector('.badge').click()"); await asyncio.sleep(0.6)
        prev = await job.evaluate("document.getElementById('job-tracker-host').shadowRoot.querySelector('.jt').innerText")
        print('PREVIEW:', prev[:600].replace('\n', ' | '))
        if OUT: await job.screenshot(path=f'{OUT}/intern-preview.png')
        await job.click('#jobsearch-ApplyButton'); await asyncio.sleep(2)
        apps = await sw.evaluate("JT_Store.getApps()")
        a = apps[-1] if apps else {}
        print('CAPTURED:', a.get('track'), a.get('title'), a.get('chance', {}).get('score'), (a.get('placement') or {}).get('verdict'),
              [(i['key'], i['state']) for i in (a.get('placement') or {}).get('items', [])], 'ats:', (a.get('atsMatch') or {}).get('score'))

        # 4. Dashboard views with the new data
        for view in ['overview', 'apps', 'intern', 'cv']:
            await page.goto(base + '#' + view); await asyncio.sleep(0.8)
        if a.get('id'):
            await page.goto(base + '#app=' + a['id']); await asyncio.sleep(1)
            d = await page.inner_text('#drawer') if await page.query_selector('#drawer') else ''
            print('DRAWER has placement:', 'Placement' in d, '| ATS:', 'ATS' in d or 'CV match' in d)
            if OUT: await page.screenshot(path=f'{OUT}/intern-drawer.png')
        await page.goto(f'chrome-extension://{ext_id}/popup.html'); await asyncio.sleep(0.6)
        print('POPUP:', (await page.inner_text('body'))[:300].replace('\n', ' | '))
        await ctx.close()
    shutil.rmtree(user, ignore_errors=True)
    print('ERRORS:', json.dumps(errors, indent=1) if errors else 'none')

asyncio.run(main())
