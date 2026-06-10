// =====================================================================
// Saving de Compras (Embalagem)
// - Lista itens curva A ativos
// - Mostra custo da última NF de cada mês no período
// - Permite definir meta % por item para um Mês da Meta específico (custo base = última NF antes desse mês)
// - Calcula Saving R$/un e Custo Target
// - Aba indicador: planejado × realizado
// =====================================================================

document.addEventListener("DOMContentLoaded", () => {
    const dtIni            = document.getElementById("dtIni");
    const dtFim            = document.getElementById("dtFim");
    const anoMesMetaInput  = document.getElementById("anoMesMeta");
    const btnAplicar       = document.getElementById("btnAplicar");
    const btnSalvarMetas   = document.getElementById("btnSalvarMetas");
    const buscaItem        = document.getElementById("buscaItem");
    const theadSaving      = document.getElementById("theadSaving");
    const tbodySaving      = document.getElementById("tbodySaving");
    const ancoraInfo       = document.getElementById("ancoraInfo");
    const resumoTotais     = document.getElementById("resumoTotais");
    const totalItensMeta   = document.getElementById("totalItensMeta");
    const totalSavingUn    = document.getElementById("totalSavingUn");
    const totalTargetUn    = document.getElementById("totalTargetUn");

    const tabs                 = document.querySelectorAll(".tab");
    const tbodyResumoMeses     = document.getElementById("tbodyResumoMeses");
    const btnRecarregarResumo  = document.getElementById("btnRecarregarResumo");

    // Estado em memória
    let estadoAtual = {
        anoMesMeta: null,
        meses: [],
        itens: [],        // itens originais (do backend)
        alteracoes: {},   // { codigo: novaMeta }
        sort: { key: null, dir: 1 },  // 1=asc, -1=desc
        filtro: ""
    };

    let resumoMesesCache = null;       // [{anoMes, ...}]
    let detalhesCache = {};            // { anoMes: { itens, totais } }

    // ----------------------- Inicialização -----------------------
    inicializarPeriodoDefault();
    bindEventos();

    function inicializarPeriodoDefault() {
        const hoje = new Date();
        const ano  = hoje.getFullYear();
        const mes  = hoje.getMonth(); // 0-11
        // Default: jan/anoCorrente até último dia do mês corrente
        const ini = new Date(ano, 0, 1);
        const fim = new Date(ano, mes + 1, 0);
        dtIni.value = toIsoDate(ini);
        dtFim.value = toIsoDate(fim);
        // Default mês-meta = mês atual
        anoMesMetaInput.value = `${ano}-${String(mes + 1).padStart(2, "0")}`;
    }

    function bindEventos() {
        btnAplicar.addEventListener("click", carregarSaving);
        btnSalvarMetas.addEventListener("click", salvarMetasAlteradas);
        buscaItem.addEventListener("input", () => {
            estadoAtual.filtro = (buscaItem.value || "").trim().toLowerCase();
            renderizarTabela();
        });

        tabs.forEach(t => t.addEventListener("click", () => trocarTab(t.dataset.tab)));
        btnRecarregarResumo.addEventListener("click", () => carregarResumoMeses(true));
    }

    function trocarTab(tabName) {
        tabs.forEach(t => t.classList.toggle("active", t.dataset.tab === tabName));
        document.getElementById("tab-planejamento").style.display = (tabName === "planejamento") ? "" : "none";
        document.getElementById("tab-indicador").style.display    = (tabName === "indicador")    ? "" : "none";
        if (tabName === "indicador" && resumoMesesCache === null) {
            carregarResumoMeses();
        }
    }

    // ----------------------- Carregar Saving -----------------------
    async function carregarSaving() {
        const ini = dtIni.value;
        const fim = dtFim.value;
        const ym  = anoMesMetaInput.value;
        if (!ini || !fim) {
            alert("Informe data início e data fim.");
            return;
        }
        if (!ym) {
            alert("Informe o Mês da Meta.");
            return;
        }
        if (ini > fim) {
            alert("Data início deve ser anterior à data fim.");
            return;
        }

        tbodySaving.innerHTML = `<tr><td class="loading" colspan="12"><i class="fa fa-spinner fa-spin"></i> Carregando...</td></tr>`;
        theadSaving.innerHTML = "";
        resumoTotais.style.display = "none";
        btnSalvarMetas.disabled = true;
        estadoAtual.alteracoes = {};

        try {
            const url = `/api/embalagem/relatorios?acao=savingList&dtIni=${encodeURIComponent(ini)}&dtFim=${encodeURIComponent(fim)}&anoMesMeta=${encodeURIComponent(ym)}`;
            const resp = await fetch(url);
            if (!resp.ok) {
                const e = await resp.json().catch(() => ({}));
                throw new Error(e.message || `HTTP ${resp.status}`);
            }
            const data = await resp.json();

            estadoAtual.anoMesMeta = data.anoMesMeta;
            estadoAtual.meses      = data.meses;
            estadoAtual.itens      = data.itens;

            atualizarAncoraInfo();
            renderizarTabela();
            atualizarTotais();
        } catch (err) {
            console.error("Erro ao carregar Saving:", err);
            tbodySaving.innerHTML = `<tr><td class="empty" colspan="12" style="color:#c62828;">Erro: ${err.message}</td></tr>`;
        }
    }

    function atualizarAncoraInfo() {
        const itensComBase = estadoAtual.itens.filter(i => i.anoMesBase).length;
        const labelMeta = labelMes(estadoAtual.anoMesMeta);
        ancoraInfo.innerHTML = `
            Metas para o mês <strong style="color:#1976d2;">${labelMeta}</strong>.
            <strong>Custo Base</strong> = última NF do item ANTES de ${labelMeta} (marcada com ★).
            Meta% aplicada sobre o Custo Base define o <strong>Saving R$/un</strong> e o <strong>Custo Target</strong>.
            <em>${itensComBase}/${estadoAtual.itens.length} itens com NF anterior ao mês-meta.</em>
        `;
    }

    function renderizarTabela() {
        // Meses do mais recente para o mais antigo (apenas para exibição nas colunas)
        const mesesDisplay = [...estadoAtual.meses].reverse();

        // Cabeçalho — colunas fixas ordenáveis
        const sortKey = estadoAtual.sort.key;
        const sortDir = estadoAtual.sort.dir;
        const sortClass = (key) => {
            if (sortKey !== key) return "sortable";
            return "sortable " + (sortDir > 0 ? "asc" : "desc");
        };

        const ths = [
            `<th class="col-item ${sortClass('item')}" data-sort="item">Item</th>`,
            `<th class="${sortClass('base')}" data-sort="base">Mês Base (custo)</th>`,
            `<th class="${sortClass('meta')}" data-sort="meta">Meta %</th>`,
            `<th class="${sortClass('saving')}" data-sort="saving">Saving R$/un</th>`,
            `<th class="${sortClass('target')}" data-sort="target">Custo Target</th>`,
            `<th class="${sortClass('consumo')}" data-sort="consumo" title="Consumo médio mensal (últimos 365 dias)">Consumo /mês</th>`,
            `<th class="${sortClass('proj12')}" data-sort="proj12" title="Saving R$/un × consumo mensal × 12">Saving 12m (R$)</th>`,
            ...mesesDisplay.map((m, idx) => `<th class="${idx === 0 ? 'col-mes-first' : ''}" title="${m.anoMes}">${m.label}</th>`)
        ];
        theadSaving.innerHTML = `<tr>${ths.join("")}</tr>`;

        // Bind sort
        theadSaving.querySelectorAll("th.sortable").forEach(th => {
            th.addEventListener("click", () => {
                const k = th.dataset.sort;
                if (estadoAtual.sort.key === k) {
                    estadoAtual.sort.dir = -estadoAtual.sort.dir;
                } else {
                    estadoAtual.sort.key = k;
                    estadoAtual.sort.dir = 1;
                }
                renderizarTabela();
            });
        });

        // Filtra e ordena
        const filtro = estadoAtual.filtro;
        let itens = estadoAtual.itens;
        if (filtro) {
            itens = itens.filter(it =>
                (it.codigo || "").toLowerCase().includes(filtro) ||
                (it.descricao || "").toLowerCase().includes(filtro)
            );
        }
        if (sortKey) {
            const getMetaEfetiva = it => (it.codigo in estadoAtual.alteracoes)
                ? estadoAtual.alteracoes[it.codigo] : it.metaPct;
            const getVal = it => {
                switch (sortKey) {
                    case 'item':   return (it.descricao || it.codigo || "").toLowerCase();
                    case 'base':   return it.custoBase != null ? Number(it.custoBase) : -Infinity;
                    case 'meta':   {
                        const m = getMetaEfetiva(it);
                        return m != null ? Number(m) : -Infinity;
                    }
                    case 'saving': {
                        const m = getMetaEfetiva(it);
                        if (it.custoBase == null || m == null) return -Infinity;
                        return it.custoBase * (m / 100);
                    }
                    case 'target': {
                        const m = getMetaEfetiva(it);
                        if (it.custoBase == null || m == null) return -Infinity;
                        return it.custoBase * (1 - m / 100);
                    }
                    case 'consumo': return Number(it.consumoMensal) || 0;
                    case 'proj12': {
                        const m = getMetaEfetiva(it);
                        const c = Number(it.consumoMensal) || 0;
                        if (it.custoBase == null || m == null || c <= 0) return -Infinity;
                        return it.custoBase * (m / 100) * c * 12;
                    }
                }
                return 0;
            };
            itens = [...itens].sort((a, b) => {
                const va = getVal(a), vb = getVal(b);
                if (va < vb) return -1 * sortDir;
                if (va > vb) return  1 * sortDir;
                return 0;
            });
        }

        // Corpo
        if (itens.length === 0) {
            const msg = filtro ? `Nenhum item bate com "${escapeHtml(buscaItem.value)}".` : 'Nenhum item curva A encontrado.';
            tbodySaving.innerHTML = `<tr><td class="empty" colspan="${7 + mesesDisplay.length}">${msg}</td></tr>`;
            return;
        }

        tbodySaving.innerHTML = itens.map(it => {
            const custosCells = mesesDisplay.map((m, idx) => {
                const v = it.custos[m.anoMes];
                const isAncora = m.anoMes === it.anoMesBase;
                const firstCls = idx === 0 ? ' col-mes-first' : '';
                const cls = `mes-cell${isAncora ? " col-base" : ""}${firstCls}`;
                const star = isAncora ? ' <span title="Mês-base deste item" style="color:#1976d2;">★</span>' : '';
                return `<td class="${cls}">${v != null ? formatBRL(v) + star : '<span class="muted">—</span>'}</td>`;
            }).join("");

            const metaEfetiva = (it.codigo in estadoAtual.alteracoes)
                ? estadoAtual.alteracoes[it.codigo] : it.metaPct;
            const metaVal = metaEfetiva != null ? Number(metaEfetiva).toFixed(2) : "";

            let savingTxt = '<span class="muted">—</span>';
            let targetTxt = '<span class="muted">—</span>';
            let proj12Txt = '<span class="muted">—</span>';
            if (it.custoBase != null && metaEfetiva != null && metaEfetiva > 0) {
                const saving = +(it.custoBase * (metaEfetiva / 100)).toFixed(4);
                const target = +(it.custoBase - saving).toFixed(4);
                savingTxt = `<span class="pos">-${formatBRL(saving)}</span>`;
                targetTxt = `<span class="col-target">${formatBRL(target)}</span>`;
                const c = Number(it.consumoMensal) || 0;
                if (c > 0) {
                    const proj = +(saving * c * 12).toFixed(2);
                    proj12Txt = `<span class="pos" title="${formatBRL(saving)}/un × ${formatNum(c)}/mês × 12">-${formatBRL(proj)}</span>`;
                }
            }

            const consumoTxt = (it.consumoMensal != null && Number(it.consumoMensal) > 0)
                ? formatNum(it.consumoMensal)
                : '<span class="muted">—</span>';

            const baseTxt = it.anoMesBase
                ? `<strong style="color:#1976d2;">${labelMes(it.anoMesBase)}</strong>` +
                  `<span class="col-base-valor">${formatBRL(it.custoBase)}</span>`
                : '<span class="muted">sem NF</span>';

            const semBase = it.anoMesBase == null;
            const inputAttrs = semBase ? 'disabled title="Sem NF anterior ao mês-meta — não é possível cadastrar meta"' : '';

            return `
                <tr data-codigo="${it.codigo}" data-anomesbase="${it.anoMesBase || ''}">
                    <td class="col-item">
                        <strong>${escapeHtml(it.codigo)}</strong>
                        <span style="color:#666;font-weight:400;"> ${escapeHtml(it.descricao || "")}</span>
                    </td>
                    <td>${baseTxt}</td>
                    <td class="col-meta">
                        <input type="number" step="0.01" min="0" max="100"
                               class="input-meta${(it.codigo in estadoAtual.alteracoes) ? ' dirty' : ''}"
                               value="${metaVal}"
                               placeholder="0,00" ${inputAttrs} />
                    </td>
                    <td class="cell-saving">${savingTxt}</td>
                    <td class="cell-target">${targetTxt}</td>
                    <td>${consumoTxt}</td>
                    <td class="cell-proj12">${proj12Txt}</td>
                    ${custosCells}
                </tr>
            `;
        }).join("");

        // Bind inputs
        tbodySaving.querySelectorAll(".input-meta").forEach(inp => {
            inp.addEventListener("input", onMetaInput);
        });
    }

    function onMetaInput(e) {
        const inp = e.target;
        const tr  = inp.closest("tr");
        const codigo = tr.dataset.codigo;
        const item = estadoAtual.itens.find(i => i.codigo === codigo);
        if (!item) return;

        const valorStr = inp.value.replace(",", ".").trim();
        let novaMeta = valorStr === "" ? null : Number(valorStr);
        if (novaMeta != null && (!Number.isFinite(novaMeta) || novaMeta < 0 || novaMeta > 100)) {
            inp.classList.add("dirty");
            return;
        }

        // Recalcula saving / target ao vivo
        const custoBase = item.custoBase;
        let savingHtml = '<span class="muted">—</span>';
        let targetHtml = '<span class="muted">—</span>';
        let proj12Html = '<span class="muted">—</span>';
        if (custoBase != null && novaMeta != null && novaMeta > 0) {
            const saving = +(custoBase * (novaMeta / 100)).toFixed(4);
            const target = +(custoBase - saving).toFixed(4);
            savingHtml = `<span class="pos">-${formatBRL(saving)}</span>`;
            targetHtml = `<span class="col-target">${formatBRL(target)}</span>`;
            const c = Number(item.consumoMensal) || 0;
            if (c > 0) {
                const proj = +(saving * c * 12).toFixed(2);
                proj12Html = `<span class="pos" title="${formatBRL(saving)}/un × ${formatNum(c)}/mês × 12">-${formatBRL(proj)}</span>`;
            }
        }
        tr.querySelector(".cell-saving").innerHTML = savingHtml;
        tr.querySelector(".cell-target").innerHTML = targetHtml;
        const proj12Cell = tr.querySelector(".cell-proj12");
        if (proj12Cell) proj12Cell.innerHTML = proj12Html;

        // Marca alteração
        const original = item.metaPct;
        const alterado = !equivalentMeta(original, novaMeta);
        if (alterado) {
            inp.classList.add("dirty");
            estadoAtual.alteracoes[codigo] = novaMeta;
        } else {
            inp.classList.remove("dirty");
            delete estadoAtual.alteracoes[codigo];
        }
        btnSalvarMetas.disabled = Object.keys(estadoAtual.alteracoes).length === 0;
        atualizarTotais();
    }

    function equivalentMeta(a, b) {
        if (a == null && (b == null || b === 0)) return true;
        if (b == null && (a == null || a === 0)) return true;
        if (a == null || b == null) return false;
        return Math.abs(Number(a) - Number(b)) < 0.0001;
    }

    function atualizarTotais() {
        let qtd = 0;
        let somaSaving = 0;
        let somaTarget = 0;
        let somaProj12 = 0;
        for (const it of estadoAtual.itens) {
            const metaVal = (it.codigo in estadoAtual.alteracoes) ? estadoAtual.alteracoes[it.codigo] : it.metaPct;
            if (it.custoBase != null && metaVal != null && metaVal > 0) {
                qtd++;
                const saving = it.custoBase * (metaVal / 100);
                somaSaving += saving;
                somaTarget += (it.custoBase - saving);
                const c = Number(it.consumoMensal) || 0;
                if (c > 0) somaProj12 += saving * c * 12;
            }
        }
        totalItensMeta.textContent = qtd;
        totalSavingUn.textContent  = "-" + formatBRL(somaSaving);
        totalTargetUn.textContent  = formatBRL(somaTarget);
        const elProj = document.getElementById("totalProj12m");
        if (elProj) elProj.textContent = "-" + formatBRL(somaProj12);
        resumoTotais.style.display = "";
    }

    // ----------------------- Salvar Metas -----------------------
    async function salvarMetasAlteradas() {
        const codigosAlterados = Object.keys(estadoAtual.alteracoes);
        if (codigosAlterados.length === 0) return;

        const usuario = localStorage.getItem("userName") || "desconhecido";
        const itens = codigosAlterados
            .map(cod => {
                const it = estadoAtual.itens.find(i => i.codigo === cod);
                if (!it || !it.anoMesBase) return null; // sem custo base não há como calcular saving
                return {
                    codigo: cod,
                    anoMes: estadoAtual.anoMesMeta,  // sempre o mês-meta selecionado
                    metaPct: estadoAtual.alteracoes[cod],
                    custoBase: it.custoBase
                };
            })
            .filter(Boolean);

        if (itens.length === 0) {
            alert("Nenhum item alterado possui Custo Base (NF anterior ao mês-meta). Nada a salvar.");
            return;
        }

        btnSalvarMetas.disabled = true;
        btnSalvarMetas.innerHTML = `<i class="fa fa-spinner fa-spin"></i> Salvando...`;
        try {
            const resp = await fetch("/api/embalagem/relatorios?acao=savingSaveMetasBatch", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ itens, usuario })
            });
            if (!resp.ok) {
                const e = await resp.json().catch(() => ({}));
                throw new Error(e.message || `HTTP ${resp.status}`);
            }
            const data = await resp.json();
            alert(`Metas salvas: ${data.salvos || 0} | removidas: ${data.removidos || 0}`);
            // Invalida cache do indicador para refletir mudanças
            resumoMesesCache = null;
            detalhesCache = {};
            // Recarrega planejamento
            await carregarSaving();
        } catch (err) {
            console.error("Erro ao salvar metas:", err);
            alert("Erro ao salvar metas: " + err.message);
        } finally {
            btnSalvarMetas.innerHTML = `<i class="fa fa-save"></i> Salvar Metas Alteradas`;
            btnSalvarMetas.disabled = Object.keys(estadoAtual.alteracoes).length === 0;
        }
    }

    // ----------------------- Indicador (lista de meses) -----------------------
    async function carregarResumoMeses(force = false) {
        if (resumoMesesCache && !force) {
            renderizarResumoMeses();
            return;
        }
        tbodyResumoMeses.innerHTML = `<tr><td class="loading" colspan="7"><i class="fa fa-spinner fa-spin"></i> Carregando...</td></tr>`;
        try {
            const resp = await fetch(`/api/embalagem/relatorios?acao=savingResumoMeses`);
            if (!resp.ok) {
                const e = await resp.json().catch(() => ({}));
                throw new Error(e.message || `HTTP ${resp.status}`);
            }
            const data = await resp.json();
            resumoMesesCache = data.meses || [];
            detalhesCache = {};
            renderizarResumoMeses();
        } catch (err) {
            console.error("Erro ao carregar resumo:", err);
            tbodyResumoMeses.innerHTML = `<tr><td class="empty" colspan="8" style="color:#c62828;">Erro: ${err.message}</td></tr>`;
        }
    }

    function renderizarResumoMeses() {
        if (!resumoMesesCache || resumoMesesCache.length === 0) {
            tbodyResumoMeses.innerHTML = `<tr><td class="empty" colspan="8">Nenhuma meta cadastrada ainda.</td></tr>`;
            return;
        }
        tbodyResumoMeses.innerHTML = resumoMesesCache.map(m => {
            const planTxt = `<span class="pos">-${formatBRL(m.planejado)}</span>`;
            let realTxt;
            if (m.realizado >= 0) {
                realTxt = `<span class="pos">-${formatBRL(Math.abs(m.realizado))}</span>`;
            } else {
                realTxt = `<span class="neg">+${formatBRL(Math.abs(m.realizado))}</span>`;
            }
            let realMesTxt;
            const rMes = Number(m.realizadoMes) || 0;
            const qMes = Number(m.qtdCompradaMes) || 0;
            if (qMes <= 0) {
                realMesTxt = '<span class="muted">sem compra</span>';
            } else if (rMes >= 0) {
                realMesTxt = `<span class="pos" title="Qtd comprada no mês: ${formatNum(qMes)}">-${formatBRL(rMes)}</span>`;
            } else {
                realMesTxt = `<span class="neg" title="Qtd comprada no mês: ${formatNum(qMes)}">+${formatBRL(Math.abs(rMes))}</span>`;
            }
            let proj12Txt;
            if (m.projetado12m > 0) {
                proj12Txt = `<span class="pos">-${formatBRL(m.projetado12m)}</span>`;
            } else {
                proj12Txt = '<span class="muted">—</span>';
            }
            const atingTxt = m.atingimentoPct != null
                ? `<span class="${m.atingimentoPct >= 100 ? "pos" : m.atingimentoPct >= 50 ? "" : "neg"}">${m.atingimentoPct.toFixed(1)}%</span>`
                : '<span class="muted">—</span>';
            return `
                <tr class="mes-row" data-anomes="${m.anoMes}">
                    <td class="col-mes">
                        <span class="toggle-icon">▶</span>
                        <strong style="color:#1976d2;">${labelMes(m.anoMes)}</strong>
                    </td>
                    <td>${m.qtdMetas}</td>
                    <td>${m.qtdComNf} / ${m.qtdMetas}</td>
                    <td>${planTxt}</td>
                    <td>${realTxt}</td>
                    <td>${realMesTxt}</td>
                    <td>${proj12Txt}</td>
                    <td>${atingTxt}</td>
                </tr>
            `;
        }).join("");

        tbodyResumoMeses.querySelectorAll("tr.mes-row").forEach(tr => {
            tr.addEventListener("click", () => toggleDetalhesMes(tr));
        });
    }

    async function toggleDetalhesMes(tr) {
        const ym = tr.dataset.anomes;
        const proximo = tr.nextElementSibling;
        if (proximo && proximo.classList.contains("detalhes-row") && proximo.dataset.anomes === ym) {
            // Já está expandido — colapsa
            proximo.remove();
            tr.classList.remove("expanded");
            return;
        }
        // Colapsa qualquer outro aberto
        tbodyResumoMeses.querySelectorAll("tr.detalhes-row").forEach(r => r.remove());
        tbodyResumoMeses.querySelectorAll("tr.mes-row.expanded").forEach(r => r.classList.remove("expanded"));

        tr.classList.add("expanded");
        const detRow = document.createElement("tr");
        detRow.className = "detalhes-row";
        detRow.dataset.anomes = ym;
        detRow.innerHTML = `<td colspan="8"><div class="detalhes-inner"><i class="fa fa-spinner fa-spin"></i> Carregando itens de ${labelMes(ym)}...</div></td>`;
        tr.after(detRow);

        try {
            let data = detalhesCache[ym];
            if (!data) {
                const resp = await fetch(`/api/embalagem/relatorios?acao=savingIndicador&anoMes=${encodeURIComponent(ym)}`);
                if (!resp.ok) {
                    const e = await resp.json().catch(() => ({}));
                    throw new Error(e.message || `HTTP ${resp.status}`);
                }
                data = await resp.json();
                detalhesCache[ym] = data;
            }
            renderizarDetalhesMes(detRow, ym, data);
        } catch (err) {
            console.error("Erro ao carregar detalhes:", err);
            detRow.querySelector(".detalhes-inner").innerHTML =
                `<span style="color:#c62828;">Erro: ${err.message}</span>`;
        }
    }

    function renderizarDetalhesMes(detRow, ym, data) {
        if (!data.itens || data.itens.length === 0) {
            detRow.querySelector(".detalhes-inner").innerHTML =
                `<em>Sem itens para ${labelMes(ym)}.</em>`;
            return;
        }
        const rows = data.itens.map(it => {
            const planTxt = it.savingPlanejado != null ? `<span class="pos">-${formatBRL(it.savingPlanejado)}</span>` : '—';
            let realTxt = '<span class="muted">sem NF</span>';
            if (it.savingRealizado != null) {
                const cls = it.savingRealizado >= 0 ? "pos" : "neg";
                const sinal = it.savingRealizado >= 0 ? "-" : "+";
                realTxt = `<span class="${cls}">${sinal}${formatBRL(Math.abs(it.savingRealizado))}</span>`;
            }
            const qtdMes = Number(it.qtdCompradaMes) || 0;
            const qtdMesTxt = qtdMes > 0 ? formatNum(qtdMes) : '<span class="muted">0</span>';
            let realMesTxt = '<span class="muted">—</span>';
            if (it.savingRealizadoMes != null && qtdMes > 0) {
                const cls = it.savingRealizadoMes >= 0 ? "pos" : "neg";
                const sinal = it.savingRealizadoMes >= 0 ? "-" : "+";
                realMesTxt = `<span class="${cls}" title="${formatBRL(Math.abs(it.savingRealizado))}/un × ${formatNum(qtdMes)} un">${sinal}${formatBRL(Math.abs(it.savingRealizadoMes))}</span>`;
            }
            const consumoTxt = (it.consumoMensal != null && Number(it.consumoMensal) > 0)
                ? formatNum(it.consumoMensal) : '<span class="muted">—</span>';
            let proj12Txt = '<span class="muted">—</span>';
            if (it.savingProjetado12m != null) {
                proj12Txt = `<span class="pos">-${formatBRL(it.savingProjetado12m)}</span>`;
            }
            let real12Txt = '<span class="muted">—</span>';
            if (it.savingRealizado12m != null) {
                const cls = it.savingRealizado12m >= 0 ? "pos" : "neg";
                const sinal = it.savingRealizado12m >= 0 ? "-" : "+";
                real12Txt = `<span class="${cls}">${sinal}${formatBRL(Math.abs(it.savingRealizado12m))}</span>`;
            }
            const atingTxt = it.atingimentoPct != null
                ? `<span class="${it.atingimentoPct >= 100 ? "pos" : it.atingimentoPct >= 50 ? "" : "neg"}">${it.atingimentoPct.toFixed(1)}%</span>`
                : '<span class="muted">—</span>';
            return `
                <tr>
                    <td class="col-item"><strong>${escapeHtml(it.codigo)}</strong> <span style="color:#666;font-weight:400;">${escapeHtml(it.descricao || "")}</span></td>
                    <td>${it.metaPct.toFixed(2)}%</td>
                    <td>${it.custoBase != null ? formatBRL(it.custoBase) : '—'}</td>
                    <td>${it.custoReal != null ? formatBRL(it.custoReal) : '<span class="muted">sem NF</span>'}</td>
                    <td>${planTxt}</td>
                    <td>${realTxt}</td>
                    <td>${qtdMesTxt}</td>
                    <td>${realMesTxt}</td>
                    <td>${consumoTxt}</td>
                    <td>${proj12Txt}</td>
                    <td>${real12Txt}</td>
                    <td>${atingTxt}</td>
                </tr>
            `;
        }).join("");
        detRow.querySelector(".detalhes-inner").innerHTML = `
            <table>
                <thead>
                    <tr>
                        <th class="col-item">Item</th>
                        <th>Meta %</th>
                        <th>Custo Base</th>
                        <th>Custo Real (${labelMes(ym)})</th>
                        <th>Saving Planejado /un</th>
                        <th>Saving Realizado /un</th>
                        <th title="Quantidade comprada DENTRO do mês da meta">Qtd Comprada (${labelMes(ym)})</th>
                        <th title="Saving realizado /un × qtd comprada no mês — ganho REAL deste mês">Realizado Mês R$</th>
                        <th title="Consumo médio mensal (últimos 365 dias)">Consumo /mês</th>
                        <th title="Saving R$/un × consumo × 12">Projetado 12m</th>
                        <th title="Realizado R$/un × consumo × 12">Realizado 12m</th>
                        <th>Atingimento %</th>
                    </tr>
                </thead>
                <tbody>${rows}</tbody>
            </table>
        `;
    }

    // ----------------------- Utils -----------------------
    function toIsoDate(d) {
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, "0");
        const dd = String(d.getDate()).padStart(2, "0");
        return `${y}-${m}-${dd}`;
    }

    function labelMes(ym) {
        if (!ym) return "—";
        const [y, m] = ym.split("-").map(Number);
        const d = new Date(y, m - 1, 1);
        return d.toLocaleDateString("pt-BR", { month: "short", year: "2-digit" }).replace(".", "");
    }

    function formatBRL(v, casas = 4) {
        if (v == null || !Number.isFinite(Number(v))) return "—";
        return Number(v).toLocaleString("pt-BR", {
            style: "currency", currency: "BRL",
            minimumFractionDigits: casas, maximumFractionDigits: casas
        });
    }

    function formatNum(v, casas = 2) {
        if (v == null || !Number.isFinite(Number(v))) return "—";
        return Number(v).toLocaleString("pt-BR", {
            minimumFractionDigits: casas, maximumFractionDigits: casas
        });
    }

    function escapeHtml(s) {
        if (s == null) return "";
        return String(s)
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#39;");
    }
});
