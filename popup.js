(async function () {
  const A = JT_Analyzer, S = JT_Store;
  const $ = id => document.getElementById(id);
  const apps = await S.getApps();
  const profile = await S.getProfile();
  const startToday = new Date(); startToday.setHours(0, 0, 0, 0);
  const weekAgo = Date.now() - 7 * 864e5;
  $('sToday').textContent = apps.filter(a => new Date(a.appliedAt) >= startToday).length;
  $('sWeek').textContent = apps.filter(a => new Date(a.appliedAt).getTime() >= weekAgo).length;
  $('sTotal').textContent = apps.length;
  $('sInt').textContent = apps.filter(a => S.everReached(a, A.INTERVIEW)).length;
  $('auto').checked = profile.autoDetect !== false;
  const ints = apps.filter(a => a.track === 'intern');
  const next = (((profile.intern || {}).placement || {}).deadlines || []).filter(d => d.date && new Date(d.date + 'T23:59:59') >= new Date()).sort((x, y) => x.date < y.date ? -1 : 1)[0];
  if (ints.length || next) {
    const left = next ? Math.ceil((new Date(next.date + 'T23:59:59') - Date.now()) / 864e5) : null;
    $('plLine').textContent = `Internships: ${ints.length}` + (ints.length ? ` · fit your rules: ${ints.filter(a => a.placement && a.placement.verdict === 'ok').length}` : '') + (next ? ` · ${next.label}: ${left === 0 ? 'today' : 'in ' + left + ' day' + (left === 1 ? '' : 's')}` : '');
  }
  $('auto').onchange = async () => { const p = await S.getProfile(); p.autoDetect = $('auto').checked; await S.saveProfile(p); };

  const ul = $('recent');
  if (!apps.length) ul.innerHTML = '<li class="empty">Nothing yet. Press Apply on a job board or add a job by hand.</li>';
  apps.slice().sort((x, y) => new Date(y.appliedAt) - new Date(x.appliedAt)).slice(0, 5).forEach(a => {
    const li = document.createElement('li');
    li.innerHTML = `<div class="t"></div><div class="m"><span class="c"></span><span><i class="dot"></i><span class="s"></span></span></div>`;
    li.querySelector('.t').textContent = a.title || 'Untitled';
    li.querySelector('.c').textContent = [a.company, new Date(a.appliedAt).toLocaleDateString('en-GB')].filter(Boolean).join(' · ');
    li.querySelector('.s').textContent = A.statusLabel(a.status);
    li.querySelector('.dot').style.background = A.statusColor(a.status);
    li.onclick = () => chrome.runtime.sendMessage({ type: 'openDashboard', hash: '#app=' + a.id });
    ul.appendChild(li);
  });

  $('dash').onclick = () => chrome.runtime.sendMessage({ type: 'openDashboard' });

  $('check').onclick = async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab || !/^https?:/.test(tab.url || '')) { $('msg').textContent = 'Open a job page first.'; return; }
    try {
      await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['lib/quality.js', 'lib/analyzer.js', 'lib/store.js', 'lib/extract.js', 'lib/cv.js', 'content.js'] });
      await chrome.tabs.sendMessage(tab.id, { type: 'preview' });
      window.close();
    } catch (e) { $('msg').textContent = 'Couldn\'t read this page.'; }
  };

  $('add').onclick = async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab || !/^https?:/.test(tab.url || '')) { $('msg').textContent = 'Can\'t add from this page. Open a job page, or add the application in the dashboard.'; return; }
    try {
      await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['lib/quality.js', 'lib/analyzer.js', 'lib/store.js', 'lib/extract.js', 'lib/cv.js', 'content.js'] });
      await chrome.tabs.sendMessage(tab.id, { type: 'manualAdd' });
      window.close();
    } catch (e) {
      $('msg').textContent = 'Couldn\'t read this page. Add the application by hand in the dashboard.';
    }
  };
})();
