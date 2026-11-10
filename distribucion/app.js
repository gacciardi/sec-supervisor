const agregarVista={set html(contenido){

 document.querySelector('#vista').insertAdjacentHTML('beforeend',contenido);

}};

// Mismo backend de SEC. No se ejecuta ningún cambio hasta iniciar sesión.

const API='https://sec-backend-gg4j.onrender.com/distribucion';

const $=s=>document.querySelector(s),esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

let fechaAsignacion=null;
let usuario=null,token=sessionStorage.getItem('sec-distribucion-token')||'',conductores=[],vehiculos=[],repartos=[],pedidos=[],mapa=null;

const secciones=[['Conductores','Alta, modificación y baja de conductores.'],['Mapa de clientes','Comercios del plan de entregas.'],['Visitas y recorridos','Registro y recreación del recorrido del conductor.'],['Supervisor','Control del plan de entregas.'],['Asignación de repartos','Asignar conductor y vehículo a cada reparto.'],['Alertas','Faltantes de ubicación y asignación.'],['Auditoría','Historial de cambios del módulo.'],['Importar pedidos','Excel de distribución.'],['Vehículos','Internos y patentes; camión o tractor con semi.'],['App Conductor','Entregas, incidencias, fotos y GPS con la página abierta.'],['Reemplazos por inasistencia','Cubrir ausencias de conductores en los repartos cargados.']];

function mensaje(s){$('#mensaje').textContent=s;}

async function api(path,options={}){const h={Authorization:'Bearer '+token,...options.headers};if(options.body&&!(options.body instanceof FormData))h['Content-Type']='application/json';const r=await fetch(API+path,{...options,headers:h});let d;try{d=await r.json();}catch{throw Error('El servidor todavía no tiene instalado el módulo Distribución o devolvió una respuesta inválida');}if(!r.ok)throw Error(d.error||'Error del servidor');return d;}

function run(fn){return async()=>{mensaje('');try{await fn();}catch(e){mensaje(e.message);}};}

function login(){token='';sessionStorage.removeItem('sec-distribucion-token');$('#nav').innerHTML='<a href="../index.html">Comercial</a>';$('#vista').innerHTML=`<div class="panel"><h2>Ingreso a Distribución</h2><form id="login"><label>Empresa<input name="empresa" value="rebesa" required autocomplete="organization"></label><label>Legajo<input name="legajo" required autocomplete="username"></label><label>Contraseña<input name="clave" type="password" required autocomplete="current-password"></label><button>Ingresar</button></form><details><summary>Inicialización del módulo — primera instalación</summary><p>Usar sólo después de ejecutar la migración en el servidor.</p><form id="init"><label>Clave de inicialización del servidor<input name="bootstrap" type="password" required></label><label>Empresa<input name="empresa" value="rebesa" required></label><label>Legajo administrador<input name="legajo" required maxlength="20"></label><label>Nombre<input name="nombre" required></label><label>Apellido<input name="apellido" required></label><label>Contraseña nueva<input name="clave" type="password" minlength="8" required></label><button>Crear primer administrador</button></form></details></div>`;

 $('#login').onsubmit=e=>{e.preventDefault();run(async()=>{const b=Object.fromEntries(new FormData(e.target));const d=await api('/login',{method:'POST',body:JSON.stringify(b)});token=d.token;usuario=d.usuario;sessionStorage.setItem('sec-distribucion-token',token);await inicio();})()};

 $('#init').onsubmit=e=>{e.preventDefault();run(async()=>{const b=Object.fromEntries(new FormData(e.target));const secret=b.bootstrap;delete b.bootstrap;await api('/inicializar',{method:'POST',headers:{Authorization:'Bearer '+secret},body:JSON.stringify(b)});e.target.reset();mensaje('Administrador creado. Ingresá arriba con su legajo y contraseña.');})()};

}

async function menuAdministrador(){if(mapa){mapa.remove();mapa=null;}$('#nav').innerHTML='<a href="../index.html">Comercial</a><button id="home">Volver al menú principal</button><button id="salir">Cerrar sesión</button>';$('#home').onclick=run(inicio);$('#salir').onclick=run(async()=>{detenerGps();await api('/logout',{method:'POST'});sessionStorage.removeItem('sec-dist-apk-gps');if(window.SECAndroid||usuario?.rol==='CONDUCTOR'){localStorage.removeItem('vendedorId');sessionStorage.removeItem('sec-distribucion-token');location.href='salida/login-vendedor.html';return;}login();});$('#vista').innerHTML=`<h2>Distribución</h2><div class="menu-principal">${secciones.map(([p,desc],i)=>`<button class="menu-card" data-section="${i}"><h3>${esc(p)}</h3><p>${esc(desc)}</p></button>`).filter((_,i)=>usuario?.rol!=='CONDUCTOR'||[1,2,9].includes(i)).join('')}</div>`;document.querySelectorAll('[data-section]').forEach(b=>b.onclick=run(()=>{const nombre=secciones[+b.dataset.section][0];if(nombre==='Asignación de repartos')fechaAsignacion=fechaHoy();return abrir(nombre);}));}

