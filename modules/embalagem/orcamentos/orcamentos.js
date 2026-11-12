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
  const LIMITE_ANEXO = 3 * 1024 * 1024;
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
  const comprasCache = new Map();
  const comprasPendentes = new Set();
  const MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
  let geracaoAnexos = 0;
  const thumbs = new Map();

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

  function moeda4(n) {
    return Number(n || 0).toLocaleString("pt-BR", {
      style: "currency",
      currency: "BRL",
      minimumFractionDigits: 4,
      maximumFractionDigits: 4,
    });
  }

  function rotuloMes(ano, mes) {
    const nome = MESES[(Number(mes) || 1) - 1] || "";
    return `${nome}/${String(ano || "").slice(-2)}`;
  }

  function textoComparacao(cotado, ultimo) {
    if (!Number.isFinite(cotado) || !Number.isFinite(ultimo) || ultimo <= 0) return null;
    const pct = ((cotado - ultimo) / ultimo) * 100;
    const textoPct = Math.abs(pct).toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
    if (Math.abs(pct) < 0.05) return { cls: "igual", texto: "igual à última compra" };
    if (pct > 0) return { cls: "acima", texto: `${textoPct}% acima da última` };
    return { cls: "abaixo", texto: `${textoPct}% abaixo da última` };
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

  function textoAnexos(qtd) {
    const n = Number(qtd) || 0;
    return n === 1 ? "1 anexo" : `${n} anexos`;
  }

  function textoTamanho(n) {
    const b = Number(n) || 0;
    if (b < 1024) return `${b} B`;
    if (b < 1024 * 1024) return `${Math.round(b / 1024).toLocaleString("pt-BR")} KB`;
    return `${(b / (1024 * 1024)).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} MB`;
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
        <td><strong>${escapeHtml(row.numero || "#" + row.id)}</strong>${row.qtdAnexos ? `<span class="qtd-anexo">${escapeHtml(textoAnexos(row.qtdAnexos))}</span>` : ""}</td>
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
    geracaoAnexos += 1;
    soltarThumbs(null);
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
      <td class="compras"></td>
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
      const celula = tr.querySelector(".compras");
      if (celula && celula.dataset.codigo !== q.toUpperCase()) {
        celula.dataset.codigo = "";
        celula.dataset.estado = "";
        celula.innerHTML = `<span class="vazio">—</span>`;
      }
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
            pedirComprasDaTela();
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
        pedirComprasDaTela();
      } catch (_) {
        desc.value = "";
        cod.classList.add("campo-erro");
        pedirComprasDaTela();
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
    pedirComprasDaTela();
  }

  function pintarCompras(tr) {
    const celula = tr.querySelector(".compras");
    if (!celula) return;
    const codigo = tr.querySelector(".cod").value.trim().toUpperCase();
    if (!codigo) {
      celula.dataset.estado = "";
      celula.innerHTML = `<span class="vazio">—</span>`;
      return;
    }
    if (!comprasCache.has(codigo)) {
      if (!comprasPendentes.has(codigo)) return;
      if (celula.dataset.estado !== "busca") {
        celula.dataset.estado = "busca";
        celula.innerHTML = `<span class="vazio">Buscando…</span>`;
      }
      return;
    }
    const lista = comprasCache.get(codigo) || [];
    celula.dataset.estado = "ok";
    celula.dataset.codigo = codigo;
    if (!lista.length) {
      celula.innerHTML = `<span class="vazio">Sem compra nos últimos 3 anos</span>`;
      return;
    }
    const linhas = lista.map((mes) => `
      <div class="mes"><span>${escapeHtml(rotuloMes(mes.ano, mes.mes))}</span><strong>${escapeHtml(moeda4(mes.custo))}</strong></div>
    `).join("");
    const cotado = parseNum(tr.querySelector(".vu").value);
    const cmp = textoComparacao(cotado, Number(lista[0].custo));
    const extra = cmp ? `<div class="cmp ${cmp.cls}">${escapeHtml(cmp.texto)}</div>` : "";
    celula.innerHTML = linhas + extra;
  }

  function pedirComprasDaTela() {
    const codigos = [...corpoItens.querySelectorAll(".cod")]
      .map((input) => input.value.trim().toUpperCase())
      .filter(Boolean);
    carregarCompras(codigos);
  }

  async function carregarCompras(codigos) {
    const lista = [...new Set(codigos)].filter((codigo) => codigo && !comprasCache.has(codigo) && !comprasPendentes.has(codigo));
    pintarTodasCompras();
    if (!lista.length) return;
    lista.forEach((codigo) => comprasPendentes.add(codigo));
    try {
      const resp = await api("POST", "compras", { body: { codigos: lista } });
      const dados = resp.data || {};
      lista.forEach((codigo) => comprasCache.set(codigo, dados[codigo] || []));
    } catch (err) {
      aviso(err.message);
    } finally {
      lista.forEach((codigo) => comprasPendentes.delete(codigo));
      pintarTodasCompras();
    }
  }

  function pintarTodasCompras() {
    corpoItens.querySelectorAll("tr").forEach(pintarCompras);
  }

  function atualizarTotais() {
    let soma = 0;
    corpoItens.querySelectorAll("tr").forEach((tr) => {
      const qtd = parseNum(tr.querySelector(".qtd").value);
      const vu = parseNum(tr.querySelector(".vu").value);
      const celula = tr.querySelector(".total");
      if (!Number.isFinite(qtd) || !Number.isFinite(vu)) {
        celula.textContent = "—";
      } else {
        const total = qtd * vu;
        soma += total;
        celula.textContent = moeda(total);
      }
      pintarCompras(tr);
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
    ["btnVoltar", "btnExcluir", "btnReabrir", "btnReprovar", "btnAprovar", "btnSalvar", "btnAdd", "btnAnexarPdf", "btnAnexarFoto"].forEach((id) => {
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
    travarAnexos(data);
  }

  function soltarThumbs(manter) {
    for (const [id, url] of thumbs) {
      if (manter && manter.has(id)) continue;
      URL.revokeObjectURL(url);
      thumbs.delete(id);
    }
  }

  function travarAnexos(data) {
    const bloqueado = !!(data && data.idNf);
    const pdf = document.getElementById("btnAnexarPdf");
    const foto = document.getElementById("btnAnexarFoto");
    if (pdf) pdf.disabled = bloqueado;
    if (foto) foto.disabled = bloqueado;
    const trava = document.getElementById("anexoTrava");
    if (trava) trava.hidden = !bloqueado;
    document.querySelectorAll("#listaAnexos .remover-anexo").forEach((botao) => {
      botao.hidden = bloqueado;
      botao.disabled = bloqueado;
    });
  }

  function botaoAnexo(classe, rotulo, aoClicar) {
    const botao = document.createElement("button");
    botao.type = "button";
    botao.className = classe;
    botao.textContent = rotulo;
    botao.addEventListener("click", aoClicar);
    return botao;
  }

  async function obterBlob(anexo) {
    const q = new URLSearchParams({
      acao: "anexo",
      id: String(ficha.id),
      anexoId: String(anexo.id),
    });
    const nivel = localStorage.getItem("userLevel");
    if (nivel) q.set("userLevel", nivel);
    const headers = authHeaders();
    delete headers["Content-Type"];
    const res = await fetch(`${API}?${q}`, { headers });
    if (!res.ok) {
      let msg = "Não foi possível abrir o anexo.";
      try {
        const data = await res.json();
        if (data.error) msg = data.error;
      } catch (_) { /* corpo binário */ }
      throw new Error(msg);
    }
    return res.blob();
  }

  async function abrirAnexo(anexo) {
    try {
      const blob = await obterBlob(anexo);
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
    } catch (err) {
      aviso(err.message);
    }
  }

  async function baixarArquivo(anexo) {
    try {
      const blob = await obterBlob(anexo);
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = anexo.nome || (anexo.tipo === "PDF" ? "orcamento.pdf" : "foto");
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch (err) {
      aviso(err.message);
    }
  }

  async function carregarThumb(anexo, geracao) {
    if (thumbs.has(anexo.id)) return;
    try {
      const blob = await obterBlob(anexo);
      if (geracao !== geracaoAnexos) return;
      const url = URL.createObjectURL(blob);
      const img = document.querySelector(`#listaAnexos img[data-id="${anexo.id}"]`);
      if (!img) {
        URL.revokeObjectURL(url);
        return;
      }
      thumbs.set(anexo.id, url);
      img.src = url;
    } catch (_) { /* Abrir continua disponível */ }
  }

  function renderAnexos() {
    const geracao = ++geracaoAnexos;
    const box = document.getElementById("listaAnexos");
    const lista = ficha && Array.isArray(ficha.anexos) ? ficha.anexos : [];
    soltarThumbs(new Set(lista.map((anexo) => anexo.id)));
    box.replaceChildren();
    if (!lista.length) {
      const vazio = document.createElement("p");
      vazio.className = "vazio-anexo";
      vazio.textContent = "Nenhum PDF ou foto anexado.";
      box.appendChild(vazio);
      return;
    }
    const grade = document.createElement("div");
    grade.className = "grade-anexos";
    const bloqueado = !!(ficha && ficha.idNf);
    lista.forEach((anexo) => {
      const card = document.createElement("article");
      card.className = "anexo-card";
      if (anexo.tipo === "IMAGEM") {
        const img = document.createElement("img");
        img.alt = anexo.nome || "Foto";
        img.dataset.id = String(anexo.id);
        if (thumbs.has(anexo.id)) img.src = thumbs.get(anexo.id);
        card.appendChild(img);
        carregarThumb(anexo, geracao);
      } else {
        const ico = document.createElement("div");
        ico.className = "anexo-pdf";
        ico.innerHTML = '<i class="fa-solid fa-file-pdf"></i>';
        card.appendChild(ico);
      }
      const nome = document.createElement("div");
      nome.className = "anexo-nome";
      nome.textContent = anexo.nome || (anexo.tipo === "PDF" ? "PDF" : "Foto");
      nome.title = nome.textContent;
      const meta = document.createElement("div");
      meta.className = "anexo-meta";
      meta.textContent = textoTamanho(anexo.tamanho);
      const acoes = document.createElement("div");
      acoes.className = "anexo-botoes";
      acoes.appendChild(botaoAnexo("sec", "Abrir", () => abrirAnexo(anexo)));
      acoes.appendChild(botaoAnexo("sec", "Baixar", () => baixarArquivo(anexo)));
      const remover = botaoAnexo("icone remover-anexo", "", () => removerAnexo(anexo));
      remover.innerHTML = '<i class="fa-solid fa-trash"></i>';
      remover.setAttribute("aria-label", "Remover anexo");
      remover.hidden = bloqueado;
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

  function escolherArquivos(input) {
    if (!(ficha && ficha.id)) {
      const erro = validar(coletar(), false);
      if (erro) {
        aviso(erro);
        return;
      }
    }
    if (ficha && ficha.idNf) return;
    input.value = "";
    input.click();
  }

  async function enviarArquivos(files) {
    const lista = [...files];
    if (!lista.length) return;
    for (const file of lista) {
      if (!file.size) throw new Error(`"${file.name || "Arquivo"}" está vazio.`);
      if (file.size > LIMITE_ANEXO) throw new Error(`"${file.name || "Arquivo"}" passa de 3 MB.`);
    }
    await comOcupacao(async () => {
      let id = ficha && ficha.id;
      if (!id) {
        const salvo = await salvarAtual();
        preencher(salvo);
        id = salvo.id;
        ocuparBotoes();
      }
      for (const file of lista) {
        const data = await lerDataUrl(file);
        const resp = await api("POST", "anexo", {
          body: { id, nome: file.name, mime: file.type || "", data },
        });
        if (ficha) ficha.anexos = resp.data || [];
        renderAnexos();
        ocuparBotoes();
      }
      aviso(lista.length === 1 ? "Anexo enviado." : "Anexos enviados.", "ok");
    });
  }

  function removerAnexo(anexo) {
    comOcupacao(async () => {
      if (!ficha || !ficha.id) return;
      if (!window.confirm("Remover este anexo?")) return;
      const resp = await api("POST", "excluirAnexo", { body: { id: ficha.id, anexoId: anexo.id } });
      ficha.anexos = resp.data || [];
      renderAnexos();
      aviso("Anexo removido.", "ok");
    });
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
    renderAnexos();
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

  function ocuparBotoes() {
    document.querySelectorAll("#painelFicha .acoes button, #btnAdd, #listaAnexos button").forEach((b) => { b.disabled = true; });
  }

  async function comOcupacao(fn) {
    if (ocupado) return;
    ocupado = true;
    ocuparBotoes();
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
  document.getElementById("btnAnexarPdf").addEventListener("click", () => {
    escolherArquivos(document.getElementById("filePdf"));
  });
  document.getElementById("btnAnexarFoto").addEventListener("click", () => {
    escolherArquivos(document.getElementById("fileFoto"));
  });
  document.getElementById("filePdf").addEventListener("change", (e) => {
    enviarArquivos(e.target.files).catch((err) => aviso(err.message));
  });
  document.getElementById("fileFoto").addEventListener("change", (e) => {
    enviarArquivos(e.target.files).catch((err) => aviso(err.message));
  });
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
