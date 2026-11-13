const agregarVista={set html(contenido){

 document.querySelector('#vista').insertAdjacentHTML('beforeend',contenido);

}};

// Mismo backend de SEC. No se ejecuta ningún cambio hasta iniciar sesión.

const API='https://sec-backend-gg4j.onrender.com/distribucion';

const $=s=>document.querySelector(s),esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

let fechaAsignacion=null;
let usuario=null,token=sessionStorage.getItem('sec-distribucion-token')||'',conductores=[],vehiculos=[],repartos=[],pedidos=[],mapa=null;

const secciones=[['Dashboard conductores','Estado GPS y entregas de todos los conductores.'],['Recrear viaje','Reproducción del recorrido con control de velocidad.'],['Fotos del recorrido','Fotografías libres y asociadas a clientes.'],['Conductores','Alta, modificación y baja de conductores.'],['ABM de usuarios','Usuarios de oficina, perfiles, contraseñas y estado de acceso.'],['Rendición de Viaje','Operaciones, indicadores y cobros por viaje.'],['Configuración de rendiciones','ABM de motivos de rechazo y medios de cobranza.'],['Mapa de clientes','Comercios del plan de entregas.'],['Visitas y recorridos','Registro y recreación del recorrido del conductor.'],['Supervisor','Control del plan de entregas.'],['Asignación de repartos','Asignar conductor y vehículo a cada reparto.'],['Alertas','Alertas de robo, pedido de mecánico y controles operativos.'],['Auditoría','Historial de cambios del módulo.'],['Importar pedidos','Excel de distribución.'],['Importar horarios','Excel o CSV: cliente y horario de recepción.'],['Vehículos','Internos y patentes; camión o tractor con semi.'],['Mantenimiento de Flota','Equipos, trabajos preventivos, reparaciones y anomalías.'],['Combustible y Huella de Carbono','Cargas, consumo L/100 km y CO₂ estimado.'],['App Conductor','Entregas, incidencias, fotos y GPS con la página abierta.'],['Reemplazos por inasistencia','Cubrir ausencias de conductores en los repartos cargados.']];

function mensaje(s){$('#mensaje').textContent=s;}

async function api(path,options={}){const h={Authorization:'Bearer '+token,...options.headers};if(options.body&&!(options.body instanceof FormData))h['Content-Type']='application/json';const r=await fetch(API+path,{...options,headers:h});let d;try{d=await r.json();}catch{throw Error('El servidor todavía no tiene instalado el módulo Distribución o devolvió una respuesta inválida');}if(!r.ok)throw Error(d.error||'Error del servidor');return d;}

function run(fn){return async()=>{mensaje('');try{await fn();}catch(e){mensaje(e.message);}};}

function login(){token='';sessionStorage.removeItem('sec-distribucion-token');$('#nav').innerHTML='<a href="../index.html">Comercial</a>';$('#vista').innerHTML=`<div class="panel"><h2>Ingreso a Distribución</h2><form id="login"><label>Empresa<input name="empresa" value="rebesa" required autocomplete="organization"></label><label>Legajo<input name="legajo" required autocomplete="username"></label><label>Contraseña<input name="clave" type="password" required autocomplete="current-password"></label><button>Ingresar</button></form><details><summary>Inicialización del módulo — primera instalación</summary><p>Usar sólo después de ejecutar la migración en el servidor.</p><form id="init"><label>Clave de inicialización del servidor<input name="bootstrap" type="password" required></label><label>Empresa<input name="empresa" value="rebesa" required></label><label>Legajo administrador<input name="legajo" required maxlength="20"></label><label>Nombre<input name="nombre" required></label><label>Apellido<input name="apellido" required></label><label>Contraseña nueva<input name="clave" type="password" minlength="8" required></label><button>Crear primer administrador</button></form></details></div>`;

 $('#login').onsubmit=e=>{e.preventDefault();run(async()=>{const b=Object.fromEntries(new FormData(e.target));const d=await api('/login',{method:'POST',body:JSON.stringify(b)});token=d.token;usuario=d.usuario;sessionStorage.setItem('sec-distribucion-token',token);await inicio();})()};

 $('#init').onsubmit=e=>{e.preventDefault();run(async()=>{const b=Object.fromEntries(new FormData(e.target));const secret=b.bootstrap;delete b.bootstrap;await api('/inicializar',{method:'POST',headers:{Authorization:'Bearer '+secret},body:JSON.stringify(b)});e.target.reset();mensaje('Administrador creado. Ingresá arriba con su legajo y contraseña.');})()};

}

async function menuAdministrador(){iniciarMonitorAlertas();if(mapa){mapa.remove();mapa=null;}$('#nav').innerHTML='<a href="../index.html">Comercial</a><button id="home">Volver al menú principal</button><button id="salir">Cerrar sesión</button>';$('#home').onclick=run(inicio);$('#salir').onclick=run(async()=>{detenerGps();await api('/logout',{method:'POST'});sessionStorage.removeItem('sec-dist-apk-gps');if(window.SECAndroid||usuario?.rol==='CONDUCTOR'){localStorage.removeItem('vendedorId');sessionStorage.removeItem('sec-distribucion-token');location.href='salida/login-vendedor.html';return;}login();});$('#vista').innerHTML=`<h2>Distribución</h2><div class="menu-principal">${secciones.map(([p,desc],i)=>`<button class="menu-card" data-section="${i}"><h3>${esc(p)}</h3><p>${esc(desc)}</p></button>`).filter((_,i)=>(usuario?.rol!=='CONDUCTOR'||[1,2,12].includes(i))&&(![4,6].includes(i)||['ADMIN','ADMINISTRADOR'].includes(usuario?.rol))).join('')}</div>`;document.querySelectorAll('[data-section]').forEach(b=>b.onclick=run(()=>{const nombre=secciones[+b.dataset.section][0];if(nombre==='Asignación de repartos')fechaAsignacion=fechaHoy();return abrir(nombre);}));}

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
 if(!usuario||!['ADMIN','SUPERVISOR','OPERADOR'].includes(usuario.rol))return;
 try{
  const todas=await api('/alertas-conductor'),pendientes=todas.filter(x=>x.estado==='ENVIADA'),visibles=pendientes;
  const nuevas=pendientes.filter(x=>!secAlertasConocidas.has(String(x.id)));
  secAlertasPendientes=pendientes.length;
  if(nuevas.length&&secAlertasInicializadas&&secAudioHabilitado)sonarAlerta();
  secAlertasInicializadas=true;secAlertasConocidas=new Set(pendientes.map(x=>String(x.id)));
  let panel=document.getElementById('sec-alertas-emergentes');
  if(!panel){panel=document.createElement('div');panel.id='sec-alertas-emergentes';panel.style.cssText='position:fixed;z-index:99999;left:12px;right:12px;top:16px;width:calc(100% - 24px);max-width:860px;margin:auto;max-height:82vh;overflow:auto;background:#fff1f2;color:#111827;border:6px solid #b91c1c;border-radius:18px;padding:22px;box-shadow:0 10px 45px #0009;font-size:18px;line-height:1.45';document.body.appendChild(panel);}
  panel.hidden=!visibles.length;
  const firma=visibles.map(a=>[a.id,a.estado].join(':')).join('|')+'|audio:'+secAudioHabilitado;
  if(panel.dataset.firma===firma)return;
  panel.dataset.firma=firma;
  panel.innerHTML=visibles.map(a=>{
   const tieneGps=a.latitud!=null&&a.longitud!=null;
   const mapa=tieneGps?'https://www.google.com/maps/search/?api=1&query='+encodeURIComponent(a.latitud+','+a.longitud):'';
   return '<div style="border-bottom:2px solid #b91c1c;padding:14px;background:#fff;border-radius:10px;margin-bottom:10px"><strong style="display:block;background:#b91c1c;color:white;padding:12px;border-radius:8px;font-size:26px">'+(a.es_prueba?'PRUEBA · ':'')+(a.tipo==='ROBO'?'ALERTA DE ROBO':'PEDIDO DE MECÁNICO')+'</strong><p>Conductor: '+esc(a.conductor)+' · Despacho: '+esc(a.despacho||'Sin despacho')+' · Vehículo: '+esc(a.interno||'Sin asignar')+'</p><p>'+esc(new Date(a.creada_en).toLocaleString('es-AR'))+'</p><p><strong>Ubicación:</strong> <span data-direccion="'+esc(a.id)+'">'+(tieneGps?'Buscando dirección…':'GPS no disponible; comunicarse con el conductor')+'</span></p>'+(tieneGps?'<p><a href="'+esc(mapa)+'" target="_blank" rel="noopener noreferrer">Abrir ubicación GPS exacta en Google Maps</a></p><small>Coordenadas: '+esc(a.latitud)+', '+esc(a.longitud)+'</small>':'')+'<p><button type="button" data-confirmar="'+esc(a.id)+'" style="background:#166534;color:white;font-size:20px;font-weight:bold;padding:14px 20px;border:0;border-radius:9px">✓ CONFIRMAR LECTURA Y SILENCIAR</button></p></div>';
  }).join('');
  visibles.forEach(a=>{if(a.latitud==null||a.longitud==null)return;const elemento=panel.querySelector('[data-direccion="'+a.id+'"]');if(!elemento)return;direccionDeCoordenadas(a.latitud,a.longitud).then(d=>{if(elemento.isConnected)elemento.textContent=d||'Dirección postal no disponible; usar enlace al punto GPS';});});
  panel.querySelectorAll('[data-confirmar]').forEach(b=>{b.onclick=run(async()=>{b.disabled=true;try{await api('/alertas-conductor/'+b.dataset.confirmar+'/confirmar',{method:'POST'});await consultarAlertasOficina();}catch(e){b.disabled=false;throw e;}});});
 }catch(e){if(!String(e.message).includes('relation')&&!String(e.message).includes('does not exist'))console.warn('Alertas:',e.message);}
}
function iniciarMonitorAlertas(){if(secAlertasTimer)clearInterval(secAlertasTimer);if(window.secAlarmaInterval)clearInterval(window.secAlarmaInterval);secAlertasPendientes=0;if(usuario&&['ADMIN','SUPERVISOR','OPERADOR'].includes(usuario.rol)){prepararAudioAlertas();consultarAlertasOficina();secAlertasTimer=setInterval(consultarAlertasOficina,12000);window.secAlarmaInterval=setInterval(()=>{if(secAudioHabilitado&&secAlertasPendientes)sonarAlerta();},5000);}}
function tabla(head,rows){return `<div class="panel"><table><tr>${head.map(h=>`<th>${esc(h)}</th>`).join('')}</tr>${rows.map(r=>`<tr>${r.map(v=>`<td>${v}</td>`).join('')}</tr>`).join('')}</table>${rows.length?'':'<p>No hay registros.</p>'}</div>`;}