function tabla(head,rows){return `<div class="panel"><table><tr>${head.map(h=>`<th>${esc(h)}</th>`).join('')}</tr>${rows.map(r=>`<tr>${r.map(v=>`<td>${v}</td>`).join('')}</tr>`).join('')}</table>${rows.length?'':'<p>No hay registros.</p>'}</div>`;}

async function abrir(p){if(mapa){mapa.remove();mapa=null;}mensaje('');$('#vista').innerHTML='<h2>'+esc(p)+'</h2>';

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

 if(p==='Alertas'){agregarVista.html=tabla(['Referencia','Motivo'],repartos.filter(r=>!r.conductor_id||!r.principal_id).map(r=>[esc(r.despacho),esc(!r.conductor_id?'Sin conductor asignado':'Sin vehículo asignado')]).concat(pedidos.filter(p=>p.latitud==null||p.longitud==null).map(p=>[esc(p.codigo_cliente),'Cliente sin coordenadas o sin vínculo de empresa'])));return;}

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

 if(usuario?.rol!=='CONDUCTOR'){mensaje('Ingresá con el usuario del conductor para registrar su recorrido.');return;}

 const fecha=fechaHoy(),ps=await api('/pedidos?fecha='+fecha),vs=await api('/visitas?fecha='+fecha),seen=new Set();
 const stops=ps.filter(p=>{const key=p.reparto_id+'|'+p.codigo_cliente;if(seen.has(key))return false;seen.add(key);return true;});
 const coordValida=p=>p&&p.latitud!=null&&p.longitud!=null&&Number.isFinite(Number(p.latitud))&&Number.isFinite(Number(p.longitud))&&Math.abs(Number(p.latitud))<=90&&Math.abs(Number(p.longitud))<=180;
 const abrirMaps=p=>{if(!coordValida(p)){mensaje('Este cliente no tiene coordenadas válidas para navegar.');return;}const destino=Number(p.latitud)+','+Number(p.longitud);window.open('https://www.google.com/maps/dir/?api=1&destination='+encodeURIComponent(destino)+'&travelmode=driving','_blank','noopener,noreferrer');};
 let ultimaUbicacion=null,ordenSugerido=[];
 const entregado=p=>vs.some(v=>v.reparto_id===p.reparto_id&&v.codigo_cliente===p.codigo_cliente&&['ENTREGADO','CERRADO'].includes(v.estado));
 const distancia=(a,b)=>{const rad=Math.PI/180,dlat=(Number(b.latitud)-Number(a.latitud))*rad,dlon=(Number(b.longitud)-Number(a.longitud))*rad,x=Math.sin(dlat/2)**2+Math.cos(Number(a.latitud)*rad)*Math.cos(Number(b.latitud)*rad)*Math.sin(dlon/2)**2;return 6371*2*Math.atan2(Math.sqrt(x),Math.sqrt(1-x));};
 const sugerirOrden=()=>{const disponibles=stops.filter(p=>coordValida(p)&&!entregado(p));const sinCoordenadas=stops.filter(p=>!coordValida(p)&&!entregado(p));const pendientes=[...disponibles];let actual=ultimaUbicacion||pendientes[0];const orden=[];while(pendientes.length){let indice=0;if(actual){let mejor=Infinity;pendientes.forEach((p,i)=>{const d=distancia(actual,p);if(d<mejor){mejor=d;indice=i;}});}const siguiente=pendientes.splice(indice,1)[0];orden.push(siguiente);actual=siguiente;}ordenSugerido=orden;return {orden,sinCoordenadas};};
 const mostrarSugerencia=()=>{const {orden,sinCoordenadas}=sugerirOrden();$('#ruta-sugerida').innerHTML='<strong>Orden sugerido de entregas</strong><p>Estimación por cercanía geográfica, no por calles, tránsito ni restricciones del camión. Podés seguirla o elegir cualquier cliente.</p>'+ (orden.length?'<ol>'+orden.map(p=>'<li>'+esc(p.codigo_cliente+' · '+p.nombre_cliente)+' · Despacho '+esc(p.despacho)+'</li>').join('')+'</ol>':'<p>No hay entregas pendientes con coordenadas.</p>')+(sinCoordenadas.length?'<p>'+sinCoordenadas.length+' entregas sin coordenadas no incluidas en la sugerencia.</p>':'');$('#ruta-sugerida').hidden=false;};
 const entregados=stops.filter(p=>vs.some(v=>v.reparto_id===p.reparto_id&&v.codigo_cliente===p.codigo_cliente&&['ENTREGADO','CERRADO'].includes(v.estado))).length;

 agregarVista.html=`<div class="conductor-resumen"><div><strong>${stops.length}</strong><span>Clientes</span></div><div><strong>${entregados}</strong><span>Entregados</span></div><div><strong>${stops.length-entregados}</strong><span>Pendientes</span></div></div><div class="conductor-controles"><button id="gpsin">Iniciar recorrido</button><button id="navproximo" type="button">Navegar al próximo</button><button id="sugerir-ruta" type="button">Sugerir ruta</button><button id="gpsout">Detener recorrido</button><p id="gpsestado" aria-live="polite">GPS: sin iniciar</p></div>`;

 agregarVista.html='<div class="conductor-entregas" id="ruta-sugerida" hidden></div>';
 $('#sugerir-ruta').onclick=mostrarSugerencia;
 // Mapa del reparto: puntos con coordenadas y traza GPS de esta sesión.
 agregarVista.html=`<div class="conductor-mapa"><div id="mapa-conductor"></div><p id="mapa-aviso" class="muted"></p></div>`;
 let mapaConductor=null,marcadorGps=null,trazaGps=null;
 const puntos=[],clientesSinGps=[];
 if(window.L){
   mapaConductor=L.map('mapa-conductor').setView([-34.65,-58.8],11);
   L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{attribution:'© OpenStreetMap contributors',maxZoom:19}).addTo(mapaConductor);
   const clientesVistos=new Set();
   stops.forEach((p,i)=>{
     const k=p.reparto_id+'|'+p.codigo_cliente;
     if(clientesVistos.has(k))return;clientesVistos.add(k);
     const lat=Number(p.latitud),lng=Number(p.longitud);
     if(p.latitud==null||p.longitud==null||!Number.isFinite(lat)||!Number.isFinite(lng)||Math.abs(lat)>90||Math.abs(lng)>180){clientesSinGps.push(p);return;}
     const entregado=vs.some(v=>v.reparto_id===p.reparto_id&&v.codigo_cliente===p.codigo_cliente&&['ENTREGADO','CERRADO'].includes(v.estado));
     const color=entregado?'#16a34a':'#dc2626';
     const icon=L.divIcon({className:'',html:'<div class="conductor-pin" style="background:'+color+'">'+(i+1)+'</div>',iconSize:[30,30],iconAnchor:[15,15]});
     L.marker([lat,lng],{icon}).addTo(mapaConductor).bindPopup('<strong>'+esc(p.codigo_cliente+' · '+p.nombre_cliente)+'</strong><p>Despacho '+esc(p.despacho)+'</p><button type="button" class="abrir-entrega" data-stop="'+i+'">Registrar entrega</button><button type="button" class="navegar-entrega" data-nav="'+i+'">Navegar con Maps</button>');
     puntos.push([lat,lng]);
   });
   if(puntos.length)mapaConductor.fitBounds(puntos,{padding:[24,24],maxZoom:15});
   trazaGps=L.polyline([],{color:'#16753c',weight:4}).addTo(mapaConductor);
   setTimeout(()=>mapaConductor.invalidateSize(),200);
 }else $('#mapa-aviso').textContent='No se pudo cargar el mapa. Revisá la conexión a Internet.';
 if(window.L)$('#mapa-aviso').textContent=puntos.length+' puntos ubicados · '+clientesSinGps.length+' clientes sin coordenadas. La línea verde muestra solo el GPS registrado en esta sesión; no es una ruta de navegación.';
 $('#navproximo').onclick=()=>{const siguiente=ordenSugerido.find(p=>!entregado(p))||stops.find(p=>coordValida(p)&&!entregado(p));if(siguiente)abrirMaps(siguiente);else mensaje('No hay entregas pendientes con coordenadas válidas.');};
 const actualizarMapaGps=(lat,lng)=>{ultimaUbicacion={latitud:lat,longitud:lng};
   if(!mapaConductor)return;
   if(!marcadorGps){marcadorGps=L.circleMarker([lat,lng],{radius:9,color:'#0754a5',fillColor:'#3b82f6',fillOpacity:1}).addTo(mapaConductor).bindPopup('Mi ubicación actual');}
   else marcadorGps.setLatLng([lat,lng]);
   trazaGps.addLatLng([lat,lng]);
 };
 $('#gpsin').onclick=()=>{if(gpsWatch!==null)return;if(window.SECAndroid&&!sessionStorage.getItem('sec-dist-apk-gps')){run(async()=>{const d=await api('/gps-apk/iniciar',{method:'POST'});localStorage.setItem('vendedorId',d.clave);sessionStorage.setItem('sec-dist-apk-gps','1');location.reload();})();return;}if(!navigator.geolocation){mensaje('El dispositivo no dispone de ubicación.');return;}gpsWatch=navigator.geolocation.watchPosition(pos=>{api('/gps',{method:'POST',body:JSON.stringify({conductor_id:usuario.id,latitud:pos.coords.latitude,longitud:pos.coords.longitude,precision_metros:pos.coords.accuracy,velocidad:pos.coords.speed,fecha_local:new Date(pos.timestamp).toISOString()})}).then(()=>{actualizarMapaGps(pos.coords.latitude,pos.coords.longitude);$('#gpsestado')&&($('#gpsestado').textContent='Último punto enviado: '+new Date(pos.timestamp).toLocaleTimeString());}).catch(e=>mensaje('GPS: '+e.message));},e=>mensaje('Ubicación: '+e.message),{enableHighAccuracy:true,maximumAge:0,timeout:20000});};

 $('#gpsout').onclick=run(async()=>{detenerGps();await api('/gps-apk/detener',{method:'POST'});if(window.SECAndroid||usuario?.rol==='CONDUCTOR'){sessionStorage.removeItem('sec-dist-apk-gps');localStorage.removeItem('vendedorId');location.href='salida/login-vendedor.html';}});

 if(window.SECAndroid&&sessionStorage.getItem('sec-dist-apk-gps'))$('#gpsin').onclick();

 agregarVista.html=`<div class="conductor-entregas"><h3>Mis entregas de hoy</h3>${stops.map((p,i)=>{const v=vs.find(v=>v.reparto_id===p.reparto_id&&v.codigo_cliente===p.codigo_cliente);return `<div class="conductor-cliente"><div><strong>${esc(p.codigo_cliente+' · '+p.nombre_cliente)}</strong><small>Despacho ${esc(p.despacho)} · ${esc(v?.estado||'Pendiente')}</small></div><div class="conductor-acciones"><button data-stop="${i}">Registrar</button><button data-nav="${i}" class="btn-maps">Navegar</button></div></div>`;}).join('')}</div>`;
 const abrirEntrega=i=>run(()=>resultado(stops[i]))();
 document.querySelectorAll('[data-stop]').forEach(b=>b.onclick=()=>abrirEntrega(+b.dataset.stop));
 document.querySelectorAll('[data-nav]').forEach(b=>b.onclick=()=>abrirMaps(stops[+b.dataset.nav]));
 if(mapaConductor)mapaConductor.on('popupopen',e=>{const btn=e.popup.getElement()?.querySelector('.abrir-entrega');if(btn)btn.onclick=()=>abrirEntrega(+btn.dataset.stop);const nav=e.popup.getElement()?.querySelector('.navegar-entrega');if(nav)nav.onclick=()=>abrirMaps(stops[+nav.dataset.nav]);});

}

