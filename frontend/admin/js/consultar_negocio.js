document.addEventListener("DOMContentLoaded", () => {
  const usuario = JSON.parse(localStorage.getItem("usuario"));
  if (!usuario) {
    alert("Debe iniciar sesión primero.");
    return window.location.href = "/admin/login.html";
  }

  const filtrosForm = document.getElementById("filtrosForm");
  const limpiarBtn = document.getElementById("btn-limpiar");

  // 👇 Obtener negocios desde backend con filtros
  async function cargarNegocios(params = "") {
    try {
      const res = await fetch(`/api/consultar-negocios/consultar${params}`);
      const negocios = await res.json();
      const tbody = document.querySelector("#tablaNegocios tbody");
      tbody.innerHTML = "";

      if (negocios.length === 0) {
        tbody.innerHTML = "<tr><td colspan='10' class='text-center'>No se encontraron negocios</td></tr>";
        return;
      }

      negocios.forEach((negocio, index) => {
        const fila = document.createElement("tr");
        fila.innerHTML = `
          <td>${index + 1}</td>
          <td><input type="text" value="${negocio.razon_social}" disabled /></td>
          <td><input type="text" value="${negocio.nit}" disabled /></td>
          <td><input type="text" value="${negocio.telefono}" disabled /></td>
          <td><input type="text" value="${negocio.descripcion}" disabled style="max-width: 200px" /></td>
          <td><input type="checkbox" ${negocio.recibe_pagos ? 'checked' : ''} disabled /></td>
          <td><img src="${negocio.logo}" alt="logo" width="50"/></td>
          <td><a href="${negocio.url_publica || '#'}" target="_blank">Ver</a></td>
          <td class="estado">${negocio.estado === 1 ? "Activo" : "Desactivado"}</td>
          <td>
            <button class="btn-modificar btn btn-warning" data-id="${negocio.id}">Modificar</button>
            <button class="btn-estado btn btn-secondary" data-id="${negocio.id}" data-estado="${negocio.estado}">
              ${negocio.estado === 1 ? 'Desactivar' : 'Activar'}
            </button>
          </td>
        `;
        tbody.appendChild(fila);
      });

      agregarEventosBotones();
    } catch (err) {
      console.error("❌ Error al cargar negocios:", err);
      document.getElementById("tablaNegocios").innerHTML =
        "<tr><td colspan='10' class='text-center text-danger'>Error al cargar datos</td></tr>";
    }
  }

  // 👇 Evento al aplicar filtros
  filtrosForm.addEventListener("submit", (e) => {
    e.preventDefault();

    const formData = new FormData(filtrosForm);
    const query = new URLSearchParams();

    for (const [key, value] of formData.entries()) {
      if (value.trim() !== "") {
        query.append(key, value.trim());
      }
    }

    const queryString = query.toString() ? `?${query.toString()}` : "";
    cargarNegocios(queryString);
  });

  // 👇 Evento al limpiar filtros
  limpiarBtn.addEventListener("click", () => {
    filtrosForm.reset();
    cargarNegocios(); // trae todo sin filtros
  });

  // 👇 Acciones (modificar / estado)
  function agregarEventosBotones() {
    document.querySelectorAll(".btn-modificar").forEach(btn => {
      btn.addEventListener("click", async (e) => {
        const row = e.target.closest("tr");
        const id = btn.getAttribute("data-id");

        if (btn.textContent === "Modificar") {
          btn.textContent = "Pendiente Actualizar";
          row.querySelectorAll("input[type='text'], input[type='checkbox']").forEach(input => input.disabled = false);
        } else {
          const inputs = row.querySelectorAll("input");
          const razon_social = inputs[0].value;
          const nit = inputs[1].value;
          const telefono = inputs[2].value;
          const descripcion = inputs[3].value;
          const recibe_pagos = inputs[4].checked ? 1 : 0;

          try {
            const res = await fetch(`/api/consultar-negocios/actualizar/${id}`, {
              method: "PUT",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ razon_social, nit, telefono, descripcion, recibe_pagos })
            });

            const data = await res.json();
            if (res.ok) {
              alert(data.mensaje);
              btn.textContent = "Modificar";
              row.querySelectorAll("input").forEach(input => input.disabled = true);
            } else {
              throw new Error(data.error || "Error al actualizar");
            }
          } catch (err) {
            alert("❌ Error al actualizar negocio");
            console.error(err);
          }
        }
      });
    });

    document.querySelectorAll(".btn-estado").forEach(btn => {
      btn.addEventListener("click", async () => {
        const id = btn.getAttribute("data-id");
        const estadoActual = parseInt(btn.getAttribute("data-estado"));
        const nuevoEstado = estadoActual === 1 ? 0 : 1;

        if (!confirm(`¿Seguro que desea ${nuevoEstado === 1 ? 'activar' : 'desactivar'} este negocio?`)) return;

        try {
          const res = await fetch(`/api/consultar-negocios/estado/${id}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ nuevo_estado: nuevoEstado })
          });

          const data = await res.json();
          if (res.ok) {
            alert(data.mensaje);
            cargarNegocios(); // Recargar después del cambio
          } else {
            throw new Error(data.error || "Error al cambiar estado");
          }
        } catch (err) {
          alert("❌ Error al cambiar estado");
          console.error(err);
        }
      });
    });
  }

  // 🚀 Cargar todos al inicio
  cargarNegocios();
});
