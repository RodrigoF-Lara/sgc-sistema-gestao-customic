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
  let previaId = null;
  let comparacao = null;
  let cmpSeq = 0;
  let posesTravadas = false;
  let podeEditar = false;
  let podeAprovar = false;

  const ROTULO_FAMILIA = {
    CARTUCHO: "Cartucho",
    BANDEJA: "Bandeja",
    MICROONDULADO: "Microondulado",
    ENVELOPE: "Envelope",
  };

  function aplicarPermissoes(permissoes) {
    if (!permissoes) return;
    podeEditar = !!permissoes.editar;
    podeAprovar = !!permissoes.aprovar;
    document.getElementById("btnNovo").hidden = !podeEditar;
  }

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
    const corpo = {
      id: ficha && ficha.id ? ficha.id : undefined,
      titulo: campo("titulo"),
      sku: campo("sku"),
      cliente: campo("cliente"),
      familia: document.getElementById("familia").value,
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
      microondulado: document.getElementById("microondulado").checked,
      hotstamp: document.getElementById("hotstamp").checked,
      relevo: document.getElementById("relevo").checked,
      frete: document.getElementById("frete").checked,
      facaMatriz: document.getElementById("facaMatriz").checked,
      observacao: campo("observacao"),
      quantidade: campo("quantidade"),
      poses: campo("poses"),
      perda: campo("perda"),
      maquinaLargura: campo("maquinaLargura"),
      maquinaAltura: campo("maquinaAltura"),
      fibra: document.getElementById("fibra").value,
    };
    if (!editavel && ficha && ficha.versao) {
      corpo.compensacao = ficha.versao.compensacao == null ? 0 : ficha.versao.compensacao;
    }
    return corpo;
  }

  function aplicarTravas() {
    const off = !editavel || !podeEditar;
    document.querySelectorAll("#blocoDados input, #blocoDados textarea, #blocoDados select").forEach((el) => {
      el.disabled = off;
    });
    const parametrico = origem === "PARAMETRICO";
    document.getElementById("folhaLargura").disabled = off || parametrico;
    document.getElementById("folhaAltura").disabled = off || parametrico;
    document.getElementById("poses").disabled = off || posesTravadas;
    document.getElementById("vistaFaca").hidden = !parametrico;
    document.getElementById("avisoArquivo").hidden = parametrico;
    document.getElementById("btnBaixarSvg").hidden = !parametrico || !desenho;
    document.getElementById("btnBaixarDxf").hidden = !parametrico || !desenho;
    document.getElementById("painelAnexo").hidden = off || !(ficha && ficha.id);
    document.getElementById("btnSalvar").hidden = off;
    const versao = ficha && ficha.versao;
    const ultima = versao && ficha.historico && ficha.historico.length
      ? ficha.historico[ficha.historico.length - 1].numero === versao.numero
      : true;
    const aprovadaAtual = !!(versao && versao.status === "APROVADO" && ultima);
    const rascunhoAtual = !!(versao && versao.status === "RASCUNHO" && ultima && ficha && ficha.id);
    document.getElementById("btnAprovar").hidden = !(rascunhoAtual && podeAprovar);
    document.getElementById("blocoComentario").hidden = !(rascunhoAtual && podeAprovar);
    document.getElementById("btnNova").hidden = !(aprovadaAtual && podeEditar);
    document.getElementById("btnDuplicar").hidden = !(ficha && ficha.id && podeEditar);
    document.getElementById("btnExcluir").hidden = off || !(ficha && ficha.id);
    const painelOrc = document.getElementById("painelOrcamento");
    painelOrc.hidden = !aprovadaAtual;
    document.getElementById("btnEnviar").hidden = !(aprovadaAtual && podeEditar && !(ficha && ficha.orcamentoId));
    document.getElementById("codFornecedor").disabled = !(aprovadaAtual && podeEditar && !(ficha && ficha.orcamentoId));
    document.getElementById("prazoDias").disabled = !(aprovadaAtual && podeEditar && !(ficha && ficha.orcamentoId));
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
    const cola = (geo.colaPontos || []).map((p) => p.join(",")).join(" ");
    const vincos = (geo.vincos || []).map((v) => `<line x1="${v[0]}" y1="${v[1]}" x2="${v[2]}" y2="${v[3]}" />`).join("");
    const marcas = (geo.marcas || []).map((v) => `<line x1="${v[0]}" y1="${v[1]}" x2="${v[2]}" y2="${v[3]}" />`).join("");
    const caixa = geo.sangriaCaixa;
    const sangriaSvg = caixa
      ? `<rect x="${caixa.x}" y="${caixa.y}" width="${caixa.largura}" height="${caixa.altura}" fill="none" stroke="#6a1b9a" stroke-width="0.35" stroke-dasharray="2 1.2" />`
      : "";
    const labels = (geo.paineis || []).map((p) => {
      if (p.largura < 18) return "";
      return `<text x="${p.x + p.largura / 2}" y="${p.y + p.altura / 2}" text-anchor="middle" dominant-baseline="middle" font-size="8" fill="#546e7a">${escapeHtml(p.nome)}</text>`;
    }).join("");
    const w = geo.folhaLargura;
    const h = geo.folhaAltura;
    const margem = geo.sangria > 0 ? geo.sangria + 8 : 6;
    host.innerHTML = `<svg id="facaSvg" xmlns="http://www.w3.org/2000/svg" viewBox="${-margem} ${-margem} ${w + margem * 2} ${h + margem * 2}">
      ${sangriaSvg}
      <g stroke="#37474f" stroke-width="0.4">${marcas}</g>
      ${cola ? `<polygon points="${cola}" fill="#e0f7fa" stroke="#80deea" stroke-width="0.8" />` : ""}
      <polygon points="${corte}" fill="none" stroke="#e53935" stroke-width="0.8" />
      <g stroke="#1565c0" stroke-width="0.45">${vincos}</g>
      ${labels}
    </svg>`;
    const textoSangria = geo.sangria > 0 ? ` Sangria de estudo ${mm(geo.sangria)} mm, fora da área do pré-orçamento.` : "";
    const textoMm = geo.compensacao > 0 ? ` Compensação de estudo ${mm(geo.compensacao)} mm por vinco.` : "";
    let textoBase = `Folha de estudo ${mm(w)} × ${mm(h)} mm.`;
    if (geo.familia === "BANDEJA") textoBase += " Bandeja de estudo, sem aba de cola.";
    else if (geo.familia === "ENVELOPE") textoBase += ` Aba ${mm(geo.cola)}, lapela ${mm(geo.tuck)}.`;
    else textoBase += ` Cola ${mm(geo.cola)}, tampa ${mm(geo.tuck)}, poeira ${mm(geo.poeira)}.`;
    medidas.textContent = `${textoBase}${textoMm}${textoSangria}`;
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
      const fam = document.getElementById("familia").value;
      if (fam === "BANDEJA" || fam === "ENVELOPE") {
        texto3d("Arraste para girar. Esta família ainda não dobra a faca de estudo. A caixa usa as medidas internas.");
        return;
      }
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

  function fraseImposicao(imp) {
    if (!imp || !imp.poses) return "";
    const giro = imp.giro ? "girada 90°" : "sem girar";
    return ` Imposição de estudo: ${imp.poses} poses (${imp.colunas} × ${imp.linhas}), ${giro}.`;
  }

  function svgImposicao(imp) {
    if (!imp || !imp.poses || imp.poses > 40 || !(imp.pecaLargura > 0)) return "";
    const ml = imp.maquinaLargura;
    const ma = imp.maquinaAltura;
    const pl = imp.pecaLargura;
    const pa = imp.pecaAltura;
    const traço = Math.max(ml, ma) / 180;
    const rects = [];
    for (let linha = 0; linha < imp.linhas; linha += 1) {
      for (let coluna = 0; coluna < imp.colunas; coluna += 1) {
        rects.push(`<rect x="${coluna * pl}" y="${linha * pa}" width="${pl}" height="${pa}" fill="#e3f2fd" stroke="#1565c0" stroke-width="${traço}" />`);
      }
    }
    return `<svg class="imposicao" viewBox="0 0 ${ml} ${ma}" role="img" aria-label="Imposição de estudo"><rect x="0" y="0" width="${ml}" height="${ma}" fill="#fff" stroke="#90a4ae" stroke-width="${traço}" />${rects.join("")}</svg>`;
  }

  function renderEstimativa(est) {
    const alvo = document.getElementById("blocoEstimativa");
    if (!est) {
      posesTravadas = false;
      alvo.className = "nota";
      alvo.innerHTML = "Informe as medidas para calcular a estimativa.";
      aplicarTravas();
      return;
    }
    posesTravadas = !!(est.imposicao && est.imposicao.poses);
    if (posesTravadas) document.getElementById("poses").value = est.imposicao.poses;
    aplicarTravas();
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
      <p class="nota">${est.folhas} folha(s) de faca. Área da faca ${Number(est.areaUnidadeM2 || 0).toLocaleString("pt-BR", { maximumFractionDigits: 4 })} m². Perda ${est.perda == null ? "não informada" : mm(est.perda) + "%"}.${escapeHtml(fraseImposicao(est.imposicao))}</p>
      ${svgImposicao(est.imposicao)}
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
      renderPrevia();
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
    renderPrevia();
  }

  function hrefAnexo(id) {
    const nivel = localStorage.getItem("userLevel") || "";
    return `${API}?acao=anexo&id=${encodeURIComponent(id)}&userLevel=${encodeURIComponent(nivel)}`;
  }

  function arquivosPrevia(anexos) {
    return (anexos || []).filter((item) => item.tipo === "PDF" || item.tipo === "SVG");
  }

  function htmlPrevia(item) {
    if (!item) return `<p class="nota">Sem PDF ou SVG.</p>`;
    const href = escapeHtml(hrefAnexo(item.id));
    const nome = escapeHtml(item.nome);
    if (item.tipo === "PDF") {
      return `<iframe class="quadro-pdf" title="Prévia de ${nome}" src="${href}"></iframe>`;
    }
    return `<img class="quadro-svg" alt="Prévia de ${nome}" src="${href}" />`;
  }

  function renderPrevia() {
    const painel = document.getElementById("painelPrevia");
    const escolha = document.getElementById("previaEscolha");
    const quadro = document.getElementById("previaArquivo");
    const visiveis = arquivosPrevia(ficha && ficha.anexos);
    if (!ficha || !ficha.id) {
      painel.hidden = true;
      escolha.innerHTML = "";
      quadro.innerHTML = "";
      return;
    }
    painel.hidden = false;
    if (!visiveis.length) {
      previaId = null;
      escolha.innerHTML = "";
      quadro.innerHTML = `<p class="nota">Nenhum PDF ou SVG nesta versão. JPG e PNG de arte entram na prévia dobrada.</p>`;
      return;
    }
    if (!visiveis.some((item) => item.id === previaId)) previaId = visiveis[visiveis.length - 1].id;
    escolha.innerHTML = visiveis.map((item) => {
      const ativo = item.id === previaId ? " ativo" : "";
      return `<button type="button" class="ver${ativo}" data-previa="${item.id}">${escapeHtml(item.uso)} · ${escapeHtml(item.nome)}</button>`;
    }).join("");
    quadro.innerHTML = htmlPrevia(visiveis.find((item) => item.id === previaId));
  }

  function opcoesVersao(selecionado) {
    return ((ficha && ficha.historico) || []).map((item) => {
      const rotulo = `v${item.numero} ${item.status === "APROVADO" ? "aprovada" : "rascunho"}`;
      const sel = Number(item.numero) === Number(selecionado) ? " selected" : "";
      return `<option value="${item.numero}"${sel}>${rotulo}</option>`;
    }).join("");
  }

  function prepararComparacao() {
    cmpSeq += 1;
    comparacao = null;
    const painel = document.getElementById("painelComparar");
    const resultado = document.getElementById("resultadoComparar");
    resultado.innerHTML = "";
    document.getElementById("btnComparar").disabled = false;
    const historico = (ficha && ficha.historico) || [];
    if (historico.length < 2 || !(ficha && ficha.versao)) {
      painel.hidden = true;
      return;
    }
    painel.hidden = false;
    const atual = ficha.versao.numero;
    const outra = [...historico].reverse().find((item) => item.numero !== atual) || historico[0];
    document.getElementById("cmpA").innerHTML = opcoesVersao(outra.numero);
    document.getElementById("cmpB").innerHTML = opcoesVersao(atual);
  }

  function textoVersao(versao, chave) {
    if (chave === "status") return versao.status === "APROVADO" ? "Aprovado" : "Rascunho";
    if (chave === "origem") return versao.origem === "ARQUIVO" ? "Faca enviada" : "Faca de estudo";
    if (chave === "familia") return ROTULO_FAMILIA[versao.familia] || versao.familia || "Cartucho";
    if (chave === "compensacao") return versao.compensacao == null || Number(versao.compensacao) === 0 ? "não informada" : mm(versao.compensacao);
    if (chave === "aprovacaoObs") return versao.aprovacaoObs ? String(versao.aprovacaoObs) : "—";
    if (chave === "espessura") return versao.espessura == null ? "—" : mm(versao.espessura);
    if (chave === "sangria") return versao.sangria == null || Number(versao.sangria) === 0 ? "não desenha" : mm(versao.sangria);
    if (chave === "maquinaLargura" || chave === "maquinaAltura") return versao[chave] == null ? "—" : mm(versao[chave]);
    if (chave === "fibra") {
      if (versao.fibra === "LARGURA") return "Largura da faca na largura da máquina";
      if (versao.fibra === "ALTURA") return "Altura da faca na largura da máquina";
      return "não informada";
    }
    if (chave === "gramatura") return versao.gramatura == null ? "—" : mm(versao.gramatura);
    if (chave === "perda") return versao.perda == null ? "não informada" : mm(versao.perda);
    if (chave === "laminacao" || chave === "verniz" || chave === "janela" || chave === "microondulado" || chave === "hotstamp" || chave === "relevo" || chave === "frete" || chave === "facaMatriz") {
      return versao[chave] ? "Sim" : "Não";
    }
    if (chave === "material" || chave === "impressao" || chave === "pantone" || chave === "observacao") {
      return versao[chave] ? String(versao[chave]) : "—";
    }
    return mm(versao[chave]);
  }

  function resumoArquivos(data) {
    const itens = data.anexos || [];
    if (!itens.length) return "Nenhum arquivo";
    return itens.map((item) => `${item.uso} · ${item.nome} · ${item.tipo} · ${item.tamanho} bytes`).join("\n");
  }

  function resumoEstimativa(data) {
    const est = data.estimativa;
    if (!est) return "—";
    return `${brl(est.total)} · unitário ${brl(est.unitario)}`;
  }

  function htmlLado(data, selecionado) {
    const visiveis = arquivosPrevia(data.anexos);
    const numero = data.versao ? data.versao.numero : "—";
    if (!visiveis.length) {
      return `<h3>v${numero}</h3><p class="nota">Sem PDF ou SVG nesta versão.</p>`;
    }
    const item = visiveis.find((arq) => arq.id === selecionado) || visiveis[visiveis.length - 1];
    const escolha = visiveis.length < 2
      ? `<p class="nota">${escapeHtml(item.uso)} · ${escapeHtml(item.nome)}</p>`
      : `<label>Arquivo
          <select data-cmp-arq="${data === comparacao.a ? "arqA" : "arqB"}">
            ${visiveis.map((arq) => `<option value="${arq.id}"${arq.id === item.id ? " selected" : ""}>${escapeHtml(arq.uso)} · ${escapeHtml(arq.nome)}</option>`).join("")}
          </select>
        </label>`;
    return `<h3>v${numero}</h3>${escolha}<div class="cmp-quadro">${htmlPrevia(item)}</div>`;
  }

  function pintarComparacao() {
    const alvo = document.getElementById("resultadoComparar");
    const a = comparacao.a;
    const b = comparacao.b;
    const campos = [
      ["status", "Status"],
      ["origem", "Origem da faca"],
      ["familia", "Família"],
      ["comprimento", "Comprimento (mm)"],
      ["largura", "Largura (mm)"],
      ["altura", "Altura (mm)"],
      ["espessura", "Espessura (mm)"],
      ["sangria", "Sangria de estudo (mm)"],
      ["compensacao", "mm por vinco"],
      ["maquinaLargura", "Folha de máquina — largura (mm)"],
      ["maquinaAltura", "Folha de máquina — altura (mm)"],
      ["fibra", "Sentido da fibra"],
      ["folhaLargura", "Folha — largura (mm)"],
      ["folhaAltura", "Folha — altura (mm)"],
      ["material", "Material"],
      ["gramatura", "Gramatura (g/m²)"],
      ["impressao", "Impressão"],
      ["pantone", "Pantone"],
      ["laminacao", "Laminação"],
      ["verniz", "Verniz"],
      ["janela", "Janela de acetato"],
      ["microondulado", "Microondulado"],
      ["hotstamp", "Hot stamp"],
      ["relevo", "Relevo"],
      ["frete", "Frete"],
      ["facaMatriz", "Faca / matriz"],
      ["aprovacaoObs", "Comentário da aprovação"],
      ["quantidade", "Quantidade"],
      ["poses", "Poses"],
      ["perda", "Perda técnica (%)"],
      ["observacao", "Observação"],
    ];
    const linhas = campos.map(([chave, rotulo]) => {
      const ea = textoVersao(a.versao, chave);
      const eb = textoVersao(b.versao, chave);
      return { rotulo, ea, eb, dif: ea !== eb };
    });
    const arquivosA = resumoArquivos(a);
    const arquivosB = resumoArquivos(b);
    linhas.push({ rotulo: "Arquivos", ea: arquivosA, eb: arquivosB, dif: arquivosA !== arquivosB });
    const estA = resumoEstimativa(a);
    const estB = resumoEstimativa(b);
    linhas.push({ rotulo: "Pré-orçamento", ea: estA, eb: estB, dif: estA !== estB });
    const diferentes = linhas.filter((linha) => linha.dif).length;
    const corpo = linhas.map((linha) => `
      <tr class="${linha.dif ? "dif" : ""}">
        <td>${escapeHtml(linha.rotulo)}</td>
        <td>${escapeHtml(linha.ea)}</td>
        <td>${escapeHtml(linha.eb)}</td>
      </tr>`).join("");
    const resumo = diferentes
      ? `${diferentes} ${diferentes === 1 ? "campo diferente" : "campos diferentes"} entre a v${a.versao.numero} e a v${b.versao.numero}. O que mudou fica em destaque.`
      : `A v${a.versao.numero} e a v${b.versao.numero} estão iguais nestes campos.`;
    alvo.innerHTML = `
      <p class="nota">${escapeHtml(resumo)}</p>
      <div class="wrap-table">
        <table class="cmp">
          <thead>
            <tr>
              <th>Campo</th>
              <th>v${a.versao.numero}</th>
              <th>v${b.versao.numero}</th>
            </tr>
          </thead>
          <tbody>${corpo}</tbody>
        </table>
      </div>
      <div class="cmp-grade">
        <div id="cmpLadoA">${htmlLado(a, comparacao.arqA)}</div>
        <div id="cmpLadoB">${htmlLado(b, comparacao.arqB)}</div>
      </div>`;
  }

  async function comparar() {
    if (!ficha || !ficha.id) return;
    const numeroA = Number(document.getElementById("cmpA").value);
    const numeroB = Number(document.getElementById("cmpB").value);
    const alvo = document.getElementById("resultadoComparar");
    if (!numeroA || !numeroB || numeroA === numeroB) {
      alvo.innerHTML = `<p class="nota">Escolha duas versões diferentes.</p>`;
      return;
    }
    const seq = ++cmpSeq;
    const botao = document.getElementById("btnComparar");
    botao.disabled = true;
    alvo.innerHTML = `<p class="nota">Comparando as versões gravadas…</p>`;
    try {
      const carregar = async (numero) => {
        if (ficha.versao && Number(ficha.versao.numero) === numero) return ficha;
        const data = await api("GET", "detalhe", { query: { id: ficha.id, versao: numero } });
        return data.data;
      };
      const [ladoA, ladoB] = await Promise.all([carregar(numeroA), carregar(numeroB)]);
      if (seq !== cmpSeq) return;
      if (!ladoA.versao || !ladoB.versao) {
        alvo.innerHTML = `<p class="nota">Versão não encontrada.</p>`;
        return;
      }
      comparacao = { a: ladoA, b: ladoB, arqA: null, arqB: null };
      pintarComparacao();
    } finally {
      if (seq === cmpSeq) botao.disabled = false;
    }
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

  function textoSaldo(saldo) {
    if (!saldo || saldo.erro || saldo.saldo == null) return "Saldo em estoque indisponível.";
    const qtd = Number(saldo.saldo);
    const texto = Number.isInteger(qtd) ? String(qtd) : String(Math.round(qtd * 1000) / 1000);
    return `Saldo em estoque: ${texto}.`;
  }

  function preencher(data) {
    silencioso = true;
    if (data && data.permissoes) aplicarPermissoes(data.permissoes);
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
    const familia = (versao && versao.familia) || (data && data.familia) || "CARTUCHO";
    document.getElementById("familia").value = ROTULO_FAMILIA[familia] ? familia : "CARTUCHO";
    document.querySelectorAll('input[name="origem"]').forEach((el) => {
      el.checked = el.value === origem;
    });
    const chaves = ["comprimento", "largura", "altura", "espessura", "sangria", "folhaLargura", "folhaAltura", "maquinaLargura", "maquinaAltura", "material", "gramatura", "impressao", "pantone", "quantidade", "poses", "perda", "observacao"];
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
    document.getElementById("fibra").value = versao && versao.fibra ? versao.fibra : "";
    document.getElementById("laminacao").checked = !!(versao && versao.laminacao);
    document.getElementById("verniz").checked = !!(versao && versao.verniz);
    document.getElementById("janela").checked = !!(versao && versao.janela);
    document.getElementById("microondulado").checked = !!(versao && versao.microondulado) || familia === "MICROONDULADO";
    document.getElementById("hotstamp").checked = !!(versao && versao.hotstamp);
    document.getElementById("relevo").checked = !!(versao && versao.relevo);
    document.getElementById("frete").checked = !!(versao && versao.frete);
    document.getElementById("facaMatriz").checked = !!(versao && versao.facaMatriz);
    document.getElementById("comentarioAprovacao").value = versao && versao.aprovacaoObs ? versao.aprovacaoObs : "";
    const pedacos = [];
    if (data && data.criadoEm) pedacos.push(`Projeto criado em ${quando(data.criadoEm)} por ${data.criadoPor || "—"}`);
    if (versao && versao.criadoEm) pedacos.push(`Versão em ${quando(versao.criadoEm)} por ${versao.criadoPor || "—"}`);
    if (versao && versao.aprovadoEm) pedacos.push(`Aprovada em ${quando(versao.aprovadoEm)} por ${versao.aprovadoPor || "—"}`);
    if (versao && versao.aprovacaoObs) pedacos.push(`Comentário: ${versao.aprovacaoObs}`);
    document.getElementById("auditoria").textContent = pedacos.join(" · ");
    const necessidade = document.getElementById("painelNecessidade");
    if (data && (data.necessidade || data.saldo)) {
      const partes = [];
      if (data.necessidade) {
        partes.push(`Necessidade de compra ${data.necessidade.status === "ABERTA" ? "aberta" : data.necessidade.status}: ${data.necessidade.quantidade} un.`);
      }
      partes.push(textoSaldo(data.saldo));
      necessidade.hidden = false;
      necessidade.textContent = partes.join(" ");
    } else if (data && data.sku) {
      necessidade.hidden = false;
      necessidade.textContent = textoSaldo(data.saldo);
    } else {
      necessidade.hidden = true;
      necessidade.textContent = "";
    }
    const notaOrc = document.getElementById("notaOrcamento");
    if (data && data.orcamentoId) {
      notaOrc.textContent = data.orcamentoNumero
        ? `Já enviado. Orçamento ${data.orcamentoNumero}.`
        : "Já enviado ao orçamento.";
    } else {
      notaOrc.textContent = "A versão aprovada abre um orçamento de compras com o SKU e esta estimativa. Não é um custo fechado.";
    }
    const vigente = data && data.compensacaoVigente;
    document.getElementById("notaCompensacao").textContent = vigente
      ? `A espessura fica registrada. A tabela de preços está com ${mm(vigente)} mm por vinco. Isso só entra na faca de estudo e não é regra de produção. A sangria não entra na área do pré-orçamento.`
      : "A espessura fica registrada. A faca de estudo só abre o vinco quando a engenharia informa os milímetros por vinco, na tabela de preços. Vazio deixa o desenho como está. A sangria não entra na área do pré-orçamento.";
    desenharFaca(data && data.desenho && !data.desenho.erro ? data.desenho : null);
    renderVersoes();
    renderAnexos();
    prepararComparacao();
    renderEstimativa(data && data.estimativa);
    aplicarTravas();
    silencioso = false;
    carregarArte();
    if (editavel && podeEditar && origem === "PARAMETRICO") agendarGeometria();
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
    aplicarPermissoes(data.permissoes);
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
      posesTravadas = false;
      aplicarTravas();
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
        const query = {
          comprimento: c,
          largura: l,
          altura: a,
          sangria: campo("sangria"),
          familia: document.getElementById("familia").value,
        };
        if (!editavel && ficha && ficha.versao) {
          query.compensacao = ficha.versao.compensacao == null ? "0" : String(ficha.versao.compensacao);
        }
        const data = await api("GET", "geometria", { query });
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

  function linhaPreco(item) {
    const qtd = item.qtdMin == null ? "" : item.qtdMin;
    const travaQtd = item.id ? " disabled" : "";
    return `
      <tr data-id="${item.id || ""}" data-nova="${item.id ? "0" : "1"}" data-grupo="${escapeHtml(item.grupo)}" data-item="${escapeHtml(item.item)}" data-unidade="${escapeHtml(item.unidade)}">
        <td>${escapeHtml(item.grupo)}</td>
        <td>${escapeHtml(item.item)}</td>
        <td>${escapeHtml(item.unidade)}</td>
        <td><input data-qtd inputmode="numeric" value="${qtd}" placeholder="base"${travaQtd} /></td>
        <td><input data-preco inputmode="decimal" value="${item.preco == null ? "" : item.preco}" placeholder="vazio" /></td>
        <td><input data-validade type="date" value="${item.validade || ""}" /></td>
        <td><input data-fornecedor maxlength="120" value="${escapeHtml(item.fornecedor || "")}" /></td>
        <td><input data-imposto inputmode="decimal" value="${item.imposto == null ? "" : item.imposto}" placeholder="0" /></td>
      </tr>`;
  }

  async function carregarPrecos() {
    mostrar("precos");
    const data = await api("GET", "precos");
    aplicarPermissoes(data.permissoes);
    const itens = data.data || [];
    document.getElementById("mmPorVinco").value = data.mmPorVinco == null ? "" : data.mmPorVinco;
    document.getElementById("corpoPrecos").innerHTML = itens.map(linhaPreco).join("");
    const vistos = new Set();
    const opcoes = [];
    itens.forEach((item) => {
      const chave = `${item.grupo}|${item.item}|${item.unidade}`;
      if (vistos.has(chave)) return;
      vistos.add(chave);
      opcoes.push(`<option value="${escapeHtml(chave)}">${escapeHtml(item.grupo)} · ${escapeHtml(item.item)} · ${escapeHtml(item.unidade)}</option>`);
    });
    document.getElementById("faixaItem").innerHTML = opcoes.join("");
    const trava = !podeEditar;
    document.getElementById("mmPorVinco").disabled = trava;
    document.getElementById("faixaQtd").disabled = trava;
    document.getElementById("faixaItem").disabled = trava;
    document.getElementById("btnFaixa").hidden = trava;
    document.getElementById("btnSalvarPrecos").hidden = trava;
    document.querySelectorAll("#corpoPrecos input").forEach((el) => {
      if (el.hasAttribute("data-qtd") && el.disabled) return;
      el.disabled = trava;
    });
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
      const itens = [...document.querySelectorAll("#corpoPrecos tr")].map((tr) => ({
        id: tr.getAttribute("data-nova") === "1" ? null : Number(tr.getAttribute("data-id")),
        grupo: tr.getAttribute("data-grupo"),
        item: tr.getAttribute("data-item"),
        unidade: tr.getAttribute("data-unidade"),
        qtdMin: tr.querySelector("[data-qtd]").value,
        preco: tr.querySelector("[data-preco]").value,
        validade: tr.querySelector("[data-validade]").value,
        fornecedor: tr.querySelector("[data-fornecedor]").value,
        imposto: tr.querySelector("[data-imposto]").value,
      }));
      await api("POST", "precos", {
        body: { itens, mmPorVinco: document.getElementById("mmPorVinco").value },
      });
      aviso("Preços salvos.", "ok");
      await carregarPrecos();
    } catch (err) {
      aviso(err.message);
    } finally {
      ocupado = false;
    }
  });
  document.getElementById("btnAprovar").addEventListener("click", async () => {
    if (!ficha || !editavel || !podeAprovar || ocupado) return;
    if (!window.confirm("Aprovar esta versão? Ela deixa de ser editada e abre a necessidade de compra.")) return;
    ocupado = true;
    try {
      const data = await api("POST", "aprovar", {
        body: { id: ficha.id, comentario: document.getElementById("comentarioAprovacao").value },
      });
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
    const familiaArquivo = (document.getElementById("familia").value || "cartucho").toLowerCase();
    a.download = `${familiaArquivo}-estudo.svg`;
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
      familia: document.getElementById("familia").value,
    });
    if (!editavel && ficha && ficha.versao) {
      q.set("compensacao", ficha.versao.compensacao == null ? "0" : String(ficha.versao.compensacao));
    }
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
      a.download = `${(document.getElementById("familia").value || "cartucho").toLowerCase()}-estudo.dxf`;
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
  document.getElementById("previaEscolha").addEventListener("click", (ev) => {
    const btn = ev.target.closest("[data-previa]");
    if (!btn) return;
    previaId = Number(btn.getAttribute("data-previa"));
    renderPrevia();
  });
  document.getElementById("btnComparar").addEventListener("click", () => {
    comparar().catch((err) => aviso(err.message));
  });
  document.getElementById("resultadoComparar").addEventListener("change", (ev) => {
    const sel = ev.target.closest("[data-cmp-arq]");
    if (!sel || !comparacao) return;
    const lado = sel.getAttribute("data-cmp-arq");
    comparacao[lado] = Number(sel.value);
    const host = document.getElementById(lado === "arqA" ? "cmpLadoA" : "cmpLadoB");
    if (host) host.innerHTML = htmlLado(lado === "arqA" ? comparacao.a : comparacao.b, comparacao[lado]);
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
  ["maquinaLargura", "maquinaAltura"].forEach((id) => {
    document.getElementById(id).addEventListener("input", () => {
      if (silencioso) return;
      clearTimeout(estTimer);
      estTimer = setTimeout(estimar, 400);
    });
  });
  ["laminacao", "verniz", "janela", "microondulado", "hotstamp", "relevo", "frete", "facaMatriz", "fibra"].forEach((id) => {
    document.getElementById(id).addEventListener("change", () => {
      if (silencioso) return;
      clearTimeout(estTimer);
      estTimer = setTimeout(estimar, 300);
    });
  });
  document.getElementById("familia").addEventListener("change", () => {
    if (silencioso) return;
    if (document.getElementById("familia").value === "MICROONDULADO") {
      document.getElementById("microondulado").checked = true;
    }
    agendarGeometria();
  });
  document.getElementById("btnFaixa").addEventListener("click", () => {
    const bruto = document.getElementById("faixaItem").value;
    const qtd = document.getElementById("faixaQtd").value.trim();
    if (!bruto || !/^\d+$/.test(qtd) || Number(qtd) < 1) {
      aviso("Informe a quantidade mínima da faixa.");
      return;
    }
    const [grupo, item, unidade] = bruto.split("|");
    document.getElementById("corpoPrecos").insertAdjacentHTML("beforeend", linhaPreco({
      grupo, item, unidade, qtdMin: Number(qtd), preco: null, validade: "", fornecedor: "", imposto: null,
    }));
    document.getElementById("faixaQtd").value = "";
    aviso("");
  });
  document.getElementById("btnDuplicar").addEventListener("click", async () => {
    if (!ficha || !podeEditar || ocupado) return;
    if (!window.confirm("Duplicar este projeto em um rascunho novo? O original permanece.")) return;
    ocupado = true;
    try {
      const data = await api("POST", "duplicar", { body: { id: ficha.id } });
      preencher(data.data);
      history.replaceState(null, "", `${window.location.pathname}?id=${data.data.id}`);
      aviso("Cópia aberta em rascunho.", "ok");
    } catch (err) {
      aviso(err.message);
    } finally {
      ocupado = false;
    }
  });
  document.getElementById("btnEnviar").addEventListener("click", async () => {
    if (!ficha || !podeEditar || ocupado) return;
    if (!window.confirm("Enviar esta versão aprovada para o orçamento de compras?")) return;
    ocupado = true;
    try {
      const data = await api("POST", "enviarOrcamento", {
        body: {
          id: ficha.id,
          codFornecedor: document.getElementById("codFornecedor").value,
          prazoDias: document.getElementById("prazoDias").value,
        },
      });
      preencher(data.data);
      const numero = data.orcamento && data.orcamento.numero ? data.orcamento.numero : "";
      aviso(data.orcamento && data.orcamento.jaEnviado ? `Já estava no orçamento ${numero}.` : `Enviado. Orçamento ${numero}.`, "ok");
    } catch (err) {
      aviso(err.message);
    } finally {
      ocupado = false;
    }
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