function detenerGps(){if(gpsWatch!==null)navigator.geolocation.clearWatch(gpsWatch);gpsWatch=null;if($('#gpsestado'))$('#gpsestado').textContent='Recorrido detenido.';}

async function resultado(p){$('#vista').innerHTML=`<h2>${esc(p.codigo_cliente+' · '+p.nombre_cliente)}</h2><div class="panel"><form id="resultado"><label>Resultado<select name="estado"><option>ENTREGADO</option><option>CERRADO</option><option>INCIDENCIA</option><option>VISITADO</option></select></label><label>Observación<textarea name="observacion" maxlength="3000"></textarea></label><label>Foto opcional (JPEG / PNG, hasta 5 MB)<input id="foto" type="file" accept="image/jpeg,image/png" capture="environment"></label><button>Guardar</button></form></div>`;$('#resultado').onsubmit=e=>{e.preventDefault();run(async()=>{const file=$('#foto').files[0];if(file&&file.size>5*1024*1024)throw Error('La foto supera 5 MB');const v=await api('/visitas',{method:'POST',body:JSON.stringify({...Object.fromEntries(new FormData(e.target)),reparto_id:p.reparto_id,codigo_cliente:p.codigo_cliente})});if(file){const f=new FormData();f.append('archivo',file);try{await api('/visitas/'+v.id+'/foto',{method:'POST',body:f});}catch(err){throw Error('Resultado guardado; la foto no se guardó: '+err.message);}}await abrir('App Conductor');mensaje('Resultado guardado.');})();};}

