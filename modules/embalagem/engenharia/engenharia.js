document.addEventListener("DOMContentLoaded", async () => {
  if (!localStorage.getItem("userName") && !localStorage.getItem("userCode")) {
    window.location.href = "/index.html";
    return;
  }
  if (window.SGCPermissoes) {
    const ok = await window.SGCPermissoes.protegerPagina("engenharia-embalagens");
    if (!ok) return;
  }

  const API = "/api/embalagem/engenharia";
  const avisoEl = document.getElementById("aviso");
  const painelLista = document.getElementById("painelLista");
  const painelFicha = document.getElementById("painelFicha");
  const painelPrecos = document.getElementById("painelPrecos");
  const corpoLista = document.getElementById("corpoLista");
  const canvas = document.getElementById("caixa3d");
  let ficha = null;
  let editavel = true;
  let origem = "PARAMETRICO";
  let desenho = null;
  let ocupado = false;
  let silencioso = false;
  let geoTimer = 0;
  let estTimer = 0;
  let skuTimer = 0;
  const rot = { yaw: -0.7, pitch: 0.35, arrastando: false, x: 0, y: 0 };
  let arteImg = null;
  let arteId = null;
  let arteSeq = 0;

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

  function numero(valor) {
    const n = Number(String(valor ?? "").trim().replace(/\s/g, "").replace(",", "."));
    return Number.isFinite(n) ? n : null;
  }

  function campo(id) {
    return document.getElementById(id).value;
  }

  function quando(s) {
    const m = String(s || "").match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})/);
    return m ? `${m[3]}/${m[2]}/${m[1]} ${m[4]}:${m[5]}` : (s || "");
  }

  function brl(n) {
    return Number(n || 0).toLocaleString("pt-BR", {
      style: "currency",
      currency: "BRL",
      minimumFractionDigits: 2,
      maximumFractionDigits: 4,
    });
  }

  function mm(n) {
    const v = Number(n);
    if (!Number.isFinite(v)) return "—";
    return v.toLocaleString("pt-BR", { maximumFractionDigits: 2 });
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

  function mostrar(qual) {
    painelLista.hidden = qual !== "lista";
    painelFicha.hidden = qual !== "ficha";
    painelPrecos.hidden = qual !== "precos";
    if (qual === "lista") {
      const url = window.location.pathname;
      if (window.location.search) history.replaceState(null, "", url);
    }
  }

  function payload() {
    return {
      id: ficha && ficha.id ? ficha.id : undefined,
      titulo: campo("titulo"),
      sku: campo("sku"),
      cliente: campo("cliente"),
      origem,
      comprimento: campo("comprimento"),
      largura: campo("largura"),
      altura: campo("altura"),
      espessura: campo("espessura"),
      sangria: campo("sangria"),
      folhaLargura: campo("folhaLargura"),
      folhaAltura: campo("folhaAltura"),
      material: campo("material"),
      gramatura: campo("gramatura"),
      impressao: campo("impressao"),
      pantone: campo("pantone"),
      laminacao: document.getElementById("laminacao").checked,
      verniz: document.getElementById("verniz").checked,
      janela: document.getElementById("janela").checked,
      observacao: campo("observacao"),
      quantidade: campo("quantidade"),
      poses: campo("poses"),
      perda: campo("perda"),
    };
  }

  function aplicarTravas() {
    const off = !editavel;
    document.querySelectorAll("#blocoDados input, #blocoDados textarea, #blocoDados select").forEach((el) => {
      if (el.id === "familia") return;
      el.disabled = off;
    });
    const parametrico = origem === "PARAMETRICO";
    document.getElementById("folhaLargura").disabled = off || parametrico;
    document.getElementById("folhaAltura").disabled = off || parametrico;
    document.getElementById("vistaFaca").hidden = !parametrico;
    document.getElementById("avisoArquivo").hidden = parametrico;
    document.getElementById("btnBaixarSvg").hidden = !parametrico || !desenho;
    document.getElementById("btnBaixarDxf").hidden = !parametrico || !desenho;
    document.getElementById("painelAnexo").hidden = off || !(ficha && ficha.id);
    document.getElementById("btnSalvar").hidden = off;
    document.getElementById("btnAprovar").hidden = off || !(ficha && ficha.id);
    const versao = ficha && ficha.versao;
    const ultima = versao && ficha.historico && ficha.historico.length
      ? ficha.historico[ficha.historico.length - 1].numero === versao.numero
      : true;
    document.getElementById("btnNova").hidden = !(versao && versao.status === "APROVADO" && ultima);
    document.getElementById("btnExcluir").hidden = off || !(ficha && ficha.id);
    if (versao) {
      document.getElementById("btnExcluir").textContent = versao.numero === 1 ? "Excluir projeto" : "Excluir rascunho";
    }
  }

  function desenharFaca(geo) {
    desenho = geo;
    const host = document.getElementById("facaHost");
    const medidas = document.getElementById("medidasFolha");
    if (!geo || origem !== "PARAMETRICO") {
      host.innerHTML = "";
      medidas.textContent = "";
      aplicarTravas();
      desenharCaixa();
      return;
    }
    const corte = geo.corte.map((p) => p.join(",")).join(" ");
    const cola = geo.colaPontos.map((p) => p.join(",")).join(" ");
    const vincos = geo.vincos.map((v) => `<line x1="${v[0]}" y1="${v[1]}" x2="${v[2]}" y2="${v[3]}" />`).join("");
    const marcas = (geo.marcas || []).map((v) => `<line x1="${v[0]}" y1="${v[1]}" x2="${v[2]}" y2="${v[3]}" />`).join("");
    const caixa = geo.sangriaCaixa;
    const sangriaSvg = caixa
      ? `<rect x="${caixa.x}" y="${caixa.y}" width="${caixa.largura}" height="${caixa.altura}" fill="none" stroke="#6a1b9a" stroke-width="0.35" stroke-dasharray="2 1.2" />`
      : "";
    const labels = geo.paineis.map((p) => {
      if (p.largura < 18) return "";
      return `<text x="${p.x + p.largura / 2}" y="${p.y + p.altura / 2}" text-anchor="middle" dominant-baseline="middle" font-size="8" fill="#546e7a">${escapeHtml(p.nome)}</text>`;
    }).join("");
    const w = geo.folhaLargura;
    const h = geo.folhaAltura;
    const margem = geo.sangria > 0 ? geo.sangria + 8 : 6;
    host.innerHTML = `<svg id="facaSvg" xmlns="http://www.w3.org/2000/svg" viewBox="${-margem} ${-margem} ${w + margem * 2} ${h + margem * 2}">
      ${sangriaSvg}
      <g stroke="#37474f" stroke-width="0.4">${marcas}</g>
      <polygon points="${cola}" fill="#e0f7fa" stroke="#80deea" stroke-width="0.8" />
      <polygon points="${corte}" fill="none" stroke="#e53935" stroke-width="0.8" />
      <g stroke="#1565c0" stroke-width="0.45">${vincos}</g>
      ${labels}
    </svg>`;
    const textoSangria = geo.sangria > 0 ? ` Sangria de estudo ${mm(geo.sangria)} mm, fora da área do pré-orçamento.` : "";
    medidas.textContent = `Folha de estudo ${mm(w)} × ${mm(h)} mm. Cola ${mm(geo.cola)}, tampa ${mm(geo.tuck)}, poeira ${mm(geo.poeira)}.${textoSangria}`;
    document.getElementById("folhaLargura").value = geo.folhaLargura;
    document.getElementById("folhaAltura").value = geo.folhaAltura;
    aplicarTravas();
    desenharCaixa();
  }

  function caixaSimples(L, W, H) {
    const hx = L / 2;
    const hy = H / 2;
    const hz = W / 2;
    const c = (x, y, z) => [x, y, z];
    return [
      { nome: "Verso", cor: "#eceff1", arte: false, pontos: [c(hx, -hy, -hz), c(-hx, -hy, -hz), c(-hx, hy, -hz), c(hx, hy, -hz)] },
      { nome: "Lateral", cor: "#90caf9", arte: false, pontos: [c(-hx, -hy, -hz), c(-hx, -hy, hz), c(-hx, hy, hz), c(-hx, hy, -hz)] },
      { nome: "Lateral", cor: "#64b5f6", arte: false, pontos: [c(hx, -hy, hz), c(hx, -hy, -hz), c(hx, hy, -hz), c(hx, hy, hz)] },
      { nome: "Frente", cor: "#bbdefb", arte: false, pontos: [c(-hx, -hy, hz), c(hx, -hy, hz), c(hx, hy, hz), c(-hx, hy, hz)] },
      { nome: "Tampa", cor: "#e3f2fd", arte: false, pontos: [c(-hx, hy, hz), c(hx, hy, hz), c(hx, hy, -hz), c(-hx, hy, -hz)] },
      { nome: "Tampa", cor: "#cfd8dc", arte: false, pontos: [c(-hx, -hy, -hz), c(hx, -hy, -hz), c(hx, -hy, hz), c(-hx, -hy, hz)] },
    ];
  }

  function desenharArte(ctx, img, pts) {
    const origem = pts[3];
    const ux = pts[2].x - origem.x;
    const uy = pts[2].y - origem.y;
    const vx = pts[0].x - origem.x;
    const vy = pts[0].y - origem.y;
    if (Math.hypot(ux, uy) < 2 || Math.hypot(vx, vy) < 2) return;
    ctx.save();
    ctx.beginPath();
    pts.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
    ctx.closePath();
    ctx.clip();
    ctx.transform(ux, uy, vx, vy, origem.x, origem.y);
    ctx.drawImage(img, 0, 0, 1, 1);
    ctx.restore();
  }

  function atualizarNota3d() {
    if (origem !== "PARAMETRICO") {
      texto3d("Arraste para girar. Esta prévia usa as medidas internas. A faca enviada não é dobrada aqui.");
      return;
    }
    if (!(desenho && desenho.faces3d)) {
      texto3d("Arraste para girar. As abas dobram em 90° a partir da faca de estudo. A espessura não entra na dobra.");
      return;
    }
    const anexos = (ficha && ficha.anexos) || [];
    const temImagem = anexos.some((item) => item.uso === "ARTE" && item.tipo === "IMAGEM");
    const outra = anexos.some((item) => item.uso === "ARTE" && item.tipo !== "IMAGEM");
    if (arteImg) {
      texto3d("A arte JPG ou PNG está na frente. Arraste para girar. A dobra é de estudo, em 90°.");
    } else if (!temImagem && outra) {
      texto3d("A arte em PDF ou SVG fica no arquivo. No 3D entra só JPG ou PNG, na face da frente.");
    } else {
      texto3d("Arraste para girar. As abas dobram em 90° a partir da faca de estudo. A espessura não entra na dobra.");
    }
  }

  function desenharCaixa() {
    atualizarNota3d();
    const L = numero(campo("comprimento"));
    const W = numero(campo("largura"));
    const H = numero(campo("altura"));
    const ctx = canvas.getContext("2d");
    const largura = canvas.clientWidth || 320;
    const altura = 260;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(largura * dpr);
    canvas.height = Math.round(altura * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, largura, altura);
    const modelo = desenho && desenho.faces3d;
    if (!modelo && ![L, W, H].every((n) => n && n >= 10 && n <= 2000)) {
      ctx.fillStyle = "#90a4ae";
      ctx.font = "14px sans-serif";
      ctx.fillText("Informe as medidas internas para ver a caixa.", 16, 32);
      return;
    }
    const faces = (modelo || caixaSimples(L, W, H)).map((face) => ({
      nome: face.nome,
      cor: face.cor,
      arte: face.arte,
      pontos: face.pontos,
    }));
    let alcance = 1;
    faces.forEach((face) => {
      face.pontos.forEach((p) => {
        alcance = Math.max(alcance, Math.abs(p[0]), Math.abs(p[1]), Math.abs(p[2]));
      });
    });
    const escala = Math.min(largura, altura) * 0.38 / alcance;
    function projetar(x, y, z) {
      const cy = Math.cos(rot.yaw);
      const sy = Math.sin(rot.yaw);
      const x1 = x * cy - z * sy;
      const z1 = x * sy + z * cy;
      const cp = Math.cos(rot.pitch);
      const sp = Math.sin(rot.pitch);
      const y1 = y * cp - z1 * sp;
      const z2 = y * sp + z1 * cp;
      return { x: largura / 2 + x1 * escala, y: altura / 2 - y1 * escala, z: z2 };
    }
    faces.forEach((face) => {
      face.pts = face.pontos.map((p) => projetar(p[0], p[1], p[2]));
      face.z = face.pts.reduce((s, p) => s + p.z, 0) / face.pts.length;
    });
    faces.sort((a, b) => a.z - b.z);
    faces.forEach((face) => {
      ctx.beginPath();
      face.pts.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
      ctx.closePath();
      ctx.fillStyle = face.cor;
      ctx.fill();
      if (face.arte && arteImg) desenharArte(ctx, arteImg, face.pts);
      ctx.beginPath();
      face.pts.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
      ctx.closePath();
      ctx.strokeStyle = "#455a64";
      ctx.lineWidth = 1;
      ctx.stroke();
    });
  }

  function texto3d(mensagem) {
    const nota = document.getElementById("nota3d");
    if (nota) nota.textContent = mensagem;
  }

  async function carregarArte() {
    const seq = ++arteSeq;
    if (origem !== "PARAMETRICO" || !(desenho && desenho.faces3d)) {
      arteImg = null;
      arteId = null;
      desenharCaixa();
      return;
    }
    const anexos = (ficha && ficha.anexos) || [];
    const imagem = [...anexos].reverse().find((item) => item.uso === "ARTE" && item.tipo === "IMAGEM");
    if (!imagem) {
      arteImg = null;
      arteId = null;
      desenharCaixa();
      return;
    }
    if (arteId === imagem.id && arteImg) {
      desenharCaixa();
      return;
    }
    arteImg = null;
    arteId = null;
    desenharCaixa();
    try {
      const q = new URLSearchParams({ acao: "anexo", id: String(imagem.id) });
      const nivel = localStorage.getItem("userLevel");
      if (nivel) q.set("userLevel", nivel);
      const res = await fetch(`${API}?${q}`, { headers: authHeaders() });
      if (!res.ok || seq !== arteSeq) throw new Error("arte");
      const url = URL.createObjectURL(await res.blob());
      const img = new Image();
      img.onload = () => {
        URL.revokeObjectURL(url);
        if (seq !== arteSeq) return;
        arteImg = img;
        arteId = imagem.id;
        desenharCaixa();
      };
      img.onerror = () => {
        URL.revokeObjectURL(url);
        if (seq !== arteSeq) return;
        arteImg = null;
        arteId = null;
        desenharCaixa();
      };
      img.src = url;
    } catch (_) {
      if (seq !== arteSeq) return;
      arteImg = null;
      arteId = null;
      desenharCaixa();
    }
  }

  function renderEstimativa(est) {
    const alvo = document.getElementById("blocoEstimativa");
    if (!est) {
      alvo.className = "nota";
      alvo.innerHTML = "Informe as medidas para calcular a estimativa.";
      return;
    }
    const linhas = (est.linhas || []).map((linha) => `
      <tr>
        <td>${escapeHtml(linha.item)}</td>
        <td>${escapeHtml(linha.memoria)}</td>
        <td class="num">${brl(linha.valor)}</td>
      </tr>`).join("");
    const motivos = (est.motivos || []).map((m) => `<li>${escapeHtml(m)}</li>`).join("");
    alvo.className = "";
    alvo.innerHTML = `
      <div class="aviso estudo">Estimativa. Não é um custo fechado.</div>
      <p class="nota">${est.folhas} folha(s). Área da folha ${Number(est.areaUnidadeM2 || 0).toLocaleString("pt-BR", { maximumFractionDigits: 4 })} m². Perda ${est.perda == null ? "não informada" : mm(est.perda) + "%"}.</p>
      <table class="memoria">
        <thead><tr><th>Item</th><th>Memória</th><th class="num">Valor</th></tr></thead>
        <tbody>${linhas || `<tr><td colspan="3">Sem linhas de custo ainda.</td></tr>`}</tbody>
      </table>
      <p><strong>Total ${brl(est.total)}</strong> · unitário ${brl(est.unitario)}</p>
      ${motivos ? `<ul class="motivos">${motivos}</ul>` : ""}`;
  }

  function renderAnexos() {
    const lista = document.getElementById("listaAnexos");
    const anexos = (ficha && ficha.anexos) || [];
    if (!anexos.length) {
      lista.innerHTML = `<p class="nota">Nenhum arquivo nesta versão.</p>`;
      return;
    }
    const nivel = localStorage.getItem("userLevel") || "";
    lista.innerHTML = anexos.map((item) => {
      const href = `${API}?acao=anexo&id=${encodeURIComponent(item.id)}&userLevel=${encodeURIComponent(nivel)}`;
      const excluir = editavel
        ? `<button type="button" class="ghost" data-anexo="${item.id}">Excluir</button>`
        : "";
      return `<div class="anexo-linha">
        <span><strong>${escapeHtml(item.uso)}</strong> · ${escapeHtml(item.nome)} · ${escapeHtml(item.tipo)}</span>
        <span class="acoes">
          <a href="${href}" target="_blank" rel="noopener">Abrir</a>
          ${excluir}
        </span>
      </div>`;
    }).join("");
  }

  function renderVersoes() {
    const host = document.getElementById("versoes");
    const avisoVersao = document.getElementById("avisoVersao");
    const historico = (ficha && ficha.historico) || [];
    const atual = ficha && ficha.versao ? ficha.versao.numero : null;
    host.innerHTML = historico.map((item) => {
      const ativo = item.numero === atual ? " ativo" : "";
      return `<button type="button" class="ver${ativo}" data-versao="${item.numero}">v${item.numero} ${item.status === "APROVADO" ? "aprovada" : "rascunho"}</button>`;
    }).join("");
    const ultima = historico.length ? historico[historico.length - 1].numero : null;
    if (atual && ultima && atual !== ultima) {
      avisoVersao.hidden = false;
      avisoVersao.textContent = `Você está vendo a versão ${atual}. A edição vale só para a versão mais recente.`;
    } else {
      avisoVersao.hidden = true;
      avisoVersao.textContent = "";
    }
  }

  function preencher(data) {
    silencioso = true;
    ficha = data;
    const versao = data && data.versao;
    const ultima = versao && data.historico && data.historico.length
      ? data.historico[data.historico.length - 1].numero === versao.numero
      : true;
    editavel = !!(versao && versao.status === "RASCUNHO" && ultima);
    origem = versao ? versao.origem : "PARAMETRICO";
    document.getElementById("tituloFicha").textContent = data && data.id ? data.titulo : "Novo projeto";
    document.getElementById("badgeStatus").innerHTML = versao
      ? `<span class="tag ${versao.status === "APROVADO" ? "aprovado" : "rascunho"}">${versao.status === "APROVADO" ? "Aprovado" : "Rascunho"} · v${versao.numero}</span>`
      : "";
    document.getElementById("sku").value = data ? data.sku || "" : "";
    document.getElementById("titulo").value = data ? data.titulo || "" : "";
    document.getElementById("cliente").value = data ? data.cliente || "" : "";
    document.querySelectorAll('input[name="origem"]').forEach((el) => {
      el.checked = el.value === origem;
    });
    const chaves = ["comprimento", "largura", "altura", "espessura", "sangria", "folhaLargura", "folhaAltura", "material", "gramatura", "impressao", "pantone", "quantidade", "poses", "perda", "observacao"];
    chaves.forEach((id) => {
      const el = document.getElementById(id);
      if (!versao) {
        if (id === "quantidade") el.value = "1000";
        else if (id === "poses") el.value = "1";
        else el.value = "";
        return;
      }
      const valor = versao[id];
      el.value = valor == null ? "" : valor;
    });
    document.getElementById("laminacao").checked = !!(versao && versao.laminacao);
    document.getElementById("verniz").checked = !!(versao && versao.verniz);
    document.getElementById("janela").checked = !!(versao && versao.janela);
    const pedacos = [];
    if (data && data.criadoEm) pedacos.push(`Projeto criado em ${quando(data.criadoEm)} por ${data.criadoPor || "—"}`);
    if (versao && versao.criadoEm) pedacos.push(`Versão em ${quando(versao.criadoEm)} por ${versao.criadoPor || "—"}`);
    if (versao && versao.aprovadoEm) pedacos.push(`Aprovada em ${quando(versao.aprovadoEm)} por ${versao.aprovadoPor || "—"}`);
    document.getElementById("auditoria").textContent = pedacos.join(" · ");
    desenharFaca(data && data.desenho && !data.desenho.erro ? data.desenho : null);
    renderVersoes();
    renderAnexos();
    renderEstimativa(data && data.estimativa);
    aplicarTravas();
    silencioso = false;
    carregarArte();
  }

  function novo() {
    aviso("");
    mostrar("ficha");
    preencher(null);
    ficha = null;
    editavel = true;
    origem = "PARAMETRICO";
    document.getElementById("tituloFicha").textContent = "Novo projeto";
    aplicarTravas();
    document.getElementById("sku").focus();
  }

  async function abrir(id, versao) {
    aviso("");
    const data = await api("GET", "detalhe", { query: { id, versao: versao || "" } });
    mostrar("ficha");
    preencher(data.data);
    if (!data.data.versao) aviso("Versão não encontrada.");
    const params = new URLSearchParams({ id: String(data.data.id) });
    if (versao) params.set("versao", String(versao));
    history.replaceState(null, "", `${window.location.pathname}?${params}`);
  }

  async function listar() {
    aviso("");
    const data = await api("GET", "listar", {
      query: { q: document.getElementById("busca").value.trim(), status: document.getElementById("filtroStatus").value },
    });
    const linhas = data.data || [];
    document.getElementById("vazioLista").hidden = linhas.length > 0;
    corpoLista.innerHTML = linhas.map((item) => `
      <tr data-id="${item.id}">
        <td>${escapeHtml(item.sku)}</td>
        <td>${escapeHtml(item.titulo)}${item.cliente ? `<br><small>${escapeHtml(item.cliente)}</small>` : ""}</td>
        <td>${escapeHtml(item.familia || "CARTUCHO")}</td>
        <td>${mm(item.comprimento)} × ${mm(item.largura)} × ${mm(item.altura)} mm</td>
        <td>v${item.numero || "—"}</td>
        <td><span class="tag ${item.status === "APROVADO" ? "aprovado" : "rascunho"}">${item.status === "APROVADO" ? "Aprovado" : "Rascunho"}</span></td>
        <td>${quando(item.quando)}</td>
      </tr>`).join("");
  }

  async function salvar() {
    if (ocupado || !editavel) return;
    ocupado = true;
    try {
      aviso("");
      const data = await api("POST", "salvar", { body: payload() });
      preencher(data.data);
      history.replaceState(null, "", `${window.location.pathname}?id=${data.data.id}`);
      aviso("Projeto salvo.", "ok");
    } catch (err) {
      aviso(err.message);
    } finally {
      ocupado = false;
    }
  }

  async function estimar() {
    const corpo = payload();
    if (!numero(corpo.comprimento) || !numero(corpo.largura) || !numero(corpo.altura)) {
      renderEstimativa(null);
      return;
    }
    if (origem === "ARQUIVO" && (!numero(corpo.folhaLargura) || !numero(corpo.folhaAltura))) return;
    try {
      const data = await api("POST", "estimar", { body: corpo });
      renderEstimativa(data.data);
    } catch (err) {
      document.getElementById("blocoEstimativa").className = "nota";
      document.getElementById("blocoEstimativa").textContent = err.message;
    }
  }

  let geoSeq = 0;

  function agendarGeometria() {
    if (!silencioso) {
      clearTimeout(estTimer);
      estTimer = setTimeout(estimar, 500);
    }
    desenharCaixa();
    if (silencioso || origem !== "PARAMETRICO") return;
    const seq = ++geoSeq;
    clearTimeout(geoTimer);
    geoTimer = setTimeout(async () => {
      const c = campo("comprimento");
      const l = campo("largura");
      const a = campo("altura");
      desenharCaixa();
      if (!numero(c) || !numero(l) || !numero(a)) {
        desenharFaca(null);
        return;
      }
      try {
        const data = await api("GET", "geometria", {
          query: { comprimento: c, largura: l, altura: a, sangria: campo("sangria") },
        });
        if (seq !== geoSeq || origem !== "PARAMETRICO") return;
        desenharFaca(data.data);
        const imagemArte = [...((ficha && ficha.anexos) || [])].reverse().find((item) => item.uso === "ARTE" && item.tipo === "IMAGEM");
        if (imagemArte && arteId !== imagemArte.id) carregarArte();
      } catch (err) {
        if (seq !== geoSeq) return;
        desenharFaca(null);
        document.getElementById("medidasFolha").textContent = err.message;
      }
    }, 200);
  }

  async function carregarPrecos() {
    mostrar("precos");
    const data = await api("GET", "precos");
    document.getElementById("corpoPrecos").innerHTML = (data.data || []).map((item) => `
      <tr>
        <td>${escapeHtml(item.grupo)}</td>
        <td>${escapeHtml(item.item)}</td>
        <td>${escapeHtml(item.unidade)}</td>
        <td><input data-preco="${item.id}" inputmode="decimal" value="${item.preco == null ? "" : item.preco}" placeholder="vazio" /></td>
      </tr>`).join("");
  }

  canvas.addEventListener("pointerdown", (ev) => {
    rot.arrastando = true;
    rot.x = ev.clientX;
    rot.y = ev.clientY;
    canvas.setPointerCapture(ev.pointerId);
  });
  canvas.addEventListener("pointermove", (ev) => {
    if (!rot.arrastando) return;
    rot.yaw += (ev.clientX - rot.x) * 0.01;
    rot.pitch = Math.max(-1.2, Math.min(1.2, rot.pitch + (ev.clientY - rot.y) * 0.01));
    rot.x = ev.clientX;
    rot.y = ev.clientY;
    desenharCaixa();
  });
  canvas.addEventListener("pointerup", () => { rot.arrastando = false; });
  window.addEventListener("resize", () => {
    if (!painelFicha.hidden) desenharCaixa();
  });

  document.getElementById("btnFiltrar").addEventListener("click", () => listar().catch((err) => aviso(err.message)));
  document.getElementById("busca").addEventListener("keydown", (ev) => {
    if (ev.key === "Enter") listar().catch((err) => aviso(err.message));
  });
  document.getElementById("btnNovo").addEventListener("click", novo);
  document.getElementById("btnVoltar").addEventListener("click", () => {
    mostrar("lista");
    listar().catch((err) => aviso(err.message));
  });
  document.getElementById("btnPrecos").addEventListener("click", () => {
    aviso("");
    carregarPrecos().catch((err) => aviso(err.message));
  });
  document.getElementById("btnVoltarPrecos").addEventListener("click", () => {
    mostrar("lista");
    listar().catch((err) => aviso(err.message));
  });
  document.getElementById("btnSalvar").addEventListener("click", salvar);
  document.getElementById("btnSalvarPrecos").addEventListener("click", async () => {
    if (ocupado) return;
    ocupado = true;
    try {
      const itens = [...document.querySelectorAll("[data-preco]")].map((el) => ({
        id: Number(el.getAttribute("data-preco")),
        preco: el.value,
      }));
      await api("POST", "precos", { body: { itens } });
      aviso("Preços salvos.", "ok");
      await carregarPrecos();
    } catch (err) {
      aviso(err.message);
    } finally {
      ocupado = false;
    }
  });
  document.getElementById("btnAprovar").addEventListener("click", async () => {
    if (!ficha || !editavel || ocupado) return;
    if (!window.confirm("Aprovar esta versão? Ela deixa de ser editada.")) return;
    ocupado = true;
    try {
      const data = await api("POST", "aprovar", { body: { id: ficha.id } });
      preencher(data.data);
      aviso("Versão aprovada.", "ok");
    } catch (err) {
      aviso(err.message);
    } finally {
      ocupado = false;
    }
  });
  document.getElementById("btnNova").addEventListener("click", async () => {
    if (!ficha || ocupado) return;
    if (!window.confirm("Abrir uma nova versão a partir da aprovada? A aprovada permanece como está.")) return;
    ocupado = true;
    try {
      const data = await api("POST", "novaVersao", { body: { id: ficha.id } });
      preencher(data.data);
      history.replaceState(null, "", `${window.location.pathname}?id=${data.data.id}`);
      aviso("Nova versão aberta em rascunho.", "ok");
    } catch (err) {
      aviso(err.message);
    } finally {
      ocupado = false;
    }
  });
  document.getElementById("btnExcluir").addEventListener("click", async () => {
    if (!ficha || !editavel || ocupado) return;
    const versao = ficha.versao;
    const texto = versao && versao.numero === 1
      ? "Excluir este projeto? A versão 1 ainda é rascunho."
      : "Excluir este rascunho e voltar à versão aprovada?";
    if (!window.confirm(texto)) return;
    ocupado = true;
    try {
      const id = ficha.id;
      const numero = versao ? versao.numero : 1;
      await api("POST", "excluir", { body: { id } });
      if (numero === 1) {
        mostrar("lista");
        await listar();
        aviso("Projeto excluído.", "ok");
      } else {
        await abrir(id);
        aviso("Rascunho excluído.", "ok");
      }
    } catch (err) {
      aviso(err.message);
    } finally {
      ocupado = false;
    }
  });
  document.getElementById("btnAnexar").addEventListener("click", async () => {
    if (!ficha || !editavel || ocupado) return;
    const input = document.getElementById("arquivoAnexo");
    const file = input.files && input.files[0];
    if (!file) {
      aviso("Escolha um arquivo.");
      return;
    }
    if (file.size > 3 * 1024 * 1024) {
      aviso("O arquivo precisa ter até 3 MB.");
      return;
    }
    ocupado = true;
    try {
      const conteudo = await new Promise((resolve, reject) => {
        const leitor = new FileReader();
        leitor.onload = () => resolve(leitor.result);
        leitor.onerror = () => reject(new Error("Não foi possível ler o arquivo."));
        leitor.readAsDataURL(file);
      });
      const data = await api("POST", "anexo", {
        body: {
          versaoId: ficha.versao.id,
          uso: document.getElementById("usoAnexo").value,
          nome: file.name,
          conteudo,
        },
      });
      input.value = "";
      preencher(data.data);
      aviso("Arquivo enviado.", "ok");
    } catch (err) {
      aviso(err.message);
    } finally {
      ocupado = false;
    }
  });
  document.getElementById("btnBaixarSvg").addEventListener("click", () => {
    const svg = document.getElementById("facaSvg");
    if (!svg) return;
    svg.setAttribute("xmlns", "http://www.w3.org/2000/svg");
    const blob = new Blob([new XMLSerializer().serializeToString(svg)], { type: "image/svg+xml" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "cartucho-estudo.svg";
    a.click();
    URL.revokeObjectURL(a.href);
  });
  document.getElementById("btnBaixarDxf").addEventListener("click", async () => {
    if (!desenho) return;
    const q = new URLSearchParams({
      acao: "dxf",
      comprimento: campo("comprimento"),
      largura: campo("largura"),
      altura: campo("altura"),
      sangria: campo("sangria"),
    });
    const nivel = localStorage.getItem("userLevel");
    if (nivel) q.set("userLevel", nivel);
    try {
      const res = await fetch(`${API}?${q}`, { headers: authHeaders() });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Não foi possível gerar o DXF.");
      }
      const blob = await res.blob();
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = "cartucho-estudo.dxf";
      a.click();
      URL.revokeObjectURL(a.href);
    } catch (err) {
      aviso(err.message);
    }
  });

  corpoLista.addEventListener("click", (ev) => {
    const tr = ev.target.closest("tr[data-id]");
    if (!tr) return;
    abrir(tr.getAttribute("data-id")).catch((err) => aviso(err.message));
  });
  document.getElementById("versoes").addEventListener("click", (ev) => {
    const btn = ev.target.closest("[data-versao]");
    if (!btn || !ficha) return;
    abrir(ficha.id, btn.getAttribute("data-versao")).catch((err) => aviso(err.message));
  });
  document.getElementById("listaAnexos").addEventListener("click", async (ev) => {
    const btn = ev.target.closest("[data-anexo]");
    if (!btn || !editavel || ocupado) return;
    if (!window.confirm("Excluir este arquivo do rascunho?")) return;
    ocupado = true;
    try {
      const data = await api("POST", "excluirAnexo", { body: { id: Number(btn.getAttribute("data-anexo")) } });
      preencher(data.data);
    } catch (err) {
      aviso(err.message);
    } finally {
      ocupado = false;
    }
  });

  document.querySelectorAll('input[name="origem"]').forEach((el) => {
    el.addEventListener("change", () => {
      if (silencioso || !editavel) return;
      origem = el.value;
      aplicarTravas();
      if (origem === "PARAMETRICO") agendarGeometria();
      else {
        desenho = null;
        document.getElementById("facaHost").innerHTML = "";
        carregarArte();
        clearTimeout(estTimer);
        estTimer = setTimeout(estimar, 400);
      }
    });
  });

  ["comprimento", "largura", "altura", "sangria", "folhaLargura", "folhaAltura", "gramatura", "impressao", "quantidade", "poses", "perda"].forEach((id) => {
    document.getElementById(id).addEventListener("input", () => {
      if (silencioso) return;
      agendarGeometria();
    });
  });
  ["laminacao", "verniz", "janela"].forEach((id) => {
    document.getElementById(id).addEventListener("change", () => {
      if (silencioso) return;
      clearTimeout(estTimer);
      estTimer = setTimeout(estimar, 300);
    });
  });

  const skuInput = document.getElementById("sku");
  const sugestoes = document.getElementById("sugestoes");
  skuInput.addEventListener("input", () => {
    clearTimeout(skuTimer);
    const q = skuInput.value.trim();
    if (q.length < 1) {
      sugestoes.hidden = true;
      return;
    }
    skuTimer = setTimeout(async () => {
      try {
        const data = await api("GET", "produtos", { query: { q } });
        const itens = data.data || [];
        if (!itens.length) {
          sugestoes.hidden = true;
          return;
        }
        sugestoes.innerHTML = itens.map((item) => `
          <button type="button" class="sug-item" data-cod="${escapeHtml(item.codigo)}">
            ${escapeHtml(item.codigo)}
            <small>${escapeHtml(item.descricao)}</small>
          </button>`).join("");
        sugestoes.hidden = false;
      } catch (_) {
        sugestoes.hidden = true;
      }
    }, 250);
  });
  sugestoes.addEventListener("click", (ev) => {
    const btn = ev.target.closest("[data-cod]");
    if (!btn) return;
    skuInput.value = btn.getAttribute("data-cod");
    const desc = btn.querySelector("small");
    if (desc && !campo("titulo")) document.getElementById("titulo").value = desc.textContent.slice(0, 120);
    sugestoes.hidden = true;
  });
  document.addEventListener("click", (ev) => {
    if (!ev.target.closest(".campo")) sugestoes.hidden = true;
  });

  listar().then(() => {
    const params = new URLSearchParams(window.location.search);
    const id = params.get("id");
    if (id) return abrir(id, params.get("versao") || "");
  }).catch((err) => aviso(err.message));
});