async function abrir(p){if(mapa){mapa.remove();mapa=null;}mensaje('');$('#vista').innerHTML='<h2>'+esc(p)+'</h2>';

 if(p==='Mantenimiento de Flota'){
  const [equipos,trabajos,anomalias]=await Promise.all([api('/vehiculos'),api('/mantenimiento/trabajos'),api('/anomalias-vehiculo')]);
  const opciones=equipos.map(v=>'<option value="'+esc(v.id)+'">'+esc(v.interno+' · '+v.patente+' · '+v.tipo)+'</option>').join('');
  agregarVista.html='<div class="panel"><h3>Equipos: '+equipos.length+' · Anomalías pendientes: '+anomalias.filter(x=>x.estado==='PENDIENTE').length+'</h3><h3>Registrar trabajo</h3><form id="flota-trabajo"><label>Equipo<select name="vehiculo_id" required>'+opciones+'</select></label><label>Fecha<input type="date" name="fecha" value="'+fechaHoy()+'" required></label><label>Tipo<select name="tipo"><option>PREVENTIVO</option><option>CORRECTIVO</option></select></label><label>Sistema<input name="sistema" required placeholder="Motor, frenos, neumáticos..."></label><label>Falla<input name="falla"></label><label>Trabajo realizado<textarea name="trabajo_realizado" required></textarea></label><label>Repuestos<input name="repuestos"></label><label>Taller<input name="taller"></label><label>Kilometraje<input type="number" min="0" step="0.1" name="kilometraje"></label><label>Costo ($)<input type="number" min="0" step="0.01" name="costo" value="0"></label><label>Próximo servicio (fecha)<input type="date" name="proximo_servicio_fecha"></label><label>Próximo servicio (km)<input type="number" min="0" step="0.1" name="proximo_servicio_km"></label><button>Registrar mantenimiento</button></form></div>';
  agregarVista.html='<div class="panel"><h3>Historial de trabajos</h3>'+tabla(['Fecha','Equipo','Tipo','Sistema','Trabajo','Costo'],trabajos.map(x=>[esc(x.fecha?.slice(0,10)),esc(x.interno),esc(x.tipo),esc(x.sistema),esc(x.trabajo_realizado),Number(x.costo).toLocaleString('es-AR',{style:'currency',currency:'ARS'})]))+'</div>';
  agregarVista.html='<div class="panel"><h3>Anomalías de conductores</h3>'+tabla(['Fecha','Conductor','Tipo','Descripción','Estado'],anomalias.map(x=>[esc(x.creado_en?.slice(0,10)),esc(x.conductor_nombre+' '+x.conductor_apellido),esc(x.tipo),esc(x.descripcion),esc(x.estado)]))+'</div>';
  $('#flota-trabajo').onsubmit=e=>{e.preventDefault();run(async()=>{await api('/mantenimiento/trabajos',{method:'POST',body:JSON.stringify(Object.fromEntries(new FormData(e.target)))});await abrir(p);mensaje('Trabajo guardado.');})();};return;
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
 if(p==='Rendición de Viaje'){
  agregarVista.html='<div class="panel"><label>Fecha de entrega <input id="rendicion-fecha" type="date" value="'+fechaHoy()+'"></label> <button id="rendicion-actualizar">Actualizar</button><p>Control de mercadería. Los cobros, motivos de rechazo y conciliación de caja aún no están disponibles.</p><button id="rendicion-tab-operaciones" type="button">Operaciones</button> <button id="rendicion-tab-indicadores" type="button">Indicadores</button><div id="rendicion-operaciones"><div id="rendicion-resumen"></div><div id="rendicion-detalle"></div></div><div id="rendicion-indicadores" hidden><p>Indicadores preliminares por estado registrado; no equivalen todavía a rechazos confirmados con motivo.</p><div id="rendicion-ranking"></div></div></div>';
  const pesos=n=>Number(n||0).toLocaleString('es-AR',{style:'currency',currency:'ARS',maximumFractionDigits:2});
  const activar=tab=>{const ind=tab==='indicadores';$('#rendicion-operaciones').hidden=ind;$('#rendicion-indicadores').hidden=!ind;};
  $('#rendicion-tab-operaciones').onclick=()=>activar('operaciones');
  $('#rendicion-tab-indicadores').onclick=()=>activar('indicadores');
  const refrescar=async()=>{
    const fecha=$('#rendicion-fecha').value;if(!fecha)return;
    const [ps,vs]=await Promise.all([api('/pedidos?fecha='+encodeURIComponent(fecha)),api('/visitas?fecha='+encodeURIComponent(fecha))]);
    const estado=new Map(vs.map(v=>[String(v.reparto_id)+'|'+String(v.codigo_cliente),v.estado]));
    const viajes=new Map(),clientes=new Map();
    for(const p of ps){
      const key=String(p.reparto_id),v=viajes.get(key)||{despacho:p.despacho,conductor:p.conductor_nombre||'',total:0,entregado:0,noEntregado:0,pendiente:0,pedidos:0};
      const importe=Number(p.importe)||0;v.total+=importe;v.pedidos++;
      const clienteKey=key+'|'+String(p.codigo_cliente),e=estado.get(clienteKey);
      if(e==='ENTREGADO')v.entregado+=importe;
      else if(e==='CERRADO'||e==='INCIDENCIA')v.noEntregado+=importe;
      else v.pendiente+=importe;
      viajes.set(key,v);
      if(!clientes.has(clienteKey))clientes.set(clienteKey,{conductor:v.conductor,despacho:v.despacho,estado:e||'PENDIENTE'});
    }
    const filas=[...viajes.values()],sum=k=>filas.reduce((a,v)=>a+v[k],0);
    $('#rendicion-resumen').innerHTML=tabla(['Total despachado','Entregado','No entregado / incidencia','Pendiente'],[[pesos(sum('total')),pesos(sum('entregado')),pesos(sum('noEntregado')),pesos(sum('pendiente'))]]);
    $('#rendicion-detalle').innerHTML=tabla(['Despacho','Conductor','Pedidos','Despachado','Entregado','No entregado','Pendiente'],filas.map(v=>[esc(v.despacho),esc(v.conductor),String(v.pedidos),pesos(v.total),pesos(v.entregado),pesos(v.noEntregado),pesos(v.pendiente)]));
    const ranking=new Map();
    for(const c of clientes.values()){
      const key=c.conductor+'|'+c.despacho,x=ranking.get(key)||{conductor:c.conductor,despacho:c.despacho,atendidos:0,incidencias:0,entregados:0};
      if(c.estado!=='PENDIENTE'&&c.estado!=='VISITADO'){x.atendidos++;if(c.estado==='CERRADO'||c.estado==='INCIDENCIA')x.incidencias++;if(c.estado==='ENTREGADO')x.entregados++;}
      ranking.set(key,x);
    }
    const datos=[...ranking.values()].filter(x=>x.atendidos).sort((a,b)=>(b.incidencias/b.atendidos)-(a.incidencias/a.atendidos));
    $('#rendicion-ranking').innerHTML=tabla(['Conductor','Despacho','Atendidos','Entregados','Cerrados / incidencias','% incidencias'],datos.map(x=>[esc(x.conductor),esc(x.despacho),String(x.atendidos),String(x.entregados),String(x.incidencias),(100*x.incidencias/x.atendidos).toFixed(1)+'%']));
  };
  $('#rendicion-actualizar').onclick=run(refrescar);await refrescar();return;
 }
 if(p==='ABM de usuarios'){
  if(usuario?.rol!=='ADMIN'&&usuario?.rol!=='ADMINISTRADOR'){agregarVista.html='<div class="panel"><p>Solo el administrador puede gestionar usuarios.</p></div>';return;}
  agregarVista.html='<div class="panel"><p>Usuarios de SEC Distribución. Las contraseñas nuevas deben tener al menos 8 caracteres.</p><form id="form-usuario-sec"><label>Legajo / usuario<input name="legajo" maxlength="20" required autocomplete="off"></label><label>Nombre<input name="nombre" required></label><label>Apellido<input name="apellido" required></label><label>Perfil<select name="rol"><option value="ADMIN">Administrador</option><option value="SUPERVISOR">Supervisor</option><option value="OPERADOR">Operador</option></select></label><label>Contraseña nueva<input name="clave" type="password" minlength="8" autocomplete="new-password" required></label><button type="submit">Crear usuario</button></form><p id="usuarios-estado" role="status"></p><div id="usuarios-listado"></div></div>';
  const estado=$('#usuarios-estado'),lista=$('#usuarios-listado');
  const cargar=async()=>{try{const datos=await api('/usuarios');lista.innerHTML=tabla(['Legajo','Nombre','Perfil','Estado','Acción'],datos.map(u=>[esc(u.legajo),esc((u.nombre||'')+' '+(u.apellido||'')),esc(u.rol),u.activo?'Activo':'Inactivo',`<button data-usuario-id="${esc(u.id)}" data-usuario-activo="${u.activo?'1':'0'}">${u.activo?'Desactivar':'Activar'}</button>`]));lista.querySelectorAll('[data-usuario-id]').forEach(b=>b.onclick=run(async()=>{if(!confirm('¿Confirmás el cambio de estado de este usuario?'))return;await api('/usuarios/'+encodeURIComponent(b.dataset.usuarioId),{method:'PUT',body:JSON.stringify({activo:b.dataset.usuarioActivo!=='1'})});await cargar();}));}catch(e){estado.textContent='El ABM requiere habilitar el servicio de usuarios en el servidor: '+e.message;}};
  $('#form-usuario-sec').onsubmit=e=>{e.preventDefault();run(async()=>{const b=Object.fromEntries(new FormData(e.target));await api('/usuarios',{method:'POST',body:JSON.stringify(b)});e.target.reset();estado.textContent='Usuario creado correctamente.';await cargar();})()};
  await cargar();return;
 }
 if(p==='Importar horarios'){
  agregarVista.html='<div class="panel"><p><strong>Formato:</strong> CLIENTE, HORARIO. Ejemplo: 15118, 08:00-12:00 / 14:00-18:00.</p><p>Opcionales: DIA (LUNES a DOMINGO, o TODOS) y DESCARGA_MIN (por defecto 15). Si no hay DIA, se aplica a todos los días. Los clientes existentes no se borran.</p><input id="archivo-horarios" type="file" accept=".xlsx,.xls,.csv"><button id="validar-horarios">Validar sin grabar</button><button id="confirmar-horarios" disabled>Confirmar importación</button><p id="estado-horarios"></p></div>';
  const archivo=$('#archivo-horarios'),confirmar=$('#confirmar-horarios'),estado=$('#estado-horarios');let validado=false;
  archivo.onchange=()=>{validado=false;confirmar.disabled=true;estado.textContent='';};
  const enviar=async(guardar)=>{const f=archivo.files[0];if(!f)throw Error('Seleccioná el archivo');const form=new FormData();form.append('archivo',f);form.append(guardar?'confirmar':'solo_validar',guardar?'SI':'1');const d=await api('/importar-horarios',{method:'POST',body:form});estado.textContent=guardar?'Importados '+d.clientes+' clientes y '+d.horarios+' horarios.':'Validado: '+d.clientes+' clientes y '+d.horarios+' horarios. Confirmá para guardar.';validado=!guardar;confirmar.disabled=!validado;};
  $('#validar-horarios').onclick=run(()=>enviar(false));confirmar.onclick=run(async()=>{if(!validado)throw Error('Primero validá el archivo');await enviar(true);});return;
 }
 if(p==='Reemplazos por inasistencia'){await reemplazosInasistencia();return;}

 if(p==='Conductores'){conductores=await api('/conductores');abm();agregarVinculoConductor();return;}

 if(p==='Auditoría'){const rows=await api('/auditoria');agregarVista.html=tabla(['Fecha','Usuario','Acción','Detalle'],rows.map(r=>[esc(new Date(r.fecha).toLocaleString('es-AR')),esc((r.nombre||'')+' '+(r.apellido||'')),esc(r.accion),esc(JSON.stringify(r.detalle))]));return;}

 if(['Importar pedidos','Vehículos'].includes(p)){const isV=p==='Vehículos';agregarVista.html=`<div class="panel"><p>${isV?'Columnas: INTERNO, PATENTE, TIPO (camion, tractor, semi).':'COD_CLI identifica al cliente. Indicá la fecha real de entrega; el Excel puede corresponder a un día de preparación anterior.'}</p>${isV?'':`<label>Fecha real de entrega <input id="fechaentregareal" type="date" required value="${fechaHoy()}"></label><p class="muted">Primero validá el archivo sin grabar. Después confirmá la importación.</p>`}<input id="archivo" type="file" accept=".xlsx,.xls,.csv"><button id="validar-importacion">${isV?'Importar':'Validar archivo (sin grabar)'}</button>${isV?'':'<button id="confirmar-importacion" disabled>Confirmar importación</button><p id="resultado-validacion"></p>'}</div>`;
 let validado=null;const archivo=$('#archivo'),fechaInput=$('#fechaentregareal');const invalidar=()=>{validado=null;if($('#confirmar-importacion'))$('#confirmar-importacion').disabled=true;if($('#resultado-validacion'))$('#resultado-validacion').textContent=''};archivo.onchange=invalidar;if(fechaInput)fechaInput.onchange=invalidar;
 const enviar=async(soloValidar)=>{const f=archivo.files[0];if(!f)throw Error('Seleccioná el archivo Excel');const fecha=isV?'':fechaInput.value;if(!isV&&!/^\d{4}-\d{2}-\d{2}$/.test(fecha))throw Error('Seleccioná la fecha real de entrega');const form=new FormData();form.append('archivo',f);if(!isV){form.append('fecha_entrega_real',fecha);if(soloValidar)form.append('solo_validar','1')}return api(isV?'/vehiculos/importar':'/importar',{method:'POST',body:form})};
 $('#validar-importacion').onclick=run(async()=>{const d=await enviar(!isV);if(isV){mensaje('Importados: '+d.importados);return}validado={file:archivo.files[0],fecha:fechaInput.value};$('#confirmar-importacion').disabled=false;$('#resultado-validacion').textContent='Archivo válido: '+d.pedidos+' pedidos · '+d.despachos+' despachos · entrega '+validado.fecha.split('-').reverse().join('/')+'. Todavía no se grabó nada.';});
 if(!isV)$('#confirmar-importacion').onclick=run(async()=>{if(!validado||validado.file!==archivo.files[0]||validado.fecha!==fechaInput.value)throw Error('Volvé a validar el archivo');if(!confirm('¿Confirmás importar '+validado.file.name+' para el '+validado.fecha.split('-').reverse().join('/')+'? Los despachos existentes de esa fecha podrían actualizarse.'))return;$('#confirmar-importacion').disabled=true;const d=await enviar(false);validado=null;$('#resultado-validacion').textContent='Importación realizada: '+d.importados+' pedidos. Revisá Asignación de repartos.';mensaje('Importación realizada: '+d.importados+' pedidos.');});

 if(!isV){
  document.querySelector('#vista').insertAdjacentHTML('beforeend',`<div class="panel"><h3>2. Importar Asigno (conductores y camiones)</h3><p>Primero importá Pedidos. Luego seleccioná Asigno y validá las coincidencias. Los pendientes se resuelven en Asignación de repartos.</p><label>Archivo Asigno <input id="archivo-asigno" type="file" accept=".xlsx,.xls"></label><button id="validar-asigno">Validar Asigno (sin grabar)</button> <button id="confirmar-asigno" disabled>Aplicar asignaciones coincidentes</button><div id="resultado-asigno"></div></div>`);
  const af=$('#archivo-asigno'),vb=$('#validar-asigno'),cb=$('#confirmar-asigno'),resultado=$('#resultado-asigno');let comprobado=null;
  const limpiar=()=>{comprobado=null;cb.disabled=true;resultado.textContent=''};af.onchange=limpiar;fechaInput.onchange=()=>{invalidar();limpiar()};
  const pedirAsigno=async(validar)=>{const archivo=af.files[0];if(!archivo)throw Error('Seleccioná el archivo Asigno');const fecha=fechaInput.value;if(!/^\d{4}-\d{2}-\d{2}$/.test(fecha))throw Error('Seleccioná fecha de entrega');const form=new FormData();form.append('archivo',archivo);form.append('fecha_entrega_real',fecha);if(validar)form.append('solo_validar','1');return api('/asigno/importar',{method:'POST',body:form})};
  vb.onclick=run(async()=>{const d=await pedirAsigno(true);comprobado={file:af.files[0],fecha:fechaInput.value};cb.disabled=!d.asignables;resultado.innerHTML='<p><strong>'+d.asignables+' asignables automáticamente · '+d.pendientes+' pendientes</strong></p>'+tabla(['Despacho','Interno','Legajo','Estado / advertencia'],d.detalle.map(x=>[esc(x.despacho),esc(x.interno),esc(x.legajo),esc(x.estado==='asignable'?'Listo para asignar':x.motivos.join('; '))]));});
  cb.onclick=run(async()=>{if(!comprobado||comprobado.file!==af.files[0]||comprobado.fecha!==fechaInput.value)throw Error('Volvé a validar Asigno');if(!confirm('¿Aplicar las asignaciones coincidentes para '+comprobado.fecha.split('-').reverse().join('/')+'? No se modificarán las asignaciones ya existentes.'))return;cb.disabled=true;const d=await pedirAsigno(false);comprobado=null;resultado.insertAdjacentHTML('afterbegin','<p><strong>Asignados: '+d.aplicados+' · Pendientes: '+d.pendientes+'</strong>. Abrí Asignación de repartos para completar los restantes.</p>');mensaje('Asigno: '+d.aplicados+' asignaciones guardadas');});
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
  let filtroEstado='todos';
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
    `<button data-reparto="${esc(r.id)}">${completo(r)?"Modificar":"Asignar"}</button>`
   ])):'<p>No hay despachos para este filtro y fecha.</p>';
   document.querySelectorAll('[data-reparto]').forEach(b=>b.onclick=run(()=>asignar(b.dataset.reparto)));
   $('#total-repartos').innerHTML=esc(repartos.length)+' despachos · <strong style="color:#16753c">● '+esc(completos)+' asignados</strong> · <strong style="color:#b42318">● '+esc(pendientes)+' pendientes de salida</strong>';
   $('#filtro-estado').value=filtroEstado;
  };
  agregarVista.html=`<div class="panel"><label>Fecha de entrega <input id="fecha-asignacion" type="date" value="${esc(fechaAsignacion)}"></label><button id="ver-hoy" type="button">Hoy</button><label>Mostrar <select id="filtro-estado"><option value="todos">Todos</option><option value="pendientes">Pendientes de salida</option><option value="completos">Asignados</option></select></label><p id="total-repartos"></p></div><div class="panel" id="lista-repartos"></div>`;
  $('#filtro-estado').onchange=()=>{filtroEstado=$('#filtro-estado').value;mostrar()};
  $('#fecha-asignacion').onchange=run(async()=>{const nueva=$('#fecha-asignacion').value;if(!nueva)throw Error('Seleccioná una fecha');fechaAsignacion=nueva;repartos=await api('/repartos?fecha='+encodeURIComponent(fechaAsignacion));mostrar();});
  $('#ver-hoy').onclick=run(async()=>{fechaAsignacion=fechaHoy();$('#fecha-asignacion').value=fechaAsignacion;repartos=await api('/repartos?fecha='+encodeURIComponent(fechaAsignacion));mostrar();});
  mostrar();return;
 }
 pedidos=await api('/pedidos');repartos=await api('/repartos');

 if(p==='Mapa de clientes'){agregarVista.html=`<div class="panel"><label>Fecha<input id="fecha" type="date"></label><label>Despacho<select id="despacho"><option value="">Todos</option>${repartos.map(r=>`<option value="${esc(r.id)}">${esc(r.fecha.slice(0,10)+' · '+r.despacho)}</option>`).join('')}</select></label><div id="mapa"></div><p id="sincoordenadas"></p></div>`;const draw=()=>{if(mapa)mapa.remove();if(!window.L){mensaje('No se pudo cargar el componente de mapa');return;}mapa=L.map('mapa').setView([-34.65,-58.8],12);L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{attribution:'© OpenStreetMap contributors',maxZoom:19}).addTo(mapa);const seen=new Set(),pts=[],rs=pedidos.filter(p=>(!$('#fecha').value||p.fecha.slice(0,10)===$('#fecha').value)&&(!$('#despacho').value||p.reparto_id===$('#despacho').value));let missing=0;for(const p of rs){if(seen.has(p.codigo_cliente))continue;seen.add(p.codigo_cliente);if(p.latitud==null||p.longitud==null){missing++;continue;}const lat=Number(p.latitud),lng=Number(p.longitud);if(!Number.isFinite(lat)||!Number.isFinite(lng)){missing++;continue;}L.marker([lat,lng]).addTo(mapa).bindPopup(esc(p.codigo_cliente+' · '+p.nombre_cliente));pts.push([lat,lng]);}if(pts.length)mapa.fitBounds(pts,{padding:[25,25],maxZoom:16});$('#sincoordenadas').textContent='Clientes sin coordenadas: '+missing;};$('#fecha').onchange=draw;$('#despacho').onchange=draw;draw();return;}

 if(p==='Alertas'){
  agregarVista.html='<div class="panel"><h3>Alertas del conductor</h3><button id="alertas-refrescar">Actualizar</button><div id="alertas-historial"></div><h3>Controles operativos</h3></div>';
  agregarVista.html=tabla(['Referencia','Motivo'],repartos.filter(r=>!r.conductor_id||!r.principal_id).map(r=>[esc(r.despacho),esc(!r.conductor_id?'Sin conductor asignado':'Sin vehículo asignado')]).concat(pedidos.filter(p=>p.latitud==null||p.longitud==null).map(p=>[esc(p.codigo_cliente),'Cliente sin coordenadas o sin vínculo de empresa'])));
  const refresh=async()=>{const as=await api('/alertas-conductor');$('#alertas-historial').innerHTML=tabla(['Fecha','Tipo','Conductor','Despacho','Estado','Acción'],as.map(a=>[esc(new Date(a.creada_en).toLocaleString('es-AR')),esc((a.es_prueba?'PRUEBA · ':'')+a.tipo),esc(a.conductor),esc(a.despacho||''),esc(a.estado),a.estado==='CONFIRMADA'?'<button data-resolver="'+esc(a.id)+'">Resolver</button>':a.estado==='ENVIADA'?'<button data-confirmar="'+esc(a.id)+'">Confirmar</button>':'—']));$('#alertas-historial').querySelectorAll('[data-resolver],[data-confirmar]').forEach(b=>b.onclick=run(async()=>{await api('/alertas-conductor/'+(b.dataset.resolver||b.dataset.confirmar)+'/'+(b.dataset.resolver?'resolver':'confirmar'),{method:'POST'});await refresh();await consultarAlertasOficina();}));};$('#alertas-refrescar').onclick=run(refresh);await refresh();return;
 }

 // La asignación se muestra arriba con filtro de fecha.

}

