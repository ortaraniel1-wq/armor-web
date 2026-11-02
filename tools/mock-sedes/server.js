const fs=require('fs'),http=require('http'),path=require('path');
const WEB=path.resolve(__dirname,'../..');
const ROOT=process.env.DATOS||path.resolve(WEB,'../armor-catalogo-datos'); // clon de armor-catalogo-datos
// ---- mock Apps Script ----
const sheets={};
function mkSheet(n){const d=[];const s={_d:d,
 getDataRange:()=>({getValues:()=>d.map(r=>r.slice())}),
 appendRow:r=>d.push(r.map(x=>typeof x==='string'&&x[0]==="'"?x.slice(1):x)), getLastRow:()=>d.length,getLastColumn:()=>Math.max(0,...d.map(r=>r.length)), setFrozenRows(){}, clearContents(){d.length=0},
 getRange:(r,c,nr=1,nc=1)=>({setValues:v=>{for(let i=0;i<nr;i++){d[r-1+i]=d[r-1+i]||[];for(let j=0;j<nc;j++){let x=v[i][j];if(typeof x==='string'&&x[0]==="'")x=x.slice(1);d[r-1+i][c-1+j]=x;}}},
   getValues:()=>{const o=[];for(let i=0;i<nr;i++){o.push([]);for(let j=0;j<nc;j++)o[i].push((d[r-1+i]||[])[c-1+j]??'')}return o},
   setNumberFormat(){return this},setFontWeight(){return this},setValue(x){d[r-1]=d[r-1]||[];d[r-1][c-1]=x;return this}})};sheets[n]=s;return s;}
const ss={getSheetByName:n=>sheets[n]||null,insertSheet:mkSheet};
const props={};
global.SpreadsheetApp={getActiveSpreadsheet:()=>ss};
global.PropertiesService={getScriptProperties:()=>({getProperty:k=>props[k]||null,setProperty:(k,v)=>props[k]=v})};
global.Utilities={formatDate:(d,tz,f)=>{const p=n=>String(n).padStart(2,'0');return f.replace('yyyy',d.getFullYear()).replace('yy',String(d.getFullYear()).slice(2)).replace('MM',p(d.getMonth()+1)).replace('dd',p(d.getDate())).replace('HH',p(d.getHours())).replace('mm',p(d.getMinutes())).replace('ss',p(d.getSeconds())+Math.floor(Math.random()*90+10));},getUuid:()=>'tok123'};
global.LockService={getScriptLock:()=>({waitLock(){},releaseLock(){}})};
global.CacheService={getScriptCache:()=>({remove(){}})};
global.ContentService={createTextOutput:t=>({setMimeType:()=>({t})}),MimeType:{}};
global.console=console;
eval(fs.readFileSync(path.join(WEB,'apps-script/pedidos-entre-sedes.gs'),'utf8').replace(/^const /gm,'var '));
configurar();
module.exports={};
http.createServer((req,res)=>{
 if(req.url.startsWith('/api')){let b='';req.on('data',c=>b+=c);req.on('end',()=>{const r=doPost({postData:{contents:b}});res.setHeader('Content-Type','application/json');res.end(r.t);});return;}
 let f=path.join(ROOT,decodeURIComponent(req.url.split('?')[0]));
 if(f.endsWith('faltantes-config.js')){res.end("window.SEDES_API='/api';");return;}
 if(f.endsWith('faltantes.html'))f=path.join(WEB,'faltantes.html');
 if(f.includes('/js/'))f=path.join(WEB,'js',path.basename(f));
 fs.readFile(f,(e,d)=>{if(e){res.statusCode=404;return res.end()}res.end(d)});
}).listen(process.env.PORT||8820,()=>console.log('mock en http://localhost:'+(process.env.PORT||8820)+'/faltantes.html'));
