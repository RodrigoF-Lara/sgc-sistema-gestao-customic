document.addEventListener("DOMContentLoaded", async () => {
  const P = window.PedidosCapa;
  const id = Number(new URLSearchParams(location.search).get("id"));
  const erro = document.getElementById("erro");
  let pedido = null;
  let podeCom = true;
  let podeProd = true;

  if (window.SGCPermissoes) {
    await window.SGCPermissoes.carregar();
    podeCom = window.SGCPermissoes.podeAcessar("pedido-capa");
    podeProd = window.SGCPermissoes.podeAcessar("pedido-capa-producao");
    if (!podeCom && !podeProd) {
      alert("Acesso negado.");
      window.location.href = "/menu.html";
      return;
    }
  }

  if (!id) {
    erro.textContent = "Pedido inválido.";
    return;
  }

  function escapeHtml(s) {
    return String(s || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }

  async function loadImg(el, tipo) {
    try {
      const res = await fetch(`/api/comercial/pedidos?acao=anexo&id=${id}&tipo=${tipo}`, {
        headers: P.authHeaders(),
      });
      if (!res.ok) {
        el.replaceWith(Object.assign(document.createElement("p"), { textContent: "Sem arquivo.", className: "meta" }));
        return;
      }
      const blob = await res.blob();
      el.src = URL.createObjectURL(blob);
    } catch {
      el.alt = "Falha ao carregar";
    }
  }

  async function carregar() {
    const data = await P.api("obter", { query: { id: String(id) } });
    pedido = data.data;
    document.getElementById("titulo").innerHTML =
      `${escapeHtml(pedido.codigoInterno)} ${P.statusBadge(pedido.status)}`;
    document.getElementById("subtitulo").textContent =
      `${pedido.cliente} · ${pedido.modeloNome}`;
    const rows = [
      ["Nº interno (PK)", pedido.codigoInterno],
      ["Nº do pedido", pedido.numeroPedido || "—"],
      ["Cliente", pedido.cliente],
      ["Contato", pedido.contato || "—"],
      ["Telefone", pedido.telefone || "—"],
      ["Modelo", pedido.modeloNome],
      ["Código perso (pedido)", pedido.codPerso || "—"],
      ["Código origem (produzir)", pedido.codOrigem || "—"],
      ["Linha", pedido.linhaProduto || "—"],
      ["Quantidade", String(pedido.quantidade)],
      ["Data do pedido", P.fmtDate(pedido.dataPedido)],
      ["Necessidade", P.fmtDate(pedido.dataNecessidade)],
      ["Prioridade", pedido.prioridade === "URGENTE" ? "Urgente" : "Normal"],
      ["Vendedor", pedido.vendedor || "—"],
      ["Observação", pedido.observacao || "—"],
    ];
    document.getElementById("dados").innerHTML = rows
      .map(([k, v]) => `<span>${k}</span><strong>${escapeHtml(v)}</strong>`)
      .join("");

    const acoes = document.getElementById("acoes");
    acoes.innerHTML = "";
    const add = (cls, label, status) => {
      const b = document.createElement("button");
      b.className = cls;
      b.textContent = label;
      b.addEventListener("click", () => mudar(status));
      acoes.appendChild(b);
    };
    if (pedido.status === "RASCUNHO" && podeCom) {
      const edit = document.createElement("button");
      edit.className = "btn-ok";
      edit.textContent = "Editar rascunho (arte e print)";
      edit.addEventListener("click", () => {
        window.location.href = `./novoPedido?id=${pedido.id}`;
      });
      acoes.appendChild(edit);
      if (pedido.hasPreview) {
        add("btn-prod", "Enviar para produção", "EM_PRODUCAO");
      } else {
        const warn = document.createElement("p");
        warn.className = "meta";
        warn.style.margin = "0";
        warn.textContent = "Falta o print e a foto. Edite o rascunho para montar a arte antes de enviar.";
        acoes.appendChild(warn);
      }
      add("btn-cancel", "Cancelar", "CANCELADO");
    }
    if (pedido.status === "EM_PRODUCAO" && podeProd) {
      add("btn-ok", "Marcar como produzido", "PRODUZIDO");
    }
    if (pedido.status === "EM_PRODUCAO" && podeCom) {
      add("btn-cancel", "Cancelar", "CANCELADO");
    }
    if (pedido.status === "PRODUZIDO" && podeProd) {
      add("btn-done", "Marcar como enviado", "ENVIADO");
    }

    const logs = await P.api("logs", { query: { id: String(id) } });
    const acaoLabel = {
      CRIADO: "Pedido criado",
      ATUALIZADO: "Rascunho atualizado",
      ENVIADO_PRODUCAO: "Enviado para produção",
      PRODUZIDO: "Marcado como produzido",
      ENVIADO: "Marcado como enviado",
      CANCELADO: "Cancelado",
    };
    document.getElementById("logs").innerHTML = (logs.data || [])
      .map(
        (l) => `<li>
          <strong>${acaoLabel[l.acao] || l.acao}</strong>
          <em>${escapeHtml(l.usuario)} · ${P.fmtDateTime(l.criadoEm)}</em>
          ${l.detalhe ? `<div>${escapeHtml(l.detalhe)}</div>` : ""}
        </li>`
      )
      .join("") || "<li>Sem eventos ainda.</li>";

    if (pedido.hasPreview) loadImg(document.getElementById("imgPreview"), "PREVIEW");
    else document.getElementById("imgPreview").replaceWith(p("Sem print da montagem."));
    if (pedido.hasArte) loadImg(document.getElementById("imgArte"), "ARTE");
    else document.getElementById("imgArte").replaceWith(p("Sem arte original."));
  }

  function p(text) {
    const el = document.createElement("p");
    el.className = "meta";
    el.textContent = text;
    return el;
  }

  async function mudar(status) {
    const detalhe = status === "CANCELADO" ? prompt("Motivo do cancelamento (opcional):") : "";
    if (status === "CANCELADO" && detalhe === null) return;
    try {
      await P.api("status", { method: "POST", body: { id, status, detalhe } });
      await carregar();
    } catch (err) {
      erro.textContent = err.message;
    }
  }

  try {
    await carregar();
  } catch (err) {
    erro.textContent = err.message;
  }
});