function abm(id){const c=conductores.find(c=>c.id===id)||{};$('#vista').innerHTML=`<h2>Conductores</h2><div class="panel"><form id="abm"><label>Legajo<input name="legajo" required maxlength="20" value="${esc(c.legajo||'')}"></label><label>Nombre<input name="nombre" required value="${esc(c.nombre||'')}"></label><label>Apellido<input name="apellido" required value="${esc(c.apellido||'')}"></label><label>Teléfono<input name="telefono" type="tel" value="${esc(c.telefono||'')}"></label><label>${id?'Nueva contraseña (vacío conserva la actual)':'Contraseña'}<input name="clave" type="password" minlength="8" ${id?'':'required'}></label><label>Estado<select name="activo"><option value="true" ${c.activo!==false?'selected':''}>Activo</option><option value="false" ${c.activo===false?'selected':''}>Inactivo</option></select></label><button>Guardar</button><button type="button" id="nuevo">Nuevo</button></form></div>`+tabla(['Legajo','Nombre','Estado','Acción'],conductores.map(c=>[esc(c.legajo),esc(c.nombre+' '+c.apellido),c.activo?'Activo':'Inactivo',`<button data-edit="${esc(c.id)}">Editar / baja</button>`]));$('#nuevo').onclick=()=>abm();document.querySelectorAll('[data-edit]').forEach(b=>b.onclick=()=>abm(b.dataset.edit));$('#abm').onsubmit=e=>{e.preventDefault();run(async()=>{const b=Object.fromEntries(new FormData(e.target));b.activo=b.activo==='true';await api('/conductores'+(id?'/'+id:''),{method:id?'PUT':'POST',body:JSON.stringify(b)});await abrir('Conductores');mensaje('Conductor guardado en SEC.');})()};}

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

