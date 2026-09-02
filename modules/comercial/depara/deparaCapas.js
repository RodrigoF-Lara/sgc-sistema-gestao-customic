document.addEventListener("DOMContentLoaded", async () => {
  const API = "/api/comercial/depara";
  const tbody = document.getElementById("tbody");
  const msg = document.getElementById("msg");
  const busca = document.getElementById("busca");
  const filtroLinha = document.getElementById("filtroLinha");
  const modal = document.getElementById("modal");
  const form = document.getElementById("formDePara");
  let podeEditar = true;
  let linhas = [];

  function authHeaders() {
    const h = { "Content-Type": "application/json" };
    if (window.SGCPermissoes) Object.assign(h, window.SGCPermissoes.authHeaders());
    const nome = localStorage.getItem("userName");
    if (nome) h["x-user-name"] = nome;
    return h;
  }

  function setMsg(text, isErr) {
    msg.textContent = text || "";
    msg.className = "msg " + (isErr ? "err" : "ok");
  }

  function escapeHtml(s) {
    return String(s || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }

  async function api(acao, opts) {
    const method = (opts && opts.method) || "GET";
    const params = new URLSearchParams({ acao, ...((opts && opts.query) || {}) });
    const res = await fetch(`${API}?${params}`, {
      method,
      headers: authHeaders(),
      body: method === "GET" ? undefined : JSON.stringify(opts.body || {}),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data.success === false) {
      throw new Error(data.error || data.message || `Erro ${res.status}`);
    }
    return data;
  }

  function openModal(row) {
    form.reset();
    form.id.value = row && row.id ? row.id : "";
    form.codPerso.value = (row && row.codPerso) || "";
    form.codOrigem.value = (row && row.codOrigem) || "";
    form.linha.value = (row && row.linha) || "";
    form.descricao.value = (row && row.descricao) || "";
    document.getElementById("modalTitulo").textContent = row && row.id ? "Editar de/para" : "Novo de/para";
    modal.style.display = "block";
  }

  function closeModal() {
    modal.style.display = "none";
  }

  async function carregarLinhas() {
    try {
      const data = await api("linhas");
      linhas = data.data || [];
      filtroLinha.innerHTML =
        `<option value="">Todas as linhas</option>` +
        linhas.map((l) => `<option value="${escapeHtml(l)}">${escapeHtml(l)}</option>`).join("");
      document.getElementById("listaLinhas").innerHTML = linhas
        .map((l) => `<option value="${escapeHtml(l)}"></option>`)
        .join("");
    } catch (_) {
      /* ignore */
    }
  }

  async function carregar() {
    tbody.innerHTML = `<tr><td colspan="5" style="padding:20px;color:#667085;">Carregando…</td></tr>`;
    try {
      const data = await api("listar", {
        query: { q: busca.value.trim(), linha: filtroLinha.value },
      });
      const rows = data.data || [];
      if (!rows.length) {
        tbody.innerHTML = `<tr><td colspan="5" style="padding:24px;color:#667085;">Nenhum de/para encontrado.</td></tr>`;
        return;
      }
      tbody.innerHTML = rows
        .map(
          (r) => `<tr>
            <td class="cod">${escapeHtml(r.codPerso)}</td>
            <td class="cod">${escapeHtml(r.codOrigem)}</td>
            <td>${r.linha ? `<span class="linha-tag">${escapeHtml(r.linha)}</span>` : "—"}</td>
            <td>${escapeHtml(r.descricao || "—")}</td>
            <td class="acoes-cell">
              ${
                podeEditar
                  ? `<button type="button" data-edit="${r.id}">Editar</button>
                     <button type="button" class="btn-del" data-del="${r.id}" data-perso="${escapeHtml(r.codPerso)}">Excluir</button>`
                  : ""
              }
            </td>
          </tr>`
        )
        .join("");
    } catch (err) {
      tbody.innerHTML = `<tr><td colspan="5" style="padding:20px;color:#b42318;">${escapeHtml(err.message)}</td></tr>`;
    }
  }

  if (window.SGCPermissoes) {
    await window.SGCPermissoes.carregar();
    const ok =
      window.SGCPermissoes.podeAcessar("capa-depara") ||
      window.SGCPermissoes.podeAcessar("pedido-capa") ||
      window.SGCPermissoes.podeAcessar("pedido-capa-producao");
    if (!ok) {
      alert("Acesso negado.");
      window.location.href = "/menu.html";
      return;
    }
    podeEditar =
      window.SGCPermissoes.podeAcessar("capa-depara") ||
      window.SGCPermissoes.podeAcessar("pedido-capa") ||
      window.SGCPermissoes.isAdmin();
    if (!podeEditar) document.getElementById("btnNovo").style.display = "none";
  }

  document.getElementById("btnNovo").addEventListener("click", () => openModal(null));
  document.getElementById("btnFiltrar").addEventListener("click", carregar);
  busca.addEventListener("keydown", (e) => {
    if (e.key === "Enter") carregar();
  });
  filtroLinha.addEventListener("change", carregar);
  document.getElementById("modalClose").addEventListener("click", closeModal);
  document.getElementById("btnCancelar").addEventListener("click", closeModal);
  window.addEventListener("click", (e) => {
    if (e.target === modal) closeModal();
  });

  tbody.addEventListener("click", async (e) => {
    const editId = e.target.getAttribute("data-edit");
    const delId = e.target.getAttribute("data-del");
    if (editId) {
      try {
        const data = await api("obter", { query: { id: editId } });
        openModal(data.data);
      } catch (err) {
        setMsg(err.message, true);
      }
    }
    if (delId) {
      const perso = e.target.getAttribute("data-perso") || delId;
      if (!confirm(`Excluir o de/para do perso ${perso}?`)) return;
      try {
        await api("excluir", { method: "POST", body: { id: Number(delId), acao: "excluir" } });
        setMsg("Registro excluído.");
        await carregar();
      } catch (err) {
        setMsg(err.message, true);
      }
    }
  });

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const body = {
      id: form.id.value ? Number(form.id.value) : null,
      codPerso: form.codPerso.value.trim(),
      codOrigem: form.codOrigem.value.trim(),
      linha: form.linha.value.trim(),
      descricao: form.descricao.value.trim(),
    };
    try {
      if (body.id) {
        await api("atualizar", { method: "POST", body: { ...body, acao: "atualizar" } });
        setMsg("De/para atualizado.");
      } else {
        await api("criar", { method: "POST", body: { ...body, acao: "criar" } });
        setMsg("De/para criado.");
      }
      closeModal();
      await carregarLinhas();
      await carregar();
    } catch (err) {
      setMsg(err.message, true);
    }
  });

  try {
    await carregarLinhas();
    await carregar();
  } catch (err) {
    setMsg(err.message, true);
  }
});
