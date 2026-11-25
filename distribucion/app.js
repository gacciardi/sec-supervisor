const agregarVista={set html(contenido){

 document.querySelector('#vista').insertAdjacentHTML('beforeend',contenido);

}};

// Mismo backend de SEC. No se ejecuta ningún cambio hasta iniciar sesión.

const API='https://sec-backend-gg4j.onrender.com/distribucion';

const $=s=>document.querySelector(s),esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

function importeEnCentavosSEC(valor){
 if(typeof valor!=='string'&&typeof valor!=='number')return null;
 const texto=String(valor).trim();if(!/^\d+(?:\.\d{1,2})?$/.test(texto))return null;
 const [entero,decimal='']=texto.split('.');const centavos=Number(entero)*100+Number(decimal.padEnd(2,'0'));
 return Number.isSafeInteger(centavos)?centavos:null;
}

// Entrada monetaria del conductor: admite coma decimal y el formato argentino.
function centavosCobranzaSEC(valor){
 const t=String(valor??'').trim();
 if(/^\d+(?:[.,]\d{1,2})?$/.test(t))return importeEnCentavosSEC(t.replace(',','.'));
 if(/^\d{1,3}(?:\.\d{3})+,\d{1,2}$/.test(t))return importeEnCentavosSEC(t.replaceAll('.','').replace(',','.'));
 return null;
}
function leerCobrosSEC(filas){
 return filas.flatMap((fila,i)=>{
  const medio=fila.querySelector('.pago-medio'),campo=fila.querySelector('.pago-importe'),ref=fila.querySelector('.pago-referencia');
  const texto=campo.value.trim(),referencia=ref.value.trim();
  if(!medio.value&&!texto&&!referencia)return [];
  const error=(control,mensaje)=>{control.setAttribute('aria-invalid','true');control.scrollIntoView({block:'center'});control.focus({preventScroll:true});throw Error('Pago '+(i+1)+': '+mensaje);};
  if(!medio.value)error(medio,'seleccioná la forma de pago para este importe.');
  const centavos=centavosCobranzaSEC(texto);
  if(centavos===null||centavos<=0)error(campo,'ingresá un importe mayor a cero, con hasta dos decimales (ejemplo: 1250,50).');
  return [{medio_cobranza_id:medio.value,importe:centavos/100,referencia}];
 });
}

// Captura en vivo: evita el selector nativo cuya carpeta temporal falla en la APK.
async function tomarFotoEntregaSEC(host){
 if(host.querySelector('.sec-camara-viva'))return null;
 const panel=document.createElement('div');panel.className='sec-camara-viva';
 const video=document.createElement('video');video.autoplay=true;video.playsInline=true;video.muted=true;video.style.cssText='display:block;width:100%;max-height:45vh;object-fit:contain;background:#111';
 const tomar=document.createElement('button');tomar.type='button';tomar.textContent='Tomar fotografía';tomar.disabled=true;
 const cancelar=document.createElement('button');cancelar.type='button';cancelar.textContent='Cancelar cámara';
 const estado=document.createElement('p');estado.textContent='Abriendo cámara…';estado.setAttribute('role','status');
 panel.append(video,tomar,cancelar,estado);host.append(panel);panel.scrollIntoView({block:'center'});
 return new Promise(resolve=>{
  let stream=null,terminado=false,observador=null;
  const cerrar=foto=>{if(terminado)return;terminado=true;if(stream)stream.getTracks().forEach(t=>t.stop());observador?.disconnect();window.removeEventListener('pagehide',salir);panel.remove();resolve(foto);};
  const salir=()=>cerrar(null);window.addEventListener('pagehide',salir,{once:true});
  observador=new MutationObserver(()=>{if(!panel.isConnected)cerrar(null);});observador.observe(document.body,{childList:true,subtree:true});
  cancelar.onclick=salir;
  tomar.onclick=()=>{if(!video.videoWidth)return;tomar.disabled=true;const canvas=document.createElement('canvas'),escala=Math.min(1,1600/Math.max(video.videoWidth,video.videoHeight));canvas.width=Math.round(video.videoWidth*escala);canvas.height=Math.round(video.videoHeight*escala);canvas.getContext('2d').drawImage(video,0,0,canvas.width,canvas.height);canvas.toBlob(blob=>{if(!blob){estado.textContent='No se pudo tomar la foto. Intentá nuevamente.';tomar.disabled=false;return;}cerrar(new File([blob],'entrega-'+Date.now()+'.jpg',{type:'image/jpeg'}));},'image/jpeg',0.8);};
  (async()=>{try{if(!navigator.mediaDevices?.getUserMedia)throw Error('Cámara no disponible');stream=await navigator.mediaDevices.getUserMedia({audio:false,video:{facingMode:{ideal:'environment'}}});if(terminado||!panel.isConnected){stream.getTracks().forEach(t=>t.stop());cerrar(null);return;}video.srcObject=stream;await video.play();if(terminado)return;estado.textContent='Enfocá y presioná Tomar fotografía.';tomar.disabled=false;}catch(e){if(terminado)return;if(stream)stream.getTracks().forEach(t=>t.stop());estado.textContent='No se pudo abrir la cámara. Revisá el permiso de cámara de SEC en el teléfono. Podés cancelar y usar Biblioteca.';}})();
 });
}

let fechaAsignacion=null;
let usuario=null,token=sessionStorage.getItem('sec-distribucion-token')||'',conductores=[],vehiculos=[],repartos=[],pedidos=[],mapa=null;

const secciones=[['Dashboard conductores','Estado GPS y entregas de todos los conductores.'],['Recrear viaje','Reproducción del recorrido con control de velocidad.'],['Fotos del recorrido','Fotografías libres y asociadas a clientes.'],['Conductores','Alta, modificación y baja de conductores.'],['ABM de usuarios','Usuarios de oficina, perfiles, contraseñas y estado de acceso.'],['Rendición de Viaje','Operaciones, indicadores y cobros por viaje.'],['Configuración de rendiciones','ABM de motivos de rechazo y medios de cobranza.'],['Mapa de clientes','Comercios del plan de entregas.'],['Visitas y recorridos','Registro y recreación del recorrido del conductor.'],['Supervisor','Control del plan de entregas.'],['Asignación de repartos','Asignar conductor y vehículo a cada reparto.'],['Alertas','Alertas de robo, pedido de mecánico y controles operativos.'],['Auditoría','Historial de cambios del módulo.'],['Importar pedidos','Excel de distribución.'],['Importar horarios','Excel o CSV: cliente y horario de recepción.'],['Vehículos','Internos y patentes; camión o tractor con semi.'],['Mantenimiento de Flota','Equipos, trabajos preventivos, reparaciones y anomalías.'],['Combustible y Huella de Carbono','Cargas, consumo L/100 km y CO₂ estimado.'],['App Conductor','Entregas, incidencias, fotos y GPS con la página abierta.'],['Reemplazos por inasistencia','Cubrir ausencias de conductores en los repartos cargados.'],['Estadísticas','Informes, gráficos y Excel de entregas, rechazos y cobranza.'],['Rendición Chofer','Listado de cobros por cliente y despacho para consultar e imprimir.'],['Lavados','Registro de lavados por unidad, fecha y costo.'],['Camiones','Mapa de unidades y últimas posiciones GPS de Cusat.']];

// Íconos del menú de Distribución, en el mismo estilo que SEC Comercial.
const iconoConductor='<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-user-round" style="vertical-align:middle"><circle cx="12" cy="8" r="5"/><path d="M20 21a8 8 0 0 0-16 0"/></svg>';
const iconosSecciones=["👥","▶️","📷",iconoConductor,"👤","💰","⚙️","🗺️","📍","🖥️","📋","⚠️","🔎","📥","🕒","🚛","🔧","⛽","📱","🔄","📊"];

function accesoComercialSEC(){return destinoComercialSEC()!==null;}
function destinoComercialSEC(){if(typeof location==='undefined')return null;const p=new URLSearchParams(location.search);if(p.get('origen')!=='comercial')return null;return {rendicion:{nombre:'Rendición de Viaje',roles:['ADMIN','SUPERVISOR','OPERADOR']},estadisticas:{nombre:'Estadísticas',roles:['ADMIN','SUPERVISOR']},telefonos:{nombre:'Teléfonos de clientes',roles:['ADMIN','SUPERVISOR','OPERADOR']}}[p.get('seccion')]||null;}
function volverComercialSEC(){return destinoComercialSEC()?.roles.includes(usuario?.rol)||false;}
function configurarEncabezadoSEC(){const destino=destinoComercialSEC(),comercial=destino&&(!usuario||destino.roles.includes(usuario.rol)),titulo=document.querySelector('.header-sec h1');if(titulo)titulo.textContent=comercial?'SEC - Comercial':'SEC - Distribución';document.title=comercial?'SEC - '+destino.nombre:'SEC - Distribución';}
async function entrarDestinoInicialSEC(){await inicio();const tarjeta=new URLSearchParams(location.search).get('tarjeta');if(tarjeta){const nombres={vehiculos:'Vehículos',mantenimiento:'Mantenimiento de Flota',combustible:'Combustible y Huella de Carbono',lavados:'Lavados',camiones:'Camiones',asignacion:'Asignación de repartos','rendicion-chofer':'Rendición Chofer',alertas:'Alertas',rendicion:'Rendición de Viaje',estadisticas:'Estadísticas'},nombre=nombres[tarjeta],i=secciones.findIndex(s=>s[0]===nombre);if(i>=0&&tarjetasMenuDistribucion().includes('data-section="'+i+'"'))await abrir(nombre);else mensaje('Tu perfil no tiene acceso a esta tarjeta.');return;}const destino=destinoComercialSEC();if(!destino)return;if(destino.roles.includes(usuario?.rol))await abrir(destino.nombre);else mensaje('Tu perfil no tiene acceso a '+destino.nombre+'.');}
function volverInicioGeneralSEC(){if(usuario?.rol==='MECANICO')return true;if(typeof location==='undefined')return false;return /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(new URLSearchParams(location.search).get('origen_sector')||'');}
function textoVolverMenuSEC(){return volverInicioGeneralSEC()?'Volver a Inicio SEC':volverComercialSEC()?'Volver a Comercial':'Volver al menú principal';}
function volverMenuSEC(){if(volverInicioGeneralSEC()){location.href='../index.html';return;}if(volverComercialSEC()){location.href='../comercial.html';return;}return inicio();}

function mensaje(s){$('#mensaje').textContent=s;}

async function api(path,options={}){const h={Authorization:'Bearer '+token,...(sessionStorage.getItem('sec-master-global')==='1'&&sessionStorage.getItem('sec-master-empresa')?{'X-SEC-Empresa':sessionStorage.getItem('sec-master-empresa')}:{ }),...options.headers};if(options.body&&!(options.body instanceof FormData))h['Content-Type']='application/json';const r=await fetch(API+path,{...options,headers:h});let d;try{d=await r.json();}catch{throw Error('El servidor todavía no tiene instalado el módulo Distribución o devolvió una respuesta inválida');}if(!r.ok)throw Error(d.error||'Error del servidor');return d;}

function run(fn){return async()=>{mensaje('');try{await fn();}catch(e){mensaje(e.message);}};}

function login(){if(!window.SECAndroid){sessionStorage.removeItem('sec-distribucion-token');sessionStorage.removeItem('sec-unificado-token');location.replace('../index.html');return;}document.body.classList.remove('sec-resultado-activo');if(typeof detenerMensajesOficina==='function')detenerMensajesOficina();token='';usuario=null;configurarEncabezadoSEC();secAlertasPendientes=0;if(secAlertasTimer)clearInterval(secAlertasTimer);if(window.secAlarmaInterval)clearInterval(window.secAlarmaInterval);document.getElementById('sec-alertas-emergentes')?.remove();sessionStorage.removeItem('sec-distribucion-token');sessionStorage.removeItem('sec-master-global');sessionStorage.removeItem('sec-master-empresa');sessionStorage.removeItem('sec-master-empresa-publica');document.querySelector('#master-contexto-empresa')?.remove();$('#nav').innerHTML='<a href="../index.html">Inicio SEC</a>';$('#vista').innerHTML=`<div class="panel"><h2>${accesoComercialSEC()?'Ingreso a '+destinoComercialSEC().nombre:'Ingreso a Distribución'}</h2><form id="login"><label>Empresa<input name="empresa" value="rebesa" required autocomplete="organization"></label><label>Legajo<input name="legajo" required autocomplete="username"></label><label>Contraseña<input name="clave" type="password" required autocomplete="current-password"></label><label><input type="checkbox" name="master" value="SI"> Administrador Master global (todas las empresas)</label><button>Ingresar</button></form><details><summary>Inicialización del módulo — primera instalación</summary><p>Usar sólo después de ejecutar la migración en el servidor.</p><form id="init"><label>Clave de inicialización del servidor<input name="bootstrap" type="password" required></label><label>Empresa<input name="empresa" value="rebesa" required></label><label>Legajo administrador<input name="legajo" required maxlength="20"></label><label>Nombre<input name="nombre" required></label><label>Apellido<input name="apellido" required></label><label>Contraseña nueva<input name="clave" type="password" minlength="8" required></label><button>Crear primer administrador</button></form></details></div>`;

 $('#login').onsubmit=e=>{e.preventDefault();run(async()=>{const b=Object.fromEntries(new FormData(e.target));const d=await api('/login',{method:'POST',body:JSON.stringify(b)});token=d.token;usuario=d.usuario;sessionStorage.setItem('sec-distribucion-token',token);if(usuario.es_master){sessionStorage.setItem('sec-master-global','1');sessionStorage.setItem('sec-master-empresa',usuario.empresa_id);}await entrarDestinoInicialSEC();})()};

 $('#init').onsubmit=e=>{e.preventDefault();run(async()=>{const b=Object.fromEntries(new FormData(e.target));const secret=b.bootstrap;delete b.bootstrap;await api('/inicializar',{method:'POST',headers:{Authorization:'Bearer '+secret},body:JSON.stringify(b)});e.target.reset();mensaje('Administrador creado. Ingresá arriba con su legajo y contraseña.');})()};

}

// Conserva los índices de las secciones existentes y ubica Estadísticas junto a Configuración.
function tarjetasMenuDistribucion(){
 const configuracion=secciones.findIndex(s=>s[0]==='Configuración de rendiciones');
 const tarjetas=secciones.map(([nombre,desc],i)=>({nombre,desc,i,orden:nombre==='Estadísticas'?configuracion+0.5:i}))
  .filter(s=>(!usuario?.consulta_comercial||['Rendición de Viaje','Estadísticas'].includes(s.nombre))&&(usuario?.rol!=='MECANICO'||['Vehículos','Mantenimiento de Flota','Combustible y Huella de Carbono','Lavados'].includes(s.nombre))&&s.nombre!=='Supervisor'&&(usuario?.rol!=='CONDUCTOR'||[1,2,12].includes(s.i))&&(![4,6].includes(s.i)||['ADMIN','ADMINISTRADOR'].includes(usuario?.rol))&&(s.nombre!=='Estadísticas'||['ADMIN','SUPERVISOR'].includes(usuario?.rol)))
  .sort((a,b)=>a.orden-b.orden).map(s=>`<button class="menu-card" data-section="${s.i}"><h3><span aria-hidden="true">${s.nombre==='Camiones'?"🚚":s.nombre==='Lavados'?"🧽":iconosSecciones[s.i]||"📁"}</span> ${esc(usuario?.rol==='MECANICO'?({'Mantenimiento de Flota':'Mantenimiento','Combustible y Huella de Carbono':'Combustible'}[s.nombre]||s.nombre):s.nombre)}</h3><p>${esc(s.desc)}</p></button>`).join('');
 const documentacion=!usuario?.consulta_comercial&&['ADMIN','ADMINISTRADOR','SUPERVISOR','OPERADOR'].includes(usuario?.rol)?'<a class="menu-card" href="https://control-flota-1qx8.onrender.com/" target="_blank" rel="noopener noreferrer" style="text-decoration:none;color:inherit"><h3><span aria-hidden="true">📑</span> Documentación de vehículos</h3><p>Gestión legal y documental de la flota. Abre Control de Flota en otra pestaña.</p></a>':'';
 return tarjetas+documentacion;
}

async function menuAdministrador(){configurarEncabezadoSEC();document.querySelector('#master-contexto-empresa')?.remove();iniciarMonitorAlertas();if(mapa){mapa.remove();mapa=null;}$('#nav').innerHTML=(usuario?.rol==='MECANICO'?'':'<a href="../index.html">Inicio SEC</a>')+'<button id="home">Volver al menú principal</button><button id="salir">Cerrar sesión</button>';$('#home').textContent=textoVolverMenuSEC();$('#home').onclick=run(volverMenuSEC);$('#salir').onclick=run(async()=>{detenerGps();await api('/acceso/logout',{method:'POST'});if(typeof detenerMensajesOficina==='function')detenerMensajesOficina();sessionStorage.removeItem('sec-dist-apk-gps');if(window.SECAndroid||usuario?.rol==='CONDUCTOR'){localStorage.removeItem('vendedorId');sessionStorage.removeItem('sec-distribucion-token');location.href='salida/login-vendedor.html';return;}login();});$('#vista').innerHTML=`<h2>${usuario?.es_master?'Administrador Master · Distribución':'Distribución'}</h2><div class="menu-principal">${tarjetasMenuDistribucion()}</div>`;document.querySelectorAll('[data-section]').forEach(b=>b.onclick=run(()=>{const nombre=secciones[+b.dataset.section][0];if(nombre==='Asignación de repartos')fechaAsignacion=fechaHoy();return abrir(nombre);}));if(typeof cargarTarjetasMenuSEC==='function'&&!usuario?.consulta_comercial)await cargarTarjetasMenuSEC(document.querySelector('.menu-principal'),'DISTRIBUCION');}

