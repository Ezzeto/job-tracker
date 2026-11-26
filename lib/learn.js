/* Job Tracker — a learning plan from the gaps (idea 9).
 * The tools you lack most often in the jobs you go for become small home lab tasks.
 * A finished task moves the skill to "home lab" level, which counts 0.6 in the precise Fit.
 * Pure: the web app and the extension use the same list. */
(function (root) {
  'use strict';
  // Tasks for the gaps an IT support starter meets most. Each one ends with a knowledge base note:
  // it is the proof for the CV and the portfolio.
  const TASKS = {
    'ServiceNow': ['Бесплатный Personal Developer Instance на developer.servicenow.com: заведи 3 инцидента, назначь их, закрой с решением, создай одну KB-статью.', 120],
    'Jira': ['Бесплатный план Jira Service Management (atlassian.com): проект поддержки, очередь, SLA на первый ответ, портал для пользователей; проведи 3 заявки от создания до закрытия.', 120],
    'Zendesk': ['Пробный период Zendesk: триггер автоответа, макрос для сброса пароля, 3 тикета до закрытия, отчёт по SLA.', 90],
    'Freshdesk / Freshservice': ['Бесплатный план Freshdesk: портал, автоответ, категории заявок и 3 тикета до закрытия.', 90],
    'ConnectWise / Autotask': ['Посмотри бесплатные обучающие видео ConnectWise/Datto и повтори их логику в osTicket: компании-клиенты, контракты, учёт времени по заявке.', 90],
    'ITIL': ['Опиши в osTicket на одном примере цепочку incident → problem → change и сделай KB-статью «как мы разбираем повторяющиеся сбои». Термины — из глоссария ITIL 4.', 90],
    'PowerShell': ['Скрипт для лаборатории: создать 10 пользователей AD из CSV, сбросить пароль, выгрузить список заблокированных и неактивных 30+ дней.', 120],
    'Group Policy': ['GPO в лаборатории: принтер по умолчанию, обои, запрет USB-накопителей для группы, проверка через gpresult.', 90],
    'Windows Server': ['Подними роли DNS и DHCP на Windows Server в Proxmox, выдай адреса клиенту, настрой резервирование адреса для принтера.', 120],
    'Exchange': ['В Microsoft 365 (пробный тенант разработчика или лаборатория): общий ящик, переадресация, правило транспорта, восстановление удалённого письма.', 90],
    'SharePoint / OneDrive': ['Сайт SharePoint для отдела: права доступа, общая библиотека, синхронизация OneDrive и восстановление удалённого файла.', 90],
    'Microsoft Teams': ['Команда Teams с каналами, гостевой доступ и политика собраний; разбор типичной проблемы «не слышно звук» как KB.', 60],
    'SCCM / MECM': ['Разверни приложение и обновления через Intune (Win32 app, кольца обновлений) — это те же задачи, что спрашивают про MECM. В KB опиши разницу двух систем.', 120],
    'Imaging / Deployment': ['Сделай образ Windows 11 и разверни его на ВМ в Proxmox (Windows Deployment или Autopilot в Intune), засеки время на одну машину.', 120],
    'Azure': ['Бесплатный аккаунт Azure: ВМ, правило NSG, вход по RDP, бюджетное оповещение, затем удали ресурсы.', 120],
    'AWS': ['Бесплатный уровень AWS: EC2-инстанс, группа безопасности, подключение, IAM-пользователь с минимальными правами, удаление ресурсов.', 120],
    'Google Workspace': ['Пробный Google Workspace на 14 дней: пользователи, группы, двухфакторная аутентификация, восстановление удалённого пользователя.', 90],
    'macOS': ['Если есть Mac: настрой новую учётку, FileVault, принтер и Time Machine; оформи как чек-лист выдачи ноутбука сотруднику.', 90],
    'Jamf': ['Пройди бесплатный онлайн-курс Jamf 100 и опиши в KB, как MDM для Mac соотносится с тем, что ты делаешь в Intune.', 120],
    'Linux': ['Ubuntu Server в Proxmox: пользователи и sudo, SSH по ключу, обновления, простой cron для бэкапа папки.', 120],
    'iOS / Android': ['Зарегистрируй телефон в Intune, примени политику PIN и приложение из портала компании; опиши, что делать при потере устройства.', 90],
    'DNS': ['В лаборатории: зона DNS, A и CNAME записи, nslookup и разбор кейса «сайт не открывается по имени, но открывается по IP».', 60],
    'DHCP': ['Область DHCP, резервирование и разбор кейса «у ноутбука адрес 169.254…» как KB-статья.', 60],
    'TCP/IP': ['Cisco Packet Tracer (бесплатно через Networking Academy): две подсети и маршрутизатор, ping и tracert между ними.', 90],
    'Switches / Routers': ['Cisco Packet Tracer: VLAN для двух отделов, trunk-порт, маршрутизация между VLAN.', 120],
    'Cisco': ['Cisco Packet Tracer: настрой коммутатор с нуля (имя, пароль, VLAN, SSH) и сохрани конфигурацию.', 120],
    'LAN / WAN': ['Нарисуй схему сети своей лаборатории (draw.io) и опиши путь пакета от ноутбука до интернета.', 60],
    'VPN': ['Подними WireGuard или OpenVPN в лаборатории и подключись с телефона; опиши проверку при «VPN подключён, но ничего не открывается».', 90],
    'Firewalls': ['pfSense или OPNsense в Proxmox: правило блокировки, проброс порта, журнал срабатываний.', 120],
    'Wi-Fi': ['Разбери домашнюю сеть Wi-Fi: каналы, 2,4 и 5 ГГц, гостевая сеть; оформи KB «медленный Wi-Fi в офисе».', 60],
    'VoIP / Telephony': ['Поставь 3CX или FreePBX в лаборатории, заведи два внутренних номера и позвони между софтфонами.', 120],
    'Printers': ['Общий принтер через сервер печати и GPO; KB «застряла очередь печати» с командами перезапуска spooler.', 60],
    'Antivirus / EDR': ['Microsoft Defender в Intune: политика антивируса, отчёт об угрозах, тестовый файл EICAR.', 60],
    'Backups': ['Бэкап ВМ в Proxmox по расписанию и тест восстановления; запиши, сколько заняло восстановление.', 60],
    'VMware': ['Бесплатный гипервизор VMware Workstation или ESXi в лаборатории: ВМ, снимок, откат.', 90],
    'Hyper-V': ['Включи Hyper-V на Windows 11 Pro: ВМ, виртуальный коммутатор, контрольная точка и откат.', 60],
    'Citrix': ['Изучи бесплатные материалы Citrix о виртуальных рабочих столах и опиши в KB, как бы ты помогал пользователю, у которого не открывается рабочий стол.', 60],
    'SQL': ['SQL-запросы к учебной базе: выборка заявок за неделю, группировка по категории, среднее время решения.', 90],
    'Python': ['Скрипт на Python: читает выгрузку заявок CSV и считает, сколько закрыто в срок SLA.', 120],
    'Bash': ['Bash-скрипт: архив папки с датой в имени, удаление архивов старше 7 дней, запуск по cron.', 60],
    'CompTIA A+': ['Бесплатные видео Professor Messer по Core 1 и по 10 вопросов в день; запиши темы, где ошибаешься.', 60],
    'CompTIA Network+': ['Начни с бесплатного курса Professor Messer по Network+, по одной теме в день, с практикой в Packet Tracer.', 60],
    'CompTIA Security+': ['Бесплатный курс Professor Messer по Security+ — пока только знакомство с темами, после A+.', 60],
    'Microsoft certifications': ['Бесплатный учебный путь Microsoft Learn для MS-900 или MD-102 — по одному модулю за раз, с повтором в своём тенанте.', 90],
    'Hardware': ['Разбери и собери старый ПК или ноутбук: замена RAM и SSD, проверка в BIOS; фото и шаги — в KB.', 90],
    'Peripherals': ['Чек-лист рабочего места: док-станция, два монитора, гарнитура, проверка драйверов; оформи как KB.', 45],
    'AV / Audio-Visual': ['Настрой переговорную у себя: ноутбук + экран + камера в Teams; KB «нет изображения на проекторе».', 45],
    'Docker': ['Docker в Ubuntu ВМ: запусти osTicket или Uptime Kuma в контейнере с постоянным томом.', 90],
  };
  const DEFAULT = name => [`Найди бесплатный пробный тариф или учебный курс по ${name}. Сделай в лаборатории одну задачу из вакансии, где это требовалось, и оформи шаги как KB-статью.`, 90];

  /**
   * apps: [{ missing: [tool], market: 'A'|'B', appliedAt: iso, status }]
   * profile: { skills }   learned: { tool: isoDate }
   * Returns [{ name, count, weight, task, minutes }] — the gaps worth closing first.
   */
  function gaps(apps, profile, learned, now) {
    const sk = (profile && profile.skills) || {};
    const done = learned || {};
    const t0 = now || Date.now();
    const tally = {};
    (apps || []).forEach(a => {
      const age = a.appliedAt ? (t0 - Date.parse(a.appliedAt)) / 864e5 : 0;
      const w = (a.market === 'B' ? 2 : 1) * (age <= 90 ? 1 : 0.5);
      (a.missing || []).forEach(n => {
        if (!n || done[n] || (sk[n] && sk[n] !== 'none')) return;
        const x = tally[n] = tally[n] || { name: n, count: 0, weight: 0 };
        x.count++; x.weight += w;
      });
    });
    return Object.values(tally).filter(x => x.count >= 2).sort((a, b) => b.weight - a.weight || b.count - a.count)
      .map(x => { const [task, minutes] = TASKS[x.name] || DEFAULT(x.name); return { ...x, task, minutes, curated: !!TASKS[x.name] }; });
  }

  /** The profile as the scorer should see it: finished tasks count as basic skills from a home lab. */
  function withLearned(profile, learned) {
    const p = { ...(profile || {}), skills: { ...((profile || {}).skills || {}) }, evidence: { ...((profile || {}).evidence || {}) } };
    Object.keys(learned || {}).forEach(n => { if (!p.skills[n] || p.skills[n] === 'none') { p.skills[n] = 'basic'; if (p.evidence[n] !== 'work') p.evidence[n] = 'lab'; } });
    return p;
  }

  const api = { TASKS, gaps, withLearned };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.JT_Learn = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
