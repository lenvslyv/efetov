from pathlib import Path
from html import escape
from docx import Document
from docx.text.paragraph import Paragraph as WordParagraph
from docx.table import Table as WordTable
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, PageBreak
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib import colors
from reportlab.lib.enums import TA_LEFT
from reportlab.lib.pagesizes import A4
import pypdfium2 as pdfium
OUT=Path(__file__).resolve().parents[1]/'.cache/pmi-20261112'
pdfmetrics.registerFont(TTFont('Arial','C:/Windows/Fonts/arial.ttf'))
pdfmetrics.registerFont(TTFont('Arial-Bold','C:/Windows/Fonts/arialbd.ttf'))
pdfmetrics.registerFontFamily('Arial',normal='Arial',bold='Arial-Bold')
styles=getSampleStyleSheet()
for s in styles.byName.values():s.fontName='Arial';s.textColor=colors.black
styles['Normal'].fontSize=10;styles['Normal'].leading=14;styles['Normal'].spaceAfter=6
styles['Normal'].allowWidows=0;styles['Normal'].allowOrphans=0
styles['Title'].fontSize=21;styles['Title'].leading=25;styles['Title'].alignment=TA_LEFT
styles['Heading1'].fontSize=15;styles['Heading1'].leading=19
styles['Heading2'].fontSize=12;styles['Heading2'].leading=16
styles['Heading1'].keepWithNext=True;styles['Heading2'].keepWithNext=True
styles.add(ParagraphStyle('Cell',parent=styles['Normal'],fontSize=9,leading=12,spaceAfter=0))
styles.add(ParagraphStyle('Status',parent=styles['Normal'],keepWithNext=True))
story=[]
doc=Document(OUT/'PMI_test_protocol_20261112.docx')
for element in doc.element.body:
 if element.tag.endswith('}p'):
  p=WordParagraph(element,doc);txt=p.text
  if not txt:
   if 'w:type="page"' in element.xml:story.append(PageBreak())
   continue
  style={'Title':'Title','Heading 1':'Heading1','Heading 2':'Heading2'}.get(p.style.name,'Normal')
  if txt in ['Пройден','Частично','Не пройден','Исключён','Не завершён']:style='Status'
  runs=[]
  for r in p.runs:
   t=escape(r.text);t='<b>'+t+'</b>' if r.bold else t
   if r.font.color and r.font.color.rgb:t='<font color="#'+str(r.font.color.rgb)+'">'+t+'</font>'
   runs.append(t)
  story.append(Paragraph(''.join(runs),styles[style]))
 elif element.tag.endswith('}tbl'):
  t=WordTable(element,doc)
  data=[]
  for row in t.rows:
   line=[]
   for c in row.cells:
    p=c.paragraphs[0];txt=escape(c.text)
    if p.runs and p.runs[0].font.color.rgb:txt='<font color="#'+str(p.runs[0].font.color.rgb)+'">'+txt+'</font>'
    line.append(Paragraph(txt,styles['Cell']))
   data.append(line)
  table=Table(data,colWidths=[48,305,129],repeatRows=1,hAlign='LEFT')
  table.setStyle(TableStyle([('BACKGROUND',(0,0),(-1,0),colors.HexColor('#E8EDF2')),('GRID',(0,0),(-1,-1),.4,colors.HexColor('#D9D9D9')),('VALIGN',(0,0),(-1,-1),'MIDDLE'),('TOPPADDING',(0,0),(-1,-1),5),('BOTTOMPADDING',(0,0),(-1,-1),5)]))
  story.append(table);story.append(Spacer(1,10))
def footer(c,d):
 c.setFont('Arial',8);c.setFillColor(colors.HexColor('#666666'));c.drawRightString(A4[0]-55,25,str(d.page))
path=OUT/'PMI_test_protocol_20261112.pdf'
SimpleDocTemplate(str(path),pagesize=A4,rightMargin=55,leftMargin=55,topMargin=45,bottomMargin=45,title='Протокол проверки системы поддержки исследования').build(story,onFirstPage=footer,onLaterPages=footer)
render=OUT/'pdf-render';render.mkdir(exist_ok=True)
pdf=pdfium.PdfDocument(str(path))
for i,page in enumerate(pdf):page.render(scale=1.5).to_pil().save(render/f'page-{i+1}.png')
print('PDF pages:',len(pdf))
