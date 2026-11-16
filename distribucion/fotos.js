'use strict';
function fechaFotoSEC(valor){return new Intl.DateTimeFormat('es-AR',{timeZone:'America/Argentina/Buenos_Aires',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).format(new Date(valor));}
function clienteFotoSEC(f){return f.codigo_cliente?f.codigo_cliente+(f.nombre_cliente?' · '+f.nombre_cliente:''):'Sin cliente asociado';}
function abrirFotoAmpliadaSEC(url,descripcion){
 const dialog=document.createElement('dialog');dialog.className='sec-foto-dialog';
 const barra=document.createElement('div');barra.className='sec-foto-barra';
 const titulo=document.createElement('p');titulo.textContent=descripcion;dialog.setAttribute('aria-label',descripcion);
 const zoom=document.createElement('button');zoom.type='button';zoom.textContent='Ampliar más';
 const cerrar=document.createElement('button');cerrar.type='button';cerrar.textContent='Cerrar foto';
 const zona=document.createElement('div');zona.className='sec-foto-zona';const img=document.createElement('img');img.src=url;img.alt=descripcion;
 zona.append(img);barra.append(titulo,zoom,cerrar);dialog.append(barra,zona);document.body.append(dialog);
 const previo=document.activeElement;cerrar.onclick=()=>dialog.close();zoom.onclick=()=>{const grande=zona.classList.toggle('sec-foto-zoom');zoom.textContent=grande?'Ajustar a pantalla':'Ampliar más';};
 dialog.addEventListener('close',()=>{dialog.remove();if(previo?.isConnected)previo.focus();},{once:true});dialog.showModal();cerrar.focus();return dialog;
}
function mostrarGaleriaFotosSEC(host,fotos){
 if(!document.getElementById('sec-fotos-estilo')){const style=document.createElement('style');style.id='sec-fotos-estilo';style.textContent=`
 .sec-fotos-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:16px;padding:16px 0}
 .sec-foto-tarjeta{min-width:0;border:1px solid #d4deeb;border-radius:12px;padding:12px;background:#fff}
 .sec-foto-tarjeta p{margin:6px 0;font-size:14px;overflow-wrap:anywhere}.sec-foto-tarjeta strong{display:block;color:#122a49}
 .sec-foto-miniatura{display:flex!important;align-items:center;justify-content:center;width:100%;height:140px!important;min-height:0!important;padding:0!important;margin:0 0 10px!important;background:#eef2f7;border:0;border-radius:8px;overflow:hidden;cursor:zoom-in}
 .sec-foto-miniatura img{display:block;width:100%!important;height:140px!important;max-height:140px!important;object-fit:contain}
 .sec-foto-dialog{width:min(1100px,96vw);max-width:96vw;max-height:92dvh;padding:12px;border:0;border-radius:12px;background:#fff;color:#122a49}.sec-foto-dialog::backdrop{background:#000b}
 .sec-foto-barra{display:flex;align-items:center;gap:10px;flex-wrap:wrap}.sec-foto-barra p{flex:1;min-width:180px;margin:4px}.sec-foto-barra button{margin:0;padding:10px;min-height:44px}
 .sec-foto-zona{max-height:72dvh;overflow:auto;background:#101827;text-align:center}.sec-foto-zona img{display:block;max-width:100%;max-height:70dvh;width:auto;height:auto;margin:auto;object-fit:contain}.sec-foto-zona.sec-foto-zoom img{max-width:none;max-height:none;width:auto;height:auto}
 @media(max-width:500px){.sec-fotos-grid{grid-template-columns:1fr}.sec-foto-dialog{padding:8px}.sec-foto-miniatura,.sec-foto-miniatura img{height:120px!important;max-height:120px!important}}
 `;document.head.append(style);}
 const grid=document.createElement('div');grid.className='sec-fotos-grid';host.replaceChildren(grid);
 if(!fotos.length){grid.textContent='No hay fotos registradas para esta fecha.';return;}
 const controller=new AbortController(),urls=new Set(),dialogs=new Set();let activo=true,trabajando=0;const cola=[];
 const limpiar=new MutationObserver(()=>{if(grid.isConnected)return;activo=false;controller.abort();observer?.disconnect();limpiar.disconnect();dialogs.forEach(d=>{if(d.open)d.close();});urls.forEach(u=>URL.revokeObjectURL(u));});limpiar.observe(document.body,{childList:true,subtree:true});
 const cargar=async tarea=>{if(!activo)return;const {f,boton,descripcion}=tarea;boton.textContent='Cargando miniatura…';try{const ruta=f.tipo==='ENTREGA'?'/fotos/'+encodeURIComponent(f.id):'/fotos-recorrido/'+encodeURIComponent(f.id)+'/imagen';const r=await fetch(API+ruta,{headers:{Authorization:'Bearer '+token},signal:controller.signal});if(!r.ok)throw Error('No se pudo cargar');const blob=await r.blob();if(!activo)return;const url=URL.createObjectURL(blob);urls.add(url);const img=document.createElement('img');img.alt=descripcion;img.src=url;boton.replaceChildren(img);boton.setAttribute('aria-label','Ampliar foto: '+descripcion);boton.onclick=()=>dialogs.add(abrirFotoAmpliadaSEC(url,descripcion));}catch(e){if(!activo)return;boton.textContent='No se pudo cargar. Reintentar';boton.onclick=()=>{cola.push(tarea);procesar();};}};
 const procesar=()=>{while(activo&&trabajando<3&&cola.length){trabajando++;cargar(cola.shift()).finally(()=>{trabajando--;procesar();});}};
 const tareas=new Map();const observer=typeof IntersectionObserver==='function'?new IntersectionObserver(entries=>{entries.forEach(e=>{if(e.isIntersecting){observer.unobserve(e.target);cola.push(tareas.get(e.target));procesar();}});},{rootMargin:'200px'}):null;
 for(const f of fotos){const tarjeta=document.createElement('article');tarjeta.className='sec-foto-tarjeta';const boton=document.createElement('button');boton.type='button';boton.className='sec-foto-miniatura';boton.textContent='Cargando miniatura…';const conductor=[f.nombre,f.apellido].filter(Boolean).join(' '),cliente=clienteFotoSEC(f),fecha=fechaFotoSEC(f.fecha),descripcion=fecha+' · '+conductor+' · '+cliente;tarjeta.append(boton);for(const [etiqueta,valor] of [['Fecha y hora',fecha],['Chofer',conductor],['Cliente',cliente]]){const p=document.createElement('p'),strong=document.createElement('strong');strong.textContent=etiqueta;p.append(strong,document.createTextNode(valor));tarjeta.append(p);}const pista=document.createElement('p');pista.textContent='Tocá la miniatura para ampliar';tarjeta.append(pista);grid.append(tarjeta);const tarea={f,boton,descripcion};tareas.set(boton,tarea);if(observer)observer.observe(boton);else cola.push(tarea);}
 procesar();
}
