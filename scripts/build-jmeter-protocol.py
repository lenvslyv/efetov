"""Build a source-backed PDF protocol from retained JMeter evidence."""
import csv, hashlib, json, math, re, sqlite3
from pathlib import Path
from datetime import datetime, timezone, timedelta
from html import escape
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, PageBreak
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
import pypdfium2 as pdfium

ROOT=Path(__file__).resolve().parents[1]
RUN=ROOT/'.cache/jmeter-pmi-20261116-123012'
OLD=ROOT/'.cache/jmeter-pmi-20261116-120404'
OUT=ROOT/'.cache/jmeter-protocol-20261116';OUT.mkdir(exist_ok=True)
manifest=json.loads((RUN/'manifest.json').read_text(encoding='utf8'))
rows=list(csv.DictReader((RUN/'results.jtl').open(encoding='utf-8-sig')))
http=[r for r in rows if r['URL'].startswith('http')]
old=list(csv.DictReader((OLD/'results.jtl').open(encoding='utf-8-sig')))
old_http=[r for r in old if r['URL'].startswith('http')]
assert len(http)==16066 and not [r for r in rows if r['success']!='true']
assert all(manifest['acceptance_checks'].values())
def stats(label):
    r=[r for r in http if r['label']==label];v=sorted(int(r['elapsed']) for r in r)
    return [len(r),sum(r['success']!='true' for r in r),sum(v)/len(v),v[math.ceil(.95*len(v))-1],max(v)]
with sqlite3.connect('file:'+str(RUN/'efetov.db')+'?mode=ro',uri=True) as c:
    assert c.execute('pragma integrity_check').fetchall()==[('ok',)]
    assert c.execute('pragma foreign_key_check').fetchall()==[]
    assert c.execute('select count(*) from patients').fetchone()[0]==88
    assert c.execute('select count(*) from patients where lock_user_id is not null').fetchone()[0]==0
    for a in manifest['accounts'][10:18]:
        blocks=json.loads(c.execute('select blocks_json from patients where id=?',(a['patient_id'],)).fetchone()[0])
        assert any(f.get('key')==a['field'] and f.get('value','').startswith('JMETER-'+a['login']+'-') for fields in blocks.values() for f in fields)
assert hashlib.sha256(Path(manifest['source_db']).read_bytes()).hexdigest()==manifest['source_sha256']

pdfmetrics.registerFont(TTFont('Arial','C:/Windows/Fonts/arial.ttf'))
pdfmetrics.registerFont(TTFont('Arial-Bold','C:/Windows/Fonts/arialbd.ttf'))
pdfmetrics.registerFontFamily('Arial',normal='Arial',bold='Arial-Bold')
styles=getSampleStyleSheet()
for st in styles.byName.values():st.fontName='Arial';st.textColor=colors.black
styles['Normal'].fontSize=10;styles['Normal'].leading=14;styles['Normal'].spaceAfter=7
styles['Title'].fontSize=22;styles['Title'].leading=27;styles['Title'].spaceAfter=12
styles['Heading1'].fontSize=15;styles['Heading1'].leading=19;styles['Heading1'].spaceAfter=9
styles['Heading2'].fontSize=11;styles['Heading2'].leading=15;styles['Heading2'].spaceBefore=8
styles.add(ParagraphStyle('Cell',parent=styles['Normal'],fontSize=9,leading=12,spaceAfter=0))
styles.add(ParagraphStyle('Small',parent=styles['Normal'],fontSize=8,leading=11,spaceAfter=5))
styles.add(ParagraphStyle('Hash',parent=styles['Small'],fontSize=7.5,leading=10,wordWrap='CJK'))
story=[]
def p(text,style='Normal'):story.append(Paragraph(text,styles[style]))
def heading(text):p(text,'Heading1')
def table(data,widths):
    cells=[[Paragraph(str(x),styles['Cell']) for x in row] for row in data]
    t=Table(cells,colWidths=widths,repeatRows=1,hAlign='LEFT')
    t.setStyle(TableStyle([('BACKGROUND',(0,0),(-1,0),colors.HexColor('#E8EEF5')),('GRID',(0,0),(-1,-1),.5,colors.HexColor('#D9D9D9')),('VALIGN',(0,0),(-1,-1),'MIDDLE'),('LEFTPADDING',(0,0),(-1,-1),7),('RIGHTPADDING',(0,0),(-1,-1),7),('TOPPADDING',(0,0),(-1,-1),6),('BOTTOMPADDING',(0,0),(-1,-1),6)]))
    story.append(t);story.append(Spacer(1,9))
def newpage():story.append(PageBreak())

