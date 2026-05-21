// ============================================================
// lancamentoNF.js — Frontend para Lançamento de NF
// ============================================================

/* ── Estado da aplicação ────────────────────────────────── */
const state = {
    idNF:         null,
    numNF:        null,
    codForn:      null,
    razaoSocial:  null,
    tipoForn:     null,
    statusNF:     null,
    prodSelecionado: null,   // linha selecionada na tabs de produtos
    produtos:       [],      // lista carregada da NF ativa
};

/* ── Helpers ────────────────────────────────────────────── */
const $ = id => document.getElementById(id);
const v = id => ($( id)?.value ?? "").trim();
const n = id => parseFloat(v(id)) || 0;
const usuario = () => localStorage.getItem("userName") || "WEB";
const moeda = val => val == null ? "—" : Number(val).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const num4 = val => (Number(val) || 0).toFixed(4);
const dtStr = iso => iso ? iso.split("T")[0].split("-").reverse().join("/") : "—";

function showToast(msg, tipo = "success") {
    const el = document.createElement("div");
    el.textContent = msg;
    Object.assign(el.style, {
        position: "fixed", bottom: "24px", right: "24px", zIndex: 9999,
        padding: "12px 22px", borderRadius: "8px", fontWeight: "700",
        background: tipo === "success" ? "#28a745" : tipo === "warn" ? "#fd7e14" : "#dc3545",
        color: "#fff", boxShadow: "0 4px 16px rgba(0,0,0,.25)", fontSize: "14px",
    });
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 3500);
}

async function apiFetch(url, opts) {
    const resp = await fetch(url, opts);
    const data = await resp.json();
    if (!resp.ok) throw new Error(data.message || "Erro desconhecido");
    return data;
}

/* ── Tabs ───────────────────────────────────────────────── */
document.querySelectorAll(".nf-tab-btn").forEach(btn => {
    btn.addEventListener("click", () => {
        document.querySelectorAll(".nf-tab-btn").forEach(b => b.classList.remove("active"));
        document.querySelectorAll(".nf-tab-panel").forEach(p => p.classList.remove("active"));
        btn.classList.add("active");
        document.getElementById("tab-" + btn.dataset.tab).classList.add("active");

        if (btn.dataset.tab === "produtos" && state.idNF) carregarProdutos();
    });
});

/* ── Sincroniza tipo de fornecedor ──────────────────────── */
$("tipo-forn").addEventListener("change", () => {
    const tipo = $("tipo-forn").value;
    $("aliquota").disabled = tipo !== "SIMPLES NACIONAL";
    state.tipoForn = tipo;
});

/* ═══════════════════════════════════════════════════════════
   ABA 1 — DADOS GERAIS
═══════════════════════════════════════════════════════════ */

/* --- Busca fornecedor ------------------------------------- */
$("btn-buscar-forn").addEventListener("click", buscarFornecedor);
$("cod-forn").addEventListener("keydown", e => { if (e.key === "Enter") buscarFornecedor(); });

async function buscarFornecedor() {
    const cod = v("cod-forn");
    if (!cod) return showToast("Informe o código do fornecedor.", "error");
    try {
        const data = await apiFetch(`/api/lancamentoNF?action=buscar_fornecedor&cod=${encodeURIComponent(cod)}`);
        $("razao-social").value = data.RAZAO_SOCIAL;
        state.codForn = data.COD_FORNECEDOR;
        state.razaoSocial = data.RAZAO_SOCIAL;
        if (data.TIPO_FORN) {
            $("tipo-forn").value = data.TIPO_FORN;
            state.tipoForn = data.TIPO_FORN;
            $("aliquota").disabled = data.TIPO_FORN !== "SIMPLES NACIONAL";
        }
        await carregarNFsFornecedor(cod);
    } catch (e) {
        showToast(e.message, "error");
        $("razao-social").value = "";
        state.codForn = null;
    }
}

async function carregarNFsFornecedor(cod) {
    const data = await apiFetch(`/api/lancamentoNF?action=nfs_fornecedor&cod=${encodeURIComponent(cod)}`);
    const sel = $("sel-nf-existente");
    sel.innerHTML = '<option value="">-- Nova NF --</option>';
    data.forEach(nf => {
        const opt = document.createElement("option");
        opt.value = nf.CAB_ID_NF;
        opt.textContent = `NF ${nf.CAB_NUM_NF} [${nf.CAB_STATUS}]`;
        sel.appendChild(opt);
    });
}

