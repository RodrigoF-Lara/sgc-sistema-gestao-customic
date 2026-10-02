document.addEventListener("DOMContentLoaded", async () => {
  if (window.SGCPermissoes) {
    const ok = await window.SGCPermissoes.protegerPagina("projetos-kanban");
    if (!ok) return;
  }

  const API = "/api/projetos/kanban";
  const COLUNAS = [
    { id: "A FAZER", titulo: "A fazer", tom: "fazer" },
    { id: "EM ANDAMENTO", titulo: "Em andamento", tom: "andamento" },
    { id: "CONCLUIDO", titulo: "Concluído", tom: "feito" },
  ];
  const ROTULO = {
    "A FAZER": "A fazer",
    "EM ANDAMENTO": "Em andamento",
    CONCLUIDO: "Concluído",
  };

  const board = document.getElementById("board");
  const tbody = document.getElementById("tbody");
  const busca = document.getElementById("busca");
  const filtroStatus = document.getElementById("filtroStatus");
  const modal = document.getElementById("modal");
  const form = document.getElementById("formProjeto");
  const btnExcluir = document.getElementById("btnExcluir");

  let projetos = [];
  let editandoId = null;
  let dragId = null;
  let salvandoArraste = false;

  function authHeaders() {
    const h = { "Content-Type": "application/json" };
    if (window.SGCPermissoes) Object.assign(h, window.SGCPermissoes.authHeaders());
    const nivel = localStorage.getItem("userLevel");
    const nome = localStorage.getItem("userName");
    const code = localStorage.getItem("userCode");
    if (nivel) h["x-user-level"] = nivel;
    if (nome) h["x-user-name"] = nome;
    if (code) h["x-user-code"] = code;
    return h;
  }

  function usuario() {
    return localStorage.getItem("userName") || localStorage.getItem("userCode") || "SGC";
  }

  function escapeHtml(s) {
    return String(s || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  async function api(method, acao, opts) {
    const q = new URLSearchParams({ acao, ...((opts && opts.query) || {}) });
    const nivel = localStorage.getItem("userLevel");
    if (nivel) q.set("userLevel", nivel);
    const res = await fetch(`${API}?${q}`, {
      method,
      headers: authHeaders(),
      body: method === "GET" ? undefined : JSON.stringify({
        acao,
        usuario: usuario(),
        ...(opts && opts.body),
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data.success === false) throw new Error(data.error || data.message || `HTTP ${res.status}`);
    return data;
  }

  function hojeIso() {
    const d = new Date();
    const z = (n) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}`;
  }

  function fmtData(iso) {
    if (!iso) return "";
    const [y, m, d] = String(iso).split("-");
    if (!y || !m || !d) return "";
    return `${d}/${m}/${y}`;
  }

  function atrasado(p) {
    return !!(p.prazo && p.status !== "CONCLUIDO" && p.prazo < hojeIso());
  }

  function visiveis() {
    const q = busca.value.trim().toLowerCase();
    const filtro = filtroStatus.value;
    return projetos.filter((p) => {
      if (filtro && p.status !== filtro) return false;
      if (!q) return true;
      return [p.nome, p.descricao, p.responsavel].join(" ").toLowerCase().includes(q);
    });
  }

  function opcoesStatus(atual) {
    return COLUNAS
      .map((c) => `<option value="${c.id}" ${c.id === atual ? "selected" : ""}>${c.titulo}</option>`)
      .join("");
  }

  function renderLista() {
    const linhas = visiveis();
    if (!linhas.length) {
      tbody.innerHTML = `<tr><td class="empty" colspan="4">Nenhum projeto para mostrar.</td></tr>`;
      return;
    }
    tbody.innerHTML = linhas.map((p) => `
      <tr data-id="${p.id}">
        <td>
          <button type="button" class="nome-btn" data-edit="${p.id}">${escapeHtml(p.nome)}</button>
          ${p.descricao ? `<div class="muted">${escapeHtml(p.descricao)}</div>` : ""}
        </td>
        <td>${escapeHtml(p.responsavel)}</td>
        <td class="${atrasado(p) ? "atrasado" : ""}">${fmtData(p.prazo) || "—"}</td>
        <td><select class="status-sel" data-id="${p.id}" aria-label="Status de ${escapeHtml(p.nome)}">${opcoesStatus(p.status)}</select></td>
      </tr>
    `).join("");
  }

  function renderKanban() {
    const itens = visiveis();
    board.innerHTML = COLUNAS.map((col) => {
      const cards = itens
        .filter((p) => p.status === col.id)
        .sort((a, b) => a.ordem - b.ordem || a.id - b.id);
      const html = cards.map((p) => `
        <article class="kb-card" data-id="${p.id}">
          <button type="button" class="kb-handle" draggable="true" title="Arrastar" aria-label="Arrastar ${escapeHtml(p.nome)}">
            <i class="fa-solid fa-grip-vertical"></i>
          </button>
          <h3><button type="button" class="nome-btn" data-edit="${p.id}">${escapeHtml(p.nome)}</button></h3>
          ${p.descricao ? `<p>${escapeHtml(p.descricao)}</p>` : ""}
          <div class="kb-meta">
            ${p.responsavel ? `<span><i class="fa-solid fa-user"></i> ${escapeHtml(p.responsavel)}</span>` : ""}
            ${p.prazo ? `<span class="${atrasado(p) ? "atrasado" : ""}"><i class="fa-solid fa-calendar"></i> ${fmtData(p.prazo)}</span>` : ""}
          </div>
          <select class="status-sel" data-id="${p.id}" aria-label="Status de ${escapeHtml(p.nome)}">${opcoesStatus(p.status)}</select>
        </article>
      `).join("");
      return `
        <section class="kb-col ${col.tom}" data-col="${col.id}">
          <div class="kb-col-head"><h2>${col.titulo}</h2><span class="kb-count">${cards.length}</span></div>
          <div class="kb-cards">${html || `<div class="empty">Nenhum projeto</div>`}</div>
        </section>
      `;
    }).join("");
  }

  function render() {
    renderLista();
    renderKanban();
  }

  function abrirModal(projeto) {
    editandoId = projeto ? projeto.id : null;
    document.getElementById("modalTitulo").textContent = projeto ? "Editar projeto" : "Novo projeto";
    document.getElementById("campoNome").value = projeto ? projeto.nome : "";
    document.getElementById("campoDesc").value = projeto ? projeto.descricao || "" : "";
    document.getElementById("campoResp").value = projeto ? projeto.responsavel || "" : "";
    document.getElementById("campoPrazo").value = projeto ? projeto.prazo || "" : "";
    document.getElementById("campoStatus").value = projeto
      ? projeto.status
      : (filtroStatus.value || "A FAZER");
    btnExcluir.hidden = !projeto;
    modal.hidden = false;
    document.getElementById("campoNome").focus();
  }

  function fecharModal() {
    modal.hidden = true;
    editandoId = null;
  }

  async function mudarStatus(id, status) {
    const p = projetos.find((x) => Number(x.id) === Number(id));
    if (!p || p.status === status) return;
    const anterior = { status: p.status, ordem: p.ordem };
    const ordem = projetos
      .filter((x) => x.status === status)
      .reduce((m, x) => Math.max(m, Number(x.ordem) || 0), -1) + 1;
    p.status = status;
    p.ordem = ordem;
    render();
    try {
      await api("POST", "mover", { body: { itens: [{ id: p.id, status, ordem }] } });
    } catch (err) {
      p.status = anterior.status;
      p.ordem = anterior.ordem;
      render();
      alert(err.message);
    }
  }

  function cardApos(lista, y) {
    const cards = [...lista.querySelectorAll(".kb-card:not(.dragging)")];
    for (const card of cards) {
      const box = card.getBoundingClientRect();
      if (y < box.top + box.height / 2) return card;
    }
    return null;
  }

  function lerQuadro() {
    const out = [];
    board.querySelectorAll(".kb-col").forEach((col) => {
      const status = col.dataset.col;
      col.querySelectorAll(".kb-card").forEach((card, i) => {
        out.push({ id: Number(card.dataset.id), status, ordem: i });
      });
    });
    return out;
  }

  async function persistirOrdem(layout) {
    if (busca.value.trim() || filtroStatus.value) {
      render();
      return;
    }
    const mudou = [];
    for (const item of layout) {
      const p = projetos.find((x) => Number(x.id) === item.id);
      if (!p) continue;
      if (p.status !== item.status || Number(p.ordem) !== item.ordem) mudou.push(item);
    }
    if (!mudou.length) {
      renderLista();
      return;
    }
    const antes = projetos.map((p) => ({ ...p }));
    for (const item of mudou) {
      const p = projetos.find((x) => Number(x.id) === item.id);
      if (!p) continue;
      p.status = item.status;
      p.ordem = item.ordem;
    }
    renderLista();
    board.querySelectorAll(".kb-col").forEach((col) => {
      const lista = col.querySelector(".kb-cards");
      const n = lista.querySelectorAll(".kb-card").length;
      const badge = col.querySelector(".kb-count");
      if (badge) badge.textContent = String(n);
      const vazio = lista.querySelector(".empty");
      if (n && vazio) vazio.remove();
      if (!n && !vazio) lista.insertAdjacentHTML("beforeend", `<div class="empty">Nenhum projeto</div>`);
    });
    try {
      await api("POST", "mover", { body: { itens: mudou } });
    } catch (err) {
      projetos = antes;
      render();
      alert(err.message);
    }
  }

  document.querySelectorAll(".req-tab").forEach((tab) => {
    tab.addEventListener("click", () => {
      document.querySelectorAll(".req-tab").forEach((t) => t.classList.toggle("active", t === tab));
      document.getElementById("panelKanban").classList.toggle("active", tab.dataset.tab === "kanban");
      document.getElementById("panelLista").classList.toggle("active", tab.dataset.tab === "lista");
    });
  });

  document.getElementById("btnNovo").addEventListener("click", () => abrirModal(null));
  document.getElementById("btnCancelar").addEventListener("click", fecharModal);
  modal.addEventListener("click", (e) => {
    if (e.target === modal) fecharModal();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !modal.hidden) fecharModal();
  });

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const btn = document.getElementById("btnSalvar");
    btn.disabled = true;
    const body = {
      id: editandoId || undefined,
      nome: document.getElementById("campoNome").value,
      descricao: document.getElementById("campoDesc").value,
      responsavel: document.getElementById("campoResp").value,
      prazo: document.getElementById("campoPrazo").value,
      status: document.getElementById("campoStatus").value,
    };
    try {
      const data = await api("POST", "salvar", { body });
      const salvo = data.projeto;
      const idx = projetos.findIndex((p) => Number(p.id) === Number(salvo.id));
      if (idx >= 0) projetos[idx] = salvo;
      else projetos.push(salvo);
      fecharModal();
      render();
    } catch (err) {
      alert(err.message);
    } finally {
      btn.disabled = false;
    }
  });

  btnExcluir.addEventListener("click", async () => {
    const p = projetos.find((x) => Number(x.id) === Number(editandoId));
    if (!p) return;
    if (!confirm(`Excluir o projeto "${p.nome}"? Não dá para desfazer.`)) return;
    btnExcluir.disabled = true;
    try {
      await api("DELETE", "projeto", { query: { id: String(p.id) } });
      projetos = projetos.filter((x) => Number(x.id) !== Number(p.id));
      fecharModal();
      render();
    } catch (err) {
      alert(err.message);
    } finally {
      btnExcluir.disabled = false;
    }
  });

  document.body.addEventListener("change", async (e) => {
    const sel = e.target.closest(".status-sel");
    if (!sel || !sel.dataset.id || sel.closest("#formProjeto")) return;
    await mudarStatus(Number(sel.dataset.id), sel.value);
  });

  document.body.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-edit]");
    if (!btn) return;
    const p = projetos.find((x) => Number(x.id) === Number(btn.dataset.edit));
    if (p) abrirModal(p);
  });

  busca.addEventListener("input", () => render());
  filtroStatus.addEventListener("change", () => render());

  board.addEventListener("dragstart", (e) => {
    const handle = e.target.closest(".kb-handle");
    if (!handle || busca.value.trim() || filtroStatus.value) {
      e.preventDefault();
      return;
    }
    const card = handle.closest(".kb-card");
    dragId = Number(card.dataset.id);
    card.classList.add("dragging");
    e.dataTransfer.effectAllowed = "move";
    try { e.dataTransfer.setData("text/plain", String(dragId)); } catch (_) { /* ignore */ }
    try { e.dataTransfer.setDragImage(card, 24, 24); } catch (_) { /* ignore */ }
  });

  board.addEventListener("dragover", (e) => {
    if (!dragId) return;
    const col = e.target.closest(".kb-col");
    if (!col) return;
    e.preventDefault();
    board.querySelectorAll(".kb-col.over").forEach((el) => {
      if (el !== col) el.classList.remove("over");
    });
    col.classList.add("over");
    const lista = col.querySelector(".kb-cards");
    const card = board.querySelector(`.kb-card[data-id="${dragId}"]`);
    if (!card || !lista) return;
    const apos = cardApos(lista, e.clientY);
    if (apos) lista.insertBefore(card, apos);
    else lista.appendChild(card);
  });

  board.addEventListener("drop", (e) => {
    if (!dragId) return;
    e.preventDefault();
    salvandoArraste = true;
    const layout = lerQuadro();
    dragId = null;
    board.querySelectorAll(".dragging, .over").forEach((el) => el.classList.remove("dragging", "over"));
    persistirOrdem(layout).finally(() => { salvandoArraste = false; });
  });

  board.addEventListener("dragend", () => {
    board.querySelectorAll(".dragging, .over").forEach((el) => el.classList.remove("dragging", "over"));
    if (!salvandoArraste) renderKanban();
    dragId = null;
  });

  try {
    const data = await api("GET", "listar");
    projetos = data.projetos || [];
    render();
  } catch (err) {
    tbody.innerHTML = `<tr><td class="empty" colspan="4">${escapeHtml(err.message)}</td></tr>`;
    board.innerHTML = `<p class="empty">${escapeHtml(err.message)}</p>`;
  }
});
