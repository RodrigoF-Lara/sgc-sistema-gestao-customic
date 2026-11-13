document.addEventListener("DOMContentLoaded", async () => {
  if (!localStorage.getItem("userName") && !localStorage.getItem("userCode")) {
    window.location.href = "/index.html";
    return;
  }
  if (window.SGCPermissoes) {
    const ok = await window.SGCPermissoes.protegerPagina("racional-compras");
    if (!ok) return;
  }

  const API = "/api/embalagem/racional";
  const STATUS = { ABERTO: "Aberto", FECHADO: "Fechado" };
  const CANAIS = [
    { classe: "claro", chave: "claro", rotulo: "Claro" },
    { classe: "vivo", chave: "vivo", rotulo: "Vivo" },
    { classe: "comercial", chave: "comercial", rotulo: "Comercial" },
    { classe: "online", chave: "online", rotulo: "On line" },
    { classe: "quiosque", chave: "quiosque", rotulo: "Quiosque" },
    { classe: "est", chave: "estAdicional", rotulo: "Est. adicional" },
  ];

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

  async function comOcupacao(fn) {
    if (ocupado) return;
    ocupado = true;
    aviso("");
    try {
      await fn();
    } catch (err) {
      aviso(err.message);
    } finally {
      ocupado = false;
    }
  }

  function parseNum(v) {
    if (typeof v === "number") return v;
    let s = String(v ?? "").trim().replace(/\s/g, "");
    if (!s) return NaN;
    if (s.includes(",")) s = s.replace(/\./g, "").replace(",", ".");
    const n = Number(s);
    return Number.isFinite(n) ? n : NaN;
  }

  function fmtQtd(n) {
    return Number(n || 0).toLocaleString("pt-BR", { maximumFractionDigits: 4 });
  }

  function campoQtd(v) {
    if (v == null || v === "" || Number(v) === 0) return "";
    return fmtQtd(v);
  }

  function lerQtd(input) {
    const bruto = input.value.trim();
    if (!bruto) return 0;
    const n = parseNum(bruto);
    if (!Number.isFinite(n) || n < 0) return null;
    return Number(n.toFixed(4));
  }

  function calcular(moq, valores) {
    const total = Number(valores.reduce((soma, n) => soma + n, 0).toFixed(4));
    const abaixo = total > 0 && moq > 0 && total < moq;
    return { total, aComprar: total <= 0 ? 0 : (abaixo ? moq : total), abaixo };
  }

  function fmtMes(valor) {
    const m = String(valor || "").match(/^(\d{4})-(\d{2})/);
    if (!m) return "—";
    return `${m[2]}/${m[1]}`;
  }

  function fmtDataHora(valor) {
    const m = String(valor || "").match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})/);
    if (!m) return "";
    return `${m[3]}/${m[2]}/${m[1]} ${m[4]}:${m[5]}`;
  }

  function agoraTela() {
    const partes = new Intl.DateTimeFormat("sv-SE", {
      timeZone: "America/Sao_Paulo",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).formatToParts(new Date());
    const map = Object.fromEntries(partes.map((p) => [p.type, p.value]));
    const hora = map.hour === "24" ? "00" : map.hour;
    return fmtDataHora(`${map.year}-${map.month}-${map.day} ${hora}:${map.minute}`);
  }

  function hojeMes() {
    const d = new Date();
    const z = (n) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${z(d.getMonth() + 1)}`;
  }

  function tag(status) {
    const chave = String(status || "ABERTO").toLowerCase();
    const texto = STATUS[String(status || "ABERTO").toUpperCase()] || status || "Aberto";
    return `<span class="tag ${escapeHtml(chave)}">${escapeHtml(texto)}</span>`;
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
      ["FECHADO", "Fechados", resumo.fechados],
    ];
    document.getElementById("resumo").innerHTML = blocos.map((b) => {
      const ativo = filtroStatus === b[0] ? " ativo" : "";
      return `<button type="button" class="resumo${ativo}" data-status="${b[0]}"><span class="rotulo">${escapeHtml(b[1])}</span><span class="valor">${escapeHtml(String(b[2] ?? 0))}</span></button>`;
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
        <td><strong>${escapeHtml(row.titulo || "Sem título")}</strong></td>
        <td>${escapeHtml(fmtMes(row.referencia))}</td>
        <td class="num">${escapeHtml(fmtQtd(row.qtdSku))}</td>
        <td class="num">${escapeHtml(fmtQtd(row.total))}</td>
        <td class="num">${escapeHtml(fmtQtd(row.aComprar))}</td>
        <td class="num">${row.qtdAbaixo ? `<span class="num-abaixo">${escapeHtml(fmtQtd(row.qtdAbaixo))}</span>` : "0"}</td>
        <td class="num">${textoValidacao(row)}</td>
        <td>${escapeHtml(row.pedido || "—")}</td>
        <td>${tag(row.status)}</td>
      </tr>
    `).join("");
  }

  async function carregarLista() {
    aviso("");
    const data = await api("GET", "listar", {
      query: {
        q: document.getElementById("busca").value.trim(),
        status: filtroStatus,
        mes: document.getElementById("filtroMes").value,
      },
    });
    renderResumo(data.resumo || {});
    renderLista(data.data || []);
    const avisoLimite = document.getElementById("truncado");
    avisoLimite.hidden = !data.truncado;
    avisoLimite.textContent = data.truncado ? "Mostrando os 300 racionais mais recentes deste filtro." : "";
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

  function textoValidacao(row) {
    const total = Number(row.qtdSlots) || 0;
    const ok = Number(row.qtdValidada) || 0;
    if (!total) return "—";
    const cls = ok >= total ? "val-ok" : (ok > 0 ? "val-parcial" : "");
    return `<span class="${cls}">${ok}/${total}</span>`;
  }

  function tituloValidacao(canal, por, em) {
    if (!por) return `Validar a quantidade de ${canal.rotulo}`;
    return `Validado por ${por}${em ? " em " + em : ""}`;
  }

  function pintarValidacao(td) {
    const box = td.querySelector(".ok");
    const input = td.querySelector(".q");
    const canal = CANAIS.find((item) => input.classList.contains(item.classe)) || { rotulo: "canal" };
    td.classList.toggle("validado", box.checked);
    const titulo = box.checked
      ? tituloValidacao(canal, box.dataset.por || usuario(), box.dataset.em || "")
      : tituloValidacao(canal, "", "");
    box.title = titulo;
    input.title = box.checked ? titulo : "";
  }

  function limparValidacao(td) {
    const box = td.querySelector(".ok");
    if (!box || !box.checked) return;
    box.checked = false;
    box.dataset.por = "";
    box.dataset.em = "";
    box.dataset.qtd = "";
    pintarValidacao(td);
  }

  function htmlCanal(canal, item) {
    const info = item.validacao && item.validacao[canal.chave];
    const ok = !!(info && info.ok);
    const por = ok ? (info.por || "") : "";
    const em = ok ? fmtDataHora(info.em) : "";
    const qtd = campoQtd(item[canal.chave]);
    const titulo = tituloValidacao(canal, por, em);
    return `<td class="canal${ok ? " validado" : ""}">
      <input class="q ${canal.classe}" inputmode="decimal" aria-label="${escapeHtml(canal.rotulo)}" value="${escapeHtml(qtd)}" title="${escapeHtml(ok ? titulo : "")}" />
      <input type="checkbox" class="ok" aria-label="${escapeHtml(titulo)}"${ok ? " checked" : ""} data-por="${escapeHtml(por)}" data-em="${escapeHtml(em)}" data-qtd="${escapeHtml(qtd)}" title="${escapeHtml(titulo)}" />
    </td>`;
  }

  function linhaItem(item) {
    const tr = document.createElement("tr");
    const codigo = item.codigo || "";
    tr.dataset.codigo = String(codigo).toUpperCase();
    if (item.atualizadoPor) tr.title = `Última gravação: ${item.atualizadoPor}`;
    tr.innerHTML = `
      <td><input class="cod" autocomplete="off" aria-label="SKU" value="${escapeHtml(codigo)}" /></td>
      <td><input class="desc" readonly tabindex="-1" aria-label="Descrição" value="${escapeHtml(item.descricao || "")}" /></td>
      <td><input class="q moq" inputmode="decimal" aria-label="MOQ" value="${escapeHtml(campoQtd(item.moq))}" /></td>
      ${CANAIS.map((canal) => htmlCanal(canal, item)).join("")}
      <td class="total"></td>
      <td class="comprar"></td>
      <td><input class="obs" maxlength="300" aria-label="Observação do produto" value="${escapeHtml(item.observacao || "")}" /></td>
      <td><button type="button" class="icone remover" aria-label="Remover produto"><i class="fa-solid fa-trash"></i></button></td>
    `;
    const cod = tr.querySelector(".cod");
    const desc = tr.querySelector(".desc");
    let timer = null;
    cod.addEventListener("input", () => {
      clearTimeout(timer);
      const q = cod.value.trim();
      if (tr.dataset.codigo !== q.toUpperCase()) {
        tr.dataset.codigo = "";
        desc.value = "";
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
            cod.classList.remove("campo-erro");
            tr.dataset.codigo = String(p.codigo).toUpperCase();
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
        tr.dataset.codigo = "";
        return;
      }
      try {
        const data = await api("GET", "produto", { query: { codigo: q } });
        cod.value = data.data.codigo;
        desc.value = data.data.descricao || "";
        cod.classList.remove("campo-erro");
        tr.dataset.codigo = String(data.data.codigo).toUpperCase();
      } catch (_) {
        desc.value = "";
        cod.classList.add("campo-erro");
        tr.dataset.codigo = "";
      }
    });
    tr.querySelector(".moq").addEventListener("input", atualizarTotais);
    tr.querySelectorAll("td.canal").forEach((td) => {
      const input = td.querySelector(".q");
      const box = td.querySelector(".ok");
      input.addEventListener("input", () => {
        if (box.checked && input.value.trim() !== (box.dataset.qtd || "")) limparValidacao(td);
        atualizarTotais();
      });
      box.addEventListener("change", () => {
        if (box.checked) {
          box.dataset.por = usuario();
          box.dataset.em = agoraTela();
          box.dataset.qtd = input.value.trim();
        } else {
          box.dataset.por = "";
          box.dataset.em = "";
          box.dataset.qtd = "";
        }
        pintarValidacao(td);
      });
    });
    tr.querySelector(".remover").addEventListener("click", () => {
      tr.remove();
      if (!corpoItens.children.length) adicionarItem({});
      atualizarTotais();
    });
    return tr;
  }

  function adicionarItem(item) {
    const tr = linhaItem(item || {});
    corpoItens.appendChild(tr);
    atualizarTotais();
    return tr;
  }

  function renderItens(itens) {
    corpoItens.innerHTML = "";
    (itens.length ? itens : [{}]).forEach((item) => corpoItens.appendChild(linhaItem(item)));
    atualizarTotais();
    filtrarLinhas();
  }

  function atualizarTotais() {
    let planejado = 0;
    let comprar = 0;
    let abaixo = 0;
    corpoItens.querySelectorAll("tr").forEach((tr) => {
      const moq = lerQtd(tr.querySelector(".moq"));
      const valores = CANAIS.map((canal) => lerQtd(tr.querySelector("." + canal.classe)));
      const celulaTotal = tr.querySelector(".total");
      const celulaComprar = tr.querySelector(".comprar");
      if (moq == null || valores.some((n) => n == null)) {
        tr.className = "";
        celulaTotal.textContent = "—";
        celulaComprar.textContent = "—";
        return;
      }
      const calc = calcular(moq, valores);
      celulaTotal.textContent = fmtQtd(calc.total);
      celulaComprar.textContent = fmtQtd(calc.aComprar);
      tr.className = calc.abaixo ? "abaixo" : (calc.total > 0 ? "ok" : "sem-plano");
      if (calc.abaixo) {
        celulaComprar.title = `Plano ${fmtQtd(calc.total)}, mínimo ${fmtQtd(moq)}`;
      } else {
        celulaComprar.title = "";
      }
      planejado = Number((planejado + calc.total).toFixed(4));
      comprar = Number((comprar + calc.aComprar).toFixed(4));
      if (calc.abaixo) abaixo += 1;
    });
    document.getElementById("totalPlanejado").textContent = fmtQtd(planejado);
    document.getElementById("totalComprar").textContent = fmtQtd(comprar);
    const avisoAbaixo = document.getElementById("totalAbaixo");
    avisoAbaixo.hidden = abaixo === 0;
    avisoAbaixo.textContent = abaixo === 1
      ? "1 produto abaixo do MOQ"
      : `${abaixo} produtos abaixo do MOQ`;
  }

  function filtrarLinhas() {
    const q = document.getElementById("buscaItem").value.trim().toUpperCase();
    corpoItens.querySelectorAll("tr").forEach((tr) => {
      if (!q) {
        tr.hidden = false;
        return;
      }
      const cod = tr.querySelector(".cod").value.toUpperCase();
      const desc = tr.querySelector(".desc").value.toUpperCase();
      tr.hidden = !cod.includes(q) && !desc.includes(q);
    });
  }

  function aplicarTrava(data) {
    const aberto = !data || data.status === "ABERTO";
    document.querySelectorAll("#blocoDados input, #blocoDados textarea, #corpoItens input, #corpoItens button").forEach((el) => {
      el.disabled = !aberto;
    });
    ["btnVoltar", "btnExcluir", "btnDuplicar", "btnReabrir", "btnFechar", "btnSalvar", "btnAdd", "btnColar", "btnAplicarColar"].forEach((id) => {
      const el = document.getElementById(id);
      if (el) el.disabled = false;
    });
    document.getElementById("btnAdd").hidden = !aberto;
    document.getElementById("btnColar").hidden = !aberto;
    document.getElementById("btnSalvar").hidden = !aberto;
    document.getElementById("btnFechar").hidden = !aberto;
    document.getElementById("btnReabrir").hidden = aberto || !(data && data.id);
    document.getElementById("btnExcluir").hidden = !data || !data.id || data.status !== "ABERTO";
    document.getElementById("btnDuplicar").hidden = !data || !data.id;
    if (!aberto) document.getElementById("painelColar").hidden = true;
    document.getElementById("badgeStatus").innerHTML = tag(data && data.status ? data.status : "ABERTO");
    document.getElementById("tituloFicha").textContent = data && data.id ? (data.titulo || "Racional") : "Novo racional";

    const notas = [];
    if (data && data.criadoPor) notas.push(`Registrado por ${data.criadoPor}${data.criadoEm ? " em " + fmtDataHora(data.criadoEm) : ""}`);
    if (data && data.atualizadoPor) notas.push(`Alterado por ${data.atualizadoPor}${data.atualizadoEm ? " em " + fmtDataHora(data.atualizadoEm) : ""}`);
    if (data && data.fechadoPor && data.status === "FECHADO") {
      notas.push(`Fechado por ${data.fechadoPor}${data.fechadoEm ? " em " + fmtDataHora(data.fechadoEm) : ""}`);
    }
    document.getElementById("auditoria").textContent = notas.join(" · ");
  }

  function preencher(data) {
    ficha = data || null;
    document.getElementById("racId").value = data && data.id ? data.id : "";
    document.getElementById("titulo").value = data && data.titulo ? data.titulo : "";
    document.getElementById("referencia").value = data && data.referencia ? String(data.referencia).slice(0, 7) : hojeMes();
    document.getElementById("pedido").value = data && data.pedido ? data.pedido : "";
    document.getElementById("obs").value = data && data.observacao ? data.observacao : "";
    document.getElementById("buscaItem").value = "";
    renderItens((data && data.itens) || []);
    aplicarTrava(data);
    mostrarFicha();
    if (data && data.id) {
      const url = new URL(window.location.href);
      url.searchParams.set("id", data.id);
      history.replaceState(null, "", url.pathname + url.search);
    }
  }

  function linhaVazia(tr) {
    const cod = tr.querySelector(".cod").value.trim();
    const obs = tr.querySelector(".obs").value.trim();
    const moq = tr.querySelector(".moq").value.trim();
    const algumCanal = CANAIS.some((canal) => tr.querySelector("." + canal.classe).value.trim());
    return !cod && !obs && !moq && !algumCanal;
  }

  function coletar() {
    const itens = [];
    corpoItens.querySelectorAll("tr").forEach((tr) => {
      if (linhaVazia(tr)) return;
      const moq = lerQtd(tr.querySelector(".moq"));
      const valores = CANAIS.map((canal) => lerQtd(tr.querySelector("." + canal.classe)));
      const item = {
        codigo: tr.querySelector(".cod").value.trim(),
        moq: moq == null ? tr.querySelector(".moq").value : moq,
        observacao: tr.querySelector(".obs").value.trim(),
        validacao: {},
        invalido: moq == null || valores.some((n) => n == null),
      };
      CANAIS.forEach((canal, idx) => {
        const input = tr.querySelector("." + canal.classe);
        item[canal.chave] = valores[idx] == null ? input.value : valores[idx];
        item.validacao[canal.chave] = input.closest("td").querySelector(".ok").checked;
      });
      itens.push(item);
    });
    return {
      id: document.getElementById("racId").value,
      titulo: document.getElementById("titulo").value.trim(),
      referencia: document.getElementById("referencia").value,
      pedido: document.getElementById("pedido").value.trim(),
      observacao: document.getElementById("obs").value.trim(),
      itens,
    };
  }

  function validar(dados) {
    if (!dados.titulo) return "Informe o título do racional.";
    if (!dados.referencia) return "Informe o mês de referência.";
    if (!dados.itens.length) return "Inclua ao menos um produto.";
    const vistos = new Set();
    for (let i = 0; i < dados.itens.length; i++) {
      const item = dados.itens[i];
      if (!item.codigo) return `Informe o SKU da linha ${i + 1}.`;
      if (item.invalido) return `Quantidade inválida na linha ${i + 1}.`;
      const chave = item.codigo.toUpperCase();
      if (vistos.has(chave)) return `O produto ${item.codigo} está repetido.`;
      vistos.add(chave);
    }
    return "";
  }

  function contarSemPlano(dados) {
    return dados.itens.filter((item) => {
      const canais = [item.claro, item.vivo, item.comercial, item.online, item.quiosque, item.estAdicional];
      return canais.every((n) => !Number(n));
    }).length;
  }

  async function salvarAtual() {
    const dados = coletar();
    const erro = validar(dados);
    if (erro) throw new Error(erro);
    const resp = await api("POST", "salvar", { body: dados });
    return resp.data;
  }

  async function abrir(id) {
    aviso("");
    const data = await api("GET", "detalhe", { query: { id } });
    preencher(data.data);
  }

  function partirLinha(linha) {
    if (linha.includes("\t")) return linha.split("\t").map((parte) => parte.trim());
    if (linha.includes(";")) return linha.split(";").map((parte) => parte.trim());
    return [linha.trim()];
  }

  function acharLinha(codigo) {
    const alvo = String(codigo || "").toUpperCase();
    return [...corpoItens.querySelectorAll("tr")].find((tr) => {
      return tr.querySelector(".cod").value.trim().toUpperCase() === alvo;
    }) || null;
  }

  async function aplicarColar() {
    const bruto = document.getElementById("textoColar").value.replace(/\r/g, "");
    let linhas = bruto.split("\n").map((linha) => linha.trim()).filter(Boolean);
    if (!linhas.length) throw new Error("Cole ao menos um código.");
    if (/^(sku|c[oó]digo)$/i.test(partirLinha(linhas[0])[0] || "")) linhas.shift();
    if (!linhas.length) throw new Error("A planilha não tem produtos.");
    if (linhas.length > 500) throw new Error("A colagem aceita no máximo 500 produtos.");
    const partes = linhas.map(partirLinha);
    const resp = await api("POST", "resolver", { body: { codigos: partes.map((linha) => linha[0]) } });
    const porCodigo = new Map((resp.data || []).map((p) => [String(p.codigo).toUpperCase(), p]));
    let aplicados = 0;
    partes.forEach((colunas) => {
      const achado = porCodigo.get(String(colunas[0] || "").toUpperCase());
      if (!achado) return;
      let tr = acharLinha(achado.codigo);
      if (!tr) {
        tr = [...corpoItens.querySelectorAll("tr")].find((row) => !row.querySelector(".cod").value.trim()) || null;
        if (!tr) tr = adicionarItem({});
      }
      tr.querySelector(".cod").value = achado.codigo;
      tr.querySelector(".cod").classList.remove("campo-erro");
      tr.querySelector(".desc").value = achado.descricao || "";
      tr.dataset.codigo = String(achado.codigo).toUpperCase();
      ["moq", ...CANAIS.map((canal) => canal.classe)].forEach((classe, idx) => {
        const valor = colunas[idx + 1];
        if (valor == null || valor === "") return;
        const input = tr.querySelector("." + classe);
        if (input.value.trim() === String(valor).trim()) return;
        input.value = valor;
        const td = input.closest("td.canal");
        if (td) limparValidacao(td);
      });
      if (colunas[8]) tr.querySelector(".obs").value = colunas[8];
      aplicados += 1;
    });
    atualizarTotais();
    filtrarLinhas();
    const ausentes = resp.ausentes || [];
    if (!aplicados && ausentes.length) {
      throw new Error(`Sem cadastro: ${ausentes.slice(0, 8).join(", ")}.`);
    }
    if (ausentes.length) {
      aviso(`Produtos colados. Sem cadastro: ${ausentes.slice(0, 8).join(", ")}.`);
      return;
    }
    document.getElementById("textoColar").value = "";
    document.getElementById("painelColar").hidden = true;
    aviso("Produtos colados na grade.", "ok");
  }

  document.getElementById("btnNovo").addEventListener("click", () => {
    aviso("");
    preencher({ status: "ABERTO", itens: [{}], referencia: hojeMes() });
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
    if (!btn) return;
    filtroStatus = btn.getAttribute("data-status") || "";
    carregarLista().catch((err) => aviso(err.message));
  });
  corpoLista.addEventListener("click", (e) => {
    const tr = e.target.closest("tr[data-id]");
    if (!tr) return;
    abrir(tr.getAttribute("data-id")).catch((err) => aviso(err.message));
  });
  document.getElementById("btnAdd").addEventListener("click", () => {
    const tr = adicionarItem({});
    tr.querySelector(".cod").focus();
  });
  document.getElementById("buscaItem").addEventListener("input", filtrarLinhas);
  document.getElementById("btnColar").addEventListener("click", () => {
    const painel = document.getElementById("painelColar");
    painel.hidden = !painel.hidden;
    if (!painel.hidden) document.getElementById("textoColar").focus();
  });
  document.getElementById("btnAplicarColar").addEventListener("click", () => comOcupacao(aplicarColar));
  document.getElementById("btnSalvar").addEventListener("click", () => comOcupacao(async () => {
    const data = await salvarAtual();
    preencher(data);
    aviso("Racional salvo.", "ok");
  }));
  document.getElementById("btnFechar").addEventListener("click", () => comOcupacao(async () => {
    const dados = coletar();
    const erro = validar(dados);
    if (erro) throw new Error(erro);
    const semPlano = contarSemPlano(dados);
    let msg = "Fechar este racional? Ele deixa de aceitar alteração até ser reaberto.";
    if (semPlano) {
      msg += semPlano === 1
        ? " 1 produto está com os canais zerados."
        : ` ${semPlano} produtos estão com os canais zerados.`;
    }
    if (!window.confirm(msg)) return;
    const salvo = await api("POST", "salvar", { body: dados });
    const decidido = await api("POST", "decidir", { body: { id: salvo.data.id, status: "FECHADO" } });
    preencher(decidido.data);
    aviso("Racional fechado.", "ok");
  }));
  document.getElementById("btnReabrir").addEventListener("click", () => comOcupacao(async () => {
    if (!ficha || !ficha.id) return;
    if (!window.confirm("Reabrir o racional para edição?")) return;
    const data = await api("POST", "decidir", { body: { id: ficha.id, status: "ABERTO" } });
    preencher(data.data);
    aviso("Racional reaberto.", "ok");
  }));
  document.getElementById("btnDuplicar").addEventListener("click", () => comOcupacao(async () => {
    if (!ficha || !ficha.id) return;
    if (!window.confirm("Criar um racional em aberto com os mesmos produtos e quantidades? O pedido e as validações dos canais não são copiados.")) return;
    const data = await api("POST", "duplicar", { body: { id: ficha.id } });
    preencher(data.data);
    aviso("Cópia criada em aberto.", "ok");
  }));
  document.getElementById("btnExcluir").addEventListener("click", () => comOcupacao(async () => {
    if (!ficha || !ficha.id) return;
    if (!window.confirm("Excluir este racional? Essa ação não pode ser desfeita.")) return;
    await api("POST", "excluir", { body: { id: ficha.id } });
    mostrarLista();
    await carregarLista();
    aviso("Racional excluído.", "ok");
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
