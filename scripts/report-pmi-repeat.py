"""Create a repeat protocol using new evidence and the approved exclusions."""
import ast
import hashlib
import json
import sys
from collections import Counter
from html import escape
from pathlib import Path
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, KeepTogether
import pypdfium2 as pdfium

ROOT=Path(__file__).resolve().parents[1]
OUT=Path(sys.argv[1]).resolve()
MAIN=OUT/'main'
CREATE=Path(sys.argv[2]).resolve()
load_json=lambda p:json.loads(p.read_text(encoding='utf8'))
api={r['pmi']:r for r in load_json(MAIN/'api-results.json')}
browser={r['pmi']:r for r in load_json(MAIN/'browser-results.json')['results']}
ui={r['pmi']:r for r in load_json(MAIN/'ui-actions.json')}
idle=load_json(OUT/'idle/idle-result.json')
creation=load_json(CREATE)
recheck=load_json(Path(sys.argv[3]))[0] if len(sys.argv)>3 else None
run=load_json(OUT/'run.json')
schema=ast.parse((ROOT/'scripts/make-pmi-report.py').read_text(encoding='utf8'))
base=ast.literal_eval(next(n.value for n in schema.body if isinstance(n,ast.Assign) and any(isinstance(t,ast.Name) and t.id=='items' for t in n.targets)))
cases=[]
for id,title,expected,steps,_old_fact in base:
 status=api.get(id,browser.get(id,{'status':'NOT_RUN'}))['status']
 cases.append(dict(id=id,title=title,status=status,expected=expected,steps=steps,fact=''))
by_id={c['id']:c for c in cases}
def update(id,**kwargs):by_id[id].update(kwargs)
def add(id,title,status,expected,steps,fact):
 c=dict(id=id,title=title,status=status,expected=expected,steps=steps,fact=fact);cases.append(c);by_id[id]=c