let secEmergenciasCache=[],secEmergenciasActor='';
let secAlertasTimer=null,secAlertaSonido=null,secAlertasConocidas=new Set(),secAlertasInicializadas=false,secAlertasOcultadas=new Set(),secAlertasPendientes=0,secAudioHabilitado=false;
const secDireccionesCache=new Map();
async function direccionDeCoordenadas(lat,lon){
 const key=Number(lat).toFixed(6)+','+Number(lon).toFixed(6);
 if(secDireccionesCache.has(key))return secDireccionesCache.get(key);
 let direccion='';
 try{
  if(window.google?.maps?.Geocoder){
   const geocoder=new google.maps.Geocoder();
   const respuesta=await geocoder.geocode({location:{lat:Number(lat),lng:Number(lon)}});
   direccion=respuesta.results?.[0]?.formatted_address||'';
  }
 }catch(_){}
 if(!direccion){
  try{
   const ctrl=new AbortController(),timeout=setTimeout(()=>ctrl.abort(),4500);
   try{const resp=await fetch('https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat='+encodeURIComponent(lat)+'&lon='+encodeURIComponent(lon)+'&zoom=18&addressdetails=1',{signal:ctrl.signal,headers:{'Accept':'application/json'}});if(resp.ok){const data=await resp.json();direccion=data.display_name||'';}}finally{clearTimeout(timeout);}
  }catch(_){}
 }
 if(direccion)secDireccionesCache.set(key,direccion);
 return direccion;
}
function sonarAlerta(){
 if(!secAlertasPendientes)return;
 try{
  const AudioContext=window.AudioContext||window.webkitAudioContext;
  if(!AudioContext)return;
  const ctx=secAlertaSonido||(secAlertaSonido=new AudioContext());
  if(ctx.state==='suspended'){ctx.resume().catch(()=>{});return;}
  const inicio=ctx.currentTime;
  [0,0.3,0.6].forEach((offset,i)=>{
   const osc=ctx.createOscillator(),gain=ctx.createGain();
   osc.type='square';osc.frequency.value=i===1?620:880;
   gain.gain.setValueAtTime(0.0001,inicio+offset);
   gain.gain.exponentialRampToValueAtTime(0.16,inicio+offset+0.02);
   gain.gain.exponentialRampToValueAtTime(0.0001,inicio+offset+0.22);
   osc.connect(gain);gain.connect(ctx.destination);
   osc.start(inicio+offset);osc.stop(inicio+offset+0.24);
  });
 }catch(e){console.warn('Audio de alerta:',e.message);}
}
function habilitarSonidoAlertas(){
 try{
  const AudioContext=window.AudioContext||window.webkitAudioContext;
  if(!AudioContext)return;
  const ctx=secAlertaSonido||(secAlertaSonido=new AudioContext());
  if(ctx.state==='running'){secAudioHabilitado=true;return;}
  ctx.resume().then(()=>{secAudioHabilitado=ctx.state==='running';if(secAudioHabilitado&&secAlertasPendientes)sonarAlerta();}).catch(()=>{secAudioHabilitado=false;});
 }catch(e){console.warn('Audio no disponible:',e.message);}
}
function prepararAudioAlertas(){
 if(window.secAudioAutoPreparado)return;
 window.secAudioAutoPreparado=true;
 // El primer clic o tecla de oficina desbloquea WebAudio sin mostrar otro botón.
 const activar=()=>{habilitarSonidoAlertas();};
 document.addEventListener('pointerdown',activar,{capture:true});
 document.addEventListener('keydown',activar,{capture:true});
 habilitarSonidoAlertas();
}
async function consultarAlertasOficina(){
 if(!token||!usuario||!['ADMIN','SUPERVISOR','OPERADOR'].includes(usuario.rol))return;
 try{
  const actor=usuario.empresa_id+'|'+usuario.id;if(secEmergenciasActor!==actor){secEmergenciasActor=actor;secEmergenciasCache=[];}
  const leer=typeof leerOficinaConPlazo==='function'?leerOficinaConPlazo:api;
  const resultados=await Promise.allSettled([leer('/alertas-conductor'),typeof cargarAlertasOficina==='function'?cargarAlertasOficina():Promise.resolve({solicitudes:[],respuestas:[]}),leer('/mantenimiento/mecanicos'),typeof cargarResultadosMecanicosSEC==='function'?cargarResultadosMecanicosSEC():Promise.resolve([])]);
  if(resultados[0].status==='fulfilled')secEmergenciasCache=resultados[0].value;else console.warn('Alertas de seguridad:',resultados[0].reason?.message);
  const oficina=resultados[1].status==='fulfilled'?resultados[1].value:{solicitudes:[],respuestas:[]},mecanicos=resultados[2].status==='fulfilled'?resultados[2].value:[];
  const todas=[...secEmergenciasCache,...oficina.solicitudes,...(resultados[3].status==='fulfilled'?resultados[3].value:[])],pendientes=todas.filter(x=>alertaPendienteEquipoSEC(x,usuario)),visibles=todas.filter(x=>alertaVisibleEquipoSEC(x,usuario));
  const nuevas=pendientes.filter(x=>!secAlertasConocidas.has(claveAlertaEquipoSEC(x)));
  secAlertasPendientes=pendientes.length;
  if(nuevas.length&&secAlertasInicializadas&&secAudioHabilitado)sonarAlerta();
  secAlertasInicializadas=true;secAlertasConocidas=new Set(pendientes.map(claveAlertaEquipoSEC));
  let panel=document.getElementById('sec-alertas-emergentes');
  if(!panel){panel=document.createElement('div');panel.id='sec-alertas-emergentes';panel.style.cssText='position:fixed;z-index:99999;left:12px;right:12px;top:16px;width:calc(100% - 24px);max-width:860px;margin:auto;max-height:82vh;overflow:auto;background:#fff1f2;color:#111827;border:6px solid #b91c1c;border-radius:18px;padding:22px;box-shadow:0 10px 45px #0009;font-size:18px;line-height:1.45';document.body.appendChild(panel);}
  panel.hidden=!visibles.length;
  const soloReparados=visibles.length&&visibles.every(a=>a.tipo==='REPARACION'&&a.resultado==='REPARADO');Object.assign(panel.style||{},{borderColor:soloReparados?'#15803d':'#b91c1c',backgroundColor:soloReparados?'#f0fdf4':'#fff1f2'});
  const firma=visibles.map(a=>[a.id,a.estado,!!lecturasEquipoSEC(usuario)[claveAlertaEquipoSEC(a)]].join(':')).join('|')+'|audio:'+secAudioHabilitado+'|mecanicos:'+JSON.stringify(mecanicos)+'|oficina:'+JSON.stringify(oficina.respuestas);
  if(panel.dataset.firma===firma)return;
  if(panel.querySelector('[data-oficina-responder][data-enviando]'))return;
  panel.dataset.firma=firma;
  if(typeof guardarBorradoresOficina==='function')guardarBorradoresOficina(panel);
  panel.innerHTML=visibles.map(a=>{
   if(a.tipo==='OFICINA')return a.estado==='RESPONDIDA'?tarjetaRespuestaOtroEquipoSEC(a):tarjetaAlertaOficina(a,oficina.respuestas);
   if(a.tipo==='REPARACION')return tarjetaResultadoMecanicoSEC(a);
   const tieneGps=a.latitud!=null&&a.longitud!=null;
   const mapa=tieneGps?'https://www.google.com/maps/search/?api=1&query='+encodeURIComponent(a.latitud+','+a.longitud):'';
   return '<div style="border-bottom:2px solid #b91c1c;padding:14px;background:#fff;border-radius:10px;margin-bottom:10px"><strong style="display:block;background:#b91c1c;color:white;padding:12px;border-radius:8px;font-size:26px">'+(a.es_prueba?'PRUEBA · ':'')+(a.tipo==='ROBO'?'ALERTA DE ROBO':'PEDIDO DE MECÁNICO')+'</strong><p>Conductor: '+esc(a.conductor)+' · Despacho: '+esc(a.despacho||'Sin despacho')+' · Vehículo: '+esc(a.interno||'Sin asignar')+'</p><p>'+esc(new Date(a.creada_en).toLocaleString('es-AR'))+'</p><p><strong>Ubicación:</strong> <span data-direccion="'+esc(a.id)+'">'+(tieneGps?'Buscando dirección…':'GPS no disponible; comunicarse con el conductor')+'</span></p>'+(tieneGps?'<p><a href="'+esc(mapa)+'" target="_blank" rel="noopener noreferrer">Abrir ubicación GPS exacta en Google Maps</a></p><small>Coordenadas: '+esc(a.latitud)+', '+esc(a.longitud)+'</small>':'')+(a.tipo==='MECANICO'?'<div style="padding:12px;background:#eff6ff;border-radius:8px"><label>Derivar a mecánico <select data-mecanico-alerta="'+esc(a.id)+'" style="width:100%;padding:10px"><option value="">Seleccionar mecánico disponible...</option>'+mecanicos.filter(m=>m.activo).map(m=>'<option value="'+esc(m.id)+'">'+esc(m.nombre)+' · '+esc(m.telefono)+'</option>').join('')+'</select></label><p style="display:flex;gap:8px;flex-wrap:wrap"><button type="button" data-whatsapp-mecanico="'+esc(a.id)+'">Enviar por WhatsApp</button><button type="button" data-llamar-mecanico="'+esc(a.id)+'">Llamar</button></p></div>':'')+(a.estado!=='ENVIADA'?'<p><strong>'+esc(a.estado==='RESUELTA'?'Resuelta por oficina':'Ya atendida en otra sesión')+'. Confirmá también la recepción en este equipo.</strong></p>':'')+'<p><button type="button" data-confirmar="'+esc(a.id)+'" style="background:#166534;color:white;font-size:20px;font-weight:bold;padding:14px 20px;border:0;border-radius:9px">✓ CONFIRMAR LECTURA Y SILENCIAR EN TODAS LAS PC</button></p></div>';
  }).join('');
  panel.querySelectorAll('[data-recepcion-equipo]').forEach(b=>b.onclick=run(async()=>{marcarAlertaEquipoSEC(visibles.find(x=>String(x.id)===b.dataset.recepcionEquipo),usuario);await consultarAlertasOficina();}));
  if(typeof activarRespuestasOficina==='function')activarRespuestasOficina(panel);
  if(typeof activarResultadosMecanicosSEC==='function')activarResultadosMecanicosSEC(panel);
  visibles.forEach(a=>{if(a.tipo==='OFICINA')return;if(a.latitud==null||a.longitud==null)return;const elemento=panel.querySelector('[data-direccion="'+a.id+'"]');if(!elemento)return;direccionDeCoordenadas(a.latitud,a.longitud).then(d=>{if(elemento.isConnected)elemento.textContent=d||'Dirección postal no disponible; usar enlace al punto GPS';});});
  panel.querySelectorAll('[data-whatsapp-mecanico],[data-llamar-mecanico]').forEach(b=>{b.onclick=run(async()=>{
   const id=b.dataset.whatsappMecanico||b.dataset.llamarMecanico,select=Array.from(panel.querySelectorAll('[data-mecanico-alerta]')).find(x=>x.dataset.mecanicoAlerta===id),m=mecanicos.find(x=>String(x.id)===select?.value),a=visibles.find(x=>String(x.id)===id);
   if(!m||!a)throw Error('Seleccionar un mecánico disponible.');
   const numero=String(m.telefono).replace(/\D/g,'');if(numero.length<8)throw Error('Teléfono inválido. Corregirlo en Mantenimiento de Flota.');
   if(b.dataset.llamarMecanico){window.location.href='tel:+'+numero;return;}
   await enviarCasoMecanicoSEC(a,m,b);
  });});
  panel.querySelectorAll('[data-confirmar]').forEach(b=>{b.onclick=run(async()=>{b.disabled=true;try{const alerta=visibles.find(a=>String(a.id)===b.dataset.confirmar);if(alerta?.estado==='ENVIADA'){try{await api('/alertas-conductor/'+b.dataset.confirmar+'/confirmar',{method:'POST'});}catch(e){if(!/no pendiente/i.test(e.message))throw e;}}marcarAlertaEquipoSEC(alerta,usuario);await consultarAlertasOficina();}catch(e){b.disabled=false;throw e;}});});
 }catch(e){if(!String(e.message).includes('relation')&&!String(e.message).includes('does not exist'))console.warn('Alertas:',e.message);}
}
function iniciarMonitorAlertas(){if(usuario?.consulta_comercial)return;if(secAlertasTimer)clearInterval(secAlertasTimer);if(window.secAlarmaInterval)clearInterval(window.secAlarmaInterval);secAlertasPendientes=0;if(usuario&&['ADMIN','SUPERVISOR','OPERADOR'].includes(usuario.rol)){prepararAudioAlertas();consultarAlertasOficina();secAlertasTimer=setInterval(consultarAlertasOficina,12000);window.secAlarmaInterval=setInterval(()=>{if(secAudioHabilitado&&secAlertasPendientes)sonarAlerta();},5000);}}
function tabla(head,rows){return `<div class="panel"><table><tr>${head.map(h=>`<th>${esc(h)}</th>`).join('')}</tr>${rows.map(r=>`<tr>${r.map(v=>`<td>${v}</td>`).join('')}</tr>`).join('')}</table>${rows.length?'':'<p>No hay registros.</p>'}</div>`;}