if(token)run(async()=>{usuario=await api('/me');await inicio();if(window.SECAndroid&&usuario.rol==='CONDUCTOR'&&sessionStorage.getItem('sec-dist-apk-gps'))await abrir('App Conductor');})();else login();



let gpsWatch=null;

function fechaHoy(){return new Intl.DateTimeFormat('en-CA',{timeZone:'America/Argentina/Buenos_Aires',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());}

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
 const mostrarSugerencia=async(automatica=false)=>{if(calculandoRuta)return;calculandoRuta=true;const caja=$('#ruta-sugerida');caja.hidden=false;const despachoSolicitado=despachoActivo;const ordenAnterior=[...ordenSugerido];const {orden,sinCoordenadas}=sugerirOrden();ordenSugerido=ordenAnterior;if(!automatica)caja.innerHTML='<strong>Calculando ruta por calles y tránsito…</strong>';
  try{if(!orden.length){caja.innerHTML='<p>No hay entregas pendientes con coordenadas.</p>';return;}
   if(!ultimaUbicacion){const pos=await new Promise((resolve,reject)=>navigator.geolocation.getCurrentPosition(resolve,reject,{enableHighAccuracy:true,timeout:10000,maximumAge:15000}));ultimaUbicacion={latitud:pos.coords.latitude,longitud:pos.coords.longitude};}
   const respuesta=await api('/rutas-google/sugerir',{method:'POST',body:JSON.stringify({origen:ultimaUbicacion,puntos:orden.map(p=>({reparto_id:p.reparto_id,codigo_cliente:p.codigo_cliente,latitud:p.latitud,longitud:p.longitud}))})});
   if(despachoSolicitado!==despachoActivo)return;const clave=p=>p.reparto_id+'|'+p.codigo_cliente,mapaPuntos=new Map(orden.map(p=>[clave(p),p]));const nuevoOrden=respuesta.orden.map(p=>mapaPuntos.get(clave(p))).filter(Boolean);
   if(automatica&&ordenAnterior.length&&nuevoOrden.map(clave).join(',')!==ordenAnterior.filter(p=>!entregado(p)).map(clave).join(',')){
    caja.innerHTML='<strong>Google propone cambiar el orden de las entregas</strong><p>Hay una nueva propuesta por tránsito. El orden actual no se modificó.</p><button id="aplicar-ruta-nueva" type="button">Aplicar nueva ruta</button><button id="mantener-ruta" type="button">Mantener orden actual</button>';
    $('#aplicar-ruta-nueva').onclick=()=>{ordenSugerido=nuevoOrden;ultimaRuta=respuesta;dibujarRutaGoogle(respuesta).catch(e=>mensaje(e.message));mostrarResumenRuta(respuesta);};
    $('#mantener-ruta').onclick=()=>{caja.innerHTML='<p>Se mantiene el orden actual. Podés recalcular manualmente.</p>';};return;
   }
   ordenSugerido=nuevoOrden;ultimaRuta=respuesta;await dibujarRutaGoogle(respuesta);mostrarResumenRuta(respuesta);
  }catch(e){caja.innerHTML='<strong>No se pudo actualizar Google Maps</strong><p>'+esc(e.message)+'</p>';}finally{calculandoRuta=false;}
 };
 const mostrarResumenRuta=r=>{const caja=$('#ruta-sugerida');if(!caja)return;caja.innerHTML='<strong>Despacho '+esc(despachoActivo)+' · Próxima entrega: '+esc(ordenSugerido[0]?.nombre_cliente||'Sin pendientes')+'</strong><p>'+Math.round(r.distancia_metros/1000)+' km · '+Math.round(r.duracion_segundos/60)+' min estimados de conducción · Actualizado '+new Date().toLocaleTimeString('es-AR')+'</p><button id="recalcular-manual" type="button">Recalcular ahora</button><p class="muted">'+esc(r.nota||'')+(ordenSugerido.length?' · '+ordenSugerido.length+' paradas':'')+(ordenSugerido.length>25?' · Revisión manual recomendada':'')+'</p>';$('#recalcular-manual').onclick=()=>mostrarSugerencia(false);};

 const entregados=stops.filter(entregado).length,visitadosSinEntrega=stops.filter(p=>['RECHAZADO','NO_ENTREGADO','VISITADO'].includes(estadoCliente(p))).length;

 const formatoDinero=n=>Number(n||0).toLocaleString('es-AR',{style:'currency',currency:'ARS'});
 agregarVista.html='<div class="panel" id="mi-cobranza"><button id="mi-cobranza-toggle" type="button">💰 Mi cobranza · Ver resumen</button><div id="mi-cobranza-detalle" hidden><p>Importes registrados para los despachos de hoy. Cuenta corriente y saldos pendientes no son dinero recibido.</p><div id="mi-cobranza-cifras">Seleccioná Ver resumen.</div><button type="button" id="mi-cobranza-actualizar">Actualizar importes</button><hr><h3>Cierre de caja</h3><p>Contá el efectivo físico y comparalo con el sistema. Una vez confirmado, el cierre no se puede editar desde la APK.</p><div id="mi-cobranza-cierre">Consultando cierre...</div></div></div>';
 const mostrarCobranza=async()=>{
  const caja=$('#mi-cobranza-cifras');if(!caja)return;caja.textContent='Consultando cobranzas...';
  try{
   const [cobros,entregas]=await Promise.all([api('/rendicion/cobros?fecha='+encodeURIComponent(fecha)),api('/rendicion/entregas?fecha='+encodeURIComponent(fecha))]);
   const clasificar=x=>{const n=String(x.medio_nombre||'').toUpperCase(),c=String(x.medio_clasificacion||'').toUpperCase();if(/CUENTA\s*CORRIENTE|C\.?C\.?|CREDITO|CRÉDITO/.test(n))return 'cuenta';if(/QR|MERCADO\s*PAGO|TRANSFER|BILLETERA/.test(n)||c==='DIGITAL')return 'digital';if(c==='EFECTIVO'||/EFECTIVO/.test(n))return 'efectivo';return 'otros';};
   const grupos={efectivo:0,digital:0,cuenta:0,otros:0};const detalles={};
   for(const x of cobros){const g=clasificar(x),importe=Math.round(Number(x.importe||0)*100);grupos[g]+=importe;const k=String(x.medio_nombre||'Otro medio');detalles[k]=(detalles[k]||0)+importe;}
   const totalEntregado=entregas.reduce((n,x)=>n+Math.round(Number(x.importe_entregado||0)*100),0);
   const totalRegistrado=Object.values(grupos).reduce((a,b)=>a+b,0);
   const pendiente=Math.max(0,totalEntregado-totalRegistrado);
   const fila=(nombre,centavos)=>'<div style="display:flex;justify-content:space-between;gap:10px;padding:7px 0;border-bottom:1px solid #ddd"><span>'+esc(nombre)+'</span><strong>'+esc(formatoDinero(centavos/100))+'</strong></div>';
   caja.innerHTML=fila('Efectivo',grupos.efectivo)+fila('QR / transferencias',grupos.digital)+fila('Cuenta corriente registrada',grupos.cuenta)+fila('Otros medios',grupos.otros)+fila('Total cobrado (sin cuenta corriente)',grupos.efectivo+grupos.digital+grupos.otros)+fila('Saldo sin medio registrado',pendiente)+(Object.keys(detalles).length?'<details><summary>Detalle por medio de pago</summary>'+Object.entries(detalles).sort((a,b)=>a[0].localeCompare(b[0])).map(([n,v])=>fila(n,v)).join('')+'</details>':'<p>Aún no hay cobranzas registradas.</p>');
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
 $('#navproximo').onclick=()=>{const siguiente=ordenSugerido.find(p=>enDespacho(p)&&!entregado(p))||stops.find(p=>enDespacho(p)&&coordValida(p)&&!entregado(p));if(siguiente)abrirMaps(siguiente);else mensaje('No hay entregas pendientes con coordenadas válidas.');};
 const selectorDespacho=$('#despacho-a-rutear');
 selectorDespacho.onchange=()=>{despachoActivo=selectorDespacho.value;ordenSugerido=[];ultimaRuta=null;marcadoresGoogle.forEach(m=>m.setMap(null));lineasGoogle.forEach(l=>l.setMap(null));marcadoresGoogle=[];lineasGoogle=[];if(mapaGoogle){const bounds=new google.maps.LatLngBounds();let cantidad=0;stops.filter(p=>enDespacho(p)&&coordValida(p)).forEach((p,i)=>{const position={lat:Number(p.latitud),lng:Number(p.longitud)};bounds.extend(position);cantidad++;const marker=new google.maps.Marker({map:mapaGoogle,position,label:{text:String(i+1),color:'#fff'},title:'Cliente '+p.codigo_cliente+' · Despacho '+p.despacho,icon:{path:google.maps.SymbolPath.CIRCLE,scale:16,fillColor:colorDespacho(p),fillOpacity:1,strokeColor:'#fff',strokeWeight:2}});marcadoresGoogle.push(marker);});if(cantidad)mapaGoogle.fitBounds(bounds);}else if(mapaConductor){mapaConductor.eachLayer(l=>{if(l instanceof L.Marker)mapaConductor.removeLayer(l);});const bounds=[];stops.filter(p=>enDespacho(p)&&coordValida(p)).forEach((p,i)=>{const lat=Number(p.latitud),lng=Number(p.longitud);bounds.push([lat,lng]);L.marker([lat,lng],{icon:L.divIcon({className:'',html:'<div class="conductor-pin" style="background:'+colorDespacho(p)+'">'+(i+1)+'</div>',iconSize:[30,30],iconAnchor:[15,15]})}).addTo(mapaConductor).bindPopup('Cliente '+esc(p.codigo_cliente)+' · Despacho '+esc(p.despacho));});if(bounds.length)mapaConductor.fitBounds(bounds,{padding:[24,24],maxZoom:15});}const caja=$('#ruta-sugerida');caja.hidden=false;caja.innerHTML='<strong>Despacho '+esc(despachoActivo)+' seleccionado.</strong><p>Presioná Sugerir ruta para calcular exclusivamente este viaje.</p>';$('#mapa-aviso').textContent='Mostrando únicamente el despacho '+despachoActivo;actualizarSiguiente();};
 const proximoPendiente=()=>ordenSugerido.find(p=>enDespacho(p)&&!entregado(p))||stops.find(p=>enDespacho(p)&&coordValida(p)&&!entregado(p));
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

 agregarVista.html=`<div class="conductor-entregas"><h3>Mis entregas de hoy</h3>${stops.map((p,i)=>({p,i})).sort((a,b)=>Number(atendido(a.p))-Number(atendido(b.p))).map(({p,i})=>{const v=vs.find(v=>v.reparto_id===p.reparto_id&&v.codigo_cliente===p.codigo_cliente),estado=estadoCliente(p),color=['ENTREGADO','PARCIAL'].includes(estado)?'#16a34a':estado!=='PENDIENTE'?'#9333ea':'transparent';return `<div class="conductor-cliente" style="border-left:6px solid ${color};background:${color==='#9333ea'?'#f3e8ff':color==='#16a34a'?'#f0fdf4':'transparent'}"><div><strong><span class="conductor-punto-despacho" style="background:${colorDespacho(p)}"></span>Cliente ${esc(p.codigo_cliente+' · '+p.nombre_cliente)}</strong><small>Despacho ${esc(p.despacho)} · ${esc(estado==='NO_ENTREGADO'?'NO ENTREGADO':estado==='VISITADO'?'VISITADO':estado==='RECHAZADO'?'RECHAZADO':estado==='PARCIAL'?'ENTREGA PARCIAL':estado==='ENTREGADO'?'ENTREGADO':'Pendiente')}</small></div><div class="conductor-acciones"><button data-stop="${i}">Registrar</button><button data-nav="${i}" class="btn-maps">Navegar</button></div></div>`;}).join('')}</div>`;
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
 const total=pedidosCliente.filter(x=>String(x.reparto_id)===String(p.reparto_id)&&String(x.codigo_cliente)===String(p.codigo_cliente)).reduce((sum,x)=>sum+Number(x.importe||0),0);
 const previa=rendiciones.find(x=>String(x.reparto_id)===String(p.reparto_id)&&String(x.codigo_cliente)===String(p.codigo_cliente));
 const pagosPrevios=previa?cobrosPrevios.filter(x=>String(x.rendicion_entrega_id)===String(previa.id)):[];
 const opciones=motivos.filter(x=>x.activo).map(x=>'<option value="'+esc(x.id)+'">'+esc(x.nombre)+'</option>').join('');
 const opcionesMedios=medios.filter(x=>x.activo).map(x=>'<option value="'+esc(x.id)+'">'+esc(x.nombre)+'</option>').join('');
 $('#vista').innerHTML=`<h2>${esc(p.codigo_cliente+' · '+p.nombre_cliente)}</h2><div class="panel"><form id="resultado"><label>Resultado<select name="estado"><option value="ENTREGADO">ENTREGADO</option><option value="RECHAZADO">RECHAZADO</option><option value="PARCIAL">ENTREGA PARCIAL</option><option value="VISITADO">VISITADO</option></select></label><div id="resultado-motivo" hidden><label>Motivo de rechazo<select name="motivo_rechazo_id"><option value="">Seleccionar motivo</option>${opciones}</select></label><label id="resultado-parcial" hidden>Importe entregado ($)<input name="importe_entregado" type="number" min="0.01" step="0.01" max="${esc(total)}" value="${esc(total.toFixed(2))}"></label><p>Importe original del cliente: ${Number(total).toLocaleString('es-AR',{style:'currency',currency:'ARS'})}</p></div><div id="resultado-cobranza" hidden><h3>Cobranza</h3><p>Elegí los medios y los importes efectivamente cobrados. Si queda saldo pendiente, no lo registres como cobrado.</p><div id="resultado-pagos"></div><button id="resultado-agregar-pago" type="button">+ Agregar forma de pago</button><p id="resultado-total-cobrado"></p></div><label>Observación<textarea name="observacion" maxlength="3000"></textarea></label><div><strong>Foto de la entrega (opcional)</strong><div class="acciones"><label>📷 Sacar foto<input id="foto-camara" type="file" accept="image/jpeg,image/png,image/*" capture="environment"></label><label>🖼️ Biblioteca<input id="foto-biblioteca" type="file" accept="image/jpeg,image/png,image/*"></label></div><p id="foto-elegida" class="muted">Sin foto seleccionada</p></div><button>Guardar</button></form></div>`;
 const importeObjetivo=()=>$('#resultado [name=estado]').value==='PARCIAL'?Number($('#resultado [name=importe_entregado]').value||0):total;
 const cent=n=>Math.round(Number(n||0)*100);
 const totalPagos=()=>[...document.querySelectorAll('.pago-importe')].reduce((n,x)=>n+cent(x.value),0);
 const agregarPago=(medio='',importe='',referencia='')=>{
  const fila=document.createElement('div');fila.className='panel';fila.style.margin='8px 0';
  fila.innerHTML='<label>Forma de pago<select class="pago-medio"><option value="">Seleccionar forma de pago</option>'+opcionesMedios+'</select></label><label>Importe cobrado ($)<input class="pago-importe" type="number" min="0.01" step="0.01"></label><label>Referencia (opcional)<input class="pago-referencia" maxlength="150"></label><button type="button" class="pago-quitar">Quitar</button>';
  $('#resultado-pagos').appendChild(fila);fila.querySelector('.pago-medio').value=String(medio);fila.querySelector('.pago-importe').value=String(importe);fila.querySelector('.pago-referencia').value=referencia;
  fila.querySelector('.pago-quitar').onclick=()=>{fila.remove();resumirCobro();};
  fila.querySelector('.pago-importe').oninput=resumirCobro;resumirCobro();
 };
 const resumirCobro=()=>{const suma=totalPagos()/100,saldo=(cent(importeObjetivo())-totalPagos())/100;const destino=$('#resultado-total-cobrado');if(destino)destino.textContent='Total cobrado: '+suma.toLocaleString('es-AR',{style:'currency',currency:'ARS'})+' · '+(saldo<0?'Excede en: ':'Saldo pendiente: ')+Math.abs(saldo).toLocaleString('es-AR',{style:'currency',currency:'ARS'});};
 $('#resultado-agregar-pago').onclick=()=>{if(document.querySelectorAll('#resultado-pagos .panel').length>=8){mensaje('Máximo ocho medios por entrega.');return;}agregarPago('',(Math.max(0,cent(importeObjetivo())-totalPagos())/100).toFixed(2));};
 if(pagosPrevios.length)pagosPrevios.forEach(x=>agregarPago(x.medio_cobranza_id,x.importe,x.referencia||''));
 else agregarPago('',total>0?total.toFixed(2):'');
 if(previa){$('#resultado [name=estado]').value=previa.estado;$('#resultado [name=motivo_rechazo_id]').value=String(previa.motivo_rechazo_id||'');$('#resultado [name=importe_entregado]').value=previa.importe_entregado;$('#resultado [name=observacion]').value=previa.observacion||'';}
 const actualizar=()=>{const estado=$('#resultado [name=estado]').value,requiere=estado==='RECHAZADO'||estado==='PARCIAL';$('#resultado-motivo').hidden=!requiere;$('#resultado-cobranza').hidden=estado==='VISITADO'||estado==='RECHAZADO';$('#resultado-parcial').hidden=estado!=='PARCIAL';$('#resultado [name=motivo_rechazo_id]').required=requiere;$('#resultado [name=importe_entregado]').required=estado==='PARCIAL';};
 $('#resultado [name=estado]').onchange=()=>{actualizar();const pagos=[...document.querySelectorAll('.pago-importe')];if(!previa&&pagos.length===1)pagos[0].value=importeObjetivo().toFixed(2);resumirCobro();};
 $('#resultado [name=importe_entregado]').oninput=()=>{const pagos=[...document.querySelectorAll('.pago-importe')];if(!previa&&pagos.length===1)pagos[0].value=importeObjetivo().toFixed(2);resumirCobro();};actualizar();resumirCobro();
 $('#resultado').onsubmit=e=>{e.preventDefault();run(async()=>{
  const form=Object.fromEntries(new FormData(e.target)),file=$('#foto-camara').files[0]||$('#foto-biblioteca').files[0];
  if(file&&file.size>5*1024*1024)throw Error('La foto supera 5 MB');
  const estado=form.estado;
  if(estado!=='VISITADO'){
   if(!Number.isFinite(total)||total<=0)throw Error('No se puede rendir sin importe original válido');
   const importe=estado==='RECHAZADO'?0:estado==='ENTREGADO'?total:Number(form.importe_entregado);
   if(estado==='PARCIAL'&&!(importe>0&&importe<total))throw Error('El importe parcial debe ser mayor a cero y menor al pedido');
   const pagos=estado==='RECHAZADO'?[]:[...document.querySelectorAll('#resultado-pagos .panel')].map(f=>({medio_cobranza_id:f.querySelector('.pago-medio').value,importe:Number(f.querySelector('.pago-importe').value),referencia:f.querySelector('.pago-referencia').value})).filter(x=>x.medio_cobranza_id||x.importe);
   if(pagos.some(x=>!x.medio_cobranza_id||!Number.isFinite(x.importe)||x.importe<=0||Math.round(x.importe*100)!==x.importe*100))throw Error('Revisá las formas de pago y los importes.');
   const suma=pagos.reduce((n,x)=>n+Math.round(x.importe*100),0);
   if(suma>Math.round(importe*100))throw Error('Los cobros superan el importe entregado.');
   if(previa&&!confirm('Esta entrega ya tiene una rendición guardada. Al continuar se reemplazarán sus cobros anteriores. ¿Confirmás la corrección?'))return;
   await api('/rendicion/entregas',{method:'POST',body:JSON.stringify({reparto_id:p.reparto_id,codigo_cliente:p.codigo_cliente,estado,importe_entregado:importe,motivo_rechazo_id:estado==='ENTREGADO'?null:form.motivo_rechazo_id,cobros:pagos,observacion:form.observacion})});
  }
  const visitaEstado=estado==='RECHAZADO'||estado==='PARCIAL'?'INCIDENCIA':estado;
  const v=await api('/visitas',{method:'POST',body:JSON.stringify({estado:visitaEstado,observacion:form.observacion,reparto_id:p.reparto_id,codigo_cliente:p.codigo_cliente})});
  if(file){const f=new FormData();f.append('archivo',file);try{await api('/visitas/'+v.id+'/foto',{method:'POST',body:f});}catch(err){throw Error('Resultado guardado; la foto no se guardó: '+err.message);}}
  await abrir('App Conductor');mensaje('Resultado guardado.');
 })();};
 $('#foto-camara').onchange=()=>{if($('#foto-camara').files.length)$('#foto-biblioteca').value='';$('#foto-elegida').textContent=$('#foto-camara').files[0]?.name||'Sin foto seleccionada';};
 $('#foto-biblioteca').onchange=()=>{if($('#foto-biblioteca').files.length)$('#foto-camara').value='';$('#foto-elegida').textContent=$('#foto-biblioteca').files[0]?.name||'Sin foto seleccionada';};
}

async function dashboardConductores(){
 agregarVista.html='<div class="panel"><label>Fecha <input id="dashfecha" type="date" value="'+fechaHoy()+'"></label><button id="dashactualizar">Actualizar</button><p class="muted">Actualización cada 30 segundos. «Con GPS reciente» significa posición recibida en los últimos 5 minutos, no confirma que la aplicación esté abierta.</p><div id="dashresumen"></div><div id="dashconductores"></div><div id="mapa"></div></div>';
 let activo=true,temporizador=null;
 const cargar=async()=>{
  if(!document.querySelector('#dashfecha')){activo=false;if(temporizador)clearInterval(temporizador);return;}
  const f=$('#dashfecha').value;
  const [cs,rs,ps,vs,gps]=await Promise.all([api('/conductores'),api('/repartos?fecha='+f),api('/pedidos?fecha='+f),api('/visitas?fecha='+f),api('/gps?fecha='+f)]);
  const ultimos=new Map();gps.forEach(g=>{const anterior=ultimos.get(g.conductor_id);if(!anterior||new Date(g.fecha)>new Date(anterior.fecha))ultimos.set(g.conductor_id,g);});
  const ahora=Date.now(),hoy=f===fechaHoy();let recientes=0,asignados=0,entregas=0;
  const rows=cs.map(c=>{
   const repartosConductor=rs.filter(r=>r.conductor_id===c.id),ids=new Set(repartosConductor.map(r=>r.id)),pedidosConductor=ps.filter(p=>ids.has(p.reparto_id)),visitasConductor=vs.filter(v=>ids.has(v.reparto_id)),entregados=visitasConductor.filter(v=>['ENTREGADO','CERRADO'].includes(v.estado)).length,g=ultimos.get(c.id),reciente=!!(hoy&&g&&ahora-new Date(g.fecha).getTime()>=0&&ahora-new Date(g.fecha).getTime()<=300000);
   if(reciente)recientes++;if(repartosConductor.length)asignados++;entregas+=entregados;
   return [esc(c.legajo||''),esc((c.nombre||'')+' '+(c.apellido||'')),reciente?'🟢 GPS reciente':g?'⚪ Sin GPS reciente':'⚪ Sin GPS',esc(g?new Date(g.fecha).toLocaleString('es-AR'):'—'),esc(repartosConductor.map(r=>r.despacho).join(', ')||'—'),String(pedidosConductor.length),String(entregados),String(Math.max(0,pedidosConductor.length-entregados))];
  });
  $('#dashresumen').innerHTML='<div class="conductor-resumen"><div><strong>'+cs.length+'</strong><span>Conductores</span></div><div><strong>'+asignados+'</strong><span>Con reparto</span></div><div><strong>'+recientes+'</strong><span>GPS reciente</span></div><div><strong>'+entregas+'</strong><span>Entregados</span></div></div>';
  $('#dashconductores').innerHTML=tabla(['Legajo','Conductor','Estado GPS','Última posición','Despachos','Clientes','Entregados','Pendientes'],rows);
  if(mapa)mapa.remove();if(!window.L)return;mapa=L.map('mapa').setView([-34.65,-58.8],11);L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{attribution:'© OpenStreetMap contributors',maxZoom:19}).addTo(mapa);
  const puntos=[];for(const c of cs){const g=ultimos.get(c.id);if(!g)continue;const lat=Number(g.latitud),lng=Number(g.longitud);if(!Number.isFinite(lat)||!Number.isFinite(lng))continue;const reciente=hoy&&ahora-new Date(g.fecha).getTime()<=300000&&ahora-new Date(g.fecha).getTime()>=0;L.circleMarker([lat,lng],{radius:9,color:reciente?'#16a34a':'#64748b',fillOpacity:.8}).addTo(mapa).bindPopup(esc(c.legajo+' · '+c.nombre+' '+c.apellido)+'<p>Último GPS: '+esc(new Date(g.fecha).toLocaleString('es-AR'))+'</p>');puntos.push([lat,lng]);}if(puntos.length)mapa.fitBounds(puntos,{padding:[25,25],maxZoom:15});
 };
 $('#dashactualizar').onclick=run(cargar);await cargar();temporizador=setInterval(()=>{if(!activo||!document.querySelector('#dashfecha')){clearInterval(temporizador);return;}run(cargar)();},30000);
}

async function recorridos(){

 const cs=usuario?.rol==='CONDUCTOR'?[]:await api('/conductores');agregarVista.html=`<div class="panel"><label>Fecha<input id="recfecha" type="date" value="${fechaHoy()}"></label>${cs.length?`<label>Conductor<select id="recconductor">${cs.map(c=>`<option value="${esc(c.id)}">${esc(c.nombre+' '+c.apellido)}</option>`).join('')}</select></label>`:''}<button id="cargarrec">Ver recorrido</button><p id="recinfo"></p><div id="mapa"></div><div class="acciones"><button id="replayplay" type="button">▶ Reproducir</button><button id="replaypause" type="button">⏸ Pausar</button><label>Velocidad <select id="replayspeed"><option value="1">1×</option><option value="5">5×</option><option value="15">15×</option><option value="30">30×</option><option value="60">60×</option><option value="120">120×</option></select></label></div><label>Recrear posición<input id="replay" type="range" min="0" max="0" value="0"></label><p id="hora"></p><div id="visitaslista"></div></div>`;

 let replayTimer=null;const pararReplay=()=>{if(replayTimer){clearInterval(replayTimer);replayTimer=null;}};
 $('#cargarrec').onclick=run(async()=>{pararReplay();const f=$('#recfecha').value;if(!f)throw Error('Seleccionar fecha');const id=$('#recconductor')?.value;const puntos=await api('/gps?fecha='+f+(id?'&conductor_id='+encodeURIComponent(id):''));let visitas=await api('/visitas?fecha='+f);if(id)visitas=visitas.filter(v=>v.conductor_id===id);$('#visitaslista').innerHTML=tabla(['Cliente','Resultado','Llegada','Permanencia registrada','Fotos'],visitas.map(v=>[esc(v.codigo_cliente+' · '+v.nombre_cliente),esc(v.estado),esc(new Date(v.llegada).toLocaleString('es-AR')),esc(Math.round(Number(v.permanencia_segundos)/60)+' min'),`<button data-fotos="${esc(v.id)}">Ver fotos</button>`]));document.querySelectorAll('[data-fotos]').forEach(b=>b.onclick=run(async()=>{const fs=await api('/visitas/'+b.dataset.fotos+'/fotos');for(const f of fs){const r=await fetch(API+'/fotos/'+f.id,{headers:{Authorization:'Bearer '+token}});if(!r.ok)throw Error('No se pudo cargar la foto');const url=URL.createObjectURL(await r.blob()),img=document.createElement('img');img.src=url;img.style.maxWidth='100%';img.onload=()=>URL.revokeObjectURL(url);b.parentNode.appendChild(img);}if(!fs.length)mensaje('Esta visita no tiene fotos.');b.disabled=true;}));

 $('#recinfo').textContent=puntos.length+' puntos registrados. Los saltos mayores a 5 minutos se muestran como tramos separados.';if(mapa)mapa.remove();if(!window.L)throw Error('No se pudo cargar el mapa');mapa=L.map('mapa').setView([-34.65,-58.8],12);L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{attribution:'© OpenStreetMap contributors',maxZoom:19}).addTo(mapa);let tramo=[];for(let i=0;i<puntos.length;i++){if(i&&new Date(puntos[i].fecha)-new Date(puntos[i-1].fecha)>300000){L.polyline(tramo).addTo(mapa);tramo=[];}tramo.push([Number(puntos[i].latitud),Number(puntos[i].longitud)]);}if(tramo.length)L.polyline(tramo).addTo(mapa);if(puntos.length){mapa.fitBounds(puntos.map(p=>[Number(p.latitud),Number(p.longitud)]),{maxZoom:16,padding:[20,20]});const marker=L.marker([puntos[0].latitud,puntos[0].longitud]).addTo(mapa);$('#replay').max=puntos.length-1;$('#replay').oninput=()=>{const p=puntos[+$('#replay').value];marker.setLatLng([p.latitud,p.longitud]);$('#hora').textContent=new Date(p.fecha).toLocaleString('es-AR')+' · precisión '+p.precision_metros+' m';};$('#replay').oninput();$('#replayplay').onclick=()=>{pararReplay();let ultimo=Date.now(),tiempoVirtual=new Date(puntos[+$('#replay').value].fecha).getTime();replayTimer=setInterval(()=>{if(!document.querySelector('#replay')||!document.querySelector('#replayplay')){pararReplay();return;}const ahora=Date.now();tiempoVirtual+=(ahora-ultimo)*Number($('#replayspeed').value);ultimo=ahora;let actual=+$('#replay').value;while(actual<puntos.length-1&&new Date(puntos[actual+1].fecha).getTime()<=tiempoVirtual)actual++;$('#replay').value=actual;$('#replay').oninput();if(actual>=puntos.length-1)pararReplay();},200);};$('#replaypause').onclick=pararReplay;}else{$('#replay').max=0;$('#hora').textContent='Sin puntos para esta fecha.';}

 });await $('#cargarrec').onclick();

}