p('Протокол нагрузочного тестирования','Title')
p('Система информационной поддержки клинического исследования<br/>16 ноября 2026 года • Apache JMeter 5.6.3','Small')
p('<b>Результат повторного прогона положительный в границах проверенного API-сценария.</b> Двадцать независимых пользователей одновременно работали не менее 15 минут. Ошибок HTTP-запросов и проверок данных не зарегистрировано. Обрывы соединений первого прогона во втором прогоне не воспроизвелись.')
heading('1 Основание и объём проверки')
p('Основание: раздел 4.8 программы и методики испытаний «ПМИ система поддержки исследования версия 2». Цель: проверить одновременный просмотр, редактирование и выгрузку данных двадцатью пользователями. Настоящий документ фиксирует локальный инженерный прогон; комиссионная приёмка и промышленная инфраструктура университета в него не входят.')
table([['Пункт ПМИ','Вывод по настоящему прогону'],['4.8.1 Время интерфейса','Не проверялось. Требуются 10 браузерных измерений каждой операции; среднее не более 2 секунд.'],['4.8.2 Двадцать пользователей','Подтверждено для описанного API-профиля на локальном стенде. Все 20 участников завершили сценарий; ошибок запросов нет.'],['4.8.3 Выгрузка Excel','HTTP-часть подтверждена: 60 загрузок, максимум 676 мс. Замер от нажатия кнопки в браузере до завершения скачивания не выполнялся.']],[130,369])
heading('2 Основные показатели')
table([['Показатель','Фактическое значение'],['Набор данных','88 ранее подготовленных тестовых карточек; использована отдельная копия БД'],['Пользователи','20 отдельных учётных записей и JWT-сессий'],['Полная нагрузка','900,517 секунды по пересечению интервалов участников'],['Запросы HTTP','16 066; ошибок 0'],['Сохранения и повторные проверки','1 837 сохранений; 1 837 успешных повторных чтений'],['Выгрузки Excel','60; ошибок 0']],[230,269])

newpage();heading('3 Стенд и условия воспроизведения')
table([['Параметр','Значение'],['Адрес','http://127.0.0.1:8001'],['Размещение','Приложение и генератор нагрузки на одном компьютере'],['ПО','Windows 11; Java 21.0.12.1; JMeter 5.6.3; Python 3.12.14'],['Приложение','FastAPI и Uvicorn, один процесс; SQLite в режиме WAL'],['Исходная версия кода',manifest['commit']],['Время выполнения','12:30:14-12:46:30 МСК 16.11.2026, включая подготовку и завершение'],['Начало полной нагрузки','12:31:13,857 МСК; завершение участников после 12:46:14'],['Настройки HTTP','HttpClient4; keep-alive включён; idle timeout 4 000 мс; проверка после простоя 1 000 мс; повторов 0']],[150,349])
p('Испытания выполнены на копии существующего набора от 12.11.2026. Новые клинические данные не генерировались. В копии сняты исходные блокировки; четырём врачам стационара назначены их отдельные карточки для разрешённого редактирования. Рабочая БД приложения не использовалась. Контрольная сумма исходной тестовой БД после прогона совпадает с исходной.')
heading('4 Профиль нагрузки и порядок действий')
table([['Группа','Число','Последовательность'],['Просмотр','10','Вход один раз → поддержание сессии → журнал → повторение'],['Редактирование','8','Вход → поддержание сессии → журнал → блокировка своей карточки → сохранение уникального значения → повторное чтение → разблокировка'],['Выгрузка','2','Вход руководителем → поддержание сессии → полная выгрузка Excel → повторение']],[102,43,354])
p('В группах просмотра и редактирования поровну представлены врачи стационара и амбулатории. Всего: 9 врачей стационара, 9 врачей амбулатории и 2 руководителя. Врачи редактируют разные карточки и доступные им разделы: 1 либо 11. Перед загрузкой журнала установлена случайная пауза 2-5 секунд; перед выгрузкой - 30 секунд. Паузы не входят в elapsed HTTP-запроса.')
p('Разгон задан 60 секундами. После входа участники ожидают общий барьер из 20 пользователей. Затем запускается общий интервал нагрузки 900 секунд. После его окончания каждый участник завершает начатую итерацию, включая снятие блокировки. Предусмотрен запас на завершение 120 секунд.')

newpage();heading('5 Проверки и фактические результаты')
p('Для каждого HTTP-запроса проверяется код 200. При загрузке журнала проверяется наличие 88 карточек. При сохранении проверяется уникальная метка в ответе, затем та же метка читается отдельным запросом из БД через API. Для Excel проверяются время до 60 секунд, минимальный размер и ZIP-сигнатура PK. Полнота колонок и клинических значений Excel этим сценарием не проверялась.')
labels={'Login':'Вход','Session touch':'Продление сессии','Journal':'Загрузка журнала','Lock':'Блокировка','Save':'Сохранение','Verify persisted':'Повторное чтение','Unlock':'Разблокировка','Excel export':'Выгрузка Excel'}
data=[['Операция','Запросов','Ошибок','Среднее мс','P95 мс','Макс мс']]
for label,title in labels.items():
    n,err,mean,p95,mx=stats(label);data.append([title,n,err,f'{mean:.2f}'.replace('.',','),p95,mx])