async function abrir(p){if(usuario?.rol==='MECANICO'&&!['Vehículos','Mantenimiento de Flota','Combustible y Huella de Carbono','Lavados'].includes(p)){mensaje('Tu perfil solo permite Vehículos, Mantenimiento, Combustible y Lavados.');return;}document.body.classList.remove('sec-resultado-activo');if(mapa){mapa.remove();mapa=null;}mensaje('');$('#vista').innerHTML='<h2>'+esc(p)+'</h2>';
 if(p==='Camiones'){await camionesCusatSEC();return;}
 if(p==='Lavados'){await lavadosFlotaSEC();return;}
 if(p==='Estadísticas'){await estadisticasDistribucion();return;}
 if(p==='Teléfonos de clientes'){await telefonosClientesSEC();return;}

 if(p==='Mantenimiento de Flota'){
  const [equipos,trabajos,anomalias]=await Promise.all([api('/vehiculos'),api('/mantenimiento/trabajos'),api('/anomalias-vehiculo')]);
  const opciones=equipos.map(v=>'<option value="'+esc(v.id)+'">'+esc(v.interno+' · '+v.patente+' · '+v.tipo)+'</option>').join('');
  agregarVista.html='<div class="panel"><h3>Equipos: '+equipos.length+' · Anomalías pendientes: '+anomalias.filter(x=>x.estado==='PENDIENTE').length+'</h3><h3>Registrar trabajo</h3><form id="flota-trabajo"><label>Equipo<select name="vehiculo_id" required>'+opciones+'</select></label><label>Fecha<input type="date" name="fecha" value="'+fechaHoy()+'" required></label><label>Tipo<select name="tipo"><option>PREVENTIVO</option><option>CORRECTIVO</option></select></label><label>Sistema<select name="sistema" required><option value="" disabled selected>Seleccionar sistema...</option><option>Motor</option><option>Sistema de refrigeración</option><option>Sistema de combustible</option><option>Transmisión y embrague</option><option>Caja de velocidades</option><option>Diferencial</option><option>Sistema de frenos</option><option>Suspensión</option><option>Dirección</option><option>Neumáticos y llantas</option><option>Sistema eléctrico</option><option>Baterías y arranque</option><option>Iluminación y señalización</option><option>Cabina y carrocería</option><option>Sistema neumático</option><option>Chasis</option><option>Acople y quinta rueda</option><option>Sistema hidráulico</option><option>Semirremolque</option><option>Otros</option></select></label><label>Falla<input name="falla"></label><label>Trabajo realizado<textarea name="trabajo_realizado" rows="7" required placeholder="Describí el trabajo realizado..."></textarea></label><label>Repuestos<input name="repuestos"></label><label>Taller<input name="taller"></label><label>Kilometraje<input type="number" min="0" step="0.1" name="kilometraje"></label><label>Costo ($)<input type="number" min="0" step="0.01" name="costo" value="0"></label><label>Próximo servicio (fecha)<input type="date" name="proximo_servicio_fecha"></label><label>Próximo servicio (km)<input type="number" min="0" step="0.1" name="proximo_servicio_km"></label><button>Registrar mantenimiento</button></form></div>';
  if(usuario?.rol!=='MECANICO'){
  let mecanicos=[];try{mecanicos=await api('/mantenimiento/mecanicos');}catch(e){mensaje('Agenda de mecánicos pendiente de habilitar en la base de datos: '+e.message);}
  agregarVista.html='<div class="panel"><h3>Mecánicos de asistencia</h3><p>Administrá los contactos para derivar pedidos desde las alertas. Los ausentes no aparecen como disponibles.</p><form id="alta-mecanico" style="display:flex;gap:8px;flex-wrap:wrap;align-items:end"><label>Nombre<input name="nombre" required maxlength="100"></label><label>Teléfono (con código de país)<input name="telefono" type="tel" required placeholder="+54 9 11 ..." maxlength="25"></label><button type="submit">Agregar mecánico</button></form><div id="agenda-mecanicos">'+(mecanicos.length?mecanicos.map(m=>'<form class="editar-mecanico" data-id="'+esc(m.id)+'" style="display:flex;gap:8px;align-items:end;flex-wrap:wrap;border-top:1px solid #ddd;padding:10px 0"><label>Nombre<input name="nombre" required value="'+esc(m.nombre)+'"></label><label>Teléfono<input name="telefono" required type="tel" value="'+esc(m.telefono)+'"></label><label><input type="checkbox" name="activo" '+(m.activo?'checked':'')+'> Disponible</label><button type="submit">Guardar</button></form>').join(''):'<p>Todavía no hay mecánicos cargados.</p>')+'</div></div>';
  $('#alta-mecanico').onsubmit=async e=>{e.preventDefault();const form=e.currentTarget,boton=form.querySelector('button[type="submit"]');let estado=form.querySelector('#estado-alta-mecanico');if(!estado){estado=document.createElement('p');estado.id='estado-alta-mecanico';estado.setAttribute('role','status');estado.style.cssText='flex-basis:100%;margin:4px 0;font-weight:600';form.appendChild(estado);}const datos=Object.fromEntries(new FormData(form));datos.nombre=String(datos.nombre||'').trim();datos.telefono=String(datos.telefono||'').trim();if(!datos.nombre||!datos.telefono){estado.textContent='Completá el nombre y el teléfono.';estado.style.color='#b91c1c';return;}boton.disabled=true;boton.textContent='Guardando...';estado.textContent='Guardando mecánico...';estado.style.color='#334155';try{await api('/mantenimiento/mecanicos',{method:'POST',body:JSON.stringify(datos)});estado.textContent='Mecánico agregado correctamente.';estado.style.color='#166534';await abrir(p);mensaje('Mecánico agregado correctamente.');const agenda=document.querySelector('#agenda-mecanicos');if(agenda)agenda.scrollIntoView({block:'center',behavior:'smooth'});}catch(error){estado.textContent='No se pudo agregar: '+error.message;estado.style.color='#b91c1c';mensaje(error.message);}finally{if(boton.isConnected){boton.disabled=false;boton.textContent='Agregar mecánico';}}};
  document.querySelectorAll('.editar-mecanico').forEach(f=>{f.onsubmit=e=>{e.preventDefault();run(async()=>{const b=Object.fromEntries(new FormData(f));b.activo=f.querySelector('[name="activo"]').checked;await api('/mantenimiento/mecanicos/'+f.dataset.id,{method:'PUT',body:JSON.stringify(b)});await abrir(p);mensaje('Mecánico actualizado.');})();};});
  }
  agregarVista.html='<div class="panel"><h3>Historial de trabajos</h3>'+tabla(['Fecha','Equipo','Tipo','Sistema','Trabajo','Costo'],trabajos.map(x=>[esc(x.fecha?.slice(0,10)),esc(x.interno),esc(x.tipo),esc(x.sistema),esc(x.trabajo_realizado),Number(x.costo).toLocaleString('es-AR',{style:'currency',currency:'ARS'})]))+'</div>';
  agregarVista.html='<div class="panel"><h3>Anomalías de conductores</h3>'+tabla(['Fecha','Conductor','Tipo','Descripción','Estado'],anomalias.map(x=>[esc(x.creado_en?.slice(0,10)),esc(x.conductor_nombre+' '+x.conductor_apellido),esc(x.tipo),esc(x.descripcion),esc(x.estado)]))+'</div>';
  if(usuario?.rol!=='MECANICO'&&typeof mostrarAsistenciasMecanicasSEC==='function')await mostrarAsistenciasMecanicasSEC();
  $('#flota-trabajo').onsubmit=e=>{e.preventDefault();run(async()=>{await api('/mantenimiento/trabajos',{method:'POST',body:JSON.stringify(Object.fromEntries(new FormData(e.target)))});await abrir(p);mensaje('Trabajo guardado.');})();};instalarPreventivoSEC(equipos);return;
 }
 if(p==='Combustible y Huella de Carbono'){
  const [equipos,cargas]=await Promise.all([api('/vehiculos'),api('/combustible/cargas')]);
  const opciones=equipos.filter(v=>v.tipo!=='semi').map(v=>'<option value="'+esc(v.id)+'">'+esc(v.interno+' · '+v.patente)+'</option>').join('');
  const litros=cargas.reduce((n,x)=>n+Number(x.litros),0),km=cargas.reduce((n,x)=>n+Number(x.kilometros_periodo||0),0);
  const fmt=n=>Number(n).toLocaleString('es-AR',{maximumFractionDigits:2});
  agregarVista.html='<div class="panel"><h3>Combustible y emisiones estimadas</h3><p><strong>'+fmt(litros)+' L</strong> cargados · <strong>'+fmt(km)+' km</strong> informados · <strong>'+(km>0?fmt(litros/km*100):'Sin km')+'</strong> L/100 km · <strong>'+fmt(litros*2.68)+' kg CO₂</strong> estimados</p><p class="muted">Factor ilustrativo: 2,68 kg CO₂ por litro de gasoil. No es un inventario certificado. El consumo solo es comparable cuando litros y km pertenecen al mismo período.</p><h3>Registrar carga</h3><form id="flota-combustible"><label>Tractor o camión<select name="vehiculo_id" required>'+opciones+'</select></label><label>Fecha<input type="date" name="fecha" value="'+fechaHoy()+'" required></label><label>Litros<input type="number" name="litros" min="0.001" step="0.001" required></label><label>Kilómetros del período (opcional)<input type="number" name="kilometros_periodo" min="0.01" step="0.01"></label><label>Odómetro (opcional)<input type="number" name="odometro" min="0" step="0.1"></label><label>Costo ($)<input type="number" name="costo" min="0" step="0.01"></label><label>Observación<input name="observacion"></label><button>Registrar carga</button></form></div>';
  agregarVista.html='<div class="panel"><h3>Historial de combustible</h3>'+tabla(['Fecha','Equipo','Litros','Km período','CO₂ estimado (kg)'],cargas.map(x=>[esc(x.fecha?.slice(0,10)),esc(x.interno),fmt(x.litros),x.kilometros_periodo?fmt(x.kilometros_periodo):'Sin dato',fmt(Number(x.litros)*2.68)]))+'</div>';
  $('#flota-combustible').onsubmit=e=>{e.preventDefault();run(async()=>{await api('/combustible/cargas',{method:'POST',body:JSON.stringify(Object.fromEntries(new FormData(e.target)))});await abrir(p);mensaje('Carga registrada.');})();};return;
 }
 if(p==='Configuración de rendiciones'){
  if(usuario?.rol!=='ADMIN'){agregarVista.html='<div class="panel"><p>Solo el administrador puede modificar los catálogos.</p></div>';return;}
  agregarVista.html='<div class="panel"><h3>Motivos de rechazo</h3><div id="rend-motivos"></div><h3>Medios de cobranza</h3><div id="rend-medios"></div><p>Las opciones desactivadas se conservan en los movimientos históricos.</p></div>';
  const catalogos=[{tipo:'motivos',target:'rend-motivos',titulo:'Motivo',campo:'area_responsable',opciones:['COMERCIAL','DISTRIBUCION','BODEGA','CLIENTE','OTROS']},{tipo:'medios',target:'rend-medios',titulo:'Medio de cobro',campo:'clasificacion',opciones:['EFECTIVO','DIGITAL','CHEQUE','OTRO']}];
  const render=async c=>{
    const datos=await api('/rendicion/catalogos/'+c.tipo);
    const div=document.getElementById(c.target);
    div.innerHTML='<form class="rend-nuevo"><label>Código<input name="codigo" maxlength="30" pattern="[A-Za-z0-9_]{2,30}" required></label><label>Descripción<input name="nombre" maxlength="150" required></label><label>Clasificación<select name="clase">'+c.opciones.map(x=>'<option value="'+x+'">'+x+'</option>').join('')+'</select></label><button>Agregar</button></form><div class="rend-lista"></div>';
    div.querySelector('form').onsubmit=e=>{e.preventDefault();run(async()=>{const f=Object.fromEntries(new FormData(e.target));await api('/rendicion/catalogos/'+c.tipo,{method:'POST',body:JSON.stringify({codigo:f.codigo,nombre:f.nombre,[c.campo]:f.clase,orden:100})});await render(c);mensaje('Opción agregada.');})();};
    const lista=div.querySelector('.rend-lista');
    lista.innerHTML=tabla(['Código','Descripción','Clasificación','Estado','Acción'],datos.map(x=>[esc(x.codigo),esc(x.nombre),esc(x[c.campo]),x.activo?'Activo':'Inactivo','<button type="button" data-id="'+esc(x.id)+'">'+(x.activo?'Desactivar':'Activar')+'</button> <button type="button" data-edit="'+esc(x.id)+'">Editar</button>']));
    lista.querySelectorAll('button[data-edit]').forEach(btn=>btn.onclick=()=>run(async()=>{const x=datos.find(d=>String(d.id)===btn.dataset.edit);if(!x)return;const codigo=prompt('Código del motivo o medio (letras, números y guion bajo)',x.codigo);if(codigo===null)return;const nombre=prompt('Nombre visible para conductor e informes',x.nombre);if(nombre===null)return;const clase=prompt('Clasificación: '+c.opciones.join(', '),x[c.campo]);if(clase===null)return;await api('/rendicion/catalogos/'+c.tipo+'/'+x.id,{method:'PUT',body:JSON.stringify({codigo:codigo.trim().toUpperCase(),nombre:nombre.trim(),[c.campo]:clase.trim().toUpperCase(),orden:x.orden,activo:x.activo})});await render(c);mensaje('Opción actualizada.');})());
    lista.querySelectorAll('button[data-id]').forEach(btn=>btn.onclick=()=>run(async()=>{const x=datos.find(d=>String(d.id)===btn.dataset.id);if(!x)return;await api('/rendicion/catalogos/'+c.tipo+'/'+x.id,{method:'PUT',body:JSON.stringify({codigo:x.codigo,nombre:x.nombre,[c.campo]:x[c.campo],orden:x.orden,activo:!x.activo})});await render(c);})());
  };
  for(const c of catalogos)await render(c);return;
 }
 if(p==='Rendición de Viaje'){await rendicionViajeEnLineaSEC();return;}
 if(p==='ABM de usuarios'){
  if(usuario?.rol!=='ADMIN'&&usuario?.rol!=='ADMINISTRADOR'){agregarVista.html='<div class="panel"><p>Solo el administrador puede gestionar usuarios.</p></div>';return;}
  agregarVista.html='<div class="panel"><p>Usuarios de SEC Distribución. Las contraseñas nuevas deben tener al menos 8 caracteres.</p><div id="master-usuarios"></div><p>Podés restablecer una contraseña olvidada desde la lista de usuarios. Las contraseñas guardadas están protegidas y no se muestran.</p><form id="form-usuario-sec"><label>Legajo / usuario<input name="legajo" maxlength="20" required autocomplete="off"></label><label>Nombre<input name="nombre" required></label><label>Apellido<input name="apellido" required></label><label>Perfil<select name="rol"><option value="ADMIN">Administrador</option><option value="SUPERVISOR">Supervisor</option><option value="OPERADOR">Operador</option><option value="MECANICO">Mecánico (Vehículos, Mantenimiento, Combustible y Lavados)</option></select></label><fieldset><legend>Sectores autorizados</legend><label><input type="checkbox" name="sectores" value="COMERCIAL"> Comercial</label><label><input type="checkbox" name="sectores" value="DISTRIBUCION" checked> Distribución</label></fieldset><label>Contraseña nueva<input id="usuario-alta-clave" name="clave" type="password" minlength="8" maxlength="128" autocomplete="new-password" required></label><button type="button" data-ver-clave="usuario-alta-clave" aria-pressed="false">Ver contraseña</button><button type="submit">Crear usuario</button></form><p id="usuarios-estado" role="status"></p><div id="usuarios-listado"></div><div id="usuarios-sectores-editor"></div></div>';
  document.querySelectorAll('#form-usuario-sec [name=sectores]').forEach(i=>i.disabled=!(usuario.sectores||['DISTRIBUCION']).includes(i.value));const estado=$('#usuarios-estado'),lista=$('#usuarios-listado');
  const cargar=async()=>{try{const datos=await api('/usuarios');lista.innerHTML=tabla(['Legajo','Nombre','Perfil','Sectores','Estado','Acción'],datos.map(u=>[esc(u.legajo),esc((u.nombre||'')+' '+(u.apellido||'')),esc(u.es_master?'ADMINISTRADOR MASTER':u.rol),esc((u.sectores||['DISTRIBUCION']).join(' y ')),u.activo?'Activo':'Inactivo',`<button data-usuario-id="${esc(u.id)}" data-usuario-activo="${u.activo?'1':'0'}">${u.activo?'Desactivar':'Activar'}</button> <button type="button" data-reset-clave="${esc(u.id)}">Restablecer contraseña</button> <button type="button" data-editar-sectores="${esc(u.id)}">Sectores</button>`]));lista.querySelectorAll('[data-editar-sectores]').forEach(b=>b.onclick=()=>{const u=datos.find(u=>u.id===b.dataset.editarSectores),editor=$('#usuarios-sectores-editor');editor.innerHTML='<h3>'+esc(u.nombre+' '+u.apellido)+'</h3>'+formularioSectoresSEC(u,usuario.empresa_codigo||usuario.empresa,usuario.sectores||['DISTRIBUCION']);conectarFormulariosSectoresSEC(editor,api,async r=>{if(r.requiere_ingreso){login();return;}await cargar();});editor.scrollIntoView({block:'center',behavior:'smooth'});});accionesClaveUsuariosSEC(lista,datos);lista.querySelectorAll('[data-usuario-id]').forEach(b=>b.onclick=run(async()=>{if(!confirm('¿Confirmás el cambio de estado de este usuario?'))return;await api('/usuarios/'+encodeURIComponent(b.dataset.usuarioId),{method:'PUT',body:JSON.stringify({activo:b.dataset.usuarioActivo!=='1'})});await cargar();}));}catch(e){estado.textContent='El ABM requiere habilitar el servicio de usuarios en el servidor: '+e.message;}};
  $('#form-usuario-sec').onsubmit=e=>{e.preventDefault();run(async()=>{const form=new FormData(e.target),b={...Object.fromEntries(form),sectores:form.getAll('sectores')};await api('/usuarios',{method:'POST',body:JSON.stringify(b)});e.target.reset();estado.textContent='Usuario creado correctamente.';await cargar();})()};
  visibilidadClavesSEC($('#form-usuario-sec'));await panelMasterUsuariosSEC($('#master-usuarios'));await cargar();return;
 }
 if(p==='Importar horarios'){
  agregarVista.html='<div class="panel"><p><strong>Formato:</strong> CLIENTE, HORARIO. Ejemplo: 15118, 08:00-12:00 / 14:00-18:00.</p><p>Opcionales: DIA (LUNES a DOMINGO, o TODOS) y DESCARGA_MIN (por defecto 5). Si no hay DIA, se aplica a todos los días. Los clientes existentes no se borran.</p><input id="archivo-horarios" type="file" accept=".xlsx,.xls,.csv"><button id="validar-horarios">Validar sin grabar</button><button id="confirmar-horarios" disabled>Confirmar importación</button><p id="estado-horarios" role="status" aria-live="polite" style="margin-top:12px;font-weight:600"></p></div>';
  const archivo=$('#archivo-horarios'),confirmar=$('#confirmar-horarios'),validar=$('#validar-horarios'),estado=$('#estado-horarios');let validado=null,ocupado=false;
  archivo.onchange=()=>{validado=null;confirmar.disabled=true;estado.textContent='';};
  const enviar=async guardar=>{
   if(ocupado)return;
   const f=archivo.files[0];if(!f){estado.textContent='Seleccioná el archivo';return;}
   if(guardar&&validado?.file!==f){estado.textContent='Primero validá este archivo';return;}
   const cantidad=validado?.horarios;ocupado=true;archivo.disabled=true;validar.disabled=true;confirmar.disabled=true;confirmar.textContent=guardar?'Importando…':'Confirmar importación';estado.setAttribute('aria-busy','true');
   estado.textContent=guardar?'Importando '+Number(cantidad).toLocaleString('es-AR')+' horarios. Esperá la confirmación; no cierres esta pantalla.':'Validando archivo sin guardar…';estado.style.color='#174d85';
   try{const form=new FormData();form.append('archivo',f);form.append(guardar?'confirmar':'solo_validar',guardar?'SI':'1');const d=await api('/importar-horarios',{method:'POST',body:form});
    if(guardar){validado=null;estado.textContent='Importación completada: '+Number(d.clientes).toLocaleString('es-AR')+' clientes y '+Number(d.horarios).toLocaleString('es-AR')+' horarios guardados en SEC.';estado.style.color='#16753c';}
    else{validado={file:f,horarios:d.horarios};estado.textContent='Validado: '+Number(d.clientes).toLocaleString('es-AR')+' clientes y '+Number(d.horarios).toLocaleString('es-AR')+' horarios. Confirmá para guardar.';}
   }catch(e){validado=null;estado.textContent=(guardar?'No se pudo confirmar la importación: ':'No se pudo validar el archivo: ')+e.message+'. Volvé a validar antes de reintentar.';estado.style.color='#b42318';}
   finally{ocupado=false;archivo.disabled=false;validar.disabled=false;confirmar.disabled=!validado;confirmar.textContent='Confirmar importación';estado.setAttribute('aria-busy','false');}
  };
  validar.onclick=()=>enviar(false);confirmar.onclick=()=>enviar(true);return;
 }
 if(p==='Reemplazos por inasistencia'){await reemplazosInasistencia();return;}

 if(p==='Conductores'){conductores=await api('/conductores');abm();agregarVinculoConductor();return;}

 if(p==='Rendición Chofer'){await mostrarRendicionChoferSEC();return;}
 if(p==='Auditoría'){await mostrarAuditoriaSEC();return;}

 if(p==='Vehículos'){await abmVehiculosSEC();return;}
 if(['Importar pedidos','Vehículos'].includes(p)){const isV=p==='Vehículos';agregarVista.html=`<div class="panel"><p>${isV?'Columnas: INTERNO, PATENTE, TIPO (camion, tractor, semi).':'COD_CLI identifica al cliente. Indicá la fecha real de entrega; el Excel puede corresponder a un día de preparación anterior.'}</p>${isV?'':`<label>Fecha real de entrega <input id="fechaentregareal" type="date" required value="${fechaHoy()}"></label><p class="muted">Podés hacer varias cargas para la misma fecha. Solo se agregan pedidos nuevos: se conservan pedidos, cobros y asignaciones anteriores. Primero validá y después confirmá.</p>`}<input id="archivo" type="file" accept=".xlsx,.xls,.csv"><button id="validar-importacion">${isV?'Importar':'Validar archivo (sin grabar)'}</button>${isV?'':'<button id="confirmar-importacion" disabled>Confirmar importación</button><p id="resultado-validacion"></p>'}</div>`;
 let validado=null;const archivo=$('#archivo'),fechaInput=$('#fechaentregareal');const invalidar=()=>{validado=null;if($('#confirmar-importacion'))$('#confirmar-importacion').disabled=true;if($('#resultado-validacion'))$('#resultado-validacion').textContent=''};archivo.onchange=invalidar;if(fechaInput)fechaInput.onchange=invalidar;
 const enviar=async(soloValidar)=>{const f=archivo.files[0];if(!f)throw Error('Seleccioná el archivo Excel');const fecha=isV?'':fechaInput.value;if(!isV&&!/^\d{4}-\d{2}-\d{2}$/.test(fecha))throw Error('Seleccioná la fecha real de entrega');const form=new FormData();form.append('archivo',f);if(!isV){form.append('fecha_entrega_real',fecha);if(soloValidar)form.append('solo_validar','1')}return api(isV?'/vehiculos/importar':'/importar',{method:'POST',body:form})};
 $('#validar-importacion').onclick=run(async()=>{const d=await enviar(!isV);if(isV){mensaje('Importados: '+d.importados);return}validado={file:archivo.files[0],fecha:fechaInput.value};$('#confirmar-importacion').disabled=false;$('#resultado-validacion').textContent='Archivo válido: '+d.pedidos+' pedidos · '+d.despachos+' despachos · entrega '+validado.fecha.split('-').reverse().join('/')+'. Nuevos: '+d.nuevos+' · Existentes conservados: '+d.conservados+'. Todavía no se grabó nada.';});
 if(!isV)$('#confirmar-importacion').onclick=run(async()=>{if(!validado||validado.file!==archivo.files[0]||validado.fecha!==fechaInput.value)throw Error('Volvé a validar el archivo');if(!confirm('¿Confirmás importar '+validado.file.name+' para el '+validado.fecha.split('-').reverse().join('/')+'? Solo se agregarán pedidos nuevos. Los existentes se conservarán sin cambios.'))return;$('#confirmar-importacion').disabled=true;const d=await enviar(false);validado=null;$('#resultado-validacion').textContent='Importación realizada: '+d.importados+' pedidos nuevos · '+d.conservados+' existentes conservados. Podés volver a cargar otro archivo de la misma fecha. Revisá Asignación de repartos.';mensaje('Importación realizada: '+d.importados+' pedidos.');});

 if(!isV){
  document.querySelector('#vista').insertAdjacentHTML('beforeend',`<div class="panel"><h3>2. Importar Asigno (conductores y camiones)</h3><p>Primero importá Pedidos. Luego seleccioná Asigno y validá las coincidencias. Podés reimportar Asigno durante el día: las asignaciones anteriores se conservan. Los pendientes se resuelven en Asignación de repartos.</p><label>Archivo Asigno <input id="archivo-asigno" type="file" accept=".xlsx,.xls"></label><button id="validar-asigno">Validar Asigno (sin grabar)</button> <button id="confirmar-asigno" disabled>Aplicar asignaciones coincidentes</button><div id="resultado-asigno"></div></div>`);
  const af=$('#archivo-asigno'),vb=$('#validar-asigno'),cb=$('#confirmar-asigno'),resultado=$('#resultado-asigno');let comprobado=null;
  const limpiar=()=>{comprobado=null;cb.disabled=true;resultado.textContent=''};af.onchange=limpiar;fechaInput.onchange=()=>{invalidar();limpiar()};
  const pedirAsigno=async(validar)=>{const archivo=af.files[0];if(!archivo)throw Error('Seleccioná el archivo Asigno');const fecha=fechaInput.value;if(!/^\d{4}-\d{2}-\d{2}$/.test(fecha))throw Error('Seleccioná fecha de entrega');const form=new FormData();form.append('archivo',archivo);form.append('fecha_entrega_real',fecha);if(validar)form.append('solo_validar','1');return api('/asigno/importar',{method:'POST',body:form})};
  vb.onclick=run(async()=>{const d=await pedirAsigno(true);comprobado={file:af.files[0],fecha:fechaInput.value};cb.disabled=!d.asignables;resultado.innerHTML='<p><strong>'+d.asignables+' asignables automáticamente · '+d.conservadas+' conservadas · '+d.pendientes+' pendientes</strong></p>'+tabla(['Despacho','Interno','Legajo','Estado / advertencia'],d.detalle.map(x=>[esc(x.despacho),esc(x.interno),esc(x.legajo),esc(x.estado==='asignable'?'Listo para asignar':x.motivos.join('; '))]));});
  cb.onclick=run(async()=>{if(!comprobado||comprobado.file!==af.files[0]||comprobado.fecha!==fechaInput.value)throw Error('Volvé a validar Asigno');if(!confirm('¿Aplicar las asignaciones coincidentes para '+comprobado.fecha.split('-').reverse().join('/')+'? No se modificarán las asignaciones ya existentes.'))return;cb.disabled=true;const d=await pedirAsigno(false);comprobado=null;resultado.insertAdjacentHTML('afterbegin','<p><strong>Asignados: '+d.aplicados+' · Conservadas: '+d.conservadas+' · Pendientes: '+d.pendientes+'</strong>. Abrí Asignación de repartos para completar los restantes.</p>');mensaje('Asigno: '+d.aplicados+' asignaciones guardadas');});
 }
 if(isV){vehiculos=await api('/vehiculos');agregarVista.html=tabla(['Interno','Patente','Tipo'],vehiculos.map(v=>[esc(v.interno),esc(v.patente),esc(v.tipo)]));}return;}

 if(p==='Fotos del recorrido'){await fotosRecorrido();return;}
 if(p==='Dashboard conductores'){await dashboardConductores();return;}
 if(p==='Recrear viaje'){await recorridos();return;}
 if(p==='Visitas y recorridos'){await recorridos();return;}

 if(p==='App Conductor'){await conductor();return;}

 if(p==='Asignación de repartos'){
  fechaAsignacion=fechaAsignacion||fechaHoy();
  repartos=await api('/repartos?fecha='+encodeURIComponent(fechaAsignacion));
  let filtroEstado='todos',informesRuta=[],errorInformes='';const consultarInformes=async()=>{try{informesRuta=await api('/rutas-google/informes?fecha='+encodeURIComponent(fechaAsignacion));errorInformes='';}catch(e){informesRuta=[];errorInformes=e.message;}};await consultarInformes();
  const completo=r=>Boolean(r.conductor_id&&r.principal_id);
  const estado=r=>completo(r)?'Asignado':'Pendiente de salida';
  const mostrar=()=>{
   const completos=repartos.filter(completo).length,pendientes=repartos.length-completos;
   const visibles=repartos.filter(r=>filtroEstado==='todos'||(filtroEstado==='completos'?completo(r):!completo(r)));
   $('#lista-repartos').innerHTML=visibles.length?tabla(['Fecha','Despacho','Conductor','Interno / patente','Semi','Estado','Acción'],visibles.map(r=>[
    esc(r.fecha.slice(0,10)),esc(r.despacho),
    esc(r.conductor_id?(r.conductor||r.conductor_nombre||'Asignado'):'Sin asignar'),
    esc((r.interno||'')+(r.patente?' / '+r.patente:'')),
    esc((r.interno_semi||'')+(r.patente_semi?' / '+r.patente_semi:'')),
    `<span style="color:${completo(r)?'#16753c':'#b42318'};font-weight:700" aria-label="${esc(estado(r))}">${completo(r)?'●':'●'} ${esc(estado(r))}</span>`,
    `<button data-reparto="${esc(r.id)}">${completo(r)?"Modificar":"Asignar"}</button> <button type="button" data-informe-ruta="${esc(r.id)}" ${informesRuta.some(i=>i.reparto_id===r.id)?'':'disabled'}>${informesRuta.some(i=>i.reparto_id===r.id)?'Informe de ruteo':'Sin informe de ruteo'}</button>`
   ])):'<p>No hay despachos para este filtro y fecha.</p>';
   document.querySelectorAll('[data-reparto]').forEach(b=>b.onclick=run(()=>asignar(b.dataset.reparto)));
   document.querySelectorAll('[data-informe-ruta]').forEach(b=>b.onclick=()=>{const informe=informesRuta.find(i=>i.reparto_id===b.dataset.informeRuta),caja=$('#informe-ruteo-oficina');if(!informe)return;caja.hidden=false;caja.innerHTML=detalleInformeRuteoOficinaSEC(informe,repartos);caja.scrollIntoView({block:'start',behavior:'smooth'});});$('#estado-informes-ruta').textContent=errorInformes?'No se pudieron consultar informes: '+errorInformes:'Los informes aparecen después de que el chofer calcule o recalcule la ruta. Las observaciones de horarios se muestran aquí, para oficina.';
   $('#total-repartos').innerHTML=esc(repartos.length)+' despachos · <strong style="color:#16753c">● '+esc(completos)+' asignados</strong> · <strong style="color:#b42318">● '+esc(pendientes)+' pendientes de salida</strong>';
   $('#filtro-estado').value=filtroEstado;
  };
  agregarVista.html=`<div class="panel"><label>Fecha de entrega <input id="fecha-asignacion" type="date" value="${esc(fechaAsignacion)}"></label><button id="ver-hoy" type="button">Hoy</button><label>Mostrar <select id="filtro-estado"><option value="todos">Todos</option><option value="pendientes">Pendientes de salida</option><option value="completos">Asignados</option></select></label><button id="actualizar-informes-ruta" type="button">Actualizar repartos e informes</button><p id="estado-informes-ruta" role="status"></p><p id="total-repartos"></p></div><div class="panel" id="lista-repartos"></div><section class="panel" id="informe-ruteo-oficina" hidden></section>`;
  $('#actualizar-informes-ruta').onclick=run(async()=>{repartos=await api('/repartos?fecha='+encodeURIComponent(fechaAsignacion));await consultarInformes();$('#informe-ruteo-oficina').hidden=true;mostrar();});
  $('#filtro-estado').onchange=()=>{filtroEstado=$('#filtro-estado').value;mostrar()};
  $('#fecha-asignacion').onchange=run(async()=>{const nueva=$('#fecha-asignacion').value;if(!nueva)throw Error('Seleccioná una fecha');fechaAsignacion=nueva;repartos=await api('/repartos?fecha='+encodeURIComponent(fechaAsignacion));await consultarInformes();$('#informe-ruteo-oficina').hidden=true;mostrar();});
  $('#ver-hoy').onclick=run(async()=>{fechaAsignacion=fechaHoy();$('#fecha-asignacion').value=fechaAsignacion;repartos=await api('/repartos?fecha='+encodeURIComponent(fechaAsignacion));await consultarInformes();$('#informe-ruteo-oficina').hidden=true;mostrar();});
  mostrar();return;
 }
 pedidos=await api('/pedidos');repartos=await api('/repartos');

 if(p==='Mapa de clientes'){agregarVista.html=`<div class="panel"><label>Fecha<input id="fecha" type="date"></label><label>Despacho<select id="despacho"><option value="">Todos</option>${repartos.map(r=>`<option value="${esc(r.id)}">${esc(r.fecha.slice(0,10)+' · '+r.despacho)}</option>`).join('')}</select></label><div id="mapa"></div><p id="sincoordenadas"></p></div>`;const draw=()=>{if(mapa)mapa.remove();if(!window.L){mensaje('No se pudo cargar el componente de mapa');return;}mapa=L.map('mapa').setView([-34.65,-58.8],12);L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{attribution:'© OpenStreetMap contributors',maxZoom:19}).addTo(mapa);const seen=new Set(),pts=[],rs=pedidos.filter(p=>(!$('#fecha').value||p.fecha.slice(0,10)===$('#fecha').value)&&(!$('#despacho').value||p.reparto_id===$('#despacho').value));let missing=0;for(const p of rs){if(seen.has(p.codigo_cliente))continue;seen.add(p.codigo_cliente);if(p.latitud==null||p.longitud==null){missing++;continue;}const lat=Number(p.latitud),lng=Number(p.longitud);if(!Number.isFinite(lat)||!Number.isFinite(lng)){missing++;continue;}L.marker([lat,lng]).addTo(mapa).bindPopup(esc(p.codigo_cliente+' · '+p.nombre_cliente));pts.push([lat,lng]);}if(pts.length)mapa.fitBounds(pts,{padding:[25,25],maxZoom:16});$('#sincoordenadas').textContent='Clientes sin coordenadas: '+missing;};$('#fecha').onchange=draw;$('#despacho').onchange=draw;draw();return;}

 if(p==='Alertas'){
  agregarVista.html='<div class="panel"><h3>Alertas del conductor</h3><button id="alertas-refrescar">Actualizar</button><div id="alertas-historial"></div><h3>Controles operativos</h3></div>';
  agregarVista.html='<form id="alertas-umbrales"><label>Hora límite para registrar inicio<input name="inicio" type="time" value="08:00" required></label><label>Detención (minutos)<input name="detenido" type="number" min="5" max="240" value="30" required></label><label>Tolerancia tras último cierre del cliente (minutos)<input name="demora" type="number" min="0" max="240" value="15" required></label><button>Guardar y consultar controles</button></form><p>Valores editables, guardados en este navegador por usuario y empresa. Inicio inferido por GPS o visita; una detención puede corresponder a descarga o pausa. Sin horario de recepción no se calcula demora. Controles del día actual, hora de Argentina.</p><div id="alertas-operativas" role="status"></div>';
  const formControles=$('#alertas-umbrales'),panelControles=$('#alertas-operativas');
  const claveControles='sec-alertas-umbrales:'+usuario.empresa_id+':'+usuario.id;
  try{const guardados=JSON.parse(localStorage.getItem(claveControles)||'null');if(guardados)for(const nombre of ['inicio','detenido','demora'])if(guardados[nombre]!=null)formControles.elements.namedItem(nombre).value=guardados[nombre];}catch{}
  const cargarControles=async()=>{panelControles.textContent='Consultando…';try{const datos=await api('/alertas-operativas?'+new URLSearchParams(new FormData(formControles)));panelControles.innerHTML=datos.alertas.length?tabla(['Tipo','Referencia','Detalle'],datos.alertas.map(a=>[esc(a.tipo),esc(a.referencia),esc(a.detalle)])):'Sin alertas operativas detectadas. Revisado: '+esc(new Date(datos.generado_en).toLocaleString('es-AR'));}catch(e){panelControles.textContent='No se pudieron consultar los controles: '+e.message;}};
  formControles.onsubmit=e=>{e.preventDefault();if(formControles.reportValidity()){try{localStorage.setItem(claveControles,JSON.stringify(Object.fromEntries(new FormData(formControles))));}catch{mensaje('No se pudieron guardar las preferencias del navegador. Los valores se aplican a esta consulta.');}cargarControles();}};

  const refresh=async()=>{const as=await api('/alertas-conductor');$('#alertas-historial').innerHTML=tabla(['Fecha','Tipo','Conductor','Despacho','Estado','Acción'],as.map(a=>[esc(new Date(a.creada_en).toLocaleString('es-AR')),esc((a.es_prueba?'PRUEBA · ':'')+a.tipo),esc(a.conductor),esc(a.despacho||''),esc(a.estado),(a.estado==='CONFIRMADA'?'<button data-resolver="'+esc(a.id)+'">Resolver</button>':a.estado==='ENVIADA'?'<button data-confirmar="'+esc(a.id)+'">Confirmar</button>':'—')+(a.tipo==='MECANICO'&&a.estado!=='RESUELTA'?'<button data-mecanico-historial="'+esc(a.id)+'">Enviar enlace al mecánico</button>':'')]));if(typeof activarDerivacionMecanicaHistorialSEC==='function')activarDerivacionMecanicaHistorialSEC($('#alertas-historial'),as);$('#alertas-historial').querySelectorAll('[data-resolver],[data-confirmar]').forEach(b=>b.onclick=run(async()=>{await api('/alertas-conductor/'+(b.dataset.resolver||b.dataset.confirmar)+'/'+(b.dataset.resolver?'resolver':'confirmar'),{method:'POST'});await refresh();await consultarAlertasOficina();}));};$('#alertas-refrescar').onclick=run(async()=>{await refresh();await cargarControles();});await refresh();await cargarControles();if(typeof mostrarHistorialOficina==='function')await mostrarHistorialOficina();if(typeof mostrarAsistenciasMecanicasSEC==='function')await mostrarAsistenciasMecanicasSEC();return;
 }

 // La asignación se muestra arriba con filtro de fecha.

}

