// ✅ Verifica sesión del usuario
const usuario = JSON.parse(localStorage.getItem("usuario"));
if (!usuario) {
  alert("Debe iniciar sesión primero.");
  window.location.href = "login.html";
}

// ✅ Ruta relativa del HTML del menú lateral
const rutaMenu = "../../componentes/menu-lateral.html"; // Ajústala si cambia el nivel de carpetas

// ✅ Cargar el menú lateral
fetch(rutaMenu)
  .then(res => res.text())
  .then(html => {
    document.getElementById("menu-lateral-container").innerHTML = html;

    // 🔁 Eventos deben vincularse después de insertar el HTML
    document.querySelector(".toggle-btn")?.addEventListener("click", toggleSidebar);
    document.querySelector(".cerrar-sesion")?.addEventListener("click", cerrarSesion);
  })
  .catch(error => {
    console.error("❌ Error al cargar el menú lateral:", error);
  });

// ✅ Mostrar u ocultar la barra lateral
function toggleSidebar() {
  const sidebar = document.getElementById("sidebar");
  sidebar?.classList.toggle("active");
}

// ✅ Cerrar sesión
function cerrarSesion() {
  if (confirm("¿Deseas cerrar sesión?")) {
    localStorage.removeItem("usuario");
    localStorage.removeItem("autenticado"); // opcional
    alert("Sesión cerrada correctamente.");
    window.location.href = "login.html";
  }
}
