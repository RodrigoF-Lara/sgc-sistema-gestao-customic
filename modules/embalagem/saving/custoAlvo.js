document.addEventListener("DOMContentLoaded", async () => {
    if (window.SGCPermissoes) {
        try {
            await window.SGCPermissoes.carregar();
            if (
                !window.SGCPermissoes.podeAcessar("custo-alvo") &&
                !window.SGCPermissoes.podeAcessar("saving-compras")
            ) {
                alert("Acesso negado.");
                window.location.href = "/menu.html";
                return;
            }
        } catch (e) {
            console.warn("Falha ao carregar permissões:", e);
        }
    }

    const anoMesInput = document.getElementById("anoMes");
    const soComMeta = document.getElementById("soComMeta");
    const btnAplicar = document.getElementById("btnAplicar");
    const btnExportar = document.getElementById("btnExportar");
    const buscaItem = document.getElementById("buscaItem");
    const theadAlvo = document.getElementById("theadAlvo");
    const tbodyAlvo = document.getElementById("tbodyAlvo");
    const resumoTotais = document.getElementById("resumoTotais");

    const estado = {
        anoMes: null,
        itens: [],
        filtro: "",
        flag: "",
        soComMeta: true,
        sort: { key: "flag", dir: 1 },
    };

    const FLAG_LABEL = {
        ATINGIDO: "ATINGIDO",
        NAO_ATINGIDO: "NÃO ATINGIDO",
        NAO_COMPRADO: "NÃO COMPRADO",
        SEM_META: "SEM META",
    };

    const hoje = new Date();
    anoMesInput.value = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, "0")}`;

    btnAplicar.addEventListener("click", carregar);
    soComMeta.addEventListener("change", () => {
        estado.soComMeta = soComMeta.checked;
        renderizar();
    });
    buscaItem.addEventListener("input", () => {
        estado.filtro = (buscaItem.value || "").trim().toLowerCase();
        renderizar();
    });
    document.querySelectorAll(".flag-chip").forEach((chip) => {
        chip.addEventListener("click", () => {
            document.querySelectorAll(".flag-chip").forEach((c) => c.classList.toggle("active", c === chip));
            estado.flag = chip.getAttribute("data-flag") || "";
            renderizar();
        });
    });
    if (btnExportar) btnExportar.addEventListener("click", exportarExcel);

    async function carregar() {
        const ym = anoMesInput.value;
        if (!ym) {
            alert("Informe o mês da meta.");
            return;
        }
        tbodyAlvo.innerHTML = `<tr><td class="loading" colspan="11"><i class="fa fa-spinner fa-spin"></i> Carregando...</td></tr>`;
        theadAlvo.innerHTML = "";
        resumoTotais.style.display = "none";
        btnExportar.disabled = true;
        try {
            const resp = await fetch(`/api/embalagem/relatorios?acao=custoAlvoList&anoMes=${encodeURIComponent(ym)}`);
            const data = await resp.json().catch(() => ({}));
            if (!resp.ok) throw new Error(data.message || data.error || `HTTP ${resp.status}`);
            estado.anoMes = data.anoMes;
            estado.itens = data.itens || [];
            renderizar();
            btnExportar.disabled = estado.itens.length === 0;
        } catch (err) {
            console.error(err);
            tbodyAlvo.innerHTML = `<tr><td class="empty" colspan="11" style="color:#c62828;">Erro: ${escapeHtml(err.message)}</td></tr>`;
        }
    }

    function itensFiltrados() {
        let itens = estado.itens;
        if (estado.soComMeta) itens = itens.filter((it) => it.flag !== "SEM_META");
        if (estado.flag) itens = itens.filter((it) => it.flag === estado.flag);
        const q = estado.filtro;
        if (q) {
            itens = itens.filter((it) =>
                (it.codigo || "").toLowerCase().includes(q) ||
                (it.descricao || "").toLowerCase().includes(q) ||
                (it.fornecedor || "").toLowerCase().includes(q)
            );
        }
        const key = estado.sort.key;
        const dir = estado.sort.dir;
        const FLAG_ORD = { ATINGIDO: 0, NAO_ATINGIDO: 1, NAO_COMPRADO: 2, SEM_META: 3 };
        const getVal = (it) => {
            switch (key) {
                case "codigo": return it.codigo || "";
                case "item": return (it.descricao || "").toLowerCase();
                case "fornecedor": return (it.fornecedor || "").toLowerCase();
                case "curva": return it.curva || "";
                case "contabil": return it.custoContabil != null ? it.custoContabil : Infinity;
                case "fiscal": return it.custoFiscal != null ? it.custoFiscal : Infinity;
                case "ultNf": return it.precoUnitUltNf != null ? it.precoUnitUltNf : Infinity;
                case "alvo": return it.custoAlvo != null ? it.custoAlvo : Infinity;
                case "compra": return it.custoUltimaCompra != null ? it.custoUltimaCompra : Infinity;
                case "desvio": return it.desvio != null ? it.desvio : Infinity;
                case "flag": return FLAG_ORD[it.flag] != null ? FLAG_ORD[it.flag] : 9;
                default: return 0;
            }
        };
        return [...itens].sort((a, b) => {
            const va = getVal(a);
            const vb = getVal(b);
            if (va < vb) return -1 * dir;
            if (va > vb) return 1 * dir;
            return 0;
        });
    }

    function renderizar() {
        const sortClass = (key) => {
            if (estado.sort.key !== key) return "sortable";
            return "sortable " + (estado.sort.dir > 0 ? "asc" : "desc");
        };
        theadAlvo.innerHTML = `<tr>
            <th class="col-item ${sortClass("item")}" data-sort="item">Código / Descrição</th>
            <th class="${sortClass("fornecedor")}" data-sort="fornecedor">Último fornecedor</th>
            <th class="${sortClass("curva")}" data-sort="curva">Curva</th>
            <th class="${sortClass("contabil")}" data-sort="contabil">Custo contábil médio</th>
            <th class="${sortClass("fiscal")}" data-sort="fiscal">Custo fiscal médio</th>
            <th class="${sortClass("ultNf")}" data-sort="ultNf">Preço unit. últ. NF</th>
            <th class="${sortClass("alvo")}" data-sort="alvo">Custo alvo</th>
            <th class="${sortClass("compra")}" data-sort="compra">Custo última compra</th>
            <th class="${sortClass("desvio")}" data-sort="desvio">Desvio vs. alvo</th>
            <th class="${sortClass("flag")}" data-sort="flag">Flag</th>
        </tr>`;
        theadAlvo.querySelectorAll("th.sortable").forEach((th) => {
            th.addEventListener("click", () => {
                const k = th.dataset.sort;
                if (estado.sort.key === k) estado.sort.dir = -estado.sort.dir;
                else {
                    estado.sort.key = k;
                    estado.sort.dir = 1;
                }
                renderizar();
            });
        });

        const itens = itensFiltrados();
        atualizarTotais(itens);

        if (!itens.length) {
            tbodyAlvo.innerHTML = `<tr><td class="empty" colspan="10">Nenhum item para os filtros atuais.</td></tr>`;
            return;
        }

        tbodyAlvo.innerHTML = itens.map((it) => {
            const desvioHtml = it.desvio == null
                ? '<span class="muted">—</span>'
                : `<span class="${it.desvio <= 0 ? "pos" : "neg"}">${it.desvio > 0 ? "+" : ""}${formatBRL(it.desvio)}</span>`;
            return `<tr>
                <td class="col-item"><strong>${escapeHtml(it.codigo)}</strong>
                    <span style="color:#666;font-weight:400;"> ${escapeHtml(it.descricao)}</span></td>
                <td style="text-align:left;">${escapeHtml(it.fornecedor) || '<span class="muted">—</span>'}</td>
                <td>${escapeHtml(it.curva)}</td>
                <td>${fmtMoney(it.custoContabil)}</td>
                <td>${fmtMoney(it.custoFiscal)}</td>
                <td>${fmtMoney(it.precoUnitUltNf)}</td>
                <td class="col-alvo">${fmtMoney(it.custoAlvo)}</td>
                <td>${fmtMoney(it.custoUltimaCompra)}</td>
                <td>${desvioHtml}</td>
                <td><span class="flag flag-${it.flag}">${FLAG_LABEL[it.flag] || it.flag}</span></td>
            </tr>`;
        }).join("");
    }

    function atualizarTotais(itens) {
        const t = itens.reduce((acc, it) => {
            acc.total += 1;
            if (it.flag === "ATINGIDO") acc.atingidos += 1;
            else if (it.flag === "NAO_ATINGIDO") acc.naoAtingidos += 1;
            else if (it.flag === "NAO_COMPRADO") acc.naoComprados += 1;
            if (it.flag === "ATINGIDO" || it.flag === "NAO_ATINGIDO") acc.comCompra += 1;
            return acc;
        }, { total: 0, atingidos: 0, naoAtingidos: 0, naoComprados: 0, comCompra: 0 });
        document.getElementById("totItens").textContent = t.total;
        document.getElementById("totAtingidos").textContent = t.atingidos;
        document.getElementById("totNaoAtingidos").textContent = t.naoAtingidos;
        document.getElementById("totNaoComprados").textContent = t.naoComprados;
        document.getElementById("totPct").textContent = t.comCompra
            ? `${((t.atingidos / t.comCompra) * 100).toFixed(1)}%`
            : "—";
        resumoTotais.style.display = estado.itens.length ? "flex" : "none";
    }

    function exportarExcel() {
        if (typeof XLSX === "undefined") {
            alert("Biblioteca Excel não carregou.");
            return;
        }
        const itens = itensFiltrados();
        const rows = itens.map((it, i) => ({
            "#": i + 1,
            "Código": it.codigo,
            "Descrição": it.descricao,
            "Último Fornecedor": it.fornecedor || "",
            "Curva ABC": it.curva,
            "Custo Contábil Médio (R$)": it.custoContabil,
            "Custo Fiscal Médio (R$)": it.custoFiscal,
            "Preço Unit. Últ. NF (R$)": it.precoUnitUltNf,
            "Custo alvo": it.custoAlvo,
            "Custo última compra": it.custoUltimaCompra,
            "Desvio vs. Custo-Alvo": it.desvio,
            "Flags": FLAG_LABEL[it.flag] || it.flag,
        }));
        const wb = XLSX.utils.book_new();
        const ws = XLSX.utils.json_to_sheet(rows);
        ws["!cols"] = Object.keys(rows[0] || {}).map((k) => ({ wch: Math.max(k.length + 2, 16) }));
        XLSX.utils.book_append_sheet(wb, ws, "Custo Alvo");
        XLSX.writeFile(wb, `Custo_Alvo_${estado.anoMes || ""}.xlsx`);
    }

    function fmtMoney(v) {
        if (v == null || !Number.isFinite(Number(v))) return '<span class="muted">—</span>';
        return formatBRL(v);
    }
    function formatBRL(v) {
        return Number(v).toLocaleString("pt-BR", {
            style: "currency",
            currency: "BRL",
            minimumFractionDigits: 4,
            maximumFractionDigits: 4,
        });
    }
    function escapeHtml(s) {
        if (s == null) return "";
        return String(s)
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;");
    }
});