function abm(id){const c=conductores.find(c=>c.id===id)||{};$('#vista').innerHTML=`<h2>Conductores</h2><div class="panel" id="conductor-editor" style="scroll-margin-top:48px"><h3>${id?'Editar conductor: '+esc(c.nombre+' '+c.apellido):'Nuevo conductor'}</h3><form id="abm"><label>Legajo<input name="legajo" required maxlength="20" value="${esc(c.legajo||'')}"></label><label>Nombre<input name="nombre" required value="${esc(c.nombre||'')}"></label><label>Apellido<input name="apellido" required value="${esc(c.apellido||'')}"></label><label>Teléfono<input name="telefono" type="tel" value="${esc(c.telefono||'')}"></label><label>${id?'Nueva contraseña (vacío conserva la actual)':'Contraseña'}<input name="clave" type="password" minlength="8" ${id?'':'required'}></label><label>Estado<select name="activo"><option value="true" ${c.activo!==false?'selected':''}>Activo</option><option value="false" ${c.activo===false?'selected':''}>Inactivo</option></select></label><button>Guardar</button><button type="button" id="nuevo">Nuevo</button></form></div>`+tabla(['Legajo','Nombre','Estado','Acción'],conductores.map(c=>[esc(c.legajo),esc(c.nombre+' '+c.apellido),c.activo?'Activo':'Inactivo',`<button data-edit="${esc(c.id)}">Editar</button>`]));$('#nuevo').onclick=()=>abm();document.querySelectorAll('[data-edit]').forEach(b=>b.onclick=()=>abm(b.dataset.edit));$('#abm').onsubmit=e=>{e.preventDefault();run(async()=>{const b=Object.fromEntries(new FormData(e.target));b.activo=b.activo==='true';await api('/conductores'+(id?'/'+id:''),{method:id?'PUT':'POST',body:JSON.stringify(b)});await abrir('Conductores');mensaje('Conductor guardado en SEC.');})()};if(id)requestAnimationFrame(()=>document.getElementById('conductor-editor')?.scrollIntoView({block:'start',behavior:'instant'}));}

async function asignar(id){conductores=await api('/conductores');vehiculos=await api('/vehiculos');const r=repartos.find(r=>r.id===id);const opt=(rs,val,field)=>'<option value="">Sin asignar</option>'+rs.map(v=>`<option value="${esc(v.id)}" ${v.id===val?'selected':''}>${esc(field(v))}</option>`).join('');$('#vista').innerHTML=`<h2>${r.conductor_id&&r.principal_id?'Modificar':'Asignar'} · ${esc(r.despacho)}</h2><div class="panel"><form id="asignar"><label>Conductor<select name="conductor_id">${opt(conductores.filter(c=>c.activo),r.conductor_id,c=>c.legajo+' · '+c.nombre+' '+c.apellido)}</select></label><label>Camión / tractor<select name="principal_id">${opt(vehiculos.filter(v=>v.activo&&v.tipo!=='semi'),r.principal_id,v=>v.interno+' · '+v.patente)}</select></label><label>Semi<select name="semi_id">${opt(vehiculos.filter(v=>v.activo&&v.tipo==='semi'),r.semi_id,v=>v.interno+' · '+v.patente)}</select></label><button>Guardar asignación</button><button id="volver-repartos" type="button">Volver a repartos</button></form></div>`;$('#volver-repartos').onclick=run(()=>abrir('Asignación de repartos'));$('#asignar').onsubmit=e=>{e.preventDefault();run(async()=>{await api('/repartos/'+id,{method:'PUT',body:JSON.stringify(Object.fromEntries(new FormData(e.target)))});await abrir('Asignación de repartos');mensaje('Asignación guardada y auditada.');})()};}

async function reemplazosInasistencia(){
  const [cs,rs,historial]=await Promise.all([api('/conductores'),api('/repartos'),api('/reemplazos')]);
  const opciones=lista=>'<option value="">Seleccionar conductor</option>'+lista.map(c=>`<option value="${esc(c.id)}">${esc(c.legajo+' · '+c.nombre+' '+c.apellido)}</option>`).join('');
  agregarVista.html=`<div class="panel"><p>Reemplazar al conductor ausente en los repartos ya cargados del período. Los vehículos se conservan. Si se importan o asignan más repartos después, revisar y aplicar el reemplazo a esos repartos.</p><form id="reemplazoForm"><label>Conductor ausente<select name="ausente_id" required>${opciones(cs)}</select></label><label>Conductor reemplazante<select name="reemplazante_id" required>${opciones(cs.filter(c=>c.activo))}</select></label><label>Desde<input name="desde" type="date" value="${fechaHoy()}" required></label><label>Hasta<input name="hasta" type="date" value="${fechaHoy()}" required></label><label>Motivo<input name="motivo" maxlength="500" placeholder="Ausencia, enfermedad, licencia…" required></label><div id="reemplazoPreview"></div><button id="aplicarReemplazo" disabled>Aplicar reemplazo</button></form></div>`;
  const form=$('#reemplazoForm');let seleccion=[];
  const preview=()=>{
    const b=Object.fromEntries(new FormData(form));
    seleccion=rs.filter(r=>r.conductor_id===b.ausente_id&&r.fecha.slice(0,10)>=b.desde&&r.fecha.slice(0,10)<=b.hasta);
    $('#reemplazoPreview').innerHTML=tabla(['Fecha','Despacho','Conductor actual'],seleccion.map(r=>[esc(r.fecha.slice(0,10)),esc(r.despacho),esc(r.conductor||r.conductor_nombre||'')]));
    $('#aplicarReemplazo').disabled=!seleccion.length||!b.reemplazante_id||b.ausente_id===b.reemplazante_id||b.desde>b.hasta||!b.motivo.trim();
  };
  form.oninput=preview;form.onchange=preview;preview();
  form.onsubmit=e=>{e.preventDefault();run(async()=>{
    const b=Object.fromEntries(new FormData(form));
    if(!seleccion.length)throw Error('No hay repartos para reemplazar');
    const nombre=cs.find(c=>c.id===b.reemplazante_id);
    if(!confirm(`¿Asignar los ${seleccion.length} repartos mostrados a ${nombre.nombre} ${nombre.apellido}?`))return;
    $('#aplicarReemplazo').disabled=true;
    try{const d=await api('/reemplazos',{method:'POST',body:JSON.stringify({...b,reparto_ids:seleccion.map(r=>r.id)})});await abrir('Reemplazos por inasistencia');mensaje('Reemplazo aplicado a '+d.cantidad+' repartos y registrado en auditoría.');}catch(err){preview();throw err;}
  })();};
  agregarVista.html='<h3>Historial de reemplazos</h3>'+tabla(['Registrado','Ausente','Reemplazante','Desde','Hasta','Motivo','Repartos','Acción'],historial.map(r=>{const d=r.detalle;return [esc(new Date(r.fecha).toLocaleString('es-AR')),esc(d.ausente),esc(d.reemplazante),esc(d.desde),esc(d.hasta),esc(d.motivo),esc(d.repartos.length),r.deshecho?'Deshecho':`<button data-deshacer="${esc(r.id)}">Deshacer reemplazo</button>`];}));
  document.querySelectorAll('[data-deshacer]').forEach(b=>b.onclick=run(async()=>{
    if(!confirm('¿Restituir el conductor original en los repartos de este reemplazo?'))return;
    await api('/reemplazos/'+encodeURIComponent(b.dataset.deshacer)+'/deshacer',{method:'POST'});
    await abrir('Reemplazos por inasistencia');mensaje('Conductor original restituido y cambio auditado.');
  }));
}

// El token se conserva sólo durante la sesión del navegador.

if(token)run(async()=>{usuario=await api('/me');await entrarDestinoInicialSEC();if(window.SECAndroid&&usuario.rol==='CONDUCTOR'&&sessionStorage.getItem('sec-dist-apk-gps'))await abrir('App Conductor');})();else login();



let gpsWatch=null;