$("sel-nf-existente").addEventListener("change", async () => {
    const idNF = $("sel-nf-existente").value;
    if (!idNF) { limparEstadoNF(); return; }
    await carregarCabecalho(Number(idNF));
});

async function carregarCabecalho(idNF) {
    try {
        const data = await apiFetch(`/api/lancamentoNF?action=cabecalho&id_nf=${idNF}`);
        $("num-nf").value          = data.CAB_NUM_NF || "";
        $("pedido-compra").value   = data.CAB_PC || "";
        $("qnt-total-itens").value = data.CAB_QNT_TOTAL_ITENS || 0;
        $("tipo-forn").value       = data.CAB_TP_FORN || "";
        $("aliquota").value        = data.CAB_ALIQUOTA || 0;
        $("aliquota").disabled     = data.CAB_TP_FORN !== "SIMPLES NACIONAL";
        $("dt-emissao").value      = data.CAB_DT_EMISSAO ? data.CAB_DT_EMISSAO.split("T")[0] : "";
        $("dt-receb").value        = data.CAB_DT_RECEB ? data.CAB_DT_RECEB.split("T")[0] : "";
        $("cab-bc-icms").value     = data.CAB_BC_ICMS || 0;
        $("cab-icms").value        = data.CAB_ICMS || 0;
        $("cab-st").value          = data.CAB_ST || 0;
        $("cab-frete").value       = data.CAB_FRETE || 0;
        $("cab-desconto").value    = data.CAB_DESCONTO || 0;
        $("cab-ipi").value         = data.CAB_IPI || 0;
        $("cab-valor-prod").value  = data.CAB_VALOR_PROD || 0;
        $("cab-valor-total-nf").value = data.CAB_VALOR_TT_NF || 0;

        state.idNF        = data.CAB_ID_NF;
        state.numNF       = data.CAB_NUM_NF;
        state.tipoForn    = data.CAB_TP_FORN;
        state.statusNF    = data.CAB_STATUS;

        atualizarBadgeNFAtiva();
    } catch (e) {
        showToast(e.message, "error");
    }
}

function atualizarBadgeNFAtiva() {
    if (!state.idNF) { $("nf-ativa-info").style.display = "none"; return; }
    $("nf-ativa-info").style.display = "block";
    $("nf-ativa-num").textContent = state.numNF;
    $("nf-ativa-forn").textContent = state.razaoSocial || state.codForn || "—";
    const badge = $("nf-ativa-status-badge");
    badge.innerHTML = `<span class="nf-status ${(state.statusNF || "").replace(/[^A-Z]/g, "")}">${state.statusNF || ""}</span>`;
}

function limparEstadoNF() {
    state.idNF = state.numNF = state.codForn = state.statusNF = null;
    state.produtos = [];
    $("nf-ativa-info").style.display = "none";
    $("tbProdBody").innerHTML = `<tr><td colspan="11" style="text-align:center;color:#999;">Nenhum produto.</td></tr>`;
}

/* --- Lançar NF (criar cabeçalho) ------------------------- */
$("btn-lancar-nf").addEventListener("click", async () => {
    const btn = $("btn-lancar-nf");

    if (!state.codForn) return showToast("Busque um fornecedor primeiro.", "error");
    if (!v("num-nf"))   return showToast("Número da NF é obrigatório.", "error");
    if (!v("tipo-forn")) return showToast("Tipo de fornecedor é obrigatório.", "error");

    btn.disabled = true;
    btn.textContent = "⏳ Aguarde...";

    try {
        const body = {
            cod_forn:      state.codForn,
            num_nf:        v("num-nf"),
            qnt_itens:     n("qnt-total-itens"),
            pedido_compra: v("pedido-compra"),
            razao:         $("razao-social").value,
            dt_emissao:    v("dt-emissao"),
            dt_receb:      v("dt-receb"),
            tipo_forn:     v("tipo-forn"),
            aliquota:      n("aliquota"),
            bc_icms:       n("cab-bc-icms"),
            icms:          n("cab-icms"),
            st:            n("cab-st"),
            frete:         n("cab-frete"),
            desconto:      n("cab-desconto"),
            ipi:           n("cab-ipi"),
            valor_prod:    n("cab-valor-prod"),
            valor_total_nf: n("cab-valor-total-nf"),
            usuario:       usuario(),
        };

        const resp = await apiFetch("/api/lancamentoNF?action=criar_cabecalho", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
        });

        state.idNF     = resp.id_nf;
        state.numNF    = v("num-nf");
        state.tipoForn = v("tipo-forn");
        state.statusNF = "ABERTA";
        atualizarBadgeNFAtiva();
        await carregarNFsFornecedor(state.codForn);
        $("sel-nf-existente").value = resp.id_nf;

        showToast(`NF ${state.numNF} criada! ID: ${resp.id_nf}`);
    } catch (e) {
        // Se NF já existe (409), oferece navegar até ela
        if (e.message.includes("já cadastrada")) {
            showToast("NF já existente. Selecione no combo acima.", "warn");
        } else {
            showToast(e.message, "error");
        }
    } finally {
        btn.disabled = false;
        btn.innerHTML = '<i class="fa fa-save"></i> Lançar NF';
    }
});

