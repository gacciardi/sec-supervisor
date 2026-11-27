'use strict';
document.documentElement.style.visibility='hidden';
(async()=>{try{const t=sessionStorage.getItem('sec-unificado-token')||sessionStorage.getItem('sec-distribucion-token')||'',headers={Authorization:'Bearer '+t};if(sessionStorage.getItem('sec-master-global')==='1'&&sessionStorage.getItem('sec-master-empresa'))headers['X-SEC-Empresa']=sessionStorage.getItem('sec-master-empresa');const r=await fetch('https://sec-backend-gg4j.onrender.com/distribucion/acceso/me',{headers}),u=await r.json();if(!r.ok||!u.sectores?.includes('COMERCIAL')||!['ADMIN','SUPERVISOR','OPERADOR'].includes(u.rol)){location.replace('index.html');return;}document.documentElement.style.visibility='visible';}catch{location.replace('index.html');}})();

// Los accesos de Comercial regresan al menú del sector, sin cerrar la sesión.
function prepararRegresoComercialSEC(){
 const links=Array.from(document.querySelectorAll('a[href]'));
 for(const a of links){let u;try{u=new URL(a.getAttribute('href'),location.href);}catch{continue;}
  if(u.origin===location.origin&&u.pathname==='/index.html'&&!a.hasAttribute('data-inicio-sec')){a.href='comercial.html';a.textContent='Volver al menú de Comercial';}
 }
 if(!document.querySelector('a[href="comercial.html"]')){
  const nav=document.createElement('nav'),a=document.createElement('a');nav.setAttribute('aria-label','Regresar a Comercial');nav.id='sec-regreso-comercial';a.href='comercial.html';a.textContent='← Volver al menú de Comercial';a.style.cssText='display:inline-block;padding:10px 16px;border:1px solid #cbd5e1;border-radius:9px;background:#fff;color:#071b3a;text-decoration:none;font:600 15px system-ui';nav.style.cssText='padding:12px;position:relative;z-index:1100';if(location.pathname.endsWith('/supervisor.html'))nav.style.cssText='position:fixed;right:16px;bottom:16px;z-index:1100';nav.appendChild(a);document.body.prepend(nav);
 }
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',prepararRegresoComercialSEC,{once:true});else prepararRegresoComercialSEC();