function fechaHoy(){const partes=new Intl.DateTimeFormat('en-US',{timeZone:'America/Argentina/Buenos_Aires',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());const valor=tipo=>partes.find(p=>p.type===tipo).value;return valor('year')+'-'+valor('month')+'-'+valor('day');}

async function conductor(){

 agregarVista.html='<div class="panel" id="panel-alerta-conductor"><h3>Seguridad y asistencia</h3><div style="display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:5px"><button id="alerta-robo" type="button" style="background:#b91c1c;color:#fff;padding:9px 3px;margin:0;font-size:11px;line-height:1.25;min-width:0;white-space:normal">ROBO</button><button id="alerta-mecanico" type="button" style="background:#d97706;color:#fff;padding:9px 3px;margin:0;font-size:11px;line-height:1.25;min-width:0;white-space:normal">PEDIR MECÁNICO</button><button id="informar-anomalia" type="button" style="background:#475569;color:#fff;padding:9px 3px;margin:0;font-size:11px;line-height:1.25;min-width:0;white-space:normal">INFORMAR FALLA</button></div><p id="alerta-estado" aria-live="polite">Sin alertas enviadas.</p><div id="form-anomalia-panel" hidden><form id="form-anomalia"><label>Tipo de anomalía<select name="tipo" required><option value="LUCES">Luces</option><option value="FRENOS">Frenos</option><option value="NEUMATICOS">Neumáticos</option><option value="MOTOR">Motor</option><option value="ELECTRICO">Sistema eléctrico</option><option value="CARROCERIA">Carrocería</option><option value="OTRO">Otro</option></select></label><label>Qué sucede<textarea name="descripcion" required minlength="5" maxlength="1500" placeholder="Ej.: No enciende la luz trasera derecha"></textarea></label><label>Prioridad<select name="prioridad"><option value="NORMAL">Revisar al regresar</option><option value="URGENTE">Urgente: requiere atención</option></select></label><button type="submit">Enviar a mantenimiento</button></form><p id="anomalia-estado"></p></div></div>';
 $('#informar-anomalia').onclick=()=>{$('#form-anomalia-panel').hidden=!$('#form-anomalia-panel').hidden;};
 $('#form-anomalia').onsubmit=e=>{e.preventDefault();run(async()=>{
  const b=Object.fromEntries(new FormData(e.target));
  if(!confirm('¿Enviar esta anomalía a Mantenimiento?'))return;
  const x=await api('/anomalias-vehiculo',{method:'POST',body:JSON.stringify(b)});
  $('#anomalia-estado').textContent='Anomalía N.º '+x.id+' registrada. Mantenimiento podrá verla antes del regreso.';
  e.target.reset();
 })();};
 const enviarAlerta=async tipo=>{
   const prueba=false;
   if(!confirm('CONFIRMAR ALERTA REAL: '+(tipo==='ROBO'?'ROBO':'PEDIDO DE MECÁNICO')+'?'))return;
   const boton=tipo==='ROBO'?$('#alerta-robo'):$('#alerta-mecanico');boton.disabled=true;
   try{
    let gps=null;try{if(navigator.geolocation)gps=await new Promise(resolve=>navigator.geolocation.getCurrentPosition(p=>resolve({latitud:p.coords.latitude,longitud:p.coords.longitude}),()=>resolve(null),{enableHighAccuracy:true,timeout:3500,maximumAge:30000}));}catch(_){}
    const d=await api('/alertas-conductor',{method:'POST',body:JSON.stringify({tipo,es_prueba:prueba,latitud:gps?.latitud??null,longitud:gps?.longitud??null})});
    $('#alerta-estado').textContent='Alerta '+(prueba?'DE PRUEBA ':'')+'recibida por el servidor. Esperando confirmación humana. N.º '+d.id;sessionStorage.setItem('sec-alerta-pendiente',String(d.id));
   }catch(e){$('#alerta-estado').textContent='NO se confirmó el envío: '+e.message+'. Reintentar o llamar a la oficina.';}
   finally{boton.disabled=false;}
 };
 $('#alerta-robo').onclick=()=>enviarAlerta('ROBO');
 $('#alerta-mecanico').onclick=()=>enviarAlerta('MECANICO');
 const consultarConfirmacion=async()=>{const id=sessionStorage.getItem('sec-alerta-pendiente');if(!id||!document.getElementById('alerta-estado'))return;try{const as=await api('/alertas-conductor');const a=as.find(x=>String(x.id)===id);if(a&&a.estado!=='ENVIADA'){$('#alerta-estado').textContent='Alerta N.º '+id+' · '+(a.estado==='CONFIRMADA'?'CONFIRMADA POR OFICINA':'RESUELTA')+'.';sessionStorage.removeItem('sec-alerta-pendiente');}}catch(_){}};await consultarConfirmacion();if(window.secConfirmacionTimer)clearInterval(window.secConfirmacionTimer);window.secConfirmacionTimer=setInterval(consultarConfirmacion,12000);


 if(usuario?.rol!=='CONDUCTOR'){
   agregarVista.html='<div class="panel"><h3>Anomalías de vehículos · Mantenimiento</h3><button type="button" id="ver-anomalias">Consultar anomalías</button><div id="lista-anomalias"></div></div>';
   $('#ver-anomalias').onclick=()=>run(async()=>{
    const datos=await api('/anomalias-vehiculo'),caja=$('#lista-anomalias');
    caja.innerHTML=datos.length?datos.map(x=>'<div class="panel"><strong>#'+esc(x.id)+' · '+esc(x.tipo)+' · '+esc(x.estado)+'</strong><p>Conductor: '+esc(x.conductor_nombre+' '+x.conductor_apellido)+' · '+esc(new Date(x.creado_en).toLocaleString('es-AR'))+'</p><p>'+esc(x.descripcion)+'</p><p>Prioridad: '+esc(x.prioridad)+'</p><label>Seguimiento<select data-anomalia-id="'+esc(x.id)+'"><option value="PENDIENTE">Pendiente</option><option value="EN_REVISION">En revisión</option><option value="RESUELTA">Resuelta</option></select></label><label>Observación<textarea data-anomalia-nota="'+esc(x.id)+'">'+esc(x.observacion_mantenimiento||'')+'</textarea></label><button type="button" data-guardar-anomalia="'+esc(x.id)+'">Guardar seguimiento</button></div>').join(''):'<p>Sin anomalías registradas.</p>';
    datos.forEach(x=>{const sel=document.querySelector('[data-anomalia-id="'+x.id+'"]');if(sel)sel.value=x.estado;});
    document.querySelectorAll('[data-guardar-anomalia]').forEach(btn=>btn.onclick=()=>run(async()=>{const id=btn.dataset.guardarAnomalia;await api('/anomalias-vehiculo/'+id,{method:'PATCH',body:JSON.stringify({estado:document.querySelector('[data-anomalia-id="'+id+'"]').value,observacion_mantenimiento:document.querySelector('[data-anomalia-nota="'+id+'"]').value})});mensaje('Seguimiento actualizado.');$('#ver-anomalias').click();})());
   })();
   agregarVista.html='<div class="panel"><h3>Ingresar como conductor</h3><p>Como en Comercial, podés ingresar con el legajo del conductor sin cerrar tu sesión administrativa. La App Conductor se abrirá en otra pestaña.</p><form id="acceso-conductor-legajo"><label>Legajo del conductor<input name="legajo" inputmode="numeric" autocomplete="off" required placeholder="Ej.: 164"></label><button type="submit">Abrir App Conductor</button></form></div>';
   $('#acceso-conductor-legajo').onsubmit=async e=>{
     e.preventDefault();
     const legajo=String(new FormData(e.target).get('legajo')||'').trim();
     if(!legajo)return;
     const nueva=window.open('about:blank','_blank');
     if(!nueva){mensaje('Permití las ventanas emergentes para abrir la App Conductor en otra pestaña.');return;}
     try{
       const respuesta=await fetch(API+'/ingreso-conductor',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({legajo,empresa:'rebesa'})});
       const ingreso=await respuesta.json();
       if(!respuesta.ok||!ingreso.token)throw Error(ingreso.error||'No se pudo ingresar con ese legajo');
       nueva.sessionStorage.setItem('sec-distribucion-token',ingreso.token);
       nueva.sessionStorage.setItem('sec-dist-apk-gps','0');
       nueva.location.replace(location.origin+'/distribucion/index.html');
       mensaje('App Conductor abierta en otra pestaña para el legajo '+legajo+'. Tu sesión administrativa sigue abierta.');
     }catch(error){nueva.close();mensaje(error.message);}
   };
   return;
 }

 const fecha=fechaHoy(),[ps,vs,rendiciones]=await Promise.all([api('/pedidos?fecha='+fecha),api('/visitas?fecha='+fecha),api('/rendicion/entregas?fecha='+fecha)]),seen=new Set();
 const stops=ps.filter(p=>{const key=p.reparto_id+'|'+p.codigo_cliente;if(seen.has(key))return false;seen.add(key);return true;});
 const despachos=[...new Set(stops.map(p=>String(p.despacho??'Sin despacho')))];let despachoActivo=despachos[0];const enDespacho=p=>String(p.despacho??'Sin despacho')===despachoActivo;const coloresDespacho=['#c62828','#1565c0','#7b1fa2','#ef6c00','#008577','#795548','#455a64'];const colorDespacho=p=>coloresDespacho[Math.max(0,despachos.indexOf(String(p.despacho??'Sin despacho')))%coloresDespacho.length];
 const coordValida=p=>p&&p.latitud!=null&&p.longitud!=null&&Number.isFinite(Number(p.latitud))&&Number.isFinite(Number(p.longitud))&&Math.abs(Number(p.latitud))<=90&&Math.abs(Number(p.longitud))<=180;
 const abrirMaps=p=>{if(!coordValida(p)){mensaje('Este cliente no tiene coordenadas válidas para navegar.');return;}const destino=Number(p.latitud)+','+Number(p.longitud);window.open('https://www.google.com/maps/dir/?api=1&destination='+encodeURIComponent(destino)+'&travelmode=driving','_blank','noopener,noreferrer');};
 let ultimaUbicacion=null,ordenSugerido=[];
 const estadoCliente=p=>{const r=rendiciones.find(x=>String(x.reparto_id)===String(p.reparto_id)&&String(x.codigo_cliente)===String(p.codigo_cliente));if(r?.estado==='RECHAZADO')return 'RECHAZADO';if(r?.estado==='PARCIAL')return 'PARCIAL';if(r?.estado==='ENTREGADO')return 'ENTREGADO';const v=vs.find(x=>String(x.reparto_id)===String(p.reparto_id)&&String(x.codigo_cliente)===String(p.codigo_cliente));return ['ENTREGADO','CERRADO'].includes(v?.estado)?'ENTREGADO':v?.estado==='INCIDENCIA'?'NO_ENTREGADO':v?.estado==='VISITADO'?'VISITADO':'PENDIENTE';};
 const atendido=p=>estadoCliente(p)!=='PENDIENTE';
 const entregado=p=>['ENTREGADO','PARCIAL'].includes(estadoCliente(p));
 const distancia=(a,b)=>{const rad=Math.PI/180,dlat=(Number(b.latitud)-Number(a.latitud))*rad,dlon=(Number(b.longitud)-Number(a.longitud))*rad,x=Math.sin(dlat/2)**2+Math.cos(Number(a.latitud)*rad)*Math.cos(Number(b.latitud)*rad)*Math.sin(dlon/2)**2;return 6371*2*Math.atan2(Math.sqrt(x),Math.sqrt(1-x));};
 const sugerirOrden=()=>{const disponibles=stops.filter(p=>enDespacho(p)&&coordValida(p)&&!atendido(p));const sinCoordenadas=stops.filter(p=>enDespacho(p)&&!coordValida(p)&&!entregado(p));const pendientes=[...disponibles];let actual=ultimaUbicacion||pendientes[0];const orden=[];while(pendientes.length){let indice=0;if(actual){let mejor=Infinity;pendientes.forEach((p,i)=>{const d=distancia(actual,p);if(d<mejor){mejor=d;indice=i;}});}const siguiente=pendientes.splice(indice,1)[0];orden.push(siguiente);actual=siguiente;}ordenSugerido=orden;return {orden,sinCoordenadas};};
 let mapaGoogle=null,marcadoresGoogle=[],lineasGoogle=[],gpsGoogle=null,ultimaRuta=null,temporizadorRuta=null,calculandoRuta=false;
 const cargarGoogle=async()=>{if(window.google?.maps)return;const cfg=await api('/mapa-google/configuracion');if(!cfg.api_key)throw Error('Falta GOOGLE_MAPS_BROWSER_API_KEY en Render');await new Promise((resolve,reject)=>{const script=document.createElement('script');script.src='https://maps.googleapis.com/maps/api/js?key='+encodeURIComponent(cfg.api_key)+'&v=weekly';script.onload=resolve;script.onerror=()=>reject(Error('No se pudo cargar Google Maps JavaScript API'));document.head.appendChild(script);});};
 const dibujarRutaGoogle=async respuesta=>{
  await cargarGoogle();if(!$('#mapa-conductor'))return;
  if(mapaConductor){mapaConductor.remove();mapaConductor=null;marcadorGps=null;trazaGps=null;}
  if(!mapaGoogle)mapaGoogle=new google.maps.Map($('#mapa-conductor'),{center:{lat:Number(ultimaUbicacion.latitud),lng:Number(ultimaUbicacion.longitud)},zoom:12,mapTypeControl:false,streetViewControl:false,fullscreenControl:false});
  marcadoresGoogle.forEach(m=>m.setMap(null));lineasGoogle.forEach(l=>l.setMap(null));marcadoresGoogle=[];lineasGoogle=[];
  const bounds=new google.maps.LatLngBounds(),actual={lat:Number(ultimaUbicacion.latitud),lng:Number(ultimaUbicacion.longitud)};bounds.extend(actual);
  ordenSugerido.forEach((p,i)=>{const position={lat:Number(p.latitud),lng:Number(p.longitud)};bounds.extend(position);const marker=new google.maps.Marker({map:mapaGoogle,position,label:{text:String(i+1),color:'#ffffff'},title:'Parada '+(i+1)+' · Cliente '+p.codigo_cliente+' · Despacho '+p.despacho+' · '+p.nombre_cliente,icon:{path:google.maps.SymbolPath.CIRCLE,scale:16,fillColor:colorDespacho(p),fillOpacity:1,strokeColor:'#ffffff',strokeWeight:2}});const info=new google.maps.InfoWindow({content:'<strong>Parada '+(i+1)+' · Cliente '+esc(p.codigo_cliente)+'</strong><p>'+esc(p.nombre_cliente)+'</p><p>Despacho '+esc(p.despacho)+'</p>'});marker.addListener('click',()=>info.open(mapaGoogle,marker));marcadoresGoogle.push(marker);});
  const decode=encoded=>{let index=0,lat=0,lng=0,path=[];while(index<encoded.length){let b,shift=0,result=0;do{b=encoded.charCodeAt(index++)-63;result|=(b&31)<<shift;shift+=5;}while(b>=32);lat+=(result&1)?~(result>>1):(result>>1);shift=0;result=0;do{b=encoded.charCodeAt(index++)-63;result|=(b&31)<<shift;shift+=5;}while(b>=32);lng+=(result&1)?~(result>>1):(result>>1);path.push({lat:lat/1e5,lng:lng/1e5});}return path;};
  (respuesta.polilineas||[]).forEach(encoded=>{const path=decode(encoded);const line=new google.maps.Polyline({map:mapaGoogle,path,strokeColor:'#1565c0',strokeOpacity:0.9,strokeWeight:6});lineasGoogle.push(line);path.forEach(p=>bounds.extend(p));});
  if(gpsGoogle)gpsGoogle.setMap(null);gpsGoogle=new google.maps.Marker({map:mapaGoogle,position:actual,title:'Mi ubicación',icon:{path:google.maps.SymbolPath.CIRCLE,scale:9,fillColor:'#1976d2',fillOpacity:1,strokeColor:'#fff',strokeWeight:3}});
  mapaGoogle.fitBounds(bounds);actualizarSiguiente();$('#mapa-aviso').textContent='Ruta por calles (azul) · Punto GPS (azul claro). Los números indican el orden de parada; el color indica el despacho.';
 };
 const mostrarSugerencia=async(automatica=false)=>{if(calculandoRuta)return;calculandoRuta=true;const caja=$('#ruta-sugerida');caja.hidden=false;const despachoSolicitado=despachoActivo;const ordenAnterior=[...ordenSugerido];const {orden,sinCoordenadas}=sugerirOrden();ordenSugerido=ordenAnterior;if(!automatica)caja.innerHTML='<strong>Calculando recorrido…</strong>';
  try{if(!orden.length){caja.innerHTML='<p>No hay entregas pendientes con coordenadas.</p>';return;}
   if(!ultimaUbicacion){const pos=await new Promise((resolve,reject)=>navigator.geolocation.getCurrentPosition(resolve,reject,{enableHighAccuracy:true,timeout:10000,maximumAge:15000}));ultimaUbicacion={latitud:pos.coords.latitude,longitud:pos.coords.longitude};}
   const respuesta=await api('/rutas-google/sugerir',{method:'POST',body:JSON.stringify({origen:ultimaUbicacion,puntos:orden.map(p=>({reparto_id:p.reparto_id,codigo_cliente:p.codigo_cliente,latitud:p.latitud,longitud:p.longitud}))})});
   if(despachoSolicitado!==despachoActivo)return;const clave=p=>p.reparto_id+'|'+p.codigo_cliente,mapaPuntos=new Map(orden.map(p=>[clave(p),p]));const nuevoOrden=respuesta.orden.map(p=>mapaPuntos.get(clave(p))).filter(Boolean);
   if(automatica&&ordenAnterior.length&&nuevoOrden.map(clave).join(',')!==ordenAnterior.filter(p=>!atendido(p)).map(clave).join(',')){
    caja.innerHTML='<strong>SEC propone cambiar el orden de las entregas</strong><p>Hay una nueva propuesta para el recorrido. El orden actual no se modificó.</p>'+'<button id="aplicar-ruta-nueva" type="button">Aplicar nueva ruta</button><button id="mantener-ruta" type="button">Mantener orden actual</button>';
    $('#aplicar-ruta-nueva').onclick=()=>{ordenSugerido=nuevoOrden;ultimaRuta=respuesta;dibujarRutaGoogle(respuesta).catch(e=>mensaje(e.message));mostrarResumenRuta(respuesta);};
    $('#mantener-ruta').onclick=()=>{caja.innerHTML='<p>Se mantiene el orden actual. Podés recalcular manualmente.</p>';};return;
   }
   ordenSugerido=nuevoOrden;ultimaRuta=respuesta;await dibujarRutaGoogle(respuesta);mostrarResumenRuta(respuesta);
  }catch(e){caja.innerHTML='<strong>No se pudo actualizar Google Maps</strong><p>'+esc(e.message)+'</p>';}finally{calculandoRuta=false;}
 };
 const mostrarResumenRuta=r=>{const caja=$('#ruta-sugerida');if(!caja)return;caja.innerHTML='<strong>Despacho '+esc(despachoActivo)+' · Próxima entrega: '+esc(ordenSugerido[0]?.nombre_cliente||'Sin próxima entrega en esta propuesta')+'</strong><p>'+Math.round(r.distancia_metros/1000)+' km · '+Math.round(r.duracion_segundos/60)+' min estimados de conducción · '+ordenSugerido.length+' paradas · Actualizado '+new Date().toLocaleTimeString('es-AR')+'</p><button id="recalcular-manual" type="button">Recalcular ahora</button>';$('#recalcular-manual').onclick=()=>mostrarSugerencia(false);};

 const entregados=stops.filter(entregado).length,visitadosSinEntrega=stops.filter(p=>['RECHAZADO','NO_ENTREGADO','VISITADO'].includes(estadoCliente(p))).length;

 const formatoDinero=n=>Number(n||0).toLocaleString('es-AR',{style:'currency',currency:'ARS'});
 agregarVista.html='<div class="panel" id="mi-cobranza"><button id="mi-cobranza-toggle" type="button">💰 Mi cobranza · Ver resumen</button><div id="mi-cobranza-detalle" hidden><p>Liquidación de los despachos de hoy: efectivo, pagos QR, cuenta corriente y otros medios registrados.</p><div id="mi-cobranza-cifras">Seleccioná Ver resumen.</div><button type="button" id="mi-cobranza-actualizar">Volver a consultar importes</button><hr><h3>Cierre de caja</h3><p>Contá solamente el efectivo físico y comparalo con el sistema. QR, cuenta corriente y otros medios forman parte de la liquidación, pero no se suman al efectivo físico contado. Una vez confirmado, el cierre no se puede editar desde la APK.</p><div id="mi-cobranza-cierre">Consultando cierre...</div></div></div>';
 const mostrarCobranza=async()=>{
  const caja=$('#mi-cobranza-cifras');if(!caja)return;caja.textContent='Consultando cobranzas...';
  try{
   const [cobros,entregas]=await Promise.all([api('/rendicion/cobros?fecha='+encodeURIComponent(fecha)),api('/rendicion/entregas?fecha='+encodeURIComponent(fecha))]);
   const clasificar=clasificarMedioCobranzaSEC,resumen=resumirMiCobranzaSEC(cobros,entregas);const {grupos,detalles,totalEntregado,totalRegistrado,totalCobrado,pendiente}=resumen;
   const saldoClientes=entregas.map(e=>{const pagosCliente=cobros.filter(c=>String(c.rendicion_entrega_id)===String(e.id));const registrado=pagosCliente.reduce((n,c)=>n+Math.round(Number(c.importe||0)*100),0),cuenta=pagosCliente.filter(c=>clasificar(c)==='cuenta').reduce((n,c)=>n+Math.round(Number(c.importe||0)*100),0),entregado=Math.round(Number(e.importe_entregado||0)*100);const saldo=Math.max(0,entregado-registrado);const cliente=stops.find(p=>String(p.codigo_cliente)===String(e.codigo_cliente)&&String(p.reparto_id)===String(e.reparto_id));return {nombre:e.codigo_cliente+' · '+(cliente?.nombre_cliente||'Cliente'),reparto:e.reparto_id,codigo:e.codigo_cliente,entregado,pagos:registrado-cuenta,cuenta,saldo};}).filter(e=>e.saldo>0);
   const fila=(nombre,centavos)=>'<div style="display:flex;justify-content:space-between;gap:10px;padding:7px 0;border-bottom:1px solid #ddd"><span>'+esc(nombre)+'</span><strong>'+esc(formatoDinero(centavos/100))+'</strong></div>';
   caja.innerHTML=filasLiquidacionSEC(resumen).map(([nombre,importe])=>fila(nombre,importe)).join('')+'<p>Cuenta corriente está incluida en la liquidación. En Otro se agrupan transferencias, tarjetas, cheques y los demás medios que no son efectivo, QR ni cuenta corriente.</p>'+detalleAyudanteSEC(resumen,stops)+(saldoClientes.length?'<section><h3>Entregas que necesitan revisión</h3><p>Estas entregas tienen mercadería registrada sin un pago o cuenta corriente que cubra todo su importe. Revisá el cobro de cada cliente. No significa que el cliente haya pagado de más.</p><div>'+saldoClientes.map(e=>'<article style="border:1px solid #cbd5e1;border-radius:10px;padding:12px;margin:10px 0"><h4>'+esc(e.nombre)+'</h4>'+fila('Mercadería entregada',e.entregado)+fila('Dinero registrado como cobrado',e.pagos)+fila('Cuenta corriente registrada',e.cuenta)+fila('Falta cobrar o registrar',e.saldo)+'<button type="button" data-revisar-cobro="'+esc(e.reparto)+'" data-cliente="'+esc(e.codigo)+'">Revisar cobro de este cliente</button></article>').join('')+'</div><p><strong>Total por aclarar: '+esc(formatoDinero(pendiente/100))+'</strong></p><p>Por aclarar = mercadería entregada − dinero cobrado registrado − cuenta corriente. No incluye pedidos pendientes de entrega ni el importe rechazado.</p></section>':(entregas.length?'<p>Las entregas registradas tienen sus importes cubiertos por pagos o cuenta corriente.</p>':'<p>Aún no hay entregas liquidadas para los despachos de hoy.</p>'))+(Object.keys(detalles).length?'<details><summary>Detalle por medio de pago</summary>'+Object.entries(detalles).sort((a,b)=>a[0].localeCompare(b[0])).map(([n,v])=>fila(n,v)).join('')+'</details>':'<p>Aún no hay cobranzas registradas.</p>');
  caja.querySelectorAll('[data-revisar-cobro]').forEach(b=>b.onclick=run(async()=>{const cliente=stops.find(p=>String(p.reparto_id)===b.dataset.revisarCobro&&String(p.codigo_cliente)===b.dataset.cliente);if(!cliente)throw Error('No se encontró el cliente en los repartos de hoy. Revisá con oficina.');await resultado(cliente);}));
  }catch(e){caja.textContent='No se pudo consultar la cobranza: '+e.message;}
 };
 const mostrarCierre=async()=>{
  const caja=$('#mi-cobranza-cierre');if(!caja)return;
  try{
   const cierre=await api('/rendicion/cierre-caja?fecha='+encodeURIComponent(fecha));
   if(cierre){caja.innerHTML='<p><strong>Caja cerrada</strong> · '+esc(new Date(cierre.cerrado_en).toLocaleString('es-AR'))+'</p><p>Efectivo sistema: '+esc(formatoDinero(cierre.efectivo_sistema))+' · Declarado: '+esc(formatoDinero(cierre.efectivo_declarado))+'</p><p><strong>Diferencia: '+esc(formatoDinero(cierre.diferencia))+'</strong></p><p>'+esc(cierre.observacion||'Sin observaciones')+'</p>';return;}
   caja.innerHTML='<form id="form-cierre-caja"><label>Efectivo contado ($)<input name="efectivo_declarado" type="number" min="0" step="0.01" required placeholder="Ingresar efectivo real"></label><label>Observación (si hay diferencia)<textarea name="observacion" maxlength="1000"></textarea></label><button type="submit">Confirmar cierre de caja</button></form>';
   $('#form-cierre-caja').onsubmit=e=>{e.preventDefault();run(async()=>{
    const f=Object.fromEntries(new FormData(e.target)),importe=Number(f.efectivo_declarado);
    if(!Number.isFinite(importe)||importe<0)throw Error('Ingresá el efectivo contado.');
    if(!confirm('¿Confirmás el cierre de caja de hoy? No se podrá editar desde la APK.'))return;
    await api('/rendicion/cierre-caja',{method:'POST',body:JSON.stringify({fecha,efectivo_declarado:importe,observacion:f.observacion||''})});
    await mostrarCierre();await mostrarCobranza();mensaje('Cierre de caja registrado.');
   })();};
  }catch(e){caja.textContent='No se pudo consultar el cierre: '+e.message;}
 };
 $('#mi-cobranza-toggle').onclick=()=>{const d=$('#mi-cobranza-detalle');d.hidden=!d.hidden;if(!d.hidden){mostrarCobranza();mostrarCierre();}};
 $('#mi-cobranza-actualizar').onclick=mostrarCobranza;
 agregarVista.html=`<div class="conductor-resumen"><div><strong>${stops.length}</strong><span>Clientes</span></div><div><strong>${entregados}</strong><span>Entregados</span></div><div><strong>${visitadosSinEntrega}</strong><span>No entregados / visitados</span></div><div><strong>${stops.length-entregados-visitadosSinEntrega}</strong><span>Pendientes</span></div></div><div class="conductor-controles"><button id="gpsin">Iniciar recorrido</button><button id="navproximo" type="button">Navegar al próximo</button><button id="sugerir-ruta" type="button">Sugerir ruta</button><button id="gpsout">Detener recorrido</button><p id="gpsestado" aria-live="polite">GPS: sin iniciar</p></div>`;

 agregarVista.html='<div class="conductor-entregas" id="ruta-sugerida" hidden></div>';
 $('#sugerir-ruta').onclick=()=>mostrarSugerencia(false);
 temporizadorRuta=setInterval(()=>{if(!$('#mapa-conductor')){clearInterval(temporizadorRuta);return;}if(document.visibilityState==='visible'&&ultimaRuta)mostrarSugerencia(true);},300000);
 // Mapa del reparto: puntos con coordenadas y traza GPS de esta sesión.
 agregarVista.html=`<div class="conductor-mapa" id="panel-mapa-conductor"><div class="conductor-mapa-acciones"><button type="button" id="modo-recorrido">Iniciar recorrido</button><button type="button" id="ampliar-mapa">Ampliar mapa</button><button type="button" id="centrar-mapa">Mi ubicación</button><button type="button" id="salir-mapa" hidden>Salir de pantalla completa</button></div><div class="conductor-despachos">${despachos.map((d,i)=>'<span><i style="background:'+coloresDespacho[i%coloresDespacho.length]+'"></i>Despacho '+esc(d)+'</span>').join('')}</div><label class="conductor-elegir-despacho">Despacho a rutear <select id="despacho-a-rutear">${despachos.map(d=>`<option value="${esc(d)}">${esc(d)} · ${stops.filter(p=>String(p.despacho??'Sin despacho')===d).length} clientes</option>`).join('')}</select></label><div id="mapa-conductor"></div><div class="conductor-siguiente" id="conductor-siguiente"><strong>Calculá la ruta para comenzar</strong><button type="button" id="registrar-siguiente" hidden>Registrar entrega</button><button type="button" id="navegar-siguiente" hidden>Navegación guiada</button></div><p id="mapa-aviso" class="muted"></p></div>`;
 let mapaConductor=null,marcadorGps=null,trazaGps=null;
 const puntos=[],clientesSinGps=[];
 if(window.L){
   mapaConductor=L.map('mapa-conductor').setView([-34.65,-58.8],11);
   L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{attribution:'© OpenStreetMap contributors',maxZoom:19}).addTo(mapaConductor);
   const clientesVistos=new Set();
   stops.forEach((p,i)=>{
     if(!enDespacho(p))return;
     const k=p.reparto_id+'|'+p.codigo_cliente;
     if(clientesVistos.has(k))return;clientesVistos.add(k);
     const lat=Number(p.latitud),lng=Number(p.longitud);
     if(p.latitud==null||p.longitud==null||!Number.isFinite(lat)||!Number.isFinite(lng)||Math.abs(lat)>90||Math.abs(lng)>180){clientesSinGps.push(p);return;}
     const estado=estadoCliente(p);
     const color=['ENTREGADO','PARCIAL'].includes(estado)?'#16a34a':estado!=='PENDIENTE'?'#9333ea':colorDespacho(p);
     const icon=L.divIcon({className:'',html:'<div class="conductor-pin" style="background:'+color+'">'+(i+1)+'</div>',iconSize:[30,30],iconAnchor:[15,15]});
     L.marker([lat,lng],{icon}).addTo(mapaConductor).bindPopup('<strong>Parada '+(i+1)+' · Cliente '+esc(p.codigo_cliente)+' · '+esc(p.nombre_cliente)+'</strong><p>Despacho '+esc(p.despacho)+'</p><button type="button" class="abrir-entrega" data-stop="'+i+'">Registrar entrega</button><button type="button" class="navegar-entrega" data-nav="'+i+'">Navegar con Maps</button>');
     puntos.push([lat,lng]);
   });
   if(puntos.length)mapaConductor.fitBounds(puntos,{padding:[24,24],maxZoom:15});
   trazaGps=L.polyline([],{color:'#16753c',weight:4}).addTo(mapaConductor);
   setTimeout(()=>mapaConductor.invalidateSize(),200);
 }else $('#mapa-aviso').textContent='No se pudo cargar el mapa. Revisá la conexión a Internet.';
 if(window.L)$('#mapa-aviso').textContent=puntos.length+' puntos ubicados · '+clientesSinGps.length+' clientes sin coordenadas. La línea verde muestra solo el GPS registrado en esta sesión; no es una ruta de navegación.';
 $('#navproximo').onclick=()=>{const siguiente=proximoPendiente();if(siguiente)abrirMaps(siguiente);else mensaje('No hay entregas pendientes con coordenadas válidas.');};
 const selectorDespacho=$('#despacho-a-rutear');
 selectorDespacho.onchange=()=>{despachoActivo=selectorDespacho.value;ordenSugerido=[];ultimaRuta=null;marcadoresGoogle.forEach(m=>m.setMap(null));lineasGoogle.forEach(l=>l.setMap(null));marcadoresGoogle=[];lineasGoogle=[];if(mapaGoogle){const bounds=new google.maps.LatLngBounds();let cantidad=0;stops.filter(p=>enDespacho(p)&&coordValida(p)).forEach((p,i)=>{const position={lat:Number(p.latitud),lng:Number(p.longitud)};bounds.extend(position);cantidad++;const marker=new google.maps.Marker({map:mapaGoogle,position,label:{text:String(i+1),color:'#fff'},title:'Cliente '+p.codigo_cliente+' · Despacho '+p.despacho,icon:{path:google.maps.SymbolPath.CIRCLE,scale:16,fillColor:colorDespacho(p),fillOpacity:1,strokeColor:'#fff',strokeWeight:2}});marcadoresGoogle.push(marker);});if(cantidad)mapaGoogle.fitBounds(bounds);}else if(mapaConductor){mapaConductor.eachLayer(l=>{if(l instanceof L.Marker)mapaConductor.removeLayer(l);});const bounds=[];stops.filter(p=>enDespacho(p)&&coordValida(p)).forEach((p,i)=>{const lat=Number(p.latitud),lng=Number(p.longitud);bounds.push([lat,lng]);L.marker([lat,lng],{icon:L.divIcon({className:'',html:'<div class="conductor-pin" style="background:'+colorDespacho(p)+'">'+(i+1)+'</div>',iconSize:[30,30],iconAnchor:[15,15]})}).addTo(mapaConductor).bindPopup('Cliente '+esc(p.codigo_cliente)+' · Despacho '+esc(p.despacho));});if(bounds.length)mapaConductor.fitBounds(bounds,{padding:[24,24],maxZoom:15});}const caja=$('#ruta-sugerida');caja.hidden=false;caja.innerHTML='<strong>Despacho '+esc(despachoActivo)+' seleccionado.</strong><p>Presioná Sugerir ruta para calcular exclusivamente este viaje.</p>';$('#mapa-aviso').textContent='Mostrando únicamente el despacho '+despachoActivo;actualizarSiguiente();};
 const proximoPendiente=()=>ordenSugerido.find(p=>enDespacho(p)&&!atendido(p))||(ultimaRuta?null:stops.find(p=>enDespacho(p)&&coordValida(p)&&!atendido(p)));
 const actualizarSiguiente=()=>{const p=proximoPendiente(),caja=$('#conductor-siguiente');if(!caja)return;caja.querySelector('strong').textContent=p?'Próxima entrega: Cliente '+p.codigo_cliente+' · Despacho '+p.despacho+' · '+p.nombre_cliente:'Sin entregas pendientes con GPS';$('#registrar-siguiente').hidden=!p;$('#navegar-siguiente').hidden=!p;};
 const enfocarConduccion=()=>{const p=proximoPendiente();if(mapaGoogle){const actual=ultimaUbicacion&&{lat:Number(ultimaUbicacion.latitud),lng:Number(ultimaUbicacion.longitud)};if(actual){mapaGoogle.panTo(actual);mapaGoogle.setZoom(16);}else if(p){mapaGoogle.panTo({lat:Number(p.latitud),lng:Number(p.longitud)});mapaGoogle.setZoom(15);}}else if(mapaConductor){if(ultimaUbicacion)mapaConductor.setView([Number(ultimaUbicacion.latitud),Number(ultimaUbicacion.longitud)],16);else if(p)mapaConductor.setView([Number(p.latitud),Number(p.longitud)],15);}};
 const ajustarVistaMapa=()=>{if(mapaGoogle)google.maps.event.trigger(mapaGoogle,'resize');else if(mapaConductor)mapaConductor.invalidateSize();if(document.body.classList.contains('sec-mapa-expandido')&&$('#modo-recorrido')?.disabled)enfocarConduccion();};
 $('#modo-recorrido').onclick=()=>{if(!ultimaRuta){mostrarSugerencia(false).then(()=>{if(ultimaRuta)$('#modo-recorrido').click();});return;}$('#gpsin').click();document.body.classList.add('sec-mapa-expandido');$('#modo-recorrido').textContent='Recorrido activo';$('#modo-recorrido').disabled=true;$('#salir-mapa').hidden=false;$('#ampliar-mapa').textContent='Reducir mapa';actualizarSiguiente();setTimeout(ajustarVistaMapa,150);};
 $('#ampliar-mapa').onclick=()=>{const activo=document.body.classList.toggle('sec-mapa-expandido');$('#salir-mapa').hidden=!activo;$('#ampliar-mapa').textContent=activo?'Reducir mapa':'Ampliar mapa';setTimeout(ajustarVistaMapa,150);};
 $('#salir-mapa').onclick=()=>$('#ampliar-mapa').click();
 $('#centrar-mapa').onclick=()=>{if(!ultimaUbicacion){mensaje('Esperando ubicación GPS.');return;}if(mapaGoogle){mapaGoogle.panTo({lat:Number(ultimaUbicacion.latitud),lng:Number(ultimaUbicacion.longitud)});mapaGoogle.setZoom(16);}else if(mapaConductor)mapaConductor.setView([ultimaUbicacion.latitud,ultimaUbicacion.longitud],16);};
 $('#registrar-siguiente').onclick=()=>{const p=proximoPendiente();if(p){const i=stops.findIndex(x=>x.reparto_id===p.reparto_id&&x.codigo_cliente===p.codigo_cliente);if(i>=0)abrirEntrega(i);}};
 $('#navegar-siguiente').onclick=()=>{const p=proximoPendiente();if(p)abrirMaps(p);};
 const actualizarMapaGps=(lat,lng)=>{ultimaUbicacion={latitud:lat,longitud:lng};if(mapaGoogle&&gpsGoogle)gpsGoogle.setPosition({lat,lng});
   if(!mapaConductor)return;
   if(!marcadorGps){marcadorGps=L.circleMarker([lat,lng],{radius:9,color:'#0754a5',fillColor:'#3b82f6',fillOpacity:1}).addTo(mapaConductor).bindPopup('Mi ubicación actual');}
   else marcadorGps.setLatLng([lat,lng]);
   trazaGps.addLatLng([lat,lng]);
 };
 $('#gpsin').onclick=()=>{if(gpsWatch!==null)return;if(window.SECAndroid&&!sessionStorage.getItem('sec-dist-apk-gps')){run(async()=>{const d=await api('/gps-apk/iniciar',{method:'POST'});localStorage.setItem('vendedorId',d.clave);sessionStorage.setItem('sec-dist-apk-gps','1');location.reload();})();return;}if(!navigator.geolocation){mensaje('El dispositivo no dispone de ubicación.');return;}gpsWatch=navigator.geolocation.watchPosition(pos=>{api('/gps',{method:'POST',body:JSON.stringify({conductor_id:usuario.id,latitud:pos.coords.latitude,longitud:pos.coords.longitude,precision_metros:pos.coords.accuracy,velocidad:pos.coords.speed,fecha_local:new Date(pos.timestamp).toISOString()})}).then(()=>{actualizarMapaGps(pos.coords.latitude,pos.coords.longitude);$('#gpsestado')&&($('#gpsestado').textContent='Último punto enviado: '+new Date(pos.timestamp).toLocaleTimeString());}).catch(e=>mensaje('GPS: '+e.message));},e=>mensaje('Ubicación: '+e.message),{enableHighAccuracy:true,maximumAge:0,timeout:20000});};

 $('#gpsout').onclick=run(async()=>{detenerGps();await api('/gps-apk/detener',{method:'POST'});if(window.SECAndroid||usuario?.rol==='CONDUCTOR'){sessionStorage.removeItem('sec-dist-apk-gps');localStorage.removeItem('vendedorId');location.href='salida/login-vendedor.html';}});

 if(window.SECAndroid&&sessionStorage.getItem('sec-dist-apk-gps'))$('#gpsin').onclick();

 agregarVista.html=`<div class="conductor-entregas"><h3>Mis entregas de hoy</h3>${stops.map((p,i)=>({p,i})).sort((a,b)=>Number(atendido(a.p))-Number(atendido(b.p))).map(({p,i})=>{const v=vs.find(v=>v.reparto_id===p.reparto_id&&v.codigo_cliente===p.codigo_cliente),estado=estadoCliente(p),color=['ENTREGADO','PARCIAL'].includes(estado)?'#16a34a':estado!=='PENDIENTE'?'#9333ea':'transparent';return `<div class="conductor-cliente" style="border-left:6px solid ${color};background:${color==='#9333ea'?'#f3e8ff':color==='#16a34a'?'#f0fdf4':'transparent'}"><div><strong><span class="conductor-punto-despacho" style="background:${colorDespacho(p)}"></span>Cliente ${esc(p.codigo_cliente+' · '+p.nombre_cliente)}</strong><small>Despacho ${esc(p.despacho)} · ${esc(estado==='NO_ENTREGADO'?'NO ENTREGADO':estado==='VISITADO'?'VISITADO':estado==='RECHAZADO'?'RECHAZADO':estado==='PARCIAL'?'ENTREGA PARCIAL':estado==='ENTREGADO'?'ENTREGADO':'Pendiente')}</small>${marcaAyudanteSEC(rendiciones,p)?'<span style="display:block;color:#075985;font-weight:700">✓ Cobrado por el ayudante</span>':''}</div><div class="conductor-acciones"><button data-stop="${i}">Registrar</button><button data-nav="${i}" class="btn-maps">Navegar</button></div></div>`;}).join('')}</div>`;
 const abrirEntrega=i=>run(()=>resultado(stops[i]))();
 document.querySelectorAll('[data-stop]').forEach(b=>b.onclick=()=>abrirEntrega(+b.dataset.stop));
 document.querySelectorAll('[data-nav]').forEach(b=>b.onclick=()=>abrirMaps(stops[+b.dataset.nav]));
 if(mapaConductor)mapaConductor.on('popupopen',e=>{const btn=e.popup.getElement()?.querySelector('.abrir-entrega');if(btn)btn.onclick=()=>abrirEntrega(+btn.dataset.stop);const nav=e.popup.getElement()?.querySelector('.navegar-entrega');if(nav)nav.onclick=()=>abrirMaps(stops[+nav.dataset.nav]);});

}

