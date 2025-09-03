fetch("/admin/componentes/footer.html")
  .then(res => res.text())
  .then(html => {
    document.getElementById("footer-container").innerHTML = html;
  })
  .catch(error => {
    console.error("❌ Error al cargar el footer:", error);
    document.getElementById("footer-container").innerText = "Footer no encontrado";
  });