/* --- Excluir NF ----------------------------------------- */
$("btn-excluir-nf").addEventListener("click", async () => {
    if (!state.idNF) return;
    if (!confirm(`Excluir NF ${state.numNF} e todos os seus produtos? Esta ação não pode ser desfeita.`)) return;

    try {
        await apiFetch("/api/lancamentoNF?action=excluir_nf", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ id_nf: state.idNF, num_nf: state.numNF }),
        });
        showToast("NF excluída com sucesso.");
        limparEstadoNF();
        if (state.codForn) await carregarNFsFornecedor(state.codForn);
    } catch (e) {
        showToast(e.message, "error");
    }
});

/* ═══════════════════════════════════════════════════════════
   ABA 2 — PRODUTOS
═══════════════════════════════════════════════════════════ */

/* --- Busca produto ao sair do campo código --------------- */
$("prod-codigo").addEventListener("blur", buscarProduto);
$("prod-codigo").addEventListener("keydown", e => { if (e.key === "Enter") buscarProduto(); });

async function buscarProduto() {
    const cod = v("prod-codigo");
    if (!cod) return;
    try {
        const data = await apiFetch(`/api/lancamentoNF?action=saldo_produto&codigo=${encodeURIComponent(cod)}`);
        $("prod-descricao").value = data.descricao;
        $("prod-saldo").value = data.saldo;

        // Se houver custo anterior preenche os campos de custo
        if (data.custo) {
            state._custoAtual = data.custo;
        } else {
            state._custoAtual = null;
        }

        // Distribui frete automaticamente
        calcularFreteLinha();
    } catch (e) {
        $("prod-descricao").value = "Produto não encontrado";
        $("prod-saldo").value = 0;
    }
}

/* --- Auto-cálculo unit ↔ total --------------------------- */
function bindUnitTotal(idUnit, idTotal) {
    $(idUnit).addEventListener("change", () => {
        const qnt = n("prod-qnt");
        if (qnt) $(idTotal).value = num4(n(idUnit) * qnt);
    });
    $(idTotal).addEventListener("change", () => {
        const qnt = n("prod-qnt");
        if (qnt) $(idUnit).value = num4(n(idTotal) / qnt);
    });
}
bindUnitTotal("prod-valor-unit",     "prod-valor-total");
bindUnitTotal("prod-ipi-unit",       "prod-ipi");
bindUnitTotal("prod-icms-unit",      "prod-icms");
bindUnitTotal("prod-st-unit",        "prod-st");
bindUnitTotal("prod-frete-unit",     "prod-frete");
bindUnitTotal("prod-desc-unit",      "prod-desconto");
bindUnitTotal("prod-bc-icms-unit",   "prod-bc-icms");
bindUnitTotal("prod-import-unit",    "prod-import-linha");

/* Quando QNT muda, recalcula todos os totais sobre unit */
$("prod-qnt").addEventListener("change", () => {
    const qnt = n("prod-qnt");
    ["prod-valor-unit","prod-ipi-unit","prod-icms-unit","prod-st-unit",
     "prod-frete-unit","prod-desc-unit","prod-bc-icms-unit","prod-import-unit"].forEach(uid => {
        const totalId = uid.replace("-unit", "").replace("prod-valor","prod-valor-total")
            .replace("prod-ipi","prod-ipi")
            .replace("prod-icms","prod-icms")
            .replace("prod-st","prod-st")
            .replace("prod-frete","prod-frete")
            .replace("prod-desc","prod-desconto")
            .replace("prod-bc-icms","prod-bc-icms")
            .replace("prod-import","prod-import-linha");
        // Simples par de campos
        const mapUnit = {
            "prod-valor-unit":   "prod-valor-total",
            "prod-ipi-unit":     "prod-ipi",
            "prod-icms-unit":    "prod-icms",
            "prod-st-unit":      "prod-st",
            "prod-frete-unit":   "prod-frete",
            "prod-desc-unit":    "prod-desconto",
            "prod-bc-icms-unit": "prod-bc-icms",
            "prod-import-unit":  "prod-import-linha",
        };
        const tidKey = mapUnit[uid];
        if (tidKey) $(tidKey).value = num4(n(uid) * qnt);
    });
    calcularFreteLinha();
});