function detenerGps(){if(gpsWatch!==null)navigator.geolocation.clearWatch(gpsWatch);gpsWatch=null;if($('#gpsestado'))$('#gpsestado').textContent='Recorrido detenido.';}

async function resultado(p){
 const [motivos,medios,pedidosCliente,rendiciones,cobrosPrevios]=await Promise.all([
  api('/rendicion/catalogos/motivos'),
  api('/rendicion/catalogos/medios'),
  api('/pedidos?fecha='+encodeURIComponent(fechaHoy())),
  api('/rendicion/entregas?fecha='+encodeURIComponent(fechaHoy())),
  api('/rendicion/cobros?fecha='+encodeURIComponent(fechaHoy()))
 ]);
 const totalCentavos=pedidosCliente.filter(x=>String(x.reparto_id)===String(p.reparto_id)&&String(x.codigo_cliente)===String(p.codigo_cliente)).reduce((sum,x)=>{const c=importeEnCentavosSEC(x.importe);if(c===null)throw Error('Un pedido tiene un importe original inválido. Revisar con oficina.');return sum+c;},0);if(!Number.isSafeInteger(totalCentavos))throw Error('Importe original fuera de rango');const total=totalCentavos/100;
 const previa=rendiciones.find(x=>String(x.reparto_id)===String(p.reparto_id)&&String(x.codigo_cliente)===String(p.codigo_cliente));
 const pagosPrevios=previa?cobrosPrevios.filter(x=>String(x.rendicion_entrega_id)===String(previa.id)):[];
 const opciones=motivos.filter(x=>x.activo).map(x=>'<option value="'+esc(x.id)+'">'+esc(x.nombre)+'</option>').join('');
 const opcionesMedios=medios.filter(x=>x.activo).map(x=>'<option value="'+esc(x.id)+'">'+esc(x.nombre)+'</option>').join('');
 document.body.classList.add('sec-resultado-activo');
 $('#vista').innerHTML=`<h2 id="resultado-titulo" style="scroll-margin-top:max(48px,env(safe-area-inset-top,0px))">${esc(p.codigo_cliente+' · '+p.nombre_cliente)}</h2><div class="panel resultado-panel"><form id="resultado"><label>Resultado<select name="estado"><option value="ENTREGADO">ENTREGADO</option><option value="RECHAZADO">RECHAZADO</option><option value="PARCIAL">ENTREGA PARCIAL / DESCUENTO DE PRODUCTOS</option><option value="VISITADO">VISITADO</option></select></label><div id="resultado-motivo" hidden><label>Motivo de rechazo<select name="motivo_rechazo_id"><option value="">Seleccionar motivo</option>${opciones}</select></label><label id="resultado-parcial" hidden>Importe final de la mercadería, después de quitar productos ($)<input name="importe_entregado" type="number" min="0.01" step="0.01" max="${esc(total)}" value="${esc(total.toFixed(2))}"></label><p id="resultado-explicacion-parcial" hidden></p><p>Importe original del cliente: ${Number(total).toLocaleString('es-AR',{style:'currency',currency:'ARS'})}</p></div><div id="resultado-cobranza" hidden><h3>Cobranza</h3><p>Distribuí el importe final entre efectivo, QR, cuenta corriente u otros medios. Podés combinar varias formas de pago. Si descontaste productos, usá Entrega parcial / descuento de productos e indicá el importe final.</p><label style="display:flex;align-items:center;gap:10px;padding:12px;background:#eff6ff;border-radius:8px"><input name="cobrado_por_ayudante" type="checkbox" style="width:24px;height:24px;margin:0"> Cobrado por el ayudante</label><p class="muted">Marcá esta casilla si quien cobró a este cliente fue tu ayudante. El importe sigue incluido en tu rendición.</p><div id="resultado-pagos"></div><button id="resultado-agregar-pago" type="button">+ Agregar forma de pago</button><p id="resultado-total-cobrado"></p><div id="resultado-usar-liquidado" hidden><button id="resultado-aplicar-liquidado" type="button">Usar total liquidado como importe final</button><p class="muted">Usá este botón sólo si la diferencia corresponde a mercadería descontada. Incluye los pagos y la cuenta corriente cargados.</p></div></div><label>Observación<textarea name="observacion" maxlength="3000"></textarea></label><div><strong>Foto de la entrega (opcional)</strong><div class="acciones"><button id="tomar-foto-entrega" type="button">📷 Sacar foto</button><button id="biblioteca-entrega" type="button">🖼️ Biblioteca</button><input id="foto-biblioteca" type="file" accept="image/*" hidden></div><p id="foto-elegida" class="muted" role="status">Sin foto seleccionada</p><div id="foto-entrega-previa"></div></div><div class="resultado-acciones"><button type="submit" class="resultado-guardar">Guardar</button></div></form></div>`;
 const importeObjetivo=()=>$('#resultado [name=estado]').value==='PARCIAL'?Number($('#resultado [name=importe_entregado]').value||0):total;
 const cent=n=>Math.round(Number(n||0)*100);
 const totalPagos=()=>[...document.querySelectorAll('.pago-importe')].reduce((n,x)=>n+(centavosCobranzaSEC(x.value)||0),0);
 const agregarPago=(medio='',importe='',referencia='')=>{
  const fila=document.createElement('div');fila.className='panel';fila.style.margin='8px 0';
  fila.innerHTML='<label>Forma de pago<select class="pago-medio"><option value="">Seleccionar forma de pago</option>'+opcionesMedios+'</select></label><label>Importe cobrado ($)<input class="pago-importe" type="text" inputmode="decimal" autocomplete="off" placeholder="0,00"></label><label>Referencia (opcional)<input class="pago-referencia" maxlength="150"></label><button type="button" class="pago-quitar">Quitar</button>';
  $('#resultado-pagos').appendChild(fila);fila.querySelector('.pago-medio').value=String(medio);fila.querySelector('.pago-importe').value=String(importe);fila.querySelector('.pago-referencia').value=referencia;
  fila.querySelector('.pago-quitar').onclick=()=>{fila.remove();resumirCobro();};
  fila.querySelector('.pago-importe').oninput=()=>{fila.querySelector('.pago-importe').dataset.editado='1';fila.querySelector('.pago-importe').removeAttribute('aria-invalid');resumirCobro();};fila.querySelector('.pago-medio').onchange=()=>fila.querySelector('.pago-medio').removeAttribute('aria-invalid');resumirCobro();
 };
 const resumirCobro=()=>{const suma=totalPagos()/100,saldo=(cent(importeObjetivo())-totalPagos())/100;const destino=$('#resultado-total-cobrado');if(destino)destino.textContent='Total liquidado: '+suma.toLocaleString('es-AR',{style:'currency',currency:'ARS'})+' · '+(saldo<0?'Excede en: ':'Saldo pendiente: ')+Math.abs(saldo).toLocaleString('es-AR',{style:'currency',currency:'ARS'});const parcial=$('#resultado [name=estado]').value==='PARCIAL',detalle=$('#resultado-explicacion-parcial'),usar=$('#resultado-usar-liquidado'),boton=$('#resultado-aplicar-liquidado');detalle.hidden=!parcial;usar.hidden=!parcial;if(parcial){const descuento=cent(total)-cent(importeObjetivo());detalle.textContent=descuento>0?'Mercadería descontada: '+(descuento/100).toLocaleString('es-AR',{style:'currency',currency:'ARS'}):'El importe final todavía es igual al pedido original. Indicá cuánto vale la mercadería que el cliente acepta, después de quitar los productos.';}boton.disabled=!(totalPagos()>0&&totalPagos()<cent(total));boton.textContent='Usar total liquidado '+suma.toLocaleString('es-AR',{style:'currency',currency:'ARS'})+' como importe final';};
 $('#resultado-agregar-pago').onclick=()=>{if(document.querySelectorAll('#resultado-pagos .panel').length>=8){mensaje('Máximo ocho medios por entrega.');return;}agregarPago('',(Math.max(0,cent(importeObjetivo())-totalPagos())/100).toFixed(2));};
 if(pagosPrevios.length)pagosPrevios.forEach(x=>agregarPago(x.medio_cobranza_id,x.importe,x.referencia||''));
 else agregarPago('',total>0?total.toFixed(2):'');
 if(previa){$('#resultado [name=estado]').value=previa.estado;$('#resultado [name=motivo_rechazo_id]').value=String(previa.motivo_rechazo_id||'');$('#resultado [name=importe_entregado]').value=previa.importe_entregado;$('#resultado [name=observacion]').value=previa.observacion||'';$('#resultado [name=cobrado_por_ayudante]').checked=previa.cobrado_por_ayudante===true;}
 const actualizar=()=>{const estado=$('#resultado [name=estado]').value,requiere=estado==='RECHAZADO'||estado==='PARCIAL';$('#resultado-motivo').hidden=!requiere;$('#resultado-cobranza').hidden=estado==='VISITADO'||estado==='RECHAZADO';$('#resultado-parcial').hidden=estado!=='PARCIAL';if(estado==='RECHAZADO'||estado==='VISITADO')$('#resultado [name=cobrado_por_ayudante]').checked=false;$('#resultado [name=motivo_rechazo_id]').required=requiere;$('#resultado [name=importe_entregado]').required=estado==='PARCIAL';};
 $('#resultado [name=estado]').onchange=()=>{actualizar();const pagos=[...document.querySelectorAll('.pago-importe')];if(!previa&&pagos.length===1&&!pagos[0].dataset.editado)pagos[0].value=importeObjetivo().toFixed(2);resumirCobro();};
 $('#resultado [name=importe_entregado]').oninput=()=>{const pagos=[...document.querySelectorAll('.pago-importe')];if(!previa&&pagos.length===1&&!pagos[0].dataset.editado)pagos[0].value=importeObjetivo().toFixed(2);resumirCobro();};actualizar();resumirCobro();
 $('#resultado-aplicar-liquidado').onclick=run(()=>{const pagos=leerCobrosSEC([...document.querySelectorAll('#resultado-pagos .panel')]),suma=pagos.reduce((n,x)=>n+importeEnCentavosSEC(x.importe),0);if(!(suma>0&&suma<cent(total)))throw Error('El total liquidado debe ser mayor a cero y menor al importe original para descontar mercadería.');const campo=$('#resultado [name=importe_entregado]');campo.value=(suma/100).toFixed(2);campo.removeAttribute('aria-invalid');resumirCobro();campo.scrollIntoView({block:'center',behavior:'smooth'});campo.focus({preventScroll:true});mensaje('Importe final actualizado. Revisá la mercadería descontada y guardá cuando sea correcto.');});
 let fotoEntrega=null,fotoVistaUrl=null;
 const mostrarFotoEntrega=foto=>{fotoEntrega=foto;if(fotoVistaUrl)URL.revokeObjectURL(fotoVistaUrl);fotoVistaUrl=URL.createObjectURL(foto);const img=document.createElement('img');img.src=fotoVistaUrl;img.alt='Foto que se adjuntará a esta entrega';img.style.cssText='display:block;max-width:100%;max-height:280px;object-fit:contain';$('#foto-entrega-previa').replaceChildren(img);$('#foto-elegida').textContent='Foto lista. Se enviará a SEC al presionar Guardar.';const observador=new MutationObserver(()=>{if(!img.isConnected){URL.revokeObjectURL(img.src);observador.disconnect();}});observador.observe(document.body,{childList:true,subtree:true});};
 $('#resultado').onsubmit=e=>{e.preventDefault();run(async()=>{
  const form=Object.fromEntries(new FormData(e.target)),file=fotoEntrega;
  if(file&&file.size>5*1024*1024)throw Error('La foto supera 5 MB');
  const estado=form.estado;
  if(estado!=='VISITADO'){
   if(!Number.isFinite(total)||total<=0)throw Error('No se puede rendir sin importe original válido');
   const importe=estado==='RECHAZADO'?0:estado==='ENTREGADO'?total:Number(form.importe_entregado);
   if(estado==='PARCIAL'&&!(importe>0&&importe<total)){const campo=$('#resultado [name=importe_entregado]');campo.setAttribute('aria-invalid','true');campo.scrollIntoView({block:'center'});campo.focus({preventScroll:true});throw Error('Falta descontar la mercadería del importe final. Debe ser mayor a cero y menor al pedido original de '+total.toLocaleString('es-AR',{style:'currency',currency:'ARS'})+'. Cargar un pago menor no cambia el valor de la mercadería. Podés usar el botón Usar total liquidado como importe final.');}
   const pagos=estado==='RECHAZADO'?[]:leerCobrosSEC([...document.querySelectorAll('#resultado-pagos .panel')]);
   const suma=pagos.reduce((n,x)=>n+importeEnCentavosSEC(x.importe),0);
   const cobradoPorAyudante=$('#resultado [name=cobrado_por_ayudante]').checked;if(cobradoPorAyudante&&!pagos.some(p=>{const medio=medios.find(m=>String(m.id)===String(p.medio_cobranza_id));return medio&&clasificarMedioCobranzaSEC(medio)!=='cuenta';}))throw Error('Para marcar Cobrado por el ayudante, registrá un pago recibido. Cuenta corriente no es dinero cobrado.');
   if(!Number.isSafeInteger(suma)||suma>Math.round(importe*100))throw Error('Los cobros superan el importe entregado.');
   if(previa&&!confirm('Esta entrega ya tiene una rendición guardada. Al continuar se reemplazarán sus cobros anteriores. ¿Confirmás la corrección?'))return;
   await api('/rendicion/entregas',{method:'POST',body:JSON.stringify({reparto_id:p.reparto_id,codigo_cliente:p.codigo_cliente,estado,importe_entregado:importe,motivo_rechazo_id:estado==='ENTREGADO'?null:form.motivo_rechazo_id,cobros:pagos,cobrado_por_ayudante:cobradoPorAyudante,observacion:form.observacion})});
  }
  const visitaEstado=estado==='RECHAZADO'||estado==='PARCIAL'?'INCIDENCIA':estado;
  const v=await api('/visitas',{method:'POST',body:JSON.stringify({estado:visitaEstado,observacion:form.observacion,reparto_id:p.reparto_id,codigo_cliente:p.codigo_cliente})});
  if(file){const f=new FormData();f.append('archivo',file);$('#foto-elegida').textContent='Enviando foto a SEC…';try{await api('/visitas/'+v.id+'/foto',{method:'POST',body:f});}catch(err){const aviso=$('#foto-elegida');aviso.textContent='La entrega se guardó, pero la foto NO se pudo enviar: '+err.message+'. Conservá esta pantalla y volvé a presionar Guardar para reintentar.';aviso.setAttribute('role','alert');aviso.scrollIntoView({block:'center'});throw Error(aviso.textContent);}}
  await abrir('App Conductor');mensaje(file?'Entrega y foto guardadas en SEC. La foto se consulta en Fotos del recorrido o en la visita.':'Resultado guardado.');
 })();};
 $('#tomar-foto-entrega').onclick=async()=>{const boton=$('#tomar-foto-entrega');boton.disabled=true;try{const foto=await tomarFotoEntregaSEC($('#resultado'));if(foto&&$('#resultado')){mostrarFotoEntrega(foto);$('#foto-biblioteca').value='';}}finally{boton.disabled=false;}};
 $('#biblioteca-entrega').onclick=()=>$('#foto-biblioteca').click();
 $('#foto-biblioteca').onchange=()=>{const foto=$('#foto-biblioteca').files[0];if(foto){mostrarFotoEntrega(foto);}};
 requestAnimationFrame(()=>document.getElementById('resultado-titulo')?.scrollIntoView({block:'start',behavior:'instant'}));
}

