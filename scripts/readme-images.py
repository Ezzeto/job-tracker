#!/usr/bin/env python3
"""Turns the raw screenshots from tests/e2e/screens.js into the README images in docs/images/.
Usage: python3 scripts/readme-images.py [raw-dir, default docs/images/.raw]   (needs Pillow)"""
import os, sys, glob
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'docs', 'images')
RAW = sys.argv[1] if len(sys.argv) > 1 else os.path.join(OUT, '.raw')
os.makedirs(OUT, exist_ok=True)
for f in glob.glob(os.path.join(OUT, '*.jpg')): os.remove(f)

def im(n): return Image.open(os.path.join(RAW, n + '.png'))
def save(img, name, w):
    if img.width > w: img = img.resize((w, round(img.height * w / img.width)), Image.LANCZOS)
    img.convert('RGB').save(os.path.join(OUT, name), quality=84, optimize=True)

save(im('panel-analysis'), 'job-panel.jpg', 1600)
save(im('panel-letter'), 'job-panel-letter.jpg', 1600)
# The five tabs of the panel side by side (the panel sits at the right of a 1440 px window, 2x)
tabs = [im(t).crop((2075, 15, 2865, 1785)) for t in ['panel-analysis', 'panel-skills', 'panel-job', 'panel-application', 'panel-letter']]
strip = Image.new('RGB', (sum(c.width for c in tabs) + 40 * 6, max(c.height for c in tabs) + 80), (233, 236, 230))
x = 40
for c in tabs: strip.paste(c, (x, 40)); x += c.width + 40
save(strip, 'job-panel-tabs.jpg', 2400)
save(im('popup'), 'popup.jpg', 380)
save(im('progress'), 'progress.jpg', 1400)
save(im('applications'), 'applications.jpg', 1400)
save(im('drawer'), 'application-card.jpg', 1400)
c = im('cv-skills')
save(c.crop((0, 0, c.width, 2000)), 'cv-skills.jpg', 1400)
save(c.crop((0, c.height - 760, c.width, c.height)), 'what-you-lack.jpg', 1400)
s = im('settings'); save(s.crop((0, 0, s.width, min(s.height, 3000))), 'settings.jpg', 1400)
q = im('session'); save(q.crop((0, 0, q.width, min(q.height, 2400))), 'session.jpg', 1400)
save(im('autofill'), 'autofill.jpg', 1400)
for n in ['phone-today', 'phone-check', 'phone-stats', 'phone-more']: save(im(n), n + '.jpg', 540)
save(im('web-today'), 'web-today.jpg', 1400)
save(im('web-stats'), 'web-stats.jpg', 1400)
print('\n'.join(sorted(os.listdir(OUT))))
