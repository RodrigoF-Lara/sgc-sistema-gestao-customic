document.addEventListener("DOMContentLoaded", async () => {
  const P = window.PedidosCapa;
  const params = new URLSearchParams(location.search);
  const fila = params.get("fila") === "1";
  const tbody = document.getElementById("tbody");
  const empty = document.getElementById("empty");
  const busca = document.getElementById("busca");
  const filtro = document.getElementById("filtroStatus");
  const btnNovo = document.getElementById("btnNovo");

  if (window.SGCPermissoes) {
    await window.SGCPermissoes.carregar();
    const okCom = window.SGCPermissoes.podeAcessar("pedido-capa");
    const okProd = window.SGCPermissoes.podeAcessar("pedido-capa-producao");
    if (!(okCom || okProd)) {
      alert("Acesso negado.");
      window.location.href = "/menu.html";
      return;
    }
    if (fila && !okProd && !okCom) {
      window.location.href = "/menu.html";
      return;
    }
    if (!okCom) btnNovo.style.display = "none";
  }

  if (fila) {
    document.getElementById("pageTitle").innerHTML =
      '<i class="fa-solid fa-industry"></i> Fila de capas personalizadas';
    document.getElementById("pageSub").textContent =
      "Pedidos em produção ou prontos para envio.";
    btnNovo.style.display = "none";
    filtro.value = "";
    filtro.querySelector('option[value="RASCUNHO"]').hidden = true;
    filtro.querySelector('option[value="CANCELADO"]').hidden = true;
    filtro.querySelector('option[value="ENVIADO"]').hidden = true;
  }

  async function carregar() {
    tbody.innerHTML = `<tr><td colspan="8" class="empty">Carregando…</td></tr>`;
    empty.hidden = true;
    const query = { q: busca.value.trim() };
    if (fila) query.fila = "1";
    if (filtro.value) query.status = filtro.value;
    try {
      const data = await P.api("listar", { query });
      const rows = data.data || [];
      if (!rows.length) {
        tbody.innerHTML = "";
        empty.hidden = false;
        return;
      }
      tbody.innerHTML = rows
        .map((p) => {
          const urgente = p.prioridade === "URGENTE" ? " pri-urgente" : "";
          return `<tr data-id="${p.id}">
            <td><strong>${p.codigoInterno}</strong></td>
            <td>${p.numeroPedido || "—"}</td>
            <td>${escapeHtml(p.cliente)}</td>
            <td>${escapeHtml(p.modeloNome)}</td>
            <td>${p.quantidade}</td>
            <td class="${urgente}">${P.fmtDate(p.dataNecessidade)}</td>
            <td>${P.statusBadge(p.status)}</td>
            <td>${escapeHtml(p.vendedor || "")}</td>
          </tr>`;
        })
        .join("");
    } catch (err) {
      tbody.innerHTML = `<tr><td colspan="8" class="empty">${escapeHtml(err.message)}</td></tr>`;
    }
  }

  function escapeHtml(s) {
    return String(s || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }

  tbody.addEventListener("click", (e) => {
    const tr = e.target.closest("tr[data-id]");
    if (tr) window.location.href = `./detalhePedido?id=${tr.dataset.id}`;
  });
  document.getElementById("btnBuscar").addEventListener("click", carregar);
  busca.addEventListener("keydown", (e) => {
    if (e.key === "Enter") carregar();
  });
  filtro.addEventListener("change", carregar);
  carregar();
});