def num(x):return f'{x:.3f}'.replace('.',',')
load=api['4.8.2']['evidence']
perf=browser['4.8.1']['evidence']
update('4.1.1',fact='Три рабочие роли успешно вошли в систему. Неверный пароль отклонён с HTTP 401. В браузере после первого входа открыт журнал.')
update('4.1.2',fact='Ab12, Password и 12345678 отклонены при создании и изменении через API и в форме создания. Показаны причины отказа. Допустимый пароль Doctor12 принят.')
update('4.1.3',fact='Проверка исключена по указанию пользователя. Хранение паролей не оценивалось.')
idle_fact='Проверка ещё выполняется; положительный результат не установлен.'
if idle['status']=='PASS':idle_fact=f"Все пять вкладок вышли через {num(idle['expiredSeconds'])} с. Другая активная учётная запись осталась в системе. После входа восстановились {idle['patientPath']}, несохранённый текст и блокировка. Владелец снял блокировку явно."
elif idle['status']=='FAIL':idle_fact=idle.get('error','Не получен положительный результат.')
update('4.1.4',status=idle['status'],fact=idle_fact,steps='На отдельном стенде с 88 карточками врач открыл созданную им карточку, взял блокировку и ввёл несохранённый текст. Открыты ещё четыре вкладки. Другая учётная запись оставалась активной. Использовано реальное ожидание, часы не ускорялись.')
update('4.2.1',fact='Все 15 разделов сохранены руководителем. Управление пользователями доступно. Файлы, аудит и выгрузка дополнительно проверены отдельными сценариями и доступны.')
update('4.2.2',expected='По уточнению пользователя стационар редактирует 1–10 только в созданных им карточках. Все 15 разделов видны; 11–15 доступны для чтения.',fact='В собственной карточке сохранены 1–10; для 11–15 получен 403. В чужой карточке изменение 1–10 и взятие блокировки запрещены. В браузере разрешённые поля доступны, остальные только для чтения. Аудит в runtime отсутствует; прямой запрос к аудиту запрещён. Просмотр чужой карточки не признан дефектом: пользователь ограничил её редактирование.')
update('4.2.3',expected='По уточнению пользователя амбулатория редактирует 11–15 в карточках стационара, а 1–10 доступны для чтения.',fact='Разделы 11–15 сохраняются в карточке другого автора. Для 1–10 получен 403. Все 15 разделов видны; режим полей подтверждён в браузере. Аудит врачам не передаётся.')
update('4.2.4',title='Управление пользователями',status=ui['4.2.4']['status'],fact='Через API и интерфейс выполнены создание учётной записи, назначение роли, блокировка, разблокировка и смена роли. Заблокированная запись не вошла. Тестовая запись удалена. Диалог не закрылся по клику на фон и Escape, явная отмена сработала.')
update('4.3.1',fact='Отображаются 88 карточек и ключевые реквизиты ID, шифр и группа. Фильтр ID использует вхождение; значение 9 может соответствовать также 19, 29 и другим ID.')
update('4.3.2',status='PASS' if creation['status']=='PASS' and ui['4.3.2']['status']=='PASS' else 'PARTIAL',fact='После исправления форма создала карточку с новым шифром; данные сохранились после перезагрузки. Отдельный браузерный прогон с задержанной загрузкой runtime подтвердил обновление автоматического шифра. Сервер сам выделяет ID и шифр. Ручной дубликат получает 409 и понятное сообщение; черновик сохраняется, кнопка снова доступна. Свободный ручной шифр пережил перезагрузку и был сохранён. Серверный тест одновременного создания восьми карточек подтвердил уникальность ID и шифров.')
update('4.3.3',title='Автор и время изменения',fact='При изменении автор U-AMB-001 и время заполнены, создатель не изменился. Браузерное сохранение уникального текста пережило перезагрузку.')
update('4.3.4',fact='Другой врач не смог сохранить или снять чужую блокировку (403). Блокировка пережила ручной выход владельца и снята явно. Проверка таймаута отражена отдельно в 4.1.4.')
update('4.4.1',status=ui['4.4.1']['status'],fact='Руководитель загрузил, скачал и удалил текстовый файл через API и интерфейс. Скачанные байты совпали с исходными.')
update('4.4.2',fact='Оба врача скачали файл с совпадением содержимого. Прямые запросы загрузки и удаления получили 403 для обеих ролей.')
update('4.4.3',fact='Автор U-LEAD-001, дата 12.11.2026 и комментарий присутствуют в API и интерфейсе. После удаления файл недоступен (404).')
update('4.5.1',fact='Для входа, создания карточки, редактирования, выгрузки и загрузки файла найдены события с пользователем, действием и деталями.')
update('4.5.2',fact='В строках аудита нет кнопок и полей удаления или изменения. Проверено именно ограничение интерфейса; защита от прямого изменения БД администратором сервера не оценивалась.')
update('4.5.3',fact='Комбинированный отбор по периоду, пользователю и действию показал только подходящие строки. Сброс восстановил список.')
update('4.6.1',status='PARTIAL',fact='API и кнопка полной выгрузки сформировали XLSX с 88 строками независимо от активного фильтра. ZIP/XML корректен, styles.xml совпадает с шаблоном. API-скачивание '+num(api['4.6.1']['evidence']['seconds'])+' с. Визуальное открытие в настольном Microsoft Excel не подтверждено; эта часть методики остаётся непроверенной.')
update('4.6.2',fact='По трём выбранным ID API вернул три строки. Браузерный срез содержит столько же строк, сколько отобрано фильтром в журнале; проверяется фактический результат поиска по вхождению.')
update('4.6.3',fact='У обоих врачей отсутствуют кнопки выгрузки. Прямые запросы полной выгрузки и среза получили 403. Переходы к экранам аудита и управления также закрыты.')
update('4.7.1',status=browser['4.7.1']['status'],fact='Проверены шесть экранов на 1920×1080 и 1024×768, границы контролов и подписи. Переполнение страницы и пересечения контролов не обнаружены. Все 15 разделов переключены; кнопки доступны без горизонтальной прокрутки.')
averages=perf['averagesMs']
update('4.8.1',fact='Выполнено по 10 успешных повторов. Среднее: журнал '+num(averages['journal.load']/1000)+' с, открытие '+num(averages['patient.open']/1000)+' с, сохранение '+num(averages['patient.save']/1000)+' с. Измерено Performance API до отрисовки; открытие использует уже загруженные данные и не имеет отдельного HTTP-запроса.')
load_fact=f"Из {load['requests']} запросов ошибок {load['failed_requests']}. Среднее время обычных операций {num(load['normal_average_seconds'])} с, максимум {num(load['normal_max_seconds'])} с; запросов дольше 2 с — {load['normal_over_2s']}. "
if recheck:
 lr=recheck['evidence'];load_fact+=f"В дополнительном прогоне: ошибок {lr['failed_requests']}, среднее {num(lr['normal_average_seconds'])} с, максимум {num(lr['normal_max_seconds'])} с, превышений {lr['normal_over_2s']}. "
