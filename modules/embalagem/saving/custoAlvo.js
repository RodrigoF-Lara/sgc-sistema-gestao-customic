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
    const soComAlvo = document.getElementById("soComAlvo");
    const btnAplicar = document.getElementById("btnAplicar");
    const btnExportar = document.getElementById("btnExportar");
    const btnSalvar = document.getElementById("btnSalvar");
    const btnSugerir = document.getElementById("btnSugerir");
    const buscaItem = document.getElementById("buscaItem");
    const theadAlvo = document.getElementById("theadAlvo");
    const tbodyAlvo = document.getElementById("tbodyAlvo");
    const resumoTotais = document.getElementById("resumoTotais");

    const estado = {
        anoMes: null,
        itens: [],
        alteracoes: {},
        filtro: "",
        flag: "",
        soComAlvo: false,
        sort: { key: "item", dir: 1 },
    };

    const FLAG_LABEL = {
        ATINGIDO: "ATINGIDO",
        NAO_ATINGIDO: "NÃO ATINGIDO",
        NAO_COMPRADO: "NÃO COMPRADO",
        SEM_ALVO: "SEM ALVO",
    };

    const hoje = new Date();
    anoMesInput.value = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, "0")}`;

    btnAplicar.addEventListener("click", carregar);
    soComAlvo.addEventListener("change", () => {
        estado.soComAlvo = soComAlvo.checked;
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
    if (btnSalvar) btnSalvar.addEventListener("click", salvarAlvos);
    if (btnSugerir) btnSugerir.addEventListener("click", sugerirCincoPct);

    async function carregar() {
        const ym = anoMesInput.value;
        if (!ym) {
            alert("Informe o mês de avaliação.");
            return;
        }
        tbodyAlvo.innerHTML = `<tr><td class="loading" colspan="10"><i class="fa fa-spinner fa-spin"></i> Carregando...</td></tr>`;
        theadAlvo.innerHTML = "";
        resumoTotais.style.display = "none";
        btnExportar.disabled = true;
        btnSalvar.disabled = true;
        btnSugerir.disabled = true;
        estado.alteracoes = {};
        try {
            const resp = await fetch(`/api/embalagem/relatorios?acao=custoAlvoList&anoMes=${encodeURIComponent(ym)}`);
            const data = await resp.json().catch(() => ({}));
            if (!resp.ok) throw new Error(data.message || data.error || `HTTP ${resp.status}`);
            estado.anoMes = data.anoMes;
            estado.itens = data.itens || [];
            renderizar();
            btnExportar.disabled = estado.itens.length === 0;
            btnSugerir.disabled = estado.itens.length === 0;
        } catch (err) {
            console.error(err);
            tbodyAlvo.innerHTML = `<tr><td class="empty" colspan="10" style="color:#b71c1c;">Erro: ${escapeHtml(err.message)}</td></tr>`;
        }
    }

    function alvoEfetivo(it) {
        if (it.codigo in estado.alteracoes) return estado.alteracoes[it.codigo];
        return it.custoAlvo;
    }

    function flagDe(it) {
        const alvo = alvoEfetivo(it);
        if (alvo == null) return "SEM_ALVO";
        if (it.custoUltimaCompra == null) return "NAO_COMPRADO";
        if (it.custoUltimaCompra <= alvo + 0.00005) return "ATINGIDO";
        return "NAO_ATINGIDO";
    }

    function itensFiltrados() {
        let itens = estado.itens;
        if (estado.soComAlvo) itens = itens.filter((it) => alvoEfetivo(it) != null);
        if (estado.flag) itens = itens.filter((it) => flagDe(it) === estado.flag);
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
        const FLAG_ORD = { ATINGIDO: 0, NAO_ATINGIDO: 1, NAO_COMPRADO: 2, SEM_ALVO: 3 };
        const getVal = (it) => {
            switch (key) {
                case "codigo": return it.codigo || "";
                case "item": return (it.descricao || "").toLowerCase();
                case "fornecedor": return (it.fornecedor || "").toLowerCase();
                case "curva": return it.curva || "";
                case "contabil": return it.custoContabil != null ? it.custoContabil : Infinity;
                case "fiscal": return it.custoFiscal != null ? it.custoFiscal : Infinity;
                case "ultNf": return it.precoUnitUltNf != null ? it.precoUnitUltNf : Infinity;
                case "alvo": return alvoEfetivo(it) != null ? alvoEfetivo(it) : Infinity;
                case "compra": return it.custoUltimaCompra != null ? it.custoUltimaCompra : Infinity;
                case "desvio": {
                    const a = alvoEfetivo(it);
                    if (a == null || it.custoUltimaCompra == null) return Infinity;
                    return it.custoUltimaCompra - a;
                }
                case "flag": return FLAG_ORD[flagDe(it)] != null ? FLAG_ORD[flagDe(it)] : 9;
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
            tbodyAlvo.innerHTML = `<tr><td class="empty" colspan="10">Nenhum item para os filtros atuais. Clique em Aplicar para carregar a curva A.</td></tr>`;
            return;
        }

        tbodyAlvo.innerHTML = itens.map((it) => {
            const alvo = alvoEfetivo(it);
            const desvio = (it.custoUltimaCompra != null && alvo != null)
                ? +(it.custoUltimaCompra - alvo).toFixed(4)
                : null;
            const desvioHtml = desvio == null
                ? '<span class="muted">—</span>'
                : `<span class="${desvio <= 0 ? "pos" : "neg"}">${desvio > 0 ? "+" : ""}${formatBRL(desvio)}</span>`;
            const flag = flagDe(it);
            const dirty = it.codigo in estado.alteracoes ? " dirty" : "";
            const ph = it.sugeridoAlvo != null ? it.sugeridoAlvo.toFixed(4).replace(".", ",") : "";
            const val = alvo != null ? Number(alvo).toFixed(4) : "";
            return `<tr data-codigo="${escapeHtml(it.codigo)}">
                <td class="col-item"><strong>${escapeHtml(it.codigo)}</strong>
                    <span style="color:#455a64;font-weight:400;"> ${escapeHtml(it.descricao)}</span></td>
                <td style="text-align:left;">${escapeHtml(it.fornecedor) || '<span class="muted">—</span>'}</td>
                <td>${escapeHtml(it.curva)}</td>
                <td>${fmtMoney(it.custoContabil)}</td>
                <td>${fmtMoney(it.custoFiscal)}</td>
                <td>${fmtMoney(it.precoUnitUltNf)}</td>
                <td class="col-alvo">
                    <input type="number" step="0.0001" min="0" class="input-alvo${dirty}"
                           value="${val}" placeholder="${ph}" />
                </td>
                <td>${fmtMoney(it.custoUltimaCompra)}</td>
                <td>${desvioHtml}</td>
                <td><span class="flag flag-${flag}">${FLAG_LABEL[flag] || flag}</span></td>
            </tr>`;
        }).join("");

        tbodyAlvo.querySelectorAll(".input-alvo").forEach((inp) => {
            inp.addEventListener("input", onAlvoInput);
        });
        atualizarBotaoSalvar();
    }

    function onAlvoInput(e) {
        const inp = e.target;
        const tr = inp.closest("tr");
        const codigo = tr.dataset.codigo;
        const item = estado.itens.find((i) => i.codigo === codigo);
        if (!item) return;
        const raw = inp.value.replace(",", ".").trim();
        let novo = raw === "" ? null : Number(raw);
        if (novo != null && (!Number.isFinite(novo) || novo < 0)) return;

        const orig = item.custoAlvo;
        const igual = (orig == null && novo == null) ||
            (orig != null && novo != null && Math.abs(orig - novo) < 0.00005);
        if (igual) {
            delete estado.alteracoes[codigo];
            inp.classList.remove("dirty");
        } else {
            estado.alteracoes[codigo] = novo;
            inp.classList.add("dirty");
        }

        const desvio = (item.custoUltimaCompra != null && novo != null)
            ? +(item.custoUltimaCompra - novo).toFixed(4)
            : null;
        const desvioTd = tr.children[8];
        if (desvioTd) {
            desvioTd.innerHTML = desvio == null
                ? '<span class="muted">—</span>'
                : `<span class="${desvio <= 0 ? "pos" : "neg"}">${desvio > 0 ? "+" : ""}${formatBRL(desvio)}</span>`;
        }
        const flag = flagDe(item);
        const flagTd = tr.children[9];
        if (flagTd) {
            flagTd.innerHTML = `<span class="flag flag-${flag}">${FLAG_LABEL[flag] || flag}</span>`;
        }
        atualizarBotaoSalvar();
        atualizarTotais(itensFiltrados());
    }

    function atualizarBotaoSalvar() {
        btnSalvar.disabled = Object.keys(estado.alteracoes).length === 0;
    }

    function sugerirCincoPct() {
        let n = 0;
        estado.itens.forEach((it) => {
            if (alvoEfetivo(it) != null) return;
            if (it.sugeridoAlvo == null) return;
            estado.alteracoes[it.codigo] = it.sugeridoAlvo;
            n += 1;
        });
        if (!n) {
            alert("Não há itens sem alvo com preço de NF para sugerir.");
            return;
        }
        renderizar();
    }

    async function salvarAlvos() {
        const usuario = localStorage.getItem("userName") || "";
        const itens = Object.keys(estado.alteracoes).map((codigo) => ({
            codigo,
            custoAlvo: estado.alteracoes[codigo],
        }));
        if (!itens.length) return;
        btnSalvar.disabled = true;
        btnSalvar.innerHTML = `<i class="fa fa-spinner fa-spin"></i> Salvando...`;
        try {
            const resp = await fetch("/api/embalagem/relatorios?acao=custoAlvoSaveBatch", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ anoMes: estado.anoMes, usuario, itens }),
            });
            const data = await resp.json().catch(() => ({}));
            if (!resp.ok) throw new Error(data.message || data.error || `HTTP ${resp.status}`);
            alert(`Alvos salvos: ${data.salvos || 0}. Removidos: ${data.removidos || 0}.`);
            await carregar();
        } catch (err) {
            alert("Erro ao salvar: " + err.message);
        } finally {
            btnSalvar.innerHTML = `<i class="fa fa-save"></i> Salvar alvos`;
            atualizarBotaoSalvar();
        }
    }

    function atualizarTotais(itens) {
        const t = itens.reduce((acc, it) => {
            const f = flagDe(it);
            acc.total += 1;
            if (f === "ATINGIDO") acc.atingidos += 1;
            else if (f === "NAO_ATINGIDO") acc.naoAtingidos += 1;
            else if (f === "NAO_COMPRADO") acc.naoComprados += 1;
            if (f === "ATINGIDO" || f === "NAO_ATINGIDO") acc.comCompra += 1;
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
        const rows = itens.map((it, i) => {
            const alvo = alvoEfetivo(it);
            const desvio = (it.custoUltimaCompra != null && alvo != null)
                ? +(it.custoUltimaCompra - alvo).toFixed(4)
                : null;
            return {
                "#": i + 1,
                "Código": it.codigo,
                "Descrição": it.descricao,
                "Último Fornecedor": it.fornecedor || "",
                "Curva ABC": it.curva,
                "Custo Contábil Médio (R$)": it.custoContabil,
                "Custo Fiscal Médio (R$)": it.custoFiscal,
                "Preço Unit. Últ. NF (R$)": it.precoUnitUltNf,
                "Custo alvo": alvo,
                "Custo última compra": it.custoUltimaCompra,
                "Desvio vs. Custo-Alvo": desvio,
                "Flags": FLAG_LABEL[flagDe(it)] || flagDe(it),
            };
        });
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