async function abrirFotoMenu(origen){
 const anterior=$('#foto-menu-panel');if(anterior)anterior.remove();
 const panel=document.createElement('div');panel.id='foto-menu-panel';panel.className='panel';
 panel.innerHTML='<h3>Foto del recorrido</h3><p>Seleccioná un cliente detectado por geocerca o «Foto libre».</p><input id="foto-menu-archivo" type="file" accept="image/jpeg,image/png,image/*" '+(origen==='camara'?'capture="environment"':'')+'><p id="foto-menu-estado" class="muted">Elegí una imagen.</p><label>Asociación <select id="foto-menu-cliente"><option value="">Foto libre (sin cliente)</option></select></label><button id="foto-menu-guardar" type="button" disabled>Guardar fotografía</button><button id="foto-menu-cerrar" type="button">Cancelar</button>';
 $('#vista').prepend(panel);const estado=panel.querySelector('#foto-menu-estado'),archivo=panel.querySelector('#foto-menu-archivo'),sel=panel.querySelector('#foto-menu-cliente'),guardar=panel.querySelector('#foto-menu-guardar');
 panel.querySelector('#foto-menu-cerrar').onclick=()=>panel.remove();
 let gps=null,candidatos=[],captura=null,stream=null;
 const detenerCamara=()=>{if(stream){stream.getTracks().forEach(t=>t.stop());stream=null;}};
 const cerrar=()=>{detenerCamara();panel.remove();};
 panel.querySelector('#foto-menu-cerrar').onclick=cerrar;
 const camaraVista=document.createElement('div');camaraVista.id='camara-vista';
 const video=document.createElement('video');video.autoplay=true;video.playsInline=true;video.muted=true;video.style.cssText='width:100%;max-height:55vh;object-fit:contain;background:#111';
 const disparar=document.createElement('button');disparar.type='button';disparar.textContent='📷 Tomar fotografía';
 camaraVista.append(video,disparar);archivo.before(camaraVista);camaraVista.hidden=true;
 disparar.onclick=()=>{if(!video.videoWidth){estado.textContent='Esperá a que la cámara esté lista.';return;}const c=document.createElement('canvas');const escala=Math.min(1,1600/Math.max(video.videoWidth,video.videoHeight));c.width=Math.round(video.videoWidth*escala);c.height=Math.round(video.videoHeight*escala);c.getContext('2d').drawImage(video,0,0,c.width,c.height);c.toBlob(blob=>{if(!blob){estado.textContent='No se pudo tomar la foto';return;}captura=new File([blob],'foto-'+Date.now()+'.jpg',{type:'image/jpeg'});detenerCamara();camaraVista.hidden=true;procesarArchivo(captura);},'image/jpeg',0.8);};
 const ubicacion=()=>new Promise(resolve=>{if(!navigator.geolocation)return resolve(null);navigator.geolocation.getCurrentPosition(p=>resolve({latitud:p.coords.latitude,longitud:p.coords.longitude,precision_metros:p.coords.accuracy}),()=>resolve(null),{enableHighAccuracy:true,timeout:9000,maximumAge:15000});});
 const procesarArchivo=async f=>{if(!f)return;if(f.size>5*1024*1024){estado.textContent='La imagen supera 5 MB';guardar.disabled=true;return;}guardar.disabled=false;estado.textContent='Imagen seleccionada: '+f.name+'. Buscando clientes cercanos…';gps=await ubicacion();if(!panel.isConnected)return;
  if(gps){try{candidatos=await api('/fotos-recorrido/candidatos?'+new URLSearchParams(gps));candidatos.forEach((c,i)=>{const o=document.createElement('option');o.value=String(i+1);o.textContent=c.codigo_cliente+' · '+c.nombre_cliente+' · Despacho '+c.despacho;sel.appendChild(o);});if(candidatos.length===1)sel.value='1';estado.textContent=candidatos.length===1?'Cliente detectado. Podés cambiar a foto libre.':candidatos.length>1?'Hay varios clientes cercanos. Elegí uno o usá foto libre.':'No se detectó un cliente dentro de la geocerca. Podés guardar foto libre.';}catch(e){estado.textContent='No se pudo consultar la geocerca. Podés guardar foto libre: '+e.message;}}
  else estado.textContent='Sin GPS disponible. Podés guardar foto libre.';
 };
 archivo.onchange=()=>{captura=null;procesarArchivo(archivo.files[0]);};
 guardar.onclick=run(async()=>{const f=captura||archivo.files[0];if(!f){estado.textContent='Primero sacá una foto o elegí una imagen de la galería.';estado.scrollIntoView({block:'center'});return;}guardar.disabled=true;guardar.textContent='Guardando…';estado.textContent='Guardando fotografía…';estado.scrollIntoView({block:'center'});try{const form=new FormData();form.append('archivo',f);form.append('origen',origen);if(gps)Object.entries(gps).forEach(([k,v])=>form.append(k,String(v)));const elegido=candidatos[Number(sel.value)-1];if(elegido){form.append('reparto_id',elegido.reparto_id);form.append('codigo_cliente',elegido.codigo_cliente);}await api('/fotos-recorrido',{method:'POST',body:form});estado.textContent='Fotografía guardada'+(elegido?' para cliente '+elegido.codigo_cliente:' como foto libre')+'.';guardar.textContent='Fotografía guardada ✓';archivo.value='';captura=null;}catch(e){guardar.disabled=false;guardar.textContent='Reintentar guardado';estado.textContent='No se pudo guardar: '+e.message;alert('No se pudo guardar la fotografía: '+e.message);}});
 if(origen==='camara'){try{if(!navigator.mediaDevices?.getUserMedia)throw Error('Cámara web no disponible en esta APK');stream=await navigator.mediaDevices.getUserMedia({audio:false,video:{facingMode:{ideal:'environment'}}});if(!panel.isConnected){detenerCamara();return;}camaraVista.hidden=false;video.srcObject=stream;await video.play();estado.textContent='Enfocá y presioná Tomar fotografía.';}catch(e){detenerCamara();camaraVista.hidden=true;estado.textContent='La APK no permitió abrir la cámara directamente. Se intentará con la cámara del sistema.';archivo.click();}}else{camaraVista.remove();archivo.click();}
}

