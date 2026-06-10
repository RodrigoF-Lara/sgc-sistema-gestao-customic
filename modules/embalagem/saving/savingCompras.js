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
    const theadSaving      = document.getElementById("theadSaving");
    const tbodySaving      = document.getElementById("tbodySaving");
    const ancoraInfo       = document.getElementById("ancoraInfo");
    const resumoTotais     = document.getElementById("resumoTotais");
    const totalItensMeta   = document.getElementById("totalItensMeta");
    const totalSavingUn    = document.getElementById("totalSavingUn");
    const totalTargetUn    = document.getElementById("totalTargetUn");

    const tabs             = document.querySelectorAll(".tab");
    const anoMesIndicador  = document.getElementById("anoMesIndicador");
    const btnCarregarIndicador = document.getElementById("btnCarregarIndicador");
    const tbodyIndicador   = document.getElementById("tbodyIndicador");
    const indicadorInfo    = document.getElementById("indicadorInfo");
    const resumoIndicador  = document.getElementById("resumoIndicador");
    const indTotPlan       = document.getElementById("indTotPlan");
    const indTotReal       = document.getElementById("indTotReal");
    const indTotAting      = document.getElementById("indTotAting");

    // Estado em memória
    let estadoAtual = {
        anoMesMeta: null,
        meses: [],
        itens: [],       // itens originais
        alteracoes: {}   // { codigo: novaMeta }
    };

    // ----------------------- Inicialização -----------------------
    inicializarPeriodoDefault();
    bindEventos();
    inicializarMesIndicadorDefault();

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

    function inicializarMesIndicadorDefault() {
        const hoje = new Date();
        const ano  = hoje.getFullYear();
        // Default: mês anterior (já fechado). Se janeiro, vai para dez do ano anterior.
        const m = hoje.getMonth(); // 0-11
        const anoIdx = m === 0 ? ano - 1 : ano;
        const mesIdx = m === 0 ? 12 : m;
        anoMesIndicador.value = `${anoIdx}-${String(mesIdx).padStart(2, "0")}`;
    }

    function bindEventos() {
        btnAplicar.addEventListener("click", carregarSaving);
        btnSalvarMetas.addEventListener("click", salvarMetasAlteradas);

        tabs.forEach(t => t.addEventListener("click", () => trocarTab(t.dataset.tab)));

        btnCarregarIndicador.addEventListener("click", carregarIndicador);
    }

    function trocarTab(tabName) {
        tabs.forEach(t => t.classList.toggle("active", t.dataset.tab === tabName));
        document.getElementById("tab-planejamento").style.display = (tabName === "planejamento") ? "" : "none";
        document.getElementById("tab-indicador").style.display    = (tabName === "indicador")    ? "" : "none";
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

        tbodySaving.innerHTML = `<tr><td class="loading" colspan="10"><i class="fa fa-spinner fa-spin"></i> Carregando...</td></tr>`;
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
            tbodySaving.innerHTML = `<tr><td class="empty" colspan="10" style="color:#c62828;">Erro: ${err.message}</td></tr>`;
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
        const meses = estadoAtual.meses;

        // Cabeçalho (sem ★ fixo — o destaque é por linha)
        const ths = [
            `<th class="col-item">Item</th>`,
            `<th>Mês Base</th>`,
            `<th>Meta %</th>`,
            `<th>Saving R$/un</th>`,
            `<th>Custo Target</th>`,
            ...meses.map(m => `<th title="${m.anoMes}">${m.label}</th>`)
        ];
        theadSaving.innerHTML = `<tr>${ths.join("")}</tr>`;

        // Corpo
        if (estadoAtual.itens.length === 0) {
            tbodySaving.innerHTML = `<tr><td class="empty" colspan="${5 + meses.length}">Nenhum item curva A encontrado.</td></tr>`;
            return;
        }

        tbodySaving.innerHTML = estadoAtual.itens.map(it => {
            const custosCells = meses.map(m => {
                const v = it.custos[m.anoMes];
                const isAncora = m.anoMes === it.anoMesBase;
                const cls = `mes-cell${isAncora ? " col-base" : ""}`;
                const star = isAncora ? ' <span title="Mês-base deste item" style="color:#1976d2;">★</span>' : '';
                return `<td class="${cls}">${v != null ? formatBRL(v) + star : '<span class="muted">—</span>'}</td>`;
            }).join("");

            const metaVal = it.metaPct != null ? Number(it.metaPct).toFixed(2) : "";
            const savingTxt = it.savingValor != null
                ? `<span class="neg">-${formatBRL(it.savingValor)}</span>` : '<span class="muted">—</span>';
            const targetTxt = it.custoTarget != null
                ? `<span class="col-target">${formatBRL(it.custoTarget)}</span>` : '<span class="muted">—</span>';
            const baseTxt = it.anoMesBase
                ? `<strong style="color:#1976d2;">${labelMes(it.anoMesBase)}</strong>`
                : '<span class="muted">sem NF</span>';

            const semBase = it.anoMesBase == null;
            const inputAttrs = semBase ? 'disabled title="Sem NF no período — não é possível cadastrar meta"' : '';

            return `
                <tr data-codigo="${it.codigo}" data-anomesbase="${it.anoMesBase || ''}">
                    <td class="col-item">
                        <strong>${escapeHtml(it.codigo)}</strong>
                        <span style="color:#666;font-weight:400;"> ${escapeHtml(it.descricao || "")}</span>
                    </td>
                    <td>${baseTxt}</td>
                    <td class="col-meta">
                        <input type="number" step="0.01" min="0" max="100"
                               class="input-meta" value="${metaVal}"
                               placeholder="0,00" ${inputAttrs} />
                    </td>
                    <td class="cell-saving">${savingTxt}</td>
                    <td class="cell-target">${targetTxt}</td>
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
        if (custoBase != null && novaMeta != null && novaMeta > 0) {
            const saving = +(custoBase * (novaMeta / 100)).toFixed(4);
            const target = +(custoBase - saving).toFixed(4);
            savingHtml = `<span class="neg">-${formatBRL(saving)}</span>`;
            targetHtml = `<span class="col-target">${formatBRL(target)}</span>`;
        }
        tr.querySelector(".cell-saving").innerHTML = savingHtml;
        tr.querySelector(".cell-target").innerHTML = targetHtml;

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
        for (const it of estadoAtual.itens) {
            const metaVal = (it.codigo in estadoAtual.alteracoes) ? estadoAtual.alteracoes[it.codigo] : it.metaPct;
            if (it.custoBase != null && metaVal != null && metaVal > 0) {
                qtd++;
                const saving = it.custoBase * (metaVal / 100);
                somaSaving += saving;
                somaTarget += (it.custoBase - saving);
            }
        }
        totalItensMeta.textContent = qtd;
        totalSavingUn.textContent  = "-" + formatBRL(somaSaving);
        totalTargetUn.textContent  = formatBRL(somaTarget);
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
            // Recarrega para refletir
            await carregarSaving();
        } catch (err) {
            console.error("Erro ao salvar metas:", err);
            alert("Erro ao salvar metas: " + err.message);
        } finally {
            btnSalvarMetas.innerHTML = `<i class="fa fa-save"></i> Salvar Metas Alteradas`;
            btnSalvarMetas.disabled = Object.keys(estadoAtual.alteracoes).length === 0;
        }
    }

    // ----------------------- Indicador -----------------------
    async function carregarIndicador() {
        const ym = anoMesIndicador.value;
        if (!ym) {
            alert("Informe o mês-âncora.");
            return;
        }
        tbodyIndicador.innerHTML = `<tr><td class="loading" colspan="7"><i class="fa fa-spinner fa-spin"></i> Carregando...</td></tr>`;
        resumoIndicador.style.display = "none";

        try {
            const resp = await fetch(`/api/embalagem/relatorios?acao=savingIndicador&anoMes=${encodeURIComponent(ym)}`);
            if (!resp.ok) {
                const e = await resp.json().catch(() => ({}));
                throw new Error(e.message || `HTTP ${resp.status}`);
            }
            const data = await resp.json();

            indicadorInfo.innerHTML = `
                Comparando o custo praticado em <strong>${labelMes(data.anoMes)}</strong>
                vs o Custo Base cadastrado para a meta desse mês.
            `;

            if (!data.itens || data.itens.length === 0) {
                tbodyIndicador.innerHTML = `<tr><td class="empty" colspan="7">Nenhuma meta cadastrada para esse mês.</td></tr>`;
                return;
            }

            tbodyIndicador.innerHTML = data.itens.map(it => {
                const planTxt = it.savingPlanejado != null ? `<span class="neg">-${formatBRL(it.savingPlanejado)}</span>` : '—';
                let realTxt = '<span class="muted">sem NF</span>';
                if (it.savingRealizado != null) {
                    const cls = it.savingRealizado >= 0 ? "neg" : "pos";
                    const sinal = it.savingRealizado >= 0 ? "-" : "+";
                    realTxt = `<span class="${cls}">${sinal}${formatBRL(Math.abs(it.savingRealizado))}</span>`;
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
                        <td>${atingTxt}</td>
                    </tr>
                `;
            }).join("");

            const t = data.totais || {};
            indTotPlan.textContent = "-" + formatBRL(t.planejado || 0);
            const realSign = (t.realizado || 0) >= 0 ? "-" : "+";
            indTotReal.textContent = realSign + formatBRL(Math.abs(t.realizado || 0));
            indTotReal.className = "valor " + ((t.realizado || 0) >= 0 ? "neg" : "pos");
            indTotAting.textContent = t.atingimentoPct != null ? `${t.atingimentoPct.toFixed(1)}%` : "—";
            indTotAting.className = "valor " + (t.atingimentoPct != null && t.atingimentoPct >= 100 ? "pos" : "");
            resumoIndicador.style.display = "";
        } catch (err) {
            console.error("Erro ao carregar indicador:", err);
            tbodyIndicador.innerHTML = `<tr><td class="empty" colspan="7" style="color:#c62828;">Erro: ${err.message}</td></tr>`;
        }
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

    function formatBRL(v) {
        if (v == null || !Number.isFinite(Number(v))) return "—";
        return Number(v).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
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