async function recorridos(){

 const cs=usuario?.rol==='CONDUCTOR'?[]:await api('/conductores');agregarVista.html=`<div class="panel"><label>Fecha<input id="recfecha" type="date" value="${fechaHoy()}"></label>${cs.length?`<label>Conductor<select id="recconductor">${cs.map(c=>`<option value="${esc(c.id)}">${esc(c.nombre+' '+c.apellido)}</option>`).join('')}</select></label>`:''}<button id="cargarrec">Ver recorrido</button><p id="recinfo"></p><div id="mapa"></div><label>Recrear posición<input id="replay" type="range" min="0" max="0" value="0"></label><p id="hora"></p><div id="visitaslista"></div></div>`;

 $('#cargarrec').onclick=run(async()=>{const f=$('#recfecha').value;if(!f)throw Error('Seleccionar fecha');const id=$('#recconductor')?.value;const puntos=await api('/gps?fecha='+f+(id?'&conductor_id='+encodeURIComponent(id):''));let visitas=await api('/visitas?fecha='+f);if(id)visitas=visitas.filter(v=>v.conductor_id===id);$('#visitaslista').innerHTML=tabla(['Cliente','Resultado','Llegada','Permanencia registrada','Fotos'],visitas.map(v=>[esc(v.codigo_cliente+' · '+v.nombre_cliente),esc(v.estado),esc(new Date(v.llegada).toLocaleString('es-AR')),esc(Math.round(Number(v.permanencia_segundos)/60)+' min'),`<button data-fotos="${esc(v.id)}">Ver fotos</button>`]));document.querySelectorAll('[data-fotos]').forEach(b=>b.onclick=run(async()=>{const fs=await api('/visitas/'+b.dataset.fotos+'/fotos');for(const f of fs){const r=await fetch(API+'/fotos/'+f.id,{headers:{Authorization:'Bearer '+token}});if(!r.ok)throw Error('No se pudo cargar la foto');const url=URL.createObjectURL(await r.blob()),img=document.createElement('img');img.src=url;img.style.maxWidth='100%';img.onload=()=>URL.revokeObjectURL(url);b.parentNode.appendChild(img);}if(!fs.length)mensaje('Esta visita no tiene fotos.');b.disabled=true;}));

 $('#recinfo').textContent=puntos.length+' puntos registrados. Los saltos mayores a 5 minutos se muestran como tramos separados.';if(mapa)mapa.remove();if(!window.L)throw Error('No se pudo cargar el mapa');mapa=L.map('mapa').setView([-34.65,-58.8],12);L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{attribution:'© OpenStreetMap contributors',maxZoom:19}).addTo(mapa);let tramo=[];for(let i=0;i<puntos.length;i++){if(i&&new Date(puntos[i].fecha)-new Date(puntos[i-1].fecha)>300000){L.polyline(tramo).addTo(mapa);tramo=[];}tramo.push([Number(puntos[i].latitud),Number(puntos[i].longitud)]);}if(tramo.length)L.polyline(tramo).addTo(mapa);if(puntos.length){mapa.fitBounds(puntos.map(p=>[Number(p.latitud),Number(p.longitud)]),{maxZoom:16,padding:[20,20]});const marker=L.marker([puntos[0].latitud,puntos[0].longitud]).addTo(mapa);$('#replay').max=puntos.length-1;$('#replay').oninput=()=>{const p=puntos[+$('#replay').value];marker.setLatLng([p.latitud,p.longitud]);$('#hora').textContent=new Date(p.fecha).toLocaleString('es-AR')+' · precisión '+p.precision_metros+' m';};$('#replay').oninput();}else{$('#replay').max=0;$('#hora').textContent='Sin puntos para esta fecha.';}

 });await $('#cargarrec').onclick();

}





async function inicio(){

 if(usuario?.rol!=='CONDUCTOR'){

  await menuAdministrador();

  return;

 }

 $('#nav').innerHTML='<button id="home">Volver a mis entregas</button><button id="salir">Cerrar sesión</button>';

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

    !['ADMIN','SUPERVISOR'].includes(usuario.rol) ||

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