function calcularFreteLinha() {
    const qnt = n("prod-qnt");
    const qntTotal = n("qnt-total-itens");
    const freteNF  = n("cab-frete");
    if (qntTotal > 0 && qnt > 0) {
        const freteUnit  = freteNF / qntTotal;
        const freteLinha = freteUnit * qnt;
        $("prod-frete-unit").value = num4(freteUnit);
        $("prod-frete").value      = num4(freteLinha);
    }
}

/* --- Custos médios automáticos --------------------------- */
function calcularCustosMedios() {
    const saldo = n("prod-saldo");
    const qnt   = n("prod-qnt");
    const custo = state._custoAtual;

    const custoContAtual = custo?.PROD_CUSTO_CONTABIL_MEDIO_NOVO || 0;
    const custoFiscAtual = custo?.PROD_CUSTO_FISCAL_MEDIO_NOVO || 0;
    const valorUnit      = n("prod-valor-unit");
    const ipiUnit        = n("prod-ipi-unit");
    const icmsUnit       = n("prod-icms-unit");
    const freteUnit      = n("prod-frete-unit");
    const descUnit       = n("prod-desc-unit");
    const pis_c          = 0.0065;
    const cofins_c       = 0.03;

    // Custo contábil novo = médio atual de entradas (simplificado: igual ao valor de compra)
    const custoContNovo = valorUnit ? (qnt + saldo) > 0
        ? ((custoContAtual * saldo) + (valorUnit * qnt)) / (saldo + qnt)
        : valorUnit
        : custoContAtual;

    // Custo fiscal novo = similar incluindo impostos recuperáveis
    const custoFiscNovo = valorUnit ? (qnt + saldo) > 0
        ? ((custoFiscAtual * saldo) + ((valorUnit + ipiUnit + freteUnit - descUnit) * qnt)) / (saldo + qnt)
        : valorUnit
        : custoFiscAtual;

    return {
        custo_contabil:              valorUnit,
        custo_fiscal:                valorUnit + ipiUnit + freteUnit - descUnit,
        custo_pago:                  valorUnit,
        custo_contabil_medio_atual:  custoContAtual,
        custo_fiscal_medio_atual:    custoFiscAtual,
        custo_contabil_medio_novo:   parseFloat(custoContNovo.toFixed(4)),
        custo_fiscal_medio_novo:     parseFloat(custoFiscNovo.toFixed(4)),
    };
}

/* --- Inserir produto ------------------------------------- */
$("btn-inserir-prod").addEventListener("click", async () => {
    if (!state.idNF) return showToast("Crie ou selecione uma NF primeiro (aba Dados Gerais).", "error");
    if (!v("prod-codigo")) return showToast("Informe o código do produto.", "error");
    if (!v("prod-finalidade")) return showToast("Selecione a finalidade.", "error");

    const btn = $("btn-inserir-prod");
    btn.disabled = true; btn.textContent = "⏳ Inserindo...";

    try {
        const custos = calcularCustosMedios();
        const body = {
            action:   "inserir_produto",
            id_nf:    state.idNF,
            num_nf:   state.numNF,
            usuario:  usuario(),
            codigo:   v("prod-codigo"),
            qnt:      n("prod-qnt"),
            valor_unit:          n("prod-valor-unit"),
            valor_total:         n("prod-valor-total"),
            ipi_unit:            n("prod-ipi-unit"),
            ipi:                 n("prod-ipi"),
            icms_unit:           n("prod-icms-unit"),
            icms:                n("prod-icms"),
            st_unit:             n("prod-st-unit"),
            st:                  n("prod-st"),
            frete_unit:          n("prod-frete-unit"),
            frete:               n("prod-frete"),
            desconto_unit:       n("prod-desc-unit"),
            desconto:            n("prod-desconto"),
            bc_icms_unit:        n("prod-bc-icms-unit"),
            bc_icms:             n("prod-bc-icms"),
            importacao_unit:     n("prod-import-unit"),
            importacao_linha:    n("prod-import-linha"),
            finalidade:          v("prod-finalidade"),
            tipo_forn:           state.tipoForn,
            aliquota:            n("aliquota"),
            dt_emissao:          v("dt-emissao"),
            saldo_atual:         n("prod-saldo"),
            ...custos,
        };

        await apiFetch("/api/lancamentoNF?action=inserir_produto", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
        });

        showToast("Produto inserido com sucesso.");
        limparFormProduto();
        await carregarProdutos();
    } catch (e) {
        showToast(e.message, "error");
    } finally {
        btn.disabled = false;
        btn.innerHTML = '<i class="fa fa-plus"></i> Inserir';
    }
});

