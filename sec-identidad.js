'use strict';
// Identidad visual oficial proporcionada por el usuario.
const SEC_IDENTIDAD={logo:'assets/logo-sec-sin-b.png',duracionPresentacionMs:3800};
function iniciarPresentacionSEC(identidad=SEC_IDENTIDAD){
 const presentacion=document.getElementById('presentacion-sec'),contenido=document.getElementById('contenido-sec');
 if(!presentacion||!contenido)return;
 if(!identidad.logo){presentacion.hidden=true;contenido.hidden=false;return;}
 let terminada=false,temporizador;
 const terminar=()=>{if(terminada)return;terminada=true;clearTimeout(temporizador);presentacion.hidden=true;contenido.hidden=false;contenido.inert=false;};
 const imagenes=[...document.querySelectorAll('[data-sec-logo]')];
 for(const img of imagenes){img.addEventListener('error',()=>{img.hidden=true;terminar();},{once:true});img.src=identidad.logo;img.hidden=false;}
 // El formulario se prepara detrás de la presentación y se habilita al terminar.
 contenido.hidden=true;contenido.inert=true;presentacion.hidden=false;
 const sinMovimiento=window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
 temporizador=setTimeout(terminar,sinMovimiento?600:identidad.duracionPresentacionMs);
}
iniciarPresentacionSEC();
