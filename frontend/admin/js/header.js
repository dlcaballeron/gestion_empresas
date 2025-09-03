fetch("/admin/componentes/header.html")
  .then(res => res.text())
  .then(html => {
    document.getElementById("header-container").innerHTML = html;
  })
  .catch(error => {
    console.error("❌ Error al cargar el header:", error);
    document.getElementById("header-container").innerText = "Header no encontrado";
  });
