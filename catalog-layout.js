(() => {
  'use strict';
  const groups = [
    ['tecnologia','Tecnología',['celulares','laptops','tablets','relojes','computacion','redes','cargadores','radios','patinetas']],
    ['audio-video','Audio y video',['tv','barras','fiesta','portatiles','audifonos','microfonos','camara','video']],
    ['hogar-cocina','Hogar y cocina',['hogar','smart','difusores','blancos','inflables','cocina','electro']],
    ['belleza-bienestar','Belleza y bienestar',['cuidado','salud']],
    ['bebes-ninos','Bebés y niños',['ninos']],
    ['alimentos-bebidas','Alimentos y bebidas',['alimentos','licores']],
    ['mascotas','Mascotas',['mascotas']],
    ['negocio-oficina','Negocio y oficina',['negocio']]
  ];
  const $ = s => document.querySelector(s);
  const normalize = value => String(value).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
  const sectionNames = {}, cards = [], sections = [...document.querySelectorAll('main > section')];
  const now = Date.now();
  sections.forEach(section => {
    sectionNames[section.id] = section.querySelector('h2')?.textContent.trim() || section.id;
    section.querySelectorAll('.card').forEach(card => {
      const group = groups.find(g => g[2].includes(section.id));
      const main = card.querySelector('img.main');
      const date = Date.parse((card.dataset.llegada || '') + 'T00:00:00-04:00');
      const recent = Number.isFinite(date) && now >= date && now-date < 15*86400000;
      if (!recent) card.querySelector('.nv')?.remove();
      const label = document.createElement('p');label.className='am-card-line';label.textContent=sectionNames[section.id];card.querySelector('.body')?.prepend(label);
      cards.push({el:card, section:section.id, group:group?.[0] || '', recent, index:cards.length,
        text:normalize([card.querySelector('h3')?.textContent,main?.alt,card.querySelector('.specs')?.textContent,sectionNames[section.id],group?.[1],card.dataset.q,card.dataset.grp,
          ...[...card.querySelectorAll('[data-cod]')].map(e=>e.dataset.cod)].filter(Boolean).join(' '))});
    });
  });
  const grid = $('#am-grid');
  cards.forEach(x => grid.appendChild(x.el));sections.forEach(s=>s.remove());
  const state={group:'all',sub:'all',recent:false,limit:24,sort:'featured'};
  const search=$('#am-query'), title=$('#am-results-title'), status=$('#am-count'), lines=$('#am-lines'), subs=$('#am-sublines');
  function makeButton(label,value,parent,handler){const b=document.createElement('button');b.type='button';b.textContent=label;b.dataset.value=value;b.setAttribute('aria-pressed','false');b.addEventListener('click',()=>handler(value));parent.appendChild(b);return b;}
  makeButton('Ver todo','all',lines,selectGroup);
  groups.forEach(g=>makeButton(g[1],g[0],lines,selectGroup));
  function selectGroup(id){state.group=id;state.sub='all';state.limit=24;renderSubs();render();}
  function renderSubs(){subs.replaceChildren();const g=groups.find(g=>g[0]===state.group);const ids=g?g[2].filter(id=>sectionNames[id]):[];subs.hidden=!g||ids.length<2;if(!g||ids.length<2)return;
    makeButton('Todo en '+g[1],'all',subs,selectSub);
    g[2].filter(id=>sectionNames[id]).forEach(id=>makeButton(sectionNames[id],id,subs,selectSub));
  }
  function selectSub(id){state.sub=id;state.limit=24;render();}
  function price(x){const t=x.el.querySelector('.tag')?.textContent || '';const n=Number(t.replace(/[^0-9,]/g,'').replace(',','.'));return n>0?n:Infinity;}
  function render(){
    const query=normalize(search.value),tokens=query.split(' ').filter(Boolean);
    const selected=cards.filter(x=>!x.el.classList.contains('agotado')&&(state.group==='all'||x.group===state.group)&&(state.sub==='all'||x.section===state.sub)&&(!state.recent||x.recent)&&tokens.every(t=>(x.text+' '+normalize(x.el.querySelector('.cod')?.textContent||'')).includes(t)));
    if(state.sort!=='featured')selected.sort((a,b)=>{const pa=price(a),pb=price(b);if(!Number.isFinite(pa))return Number.isFinite(pb)?1:0;if(!Number.isFinite(pb))return -1;return state.sort==='price-asc'?pa-pb:pb-pa;});
    cards.forEach(x=>{x.el.hidden=true;});
    selected.slice(0,state.limit).forEach(x=>{x.el.hidden=false;grid.appendChild(x.el);});
    const heading=query?'Resultados para “'+search.value.trim()+'”':state.sub!=='all'?sectionNames[state.sub]:state.group!=='all'?groups.find(g=>g[0]===state.group)[1]:state.recent?'Lo nuevo que llegó':'Encuentra tu próximo favorito';
    title.textContent=heading;
    status.textContent=(state.recent?'Novedades · ':'')+selected.length.toLocaleString('es-VE')+' productos'+(selected.length?' · Mostrando '+Math.min(state.limit,selected.length):'');
    $('#am-empty').hidden=selected.length!==0;$('#am-more').hidden=selected.length<=state.limit;
    $('#am-more').textContent='Ver más productos ('+Math.max(0,selected.length-state.limit)+')';
    $('#am-clear').hidden=!search.value;$('#am-reset').hidden=!(query||state.group!=='all'||state.recent);
    lines.querySelectorAll('button').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.value===state.group)));
    subs.querySelectorAll('button').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.value===state.sub)));
    $('#am-new').classList.toggle('am-view-new',state.recent);
  }
  function reset(){search.value='';state.group='all';state.sub='all';state.recent=false;state.limit=24;state.sort='featured';$('#am-sort').value='featured';renderSubs();history.replaceState(null,'',location.pathname+location.search);render();}
  function jump(){ $('#am-results').scrollIntoView({block:'start',behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth'});}
  let timer;search.addEventListener('input',()=>{clearTimeout(timer);timer=setTimeout(()=>{state.limit=24;render();},120);});
  $('#am-search').addEventListener('submit',e=>{e.preventDefault();clearTimeout(timer);state.limit=24;render();jump();});
  search.addEventListener('keydown',e=>{if(e.key==='Escape'){search.value='';state.limit=24;render();}});
  // Registro de búsquedas en Google Sheets ("Armorking - Búsquedas en la web"), para saber qué buscan y no consiguen.
  const LOG=window.ARMOR_LOG_URL||'https://script.google.com/macros/s/AKfycbwL2BDCpaK7TaGDDGReKAfxcuL1sX3D-rog8_7BGVz82yR0cwHnWasjmn3O6hpemDda/exec';
  let lastLogged='',logTimer;
  function logSearch(){const q=search.value.trim(),k=normalize(q);if(k.length<3||k===lastLogged)return;lastLogged=k;
    const n=parseInt(((status.textContent.match(/([0-9.]+) productos/)||[])[1]||'0').replace(/\./g,''),10)||0;
    const u=LOG+'?q='+encodeURIComponent(q)+'&n='+n+'&p='+encodeURIComponent(location.pathname);
    try{fetch(u,{method:'GET',mode:'no-cors',credentials:'omit',cache:'no-store',keepalive:true});}catch(e){try{new Image().src=u;}catch(x){}}}
  search.addEventListener('input',()=>{clearTimeout(logTimer);logTimer=setTimeout(logSearch,2500);});
  $('#am-search').addEventListener('submit',()=>{clearTimeout(logTimer);setTimeout(logSearch,50);});
  $('#am-clear').addEventListener('click',()=>{search.value='';state.limit=24;render();search.focus();});
  $('#am-reset').addEventListener('click',reset);$('#am-empty-reset').addEventListener('click',reset);
  $('#am-more').addEventListener('click',()=>{const old=state.limit;state.limit+=24;render();const visible=cards.filter(x=>!x.el.hidden).sort((a,b)=>[...grid.children].indexOf(a.el)-[...grid.children].indexOf(b.el));visible[old]?.el.querySelector('a,button')?.focus({preventScroll:true});});
  $('#am-sort').addEventListener('change',e=>{state.sort=e.target.value;state.limit=24;render();});
  function applyHash(){const hash=decodeURIComponent(location.hash.slice(1));if(hash==='lo-nuevo'){state.recent=true;state.group='all';state.sub='all';search.value='';state.limit=24;renderSubs();render();jump();}else if(sectionNames[hash]){state.recent=false;state.group=groups.find(g=>g[2].includes(hash))[0];state.sub=hash;state.limit=24;renderSubs();render();jump();}}
  $('#am-new').addEventListener('click',()=>{if(location.hash==='#lo-nuevo')applyHash();});
  addEventListener('hashchange',applyHash);
  const pill=document.querySelector('.sedep');if(pill)$('#am-sede').appendChild(pill);
  window.armorCatalogRender=()=>render();
  renderSubs();render();applyHash();
  document.documentElement.style.setProperty('--am-offset',($('.am-top').offsetHeight+15)+'px');
  new ResizeObserver(entries=>document.documentElement.style.setProperty('--am-offset',(entries[0].target.offsetHeight+15)+'px')).observe($('.am-top'));
  // Stock and variant changes keep the active price ordering accurate.
  let stockTimer;new MutationObserver(mutations=>{if(mutations.some(m=>m.target.closest?.('.tag,.cod'))){clearTimeout(stockTimer);stockTimer=setTimeout(render,100);}}).observe(grid,{subtree:true,childList:true,characterData:true});
})();