async function dashboardConductores(){await dashboardSeguimientoSEC();}

async function recorridos(){

 const cs=usuario?.rol==='CONDUCTOR'?[]:await api('/conductores');agregarVista.html=`<div class="panel"><label>Fecha<input id="recfecha" type="date" value="${fechaHoy()}"></label>${cs.length?`<label>Conductor<select id="recconductor">${cs.map(c=>`<option value="${esc(c.id)}">${esc(c.nombre+' '+c.apellido)}</option>`).join('')}</select></label>`:''}<button id="cargarrec">Ver recorrido</button><p id="recinfo"></p><div id="mapa"></div><div class="acciones"><button id="replayplay" type="button">▶ Reproducir</button><button id="replaypause" type="button">⏸ Pausar</button><label>Velocidad <select id="replayspeed"><option value="1">1×</option><option value="5">5×</option><option value="15">15×</option><option value="30">30×</option><option value="60">60×</option><option value="120">120×</option></select></label></div><label>Recrear posición<input id="replay" type="range" min="0" max="0" value="0"></label><p id="hora"></p><div id="recclientes"></div><div id="visitaslista"></div></div>`;

 let replayTimer=null;const pararReplay=()=>{if(replayTimer){clearInterval(replayTimer);replayTimer=null;}};
 $('#cargarrec').onclick=run(async()=>{pararReplay();const f=$('#recfecha').value;if(!f)throw Error('Seleccionar fecha');const id=$('#recconductor')?.value;const puntos=await api('/gps?fecha='+f+(id?'&preferir_cusat=1&conductor_id='+encodeURIComponent(id):''));const [visitasDia,repartos,pedidos,cusat]=await Promise.all([
  api('/visitas?fecha='+f),
  id?api('/repartos?fecha='+f):[],
  id?api('/pedidos?fecha='+f):[],
  id?api('/seguimiento/cusat?fecha='+f).catch(()=>({pasos:[]})):{pasos:[]}
 ]);
 const visitas=id?visitasDia.filter(v=>String(v.conductor_id)===id):visitasDia;
 const repartosDelConductor=new Set(repartos.filter(r=>String(r.conductor_id)===id).map(r=>String(r.id)));
 const clave=p=>p.reparto_id+'|'+p.codigo_cliente;
 const clientes=new Map();
 for(const p of pedidos){
  if(!repartosDelConductor.has(String(p.reparto_id)))continue;
  const k=clave(p);
  if(!clientes.has(k))clientes.set(k,p);
 }
 const visitasPorCliente=new Map(visitas.map(v=>[clave(v),v]));
 const pasosPorCliente=new Map(cusat.pasos.map(p=>[clave(p),p]));
 const estadoCliente=(k)=>{
  const visita=visitasPorCliente.get(k),paso=pasosPorCliente.get(k);
  return visita?'Visita registrada · '+visita.estado:paso?'Paso GPS · Cusat':'Sin paso registrado';
 };
 const tieneCoordenadas=p=>p.latitud!=null&&p.longitud!=null&&Number.isFinite(Number(p.latitud))&&Number.isFinite(Number(p.longitud));
 $('#recclientes').innerHTML=id?'<h3>Clientes planificados ('+clientes.size+')</h3>'+tabla(
  ['Despacho','Cliente','Paso / visita'],
  Array.from(clientes,([k,p])=>[esc(p.despacho),esc(p.codigo_cliente+' · '+p.nombre_cliente),esc(estadoCliente(k)+(tieneCoordenadas(p)?'':' · Sin coordenadas'))])
 ):'';
 $('#visitaslista').innerHTML=tabla(['Cliente','Resultado','Llegada','Permanencia registrada','Fotos'],visitas.map(v=>[esc(v.codigo_cliente+' · '+v.nombre_cliente),esc(v.estado),esc(new Date(v.llegada).toLocaleString('es-AR')),esc(Math.round(Number(v.permanencia_segundos)/60)+' min'),`<button data-fotos="${esc(v.id)}">Ver fotos</button>`]));document.querySelectorAll('[data-fotos]').forEach(b=>b.onclick=run(async()=>{const fotos=await api('/visitas/'+b.dataset.fotos+'/fotos'),visita=visitas.find(v=>String(v.id)===b.dataset.fotos),conductor=cs.find(c=>String(c.id)===String(visita?.conductor_id))||usuario||{};const host=document.createElement('div');b.parentNode.appendChild(host);mostrarGaleriaFotosSEC(host,fotos.map(f=>({...f,tipo:'ENTREGA',codigo_cliente:visita?.codigo_cliente,nombre_cliente:visita?.nombre_cliente,nombre:conductor.nombre,apellido:conductor.apellido})));b.disabled=true;}));

 $('#recinfo').textContent=(puntos[0]?.origen==='CUSAT'?'Cusat · Camión '+(puntos[0].interno??'')+' · ':puntos.length?'GPS del celular · ':'')+puntos.length+' puntos registrados. Los saltos mayores a 5 minutos se muestran como tramos separados.';if(mapa)mapa.remove();if(!window.L)throw Error('No se pudo cargar el mapa');mapa=L.map('mapa').setView([-34.65,-58.8],12);L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{attribution:'© OpenStreetMap contributors',maxZoom:19}).addTo(mapa);const ubicacionesClientes=[];
 for(const [k,p] of clientes){
  if(!tieneCoordenadas(p))continue;
  const posicion=[Number(p.latitud),Number(p.longitud)];
  const registrado=visitasPorCliente.has(k)||pasosPorCliente.has(k);
  L.circleMarker(posicion,{radius:7,color:registrado?'#15803d':'#1d4ed8',fillOpacity:.85})
   .addTo(mapa).bindPopup('<strong>'+esc(p.codigo_cliente+' · '+p.nombre_cliente)+'</strong><br>Despacho '+esc(p.despacho)+'<br>'+esc(estadoCliente(k)));
  ubicacionesClientes.push(posicion);
 }
 const limites=puntos.map(p=>[Number(p.latitud),Number(p.longitud)]).concat(ubicacionesClientes);
 if(limites.length)mapa.fitBounds(limites,{maxZoom:16,padding:[20,20]});
 let tramo=[];for(let i=0;i<puntos.length;i++){if(i&&new Date(puntos[i].fecha)-new Date(puntos[i-1].fecha)>300000){L.polyline(tramo).addTo(mapa);tramo=[];}tramo.push([Number(puntos[i].latitud),Number(puntos[i].longitud)]);}if(tramo.length)L.polyline(tramo).addTo(mapa);if(puntos.length){const marker=L.marker([puntos[0].latitud,puntos[0].longitud]).addTo(mapa);$('#replay').max=puntos.length-1;$('#replay').value=0;$('#replay').oninput=()=>{const p=puntos[+$('#replay').value];marker.setLatLng([p.latitud,p.longitud]);$('#hora').textContent=new Date(p.fecha).toLocaleString('es-AR')+(p.precision_metros==null?'':' · precisión '+p.precision_metros+' m');};$('#replay').oninput();$('#replayplay').onclick=()=>{pararReplay();let ultimo=Date.now(),tiempoVirtual=new Date(puntos[+$('#replay').value].fecha).getTime();replayTimer=setInterval(()=>{if(!document.querySelector('#replay')||!document.querySelector('#replayplay')){pararReplay();return;}const ahora=Date.now();tiempoVirtual+=(ahora-ultimo)*Number($('#replayspeed').value);ultimo=ahora;let actual=+$('#replay').value;while(actual<puntos.length-1&&new Date(puntos[actual+1].fecha).getTime()<=tiempoVirtual)actual++;$('#replay').value=actual;$('#replay').oninput();if(actual>=puntos.length-1)pararReplay();},200);};$('#replaypause').onclick=pararReplay;}else{$('#replay').max=0;$('#replay').oninput=null;$('#replayplay').onclick=null;$('#hora').textContent='Sin puntos para esta fecha.';}

 });await $('#cargarrec').onclick();

}





