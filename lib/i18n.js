/* Job Tracker — interface language. English is written in the code; this file translates what the
   page shows into Russian. Messages to employers, the CV and cover letters stay in English. */
(function (root) {
  'use strict';

  // Exact strings, whitespace collapsed. Tool names, job sites and role types stay in English.
  const RU = {
    // Navigation and page titles
    'Job Tracker — dashboard': 'Job Tracker — панель', 'Job Tracker — tailor CV': 'Job Tracker — резюме под вакансию',
    'Overview': 'Обзор', 'Applications': 'Отклики', 'Follow-ups': 'Фоллоуапы', 'Weekly plan': 'План на неделю',
    'Offers': 'Офферы', 'Internships': 'Стажировки', 'CV & ATS': 'Резюме и ATS', 'Skills & settings': 'Навыки и настройки',
    'Data': 'Данные', 'Sections': 'Разделы', 'Language': 'Язык',
    'All data stays in this browser unless you connect a Google Sheet.': 'Все данные хранятся в этом браузере, пока вы не подключите Google Таблицу.',

    // Overview
    'All': 'Все', 'Jobs': 'Работа', 'New application': 'Новый отклик', 'New internship': 'Новая стажировка',
    'Applied': 'Отклик отправлен', 'Responses': 'Ответы', 'Interviews': 'Интервью',
    'all time': 'за всё время', 'press Apply on a job site': 'нажмите Apply на сайте вакансий',
    'In progress:': 'В процессе:', 'Rejected:': 'Отказов:', 'No response:': 'Без ответа:', 'Last 7 days:': 'За 7 дней:',
    'Average fit:': 'Средняя оценка:', 'Applied to Skip jobs:': 'Отклики на Skip-вакансии:', 'Incomplete:': 'Неполных:',
    'Only applications with a full job ad': 'Только отклики с полным текстом вакансии',
    'Applications the tracker now marks Skip: something in the ad ruled you out': 'Отклики, которые трекер теперь помечает Skip: что-то в вакансии вас исключает',
    'The job ad was not captured: open the job page and re-save, or paste the description': 'Текст вакансии не сохранился: откройте её страницу и сохраните заново или вставьте описание',
    'Applications per week': 'Отклики по неделям', 'Sources and response rate': 'Источники и доля ответов',
    'right: total · response rate': 'справа: всего · доля ответов',
    'What employers ask for most': 'Что работодатели просят чаще всего',
    'Colour shows your level: green confident, amber basic, red none.': 'Цвет — ваш уровень: зелёный уверенно, жёлтый базово, красный нет.',
    'Learn first:': 'Изучить в первую очередь:', 'Needs attention': 'Требует внимания', 'All follow-ups': 'Все фоллоуапы',
    'Nothing urgent. Reminders about follow-ups, interviews and offer deadlines appear here.': 'Ничего срочного. Здесь появятся напоминания о фоллоуапах, интервью и сроках по офферам.',
    'Next step is today': 'Следующий шаг сегодня', 'time to follow up': 'пора написать фоллоуап',
    'find a recruiter or hiring manager on LinkedIn first': 'сначала найдите рекрутера или нанимающего менеджера в LinkedIn',
    'Mark as no response': 'Отметить «Нет ответа»', 'Follow-up': 'Фоллоуап', 'Open': 'Открыть',
    'Why no interviews?': 'Почему нет интервью?',
    'Reply and interview rate split by how you applied, the CV and letter you sent, how old the ad was, how many had applied before you and what the ad demanded.': 'Доля ответов и интервью в разрезе: как вы откликались, какое резюме и письмо отправили, сколько дней было вакансии, сколько человек откликнулось до вас и что требовала вакансия.',
    'Does the verdict work?': 'Работает ли вердикт?', 'Reply and interview rate for each verdict.': 'Доля ответов и интервью для каждого вердикта.',
    'Applications older than two weeks. If Skip replies as often as Apply, the rules need changing: tell me which ads were wrong.': 'Отклики старше двух недель. Если на Skip отвечают так же часто, как на Apply, правила нужно менять: сообщите, какие вакансии оценены неверно.',
    'Fill these in for every application: after 20–30 of them the overview shows which way of applying gets replies.': 'Заполняйте это в каждом отклике: после 20–30 откликов обзор покажет, какой способ откликаться приносит ответы.',
    'How you applied': 'Как откликались', 'CV sent': 'Отправленное резюме', 'Cover letter': 'Сопроводительное письмо',
    'Ad age when you applied, days': 'Возраст вакансии при отклике, дней', 'Applicants before you': 'Откликов до вас',
    'What the ad demanded': 'Что требовала вакансия', 'Verdict when you applied': 'Вердикт при отклике',
    'got any reply': 'получили ответ', 'interviews': 'интервью', 'never answered': 'не ответили',
    'applications older than a week': 'отклики старше недели', 'CV screen (within 3 days)': 'Отсев по резюме (за 3 дня)',
    'No verdict': 'Без вердикта', 'The ad demands:': 'Вакансия требует:',
    'Asks for previous IT / support experience': 'Требует опыт в IT / поддержке', 'Asks for 1+ years': 'Требует 1+ год',
    'Full-time / 5 days': 'Полный день / 5 дней', 'Degree required': 'Нужен диплом', 'Driving licence': 'Водительские права',
    'Certificate required (ITIL, A+, MS…)': 'Нужен сертификат (ITIL, A+, MS…)', 'Security clearance / long UK residency': 'Допуск / долгое проживание в UK',
    'Right to work / sponsorship': 'Право на работу / спонсорство',

    // Applications table and filters
    'Search title, company, notes': 'Поиск по должности, компании, заметкам', 'Search': 'Поиск',
    'Jobs and internships': 'Работа и стажировки', 'Jobs only': 'Только работа', 'Internships only': 'Только стажировки',
    'All statuses': 'Все статусы', 'All sources': 'Все источники', 'All role types': 'Все типы ролей',
    'Newest first': 'Сначала новые', 'By fit score': 'По оценке', 'By salary': 'По зарплате', 'Sort': 'Сортировка',
    'Ticket': 'Номер', 'Fit': 'Оценка', 'Job': 'Вакансия', 'Status': 'Статус', 'Salary': 'Зарплата', 'Source': 'Источник',
    'Type': 'Тип', 'Role type': 'Тип роли', 'not listed': 'не указана', 'Internship': 'Стажировка',
    'Nothing matches these filters.': 'По этим фильтрам ничего нет.', 'Untitled': 'Без названия',

    // Statuses and verdicts
    'Screening': 'Скрининг', 'Test task': 'Тестовое задание', 'Interview 1': 'Интервью 1', 'Interview 2': 'Интервью 2',
    'Interview 3': 'Интервью 3', 'Offer': 'Оффер', 'Offer accepted': 'Оффер принят', 'Offer declined': 'Оффер отклонён',
    'Rejected': 'Отказ', 'No response': 'Нет ответа', 'Withdrawn': 'Отозван', 'Interview': 'Интервью',
    'Incomplete': 'Неполная', 'Skip': 'Пропустить', 'Check first': 'Сначала уточнить', 'Tailor CV': 'Адаптировать резюме',
    'Apply': 'Откликаться', 'Good fit': 'Хорошо подходит',
    'The job ad was not captured: open the job page again': 'Текст вакансии не сохранился: откройте страницу вакансии ещё раз',
    'Something here rules you out': 'Что-то здесь вас исключает', 'Worth it if the open questions work out': 'Стоит, если открытые вопросы решатся',
    'Apply after adjusting your CV to this ad': 'Откликайтесь, адаптировав резюме под вакансию',
    '· confident': '· уверенно', '· fairly sure': '· довольно уверенно', '· rough guess': '· приблизительно',

    // Follow-ups page
    'A short message to the recruiter or hiring manager gets your CV read. The first one is due 4 working days after you apply, a second one 5 working days later, then stop. Press': 'Короткое сообщение рекрутеру или нанимающему менеджеру помогает, чтобы резюме прочитали. Первое — через 4 рабочих дня после отклика, второе — ещё через 5 рабочих дней, дальше не пишите. Нажмите',
    'Write follow-up': 'Написать фоллоуап',
    ': the message is ready, you check it, send it from Gmail or LinkedIn, then press': ': сообщение уже готово, проверьте его, отправьте из Gmail или LinkedIn и нажмите',
    'Mark as sent': 'Отметить отправленным',
    'Fill in once so every message is signed and says who you are:': 'Заполните один раз, чтобы каждое сообщение было подписано и говорило, кто вы:',
    'your name, phone, a short pitch, one or two sentences about you.': 'имя, телефон, короткое описание, одно-два предложения о себе.',
    'your name': 'имя', 'phone': 'телефон', 'a short pitch': 'короткое описание', 'one or two sentences about you': 'одно-два предложения о себе',
    'Open settings': 'Открыть настройки', 'Send today': 'Отправить сегодня', 'Coming up': 'Скоро',
    'Both follow-ups sent': 'Оба фоллоуапа отправлены',
    'No reply a week after the second message: mark it as no response and move on.': 'Нет ответа через неделю после второго сообщения: отметьте «Нет ответа» и двигайтесь дальше.',
    'Nothing to send today. Applications show up here 4 working days after you apply.': 'Сегодня отправлять нечего. Отклики появляются здесь через 4 рабочих дня.',
    'Nothing coming up.': 'Ничего не запланировано.', 'None yet.': 'Пока нет.',
    'Write to:': 'Кому написать:', 'No contact in the ad. Find one:': 'В вакансии нет контакта. Найдите:',
    'Recruiters on LinkedIn': 'Рекрутеры в LinkedIn', 'Agency consultants on LinkedIn': 'Консультанты агентства в LinkedIn',
    'IT manager on LinkedIn': 'IT-менеджер в LinkedIn', 'Careers email (Google)': 'Email отдела кадров (Google)',
    'Add the company name to search for contacts.': 'Добавьте название компании, чтобы искать контакты.',
    'Closed or not worth chasing': 'Закрыта или не стоит усилий',
    'Over two weeks old: one short check-in at most, newer applications come first': 'Старше двух недель: максимум одно короткое сообщение, сначала свежие отклики',
    'Employer': 'Работодатель', 'Agency': 'Агентство', 'first follow-up': 'первый фоллоуап', 'second follow-up': 'второй фоллоуап',
    'applied today': 'отклик сегодня', 'applied yesterday': 'отклик вчера',

    // Follow-up panel in an application
    'No contacts found in the ad. Find the recruiter or hiring manager and add them below (paste a LinkedIn profile link or an email):': 'В вакансии нет контактов. Найдите рекрутера или нанимающего менеджера и добавьте ниже (ссылка на профиль LinkedIn или email):',
    'email, link or phone': 'email, ссылка или телефон', 'Name (optional)': 'Имя (необязательно)', 'Contact': 'Контакт',
    'Contact type': 'Тип контакта', 'Name only': 'Только имя', 'Add': 'Добавить', 'Channel': 'Канал', 'Call': 'Звонок',
    'Phone': 'Телефон', 'To': 'Кому', 'Subject': 'Тема', 'Message': 'Сообщение', 'What to say on the phone': 'Что сказать по телефону',
    'Open in Gmail': 'Открыть в Gmail', 'Open in Outlook': 'Открыть в Outlook', 'Open in mail app': 'Открыть в почте',
    'Copy and open profile': 'Скопировать и открыть профиль', 'Copy and find a recruiter': 'Скопировать и найти рекрутера',
    'Copy text': 'Копировать текст', 'sent:': 'отправлено:', 'Copied.': 'Скопировано.', 'Remove contact': 'Удалить контакт',
    'Email opened. Check it, press Send, then mark it as sent here.': 'Письмо открыто. Проверьте, нажмите «Отправить», затем отметьте здесь.',
    'No address yet: add the recipient in the email. After sending, mark it as sent here.': 'Адреса нет: добавьте получателя в письме. После отправки отметьте здесь.',
    'Copied. On LinkedIn press Connect → Add a note, or Message, and paste (Ctrl+V).': 'Скопировано. В LinkedIn нажмите Connect → Add a note или Message и вставьте (Ctrl+V).',
    "Copied. Find the company's recruiter in the results, add them to this list and send the message.": 'Скопировано. Найдите рекрутера компании, добавьте его в список и отправьте сообщение.',
    "Marked. You'll be reminded about a second follow-up in a week.": 'Отмечено. Через неделю напомню про второй фоллоуап.',
    'Marked. If there is still no reply, set the status to No response.': 'Отмечено. Если ответа так и не будет, поставьте статус «Нет ответа».',

    // Weekly plan
    'Last week': 'Прошлая неделя', 'This week so far': 'Эта неделя на сегодня', 'Plan for this week': 'План на эту неделю',
    "Worked out from last week's numbers and what is waiting now. Tick tasks off as you go; the list starts again every Monday.": 'Составлен по цифрам прошлой недели и тому, что ждёт сейчас. Отмечайте выполненное; список обновляется каждый понедельник.',
    'Plan from an AI chat': 'План из ИИ-чата',
    "1. Copy the prompt: it holds last week's numbers. 2. Paste it into Claude or ChatGPT. 3. Paste the answer here and press": '1. Скопируйте промпт: в нём цифры прошлой недели. 2. Вставьте его в Claude или ChatGPT. 3. Вставьте ответ сюда и нажмите',
    'Use this plan': 'Использовать план', 'Paste a new plan': 'Вставить новый план', 'Clear': 'Очистить',
    'Copy prompt for an AI chat': 'Скопировать промпт для ИИ-чата',
    'CV tailored': 'Резюме адаптировано', 'Cover letters': 'Сопроводительные письма',
    'Follow-ups sent': 'Отправлено фоллоуапов', 'Replies': 'Ответы', 'Rejections': 'Отказы', 'Applied to Skip jobs': 'Отклики на Skip-вакансии',
    'Asked for, you marked None:': 'Просили, а у вас отмечено «нет»:',
    'Copied. Paste it into Claude or ChatGPT, then paste the answer below.': 'Скопировано. Вставьте в Claude или ChatGPT, затем вставьте ответ ниже.',
    'The browser blocked the clipboard: the prompt is in the box, copy it with Ctrl+C.': 'Браузер заблокировал буфер обмена: промпт в поле, скопируйте его Ctrl+C.',
    'No tasks found: paste a list with one task per line.': 'Задачи не найдены: вставьте список, по одной задаче в строке.',

    // Offers
    'Compare offers': 'Сравнить офферы', 'The comparison starts once you have two or more offers. You can fill in the terms now.': 'Сравнение появится, когда офферов будет два или больше. Условия можно заполнить уже сейчас.',
    'Score by your priorities': 'Оценка по вашим приоритетам', 'What matters to you': 'Что для вас важно',
    'Move the sliders and the score updates. 0 means not important, 10 very important.': 'Двигайте ползунки, и оценка обновится. 0 — не важно, 10 — очень важно.',
    'Green marks the best value in each row. Figures are before tax and approximate: they compare the offers with each other, not your exact take-home pay.': 'Зелёным отмечено лучшее значение в строке. Суммы до налогов и приблизительные: они сравнивают офферы между собой, а не точную сумму на руки.',
    'Money': 'Деньги', 'Time and commute': 'Время и дорога', 'Growth and terms': 'Рост и условия', 'Terms': 'Условия',
    'Salary, £/year (before tax)': 'Зарплата, £/год (до налогов)', 'Bonus, £/year': 'Бонус, £/год', 'Employer pension, %': 'Пенсия от работодателя, %',
    'Training / certifications, £/year': 'Обучение / сертификаты, £/год', 'Annual leave, days': 'Отпуск, дней',
    'Commute one way, min': 'Дорога в одну сторону, мин', 'Commute cost, £/month': 'Дорога, £/месяц', 'Office days per week': 'Дней в офисе в неделю',
    'Weekly hours including commute': 'Часов в неделю с дорогой', 'Effective hourly rate with commute': 'Реальная почасовая ставка с дорогой',
    'Monthly minus commute (before tax)': 'В месяц минус дорога (до налогов)', 'Hourly rate': 'Почасовая ставка',
    'Learning and growth': 'Обучение и рост', 'Gut feeling about the team, 1–5': 'Ощущение от команды, 1–5', 'Feeling about the company': 'Ощущение от компании',
    'Pros': 'Плюсы', 'Cons': 'Минусы', 'Start date': 'Дата начала', 'Reply by': 'Ответить до', 'Calculated': 'Расчёт',
    'Permanent': 'Постоянная', 'Contract': 'Контракт', 'Fixed-term': 'Срочный договор', 'Temporary': 'Временная',
    'Flexible hours': 'Гибкий график', 'Working pattern': 'График работы',

    // Internships
    'Placement rules': 'Правила стажировки', 'Rules used to check internships': 'Правила для проверки стажировок',
    "Paste your university's placement briefing or rules and the dates, length, hours, days and deadlines are filled in for you. Check them, then edit anything that is off.": 'Вставьте правила стажировки от университета: даты, длительность, часы, дни и дедлайны заполнятся сами. Проверьте и исправьте, если что-то не так.',
    'Read the rules': 'Прочитать правила', 'Placement starts': 'Начало стажировки', 'Placement ends': 'Конец стажировки',
    'At least (weeks)': 'Не меньше (недель)', 'Hours a week, from': 'Часов в неделю, от', 'Hours a week, to': 'Часов в неделю, до',
    'Days a week': 'Дней в неделю', 'Companies abroad: fully remote only': 'Зарубежные компании: только полностью удалённо',
    'Paid placements recommended': 'Рекомендуются оплачиваемые', 'Deadlines': 'Дедлайны', 'Add a deadline': 'Добавить дедлайн',
    'Role types for internships': 'Типы ролей для стажировок', 'About you, for internship follow-ups': 'О вас, для фоллоуапов по стажировкам',
    'Short pitch for LinkedIn notes': 'Короткое описание для заметок в LinkedIn', 'One or two sentences for emails and calls': 'Одно-два предложения для писем и звонков',
    'Your internships': 'Ваши стажировки', 'Fits your placement rules': 'Подходит под правила стажировки',
    'Placement rules: check with the employer': 'Правила стажировки: уточните у работодателя', 'Breaks your placement rules': 'Нарушает правила стажировки',
    'Relevant to your degree': 'Связана с вашей специальностью', 'Graduate-level duties': 'Задачи уровня выпускника', 'Paid': 'Оплачиваемая',
    'Deadline': 'Дедлайн', 'Date': 'Дата',
    'Ask the employer about anything unclear before the interview. If in doubt, send the ad to your placement team to check it would be approved.': 'Уточните у работодателя всё неясное до интервью. Если сомневаетесь, отправьте вакансию в отдел стажировок университета на проверку.',

    // CV & ATS
    'Drop in your CV and skill levels are set for you: your skills section and work experience count as confident; working knowledge, basic, in progress and projects count as basic. Fit is recalculated for every application of that type, and the CV is checked the way an applicant tracking system reads it. The file is read in your browser and never uploaded.': 'Загрузите резюме, и уровни навыков выставятся сами: раздел навыков и опыт работы считаются «уверенно», working knowledge, basic, in progress и проекты — «базово». Оценка пересчитается для всех откликов этого типа, а резюме проверится так, как его читает ATS. Файл читается в браузере и никуда не загружается.',
    'CV for jobs': 'Резюме для работы', 'CV for internships': 'Резюме для стажировок', 'Used to score regular jobs.': 'Используется для оценки обычных вакансий.',
    'Used to score internships and placements.': 'Используется для оценки стажировок.', 'Drop your CV here or click to choose': 'Перетащите резюме сюда или нажмите, чтобы выбрать',
    'PDF, Word (.docx) or plain text': 'PDF, Word (.docx) или обычный текст', 'or paste the text': 'или вставьте текст', 'Read the text': 'Прочитать текст',
    'Paste the full text of your CV': 'Вставьте полный текст резюме', 'ATS check': 'Проверка ATS', 'CV preview': 'Просмотр резюме',
    'File name or version, e.g. CV IT Support v2': 'Имя файла или версия, например CV IT Support v2',
    'Open a job page and press': 'Откройте страницу вакансии и нажмите', 'in the Job Tracker panel, or open an application in the dashboard. The job description has to be on the page.': 'в панели Job Tracker или откройте отклик в панели. Описание вакансии должно быть на странице.',
    'page to see how an applicant tracking system would match it to this ad.': 'чтобы увидеть, как ATS сопоставит его с этой вакансией.',
    'in your CV': 'в резюме', 'added': 'добавлено', 'missing: not added, be ready to talk about it': 'нет: не добавлено, будьте готовы обсудить',

    // Application drawer
    'Fit against your skills': 'Соответствие навыкам', 'CV for this job': 'Резюме для этой вакансии', 'Job title': 'Должность',
    'Application type': 'Тип отклика', 'Internship / placement': 'Стажировка', 'Company': 'Компания', 'Location': 'Место',
    'Applied on': 'Дата отклика', 'Next step (date)': 'Следующий шаг (дата)', 'Link': 'Ссылка', 'Work type': 'Формат работы',
    'Notes': 'Заметки', 'Recruiter contact, interview questions, what to prepare': 'Контакт рекрутера, вопросы на интервью, что подготовить',
    'Open job ad': 'Открыть вакансию', 'Benefits': 'Бонусы и льготы', 'Key details': 'Ключевые детали', 'Job description': 'Описание вакансии',
    'Re-analyse': 'Проанализировать заново', 'Paste the job ad here if it was not captured automatically': 'Вставьте текст вакансии, если он не сохранился автоматически',
    'History': 'История', 'Delete': 'Удалить', 'Close': 'Закрыть', 'Save': 'Сохранить', 'Add application': 'Добавить отклик',
    'Nothing yet. Appears once the description is analysed.': 'Пока пусто. Появится после анализа описания.',
    'None found in the description. You can add them to your notes.': 'В описании не найдено. Можно добавить в заметки.',
    'Paste the job description below and press Re-analyse.': 'Вставьте описание вакансии ниже и нажмите «Проанализировать заново».',
    'Description not saved': 'Описание не сохранено', 'Short ad: you will need a detailed job description': 'Короткая вакансия: нужно подробное описание',
    'Tools in this ad': 'Инструменты в вакансии', 'Missing skills / certificates': 'Не хватает навыков / сертификатов',
    'Level: entry-level, matches yours': 'Уровень: начальный, подходит вам', 'Level: IT support, line not stated': 'Уровень: IT support, линия не указана',
    'Experience: years not stated': 'Опыт: годы не указаны', 'Flexible, part-time or 4-day hours': 'Гибкий график, неполный день или 4 дня',
    'Temporary or fixed-term: ask how long, and whether it can become permanent': 'Временная или срочная: уточните срок и возможность перехода на постоянную',
    'Method': 'Способ', 'Easy Apply / quick apply': 'Easy Apply / быстрый отклик', 'Company website / ATS': 'Сайт компании / ATS',
    'Job board form': 'Форма на сайте вакансий', 'Email / direct': 'Email / напрямую', 'Recruitment agency': 'Кадровое агентство',
    'Referral': 'Рекомендация', 'Speculative application': 'Инициативный отклик', 'No cover letter': 'Без письма',
    'Standard letter': 'Стандартное письмо', 'Written for this job': 'Написано под вакансию', 'No cover letter asked for': 'Письмо не требовалось',
    'The ad asks for a cover letter': 'Вакансия просит сопроводительное письмо', 'CV tailored to this ad': 'Резюме адаптировано под вакансию',
    'Not recorded': 'Не указано', 'Yes': 'Да', 'No, the usual CV': 'Нет, обычное резюме', 'Not sure': 'Не уверен(а)',
    'When': 'Когда', 'Why it was a no': 'Почему отказ', 'Reason they gave': 'Причина, которую назвали',
    'What they wrote (paste the key line)': 'Что написали (вставьте ключевую фразу)', 'After a call or test': 'После звонка или теста',
    'After a longer review': 'После долгого рассмотрения', 'After an interview': 'После интервью', 'No reason given': 'Причину не назвали',
    'Chose a stronger candidate': 'Выбрали более сильного кандидата', 'Not enough experience': 'Недостаточно опыта', 'Job closed / filled': 'Вакансия закрыта',
    'Hours or availability': 'Часы или доступность', 'Location / commute': 'Место / дорога', 'Salary expectations': 'Ожидания по зарплате',
    'Other (see notes)': 'Другое (см. заметки)', 'Screening questions they asked': 'Вопросы при отклике',
    'e.g. years of experience, right to work, salary, notice': 'например опыт, право на работу, зарплата, срок уведомления',
    'Also write a cover letter': 'Также написать сопроводительное письмо', 'Copy prompt': 'Скопировать промпт',
    'Or rewrite it with an AI chat': 'Или переписать в ИИ-чате', 'Or rewrite it with an AI chat (prompt to copy)': 'Или переписать в ИИ-чате (промпт для копирования)',
    'Why this employer, in your own words (needed for a letter)': 'Почему этот работодатель, своими словами (нужно для письма)',
    'Why this employer, in your own words (recommended)': 'Почему этот работодатель, своими словами (рекомендуется)',
    'Restored from Google Sheet': 'Восстановлено из Google Таблицы',
    'Response': 'Ответ', 'Sent': 'Отправлено', 'Reply': 'Ответ', 'Got a response': 'Получен ответ', 'Priority': 'Приоритет',
    'Not a target': 'Не целевая', 'Target': 'Целевая', 'None': 'Нет', 'Me': 'Я', 'Recruiter / agency': 'Рекрутер / агентство',

    // Settings
    'How you can work': 'Как вы можете работать', 'Days per week': 'Дней в неделю', 'Hours per week': 'Часов в неделю',
    'Days you can work (used in the weekly plan)': 'Дни, когда можете работать (для плана на неделю)',
    'Mon': 'Пн', 'Tue': 'Вт', 'Wed': 'Ср', 'Thu': 'Чт', 'Fri': 'Пт', 'Sat': 'Сб', 'Sun': 'Вс',
    'Years of IT experience you can show, freelance included': 'Лет опыта в IT, которые можете показать, включая фриланс',
    'Years in a paid IT job with an employer (leave empty to use the figure on the left)': 'Лет оплачиваемой работы в IT у работодателя (пусто — берётся цифра слева)',
    'Careful applications a day (the side panel counts them)': 'Продуманных откликов в день (боковая панель считает)',
    'Show internships and placements': 'Показывать стажировки', 'I have a full UK driving licence': 'У меня есть полные британские права',
    'My right to work has an end date (Ukraine scheme, Graduate visa): flag ads that rule it out': 'Моё право на работу ограничено по сроку (Ukraine scheme, Graduate visa): отмечать вакансии, которые это исключают',
    'Save automatically when I press Apply': 'Сохранять автоматически при нажатии Apply',
    "Mark 'Applied' as 'No response' after, days (0 = never)": 'Переводить «Отклик отправлен» в «Нет ответа» через, дней (0 — никогда)',
    'Cover letter I usually send': 'Какое письмо я обычно отправляю', 'Lower the score for full-time roles (off: just show a tip)': 'Снижать оценку за полную занятость (выкл.: только подсказка)',
    'Score jobs in search results (badges and filter)': 'Оценивать вакансии в результатах поиска (значки и фильтр)',
    'Show the fit score on a job page before I apply': 'Показывать оценку на странице вакансии до отклика',
    'Roles you are aiming for (other role types score lower; none ticked means all count)': 'Роли, на которые вы целитесь (остальные оцениваются ниже; ничего не отмечено — подходят все)',
    'Languages besides English, comma-separated (a bonus when an ad asks for one)': 'Языки кроме английского, через запятую (плюс, если вакансия просит)',
    'Where you can work: towns and areas, comma-separated (jobs elsewhere score lower; leave empty to skip)': 'Где можете работать: города и районы через запятую (вакансии в других местах оцениваются ниже; пусто — не учитывать)',
    'Home town (for the journey check)': 'Ваш город (для проверки дороги)', 'Longest journey, km in a straight line': 'Максимальное расстояние, км по прямой',
    'Follow-ups: signature and email': 'Фоллоуапы: подпись и почта', 'Name in signature': 'Имя в подписи',
    'Open emails in': 'Открывать письма в', 'Gmail (browser)': 'Gmail (в браузере)', 'Outlook (browser)': 'Outlook (в браузере)', 'Default mail app': 'Почтовое приложение',
    'One or two sentences about you for emails and calls': 'Одно-два предложения о себе для писем и звонков',
    'Extra facts for the AI prompt (optional)': 'Дополнительные факты для ИИ-промпта (необязательно)',
    'Only for': 'Только для', '. Leave it empty and your uploaded CV is used. Fill it in if you have true facts that are not in the CV, one per line, with dates.': '. Если оставить пустым, используется загруженное резюме. Заполните, если есть правдивые факты, которых нет в резюме: по одному в строке, с датами.',
    'Google Sheet': 'Google Таблица', 'Not connected': 'Не подключено',
    'Applications are copied to your own Google Sheet. Changes to status, notes and dates made in the sheet (on your phone, say) come back here when the dashboard opens and every 10 minutes.': 'Отклики копируются в вашу Google Таблицу. Изменения статуса, заметок и дат в таблице (например, с телефона) возвращаются сюда при открытии панели и каждые 10 минут.',
    'Apps Script web app URL': 'URL веб-приложения Apps Script', 'Token': 'Токен', 'From Job Tracker → Show sync token': 'Из Job Tracker → Show sync token',
    'Sync automatically': 'Синхронизировать автоматически', 'Test connection': 'Проверить подключение', 'Sync now': 'Синхронизировать сейчас',
    'How to connect a sheet (5 minutes)': 'Как подключить таблицу (5 минут)', 'Create a new Google Sheet at sheets.new.': 'Создайте новую Google Таблицу на sheets.new.',
    'In the sheet: Extensions → Apps Script. Delete the code in the editor, paste the contents of': 'В таблице: Расширения → Apps Script. Удалите код в редакторе, вставьте содержимое', 'and save.': 'и сохраните.',
    'Choose the': 'Выберите функцию', 'function and press Run. Google asks for access: Advanced → Go to project → Allow. It is your own script and only touches this sheet.': 'и нажмите «Выполнить». Google попросит доступ: Дополнительно → Перейти к проекту → Разрешить. Это ваш скрипт, он работает только с этой таблицей.',
    'Back in the sheet, open the': 'Вернитесь в таблицу, откройте меню', 'menu →': '→', 'and copy the token.': 'и скопируйте токен.',
    'Deploy → New deployment → type Web app. Execute as:': 'Начать развёртывание → Новое развёртывание → тип «Веб-приложение». Запуск от имени:', '. Who has access:': '. Доступ:',
    '. Press Deploy and copy the URL ending in /exec.': '. Нажмите «Начать развёртывание» и скопируйте URL, который заканчивается на /exec.',
    'Paste the URL and token here, press Test connection, then Sync now.': 'Вставьте URL и токен сюда, нажмите «Проверить подключение», затем «Синхронизировать сейчас».',
    'Delete applications here in the extension: a row deleted in the sheet comes back on the next sync. You can add an application in the sheet: fill in Job title and Company on an empty row and it appears in the tracker.': 'Удаляйте отклики здесь, в расширении: строка, удалённая в таблице, вернётся при синхронизации. Добавить отклик можно в таблице: заполните Job title и Company в пустой строке, и он появится в трекере.',
    'Anyone': 'Все', 'Skills profile': 'Профиль навыков', 'My skills': 'Мои навыки', 'Clear all skills': 'Очистить все навыки',
    'Recalculate fit for all applications': 'Пересчитать оценки всех откликов',
    'The fit score compares the tools named in a job ad with this list, then adjusts for seniority, years of experience, driving licence, clearance and hours. It is a guide, not a prediction.': 'Оценка сравнивает инструменты из вакансии с этим списком и учитывает уровень, годы опыта, права, допуск и часы. Это ориентир, а не прогноз.',
    'Confident': 'Уверенно', 'Basic': 'Базово',
    'With nothing marked, every role type counts. Priority roles score highest.': 'Если ничего не отмечено, подходят все типы ролей. Приоритетные получают больше баллов.',
    'Service desk': 'Сервис-деск', 'OS and devices': 'ОС и устройства', 'Networking': 'Сети', 'Security': 'Безопасность', 'Cloud': 'Облако',
    'Scripting and code': 'Скрипты и код', 'Software development': 'Разработка ПО', 'Data and AI': 'Данные и ИИ', 'Certifications': 'Сертификаты', 'Office': 'Офис',

    // Data
    'Backup': 'Резервная копия', 'Your data lives in this browser only. Export a copy every week so nothing is lost if you reinstall.': 'Данные хранятся только в этом браузере. Сохраняйте копию каждую неделю, чтобы ничего не потерять при переустановке.',
    'Download backup (JSON)': 'Скачать копию (JSON)', 'Download for Excel (CSV)': 'Скачать для Excel (CSV)', 'Restore backup (JSON)': 'Восстановить из копии (JSON)',
    'Re-check all applications': 'Перепроверить все отклики', 'Re-check all': 'Перепроверить все', 'Merge duplicates': 'Объединить дубликаты',
    'Runs the current rules over everything saved: repairs titles like "37,252 IT Engineer Jobs", strips search results and LinkedIn widgets from descriptions, re-scores with verdicts, finds duplicates and fixes clashing ticket numbers. A backup is downloaded first.': 'Прогоняет текущие правила по всем сохранённым откликам: чинит заголовки вроде «37,252 IT Engineer Jobs», убирает из описаний результаты поиска и виджеты LinkedIn, пересчитывает вердикты, находит дубликаты и исправляет совпадающие номера. Сначала скачивается резервная копия.',
    'Wrong verdicts': 'Неверные вердикты', 'Verdicts you marked as wrong on job pages, with the ad text. Download the file and share it so each one can become a test;': 'Вердикты, отмеченные вами как неверные, с текстом вакансии. Скачайте файл и поделитесь им, чтобы каждый стал тестом;',
    'shows which ones the current rules already get right.': 'показывает, какие из них текущие правила уже оценивают верно.',
    'Download wrong verdicts (JSON)': 'Скачать неверные вердикты (JSON)', 'Clear the list': 'Очистить список',
    'None reported yet. Use "Wrong verdict?" in the panel on a job page.': 'Пока нет. Используйте «Wrong verdict?» в панели на странице вакансии.',
    'Delete everything': 'Удалить всё', 'Deletes all applications and offers. Skills and settings are kept.': 'Удаляет все отклики и офферы. Навыки и настройки остаются.',
    'Delete all applications': 'Удалить все отклики', 'Download a backup (Data page)': 'Скачать резервную копию (вкладка «Данные»)',
    'Your data lives only in this browser.': 'Данные хранятся только в этом браузере.',

    // Popup
    'today': 'сегодня', 'last 7 days': 'за 7 дней', 'total': 'всего', 'Statistics': 'Статистика',
    'Check fit for this page': 'Проверить соответствие на этой странице', 'Add this job to the tracker': 'Добавить вакансию в трекер',
    'Open dashboard': 'Открыть панель', 'Recent applications': 'Последние отклики',

    // Tailor page
    'What changed': 'Что изменилось', 'ad keywords in your CV before': 'ключевых слов вакансии в резюме до', 'after': 'после',
    'Use the job title as the headline': 'Использовать должность как заголовок', 'Start again': 'Начать заново',
    'Nothing is invented: lines are only reordered so this ad\'s tools come first. Click any text on the right to edit it; × removes a bullet. Changing an option above resets your edits.': 'Ничего не придумывается: строки только переставлены, чтобы инструменты из вакансии шли первыми. Нажмите на текст справа, чтобы изменить; × удаляет пункт. Смена настройки выше сбрасывает правки.',
    'Keywords in this ad': 'Ключевые слова вакансии', 'Download Word': 'Скачать Word', 'Download PDF': 'Скачать PDF',
    'Built from your CV: the lines that best answer this ad, in the first person. Nothing else is added. Click any paragraph to edit it.': 'Собрано из вашего резюме: строки, которые лучше всего отвечают вакансии, от первого лица. Больше ничего не добавляется. Нажмите на абзац, чтобы изменить.',
    'Availability (optional)': 'Доступность (необязательно)', 'No job ad to tailor to': 'Нет вакансии для адаптации',
    "Your CV from the CV & ATS page, reordered so this ad's tools come first, and a cover letter built from the same lines. Edit them, then download Word or PDF. Nothing is invented.": 'Ваше резюме со страницы «Резюме и ATS», переставленное так, чтобы инструменты из вакансии шли первыми, и сопроводительное письмо из тех же строк. Отредактируйте и скачайте Word или PDF. Ничего не придумывается.',
    'Document': 'Документ', 'Cover letter preview': 'Просмотр письма',

    // Panel on job pages and search results
    'Fit before you apply': 'Оценка до отклика', 'Fit for this job': 'Оценка для вакансии', 'Why this score': 'Почему такая оценка',
    'Hide': 'Скрыть', 'Got it': 'Понятно', 'Undo': 'Отменить', 'Save changes': 'Сохранить изменения', 'Application saved': 'Отклик сохранён',
    'Application saved to Job Tracker': 'Отклик сохранён в Job Tracker', 'Tailor CV + letter': 'Резюме + письмо под вакансию',
    'Your CV reordered for this ad, and a cover letter, as Word or PDF files': 'Ваше резюме под эту вакансию и сопроводительное письмо в Word или PDF',
    'I changed my CV for this job': 'Я изменил(а) резюме под эту вакансию', 'Wrong verdict?': 'Неверный вердикт?', 'What should it be?': 'Каким он должен быть?',
    'Why (optional)': 'Почему (необязательно)', 'e.g. needs a car, too far, admin role': 'например нужна машина, далеко, административная роль',
    'Not a job / not IT': 'Не вакансия / не IT', 'Requirements': 'Требования', 'Nice to have': 'Желательно',
    'Notes (key points from the ad; add your own)': 'Заметки (главное из вакансии; добавьте своё)', 'Recruiter contact, what to prepare…': 'Контакт рекрутера, что подготовить…',
    'Not listed. Add it if you find out': 'Не указано. Добавьте, если узнаете',
    'The application is saved automatically when you press Apply.': 'Отклик сохраняется автоматически при нажатии Apply.',
    'Check the fields: job sites change their layout, so something may be off. The full description and key details are in the dashboard.': 'Проверьте поля: сайты вакансий меняют вёрстку, что-то могло считаться неверно. Полное описание и детали — в панели.',
    'Ad age and applicant count not shown on this page': 'Возраст вакансии и число откликов на странице не указаны',
    'Filter by fit': 'Фильтр по оценке', 'Minimum': 'Минимум', 'Minimum fit score': 'Минимальная оценка', 'What to do with the rest': 'Что делать с остальными',
    'Dim': 'Приглушить', 'Hide jobs I applied to': 'Скрыть вакансии, на которые я откликнулся',
    'Hide outside my areas': 'Скрыть вне моих районов', 'Hide senior / lead / 3rd line': 'Скрыть senior / lead / 3-ю линию',
    'Hide jobs that rule you out (licence, years, local only…)': 'Скрыть вакансии, которые вас исключают (права, годы, только местные…)',
    'Hide internships that break my placement rules': 'Скрыть стажировки, нарушающие мои правила', 'Full score (load each description, slower)': 'Полная оценка (загружать каждое описание, медленнее)',
    'Show scores in results': 'Показывать оценки в результатах', '≈ estimate': '≈ примерно',

    // Gates and reasons that come up most
    'Needs a driving licence or a car': 'Нужны права или машина', 'Mentions driving: check whether a licence is needed': 'Упоминается вождение: уточните, нужны ли права',
    'Needs security clearance: SC usually needs 5 years of UK residence': 'Нужен допуск: для SC обычно нужно 5 лет проживания в UK',
    'Asks for a completed degree': 'Требует законченный диплом', 'The ad is not in English': 'Вакансия не на английском',
    'The ad names few skills: read it yourself, the score is a guess': 'В вакансии мало навыков: прочитайте сами, оценка приблизительная',
    'Rules out a right to work with an end date': 'Исключает право на работу с ограниченным сроком',
    'Asks for an unrestricted right to work: check whether your permission and its extension are accepted': 'Просит неограниченное право на работу: уточните, принимают ли ваше разрешение и его продление',
    'Not a job: a training course, survey site or advert': 'Не вакансия: курс, сайт опросов или реклама',
    'No description saved': 'Описание не сохранено', 'No title or description saved': 'Нет ни заголовка, ни описания',
    'The description still contains a list of other jobs': 'В описании остался список других вакансий',
    'Asks for previous experience in an IT support role: you have none in a paid job yet, so lead with the freelance work and the lab tickets': 'Требует опыт в IT support: оплачиваемого пока нет, поэтому делайте упор на фриланс и тикеты из лаборатории',
    'Apprenticeship: check you are eligible while studying for a degree, and what it pays': 'Апрентисшип: уточните, можно ли во время учёбы на бакалавриате, и сколько платят',
    'tip': 'совет', 'info': 'инфо', 'ok': 'ок', 'unknown': 'неизвестно',
    'Full-time': 'Полный день', 'Part-time': 'Неполный день', 'Remote': 'Удалённо', 'Hybrid': 'Гибрид', 'On-site': 'В офисе',
    'Apprenticeship': 'Апрентисшип', 'Graduate / Placement': 'Выпускники / стажировка', 'None of these': 'Ничего из этого',
    'Not stated': 'Не указано', 'Other': 'Другое', 'Corporate / enterprise environment': 'Корпоративная среда', 'Name': 'Имя',
    'Remove': 'Удалить', 'LinkedIn shows it': 'Показывает LinkedIn', 'Application': 'Отклик',
    'Add your job CV on the': 'Загрузите резюме для работы на странице', 'Add your internship CV on the': 'Загрузите резюме для стажировок на странице',
    'Email (add the address)': 'Email (добавьте адрес)', 'Edit message': 'Изменить сообщение', 'Save email': 'Сохранить email',
    "Paste the recruiter's or company's email": 'Вставьте email рекрутера или компании', 'That does not look like an email address.': 'Это не похоже на email.',
    'Email opened in a new tab. After you press Send there, come back and press Mark as sent.': 'Письмо открыто в новой вкладке. После отправки вернитесь и нажмите «Отметить отправленным».',
    'Email opened without an address: add it in the To field. After sending, press Mark as sent.': 'Письмо открыто без адреса: впишите его в поле «Кому». После отправки нажмите «Отметить отправленным».',
    'Mark as sent today': 'Отметить: отправлен сегодня', 'Send from': 'Отправить с адреса', 'Check in Gmail': 'Проверить в Gmail',
    'Gmail can only switch to accounts signed in to this Chrome window. If': 'Gmail переключается только между аккаунтами, в которые выполнен вход в этом окне Chrome. Если',
    'opens a different account or asks you to sign in: in Gmail, click your photo at the top right →': 'открывает другой аккаунт или просит войти: в Gmail нажмите на фото справа вверху →',
    'Add another account': 'Добавить аккаунт',
    '. An account that lives in a different Chrome profile (another window with a different picture) cannot be reached from here.': '. Аккаунт из другого профиля Chrome (отдельное окно с другой аватаркой) отсюда недоступен.',
    'Gmail accounts to send from, comma-separated (with two or more you choose one each time)': 'Gmail-адреса для отправки через запятую (если их два и больше, адрес выбирается при каждой отправке)', 'Message and contacts ↓': 'Сообщение и контакты ↓', 'on': 'дата',
    'Without LinkedIn Premium a note with an invitation is limited to a few a month, and messages only go to people you are connected with. Email is usually the easier way.': 'Без LinkedIn Premium заметок к приглашению можно отправить всего несколько в месяц, а сообщения доходят только до ваших контактов. Email обычно проще.',
  };

  const n = s => String(s).replace(/\s+/g, ' ').trim();
  const plural = (k, one, few, many) => { const a = k % 10, b = k % 100; return a === 1 && b !== 11 ? one : a >= 2 && a <= 4 && (b < 12 || b > 14) ? few : many; };
  const days = k => `${k} ${plural(k, 'день', 'дня', 'дней')}`;
  const wdays = k => `${k} ${plural(k, 'рабочий день', 'рабочих дня', 'рабочих дней')}`;

  // Sentences with numbers or names in them
  const PATTERNS = [
    [/^(\d+) applied$/, m => `откликов: ${m[1]}`],
    [/^(\d+) with a response$/, m => `с ответом: ${m[1]}`],
    [/^(\d+|—)% of applications$/, m => `${m[1]}% откликов`], [/^(\d+|—)% of responses$/, m => `${m[1]}% ответов`], [/^(\d+|—)% of interviews$/, m => `${m[1]}% интервью`],
    [/^— of (applications|responses|interviews)$/, () => '—'],
    [/^(\d+) · (\d+)% reply · (\d+)% interview$/, m => `${m[1]} · ${m[2]}% ответов · ${m[3]}% интервью`],
    [/^(\d+) \/ (\d+) characters: fits in a connection note\.$/, m => `${m[1]} / ${m[2]} символов: помещается в заметку к приглашению.`],
    [/^(\d+) \/ (\d+): too long for a connection note\. If you are already connected, send it as a normal message\.$/, m => `${m[1]} / ${m[2]}: слишком длинно для заметки. Если вы уже в контактах, отправьте обычным сообщением.`],
    [/^(\d+) working days? without a reply: time to follow up$/, m => `${wdays(+m[1])} без ответа: пора написать фоллоуап`],
    [/^(\d+) days? without a reply(?:, (\d+) follow-ups?)?$/, m => `${days(+m[1])} без ответа${m[2] ? `, фоллоуапов: ${m[2]}` : ''}`],
    [/^Followed up (\d+) days? ago: you can send a second one$/, m => `Фоллоуап был ${days(+m[1])} назад: можно отправить второй`],
    [/^Next step in (\d+) days? \((.+)\)$/, m => `Следующий шаг через ${days(+m[1])} (${m[2]})`],
    [/^Reply to the offer by (.+)$/, m => `Ответить на оффер до ${m[1]}`],
    [/^(\d+) contacts?$/, m => `контактов: ${m[1]}`],
    [/^applied (\d+) days ago$/, m => `отклик ${days(+m[1])} назад`],
    [/^(first|second) follow-up in (\d+) working days?$/, m => `${m[1] === 'first' ? 'первый' : 'второй'} фоллоуап через ${wdays(+m[2])}`],
    [/^last message (\d+) days? ago$/, m => `последнее сообщение ${days(+m[1])} назад`],
    [/^(\d+) fresh$/, m => `свежих: ${m[1]}`], [/^(\d+) older$/, m => `старых: ${m[1]}`], [/^(\d+) with a contact$/, m => `с контактом: ${m[1]}`],
    [/^and (\d+) more$/, m => `и ещё ${m[1]}`], [/^(\d+) within 3 days$/, m => `${m[1]} в течение 3 дней`],
    [/^Fit (\d+)%$/, m => `Оценка ${m[1]}%`],
    [/^(\d+) applications · fit your rules: (\d+) · offers: (\d+)$/, m => `${m[1]} откликов · подходят под правила: ${m[2]} · офферов: ${m[3]}`],
    [/^(.+) · in (\d+) days?$/, m => `${m[1]} · через ${days(+m[2])}`],
    [/^Asks for (\d+)\+ years of experience(.*)$/, m => `Требует ${m[1]}+ лет опыта${m[2]}`],
    [/^(Asks for|Prefers) (\d+) years? of experience(.*)$/, m => `${m[1] === 'Prefers' ? 'Предпочитает' : 'Требует'} ${m[2]} ${plural(+m[2], 'год', 'года', 'лет')} опыта${m[3]}`],
    [/^(.+): outside your areas, check the commute$/, m => `${m[1]}: вне ваших районов, проверьте дорогу`],
    [/^(.+): about (\d+) km from (.+), check the journey time$/, m => `${m[1]}: около ${m[2]} км от ${m[3]}, проверьте время в пути`],
    [/^Only takes candidates based near (.+)$/, m => `Берут только кандидатов рядом с ${m[1]}`],
    [/^"(.+)" is a senior or 3rd-line title$/, m => `«${m[1]}» — senior или 3-я линия`],
    [/^"(.+)": 2nd line or mid-level$/, m => `«${m[1]}»: 2-я линия или средний уровень`],
    [/^"(.+)" is not an IT role$/, m => `«${m[1]}» — не IT-роль`], [/^"(.+)" does not look like an IT role(.*)$/, m => `«${m[1]}» не похожа на IT-роль${m[2]}`],
    [/^Pays up to (£[\d.,]+k?): usually means a few years of experience$/, m => `Платят до ${m[1]}: обычно это означает несколько лет опыта`],
    [/^Contractor day rate \((.+)\): aimed at experienced people$/, m => `Дневная ставка подрядчика (${m[1]}): для опытных`],
    [/^Contract paid by the day \((.+)\): ask how long it runs and whether it is inside IR35$/, m => `Контракт с оплатой за день (${m[1]}): уточните срок и IR35`],
    [/^Skills: (\d+)% match, weighted by importance$/, m => `Навыки: совпадение ${m[1]}% с учётом важности`],
    [/^Partial credit for similar experience: (.+)$/, m => `Частично засчитан похожий опыт: ${m[1]}`],
    [/^Description is only (\d+) characters$/, m => `Описание всего ${m[1]} символов`],
    [/^Location "(.+)" is outside your areas$/, m => `Место «${m[1]}» вне ваших районов`],
    [/^Full-time: you can do (\d+) days a week, raise it at interview$/, m => `Полный день: вы можете ${m[1]} дня в неделю, обсудите на интервью`],
    [/^Full-time Monday to Friday; you can do (\d+) days a week$/, m => `Полный день Пн–Пт, а вы можете ${m[1]} дня в неделю`],
    [/^(.+) is not one of your target roles$/, m => `${m[1]} — не ваша целевая роль`],
    [/^Today: (\d+) sent, (\d+) with a tailored CV · your daily target is (\d+) careful ones\.(.*)$/, m => `Сегодня: отправлено ${m[1]}, с адаптированным резюме ${m[2]} · цель — ${m[3]} продуманных в день.${m[4] ? ' ' + tr(m[4].trim()) : ''}`],
    [/^Target reached: follow up on older ones instead$/, () => 'Цель достигнута: лучше напишите фоллоуапы по старым'],
    [/^sent: (\d+)(?:, last on (.+))?$/, m => `отправлено: ${m[1]}${m[2] ? ', последний ' + m[2] : ''}`],
    [/^Follow-ups sent: (\d+)$/, m => `Отправлено фоллоуапов: ${m[1]}`],
    [/^last on (.+?)(?: to (.+))?$/, m => `последний ${m[1]}${m[2] ? ', кому: ' + m[2] : ''}`],
    [/^Follow-ups sent: (\d+), last on (.+)$/, m => `Отправлено фоллоуапов: ${m[1]}, последний ${m[2]}`],
    [/^Already applied via (.+)$/, m => `Уже откликались через ${m[1]}`],
  ];

  const MARK = /^([✕!?•✓]\s+)/;
  function tr(s) {
    const t = n(s);
    if (!t) return s;
    if (Object.prototype.hasOwnProperty.call(RU, t)) return RU[t];
    for (const [re, fn] of PATTERNS) { const m = t.match(re); if (m) return fn(m); }
    // Several lines (tooltips), a marker in front (✕ ! ?), or parts joined with ' · '
    if (t.includes('\n') || /\n/.test(s)) return String(s).split('\n').map(x => x.trim() ? tr(x) : x).join('\n');
    const mk = t.match(MARK);
    if (mk) { const r = tr(t.slice(mk[1].length)); if (r !== t.slice(mk[1].length)) return mk[1] + r; }
    if (t.includes(' · ')) { const parts = t.split(' · '), out = parts.map(tr); if (out.some((x, i) => x !== parts[i])) return out.join(' · '); }
    return s;
  }

  // Never translated: what you type, the CV and letters you edit, scripts and code
  const SKIP = 'textarea, script, style, code, pre, [contenteditable], .no-i18n, #page, #lpage';
  const ATTRS = ['placeholder', 'title', 'aria-label'];
  let lang = 'en';

  function translateNode(node) {
    if (lang !== 'ru') return;
    if (node.nodeType === 3) {
      const p = node.parentElement;
      if (!p || p.closest(SKIP)) return;
      // An <option> without a value attribute submits its text: translating it would change the value
      if (p.tagName === 'OPTION' && !p.hasAttribute('value')) return;
      const v = node.nodeValue;
      if (!/[A-Za-z]/.test(v)) return;
      const r = tr(v);
      if (r !== v) { const lead = v.match(/^\s*/)[0], tail = v.match(/\s*$/)[0]; node.nodeValue = lead + n(r) + tail; }
      return;
    }
    if (node.nodeType !== 1 && node.nodeType !== 11) return;
    if (node.nodeType === 1) {
      if (node.closest(SKIP) && !node.matches('textarea, input')) return;
      ATTRS.forEach(a => { const v = node.getAttribute && node.getAttribute(a); if (v && /[A-Za-z]/.test(v)) { const r = tr(v); if (r !== v) node.setAttribute(a, r); } });
      if (node.matches('textarea, script, style, code, pre, [contenteditable], .no-i18n, #page, #lpage')) return;
    }
    node.childNodes.forEach(translateNode);
    if (node.nodeType === 1 && node.shadowRoot) watch(node.shadowRoot);
  }

  const watched = new WeakSet(), roots = [];
  function watch(rootNode) {
    if (!rootNode || watched.has(rootNode)) return;
    watched.add(rootNode); roots.push(rootNode);
    translateNode(rootNode);
    new MutationObserver(list => {
      if (lang !== 'ru') return;
      list.forEach(m => {
        if (m.type === 'characterData') translateNode(m.target);
        else if (m.type === 'attributes') translateNode(m.target);
        else m.addedNodes.forEach(translateNode);
      });
    }).observe(rootNode, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ATTRS });
  }

  /** Reads the language from the profile and keeps it current. On extension pages the whole page is
      translated; on job sites only the extension's own panels are, through watch(shadowRoot). */
  function start(doc, wholePage) {
    doc = doc || document;
    const apply = l => {
      lang = l === 'ru' ? 'ru' : 'en';
      // Panels drawn before the profile was read
      if (lang === 'ru') roots.forEach(translateNode);
      if (!wholePage) return;
      if (doc.documentElement) doc.documentElement.lang = lang;
      if (lang === 'ru') { doc.title = tr(doc.title); watch(doc.documentElement || doc); }
    };
    try {
      chrome.storage.local.get('profile', r => apply(((r && r.profile) || {}).lang));
      chrome.storage.onChanged.addListener(ch => {
        if (!ch.profile) return;
        const was = lang, now = ((ch.profile.newValue || {}).lang) === 'ru' ? 'ru' : 'en';
        if (now === was) return;
        // Extension pages reload to switch cleanly; on job sites the next panel uses the new language
        if (location.protocol === 'chrome-extension:') location.reload(); else apply(now);
      });
    } catch (e) { /* not running as an extension (tests) */ }
    if (!wholePage) return;
    if (root.confirm && !root.confirm.jt) { const c = root.confirm.bind(root); root.confirm = m => c(tr(m)); root.confirm.jt = true; }
    if (root.alert && !root.alert.jt) { const a = root.alert.bind(root); root.alert = m => a(tr(m)); root.alert.jt = true; }
  }

  // Extension pages translate themselves; content scripts call watch() on their panels
  if (typeof document !== 'undefined' && typeof location !== 'undefined') start(document, location.protocol === 'chrome-extension:');

  const api = { tr, start, watch, RU, PATTERNS, setLang: l => { lang = l === 'ru' ? 'ru' : 'en'; }, get lang() { return lang; } };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.JT_I18n = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