/* --- Alterar produto ------------------------------------- */
$("btn-alterar-prod").addEventListener("click", async () => {
    if (!state.prodSelecionado) return showToast("Selecione um produto na lista.", "error");

    const btn = $("btn-alterar-prod");
    btn.disabled = true; btn.textContent = "⏳ Alterando...";

    try {
        const custos = calcularCustosMedios();
        const body = {
            action:   "alterar_produto",
            id_prod:  state.prodSelecionado.PROD_ID_PROD,
            id_nf:    state.idNF,
            num_nf:   state.numNF,
            usuario:  usuario(),
            codigo:   v("prod-codigo"),
            qnt:      n("prod-qnt"),
            valor_unit:       n("prod-valor-unit"),
            valor_total:      n("prod-valor-total"),
            ipi_unit:         n("prod-ipi-unit"),
            ipi:              n("prod-ipi"),
            icms_unit:        n("prod-icms-unit"),
            icms:             n("prod-icms"),
            st_unit:          n("prod-st-unit"),
            st:               n("prod-st"),
            frete_unit:       n("prod-frete-unit"),
            frete:            n("prod-frete"),
            desconto_unit:    n("prod-desc-unit"),
            desconto:         n("prod-desconto"),
            bc_icms_unit:     n("prod-bc-icms-unit"),
            bc_icms:          n("prod-bc-icms"),
            importacao_unit:  n("prod-import-unit"),
            importacao_linha: n("prod-import-linha"),
            finalidade:       v("prod-finalidade"),
            tipo_forn:        state.tipoForn,
            dt_emissao:       v("dt-emissao"),
            saldo_atual:      n("prod-saldo"),
            ...custos,
        };

        await apiFetch("/api/lancamentoNF?action=alterar_produto", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
        });

        showToast("Produto alterado com sucesso.");
        limparFormProduto();
        await carregarProdutos();
    } catch (e) {
        showToast(e.message, "error");
    } finally {
        btn.disabled = false;
        btn.innerHTML = '<i class="fa fa-edit"></i> Alterar';
        $("btn-alterar-prod").disabled = true;
        $("btn-remover-prod").disabled = true;
        state.prodSelecionado = null;
    }
});

/* --- Remover produto ------------------------------------- */
$("btn-remover-prod").addEventListener("click", async () => {
    if (!state.prodSelecionado) return showToast("Selecione um produto na lista.", "error");
    const p = state.prodSelecionado;
    if (!confirm(`Remover produto ${p.PROD_COD_PROD} (${p.DESCRICAO}) da NF?`)) return;

    try {
        await apiFetch("/api/lancamentoNF?action=remover_produto", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ id_prod: p.PROD_ID_PROD }),
        });
        showToast("Produto removido.");
        limparFormProduto();
        state.prodSelecionado = null;
        $("btn-alterar-prod").disabled = true;
        $("btn-remover-prod").disabled = true;
        await carregarProdutos();
    } catch (e) {
        showToast(e.message, "error");
    }
});

