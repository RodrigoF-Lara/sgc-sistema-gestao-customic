document.addEventListener("DOMContentLoaded", async () => {
  if (!localStorage.getItem("userName") && !localStorage.getItem("userCode")) {
    window.location.href = "/index.html";
    return;
  }
  if (window.SGCPermissoes) {
    const ok = await window.SGCPermissoes.protegerPagina("orcamentos");
    if (!ok) return;
  }

  const API = "/api/embalagem/orcamento";
  const STATUS = {
    ABERTO: "Aberto",
    APROVADO: "Aprovado",
    REPROVADO: "Reprovado",
  };

  const avisoEl = document.getElementById("aviso");
  const painelLista = document.getElementById("painelLista");
  const painelFicha = document.getElementById("painelFicha");
  const corpoLista = document.getElementById("corpoLista");
  const corpoItens = document.getElementById("corpoItens");
  let sugEl = null;
  let ocupado = false;
  let filtroStatus = "";
  let ficha = null;

  function authHeaders() {
    const h = { "Content-Type": "application/json" };
    if (window.SGCPermissoes) Object.assign(h, window.SGCPermissoes.authHeaders());
    const nivel = localStorage.getItem("userLevel");
    const nome = localStorage.getItem("userName");
    const code = localStorage.getItem("userCode");
    if (nivel) h["x-user-level"] = nivel;
    if (nome) h["x-user-name"] = encodeURIComponent(nome);
    if (code) h["x-user-code"] = code;
    return h;
  }

  function usuario() {
    return localStorage.getItem("userName") || localStorage.getItem("userCode") || "SGC";
  }

  function escapeHtml(s) {
    return String(s ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function aviso(msg, tipo) {
    if (!msg) {
      avisoEl.hidden = true;
      avisoEl.textContent = "";
      return;
    }
    avisoEl.hidden = false;
    avisoEl.className = "aviso " + (tipo || "erro");
    avisoEl.textContent = msg;
    avisoEl.scrollIntoView({ block: "nearest" });
  }

  async function api(method, acao, opts) {
    const q = new URLSearchParams({ acao });
    const nivel = localStorage.getItem("userLevel");
    if (nivel) q.set("userLevel", nivel);
    Object.entries((opts && opts.query) || {}).forEach(([k, v]) => {
      if (v != null && v !== "") q.set(k, v);
    });
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
    if (!res.ok || data.success === false) {
      throw new Error(data.error || data.message || "Não foi possível concluir a operação.");
    }
    return data;
  }

  function parseNum(v) {
    if (typeof v === "number") return v;
    let s = String(v ?? "").trim().replace(/\s/g, "");
    if (!s) return NaN;
    if (s.includes(",")) s = s.replace(/\./g, "").replace(",", ".");
    const n = Number(s);
    return Number.isFinite(n) ? n : NaN;
  }

  function moeda(n) {
    return Number(n || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  }

  function fmtNum(n, casas) {
    const x = Number(n);
    if (!Number.isFinite(x)) return "";
    return x.toLocaleString("pt-BR", { maximumFractionDigits: casas });
  }

  function fmtData(iso) {
    const m = String(iso || "").match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (!m) return "—";
    return `${m[3]}/${m[2]}/${m[1]}`;
  }

  function fmtDataHora(valor) {
    const m = String(valor || "").match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})/);
    if (!m) return "";
    return `${m[3]}/${m[2]}/${m[1]} ${m[4]}:${m[5]}`;
  }

  function hoje() {
    const d = new Date();
    const z = (n) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}`;
  }

  function tag(status) {
    const chave = String(status || "").toLowerCase();
    return `<span class="tag ${escapeHtml(chave)}">${escapeHtml(STATUS[status] || status || "")}</span>`;
  }

  function textoPrazo(row) {
    const partes = [];
    if (row.prazoDias != null && row.prazoDias !== "") partes.push(`${row.prazoDias} dias`);
    if (row.dataEntrega) partes.push(fmtData(row.dataEntrega));
    return partes.join(" · ") || "—";
  }

  function textoProdutos(row) {
    if (!row.qtdItens) return "—";
    const base = row.resumoProdutos || `${row.qtdItens} item(ns)`;
    const extra = row.qtdItens > 3 && row.resumoProdutos ? ` (+${row.qtdItens - 3})` : "";
    return base + extra;
  }

  function textoNf(row) {
    if (!row.idNf) return "—";
    return row.numNf ? `NF ${row.numNf}` : `NF #${row.idNf}`;
  }

  function fecharSug() {
    if (sugEl) {
      sugEl.remove();
      sugEl = null;
    }
  }

  function abrirSug(input, itens, onPick) {
    fecharSug();
    if (!itens.length) return;
    const box = document.createElement("div");
    box.className = "sug";
    itens.forEach((item) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "sug-item";
      btn.innerHTML = `<strong>${escapeHtml(item.titulo)}</strong><small>${escapeHtml(item.detalhe || "")}</small>`;
      btn.addEventListener("mousedown", (e) => e.preventDefault());
      btn.addEventListener("click", () => {
        fecharSug();
        onPick(item);
      });
      box.appendChild(btn);
    });
    document.body.appendChild(box);
    const r = input.getBoundingClientRect();
    box.style.left = `${r.left}px`;
    box.style.top = `${r.bottom + 4}px`;
    box.style.width = `${Math.max(r.width, 280)}px`;
    sugEl = box;
  }

  function renderResumo(resumo) {
    const blocos = [
      ["", "No filtro", resumo.total],
      ["ABERTO", "Abertos", resumo.abertos],
      ["APROVADO", "Aprovados", resumo.aprovados],
      ["REPROVADO", "Reprovados", resumo.reprovados],
      ["APROVADO", "Valor aprovado", moeda(resumo.valorAprovado), true],
    ];
    document.getElementById("resumo").innerHTML = blocos.map((b, i) => {
      const valor = i === 4 ? b[2] : String(b[2] ?? 0);
      const miolo = `<span class="rotulo">${escapeHtml(b[1])}</span><span class="valor">${escapeHtml(valor)}</span>`;
      if (i === 4) return `<div class="resumo">${miolo}</div>`;
      const ativo = filtroStatus === b[0] ? " ativo" : "";
      return `<button type="button" class="resumo${ativo}" data-status="${b[0]}">${miolo}</button>`;
    }).join("");
  }

  function renderLista(linhas) {
    if (!linhas.length) {
      corpoLista.innerHTML = "";
      document.getElementById("vazioLista").hidden = false;
      return;
    }
    document.getElementById("vazioLista").hidden = true;
    corpoLista.innerHTML = linhas.map((row) => `
      <tr data-id="${row.id}">
        <td><strong>${escapeHtml(row.numero || "#" + row.id)}</strong></td>
        <td>${escapeHtml(fmtData(row.dataOrcamento))}</td>
        <td>${escapeHtml(row.codFornecedor)} — ${escapeHtml(row.razaoSocial || "Sem nome")}</td>
        <td class="produtos" title="${escapeHtml(textoProdutos(row))}">${escapeHtml(textoProdutos(row))}</td>
        <td>${escapeHtml(moeda(row.valorTotal))}</td>
        <td>${escapeHtml(textoPrazo(row))}</td>
        <td>${tag(row.status)}</td>
        <td>${escapeHtml(textoNf(row))}</td>
      </tr>
    `).join("");
  }

  async function carregarLista() {
    aviso("");
    const data = await api("GET", "listar", {
      query: {
        q: document.getElementById("busca").value.trim(),
        status: filtroStatus,
        de: document.getElementById("filtroDe").value,
        ate: document.getElementById("filtroAte").value,
      },
    });
    renderResumo(data.resumo || {});
    renderLista(data.data || []);
    const avisoLimite = document.getElementById("truncado");
    avisoLimite.hidden = !data.truncado;
    avisoLimite.textContent = data.truncado
      ? "Mostrando os 300 orçamentos mais recentes deste filtro."
      : "";
  }

  function mostrarLista() {
    painelFicha.hidden = true;
    painelLista.hidden = false;
    ficha = null;
    const url = new URL(window.location.href);
    url.searchParams.delete("id");
    history.replaceState(null, "", url.pathname + url.search);
  }

  function mostrarFicha() {
    painelLista.hidden = true;
    painelFicha.hidden = false;
  }

  function linhaItem(item) {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td><input class="cod" autocomplete="off" aria-label="Código do produto" value="${escapeHtml(item.codigo || "")}" /></td>
      <td><input class="desc" readonly tabindex="-1" aria-label="Descrição" value="${escapeHtml(item.descricao || "")}" /></td>
      <td><input class="qtd" inputmode="decimal" aria-label="Quantidade" value="${escapeHtml(item.quantidade != null && item.quantidade !== "" ? fmtNum(item.quantidade, 4) : "")}" /></td>
      <td><input class="vu" inputmode="decimal" aria-label="Valor unitário" value="${escapeHtml(item.valorUnitario != null && item.valorUnitario !== "" ? fmtNum(item.valorUnitario, 6) : "")}" /></td>
      <td class="total"></td>
      <td><input class="pz" inputmode="numeric" aria-label="Prazo do item em dias" placeholder="igual" value="${escapeHtml(item.prazoDias != null && item.prazoDias !== "" ? item.prazoDias : "")}" /></td>
      <td><button type="button" class="icone remover" aria-label="Remover produto"><i class="fa-solid fa-trash"></i></button></td>
    `;
    const cod = tr.querySelector(".cod");
    const desc = tr.querySelector(".desc");
    let timer = null;
    cod.addEventListener("input", () => {
      clearTimeout(timer);
      const q = cod.value.trim();
      if (q.length < 2) {
        fecharSug();
        return;
      }
      timer = setTimeout(async () => {
        try {
          const data = await api("GET", "produtos", { query: { q } });
          if (document.activeElement !== cod) return;
          abrirSug(cod, (data.data || []).map((p) => ({
            titulo: p.codigo,
            detalhe: p.descricao,
            codigo: p.codigo,
            descricao: p.descricao,
          })), (p) => {
            cod.value = p.codigo;
            desc.value = p.descricao || "";
            atualizarTotais();
          });
        } catch (err) {
          aviso(err.message);
        }
      }, 250);
    });
    cod.addEventListener("blur", async () => {
      const q = cod.value.trim();
      if (!q) {
        desc.value = "";
        return;
      }
      try {
        const data = await api("GET", "produto", { query: { codigo: q } });
        cod.value = data.data.codigo;
        desc.value = data.data.descricao || "";
        cod.classList.remove("campo-erro");
      } catch (_) {
        desc.value = "";
        cod.classList.add("campo-erro");
      }
    });
    tr.querySelector(".qtd").addEventListener("input", atualizarTotais);
    tr.querySelector(".vu").addEventListener("input", atualizarTotais);
    tr.querySelector(".remover").addEventListener("click", () => {
      tr.remove();
      if (!corpoItens.children.length) adicionarItem({});
      atualizarTotais();
    });
    return tr;
  }

  function adicionarItem(item) {
    corpoItens.appendChild(linhaItem(item || {}));
    atualizarTotais();
  }

  function renderItens(itens) {
    corpoItens.innerHTML = "";
    (itens.length ? itens : [{}]).forEach((item) => corpoItens.appendChild(linhaItem(item)));
    atualizarTotais();
  }

  function atualizarTotais() {
    let soma = 0;
    corpoItens.querySelectorAll("tr").forEach((tr) => {
      const qtd = parseNum(tr.querySelector(".qtd").value);
      const vu = parseNum(tr.querySelector(".vu").value);
      const celula = tr.querySelector(".total");
      if (!Number.isFinite(qtd) || !Number.isFinite(vu)) {
        celula.textContent = "—";
        return;
      }
      const total = qtd * vu;
      soma += total;
      celula.textContent = moeda(total);
    });
    document.getElementById("totalGeral").textContent = moeda(soma);
  }

  function aplicarTrava(data) {
    const aberto = !data || data.status === "ABERTO";
    const ligado = !!(data && data.idNf);
    document.querySelectorAll("#blocoDados input, #blocoDados textarea, #corpoItens input, #corpoItens button").forEach((el) => {
      if (el.id === "razaoForn") {
        el.readOnly = true;
        return;
      }
      el.disabled = !aberto;
    });
    ["btnVoltar", "btnExcluir", "btnReabrir", "btnReprovar", "btnAprovar", "btnSalvar", "btnAdd"].forEach((id) => {
      const el = document.getElementById(id);
      if (el) el.disabled = false;
    });
    document.getElementById("btnAdd").hidden = !aberto;
    document.getElementById("btnSalvar").hidden = !aberto;
    document.getElementById("btnAprovar").hidden = !aberto;
    document.getElementById("btnReprovar").hidden = !aberto;
    document.getElementById("btnReabrir").hidden = aberto || ligado || !(data && data.id);
    document.getElementById("btnExcluir").hidden = !data || !data.id || data.status === "APROVADO" || ligado;
    document.getElementById("badgeStatus").innerHTML = data && data.status ? tag(data.status) : tag("ABERTO");

    const notas = [];
    if (data && data.criadoPor) notas.push(`Registrado por ${data.criadoPor}${data.criadoEm ? " em " + fmtDataHora(data.criadoEm) : ""}`);
    if (data && data.aprovadoPor && data.status !== "ABERTO") {
      const verbo = data.status === "APROVADO" ? "Aprovado" : "Reprovado";
      notas.push(`${verbo} por ${data.aprovadoPor}${data.aprovadoEm ? " em " + fmtDataHora(data.aprovadoEm) : ""}`);
    }
    document.getElementById("auditoria").textContent = notas.join(" · ");

    const notaTexto = document.getElementById("notaTexto");
    if (data && data.idNf) {
      const num = data.numNf ? `NF ${data.numNf}` : `nota #${data.idNf}`;
      notaTexto.textContent = `Ligado à ${num}${data.statusNf ? " (" + data.statusNf + ")" : ""}.`;
    } else {
      notaTexto.textContent = "Este orçamento ainda não está ligado a uma nota. Quando a compra for lançada, ele poderá ser vinculado à NF.";
    }
  }

  function preencher(data) {
    ficha = data;
    document.getElementById("orcId").value = data && data.id ? data.id : "";
    document.getElementById("tituloFicha").textContent = data && data.numero ? data.numero : "Novo orçamento";
    document.getElementById("codForn").value = data && data.codFornecedor ? data.codFornecedor : "";
    document.getElementById("razaoForn").value = data && data.razaoSocial ? data.razaoSocial : "";
    document.getElementById("numero").value = data && data.numero ? data.numero : "";
    document.getElementById("dataOrc").value = data && data.dataOrcamento ? data.dataOrcamento : hoje();
    document.getElementById("prazoDias").value = data && data.prazoDias != null ? data.prazoDias : "";
    document.getElementById("dataEntrega").value = data && data.dataEntrega ? data.dataEntrega : "";
    document.getElementById("obs").value = data && data.observacao ? data.observacao : "";
    document.getElementById("motivo").value = data && data.motivo ? data.motivo : "";
    renderItens(data && data.itens && data.itens.length ? data.itens : [{}]);
    aplicarTrava(data || { status: "ABERTO" });
    mostrarFicha();
    if (data && data.id) {
      const url = new URL(window.location.href);
      url.searchParams.set("id", data.id);
      history.replaceState(null, "", url.pathname + url.search);
    }
  }

  function coletar() {
    const itens = [...corpoItens.querySelectorAll("tr")].map((tr) => ({
      codigo: tr.querySelector(".cod").value.trim(),
      quantidade: tr.querySelector(".qtd").value.trim(),
      valorUnitario: tr.querySelector(".vu").value.trim(),
      prazoDias: tr.querySelector(".pz").value.trim(),
    })).filter((item) => item.codigo || item.quantidade || item.valorUnitario || item.prazoDias);
    return {
      id: document.getElementById("orcId").value || null,
      numero: document.getElementById("numero").value.trim(),
      codFornecedor: document.getElementById("codForn").value.trim(),
      dataOrcamento: document.getElementById("dataOrc").value,
      prazoDias: document.getElementById("prazoDias").value.trim(),
      dataEntrega: document.getElementById("dataEntrega").value,
      observacao: document.getElementById("obs").value.trim(),
      motivo: document.getElementById("motivo").value.trim(),
      itens,
    };
  }

  function validar(dados, exigirMotivo) {
    if (!dados.codFornecedor) return "Informe o fornecedor.";
    if (!/^\d+$/.test(dados.codFornecedor)) return "O código do fornecedor deve ser numérico.";
    if (!dados.dataOrcamento) return "Informe a data do orçamento.";
    if (dados.prazoDias !== "" && !/^\d+$/.test(dados.prazoDias)) return "Prazo de entrega inválido. Use dias inteiros.";
    if (!dados.itens.length) return "Inclua ao menos um produto.";
    for (let i = 0; i < dados.itens.length; i++) {
      const item = dados.itens[i];
      const linha = i + 1;
      if (!item.codigo) return `Informe o produto da linha ${linha}.`;
      const qtd = parseNum(item.quantidade);
      if (!Number.isFinite(qtd) || qtd <= 0) return `Quantidade inválida na linha ${linha}.`;
      const valor = parseNum(item.valorUnitario);
      if (!Number.isFinite(valor) || valor < 0) return `Valor unitário inválido na linha ${linha}.`;
      if (item.prazoDias !== "" && !/^\d+$/.test(item.prazoDias)) return `Prazo inválido na linha ${linha}. Use dias inteiros.`;
    }
    const temPrazoCab = dados.prazoDias !== "" || dados.dataEntrega;
    const temPrazoItem = dados.itens.every((item) => item.prazoDias !== "");
    if (!temPrazoCab && !temPrazoItem) return "Informe o prazo em dias ou a data de entrega.";
    if (exigirMotivo && !dados.motivo) return "Informe o motivo da reprovação.";
    return "";
  }

  async function salvarAtual() {
    const dados = coletar();
    const erro = validar(dados, false);
    if (erro) throw new Error(erro);
    const resp = await api("POST", "salvar", { body: dados });
    return resp.data;
  }

  async function comOcupacao(fn) {
    if (ocupado) return;
    ocupado = true;
    document.querySelectorAll("#painelFicha .acoes button, #btnAdd").forEach((b) => { b.disabled = true; });
    try {
      await fn();
    } catch (err) {
      aviso(err.message);
    } finally {
      ocupado = false;
      aplicarTrava(ficha || { status: "ABERTO" });
    }
  }

  async function abrir(id) {
    aviso("");
    try {
      const data = await api("GET", "detalhe", { query: { id } });
      preencher(data.data);
    } catch (err) {
      aviso(err.message);
      mostrarLista();
    }
  }

  let timerForn = null;
  const codForn = document.getElementById("codForn");
  codForn.addEventListener("input", () => {
    clearTimeout(timerForn);
    const q = codForn.value.trim();
    if (q.length < 1) {
      fecharSug();
      return;
    }
    timerForn = setTimeout(async () => {
      try {
        const data = await api("GET", "fornecedores", { query: { q } });
        if (document.activeElement !== codForn) return;
        abrirSug(codForn, (data.data || []).map((f) => ({
          titulo: String(f.codigo),
          detalhe: f.razaoSocial,
          codigo: f.codigo,
          razaoSocial: f.razaoSocial,
        })), (f) => {
          codForn.value = f.codigo;
          document.getElementById("razaoForn").value = f.razaoSocial || "";
        });
      } catch (err) {
        aviso(err.message);
      }
    }, 250);
  });
  codForn.addEventListener("blur", async () => {
    const q = codForn.value.trim();
    if (!q) {
      document.getElementById("razaoForn").value = "";
      return;
    }
    try {
      const data = await api("GET", "fornecedor", { query: { cod: q } });
      codForn.value = data.data.codigo;
      document.getElementById("razaoForn").value = data.data.razaoSocial || "";
    } catch (_) {
      document.getElementById("razaoForn").value = "";
    }
  });
  codForn.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      codForn.blur();
    }
  });

  document.getElementById("btnNovo").addEventListener("click", () => {
    aviso("");
    preencher({ status: "ABERTO", itens: [{}], dataOrcamento: hoje() });
  });
  document.getElementById("btnVoltar").addEventListener("click", async () => {
    fecharSug();
    mostrarLista();
    try { await carregarLista(); } catch (err) { aviso(err.message); }
  });
  document.getElementById("btnFiltrar").addEventListener("click", () => {
    carregarLista().catch((err) => aviso(err.message));
  });
  document.getElementById("busca").addEventListener("keydown", (e) => {
    if (e.key === "Enter") carregarLista().catch((err) => aviso(err.message));
  });
  document.getElementById("resumo").addEventListener("click", (e) => {
    const btn = e.target.closest("button.resumo");
    if (!btn || btn.getAttribute("data-fixo") === "1") return;
    filtroStatus = btn.getAttribute("data-status") || "";
    carregarLista().catch((err) => aviso(err.message));
  });
  corpoLista.addEventListener("click", (e) => {
    const tr = e.target.closest("tr[data-id]");
    if (!tr) return;
    abrir(tr.getAttribute("data-id"));
  });
  document.getElementById("btnAdd").addEventListener("click", () => adicionarItem({}));
  document.getElementById("btnSalvar").addEventListener("click", () => comOcupacao(async () => {
    const data = await salvarAtual();
    preencher(data);
    aviso("Orçamento salvo.", "ok");
  }));
  document.getElementById("btnAprovar").addEventListener("click", () => comOcupacao(async () => {
    const dados = coletar();
    const erro = validar(dados, false);
    if (erro) throw new Error(erro);
    if (!window.confirm("Aprovar este orçamento?")) return;
    const salvo = await api("POST", "salvar", { body: dados });
    preencher(salvo.data);
    const decidido = await api("POST", "decidir", {
      body: { id: salvo.data.id, status: "APROVADO", motivo: dados.motivo },
    });
    preencher(decidido.data);
    aviso("Orçamento aprovado.", "ok");
  }));
  document.getElementById("btnReprovar").addEventListener("click", () => comOcupacao(async () => {
    const dados = coletar();
    const erro = validar(dados, true);
    if (erro) throw new Error(erro);
    if (!window.confirm("Reprovar este orçamento?")) return;
    const salvo = await api("POST", "salvar", { body: dados });
    preencher(salvo.data);
    const decidido = await api("POST", "decidir", {
      body: { id: salvo.data.id, status: "REPROVADO", motivo: dados.motivo },
    });
    preencher(decidido.data);
    aviso("Orçamento reprovado.", "ok");
  }));
  document.getElementById("btnReabrir").addEventListener("click", () => comOcupacao(async () => {
    if (!ficha || !ficha.id) return;
    if (!window.confirm("Reabrir o orçamento para edição? A decisão atual deixa de valer.")) return;
    const data = await api("POST", "decidir", { body: { id: ficha.id, status: "ABERTO" } });
    preencher(data.data);
    aviso("Orçamento reaberto.", "ok");
  }));
  document.getElementById("btnExcluir").addEventListener("click", () => comOcupacao(async () => {
    if (!ficha || !ficha.id) return;
    if (!window.confirm("Excluir este orçamento? Essa ação não pode ser desfeita.")) return;
    await api("POST", "excluir", { body: { id: ficha.id } });
    mostrarLista();
    await carregarLista();
    aviso("Orçamento excluído.", "ok");
  }));

  document.addEventListener("click", (e) => {
    if (sugEl && !sugEl.contains(e.target)) fecharSug();
  });
  document.querySelector(".main-content").addEventListener("scroll", fecharSug, { passive: true });

  const idUrl = new URLSearchParams(window.location.search).get("id");
  try {
    if (idUrl) await abrir(idUrl);
    else await carregarLista();
  } catch (err) {
    aviso(err.message);
  }
});
