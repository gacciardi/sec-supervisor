 'use strict';
function claveAlertaEquipoSEC(a){return [a.tipo,a.id,a.informada_en||a.creada_en||''].join('|');}
function claveReceptorEquipoSEC(u){return 'sec-alertas-leidas-equipo|'+u.empresa_id+'|'+u.id;}
function lecturasEquipoSEC(u){try{return JSON.parse(localStorage.getItem(claveReceptorEquipoSEC(u))||'{}');}catch{return {};}}
function marcarAlertaEquipoSEC(a,u){if(!a)return;const leidas=lecturasEquipoSEC(u),ahora=Date.now();for(const k in leidas)if(ahora-leidas[k]>7*86400000)delete leidas[k];leidas[claveAlertaEquipoSEC(a)]=ahora;localStorage.setItem(claveReceptorEquipoSEC(u),JSON.stringify(leidas));}
function alertaRecienteEquipoSEC(a){return Date.now()-Date.parse(a.informada_en||a.creada_en||'')<86400000;}
// La recepción compartida depende del estado confirmado por el servidor.
// Una lectura local antigua nunca debe ocultar un aviso que sigue ENVIADO.
function alertaPendienteEquipoSEC(a,u){return a.estado==='ENVIADA';}
function alertaVisibleEquipoSEC(a,u){return alertaPendienteEquipoSEC(a,u);}
function tarjetaRespuestaOtroEquipoSEC(a){return '<article class="oficina-alerta"><h3>LLAMAR OFICINA · Cliente '+esc(a.codigo_cliente)+' · '+esc(a.nombre_cliente)+'</h3><p>Chofer: '+esc(a.conductor)+' · Despacho '+esc(a.despacho)+'</p><p>La oficina ya respondió desde otra sesión: <strong>'+esc(a.respuesta_nombre||'Respuesta registrada')+'</strong></p><p>'+esc(a.respuesta_observacion||'')+'</p><button type="button" data-recepcion-equipo="'+esc(a.id)+'">Confirmar recepción en este equipo</button></article>';}
