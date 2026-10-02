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
    { id: "PAUSADO", titulo: "Pausado", tom: "pausado", recolhida: true },
    { id: "CANCELADO", titulo: "Cancelado", tom: "cancelado", recolhida: true },
  ];
  const colunasAbertas = new Set();

  const board = document.getElementById("board");
  const tbody = document.getElementById("tbody");
  const busca = document.getElementById("busca");
  const filtroStatus = document.getElementById("filtroStatus");
  const modal = document.getElementById("modal");
  const form = document.getElementById("formProjeto");
  const btnExcluir = document.getElementById("btnExcluir");

  let projetos = [];
  let editandoId = null;
  let acoesEdit = [];
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

  function prazoVencido(p) {
    if (!p.prazo || p.prazo >= hojeIso()) return false;
    return p.status !== "CONCLUIDO" && p.status !== "CANCELADO";
  }

  function htmlBadges(item, curto) {
    const partes = [];
    if (item.prioridadeAlta) {
      partes.push(`<span class="kb-badge alta">${curto ? "Alta" : "Prioridade alta"}</span>`);
    }
    if (item.atrasado) partes.push(`<span class="kb-badge atraso">Atrasado</span>`);
    if (!partes.length) return "";
    return `<span class="kb-badges">${partes.join("")}</span>`;
  }

  function visiveis() {
    const q = busca.value.trim().toLowerCase();
    const filtro = filtroStatus.value;
    return projetos.filter((p) => {
      if (filtro && p.status !== filtro) return false;
      if (!q) return true;
      const acoesTxt = (p.acoes || []).map((a) => a.texto).join(" ");
      return [p.nome, p.descricao, p.responsavel, acoesTxt].join(" ").toLowerCase().includes(q);
    });
  }

  function opcoesStatus(atual) {
    return COLUNAS
      .map((c) => `<option value="${c.id}" ${c.id === atual ? "selected" : ""}>${c.titulo}</option>`)
      .join("");
  }

  function htmlAcoes(p) {
    const acoes = Array.isArray(p.acoes) ? p.acoes : [];
    if (!acoes.length) return "";
    const feitas = acoes.filter((a) => a.feito).length;
    const itens = acoes.map((a) => {
      const nivel = Math.min(3, Math.max(1, Number(a.nivel) || 1));
      return `
        <li class="nv-${nivel}${a.feito ? " feita" : ""}">
          <label>
            <input type="checkbox" data-acao="${a.id}" ${a.feito ? "checked" : ""} aria-label="${escapeHtml(a.texto)}" />
            <span class="nv-num">${nivel}</span>
            <span class="nv-txt">${escapeHtml(a.texto)}</span>
          </label>
          ${htmlBadges(a, true)}
        </li>`;
    }).join("");
    return `
      <div class="acoes-box">
        <div class="acoes-resumo">${feitas} de ${acoes.length}</div>
        <ul class="acoes">${itens}</ul>
      </div>`;
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
          ${htmlBadges(p)}
          ${p.descricao ? `<div class="muted">${escapeHtml(p.descricao)}</div>` : ""}
          ${htmlAcoes(p)}
        </td>
        <td>${escapeHtml(p.responsavel)}</td>
        <td class="${prazoVencido(p) ? "atrasado" : ""}">${fmtData(p.prazo) || "—"}</td>
        <td><select class="status-sel" data-id="${p.id}" aria-label="Status de ${escapeHtml(p.nome)}">${opcoesStatus(p.status)}</select></td>
      </tr>
    `).join("");
  }

  function colunaVisivel(col, qtd) {
    if (!col.recolhida) return true;
    if (colunasAbertas.has(col.id)) return true;
    if (filtroStatus.value === col.id) return true;
    return !!(busca.value.trim() && qtd);
  }

  function renderKanban() {
    const itens = visiveis();
    board.innerHTML = COLUNAS.map((col) => {
      const cards = itens
        .filter((p) => p.status === col.id)
        .sort((a, b) => a.ordem - b.ordem || a.id - b.id);
      const aberta = colunaVisivel(col, cards.length);
      const html = cards.map((p) => `
        <article class="kb-card" data-id="${p.id}">
          <button type="button" class="kb-handle" draggable="true" title="Arrastar" aria-label="Arrastar ${escapeHtml(p.nome)}">
            <i class="fa-solid fa-grip-vertical"></i>
          </button>
          <div class="kb-main">
            <h3><button type="button" class="nome-btn" data-edit="${p.id}">${escapeHtml(p.nome)}</button></h3>
            ${htmlBadges(p)}
            ${p.descricao ? `<p>${escapeHtml(p.descricao)}</p>` : ""}
            ${htmlAcoes(p)}
            <div class="kb-meta">
              ${p.responsavel ? `<span><i class="fa-solid fa-user"></i> ${escapeHtml(p.responsavel)}</span>` : ""}
              ${p.prazo ? `<span class="${prazoVencido(p) ? "atrasado" : ""}"><i class="fa-solid fa-calendar"></i> ${fmtData(p.prazo)}</span>` : ""}
            </div>
            <select class="status-sel" data-id="${p.id}" aria-label="Status de ${escapeHtml(p.nome)}">${opcoesStatus(p.status)}</select>
          </div>
        </article>
      `).join("");
      const head = col.recolhida
        ? `<button type="button" class="kb-col-head" data-toggle="${col.id}" aria-expanded="${aberta ? "true" : "false"}" title="${aberta ? "Recolher" : "Mostrar"}">
            <h2>${col.titulo}</h2>
            <span class="kb-head-side"><span class="kb-count">${cards.length}</span><i class="fa-solid fa-chevron-down kb-chevron" aria-hidden="true"></i></span>
          </button>`
        : `<div class="kb-col-head"><h2>${col.titulo}</h2><span class="kb-count">${cards.length}</span></div>`;
      return `
        <section class="kb-col ${col.tom}${col.recolhida ? " recolhida" : ""}${col.recolhida && aberta ? " aberta" : ""}" data-col="${col.id}">
          ${head}
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
    document.getElementById("campoPrioridade").checked = !!(projeto && projeto.prioridadeAlta);
    document.getElementById("campoAtrasado").checked = !!(projeto && projeto.atrasado);
    btnExcluir.hidden = !projeto;
    acoesEdit = (projeto && Array.isArray(projeto.acoes) ? projeto.acoes : []).map((a) => ({
      id: a.id,
      texto: a.texto || "",
      nivel: Math.min(3, Math.max(1, Number(a.nivel) || 1)),
      feito: !!a.feito,
      prioridadeAlta: !!a.prioridadeAlta,
      atrasado: !!a.atrasado,
    }));
    renderAcoesEditor();
    modal.hidden = false;
    document.getElementById("campoNome").focus();
  }

  function ajustarNiveis(lista) {
    let prev = 1;
    lista.forEach((a, i) => {
      let n = Math.min(3, Math.max(1, Number(a.nivel) || 1));
      if (i === 0) n = 1;
      else if (n > prev + 1) n = prev + 1;
      a.nivel = n;
      prev = n;
    });
  }

  function renderAcoesEditor() {
    const box = document.getElementById("listaAcoes");
    if (!acoesEdit.length) {
      box.innerHTML = `<p class="acao-vazia">Nenhuma ação ainda.</p>`;
      return;
    }
    box.innerHTML = acoesEdit.map((a, i) => {
      const prev = i === 0 ? 1 : acoesEdit[i - 1].nivel;
      const podeDescer = i > 0 && a.nivel < Math.min(3, prev + 1);
      const podeSubir = a.nivel > 1;
      const recuo = (a.nivel - 1) * 18;
      return `
        <div class="acao-row" data-i="${i}" style="margin-left:${recuo}px">
          <span class="nv-tag">Nível ${a.nivel}</span>
          <button type="button" class="ico" data-subir="${i}" title="Subir um nível" aria-label="Subir um nível" ${podeSubir ? "" : "disabled"}>
            <i class="fa-solid fa-arrow-left"></i>
          </button>
          <button type="button" class="ico" data-descer="${i}" title="Descer um nível" aria-label="Descer um nível" ${podeDescer ? "" : "disabled"}>
            <i class="fa-solid fa-arrow-right"></i>
          </button>
          <input type="checkbox" data-feito="${i}" ${a.feito ? "checked" : ""} aria-label="Concluir ação ${i + 1}" />
          <input type="text" data-texto="${i}" maxlength="300" value="${escapeHtml(a.texto)}" placeholder="Descreva a ação" />
          <button type="button" class="marca${a.prioridadeAlta ? " on alta" : ""}" data-prioridade="${i}" aria-pressed="${a.prioridadeAlta ? "true" : "false"}">Alta</button>
          <button type="button" class="marca${a.atrasado ? " on atraso" : ""}" data-atraso="${i}" aria-pressed="${a.atrasado ? "true" : "false"}">Atrasado</button>
          <button type="button" class="ico" data-remover="${i}" title="Remover ação" aria-label="Remover ação">
            <i class="fa-solid fa-xmark"></i>
          </button>
        </div>`;
    }).join("");
  }

  function lerTextoAcao(i) {
    const el = document.querySelector(`#listaAcoes [data-texto="${i}"]`);
    if (el && acoesEdit[i]) acoesEdit[i].texto = el.value;
  }

  function inserirAcao(depoisDe) {
    if (acoesEdit.length >= 40) {
      alert("No máximo 40 ações.");
      return;
    }
    acoesEdit.forEach((_, i) => lerTextoAcao(i));
    const nivel = depoisDe >= 0 && acoesEdit[depoisDe] ? acoesEdit[depoisDe].nivel : 1;
    const item = { texto: "", nivel, feito: false, prioridadeAlta: false, atrasado: false };
    const idx = depoisDe >= 0 ? depoisDe + 1 : acoesEdit.length;
    acoesEdit.splice(idx, 0, item);
    ajustarNiveis(acoesEdit);
    renderAcoesEditor();
    const foco = document.querySelector(`#listaAcoes [data-texto="${idx}"]`);
    if (foco) foco.focus();
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
  document.getElementById("btnAddAcao").addEventListener("click", () => inserirAcao(acoesEdit.length - 1));
  document.getElementById("listaAcoes").addEventListener("input", (e) => {
    const texto = e.target.closest("[data-texto]");
    if (!texto) return;
    const i = Number(texto.dataset.texto);
    if (acoesEdit[i]) acoesEdit[i].texto = texto.value;
  });
  document.getElementById("listaAcoes").addEventListener("change", (e) => {
    const box = e.target.closest("[data-feito]");
    if (!box) return;
    const i = Number(box.dataset.feito);
    if (acoesEdit[i]) acoesEdit[i].feito = box.checked;
  });
  document.getElementById("listaAcoes").addEventListener("keydown", (e) => {
    if (e.key !== "Enter" || !e.target.matches("[data-texto]")) return;
    e.preventDefault();
    inserirAcao(Number(e.target.dataset.texto));
  });
  document.getElementById("listaAcoes").addEventListener("click", (e) => {
    const descer = e.target.closest("[data-descer]");
    const subir = e.target.closest("[data-subir]");
    const remover = e.target.closest("[data-remover]");
    const prioridade = e.target.closest("[data-prioridade]");
    const atraso = e.target.closest("[data-atraso]");
    if (!descer && !subir && !remover && !prioridade && !atraso) return;
    acoesEdit.forEach((_, i) => lerTextoAcao(i));
    if (prioridade) {
      const i = Number(prioridade.dataset.prioridade);
      if (acoesEdit[i]) acoesEdit[i].prioridadeAlta = !acoesEdit[i].prioridadeAlta;
    } else if (atraso) {
      const i = Number(atraso.dataset.atraso);
      if (acoesEdit[i]) acoesEdit[i].atrasado = !acoesEdit[i].atrasado;
    } else if (descer) {
      const i = Number(descer.dataset.descer);
      const prev = acoesEdit[i - 1] ? acoesEdit[i - 1].nivel : 1;
      const teto = Math.min(3, prev + 1);
      if (i > 0 && acoesEdit[i] && acoesEdit[i].nivel < teto) acoesEdit[i].nivel += 1;
    } else if (subir) {
      const i = Number(subir.dataset.subir);
      if (acoesEdit[i] && acoesEdit[i].nivel > 1) acoesEdit[i].nivel -= 1;
      ajustarNiveis(acoesEdit);
    } else if (remover) {
      acoesEdit.splice(Number(remover.dataset.remover), 1);
      ajustarNiveis(acoesEdit);
    }
    renderAcoesEditor();
  });
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
    acoesEdit.forEach((_, i) => lerTextoAcao(i));
    const body = {
      id: editandoId || undefined,
      nome: document.getElementById("campoNome").value,
      descricao: document.getElementById("campoDesc").value,
      responsavel: document.getElementById("campoResp").value,
      prazo: document.getElementById("campoPrazo").value,
      status: document.getElementById("campoStatus").value,
      prioridadeAlta: document.getElementById("campoPrioridade").checked,
      atrasado: document.getElementById("campoAtrasado").checked,
      acoes: acoesEdit
        .map((a) => ({
          id: a.id || undefined,
          texto: a.texto,
          nivel: a.nivel,
          feito: !!a.feito,
          prioridadeAlta: !!a.prioridadeAlta,
          atrasado: !!a.atrasado,
        }))
        .filter((a) => String(a.texto || "").trim()),
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
    if (!confirm(`Excluir o projeto "${p.nome}" e as ações? Não dá para desfazer.`)) return;
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

  async function marcarAcao(id, feito) {
    let achou = null;
    for (const p of projetos) {
      const a = (p.acoes || []).find((x) => Number(x.id) === Number(id));
      if (a) {
        achou = a;
        break;
      }
    }
    if (!achou || !!achou.feito === !!feito) return;
    const anterior = achou.feito;
    achou.feito = feito;
    render();
    try {
      await api("POST", "marcar", { body: { id, feito } });
    } catch (err) {
      achou.feito = anterior;
      render();
      alert(err.message);
    }
  }

  document.body.addEventListener("change", async (e) => {
    const box = e.target.closest("input[data-acao]");
    if (box && !box.closest("#formProjeto")) {
      await marcarAcao(Number(box.dataset.acao), box.checked);
      return;
    }
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
    if (e.dataTransfer) {
      e.dataTransfer.effectAllowed = "move";
      try { e.dataTransfer.setData("text/plain", String(dragId)); } catch (_) { /* ignore */ }
      try { e.dataTransfer.setDragImage(card, 24, 24); } catch (_) { /* ignore */ }
    }
  });

  function abrirParaArraste(col) {
    board.querySelectorAll(".kb-col.recolhida").forEach((el) => {
      if (el === col) return;
      if (el.dataset.dragAberta === "1" && !colunasAbertas.has(el.dataset.col)) {
        el.classList.remove("aberta");
        delete el.dataset.dragAberta;
        const btn = el.querySelector("[data-toggle]");
        if (btn) btn.setAttribute("aria-expanded", "false");
      }
    });
    if (!col.classList.contains("recolhida") || col.classList.contains("aberta")) return;
    col.classList.add("aberta");
    col.dataset.dragAberta = "1";
    const btn = col.querySelector("[data-toggle]");
    if (btn) btn.setAttribute("aria-expanded", "true");
  }

  board.addEventListener("click", (e) => {
    const toggle = e.target.closest("[data-toggle]");
    if (!toggle || !board.contains(toggle)) return;
    const col = toggle.closest(".kb-col");
    if (!col) return;
    const aberta = col.classList.toggle("aberta");
    if (aberta) colunasAbertas.add(col.dataset.col);
    else colunasAbertas.delete(col.dataset.col);
    toggle.setAttribute("aria-expanded", aberta ? "true" : "false");
    toggle.title = aberta ? "Recolher" : "Mostrar";
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
    abrirParaArraste(col);
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
    const card = board.querySelector(`.kb-card[data-id="${dragId}"]`);
    const dest = card && card.closest(".kb-col");
    if (dest && dest.classList.contains("recolhida")) {
      colunasAbertas.add(dest.dataset.col);
      delete dest.dataset.dragAberta;
    }
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
