const ExcelJS=require('exceljs');const path=require('path'),fs=require('fs');
const dir='d:/NextProject/TJC/HR-Management/docs/เงินเดือนพนักงาน';
const txt=v=>{if(v==null)return'';if(typeof v==='object'){if(v.text!==undefined)return String(v.text).trim();if(v.result!==undefined)return String(v.result).trim();if(Array.isArray(v.richText))return v.richText.map(x=>x.text).join('').trim();return''}return String(v).trim()};
const num=v=>{const t=txt(v).replace(/,/g,'');return t===''?0:(Number(t)||0)};
async function parseFile(fp){
  const wb=new ExcelJS.Workbook();await wb.xlsx.readFile(fp);
  const ws=wb.worksheets[0];
  const hdr={};
  for(let c=1;c<=ws.columnCount;c++){const h=txt(ws.getRow(2).getCell(c).value);if(h&&hdr[h]===undefined)hdr[h]=c;else if(h)hdr[h+'#2']=c;}
  const rows=[];let dept='';
  ws.eachRow((row,i)=>{
    if(i<=2)return;
    const c1=txt(row.getCell(1).value),c2=txt(row.getCell(2).value);
    if(c1&&c1===c2){if(c1.startsWith('แผนก'))dept=c1.replace('แผนก : ','');return;}
    if(!/^\d{3,6}$/.test(c1))return;
    const r={code:c1,name:c2,dept};
    for(const [h,c] of Object.entries(hdr)) r[h]=num(row.getCell(c).value);
    r['ชื่อ-นามสกุล']=c2; r['รหัสพนักงาน']=c1;
    rows.push(r);
  });
  return {hdr,rows};
}
module.exports={parseFile,dir};
if(require.main===module){
  (async()=>{
    const out={};
    for(const f of fs.readdirSync(dir).filter(x=>x.endsWith('.xlsx')).sort()){
      const tag=/(\d{4}-\d{2})/.exec(f)[1];
      const {hdr,rows}=await parseFile(path.join(dir,f));
      out[tag]=rows;
      const cols=Object.keys(hdr).filter(h=>!['รหัสพนักงาน','ชื่อ-นามสกุล'].includes(h));
      const sums={};
      for(const c of cols){const s=rows.reduce((a,r)=>a+(r[c]||0),0); if(s) sums[c]=Math.round(s*100)/100;}
      console.log('===',tag,'· พนักงาน',rows.length);
      console.log(JSON.stringify(sums,null,0));
    }
    fs.writeFileSync(path.join(__dirname,'legacy-payroll-file.json'),JSON.stringify(out));
    console.log('\nบันทึกไว้ที่ tmp-payroll-file.json');
  })();
}
