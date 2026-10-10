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
  $('auto').onchange = async () => { const p = await S.getProfile(); p.autoDetect = $('auto').checked; await S.saveProfile(p); };

  const ul = $('recent');
  if (!apps.length) ul.innerHTML = '<li class="empty">Пока пусто. Нажми «Apply» на сайте вакансий или добавь вакансию вручную.</li>';
  apps.slice().sort((x, y) => new Date(y.appliedAt) - new Date(x.appliedAt)).slice(0, 5).forEach(a => {
    const li = document.createElement('li');
    li.innerHTML = `<div class="t"></div><div class="m"><span class="c"></span><span><i class="dot"></i><span class="s"></span></span></div>`;
    li.querySelector('.t').textContent = a.title || 'Без названия';
    li.querySelector('.c').textContent = [a.company, new Date(a.appliedAt).toLocaleDateString('ru-RU')].filter(Boolean).join(' · ');
    li.querySelector('.s').textContent = A.statusLabel(a.status);
    li.querySelector('.dot').style.background = A.statusColor(a.status);
    li.onclick = () => chrome.runtime.sendMessage({ type: 'openDashboard', hash: '#app=' + a.id });
    ul.appendChild(li);
  });

  $('dash').onclick = () => chrome.runtime.sendMessage({ type: 'openDashboard' });

  $('check').onclick = async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab || !/^https?:/.test(tab.url || '')) { $('msg').textContent = 'Открой страницу с вакансией.'; return; }
    try {
      await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['lib/analyzer.js', 'lib/store.js', 'lib/extract.js', 'content.js'] });
      await chrome.tabs.sendMessage(tab.id, { type: 'preview' });
      window.close();
    } catch (e) { $('msg').textContent = 'Не получилось прочитать страницу.'; }
  };

  $('add').onclick = async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab || !/^https?:/.test(tab.url || '')) { $('msg').textContent = 'На этой странице добавить нельзя. Открой страницу вакансии или добавь заявку в дашборде.'; return; }
    try {
      await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['lib/analyzer.js', 'lib/store.js', 'lib/extract.js', 'content.js'] });
      await chrome.tabs.sendMessage(tab.id, { type: 'manualAdd' });
      window.close();
    } catch (e) {
      $('msg').textContent = 'Не получилось прочитать страницу. Добавь заявку вручную в дашборде.';
    }
  };
})();