load_fact+='Среднее время укладывается в порог, но при наличии отдельных превышений устойчивое соблюдение двух секунд не подтверждено. Использованы 20 HTTP-клиентов с барьером старта и ThreadPoolExecutor; JMeter не запускался. Результат не подменяет формальный прогон JMeter.'
load_status='FAIL' if load['failed_requests'] or load['normal_over_2s'] or (recheck and recheck['status']=='FAIL') else 'PARTIAL'
update('4.8.2',status=load_status,fact=load_fact)
bt=browser['4.8.3']['evidence']['fullExportUISeconds']
update('4.8.3',fact='От нажатия до сохранения браузером: '+', '.join(num(t)+' с' for t in bt)+'. Три HTTP-скачивания: '+', '.join(num(t)+' с' for t in api['4.8.3']['evidence']['server_download_seconds'])+'. Порог 60 секунд выполнен.')
update('4.9.1',fact='HTTPS и сертификат исключены по указанию пользователя. Локальные стенды использовали HTTP; вывод о транспортной защите не делается.')
add('4.2.4-admin','Системный администратор','EXCLUDED','Роль исключена пользователем.','Проверка не включена в оценку.','Наличие этой роли не требуется и не считается дефектом. В исходном ПМИ номер 4.2.4 также присвоен управлению пользователями.')
add('4.3.3-blocks','Доступ к блокам формы','PASS','Все 15 разделов видны; стационар изменяет собственные 1–10, амбулатория — 11–15.','Проверены обе роли в браузере и все разделы через API.','Согласованная модель доступа подтверждена. Формулировка исходного ПМИ о блоках 1–2 и 5 заменена последним уточнением пользователя; номер 4.3.3 в исходном документе повторяется.')
add('4.9.2','Обезличивание и прямые идентификаторы','EXCLUDED','Замечание по ФИО исключено пользователем.','Состав идентификаторов не включён в итоговую оценку.','Поля ФИО, телефонов и сохранённые данные не изменялись. Юридическая оценка соответствия законодательству не проводилась.')
order=['4.1.1','4.1.2','4.1.3','4.1.4','4.2.1','4.2.2','4.2.3','4.2.4-admin','4.2.4','4.3.1','4.3.2','4.3.3-blocks','4.3.3','4.3.4','4.4.1','4.4.2','4.4.3','4.5.1','4.5.2','4.5.3','4.6.1','4.6.2','4.6.3','4.7.1','4.8.1','4.8.2','4.8.3','4.9.1','4.9.2']
cases=[by_id[k] for k in order]
display_id={'4.2.4-admin':'4.2.4а','4.2.4':'4.2.4б','4.3.3-blocks':'4.3.3а','4.3.3':'4.3.3б'}
labels={'PASS':'Пройден','PARTIAL':'Частично','FAIL':'Не пройден','EXCLUDED':'Исключён','RUNNING':'Выполняется','NOT_RUN':'Не проверен'}
inks={'PASS':'188038','PARTIAL':'B88600','FAIL':'C5221F','EXCLUDED':'666666','RUNNING':'666666','NOT_RUN':'666666'}
counts=Counter(c['status'] for c in cases)
pdfmetrics.registerFont(TTFont('Arial','C:/Windows/Fonts/arial.ttf'));pdfmetrics.registerFont(TTFont('Arial-Bold','C:/Windows/Fonts/arialbd.ttf'));pdfmetrics.registerFontFamily('Arial',normal='Arial',bold='Arial-Bold')
styles=getSampleStyleSheet()
for s in styles.byName.values():s.fontName='Arial';s.textColor=colors.black
styles['Normal'].fontSize=10;styles['Normal'].leading=14;styles['Normal'].spaceAfter=6;styles['Normal'].allowWidows=0;styles['Normal'].allowOrphans=0
styles['Title'].fontSize=21;styles['Title'].leading=25;styles['Title'].alignment=0
styles['Heading1'].fontSize=15;styles['Heading1'].leading=19;styles['Heading1'].keepWithNext=True
styles['Heading2'].fontSize=12;styles['Heading2'].leading=16;styles['Heading2'].keepWithNext=True
styles.add(ParagraphStyle('Cell',parent=styles['Normal'],fontSize=9,leading=12,spaceAfter=0))
story=[]
def p(text,style='Normal'):story.append(Paragraph(escape(text),styles[style]))
def labeled(label,text):story.append(Paragraph('<b>'+escape(label)+'.</b> '+escape(text),styles['Normal']))
p('Протокол повторной проверки системы поддержки исследования','Title')
p('12 ноября 2026 года • ПМИ версия 2 • повторный инженерный прогон')
p('Ошибка автоматического шифра исправлена и проверена через API и интерфейс. Права врачей и закрытие аудита подтверждены. Полностью положительное заключение по ПМИ пока дать нельзя: отдельные запросы нагрузочного прогона превысили 2 секунды, а визуальная проверка итоговой выгрузки в настольном Excel не подтверждена. Исключения пользователя отражены отдельно.')
p('Условия и применённые уточнения','Heading1')
p('Базовый коммит '+run['commit'][:12]+' и локальное исправление шифра. Основной стенд 127.0.0.1:8002 и отдельный стенд таймаута 127.0.0.1:8003 используют новые БД с 88 карточками. Дополнительная проверка шифра выполнена на изолированной копии на порту 8004. Рабочие пользовательские данные не изменялись. Отчёт относится к локальным испытаниям, а не к комиссионной приёмке на инфраструктуре университета.')
p('Применены уточнения пользователя: стационар меняет 1–10 только в созданных им карточках; амбулатория — 11–15 в карточках стационара. Все 15 разделов видны. При выходе блокировка сохраняется; после входа восстанавливаются страница и черновик. Исключены хэширование, HTTPS, системный администратор и замечание по ФИО. В исходном ПМИ повторены номера 4.2.4 и 4.3.3; в протоколе они различаются суффиксами а и б.')
p('Первый запуск таймаута был прерван потерей подключения и не использован как успешный. Реальная проверка перезапущена; её результат указан в 4.1.4. В ходе работ исправлены только генерация шифра и обработка ошибки создания; к ранее выполненным проверкам добавлены целевые проверки исправления.')
p('Сводка по пунктам ПМИ','Heading1')
p('Всего 29 проверок: '+', '.join(labels[k].lower()+' — '+str(v) for k,v in counts.items())+'.')
data=[[Paragraph(t,styles['Cell']) for t in ['Пункт','Проверка','Результат']]]
for c in cases:data.append([Paragraph(display_id.get(c['id'],c['id']),styles['Cell']),Paragraph(escape(c['title']),styles['Cell']),Paragraph('<font color="#'+inks[c['status']]+'">'+labels[c['status']]+'</font>',styles['Cell'])])
table=Table(data,colWidths=[53,300,129],repeatRows=1,hAlign='LEFT');table.setStyle(TableStyle([('BACKGROUND',(0,0),(-1,0),colors.HexColor('#E8EDF2')),('GRID',(0,0),(-1,-1),.4,colors.HexColor('#D9D9D9')),('VALIGN',(0,0),(-1,-1),'MIDDLE'),('TOPPADDING',(0,0),(-1,-1),5),('BOTTOMPADDING',(0,0),(-1,-1),5)]));story.extend([table,Spacer(1,12)])
p('Подробные результаты','Heading1')
for c in cases:
 story.append(KeepTogether([Paragraph(escape(display_id.get(c['id'],c['id'])+' '+c['title']),styles['Heading2']),Paragraph('<b><font color="#'+inks[c['status']]+'">'+labels[c['status']]+'</font></b>',styles['Normal']),Paragraph('<b>Ожидается.</b> '+escape(c['expected']),styles['Normal'])]))
 labeled('Проверка',c['steps']);labeled('Факт и оценка',c['fact'])
