/* Job Tracker — the "Fill in the form" button on application forms.
 * Runs on known application systems (Greenhouse, Lever, Ashby, Workday, SmartRecruiters, Teamtailor,
 * Workable, NHS Jobs / Trac, TES, eTeach) and on any page where you press "Fill in this form" in the popup.
 * It fills, outlines and reports; it never presses Submit. When the page says the application went
 * through, the application is recorded in the tracker (with the CV and letter used and the time spent). */
(function () {
  'use strict';
  if (window.__jtAutofill) { window.__jtAutofill.open(); return; }
  const AF = window.JT_Autofill;
  const send = msg => new Promise(res => { try { chrome.runtime.sendMessage(msg, r => res(r || {})); } catch (e) { res({}); } });
  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  // LinkedIn Easy Apply is never filled automatically: it is against LinkedIn's rules
  if (/(^|\.)linkedin\.com$/.test(location.hostname)) return;

  const PANEL_CSS = `position:fixed;right:16px;bottom:16px;z-index:2147483646;font:14px/1.45 system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;color:#14201b`;
  let host = null, shadow = null, ctx = null, lastRep = null;

  function ui() {
    if (host) return;
    host = document.createElement('div');
    host.setAttribute('data-jt-panel', '1');
    host.style.cssText = PANEL_CSS;
    shadow = host.attachShadow({ mode: 'open' });
    shadow.innerHTML = `<style>
      .b{background:#1d6b4f;color:#fff;border:0;border-radius:14px;padding:12px 16px;font:600 14px system-ui;cursor:pointer;box-shadow:0 8px 24px rgba(0,0,0,.18)}
      .p{background:#fbfcfa;border:1px solid #d3d9d0;border-radius:18px;padding:14px;width:320px;max-height:70vh;overflow:auto;box-shadow:0 12px 32px rgba(0,0,0,.2)}
      .p h3{margin:0 0 4px;font-size:15px}.m{color:#5c6a62;font-size:12.5px}.row{display:flex;gap:6px;flex-wrap:wrap;margin-top:10px}
      .s{border:1.5px solid #d3d9d0;background:#fff;border-radius:10px;padding:6px 10px;font:600 13px system-ui;cursor:pointer;color:#14201b}
      .g{color:#1d6b4f}.a{color:#a85f00}.r{color:#c23b22}ul{margin:6px 0 0;padding-left:18px}li{margin:2px 0}
      .q{margin-top:8px;padding:8px;border-radius:10px;background:#f2f4ef}.x{float:right;border:0;background:none;font-size:18px;cursor:pointer;color:#5c6a62}
    </style><div id="root"></div>`;
    document.documentElement.appendChild(host);
  }
  function render(html) { ui(); shadow.getElementById('root').innerHTML = html; }
  function button() {
    render('<button class="b" id="go">Заполнить анкету · Job Tracker</button>');
    shadow.getElementById('go').onclick = run;
  }

  async function run() {
    render('<div class="p"><h3>Заполняю…</h3></div>');
    ctx = await send({ type: 'autofillData', url: location.href, title: document.title, text: (document.body.innerText || '').slice(0, 3000) });
    if (!ctx || !ctx.me) { render('<div class="p"><h3>Нет данных для анкеты</h3><p class="m">Заполни имя, email и телефон: Job Tracker → Skills &amp; settings → Details for application forms.</p><div class="row"><button class="s" id="set">Открыть</button><button class="s" id="cl">Закрыть</button></div></div>'); shadow.getElementById('set').onclick = () => send({ type: 'openDashboard', hash: '#settings' }); shadow.getElementById('cl').onclick = button; return; }
    const files = {};
    if (ctx.cv && ctx.cv.b64) files.cv = { name: ctx.cv.name, type: ctx.cv.type, bytes: Uint8Array.from(atob(ctx.cv.b64), c => c.charCodeAt(0)) };
    lastRep = AF.fill(document, ctx, files);
    sessionStorage.setItem('jtFill', JSON.stringify({ at: Date.now(), packKey: ctx.packKey || '', job: ctx.job || null }));
    report();
  }
  function report() {
    const r = lastRep, j = ctx.job;
    const list = (arr, cls) => arr.length ? `<ul class="${cls}">${arr.slice(0, 12).map(x => `<li>${esc(x || 'поле без подписи')}</li>`).join('')}</ul>` : '';
    render(`<div class="p"><button class="x" id="cl" aria-label="Закрыть">×</button><h3>Анкета заполнена</h3>
      <p class="m">${j ? esc([j.title, j.company].filter(Boolean).join(' — ')) : 'Вакансия не из сессии: использованы общие ответы.'}</p>
      <p><b class="g">${r.filled.length}</b> уверенно · <b class="a">${r.check.length}</b> проверь · <b class="r">${r.left.length}</b> осталось тебе</p>
      ${r.check.length ? `<div class="m">Проверь (оранжевая рамка):</div>${list(r.check, 'a')}` : ''}
      ${r.left.length ? `<div class="m">Заполни сам (красная рамка):</div>${list(r.left, 'r')}` : ''}
      ${r.questions.length && ctx.ai ? `<div class="row"><button class="s" id="ai">Ответить на ${r.questions.length} вопрос(а) с AI</button></div>` : ''}
      <p class="m" style="margin-top:10px">Submit нажимаешь ты. Многошаговые анкеты (Workday): нажми «Заполнить» на каждом шаге.</p>
      <div class="row"><button class="s" id="again">Заполнить ещё раз</button>${ctx.next ? '<button class="s" id="next">Следующая вакансия</button>' : ''}</div></div>`);
    shadow.getElementById('cl').onclick = button;
    shadow.getElementById('again').onclick = run;
    const nx = shadow.getElementById('next'); if (nx) nx.onclick = () => send({ type: 'sessionNext', skip: true });
    const ai = shadow.getElementById('ai'); if (ai) ai.onclick = answerAll;
  }
  async function answerAll() {
    const qs = lastRep.questions.slice(0, 6);
    render(`<div class="p"><h3>Пишу ответы…</h3><p class="m">0 из ${qs.length}</p></div>`);
    let n = 0;
    for (const f of qs) {
      const r = await send({ type: 'llmAnswer', question: f.label, packKey: ctx.packKey || '', url: location.href });
      if (r && r.text) { AF.put(f, r.text); lastRep.left = lastRep.left.filter(x => x !== f.label); lastRep.check.push(f.label); }
      n++; const m = shadow.querySelector('.m'); if (m) m.textContent = `${n} из ${qs.length}`;
    }
    lastRep.questions = [];
    report();
  }

  // ---------- Did it go through? ----------
  function checkSubmitted() {
    let st = null; try { st = JSON.parse(sessionStorage.getItem('jtFill') || 'null'); } catch (e) { /* ignore */ }
    if (!st || Date.now() - st.at > 3 * 3600e3 || st.recorded) return;
    const text = (document.body && document.body.innerText || '').slice(0, 20000);
    if (!AF.SUCCESS.test(text)) return;
    st.recorded = true; sessionStorage.setItem('jtFill', JSON.stringify(st));
    send({ type: 'recordApplied', packKey: st.packKey, job: st.job, url: location.href, startedAt: st.at }).then(r => {
      render(`<div class="p"><h3>Отклик записан ✓</h3><p class="m">${esc(r && r.ticket ? r.ticket + ' · ' : '')}${esc(st.job ? st.job.company || '' : '')}</p><div class="row">${r && r.next ? '<button class="s" id="next">Следующая вакансия</button>' : ''}<button class="s" id="cl">Закрыть</button></div></div>`);
      shadow.getElementById('cl').onclick = () => { host.remove(); host = null; };
      const nx = shadow.getElementById('next'); if (nx) nx.onclick = () => send({ type: 'sessionNext' });
    });
  }
  document.addEventListener('click', e => {
    const b = e.target.closest && e.target.closest('button,input[type=submit],a[role=button]');
    if (b && /submit|send application|apply now|^apply$|complete application|finish|review and submit/i.test((b.innerText || b.value || '').trim())) [2500, 6000, 12000].forEach(t => setTimeout(checkSubmitted, t));
  }, true);
  setTimeout(checkSubmitted, 1500);

  window.__jtAutofill = { open: run };
  // Only on pages that look like a form: two or more text fields
  const fields = () => document.querySelectorAll('input[type=text],input[type=email],input[type=tel],input:not([type]),textarea,input[type=file]').length;
  if (fields() >= 2) button();
  else { const mo = new MutationObserver(() => { if (fields() >= 2) { mo.disconnect(); button(); } }); mo.observe(document.documentElement, { childList: true, subtree: true }); setTimeout(() => mo.disconnect(), 60000); }
  if (window.__jtAutofillRun) run();
})();
