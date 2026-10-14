"""Import explicitly named QA policy sources locally. Never sends data online."""
from pathlib import Path
import os,re,zipfile,xml.etree.ElementTree as ET
ROOT=Path(__file__).resolve().parents[1]
DEST=ROOT/'local-qa'/'policies'
N={'m':'http://schemas.openxmlformats.org/spreadsheetml/2006/main','r':'http://schemas.openxmlformats.org/officeDocument/2006/relationships'}
def sources():
 return Path(os.environ.get('QA_POLICY_SOURCE_DIR') or (Path(os.environ.get('USERPROFILE',str(Path.home())))/'Downloads'))
def choose(folder,pattern):
 if not folder.is_dir():return None
 matches=[p for p in folder.iterdir() if p.is_file() and re.search(pattern,p.name,re.I)]
 return max(matches,key=lambda x:x.stat().st_mtime) if matches else None
def docx_text(p):
 with zipfile.ZipFile(p) as z:doc=ET.fromstring(z.read('word/document.xml'))
 ns={'w':'http://schemas.openxmlformats.org/wordprocessingml/2006/main'}
 return '\n'.join(''.join(x.text or '' for x in para.findall('.//w:t',ns)) for para in doc.findall('.//w:p',ns))
def xlsx_text(p,sheets):
 with zipfile.ZipFile(p) as z:
  strings=[]
  if 'xl/sharedStrings.xml' in z.namelist():
   t=ET.fromstring(z.read('xl/sharedStrings.xml'))
   strings=[''.join(n.text or '' for n in si.findall('.//m:t',N)) for si in t.findall('m:si',N)]
  wb=ET.fromstring(z.read('xl/workbook.xml'))
  relroot=ET.fromstring(z.read('xl/_rels/workbook.xml.rels'))
  rels={n.attrib['Id']:n.attrib['Target'] for n in relroot}
  output=[]
  for sh in wb.findall('m:sheets/m:sheet',N):
   title=sh.attrib.get('name','')
   if title not in sheets:continue
   target=rels.get(sh.attrib.get('{'+N['r']+'}id'),'')
   loc=('xl/'+target.lstrip('/')) if not target.startswith('/xl/') else target.lstrip('/')
   loc=loc.replace('xl/xl/','xl/')
   if loc not in z.namelist():continue
   body=ET.fromstring(z.read(loc));output.append('SHEET: '+title)
   for row in body.findall('.//m:sheetData/m:row',N):
    parts=[]
    for cell in row.findall('m:c',N):
     v=cell.find('m:v',N);inline=cell.find('m:is',N)
     if v is not None:
      value=v.text or ''
      if cell.attrib.get('t')=='s':
       try:value=strings[int(value)]
       except (ValueError,IndexError):pass
     elif inline is not None:value=''.join(n.text or '' for n in inline.findall('.//m:t',N))
     else:continue
     if value.strip():parts.append(cell.attrib.get('r','?')+'='+re.sub(r'\s+',' ',value).strip())
    if parts:output.append('ROW '+row.attrib.get('r','?')+': '+' | '.join(parts))
  return '\n'.join(output)
def main():
 folder=sources();DEST.mkdir(parents=True,exist_ok=True)
 specs=[('master_prompt.txt',r'^(?:master.*qa.*prompt|qa.*master.*prompt).*\.docx$',docx_text),
 ('voice_matrix.txt',r'^(?:service matrix.*2026|matrix-copy-.*).*\.xlsx$',lambda p:xlsx_text(p,['Voice Matrix'])),
 ('qa_rubric.txt',r'^QA_Form_Matrix.*\.xlsx$',lambda p:xlsx_text(p,['QA Form','Rubric (Calibration)']))]
 for name,pattern,extract in specs:
  target=DEST/name
  if target.exists() and target.stat().st_size>100:
   print('Already installed:',name);continue
  source=choose(folder,pattern)
  if not source:print('Missing local original:',name);continue
  try:
   data=extract(source)
   if len(data)<300:raise ValueError('Expected policy content was not found')
   target.write_text(data,encoding='utf-8')
   print('Installed:',name,'from',source.name)
  except (OSError,ValueError,KeyError,zipfile.BadZipFile,ET.ParseError) as e:print('Could not import:',name,str(e)[:130])
if __name__=='__main__':main()