p('Исправление шифра и оставшиеся ограничения','Heading1')
p('Форма больше не хранит автоматически рассчитанный шифр как ручное значение до загрузки журнала. При автоматическом режиме сервер выделяет ID и шифр в одной операции записи. Ручной дубликат возвращает 409 с понятным сообщением, данные остаются в форме, повторное сохранение доступно. Ручной свободный шифр сохраняется в черновике и не подменяется автоматически.')
p('Нагрузочный прогон завершился без ошибок, но превышения двух секунд требуют отдельного анализа и повторной проверки на целевой инфраструктуре. Нельзя делать вывод о гарантированном максимуме из одного успешного среднего значения. Формальная проверка JMeter не выполнялась. Структура и стили XLSX проверены программно; это не заменяет визуального просмотра в Microsoft Excel.')
p('Дополнительное замечание пользователя: после обычного ухода из создания или редактирования формы введённый черновик восстанавливается при возврате. Предложено предупреждать об уходе, очищать несохранённый ввод при подтверждённом выходе и восстанавливать его только после таймаута. Эта логика обсуждается отдельно и в данном исправлении шифра не изменялась. Проверка 4.1.4 подтверждает именно выход по таймауту и восстановление после него.')
p('Доказательства и воспроизведение','Heading1')
p('Основная папка результатов: '+str(OUT)+'. Сохранены api-results.json, browser-results.json, ui-actions.json, extra-results.json, load-20.json, idle/idle-result.json и журналы серверов. Целевая проверка шифра: '+str(CREATE)+'. '+('Повтор нагрузки: '+sys.argv[3]+'.' if recheck else ''))
p('Автоматические проверки: 12 серверных тестов, 6 frontend-тестов и 9 проверок компонентов; сборка TypeScript/Vite завершилась успешно. Дополнительно выполнены браузерные сценарии ПМИ и целевая проверка шифра. Метрики относятся к данному компьютеру и набору из 88 карточек.')
hashes={str(p.relative_to(ROOT)):hashlib.sha256(p.read_bytes()).hexdigest() for p in [ROOT/'backend/app/main.py',ROOT/'src/features/patient/CreatePatientForm.tsx']}
(OUT/'assessment.json').write_text(json.dumps({'counts':dict(counts),'cases':cases,'source_sha256':hashes},ensure_ascii=False,indent=2),encoding='utf8')
def footer(canvas,document):canvas.setFont('Arial',8);canvas.setFillColor(colors.HexColor('#666666'));canvas.drawRightString(A4[0]-55,25,str(document.page))
target=OUT/'PMI_repeat_protocol_20261112.pdf'
SimpleDocTemplate(str(target),pagesize=A4,leftMargin=55,rightMargin=55,topMargin=45,bottomMargin=45,title='Протокол повторной проверки системы поддержки исследования').build(story,onFirstPage=footer,onLaterPages=footer)
render=OUT/'report-render';render.mkdir(exist_ok=True)
pdf=pdfium.PdfDocument(str(target))
for i,page in enumerate(pdf):page.render(scale=1.5).to_pil().save(render/f'page-{i+1}.png')
print('REPORT',target,'PAGES',len(pdf),'COUNTS',dict(counts))