/* --- Finalizar NF --------------------------------------- */
$("btn-finalizar-nf").addEventListener("click", async () => {
    if (!state.idNF) return showToast("Nenhuma NF ativa.", "error");

    const btn = $("btn-finalizar-nf");
    btn.disabled = true; btn.textContent = "⏳ Verificando...";

    try {
        const data = await apiFetch("/api/lancamentoNF?action=finalizar_nf", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ id_nf: state.idNF }),
        });

        // Mostra painel de validação
        const valDiv = $("validacao-result");
        const grid   = $("validacao-grid");
        valDiv.style.display = "block";

        const campos = [
            { key: "qnt",      label: "QTD ITENS",  cabKey: "CAB_QNT_TOTAL_ITENS", sumKey: "SUM_QNT",      money: false },
            { key: "valor",    label: "VALOR PROD",  cabKey: "CAB_VALOR_PROD",      sumKey: "SUM_VALOR",    money: true  },
            { key: "ipi",      label: "IPI",         cabKey: "CAB_IPI",             sumKey: "SUM_IPI",      money: true  },
            { key: "icms",     label: "ICMS",        cabKey: "CAB_ICMS",            sumKey: "SUM_ICMS",     money: true  },
            { key: "st",       label: "ST",          cabKey: "CAB_ST",              sumKey: "SUM_ST",       money: true  },
            { key: "frete",    label: "FRETE",       cabKey: "CAB_FRETE",           sumKey: "SUM_FRETE",    money: true  },
            { key: "desconto", label: "DESCONTO",    cabKey: "CAB_DESCONTO",        sumKey: "SUM_DESCONTO", money: true  },
            { key: "bc_icms",  label: "BC ICMS",     cabKey: "CAB_BC_ICMS",         sumKey: "SUM_BC_ICMS",  money: true  },
        ];

        const fmt = (v, money) => money ? moeda(v == null ? 0 : v) : (v == null ? 0 : v);
        const semProdutos = data.somaProdutos.SUM_QNT == null;

        let html = "";
        if (semProdutos) {
            html += `<div class="conf-aviso-sem-produtos">⚠️ Nenhum produto encontrado nesta NF. Insira os produtos antes de finalizar.</div>`;
        }
        html += `<table class="conf-table">
            <thead><tr><th>Campo</th><th>Cabeçalho (NF)</th><th>Soma Produtos</th><th>Diferença</th></tr></thead>
            <tbody>`;
        campos.forEach(({ key, label, cabKey, sumKey, money }) => {
            const diff = data.diferencas[key];
            const ok   = Math.abs(diff) < 0.02;
            html += `<tr class="${ok ? "ok" : "erro"}">
                <td>${label}</td>
                <td>${fmt(data.cabecalho[cabKey], money)}</td>
                <td>${fmt(data.somaProdutos[sumKey], money)}</td>
                <td class="diff-cell">${money ? moeda(diff) : diff}</td>
            </tr>`;
        });
        html += "</tbody></table>";
        grid.innerHTML = html;

        if (!data.temErro) {
            state.statusNF = "LANÇADA";
            atualizarBadgeNFAtiva();
            showToast("NF finalizada e marcada como LANÇADA!");
            if (window.SGCNotifications) {
                SGCNotifications.add(
                    'nf-lancada',
                    `NF ${state.numNF} lançada`,
                    `Fornecedor: ${state.razaoSocial || state.codForn || '—'}`
                );
            }
        } else {
            showToast("Há diferenças entre cabeçalho e produtos. Corrija antes de finalizar.", "warn");
        }
    } catch (e) {
        showToast(e.message, "error");
    } finally {
        btn.disabled = false;
        btn.innerHTML = '<i class="fa fa-check-double"></i> Finalizar Lançamento';
    }
});

/* --- Carregar lista de produtos da NF ------------------- */
async function carregarProdutos() {
    if (!state.idNF) return;
    const data = await apiFetch(`/api/lancamentoNF?action=produtos&id_nf=${state.idNF}`);
    state.produtos = data;
    renderizarTabelaProdutos(data);
}

function renderizarTabelaProdutos(prods) {
    const tbody = $("tbProdBody");
    if (!prods.length) {
        tbody.innerHTML = `<tr><td colspan="11" style="text-align:center;color:#999;">Nenhum produto na NF.</td></tr>`;
        return;
    }
    tbody.innerHTML = prods.map(p => `
        <tr data-id="${p.PROD_ID_PROD}" style="cursor:pointer;">
            <td>${p.PROD_COD_PROD}</td>
            <td>${p.DESCRICAO || "—"}</td>
            <td>${p.PROD_QNT}</td>
            <td>${moeda(p.PROD_VALOR_UNIT)}</td>
            <td>${moeda(p.PROD_VALOR_TOTAL)}</td>
            <td>${moeda(p.PROD_IPI)}</td>
            <td>${moeda(p.PROD_ICMS)}</td>
            <td>${moeda(p.PROD_ST)}</td>
            <td>${moeda(p.PROD_FRETE)}</td>
            <td>${moeda(p.PROD_DESCONTO)}</td>
            <td>${p.PROD_FINALIDADE || "—"}</td>
        </tr>
    `).join("");

    // Clique na linha → preenche formulário
    tbody.querySelectorAll("tr").forEach(tr => {
        tr.addEventListener("click", () => {
            tbody.querySelectorAll("tr").forEach(r => r.classList.remove("selecionado"));
            tr.classList.add("selecionado");
            const id = Number(tr.dataset.id);
            const prod = state.produtos.find(p => p.PROD_ID_PROD === id);
            if (prod) preencherFormComProduto(prod);
        });
    });
}

