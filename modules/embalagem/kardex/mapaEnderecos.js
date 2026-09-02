document.addEventListener("DOMContentLoaded", async () => {
  const root = document.getElementById("mapaRoot");
  const resumoEl = document.getElementById("resumo");
  const msgEl = document.getElementById("statusMsg");
  const buscaEl = document.getElementById("busca");
  const soVazias = document.getElementById("soVazias");
  const soOcupadas = document.getElementById("soOcupadas");
  const modal = document.getElementById("modalPosicao");
  const modalBody = document.getElementById("modalBody");
  const modalTitulo = document.getElementById("modalTitulo");

  let data = null;
  let editando = false;
  let zoom = 1;
  let podeEditar = true;

  function authHeaders() {
    if (window.SGCPermissoes && typeof window.SGCPermissoes.authHeaders === "function") {
      return Object.assign({ "Content-Type": "application/json" }, window.SGCPermissoes.authHeaders());
    }
    return { "Content-Type": "application/json" };
  }

  function setMsg(text, isErr) {
    msgEl.textContent = text || "";
    msgEl.className = "mapa-msg " + (isErr ? "err" : "ok");
  }

  function fmt(n) {
    return Number(n || 0).toLocaleString("pt-BR", { maximumFractionDigits: 0 });
  }

  function trunc(s, n) {
    const t = String(s || "").trim();
    if (t.length <= n) return t;
    return t.slice(0, n - 1) + "…";
  }

  function normEndereco(v) {
    const s = String(v || "")
      .trim()
      .toUpperCase()
      .replace(/[./_\s]+/g, "-")
      .replace(/-+/g, "-");
    const comPrefixo = s.match(/^([A-Z]+)-(\d+)-(\d+)$/);
    if (comPrefixo) return `${comPrefixo[1]}-${Number(comPrefixo[2])}-${Number(comPrefixo[3])}`;
    const soNumeros = s.match(/^(\d+)-(\d+)-(\d+)$/);
    if (soNumeros) return `${Number(soNumeros[1])}-${Number(soNumeros[2])}-${Number(soNumeros[3])}`;
    return s.replace(/^0+(\d)/, "$1").replace(/-0+(\d)/g, "-$1");
  }

  async function apiGet(action) {
    const res = await fetch(`/api/embalagem/inventory?action=${action}`, { headers: authHeaders() });
    const json = await res.json().catch(() => ({}));
    if (res.status === 504) {
      throw new Error("O servidor demorou demais. Clique em Atualizar saldos.");
    }
    if (!res.ok || json.success === false) {
      throw new Error(json.error || json.message || "Falha ao carregar mapa.");
    }
    return json;
  }

  async function apiPost(body) {
    const res = await fetch("/api/embalagem/inventory", {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify(body),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok || json.success === false) throw new Error(json.error || json.message || "Falha ao salvar.");
    return json;
  }

  function queryMatch(pos, q) {
    if (!q) return true;
    const hay = [
      pos.endereco,
      ...(pos.itens || []).flatMap((it) => [it.codigo, it.descricao]),
    ]
      .join(" ")
      .toLowerCase();
    return hay.includes(q);
  }

  function renderResumo(d) {
    const r = d.resumo || {};
    resumoEl.innerHTML = `
      <div class="card-n"><span>Posições</span><strong>${fmt(r.posicoes)}</strong></div>
      <div class="card-n ok"><span>Ocupadas</span><strong>${fmt(r.ocupadas)}</strong></div>
      <div class="card-n warn"><span>Vazias</span><strong>${fmt(r.vazias)}</strong></div>
      <div class="card-n"><span>Fora do mapa</span><strong>${fmt(r.foraDoMapa)}</strong></div>
    `;
  }

  function cellHtml(pos, estante) {
    const itens = pos.itens || [];
    const ocupado = itens.length > 0;
    let body;
    if (!ocupado) {
      body = `<div class="pos-body">vazio</div>`;
    } else if (itens.length === 1) {
      const it = itens[0];
      body = `<div class="pos-body">
        <div class="pos-cod">${it.codigo}</div>
        <div class="pos-desc">${trunc(it.descricao, 48)}</div>
        <div class="pos-saldo">Saldo ${fmt(it.saldo)}</div>
      </div>`;
    } else {
      body = `<div class="pos-body">
        <div class="pos-cod">${itens.length} itens</div>
        <div class="pos-desc">${itens.map((it) => it.codigo).join(" · ")}</div>
        <div class="pos-saldo">Saldo ${fmt(pos.saldoTotal)}</div>
      </div>`;
    }
    const cls = [
      "pos-cell",
      ocupado ? "ocupado" : "vazio",
      itens.length > 1 ? "multi" : "",
      estante.tipo === "RACK" && pos.colInicio % 2 === 1 ? "bay-start" : "",
    ]
      .filter(Boolean)
      .join(" ");
    return `<button type="button" class="${cls}"
      data-id="${pos.id}" data-estante="${estante.id}" data-endereco="${pos.endereco}"
      style="grid-column:${pos.colInicio} / span ${pos.colspan || 1}; grid-row:${pos.linha};">
      ${body}
      <div class="pos-addr">${pos.endereco}</div>
    </button>`;
  }

  function renderEstante(est) {
    const cols = Math.max(1, est.colunas || 8);
    const maxLinha = est.posicoes.reduce((m, p) => Math.max(m, p.linha || 1), 1);
    const occupied = new Set();
    for (const p of est.posicoes) {
      const span = p.colspan || 1;
      for (let i = 0; i < span; i++) occupied.add(`${p.linha}:${p.colInicio + i}`);
    }
    let holes = "";
    if (editando) {
      for (let l = 1; l <= maxLinha + 1; l++) {
        for (let c = 1; c <= cols; c++) {
          if (occupied.has(`${l}:${c}`)) continue;
          holes += `<button type="button" class="hole" data-estante="${est.id}" data-linha="${l}" data-col="${c}"
            style="grid-column:${c};grid-row:${l};">+ posição</button>`;
        }
      }
    }
    return `
      <section class="estante-block" data-estante-id="${est.id}">
        <div class="estante-h">
          <span></span>
          <span>${est.nome.toUpperCase()}</span>
          <span class="estante-actions">
            <button type="button" data-act="edit-estante" data-id="${est.id}">Editar</button>
            <button type="button" data-act="add-pos" data-id="${est.id}">+ Posição</button>
          </span>
        </div>
        <div class="estante-scroll">
          <div class="estante-grid" data-estante-id="${est.id}"
            style="grid-template-columns:repeat(${cols}, minmax(78px, 1fr)); transform:scale(${zoom}); width:${(100 / zoom).toFixed(1)}%;">
            ${est.posicoes.map((p) => cellHtml(p, est)).join("")}
            ${holes}
          </div>
        </div>
      </section>`;
  }

  function render() {
    if (!data) return;
    renderResumo(data);
    const fora = (data.foraDoMapa || []).length
      ? `<div class="fora-box">
          <h3>Saldo em endereço que não está no mapa (${data.foraDoMapa.length})</h3>
          <p class="fora-hint">O kardex tem saldo nesses códigos de endereço, mas eles não batem com nenhuma posição desenhada. Clique na linha para ver o item.</p>
          <div class="fora-table-wrap">
            <table class="fora-table">
              <thead>
                <tr><th>Endereço</th><th>Código</th><th>Descrição</th><th>Saldo</th></tr>
              </thead>
              <tbody>
                ${(data.foraDoMapa || [])
                  .flatMap((f) =>
                    (f.itens && f.itens.length ? f.itens : [{ codigo: "—", descricao: "", saldo: f.saldoTotal }]).map(
                      (it) => `<tr class="fora-row" data-endereco="${f.endereco}">
                        <td class="fora-end">${f.endereco}</td>
                        <td>${it.codigo || "—"}</td>
                        <td>${it.descricao || "—"}</td>
                        <td class="fora-saldo">${fmt(it.saldo)}</td>
                      </tr>`
                    )
                  )
                  .join("")}
              </tbody>
            </table>
          </div>
        </div>`
      : "";
    const legenda = `<div class="mapa-legenda">
      <span><i class="leg-oc"></i>Ocupada</span>
      <span><i class="leg-vz"></i>Vazia</span>
      <span><i class="leg-ml"></i>Vários itens</span>
    </div>`;
    root.innerHTML =
      legenda +
      (data.estantes || []).map(renderEstante).join("") +
      fora +
      (editando
        ? `<p style="margin:8px 0 20px;"><button type="button" class="btn-destaque" id="btnNovaEstante"><i class="fa-solid fa-plus"></i> Nova estante</button></p>`
        : "");
    applyFilters();
  }

  function applyFilters() {
    const q = (buscaEl.value || "").trim().toLowerCase();
    const vaz = soVazias.checked;
    const ocu = soOcupadas.checked;
    root.querySelectorAll(".pos-cell").forEach((el) => {
      const ocupado = el.classList.contains("ocupado");
      let show = true;
      if (vaz && ocupado) show = false;
      if (ocu && !ocupado) show = false;
      const pos = findPos(el.dataset.endereco);
      const match = !q || (pos && queryMatch(pos, q));
      el.classList.toggle("hidden-filter", !show);
      el.classList.toggle("match", !!q && match && show);
      el.classList.toggle("dim", !!q && !match && show);
    });
  }

  function findPos(endereco) {
    const key = normEndereco(endereco);
    for (const e of data.estantes || []) {
      const p = e.posicoes.find((x) => x.endereco === endereco || normEndereco(x.endereco) === key);
      if (p) return p;
    }
    return (data.foraDoMapa || []).find((x) => x.endereco === endereco || normEndereco(x.endereco) === key) || null;
  }

  function findEstante(id) {
    return (data.estantes || []).find((e) => String(e.id) === String(id));
  }

  function openModal(title, html) {
    modalTitulo.textContent = title;
    modalBody.innerHTML = html;
    modal.style.display = "block";
  }
  function closeModal() {
    modal.style.display = "none";
  }

  function viewPosicao(pos) {
    const itens = pos.itens || [];
    const lista = itens.length
      ? itens
          .map(
            (it) => `<div class="item-row">
              <strong>${it.codigo}</strong> — ${it.descricao || "sem descrição"}<br>
              Saldo: <strong>${fmt(it.saldo)}</strong>
              ${it.armazem ? ` · Arm. ${it.armazem}` : ""}
              <div><a href="/modules/embalagem/kardex/estoque.html">Abrir em Gerenciar Estoque</a></div>
            </div>`
          )
          .join("")
      : `<p class="info-message">Posição vazia — sem saldo no kardex.</p>`;
    const editForm = editando
      ? formPosicao(pos)
      : `<div class="btn-row"><button type="button" class="btn-secundario" id="btnFecharModal">Fechar</button></div>`;
    openModal(pos.endereco, lista + (editando ? "<hr style='margin:12px 0'>" : "") + editForm);
  }

  function formPosicao(pos, extras) {
    const estId = (pos && pos.estanteId) || (extras && extras.estanteId) || "";
    const options = (data.estantes || [])
      .map((e) => `<option value="${e.id}" ${String(e.id) === String(estId) ? "selected" : ""}>${e.nome}</option>`)
      .join("");
    return `<form class="modal-form" id="formPosicao">
      <input type="hidden" name="id" value="${pos && pos.id ? pos.id : ""}" />
      <label>Estante</label>
      <select name="estanteId" required>${options}</select>
      <label>Endereço (igual ao kardex)</label>
      <input name="endereco" required value="${pos && pos.endereco ? pos.endereco : ""}" placeholder="15-06-180" />
      <div class="row2">
        <div><label>Linha (1 = topo)</label><input name="linha" type="number" min="1" value="${(pos && pos.linha) || (extras && extras.linha) || 1}" /></div>
        <div><label>Coluna</label><input name="colInicio" type="number" min="1" value="${(pos && pos.colInicio) || (extras && extras.colInicio) || 1}" /></div>
        <div><label>Largura</label><input name="colspan" type="number" min="1" value="${(pos && pos.colspan) || 1}" /></div>
      </div>
      <div class="btn-row">
        <button type="submit" class="btn-destaque">Salvar posição</button>
        ${pos && pos.id ? `<button type="button" class="btn-danger" id="btnExcluirPos" data-id="${pos.id}">Excluir</button>` : ""}
      </div>
    </form>`;
  }

  function formEstante(est) {
    return `<form class="modal-form" id="formEstante">
      <input type="hidden" name="id" value="${est && est.id ? est.id : ""}" />
      <label>Nome</label>
      <input name="nome" required value="${est && est.nome ? est.nome : ""}" />
      <div class="row2">
        <div>
          <label>Tipo</label>
          <select name="tipo">
            <option value="RACK" ${!est || est.tipo === "RACK" ? "selected" : ""}>Estante</option>
            <option value="PICKING" ${est && est.tipo === "PICKING" ? "selected" : ""}>Picking</option>
          </select>
        </div>
        <div><label>Colunas do grid</label><input name="colunas" type="number" min="1" max="60" value="${(est && est.colunas) || 8}" /></div>
        <div><label>Ordem</label><input name="ordem" type="number" min="1" value="${(est && est.ordem) || 99}" /></div>
      </div>
      <div class="btn-row">
        <button type="submit" class="btn-destaque">Salvar estante</button>
        ${est && est.id ? `<button type="button" class="btn-danger" id="btnExcluirEst" data-id="${est.id}">Excluir estante</button>` : ""}
      </div>
    </form>`;
  }

  function aplicarSaldos(payload) {
    if (!data) return;
    const idx = payload.porEndereco || {};
    for (const est of data.estantes || []) {
      for (const pos of est.posicoes || []) {
        const itens = idx[normEndereco(pos.endereco)] || [];
        pos.itens = itens;
        pos.ocupado = itens.length > 0;
        pos.saldoTotal = itens.reduce((s, it) => s + (Number(it.saldo) || 0), 0);
      }
    }
    data.foraDoMapa = payload.foraDoMapa || [];
    const totalPos = (data.estantes || []).reduce((s, e) => s + e.posicoes.length, 0);
    const ocupadas = (data.estantes || []).reduce(
      (s, e) => s + e.posicoes.filter((p) => p.ocupado).length,
      0
    );
    data.resumo = {
      posicoes: totalPos,
      ocupadas,
      vazias: totalPos - ocupadas,
      foraDoMapa: data.foraDoMapa.length,
    };
  }

  async function carregar() {
    setMsg("Carregando layout…");
    data = await apiGet("mapa");
    render();
    setMsg("Carregando saldos do kardex…");
    try {
      const saldos = await apiGet("mapaSaldos");
      aplicarSaldos(saldos);
      render();
      setMsg("");
    } catch (err) {
      setMsg(err.message || "Layout ok, mas o saldo não carregou. Clique em Atualizar.", true);
    }
  }

  if (window.SGCPermissoes) {
    await window.SGCPermissoes.carregar();
    if (!window.SGCPermissoes.podeAcessar("mapa-enderecos") && !window.SGCPermissoes.podeAcessar("estoque")) {
      alert("Acesso negado.");
      window.location.href = "/menu.html";
      return;
    }
    podeEditar =
      window.SGCPermissoes.podeAcessar("mapa-enderecos") ||
      window.SGCPermissoes.podeAcessar("estoque-alterar-endereco") ||
      window.SGCPermissoes.podeAcessar("estoque") ||
      window.SGCPermissoes.isAdmin();
    if (!podeEditar) document.getElementById("btnEditar").style.display = "none";
  }

  document.getElementById("btnAtualizar").addEventListener("click", () => {
    carregar().catch((e) => setMsg(e.message, true));
  });
  document.getElementById("btnEditar").addEventListener("click", () => {
    editando = !editando;
    document.body.classList.toggle("is-editing", editando);
    document.getElementById("btnEditar").innerHTML = editando
      ? '<i class="fa-solid fa-check"></i> Sair da edição'
      : '<i class="fa-solid fa-pen-to-square"></i> Editar layout';
    render();
  });
  buscaEl.addEventListener("input", applyFilters);
  soVazias.addEventListener("change", () => {
    if (soVazias.checked) soOcupadas.checked = false;
    applyFilters();
  });
  soOcupadas.addEventListener("change", () => {
    if (soOcupadas.checked) soVazias.checked = false;
    applyFilters();
  });
  document.getElementById("zoomIn").addEventListener("click", () => {
    zoom = Math.min(1.4, zoom + 0.1);
    document.getElementById("zoomVal").textContent = `${Math.round(zoom * 100)}%`;
    render();
  });
  document.getElementById("zoomOut").addEventListener("click", () => {
    zoom = Math.max(0.5, zoom - 0.1);
    document.getElementById("zoomVal").textContent = `${Math.round(zoom * 100)}%`;
    render();
  });
  document.getElementById("modalClose").addEventListener("click", closeModal);
  window.addEventListener("click", (e) => {
    if (e.target === modal) closeModal();
  });

  root.addEventListener("click", (e) => {
    const cell = e.target.closest(".pos-cell");
    if (cell) {
      const pos = findPos(cell.dataset.endereco);
      if (!pos) return;
      pos.estanteId = cell.dataset.estante;
      viewPosicao(pos);
      return;
    }
    const hole = e.target.closest(".hole");
    if (hole) {
      openModal(
        "Nova posição",
        formPosicao(null, {
          estanteId: hole.dataset.estante,
          linha: hole.dataset.linha,
          colInicio: hole.dataset.col,
        })
      );
      return;
    }
    const chip = e.target.closest(".fora-row, .fora-chip");
    if (chip) {
      const pos = findPos(chip.dataset.endereco) || {
        endereco: chip.dataset.endereco,
        itens: (data.foraDoMapa || []).find((x) => x.endereco === chip.dataset.endereco)?.itens || [],
      };
      viewPosicao(pos);
      return;
    }
    const nova = e.target.closest("#btnNovaEstante");
    if (nova) openModal("Nova estante", formEstante(null));
    const editEst = e.target.closest("[data-act='edit-estante']");
    if (editEst) {
      const est = findEstante(editEst.dataset.id);
      if (est) openModal("Editar estante", formEstante(est));
    }
    const addPos = e.target.closest("[data-act='add-pos']");
    if (addPos) {
      openModal("Nova posição", formPosicao(null, { estanteId: addPos.dataset.id }));
    }
  });

  modalBody.addEventListener("submit", async (e) => {
    const form = e.target;
    if (form.id === "formPosicao") {
      e.preventDefault();
      const fd = new FormData(form);
      try {
        await apiPost({
          acao: "mapa-salvar-posicao",
          id: fd.get("id") || null,
          estanteId: fd.get("estanteId"),
          endereco: fd.get("endereco"),
          linha: fd.get("linha"),
          colInicio: fd.get("colInicio"),
          colspan: fd.get("colspan"),
        });
        closeModal();
        await carregar();
        setMsg("Posição salva.");
      } catch (err) {
        setMsg(err.message, true);
      }
    }
    if (form.id === "formEstante") {
      e.preventDefault();
      const fd = new FormData(form);
      try {
        await apiPost({
          acao: "mapa-salvar-estante",
          id: fd.get("id") || null,
          nome: fd.get("nome"),
          tipo: fd.get("tipo"),
          colunas: fd.get("colunas"),
          ordem: fd.get("ordem"),
        });
        closeModal();
        await carregar();
        setMsg("Estante salva.");
      } catch (err) {
        setMsg(err.message, true);
      }
    }
  });

  modalBody.addEventListener("click", async (e) => {
    if (e.target.id === "btnFecharModal") closeModal();
    if (e.target.id === "btnExcluirPos") {
      if (!confirm("Excluir esta posição do mapa? O saldo no kardex não é apagado.")) return;
      try {
        await apiPost({ acao: "mapa-excluir-posicao", id: e.target.dataset.id });
        closeModal();
        await carregar();
        setMsg("Posição excluída do mapa.");
      } catch (err) {
        setMsg(err.message, true);
      }
    }
    if (e.target.id === "btnExcluirEst") {
      if (!confirm("Excluir a estante e todas as posições dela no mapa?")) return;
      try {
        await apiPost({ acao: "mapa-excluir-estante", id: e.target.dataset.id });
        closeModal();
        await carregar();
        setMsg("Estante excluída.");
      } catch (err) {
        setMsg(err.message, true);
      }
    }
  });

  try {
    await carregar();
  } catch (err) {
    setMsg(err.message, true);
    root.innerHTML = `<p class="error-message">${err.message}</p>`;
  }
});