async function fotosRecorrido(){
 agregarVista.html='<div class="panel"><label>Fecha <input type="date" id="fotosfecha" value="'+fechaHoy()+'"></label><button id="fotocargar">Consultar fotos</button><div id="fotoslistado"></div></div>';
 $('#fotocargar').onclick=run(async()=>{const fotos=await api('/fotos-recorrido?fecha='+$('#fotosfecha').value);$('#fotoslistado').innerHTML=tabla(['Fecha','Conductor','Asociación','Origen','Foto'],fotos.map(f=>[esc(new Date(f.fecha).toLocaleString('es-AR')),esc(f.nombre+' '+f.apellido),esc(f.codigo_cliente||'Libre'),esc(f.origen),'<button data-fotorec="'+esc(f.id)+'">Ver foto</button>']));document.querySelectorAll('[data-fotorec]').forEach(b=>b.onclick=run(async()=>{const r=await fetch(API+'/fotos-recorrido/'+b.dataset.fotorec+'/imagen',{headers:{Authorization:'Bearer '+token}});if(!r.ok)throw Error('No se pudo abrir la imagen');const url=URL.createObjectURL(await r.blob()),img=document.createElement('img');img.src=url;img.style.maxWidth='100%';img.onload=()=>URL.revokeObjectURL(url);b.parentNode.appendChild(img);b.disabled=true;}));});await $('#fotocargar').onclick();
}

async function inicio(){

 if(usuario?.rol!=='CONDUCTOR'){

  await menuAdministrador();

  return;

 }

 $('#nav').innerHTML='<button id="home">Volver a mis entregas</button><button id="foto-menu" type="button">📷 Foto</button><button id="galeria-menu" type="button">🖼️ Galería</button><button id="salir">Cerrar sesión</button>';
 $('#foto-menu').onclick=()=>abrirFotoMenu('camara');
 $('#galeria-menu').onclick=()=>abrirFotoMenu('galeria');

 $('#home').onclick=run(inicio);

 $('#salir').onclick=run(async()=>{

  detenerGps();

  await api('/logout',{method:'POST'});

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

 boton.textContent='Volver al menú principal';

 boton.style.display='block';

 boton.style.margin='0 0 16px';

 boton.onclick=run(inicio);

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