function preencherFormComProduto(p) {
    state.prodSelecionado = p;
    $("prod-codigo").value       = p.PROD_COD_PROD;
    $("prod-descricao").value    = p.DESCRICAO || "";
    $("prod-saldo").value        = p.SALDO_ATUAL || 0;
    $("prod-qnt").value          = p.PROD_QNT;
    $("prod-finalidade").value   = p.PROD_FINALIDADE || "";
    $("prod-valor-unit").value   = p.PROD_VALOR_UNIT;
    $("prod-valor-total").value  = p.PROD_VALOR_TOTAL;
    $("prod-ipi-unit").value     = p.PROD_IPI_UNIT;
    $("prod-ipi").value          = p.PROD_IPI;
    $("prod-icms-unit").value    = p.PROD_ICMS_UNIT;
    $("prod-icms").value         = p.PROD_ICMS;
    $("prod-st-unit").value      = p.PROD_ST_UNIT;
    $("prod-st").value           = p.PROD_ST;
    $("prod-frete-unit").value   = p.PROD_FRETE_UNIT;
    $("prod-frete").value        = p.PROD_FRETE;
    $("prod-desc-unit").value    = p.PROD_DESCONTO_UNIT;
    $("prod-desconto").value     = p.PROD_DESCONTO;
    $("prod-bc-icms-unit").value = p.PROD_BC_ICMS_UNIT;
    $("prod-bc-icms").value      = p.PROD_BC_ICMS;
    $("prod-import-unit").value  = p.PROD_IMPORTACAO_UNIT;
    $("prod-import-linha").value = p.PROD_IMPORTACAO_LINHA;

    $("btn-alterar-prod").disabled = false;
    $("btn-remover-prod").disabled = false;
}

function limparFormProduto() {
    ["prod-codigo","prod-descricao","prod-qnt","prod-saldo","prod-finalidade",
     "prod-valor-unit","prod-valor-total","prod-ipi-unit","prod-ipi",
     "prod-icms-unit","prod-icms","prod-st-unit","prod-st",
     "prod-frete-unit","prod-frete","prod-desc-unit","prod-desconto",
     "prod-bc-icms-unit","prod-bc-icms","prod-import-unit","prod-import-linha",
    ].forEach(id => {
        const el = $(id);
        if (el) el.value = el.type === "text" ? "" : 0;
    });
    state.prodSelecionado = null;
    state._custoAtual = null;
}

/* ═══════════════════════════════════════════════════════════
   ABA 3 — CUSTOS
═══════════════════════════════════════════════════════════ */

$("btn-buscar-custo").addEventListener("click", buscarCusto);
$("custo-codigo").addEventListener("keydown", e => { if (e.key === "Enter") buscarCusto(); });

async function buscarCusto() {
    const cod = v("custo-codigo");
    if (!cod) return showToast("Informe o código do produto.", "error");

    try {
        const data = await apiFetch(`/api/lancamentoNF?action=saldo_produto&codigo=${encodeURIComponent(cod)}`);
        $("custo-info").style.display = "block";
        $("custo-saldo").textContent = data.saldo;
        $("custo-cont-atual").textContent = moeda(data.custo?.PROD_CUSTO_CONTABIL_MEDIO_NOVO || 0);
        $("custo-fisc-atual").textContent = moeda(data.custo?.PROD_CUSTO_FISCAL_MEDIO_NOVO || 0);

        // Preenche os campos de novo custo com os valores atuais como padrão
        $("custo-contabil-novo").value = data.custo?.PROD_CUSTO_CONTABIL_MEDIO_NOVO || 0;
        $("custo-fiscal-novo").value   = data.custo?.PROD_CUSTO_FISCAL_MEDIO_NOVO || 0;
        $("custo-pago-novo").value     = data.custo?.PROD_CUSTO_PAGO || 0;

        // Carrega histórico de custos
        await carregarHistoricoCustos(cod);
    } catch (e) {
        showToast(e.message, "error");
        $("custo-info").style.display = "none";
    }
}

async function carregarHistoricoCustos(codigo) {
    const data = await apiFetch(`/api/lancamentoNF?action=produtos&id_nf=-1`).catch(() => []);
    // Não faz sentido buscar produtos por código sem um endpoint dedicado
    // Vamos mostrar aviso
    $("tbCustoBody").innerHTML = `<tr><td colspan="6" style="text-align:center;color:#999;">Histórico disponível após primeiro lançamento.</td></tr>`;
}

