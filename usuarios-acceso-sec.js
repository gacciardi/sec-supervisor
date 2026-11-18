'use strict';
function headersUsuariosSEC(){const h={Authorization:'Bearer '+(sessionStorage.getItem('sec-unificado-token')||sessionStorage.getItem('sec-distribucion-token')||'')};if(sessionStorage.getItem('sec-master-global')==='1'&&sessionStorage.getItem('sec-master-empresa'))h['X-SEC-Empresa']=sessionStorage.getItem('sec-master-empresa');return h;}
document.documentElement.style.visibility='hidden';
(async()=>{try{const r=await fetch('https://sec-backend-gg4j.onrender.com/distribucion/acceso/me',{headers:headersUsuariosSEC()}),a=await r.json();if(!r.ok||a.rol!=='ADMIN'||!a.es_master&&!a.sectores?.includes('COMERCIAL')){location.replace('index.html');return;}document.documentElement.style.visibility='visible';}catch{location.replace('index.html');}})();
