 'use strict';
async function cargarTarjetasMenuSEC(host,sector){if(!host)return;host.querySelectorAll('[data-tarjeta-sec]').forEach(n=>n.remove());const headers={Authorization:'Bearer '+(sessionStorage.getItem('sec-unificado-token')||sessionStorage.getItem('sec-distribucion-token')||'')};if(sessionStorage.getItem('sec-master-global')==='1'&&sessionStorage.getItem('sec-master-empresa'))headers['X-SEC-Empresa']=sessionStorage.getItem('sec-master-empresa');try{const r=await fetch('https://sec-backend-gg4j.onrender.com/distribucion/acceso/tarjetas?'+(typeof sector==='object'?'sector_id='+encodeURIComponent(sector.id):'sector='+encodeURIComponent(sector)),{headers});if(!r.ok)throw Error('No se pudieron actualizar las tarjetas asignadas');const rows=await r.json();if(!host.isConnected)return;for(const t of rows){const url=new URL(t.url,location.origin+'/');if(url.origin!==location.origin)continue;if(typeof sector==='object'&&url.pathname==='/distribucion/index.html')url.searchParams.set('origen_sector',sector.id);const a=document.createElement('a');a.className='menu-card';a.dataset.tarjetaSec=t.id;a.href=url.href;const h=document.createElement('h3'),p=document.createElement('p');h.textContent=t.icono+' '+t.titulo;p.textContent=t.descripcion;a.append(h,p);host.appendChild(a);}}catch(e){if(!host.isConnected)return;const p=document.createElement('p');p.dataset.tarjetaSec='estado';p.textContent=e.message+'. Los accesos habituales siguen disponibles.';host.appendChild(p);}if(host.id==='tarjetas-sector')ordenarTarjetasSectorSEC(host,sector);}
function ordenarTarjetasSectorSEC(menu,sector){
 if(!menu.isConnected||menu.dataset.ordenSec)return;
 const tarjetas=()=>Array.from(menu.children).filter(n=>n.matches('.menu-card'));
 if(tarjetas().length<2)return;
 menu.dataset.ordenSec='1';
 const boton=document.createElement('button'),estado=document.createElement('p');
 boton.type='button';boton.textContent='Ordenar tarjetas';boton.style.marginTop='1rem';
 boton.setAttribute('aria-pressed','false');estado.setAttribute('role','status');
 menu.after(boton,estado);
 const empresa=sessionStorage.getItem('sec-master-empresa')||'';
 const clave='sec-sector-orden:'+JSON.stringify([empresa,typeof sector==='object'?sector.id:sector]);
 const id=tarjeta=>tarjeta.dataset.tarjetaSec?'asignada:'+tarjeta.dataset.tarjetaSec
  :tarjeta.getAttribute('href')||tarjeta.querySelector('h3')?.textContent?.trim();
 let ordenando=false,origen=null;
 try{
  const guardadas=JSON.parse(localStorage.getItem(clave)||'[]');
  if(Array.isArray(guardadas)){
   const porId=new Map(tarjetas().map(t=>[id(t),t]));
   for(const key of guardadas){
    const tarjeta=porId.get(key);
    if(tarjeta){menu.insertBefore(tarjeta,menu.querySelector(':scope > [data-tarjeta-sec="estado"]'));porId.delete(key);}
   }
   for(const tarjeta of porId.values())menu.insertBefore(tarjeta,menu.querySelector(':scope > [data-tarjeta-sec="estado"]'));
  }
 }catch{}
 function mover(tarjeta,destino){
  const lista=tarjetas(),desde=lista.indexOf(tarjeta),hasta=lista.indexOf(destino);
  if(desde<0||hasta<0||desde===hasta)return;
  destino[desde<hasta?'after':'before'](tarjeta);
  try{
   localStorage.setItem(clave,JSON.stringify(tarjetas().map(id)));
   estado.textContent='Orden guardado en este navegador.';
  }catch{estado.textContent='El navegador no pudo guardar el orden.';}
 }
 boton.onclick=()=>{
  ordenando=!ordenando;
  boton.setAttribute('aria-pressed',String(ordenando));
  boton.textContent=ordenando?'Terminar de ordenar':'Ordenar tarjetas';
  menu.classList.toggle('ordenando-tarjetas',ordenando);
  for(const tarjeta of tarjetas()){
   tarjeta.draggable=ordenando;
   if(!tarjeta.matches('a,button'))tarjeta.tabIndex=ordenando?0:-1;
  }
  estado.textContent=ordenando?'Arrastrá una tarjeta hasta su nueva posición. Con el teclado, enfocá una tarjeta y usá las flechas.':'';
 };
 const tarjetaDe=e=>e.target.closest('.menu-card');
 menu.addEventListener('click',e=>{
  if(ordenando&&tarjetaDe(e)){e.preventDefault();e.stopPropagation();}
 },true);
 menu.addEventListener('dragstart',e=>{
  origen=ordenando?tarjetaDe(e):null;
  if(!origen){e.preventDefault();return;}
  e.dataTransfer.effectAllowed='move';
  e.dataTransfer.setData('text/plain',id(origen));
  origen.classList.add('tarjeta-arrastrada');
 });
 menu.addEventListener('dragover',e=>{
  if(origen&&tarjetaDe(e)){e.preventDefault();e.dataTransfer.dropEffect='move';}
 });
 menu.addEventListener('drop',e=>{
  const destino=tarjetaDe(e);
  if(origen&&destino){e.preventDefault();mover(origen,destino);}
 });
 menu.addEventListener('dragend',()=>{origen?.classList.remove('tarjeta-arrastrada');origen=null;});
 menu.addEventListener('keydown',e=>{
  const tarjeta=tarjetaDe(e);
  const paso={ArrowLeft:-1,ArrowUp:-1,ArrowRight:1,ArrowDown:1}[e.key];
  if(!ordenando||!tarjeta||!paso)return;
  e.preventDefault();
  const lista=tarjetas();
  mover(tarjeta,lista[lista.indexOf(tarjeta)+paso]);
  tarjeta.focus();
 });
}

document.addEventListener('DOMContentLoaded',()=>{const host=document.querySelector('[data-menu-tarjetas-sec]');if(host)cargarTarjetasMenuSEC(host,host.dataset.menuTarjetasSec).then(()=>ordenarTarjetasSectorSEC(host,host.dataset.menuTarjetasSec));});