$("btn-salvar-primeiro-custo").addEventListener("click", async () => {
    const cod = v("custo-codigo");
    if (!cod) return showToast("Informe o código do produto.", "error");

    const btn = $("btn-salvar-primeiro-custo");
    btn.disabled = true; btn.textContent = "⏳ Salvando...";

    try {
        await apiFetch("/api/lancamentoNF?action=primeiro_custo", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                codigo:         cod,
                custo_contabil: n("custo-contabil-novo"),
                custo_fiscal:   n("custo-fiscal-novo"),
                custo_pago:     n("custo-pago-novo"),
            }),
        });
        showToast("Primeiro custo salvo com sucesso.");
    } catch (e) {
        showToast(e.message, "error");
    } finally {
        btn.disabled = false;
        btn.innerHTML = '<i class="fa fa-save"></i> Inserir / Alterar Primeiro Custo';
    }
});

/* ═══════════════════════════════════════════════════════════
   ABA 4 — PESQUISA
═══════════════════════════════════════════════════════════ */

$("btn-pesquisar-nf").addEventListener("click", pesquisarNF);
$("pesq-num-nf").addEventListener("keydown", e => { if (e.key === "Enter") pesquisarNF(); });

async function pesquisarNF() {
    const numNF = v("pesq-num-nf");
    if (!numNF) return showToast("Informe o número da NF.", "error");

    const tbody = $("tbPesqBody");
    tbody.innerHTML = `<tr><td colspan="9" style="text-align:center;color:#999;">Buscando...</td></tr>`;

    try {
        const data = await apiFetch(`/api/lancamentoNF?action=pesquisa_nf&num_nf=${encodeURIComponent(numNF)}`);

        if (!data.length) {
            tbody.innerHTML = `<tr><td colspan="9" style="text-align:center;color:#999;">Nenhuma NF encontrada.</td></tr>`;
            return;
        }

        tbody.innerHTML = data.map(nf => `
            <tr>
                <td>${nf.CAB_ID_NF}</td>
                <td>${nf.CAB_NUM_NF}</td>
                <td>${nf.CAB_NUM_FORN}</td>
                <td>${nf.RAZAO_SOCIAL || "—"}</td>
                <td>${dtStr(nf.CAB_DT_DIGITACAO)}</td>
                <td>${moeda(nf.CAB_VALOR_TT_NF)}</td>
                <td>${nf.CAB_TP_FORN || "—"}</td>
                <td><span class="nf-status ${(nf.CAB_STATUS || "").replace(/[^A-Z]/g, "")}">${nf.CAB_STATUS || "—"}</span></td>
                <td>
                    <button class="btn-nf-pesq btn-abrir-pesq" data-id="${nf.CAB_ID_NF}" data-forn="${nf.CAB_NUM_FORN}" style="padding:4px 12px;">
                        Abrir
                    </button>
                </td>
            </tr>
        `).join("");

        tbody.querySelectorAll(".btn-abrir-pesq").forEach(btn => {
            btn.addEventListener("click", async () => {
                const idNF = Number(btn.dataset.id);
                const codForn = btn.dataset.forn;
                // Vai para aba Dados Gerais e carrega a NF
                document.querySelectorAll(".nf-tab-btn").forEach(b => b.classList.remove("active"));
                document.querySelectorAll(".nf-tab-panel").forEach(p => p.classList.remove("active"));
                document.querySelector('[data-tab="dados-gerais"]').classList.add("active");
                $("tab-dados-gerais").classList.add("active");

                $("cod-forn").value = codForn;
                state.codForn = codForn;
                await carregarNFsFornecedor(codForn);
                $("sel-nf-existente").value = idNF;
                await carregarCabecalho(idNF);

                // Busca razão social
                try {
                    const forn = await apiFetch(`/api/lancamentoNF?action=buscar_fornecedor&cod=${encodeURIComponent(codForn)}`);
                    $("razao-social").value = forn.RAZAO_SOCIAL;
                    state.razaoSocial = forn.RAZAO_SOCIAL;
                } catch {}

                atualizarBadgeNFAtiva();
            });
        });
    } catch (e) {
        showToast(e.message, "error");
        tbody.innerHTML = `<tr><td colspan="9" style="text-align:center;color:#dc3545;">${e.message}</td></tr>`;
    }
}

/* ── Sidebar username ─────────────────────────────────── */
document.addEventListener("DOMContentLoaded", () => {
    const uEl = document.getElementById("sidebar-username");
    if (uEl) uEl.textContent = usuario();
});
