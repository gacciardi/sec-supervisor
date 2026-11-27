'use strict';
(()=>{
 const token=location.hash.slice(1),estado=document.querySelector('#estado'),hora=document.querySelector('#hora'),boton=document.querySelector('#actualizar'),mapa=document.querySelector('#mapa');
 // The fragment stays in the link for reloads; it is never included in HTTP request URLs or referrers.
 let map,truck,shop,busy=false,stopped=false,timer;
 const ocultar=()=>{if(truck){truck.remove();truck=null;}hora.textContent='';};
 const cerrar=texto=>{stopped=true;clearInterval(timer);ocultar();mapa.hidden=true;document.querySelector('#leyenda').hidden=true;document.querySelector('h1').textContent='Seguimiento no disponible';estado.textContent=texto;boton.hidden=true;};
 async function actualizar(){
  if(busy||stopped)return;busy=true;boton.disabled=true;
  try{
   const r=await fetch('https://sec-backend-gg4j.onrender.com/seguimiento-cliente',{headers:{'X-SEC-Seguimiento':token},cache:'no-store',credentials:'omit',referrerPolicy:'no-referrer',signal:AbortSignal.timeout(15000)});
   if(r.status===410){cerrar('El enlace venció o la entrega ya finalizó. Para consultas, contactá a tu vendedor.');return;}
   if(!r.ok)throw Error('No pudimos actualizar el mapa. Volveremos a intentar en unos segundos.');const d=await r.json();
   const coord=p=>p&&Number.isFinite(p.latitud)&&Number.isFinite(p.longitud)&&Math.abs(p.latitud)<=90&&Math.abs(p.longitud)<=180;
   if(!coord(d.comercio)||!window.L)throw Error('No se pudo cargar el mapa. Volvé a intentar.');
   mapa.hidden=false;document.querySelector('#leyenda').hidden=false;
   if(!map){map=L.map(mapa).setView([d.comercio.latitud,d.comercio.longitud],15);L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'© OpenStreetMap'}).addTo(map);shop=L.marker([d.comercio.latitud,d.comercio.longitud],{icon:L.divIcon({className:'marcador',html:'📍',iconSize:[36,36]})}).addTo(map).bindTooltip('Tu comercio');map.invalidateSize();}
   const p=d.camion;
   if(d.estado!=='EN_CAMINO'||!coord(p)||Date.now()-Date.parse(p.actualizado_en)>120000){ocultar();estado.textContent='El camión no tiene una señal GPS reciente. Estamos esperando una nueva ubicación.';return;}
   const initial=!truck;if(!truck)truck=L.marker([p.latitud,p.longitud],{icon:L.divIcon({className:'marcador',html:'🚚',iconSize:[36,36]})}).addTo(map).bindTooltip('Camión de tu entrega');else truck.setLatLng([p.latitud,p.longitud]);
   if(initial)map.fitBounds(L.latLngBounds([[p.latitud,p.longitud],[d.comercio.latitud,d.comercio.longitud]]),{padding:[45,45],maxZoom:16});
   estado.textContent='El camión está en camino a realizar las entregas.';hora.textContent='Última ubicación: '+new Date(p.actualizado_en).toLocaleTimeString('es-AR',{hour:'2-digit',minute:'2-digit',second:'2-digit'});
  }catch(e){ocultar();estado.textContent=e.name==='TimeoutError'?'La conexión está demorando. Volveremos a intentar.':e.message;}
  finally{busy=false;boton.disabled=false;}
 }
 if(!/^[A-Za-z0-9_-]{43}$/.test(token)){cerrar('Abrí el enlace exclusivo que recibiste por WhatsApp.');return;}
 boton.onclick=actualizar;timer=setInterval(()=>{if(!document.hidden)actualizar();},15000);document.addEventListener('visibilitychange',()=>{if(!document.hidden)actualizar();});actualizar();
})();