async function abrirFotoMenu(origen){
 const anterior=$('#foto-menu-panel');if(anterior)anterior.remove();
 const panel=document.createElement('div');panel.id='foto-menu-panel';panel.className='panel';
 panel.innerHTML='<h3>Foto del recorrido</h3><p>El cliente se detecta por coordenadas. Si no se encuentra, usá Registrar cliente.</p><input id="foto-menu-archivo" hidden type="file" accept="image/jpeg,image/png,image/*" '+(origen==='camara'?'capture="environment"':'')+'><p id="foto-menu-estado" class="muted">Elegí una imagen.</p><label>Cliente de la foto <select id="foto-menu-cliente"><option value="">Seleccionar cliente</option></select></label><button id="foto-menu-registrar" type="button">Registrar cliente</button><button id="foto-menu-guardar" type="button" disabled>Guardar fotografía</button><button id="foto-menu-cerrar" type="button">Cancelar</button>';
 $('#vista').prepend(panel);const estado=panel.querySelector('#foto-menu-estado'),archivo=panel.querySelector('#foto-menu-archivo'),sel=panel.querySelector('#foto-menu-cliente'),guardar=panel.querySelector('#foto-menu-guardar');
 panel.querySelector('#foto-menu-cerrar').onclick=()=>panel.remove();
 let gps=null,candidatos=[],captura=null,stream=null;
 panel.querySelector('#foto-menu-registrar').onclick=run(async()=>{const pedidos=await api('/pedidos?fecha='+encodeURIComponent(fechaHoy())),vistos=new Set();candidatos=pedidos.filter(p=>{const key=p.reparto_id+'|'+p.codigo_cliente;if(vistos.has(key))return false;vistos.add(key);return true;});sel.innerHTML='<option value="">Seleccionar cliente</option>'+candidatos.map((c,i)=>'<option value="'+(i+1)+'">'+esc(c.codigo_cliente+' · '+c.nombre_cliente+' · Despacho '+c.despacho)+'</option>').join('');estado.textContent='Elegí el cliente donde se tomó la foto y presioná Guardar fotografía.';sel.focus();});
 const detenerCamara=()=>{if(stream){stream.getTracks().forEach(t=>t.stop());stream=null;}};
 const cerrar=()=>{detenerCamara();panel.remove();};
 panel.querySelector('#foto-menu-cerrar').onclick=cerrar;
 const camaraVista=document.createElement('div');camaraVista.id='camara-vista';
 const video=document.createElement('video');video.autoplay=true;video.playsInline=true;video.muted=true;video.style.cssText='width:100%;max-height:55vh;object-fit:contain;background:#111';
 const disparar=document.createElement('button');disparar.type='button';disparar.textContent='📷 Tomar fotografía';
 camaraVista.append(video,disparar);archivo.before(camaraVista);camaraVista.hidden=true;
 disparar.onclick=()=>{if(!video.videoWidth){estado.textContent='Esperá a que la cámara esté lista.';return;}const c=document.createElement('canvas');const escala=Math.min(1,1600/Math.max(video.videoWidth,video.videoHeight));c.width=Math.round(video.videoWidth*escala);c.height=Math.round(video.videoHeight*escala);c.getContext('2d').drawImage(video,0,0,c.width,c.height);c.toBlob(blob=>{if(!blob){estado.textContent='No se pudo tomar la foto';return;}captura=new File([blob],'foto-'+Date.now()+'.jpg',{type:'image/jpeg'});detenerCamara();camaraVista.hidden=true;procesarArchivo(captura);},'image/jpeg',0.8);};
 const ubicacion=()=>new Promise(resolve=>{if(!navigator.geolocation)return resolve(null);navigator.geolocation.getCurrentPosition(p=>resolve({latitud:p.coords.latitude,longitud:p.coords.longitude,precision_metros:p.coords.accuracy}),()=>resolve(null),{enableHighAccuracy:true,timeout:9000,maximumAge:15000});});
 const procesarArchivo=async f=>{if(!f)return;candidatos=[];sel.innerHTML='<option value="">Seleccionar cliente</option>';panel.querySelector('#foto-menu-registrar').disabled=true;if(f.size>5*1024*1024){estado.textContent='La imagen supera 5 MB';guardar.disabled=true;panel.querySelector('#foto-menu-registrar').disabled=false;return;}guardar.disabled=true;estado.textContent='Imagen seleccionada: '+f.name+'. Buscando clientes cercanos…';gps=await ubicacion();if(!panel.isConnected)return;
  if(gps){try{candidatos=await api('/fotos-recorrido/candidatos?'+new URLSearchParams(gps));candidatos.forEach((c,i)=>{const o=document.createElement('option');o.value=String(i+1);o.textContent=c.codigo_cliente+' · '+c.nombre_cliente+' · Despacho '+c.despacho;sel.appendChild(o);});if(candidatos.length===1)sel.value='1';estado.textContent=candidatos.length===1?'Cliente detectado por coordenadas. La foto se guardará con ese cliente.':candidatos.length>1?'Hay varios clientes cercanos. Elegí uno o usá foto libre.':'Sin cliente dentro de la geocerca. Usá Registrar cliente.';}catch(e){estado.textContent='No se pudo consultar la geocerca. Usá Registrar cliente: '+e.message;}}
  else estado.textContent='Sin GPS disponible. Usá Registrar cliente para asociar la foto.';
  guardar.disabled=false;panel.querySelector('#foto-menu-registrar').disabled=false;
 };
 archivo.onchange=()=>{captura=null;procesarArchivo(archivo.files[0]);};
 guardar.onclick=run(async()=>{const elegido=candidatos[Number(sel.value)-1];if(!elegido){estado.textContent='Indicá dónde se tomó la foto con Registrar cliente antes de guardar.';sel.focus();return;}const f=captura||archivo.files[0];if(!f){estado.textContent='Primero sacá una foto.';estado.scrollIntoView({block:'center'});return;}guardar.disabled=true;guardar.textContent='Guardando…';estado.textContent='Guardando fotografía…';estado.scrollIntoView({block:'center'});try{const form=new FormData();form.append('archivo',f);form.append('origen',origen);if(gps)Object.entries(gps).forEach(([k,v])=>form.append(k,String(v)));if(elegido){form.append('reparto_id',elegido.reparto_id);form.append('codigo_cliente',elegido.codigo_cliente);}await api('/fotos-recorrido',{method:'POST',body:form});estado.textContent='Fotografía guardada'+(elegido?' para cliente '+elegido.codigo_cliente:' como foto libre')+'.';guardar.textContent='Fotografía guardada ✓';archivo.value='';captura=null;}catch(e){guardar.disabled=false;guardar.textContent='Reintentar guardado';estado.textContent='No se pudo guardar: '+e.message;alert('No se pudo guardar la fotografía: '+e.message);}});
 if(origen==='camara'){try{if(!navigator.mediaDevices?.getUserMedia)throw Error('Cámara web no disponible en esta APK');stream=await navigator.mediaDevices.getUserMedia({audio:false,video:{facingMode:{ideal:'environment'}}});if(!panel.isConnected){detenerCamara();return;}camaraVista.hidden=false;video.srcObject=stream;await video.play();estado.textContent='Enfocá y presioná Tomar fotografía.';}catch(e){detenerCamara();camaraVista.hidden=true;estado.textContent='No se pudo abrir la cámara. Revisá el permiso de cámara de SEC o usá Biblioteca desde el menú.';}}else{camaraVista.remove();archivo.click();}
}

async function fotosRecorrido(){
 agregarVista.html='<div class="panel"><label>Fecha <input type="date" id="fotosfecha" value="'+fechaHoy()+'"></label><button id="fotocargar">Consultar fotos</button><div id="fotoslistado"></div></div>';
 $('#fotocargar').onclick=run(async()=>{const fotos=await api('/fotos-recorrido?incluir_entregas=1&fecha='+encodeURIComponent($('#fotosfecha').value));mostrarGaleriaFotosSEC($('#fotoslistado'),fotos);});await $('#fotocargar').onclick();
}

async function inicio(){

 if(usuario?.rol!=='CONDUCTOR'){

  await menuAdministrador();

  return;

 }

 if(!document.getElementById('sec-conductor-nav-style')){
  const estilo=document.createElement('style');
  estilo.id='sec-conductor-nav-style';
  estilo.textContent='#nav.sec-conductor-nav{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:6px;padding:12px 8px;background:#142034;box-sizing:border-box}#nav.sec-conductor-nav button{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px;min-width:0;width:100%;min-height:76px;margin:0;padding:9px 3px;border:1px solid #42536a;border-radius:12px;background:#2b3d56;color:#fff;font-size:clamp(10px,2.6vw,13px);font-weight:600;line-height:1.2;text-align:center;white-space:normal;cursor:pointer}#nav.sec-conductor-nav button:active{background:#3b5272}#nav.sec-conductor-nav .sec-nav-icon{font-size:23px;line-height:1.1}@media(max-width:550px){#nav.sec-conductor-nav{grid-template-columns:repeat(3,minmax(0,1fr))}}';
  document.head.appendChild(estilo);
 }
 $('#nav').classList.add('sec-conductor-nav');
 $('#nav').innerHTML='<button id="home" type="button"><span class="sec-nav-icon" aria-hidden="true">🚚</span><span>Volver Entregas</span></button><button id="llamar-oficina" type="button"><span class="sec-nav-icon" aria-hidden="true">☎️</span><span>Llamar oficina</span></button><button id="foto-menu" type="button"><span class="sec-nav-icon" aria-hidden="true">📷</span><span>Foto</span></button><button id="galeria-menu" type="button"><span class="sec-nav-icon" aria-hidden="true">🖼️</span><span>Biblioteca</span></button><button id="salir" type="button"><span class="sec-nav-icon" aria-hidden="true">↪</span><span>Salir</span></button>';
 $('#llamar-oficina').onclick=()=>llamarOficina();
 if(typeof iniciarMensajesOficina==='function')iniciarMensajesOficina();
 $('#foto-menu').onclick=()=>abrirFotoMenu('camara');
 $('#galeria-menu').onclick=()=>abrirFotoMenu('galeria');


 $('#home').onclick=run(inicio);

 $('#salir').onclick=run(async()=>{

  detenerGps();

  await api('/logout',{method:'POST'});if(typeof detenerMensajesOficina==='function')detenerMensajesOficina();

  sessionStorage.removeItem('sec-dist-apk-gps');

  if(window.SECAndroid||usuario?.rol==='CONDUCTOR'){

   localStorage.removeItem('vendedorId');

   sessionStorage.removeItem('sec-distribucion-token');

   location.href='salida/login-vendedor.html';

   return;

  }

  login();

 });

 await abrir('App Conductor');

 const titulo=$('#vista h2');

 if(titulo)titulo.textContent='Mis entregas de hoy';

}



// Botón dentro de cada pantalla administrativa.

function agregarVolverAdmin(){

 const vista=document.querySelector('#vista');

 if(!vista || !usuario ||

    !['ADMIN','SUPERVISOR','OPERADOR'].includes(usuario.rol) ||

    vista.querySelector('.menu-principal') ||

    vista.querySelector('#volverMenuAdmin'))return;



 const titulo=vista.querySelector('h2');

 if(!titulo)return;



 const boton=document.createElement('button');

 boton.id='volverMenuAdmin';

 boton.type='button';

 boton.textContent=textoVolverMenuSEC();

 boton.style.display='block';

 boton.style.margin='0 0 16px';

 boton.onclick=run(volverMenuSEC);

 titulo.insertAdjacentElement('afterend',boton);

}



new MutationObserver(agregarVolverAdmin).observe(

 document.querySelector('#vista'),

 {childList:true,subtree:true}

);

agregarVolverAdmin();
function agregarVinculoConductor(){
 if(usuario?.rol!=='ADMIN')return;
 $('#vista').insertAdjacentHTML('beforeend','<div class="panel"><h3>Vincular conductor del padrón de Personal</h3><p>No crea otra persona ni cambia su rol. Si todavía no tiene empresa asignada, se vinculará a esta empresa con tu confirmación.</p><form id="vincular-personal"><label>Legajo existente<input name="legajo" required maxlength="20"></label><label><input type="checkbox" name="confirmar" required> Confirmo que esta persona pertenece a esta empresa y debe trabajar como conductor.</label><button>Vincular conductor</button></form></div>');
 $('#vincular-personal').onsubmit=e=>{e.preventDefault();const b=new FormData(e.target);run(async()=>{await api('/conductores/vincular-persona',{method:'POST',body:JSON.stringify({legajo:b.get('legajo').trim(),confirmar_empresa:b.get('confirmar')==='on'})});await abrir('Conductores');mensaje('Conductor vinculado. Ya puede ingresar con su legajo, sin contraseña de gestión.');})();};
}

function resumenHorariosRutaSEC(r){
 const hora=v=>new Date(v).toLocaleTimeString('es-AR',{timeZone:'America/Argentina/Buenos_Aires',hour:'2-digit',minute:'2-digit',hourCycle:'h23'});
 const agenda=r.cronograma||[],omitidos=r.omitidos||[],alertas=agenda.filter(p=>p.estado==='REVISAR_HORARIO');
 return '<p><strong>Tiempo total estimado: '+Math.ceil((r.duracion_total_segundos??r.duracion_segundos)/60)+' min</strong> · atención: '+Math.ceil((r.servicio_segundos||0)/60)+' min · espera: '+Math.ceil((r.espera_segundos||0)/60)+' min.</p>'+(r.sin_horario?'<p>'+r.sin_horario+' cliente(s) sin horario informado: disponibles de inmediato, sin espera por apertura.</p>':'')+(alertas.length?'<p style="color:#b91c1c"><strong>'+alertas.length+' parada(s) podrían quedar fuera del horario informado. Siguen incluidas en la ruta; confirmá la recepción con el cliente.</strong></p>':'')+'<details><summary>Ver orden, horarios estimados y atención</summary><div style="overflow:auto">'+tabla(['Orden','Cliente','Llegada','Atención / salida','Estado'],agenda.map((p,i)=>[i+1,esc(p.codigo_cliente+' · '+p.nombre_cliente),esc(hora(p.llegada)),esc(hora(p.inicio)+' a '+hora(p.salida))+' · '+p.minutos_descarga+' min',p.estado==='REVISAR_HORARIO'?'<strong style="color:#b91c1c">Revisar horario</strong>':p.estado==='SIN_HORARIO'?'Sin horario informado':'Dentro del horario']))+'</div></details>'+(omitidos.length?'<div style="border:2px solid #b45309;padding:10px;margin-top:8px"><strong>Clientes fuera de esta propuesta: '+omitidos.length+'</strong><p>Siguen en el reparto y requieren revisión. No se los marca como entregados ni rechazados.</p>'+omitidos.map(p=>'<p>'+esc(p.codigo_cliente+' · '+p.nombre_cliente)+'<br>'+esc(p.motivo)+'</p>').join('')+'</div>':'');
}

function detalleInformeRuteoOficinaSEC(fila,repartos){const r=fila.detalle||{},ids=r.repartos||[fila.reparto_id],despachos=ids.map(id=>repartos.find(x=>x.id===id)?.despacho||id),fecha=new Date(fila.generado_en).toLocaleString('es-AR',{timeZone:'America/Argentina/Buenos_Aires'});return '<h3>Informe de ruteo · Despacho '+esc(despachos.join(' / '))+'</h3><p>Conductor: '+esc(fila.conductor)+' · Calculado '+esc(fecha)+'</p>'+(ids.length>1?'<p>Los totales corresponden a la ruta completa de estos despachos combinados.</p>':'')+'<p>'+esc(r.nota||'')+' · '+(r.orden||[]).length+' paradas'+((r.orden||[]).length>25?' · Revisión manual recomendada':'')+'</p><p>'+Math.round((r.distancia_metros||0)/1000)+' km · '+Math.round((r.duracion_segundos||0)/60)+' min de conducción estimada.</p>'+resumenHorariosRutaSEC(r);}
