/* Armor Market · fotos actualizadas desde la página interna /fotos (se guardan en GitHub). */
(function(){
  var U='https://raw.githubusercontent.com/ortaraniel1-wq/armor-catalogo-datos/main/';
  function url(k,f){return U+'fotos/'+encodeURIComponent(k)+'.jpg?v='+f.v;}
  function find(F,k){return F[k]||(k&&k.charAt(0)==='M'&&F['B'+k.slice(1)])||null;}
  function apply(F){
    var els=document.querySelectorAll('[data-cod]');
    for(var i=0;i<els.length;i++){
      var el=els[i],k=el.getAttribute('data-cod'),f=find(F,k);if(!f)continue;
      var card=el.closest?el.closest('article,.card'):null;
      var img=el.tagName==='IMG'?el:(card&&card.querySelector('img.main'));
      if(!img||img.getAttribute('data-fl')===String(f.v))continue;
      var kk=F[k]?k:'B'+k.slice(1);
      img.setAttribute('data-fl',String(f.v));img.onerror=null;img.removeAttribute('onerror');img.removeAttribute('srcset');
      img.src=url(kk,f);
    }
  }
  window.ARMOR_FOTOS_URL=url;
  window.armorFotos=fetch(U+'fotos.json?t='+Math.floor(Date.now()/60000),{cache:'no-store'})
    .then(function(r){return r.ok?r.json():{};}).catch(function(){return {};})
    .then(function(F){window.ARMOR_FOTOS=F||{};
      var go=function(){apply(window.ARMOR_FOTOS);};
      if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',go);else go();
      setTimeout(go,1500);return window.ARMOR_FOTOS;});
})();
