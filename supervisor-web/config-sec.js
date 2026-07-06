const API_CONFIG = "https://sec-backend-gg4j.onrender.com";

async function cargarConfiguracionSEC() {
  try {
    const config = await fetch(`${API_CONFIG}/configuracion`)
      .then(r => r.json());

    if (config.logo_base64) {
      document.querySelectorAll(".logo-rebesa").forEach(img => {
        img.src = config.logo_base64;
      });
    }

    if (config.nombre_empresa) {
      document.querySelectorAll(".nombre-empresa-sec").forEach(el => {
        el.textContent = config.nombre_empresa;
      });
    }

  } catch (error) {
    console.log("No se pudo cargar configuración SEC");
  }
}

document.addEventListener("DOMContentLoaded", cargarConfiguracionSEC);