table(data,[151,64,55,83,66,80])
p('Метрики рассчитаны по results.jtl за весь прогон. P95 определён методом ближайшего ранга. Служебные Groovy-сэмплы исключены из таблицы HTTP; всего сэмплов в JMeter 17 963. Ожидание общего барьера и пользовательские паузы не являются временем ответа сервера. Максимум основных HTTP-операций меньше 2 секунд; это не измерение отрисовки интерфейса. В ПМИ для нагрузки конкретный перцентиль и процент допустимых ошибок отдельно не заданы. Здесь проверялось отсутствие ошибок, а время представлено полностью.')
heading('6 Сохранность и завершение работы')
table([['Контроль','Результат'],['Число карточек после прогона','88; число не изменилось'],['Оставшиеся блокировки','0'],['Проверка SQLite integrity_check','ok'],['Проверка foreign_key_check','Нарушений нет'],['Итоговые метки восьми редакторов','Присутствуют в соответствующих карточках'],['Сохранение и повторное чтение','1 837 пар; несовпадений нет'],['Завершение участников','20 из 20; полный интервал 900,517 секунды'],['Исключения приложения и HTTP 500 в server.log','Не обнаружены']],[300,199])
p('Проверки подтверждают целостность SQLite, сохранение контрольных значений и отсутствие оставленных блокировок в данном сценарии. Полная сверка каждого клинического поля до и после испытаний не выполнялась. Метрики загрузки CPU, памяти и дисковой подсистемы в этом прогоне не собирались.','Small')

newpage();heading('7 Сопоставление с первым полным прогоном')
table([['Показатель','Первый прогон','Повторный прогон'],['Начало 16.11.2026 МСК','12:04','12:30'],['Запросы HTTP','16 672','16 066'],['Ошибки HTTP','3 (0,018%)','0'],['Одновременная работа двадцати','Около 886,9 с','900,517 с'],['Сохранения и проверки','1 908 / 1 908','1 837 / 1 837'],['Выгрузки','61','60']],[225,137,137])
p('В первом прогоне зарегистрированы три отказа загрузки журнала: 12:07:50,890 - NoHttpResponseException; 12:11:18,974 и 12:15:11,547 - Connection reset. Каждому предшествовал простой соединения 4 984-4 999 мс. Исключений приложения не обнаружено. Это согласуется с гипотезой о закрытии простаивающего соединения на границе серверного таймаута 5 секунд, но отдельный эксперимент с изменением только одного параметра не проводился.')
p('В повторном прогоне изменён только испытательный сценарий: клиентское завершение простаивающих соединений через 4 секунды, проверка соединения после 1 секунды простоя, явный запрет автоматических повторов и общий барьер начала нагрузки. Таймаут сервера, API и код журнала не менялись. Три обрыва не воспроизвелись. Это результат проверки гипотезы, а не доказательство устранения дефекта приложения. Число запросов не используется для вывода об улучшении скорости: различается организация начала нагрузки.')
p('В jmeter.log осталась одна запись уровня ERROR об отсутствии ресурсов локализации ru_RU при инициализации. Она относится к локализации инструмента; HTTP-сценарии выполнены, все бизнес-проверки успешны. При необходимости запись устраняется отдельной настройкой языка JVM.','Small')
heading('8 Итог и доказательные материалы')
p('<b>Пункт 4.8.2 подтверждён в границах описанного локального API-профиля.</b> Ошибок запросов, несовпадений сохранённых меток и нарушений целостности БД не обнаружено. Доработка журнала по результатам повторного прогона не обоснована. Для полного закрытия раздела 4.8 ПМИ остаются браузерные замеры 4.8.1 и 4.8.3. Результат не переносится автоматически на сервер университета, больший объём данных или иной профиль нагрузки.')
p('Исходные доказательства сохранены в каталоге проекта .cache/jmeter-pmi-20261116-123012: results.jtl, manifest.json, pmi-load.jmx, console.log, jmeter.log, server.log и dashboard. Первый прогон: .cache/jmeter-pmi-20261116-120404. Файл accounts.private.json содержит пароли и не входит в материалы для передачи.','Small')
for name in ['results.jtl','manifest.json','pmi-load.jmx']:
    digest=hashlib.sha256((RUN/name).read_bytes()).hexdigest();p('SHA-256 '+name+': '+digest,'Hash')
p('Повторный запуск: scripts/run-jmeter-pmi.py --duration 960 --ramp 60. Протокол составлен по фактическим файлам результатов 16.11.2026.','Small')

target=OUT/'PMI_load_test_protocol_20261116.pdf'
def footer(canvas,doc):
    canvas.setFont('Arial',8);canvas.setFillColor(colors.HexColor('#666666'));canvas.drawString(48,25,'Нагрузочные испытания • 16.11.2026');canvas.drawRightString(A4[0]-48,25,str(doc.page))
SimpleDocTemplate(str(target),pagesize=A4,leftMargin=48,rightMargin=48,topMargin=40,bottomMargin=43,title='Протокол нагрузочного тестирования 16 ноября 2026 года',author='').build(story,onFirstPage=footer,onLaterPages=footer)
pdf=pdfium.PdfDocument(str(target));print('PDF',str(target),'PAGES',len(pdf))
for i,page in enumerate(pdf):
    page.render(scale=1.25).to_pil().save(OUT/f'page-{i+1}.png')
print('Evidence validation OK')
