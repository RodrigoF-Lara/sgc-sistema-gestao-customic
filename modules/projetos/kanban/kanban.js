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
  const mesesAbertos = new Set();

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
  let registrosEdit = [];
  let dragId = null;
  let salvandoArraste = false;
  const thumbs = new Map();
  let geracaoEnt = 0;

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

  function fimDe(p) {
    return p.fim || p.prazo || "";
  }

  function atrasoFim(p) {
    if (p.status === "CONCLUIDO" || p.status === "CANCELADO") return false;
    const fim = fimDe(p);
    return !!(fim && fim < hojeIso());
  }

  function atrasoInicio(p) {
    if (p.status !== "A FAZER") return false;
    return !!(p.inicio && p.inicio < hojeIso());
  }

  function estaAtrasado(p) {
    return atrasoFim(p) || atrasoInicio(p);
  }

  function htmlDatas(p) {
    const partes = [];
    if (p.cadastro) {
      partes.push(`<span title="Cadastro"><i class="fa-solid fa-calendar-plus"></i> Cadastro ${fmtData(p.cadastro)}</span>`);
    }
    if (p.inicio) {
      partes.push(`<span class="${atrasoInicio(p) ? "atrasado" : ""}" title="Início"><i class="fa-solid fa-play"></i> Início ${fmtData(p.inicio)}</span>`);
    }
    const fim = fimDe(p);
    if (fim) {
      partes.push(`<span class="${atrasoFim(p) ? "atrasado" : ""}" title="Fim"><i class="fa-solid fa-flag-checkered"></i> Fim ${fmtData(fim)}</span>`);
    }
    return partes.join("");
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
      const entTxt = (p.entregaveis || []).map((e) => `${e.nome || ""} ${e.url || ""}`).join(" ");
      return [p.nome, p.descricao, p.responsavel, acoesTxt, entTxt].join(" ").toLowerCase().includes(q);
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
      tbody.innerHTML = `<tr><td class="empty" colspan="6">Nenhum projeto para mostrar.</td></tr>`;
      return;
    }
    tbody.innerHTML = linhas.map((p) => `
      <tr data-id="${p.id}">
        <td>
          <button type="button" class="nome-btn" data-edit="${p.id}">${escapeHtml(p.nome)}</button>
          ${htmlBadges({ prioridadeAlta: p.prioridadeAlta, atrasado: estaAtrasado(p) })}
          ${p.descricao ? `<div class="muted">${escapeHtml(p.descricao)}</div>` : ""}
          ${(p.entregaveis || []).length ? `<div class="muted"><i class="fa-solid fa-paperclip"></i> ${textoEntregaveis((p.entregaveis || []).length)}</div>` : ""}
          ${htmlAcoes(p)}
        </td>
        <td>${escapeHtml(p.responsavel)}</td>
        <td>${fmtData(p.cadastro) || "—"}</td>
        <td class="${atrasoInicio(p) ? "atrasado" : ""}">${fmtData(p.inicio) || "—"}</td>
        <td class="${atrasoFim(p) ? "atrasado" : ""}">${fmtData(fimDe(p)) || "—"}</td>
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

  function chaveMes(p) {
    const iso = fimDe(p) || (p && p.cadastro) || "";
    const m = /^(\d{4})-(\d{2})/.exec(String(iso));
    return m ? `${m[1]}-${m[2]}` : "sem-data";
  }

  function rotuloMes(chave) {
    if (chave === "sem-data") return "Sem data";
    const [ano, mes] = chave.split("-");
    const nome = new Date(Number(ano), Number(mes) - 1, 1).toLocaleDateString("pt-BR", { month: "long" });
    return `${nome} de ${ano}`;
  }

  function mesAntes(a, b) {
    if (a === b) return false;
    if (a === "sem-data") return false;
    if (b === "sem-data") return true;
    return a > b;
  }

  function mesAberto(chave) {
    if (filtroStatus.value === "CONCLUIDO" || busca.value.trim()) return true;
    return mesesAbertos.has(chave);
  }

  function htmlCard(p) {
    return `
      <article class="kb-card" data-id="${p.id}">
        <button type="button" class="kb-handle" draggable="true" title="Arrastar" aria-label="Arrastar ${escapeHtml(p.nome)}">
          <i class="fa-solid fa-grip-vertical"></i>
        </button>
        <div class="kb-main">
          <h3><button type="button" class="nome-btn" data-edit="${p.id}">${escapeHtml(p.nome)}</button></h3>
          ${htmlBadges({ prioridadeAlta: p.prioridadeAlta, atrasado: estaAtrasado(p) })}
          ${p.descricao ? `<p>${escapeHtml(p.descricao)}</p>` : ""}
          ${htmlAcoes(p)}
          <div class="kb-meta">
            ${p.responsavel ? `<span><i class="fa-solid fa-user"></i> ${escapeHtml(p.responsavel)}</span>` : ""}
            ${(p.registros || []).length ? `<span><i class="fa-solid fa-clock-rotate-left"></i> ${(p.registros || []).length} ${(p.registros || []).length === 1 ? "registro" : "registros"}</span>` : ""}
            ${(p.entregaveis || []).length ? `<span><i class="fa-solid fa-paperclip"></i> ${textoEntregaveis((p.entregaveis || []).length)}</span>` : ""}
            ${htmlDatas(p)}
          </div>
          <select class="status-sel" data-id="${p.id}" aria-label="Status de ${escapeHtml(p.nome)}">${opcoesStatus(p.status)}</select>
        </div>
      </article>`;
  }

  function htmlMeses(cards) {
    const grupos = new Map();
    for (const p of cards) {
      const chave = chaveMes(p);
      if (!grupos.has(chave)) grupos.set(chave, []);
      grupos.get(chave).push(p);
    }
    const chaves = [...grupos.keys()].sort((a, b) => (mesAntes(a, b) ? -1 : mesAntes(b, a) ? 1 : 0));
    return chaves.map((chave) => {
      const lista = grupos.get(chave);
      const aberta = mesAberto(chave);
      return `
        <section class="kb-mes${aberta ? " aberta" : ""}" data-mes="${chave}">
          <button type="button" class="kb-mes-head" data-mes-toggle="${chave}" aria-expanded="${aberta ? "true" : "false"}" title="${aberta ? "Recolher" : "Mostrar"}">
            <span class="kb-mes-titulo">${escapeHtml(rotuloMes(chave))}</span>
            <span class="kb-head-side"><span class="kb-count">${lista.length}</span><i class="fa-solid fa-chevron-down kb-chevron" aria-hidden="true"></i></span>
          </button>
          <div class="kb-mes-cards">${lista.map(htmlCard).join("")}</div>
        </section>`;
    }).join("");
  }

  function renderKanban() {
    const itens = visiveis();
    board.innerHTML = COLUNAS.map((col) => {
      const cards = itens
        .filter((p) => p.status === col.id)
        .sort((a, b) => a.ordem - b.ordem || a.id - b.id);
      const aberta = colunaVisivel(col, cards.length);
      const html = col.id === "CONCLUIDO" ? htmlMeses(cards) : cards.map(htmlCard).join("");
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
    renderCrono();
  }

  function renderCrono() {
    const box = document.getElementById("crono");
    const mes = document.getElementById("cronoMes");
    if (!box || !mes || !window.SGCCronologia) return;
    if (!mes.value) mes.value = hojeIso().slice(0, 7);
    box.innerHTML = window.SGCCronologia.htmlRelatorio(projetos, mes.value);
  }

  function abrirModal(projeto) {
    editandoId = projeto ? projeto.id : null;
    document.getElementById("modalTitulo").textContent = projeto ? "Editar projeto" : "Novo projeto";
    document.getElementById("campoNome").value = projeto ? projeto.nome : "";
    document.getElementById("campoDesc").value = projeto ? projeto.descricao || "" : "";
    document.getElementById("campoResp").value = projeto ? projeto.responsavel || "" : "";
    document.getElementById("campoCadastro").value = projeto ? (projeto.cadastro || "") : hojeIso();
    document.getElementById("campoInicio").value = projeto ? (projeto.inicio || "") : "";
    document.getElementById("campoFim").value = projeto ? (fimDe(projeto) || "") : "";
    document.getElementById("campoStatus").value = projeto
      ? projeto.status
      : (filtroStatus.value || "A FAZER");
    document.getElementById("campoPrioridade").checked = !!(projeto && projeto.prioridadeAlta);
    btnExcluir.hidden = !projeto;
    registrosEdit = (projeto && Array.isArray(projeto.registros) ? projeto.registros : []).map((r) => ({
      id: r.id,
      data: r.data || "",
      etapa: r.etapa || "pesquisa",
      rotulo: r.rotulo || "",
      titulo: r.titulo || "",
      texto: r.texto || "",
      cor: r.cor || "",
    }));
    renderRegistrosEditor();
    acoesEdit = (projeto && Array.isArray(projeto.acoes) ? projeto.acoes : []).map((a) => ({
      id: a.id,
      texto: a.texto || "",
      nivel: Math.min(3, Math.max(1, Number(a.nivel) || 1)),
      feito: !!a.feito,
      prioridadeAlta: !!a.prioridadeAlta,
      atrasado: !!a.atrasado,
    }));
    renderAcoesEditor();
    abaModal("projeto");
    renderEntregaveis();
    modal.hidden = false;
    document.getElementById("campoNome").focus();
  }

  function abaModal(nome) {
    document.querySelectorAll("[data-modal-tab]").forEach((botao) => {
      const ativo = botao.dataset.modalTab === nome;
      botao.classList.toggle("active", ativo);
      botao.setAttribute("aria-selected", ativo ? "true" : "false");
    });
    document.getElementById("panelProjeto").classList.toggle("active", nome === "projeto");
    document.getElementById("panelEntregaveis").classList.toggle("active", nome === "entregaveis");
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
          <select data-termo="${i}" aria-label="Termo da ação ${i + 1}">${opcoesTermo(a.texto)}</select>
          <input type="text" data-texto="${i}" maxlength="300" value="${escapeHtml(a.texto)}" placeholder="Descreva a ação" ${termoIdDoTexto(a.texto) ? "readonly" : ""} />
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

  function etapasAcao() {
    return window.SGCCronologia ? window.SGCCronologia.ETAPAS : [];
  }

  function termoIdDoTexto(texto) {
    const nome = String(texto || "").trim().toLowerCase();
    if (!nome) return "";
    const etapa = etapasAcao().find((e) => e.id !== "outro" && e.nome.toLowerCase() === nome);
    return etapa ? etapa.id : "";
  }

  function opcoesTermo(texto) {
    const atual = termoIdDoTexto(texto);
    const livre = `<option value="" ${atual ? "" : "selected"}>Texto livre</option>`;
    const etapas = etapasAcao().map((e) => (
      `<option value="${e.id}" ${e.id === atual ? "selected" : ""}>${escapeHtml(e.nome)}</option>`
    )).join("");
    return livre + etapas;
  }

  function opcoesEtapa(atual) {
    const etapas = window.SGCCronologia ? window.SGCCronologia.ETAPAS : [];
    return etapas.map((e) => `<option value="${e.id}" ${e.id === atual ? "selected" : ""}>${escapeHtml(e.nome)}</option>`).join("");
  }

  function lerRegistrosForm() {
    registrosEdit.forEach((_, i) => {
      const data = document.querySelector(`#listaRegistros [data-reg-data="${i}"]`);
      const etapa = document.querySelector(`#listaRegistros [data-reg-etapa="${i}"]`);
      const rotulo = document.querySelector(`#listaRegistros [data-reg-rotulo="${i}"]`);
      const titulo = document.querySelector(`#listaRegistros [data-reg-titulo="${i}"]`);
      const texto = document.querySelector(`#listaRegistros [data-reg-texto="${i}"]`);
      if (!registrosEdit[i]) return;
      if (data) registrosEdit[i].data = data.value;
      if (etapa) registrosEdit[i].etapa = etapa.value;
      if (rotulo) registrosEdit[i].rotulo = rotulo.value;
      if (titulo) registrosEdit[i].titulo = titulo.value;
      if (texto) registrosEdit[i].texto = texto.value;
    });
  }

  function renderRegistrosEditor() {
    const box = document.getElementById("listaRegistros");
    if (!box) return;
    if (!registrosEdit.length) {
      box.innerHTML = `<p class="acao-vazia">Nenhum registro ainda.</p>`;
      return;
    }
    const cores = (window.SGCCronologia ? window.SGCCronologia.ETAPAS : []).map((e) => e.cor);
    box.innerHTML = registrosEdit.map((r, i) => `
      <div class="reg-card">
        <input type="date" data-reg-data="${i}" value="${escapeHtml(r.data)}" aria-label="Data do registro ${i + 1}" />
        <select data-reg-etapa="${i}" aria-label="Etapa do registro ${i + 1}">${opcoesEtapa(r.etapa)}</select>
        <button type="button" class="ico" data-reg-remover="${i}" title="Remover registro" aria-label="Remover registro">
          <i class="fa-solid fa-xmark"></i>
        </button>
        <input class="largo" data-reg-rotulo="${i}" maxlength="80" value="${escapeHtml(r.rotulo)}" placeholder="Nome da etapa" ${r.etapa === "outro" ? "" : "hidden"} />
        <div class="reg-cores largo" ${r.etapa === "outro" ? "" : "hidden"}>
          ${cores.map((cor) => `<button type="button" class="reg-cor${(r.cor || "#607d8b") === cor ? " on" : ""}" data-reg-cor="${i}" data-cor="${cor}" style="background:${cor}" aria-label="Cor ${cor}"></button>`).join("")}
        </div>
        <input class="largo" data-reg-titulo="${i}" maxlength="120" value="${escapeHtml(r.titulo)}" placeholder="Título, ex.: Faca enviada" />
        <input class="largo" data-reg-texto="${i}" maxlength="500" value="${escapeHtml(r.texto)}" placeholder="O que aconteceu" />
      </div>`).join("");
  }

  function fecharModal() {
    modal.hidden = true;
    editandoId = null;
    soltarThumbs();
  }

  function textoEntregaveis(n) {
    return n === 1 ? "1 entregável" : `${n} entregáveis`;
  }

  function textoTamanho(n) {
    const bytes = Number(n) || 0;
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
    const mb = (bytes / (1024 * 1024)).toFixed(1).replace(".", ",");
    return `${mb} MB`;
  }

  function soltarThumbs(manter) {
    for (const [id, url] of thumbs) {
      if (manter && manter.has(id)) continue;
      URL.revokeObjectURL(url);
      thumbs.delete(id);
    }
  }

  function entregaveisAtuais() {
    const p = projetos.find((x) => Number(x.id) === Number(editandoId));
    return p && Array.isArray(p.entregaveis) ? p.entregaveis : [];
  }

  function aplicarEntregaveis(lista) {
    const p = projetos.find((x) => Number(x.id) === Number(editandoId));
    if (p) p.entregaveis = lista;
    render();
    renderEntregaveis();
  }

  async function obterEntregavel(item) {
    const q = new URLSearchParams({
      acao: "entregavel",
      id: String(editandoId),
      entregavelId: String(item.id),
    });
    const nivel = localStorage.getItem("userLevel");
    if (nivel) q.set("userLevel", nivel);
    const headers = authHeaders();
    delete headers["Content-Type"];
    const res = await fetch(`${API}?${q}`, { headers });
    if (!res.ok) {
      let msg = "Não foi possível abrir o entregável.";
      try {
        const data = await res.json();
        if (data.error) msg = data.error;
      } catch (_) { /* corpo binário */ }
      throw new Error(msg);
    }
    return res.blob();
  }

  async function abrirEntregavel(item) {
    if (item.tipo === "LINK") {
      let destino;
      try { destino = new URL(item.url); } catch (_) { destino = null; }
      if (!destino || (destino.protocol !== "https:" && destino.protocol !== "http:")) {
        throw new Error("Link inválido.");
      }
      const link = document.createElement("a");
      link.href = destino.href;
      link.target = "_blank";
      link.rel = "noopener";
      document.body.appendChild(link);
      link.click();
      link.remove();
      return;
    }
    const blob = await obterEntregavel(item);
    const url = URL.createObjectURL(blob);
    const janela = window.open(url, "_blank", "noopener");
    if (!janela) {
      const link = document.createElement("a");
      link.href = url;
      link.target = "_blank";
      link.rel = "noopener";
      document.body.appendChild(link);
      link.click();
      link.remove();
    }
    setTimeout(() => URL.revokeObjectURL(url), 120000);
  }

  async function baixarEntregavel(item) {
    const blob = await obterEntregavel(item);
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = item.nome || (item.tipo === "PDF" ? "entregavel.pdf" : "foto");
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  }

  async function carregarThumb(item, geracao) {
    if (thumbs.has(item.id)) return;
    try {
      const blob = await obterEntregavel(item);
      if (geracao !== geracaoEnt) return;
      const url = URL.createObjectURL(blob);
      const img = document.querySelector(`#listaEntregaveis img[data-id="${item.id}"]`);
      if (!img) {
        URL.revokeObjectURL(url);
        return;
      }
      thumbs.set(item.id, url);
      img.src = url;
    } catch (_) { /* Abrir continua disponível */ }
  }

  function botaoEnt(classe, rotulo, aoClicar) {
    const botao = document.createElement("button");
    botao.type = "button";
    botao.className = classe;
    botao.textContent = rotulo;
    botao.addEventListener("click", () => {
      aoClicar().catch((err) => alert(err.message));
    });
    return botao;
  }

  function renderEntregaveis() {
    const geracao = ++geracaoEnt;
    const box = document.getElementById("listaEntregaveis");
    const trava = document.getElementById("entregavelTrava");
    const add = document.getElementById("btnAddEntregavel");
    const aba = document.getElementById("tabModalEntregaveis");
    const lista = entregaveisAtuais();
    const salvo = !!editandoId;
    if (trava) trava.hidden = salvo;
    if (add) add.disabled = !salvo;
    const campoLink = document.getElementById("campoLinkEnt");
    const btnLink = document.getElementById("btnAddLink");
    if (campoLink) campoLink.disabled = !salvo;
    if (btnLink) btnLink.disabled = !salvo;
    if (aba) aba.textContent = lista.length ? `Entregáveis (${lista.length})` : "Entregáveis";
    soltarThumbs(new Set(lista.map((item) => item.id)));
    box.replaceChildren();
    if (!lista.length) {
      const vazio = document.createElement("p");
      vazio.className = "ent-vazio";
      vazio.textContent = salvo ? "Nenhuma foto ou PDF ainda." : "Salve o projeto para anexar o material final.";
      box.appendChild(vazio);
      return;
    }
    const grade = document.createElement("div");
    grade.className = "ent-grade";
    lista.forEach((item) => {
      const card = document.createElement("article");
      card.className = "ent-card";
      if (item.tipo === "IMAGEM") {
        const img = document.createElement("img");
        img.alt = item.nome || "Foto";
        img.dataset.id = String(item.id);
        if (thumbs.has(item.id)) img.src = thumbs.get(item.id);
        card.appendChild(img);
        carregarThumb(item, geracao);
      } else if (item.tipo === "LINK") {
        const ico = document.createElement("div");
        ico.className = "ent-linkico";
        ico.innerHTML = '<i class="fa-solid fa-link"></i>';
        card.appendChild(ico);
      } else {
        const ico = document.createElement("div");
        ico.className = "ent-pdf";
        ico.innerHTML = '<i class="fa-solid fa-file-pdf"></i>';
        card.appendChild(ico);
      }
      const nome = document.createElement("div");
      nome.className = "ent-nome";
      nome.textContent = item.nome || (item.tipo === "LINK" ? "Link" : item.tipo === "PDF" ? "PDF" : "Foto");
      nome.title = item.url || nome.textContent;
      const meta = document.createElement("div");
      meta.className = "ent-meta";
      meta.textContent = item.tipo === "LINK" ? "Link" : textoTamanho(item.tamanho);
      const acoes = document.createElement("div");
      acoes.className = "ent-botoes";
      acoes.appendChild(botaoEnt("ent-btn", "Abrir", () => abrirEntregavel(item)));
      if (item.tipo !== "LINK") acoes.appendChild(botaoEnt("ent-btn", "Baixar", () => baixarEntregavel(item)));
      const remover = botaoEnt("ent-ico", "", () => removerEntregavel(item));
      remover.innerHTML = '<i class="fa-solid fa-trash"></i>';
      remover.setAttribute("aria-label", "Remover entregável");
      remover.title = "Remover";
      acoes.appendChild(remover);
      card.append(nome, meta, acoes);
      grade.appendChild(card);
    });
    box.appendChild(grade);
  }

  function lerDataUrl(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ""));
      reader.onerror = () => reject(new Error("Não foi possível ler o arquivo."));
      reader.readAsDataURL(file);
    });
  }

  async function enviarEntregaveis(files) {
    if (!editandoId) {
      alert("Salve o projeto antes de anexar fotos ou PDFs.");
      return;
    }
    const lista = [...files];
    if (!lista.length) return;
    for (const file of lista) {
      const nome = file.name || "Arquivo";
      if (!file.size) throw new Error(`"${nome}" está vazio.`);
      if (file.size > 3 * 1024 * 1024) {
        const ehPdf = /\.pdf$/i.test(nome) || file.type === "application/pdf";
        if (ehPdf) {
          throw new Error(`"${nome}" passa de 3 MB. PDF desse tamanho não entra como arquivo. Cole o link do OneDrive ou do SharePoint no campo abaixo.`);
        }
        throw new Error(`"${nome}" passa de 3 MB.`);
      }
    }
    const add = document.getElementById("btnAddEntregavel");
    add.disabled = true;
    try {
      for (const file of lista) {
        const data = await lerDataUrl(file);
        const resp = await api("POST", "entregavel", {
          body: { id: editandoId, nome: file.name, mime: file.type || "", data },
        });
        aplicarEntregaveis(resp.entregaveis || []);
      }
    } finally {
      add.disabled = !editandoId;
    }
  }

  async function enviarLink() {
    if (!editandoId) {
      alert("Salve o projeto antes de anexar fotos ou PDFs.");
      return;
    }
    const campo = document.getElementById("campoLinkEnt");
    const url = campo.value.trim();
    if (!url) {
      alert("Cole o link do PDF.");
      campo.focus();
      return;
    }
    const btn = document.getElementById("btnAddLink");
    btn.disabled = true;
    try {
      const resp = await api("POST", "entregavelLink", { body: { id: editandoId, url } });
      campo.value = "";
      aplicarEntregaveis(resp.entregaveis || []);
    } finally {
      btn.disabled = !editandoId;
    }
  }

  async function removerEntregavel(item) {
    if (!editandoId) return;
    if (!confirm("Remover este entregável?")) return;
    const resp = await api("POST", "excluirEntregavel", {
      body: { id: editandoId, entregavelId: item.id },
    });
    aplicarEntregaveis(resp.entregaveis || []);
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
    if (status === "CONCLUIDO") mesesAbertos.add(chaveMes(p));
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
    const mexeConcluido = mudou.some((item) => {
      const velho = antes.find((p) => Number(p.id) === item.id);
      return item.status === "CONCLUIDO" || (velho && velho.status === "CONCLUIDO");
    });
    if (mexeConcluido) {
      for (const item of mudou) {
        if (item.status !== "CONCLUIDO") continue;
        const p = projetos.find((x) => Number(x.id) === item.id);
        if (p) mesesAbertos.add(chaveMes(p));
      }
      render();
    } else {
      renderLista();
      board.querySelectorAll(".kb-col").forEach((col) => {
        const lista = col.querySelector(".kb-cards");
        const n = lista.querySelectorAll(".kb-card").length;
        const badge = col.querySelector(".kb-count");
        if (badge) badge.textContent = String(n);
        const vazio = lista.querySelector(":scope > .empty");
        if (n && vazio) vazio.remove();
        if (!n && !vazio) lista.insertAdjacentHTML("beforeend", `<div class="empty">Nenhum projeto</div>`);
      });
    }
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
      document.getElementById("panelCrono").classList.toggle("active", tab.dataset.tab === "crono");
    });
  });

  document.getElementById("btnNovo").addEventListener("click", () => abrirModal(null));
  document.getElementById("btnAddRegistro").addEventListener("click", () => {
    if (registrosEdit.length >= 80) {
      alert("No máximo 80 registros.");
      return;
    }
    lerRegistrosForm();
    registrosEdit.push({ data: hojeIso(), etapa: "pesquisa", rotulo: "", titulo: "", texto: "", cor: "" });
    renderRegistrosEditor();
    const foco = document.querySelector(`#listaRegistros [data-reg-titulo="${registrosEdit.length - 1}"]`);
    if (foco) foco.focus();
  });
  document.getElementById("listaRegistros").addEventListener("input", () => lerRegistrosForm());
  document.getElementById("listaRegistros").addEventListener("change", (e) => {
    if (!e.target.matches("[data-reg-etapa]")) return;
    lerRegistrosForm();
    const i = Number(e.target.dataset.regEtapa);
    if (registrosEdit[i] && registrosEdit[i].etapa === "outro" && !registrosEdit[i].cor) {
      registrosEdit[i].cor = "#607d8b";
    }
    renderRegistrosEditor();
  });
  document.getElementById("listaRegistros").addEventListener("click", (e) => {
    const cor = e.target.closest("[data-cor]");
    const remover = e.target.closest("[data-reg-remover]");
    if (!cor && !remover) return;
    lerRegistrosForm();
    if (cor) {
      const i = Number(cor.dataset.regCor);
      if (registrosEdit[i]) registrosEdit[i].cor = cor.dataset.cor;
    } else {
      registrosEdit.splice(Number(remover.dataset.regRemover), 1);
    }
    renderRegistrosEditor();
  });
  document.getElementById("cronoMes").addEventListener("change", () => renderCrono());
  document.getElementById("btnCronoPrint").addEventListener("click", () => {
    document.body.classList.add("imprimindo-crono");
    const limpar = () => {
      document.body.classList.remove("imprimindo-crono");
      window.removeEventListener("afterprint", limpar);
    };
    window.addEventListener("afterprint", limpar);
    window.print();
  });
  document.getElementById("btnAddAcao").addEventListener("click", () => inserirAcao(acoesEdit.length - 1));
  document.getElementById("listaAcoes").addEventListener("input", (e) => {
    const texto = e.target.closest("[data-texto]");
    if (!texto) return;
    const i = Number(texto.dataset.texto);
    if (acoesEdit[i]) acoesEdit[i].texto = texto.value;
  });
  document.getElementById("listaAcoes").addEventListener("change", (e) => {
    const termo = e.target.closest("[data-termo]");
    if (termo) {
      const i = Number(termo.dataset.termo);
      const acao = acoesEdit[i];
      const input = document.querySelector(`#listaAcoes [data-texto="${i}"]`);
      if (!acao || !input) return;
      const etapa = etapasAcao().find((item) => item.id === termo.value);
      if (etapa && etapa.id !== "outro") {
        acao.texto = etapa.nome;
        input.value = etapa.nome;
        input.readOnly = true;
        return;
      }
      input.readOnly = false;
      if (etapa && etapa.id === "outro" && termoIdDoTexto(input.value)) {
        input.value = "";
        acao.texto = "";
      }
      input.focus();
      return;
    }
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

  document.querySelectorAll("[data-modal-tab]").forEach((botao) => {
    botao.addEventListener("click", () => abaModal(botao.dataset.modalTab));
  });
  document.getElementById("btnAddEntregavel").addEventListener("click", () => {
    if (!editandoId) {
      alert("Salve o projeto antes de anexar fotos ou PDFs.");
      return;
    }
    const input = document.getElementById("fileEntregavel");
    input.value = "";
    input.click();
  });
  document.getElementById("fileEntregavel").addEventListener("change", (e) => {
    enviarEntregaveis(e.target.files || []).catch((err) => alert(err.message));
  });
  document.getElementById("btnAddLink").addEventListener("click", () => {
    enviarLink().catch((err) => alert(err.message));
  });
  document.getElementById("campoLinkEnt").addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      enviarLink().catch((err) => alert(err.message));
    }
  });

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const nome = document.getElementById("campoNome").value.trim();
    if (!nome) {
      abaModal("projeto");
      alert("Informe o nome do projeto.");
      document.getElementById("campoNome").focus();
      return;
    }
    const inicio = document.getElementById("campoInicio").value;
    const fim = document.getElementById("campoFim").value;
    if (inicio && fim && inicio > fim) {
      alert("A data de início é maior que a de fim.");
      return;
    }
    const btn = document.getElementById("btnSalvar");
    btn.disabled = true;
    acoesEdit.forEach((_, i) => lerTextoAcao(i));
    lerRegistrosForm();
    const body = {
      id: editandoId || undefined,
      nome: document.getElementById("campoNome").value,
      descricao: document.getElementById("campoDesc").value,
      responsavel: document.getElementById("campoResp").value,
      cadastro: document.getElementById("campoCadastro").value,
      inicio,
      fim,
      status: document.getElementById("campoStatus").value,
      prioridadeAlta: document.getElementById("campoPrioridade").checked,
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
      registros: registrosEdit
        .filter((r) => String(r.titulo || "").trim() || String(r.texto || "").trim())
        .map((r) => ({
          id: r.id || undefined,
          data: r.data,
          etapa: r.etapa || "pesquisa",
          rotulo: r.rotulo,
          titulo: r.titulo,
          texto: r.texto,
          cor: r.cor,
        })),
    };
    try {
      const data = await api("POST", "salvar", { body });
      const salvo = data.projeto;
      const idx = projetos.findIndex((p) => Number(p.id) === Number(salvo.id));
      if (idx >= 0) projetos[idx] = salvo;
      else projetos.push(salvo);
      if (salvo.status === "CONCLUIDO") mesesAbertos.add(chaveMes(salvo));
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
    if (!confirm(`Excluir o projeto "${p.nome}", as ações, os registros da cronologia e os entregáveis? Não dá para desfazer.`)) return;
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

  function garantirMes(col, chave) {
    const wrap = col.querySelector(":scope > .kb-cards");
    let mes = wrap.querySelector(`:scope > .kb-mes[data-mes="${CSS.escape(chave)}"]`);
    if (!mes) {
      mes = document.createElement("section");
      mes.className = "kb-mes";
      mes.dataset.mes = chave;
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "kb-mes-head";
      btn.dataset.mesToggle = chave;
      btn.innerHTML = `<span class="kb-mes-titulo">${escapeHtml(rotuloMes(chave))}</span><span class="kb-head-side"><span class="kb-count">0</span><i class="fa-solid fa-chevron-down kb-chevron" aria-hidden="true"></i></span>`;
      const lista = document.createElement("div");
      lista.className = "kb-mes-cards";
      mes.append(btn, lista);
      const ancora = [...wrap.querySelectorAll(":scope > .kb-mes")].find((el) => mesAntes(chave, el.dataset.mes));
      if (ancora) wrap.insertBefore(mes, ancora);
      else wrap.appendChild(mes);
      const vazio = wrap.querySelector(":scope > .empty");
      if (vazio) vazio.remove();
    }
    mes.classList.add("aberta");
    const btn = mes.querySelector(".kb-mes-head");
    if (btn) {
      btn.setAttribute("aria-expanded", "true");
      btn.title = "Recolher";
    }
    return mes.querySelector(".kb-mes-cards");
  }

  function atualizarContagem(col) {
    const total = col.querySelectorAll(".kb-card").length;
    const badge = col.querySelector(":scope > .kb-col-head .kb-count");
    if (badge) badge.textContent = String(total);
    col.querySelectorAll(":scope > .kb-cards > .kb-mes").forEach((mes) => {
      const n = mes.querySelectorAll(".kb-card").length;
      const conta = mes.querySelector(".kb-count");
      if (conta) conta.textContent = String(n);
    });
  }

  board.addEventListener("click", (e) => {
    const mesBtn = e.target.closest("[data-mes-toggle]");
    if (mesBtn && board.contains(mesBtn)) {
      const mes = mesBtn.closest(".kb-mes");
      if (!mes) return;
      const chave = mes.dataset.mes;
      const aberta = mes.classList.toggle("aberta");
      if (aberta) mesesAbertos.add(chave);
      else mesesAbertos.delete(chave);
      mesBtn.setAttribute("aria-expanded", aberta ? "true" : "false");
      mesBtn.title = aberta ? "Recolher" : "Mostrar";
      return;
    }
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
    const card = board.querySelector(`.kb-card[data-id="${dragId}"]`);
    if (!card) return;
    const origem = card.closest(".kb-col");
    let lista;
    let posicionar = true;
    if (col.dataset.col === "CONCLUIDO") {
      const projeto = projetos.find((x) => Number(x.id) === dragId);
      lista = garantirMes(col, chaveMes(projeto || {}));
      const mesCard = lista.closest(".kb-mes");
      const sobre = e.target.closest(".kb-mes");
      posicionar = !sobre || sobre === mesCard;
    } else {
      lista = col.querySelector(":scope > .kb-cards");
    }
    if (!lista) return;
    if (posicionar) {
      const apos = cardApos(lista, e.clientY);
      if (apos) lista.insertBefore(card, apos);
      else lista.appendChild(card);
    } else if (!lista.contains(card)) {
      lista.appendChild(card);
    }
    board.querySelectorAll(".kb-mes").forEach((mes) => {
      if (!mes.querySelector(".kb-card")) mes.remove();
    });
    atualizarContagem(col);
    if (origem && origem !== col) atualizarContagem(origem);
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
    tbody.innerHTML = `<tr><td class="empty" colspan="6">${escapeHtml(err.message)}</td></tr>`;
    board.innerHTML = `<p class="empty">${escapeHtml(err.message)}</p>`;
  }
});
