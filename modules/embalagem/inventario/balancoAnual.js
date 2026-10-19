document.addEventListener("DOMContentLoaded", async function () {
    const anoVivoTexto = document.getElementById("anoVivoTexto");
    const anoBalanco = document.getElementById("anoBalanco");
    const abrirBtn = document.getElementById("abrirBtn");
    const painelContagem = document.getElementById("painelContagem");
    const tituloAno = document.getElementById("tituloAno");
    const resumo = document.getElementById("resumo");
    const filtro = document.getElementById("filtro");
    const gradeBody = document.querySelector("#grade tbody");
    const arquivo = document.getElementById("arquivo");
    const statusMessage = document.getElementById("statusMessage");
    const painelAnalise = document.getElementById("painelAnalise");
    const analise = document.getElementById("analise");
    const subirBtn = document.getElementById("subirBtn");
    const relatorioBtn = document.getElementById("relatorioBtn");
    const painelComparacao = document.getElementById("painelComparacao");
    const resumoComparacao = document.getElementById("resumoComparacao");
    const filtroDif = document.getElementById("filtroDif");
    const contagemDif = document.getElementById("contagemDif");
    const corpoDif = document.querySelector("#tabelaDif tbody");
    const corpoViradas = document.querySelector("#tabelaViradas tbody");

    let anoVivo = null;
    let podeSubir = false;
    let balanco = null;
    let itens = [];
    let sujo = false;
    let comparativoAtual = null;

    function authHeaders() {
        const h = { "Content-Type": "application/json" };
        if (window.SGCPermissoes) Object.assign(h, window.SGCPermissoes.authHeaders());
        else {
            const nivel = localStorage.getItem("userLevel");
            const code = localStorage.getItem("userCode");
            if (nivel) h["x-user-level"] = nivel;
            if (code) h["x-user-code"] = code;
        }
        return h;
    }

    function usuario() {
        return localStorage.getItem("userName") || "SGC";
    }

    function esc(valor) {
        return String(valor ?? "").replace(/[&<>"']/g, (c) => ({
            "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
        }[c]));
    }

    function numero(valor) {
        if (typeof valor === "number") return Number.isFinite(valor) ? valor : null;
        if (valor === null || valor === undefined) return null;
        let texto = String(valor).trim().replace(/\s/g, "");
        if (!texto) return null;
        const temVirgula = texto.includes(",");
        const pontos = (texto.match(/\./g) || []).length;
        if (temVirgula && pontos) texto = texto.replace(/\./g, "").replace(",", ".");
        else if (temVirgula) texto = texto.replace(",", ".");
        else if (pontos > 1) texto = texto.replace(/\./g, "");
        const n = Number(texto);
        return Number.isFinite(n) ? n : null;
    }

    function fmt(valor) {
        const n = numero(valor);
        if (n === null) return "";
        return n.toLocaleString("pt-BR");
    }

    function fmtQtd(valor) {
        if (valor === null || valor === undefined || valor === "") return "—";
        const n = Number(valor);
        if (!Number.isFinite(n)) return "—";
        return n.toLocaleString("pt-BR", { maximumFractionDigits: 4 });
    }

    function fmtMoeda(valor) {
        if (valor === null || valor === undefined || valor === "") return "—";
        const n = Number(valor);
        if (!Number.isFinite(n)) return "—";
        return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
    }

    function fmtData(valor) {
        if (!valor) return "—";
        const d = new Date(valor);
        if (Number.isNaN(d.getTime())) return "—";
        return d.toLocaleString("pt-BR");
    }

    function mostrar(texto, tipo) {
        statusMessage.style.display = "block";
        statusMessage.className = "status-message " + (tipo || "info");
        statusMessage.textContent = texto;
    }

    async function api(method, body, extra) {
        const qs = extra ? "&" + new URLSearchParams(extra).toString() : "";
        const response = await fetch("/api/embalagem/inventarioCiclico?rota=balanco" + qs, {
            method,
            headers: authHeaders(),
            body: body ? JSON.stringify(body) : undefined
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
            const err = new Error(data.message || "Erro no balanço.");
            err.data = data;
            throw err;
        }
        return data;
    }

    function linhaVazia() {
        return { codigo: "", descricao: "", armazem: "", endereco: "", quantidade: "", saldoRef: null };
    }

    function aplicarBalanco(novo) {
        balanco = novo;
        itens = (novo.itens || []).map((item) => ({
            codigo: item.CODIGO || "",
            descricao: item.DESCRICAO || "",
            armazem: item.ARMAZEM || "",
            endereco: item.ENDERECO || "",
            quantidade: item.QUANTIDADE === null || item.QUANTIDADE === undefined ? "" : fmt(item.QUANTIDADE),
            saldoRef: item.SALDO_REF === null || item.SALDO_REF === undefined ? null : Number(item.SALDO_REF)
        }));
        sujo = false;
        painelContagem.style.display = "block";
        tituloAno.textContent = "Contagem de " + novo.ANO;
        anoBalanco.value = novo.ANO;
        subirBtn.style.display = podeSubir ? "" : "none";
        render();
    }

    function lerGrade() {
        gradeBody.querySelectorAll("tr").forEach((tr) => {
            const idx = Number(tr.dataset.idx);
            if (!itens[idx]) return;
            const campo = (nome) => tr.querySelector(`[data-campo="${nome}"]`).value;
            const antes = JSON.stringify(itens[idx]);
            itens[idx].codigo = campo("codigo").trim().toUpperCase();
            itens[idx].armazem = campo("armazem").trim();
            itens[idx].endereco = campo("endereco").trim();
            itens[idx].quantidade = campo("quantidade").trim();
            if (JSON.stringify(itens[idx]) !== antes) sujo = true;
        });
    }

    function render() {
        const termo = filtro.value.trim().toUpperCase();
        const html = itens.map((item, idx) => {
            const texto = [item.codigo, item.descricao, item.endereco, item.armazem].join(" ").toUpperCase();
            if (termo && !texto.includes(termo)) return "";
            const qtd = numero(item.quantidade);
            const dif = item.saldoRef === null || qtd === null ? "" : fmt(qtd - item.saldoRef);
            return `<tr data-idx="${idx}">
                <td><input data-campo="codigo" value="${esc(item.codigo)}" style="width: 110px;" /></td>
                <td>${esc(item.descricao)}</td>
                <td><input data-campo="armazem" value="${esc(item.armazem)}" style="width: 80px;" /></td>
                <td><input data-campo="endereco" value="${esc(item.endereco)}" style="width: 140px;" /></td>
                <td><input data-campo="quantidade" value="${esc(item.quantidade === "" ? "" : fmt(item.quantidade))}" style="width: 110px;" /></td>
                <td>${item.saldoRef === null ? "—" : fmt(item.saldoRef)}</td>
                <td>${dif}</td>
                <td><button type="button" data-acao="excluir" class="btn-secundario">Excluir</button></td>
            </tr>`;
        }).join("");
        gradeBody.innerHTML = html || `<tr><td colspan="8">Nenhuma linha na contagem.</td></tr>`;
        atualizarResumo();
    }

    function atualizarResumo() {
        const positivas = itens.filter((item) => numero(item.quantidade) > 0);
        const total = positivas.reduce((s, item) => s + numero(item.quantidade), 0);
        resumo.innerHTML = `<p>Ano do saldo novo: <strong>${esc(balanco ? balanco.ANO : "")}</strong></p>
            <p>${itens.length.toLocaleString("pt-BR")} linhas, ${positivas.length.toLocaleString("pt-BR")} com quantidade, total ${fmt(total)}.</p>
            <p>${sujo ? "Há alteração ainda não salva." : "Contagem salva. O estoque ainda não mudou."}</p>
            <p>${podeSubir ? "Seu cargo pode virar o ano." : "A virada do ano fica só com o administrador."}</p>`;
    }

    function payloadItens() {
        return itens
            .filter((item) => item.codigo || item.endereco || item.quantidade !== "")
            .map((item) => ({
                codigo: item.codigo,
                armazem: item.armazem,
                endereco: item.endereco,
                quantidade: item.quantidade
            }));
    }

    function mostrarAnalise(data, titulo) {
        painelAnalise.style.display = "block";
        const erros = data.erros || [];
        const fora = data.fora || [];
        const errosHtml = erros.length
            ? `<ul>${erros.slice(0, 40).map((e) => `<li>${esc(e.mensagem)}</li>`).join("")}</ul>`
            : "<p>Nenhuma pendência de código, quantidade ou repetição.</p>";
        const foraHtml = fora.length
            ? `<p><strong>${fora.length.toLocaleString("pt-BR")}</strong> endereços com saldo no ano ${esc(data.anoVivo)} não entraram na contagem. Eles não passam para ${esc(data.anoBalanco)}.</p>
               <ul>${fora.slice(0, 30).map((f) => `<li>${esc(f.codigo)} · arm ${esc(f.armazem || "—")} · ${esc(f.endereco || "—")} · saldo ${fmt(f.saldo)}</li>`).join("")}</ul>`
            : "<p>Todo endereço com saldo do ano vivo está na contagem.</p>";
        const extra = data.lotes !== undefined
            ? `<p>A simulação lançaria <strong>${Number(data.lotes).toLocaleString("pt-BR")}</strong> lotes, total ${fmt(data.totalContado)}. Nada foi gravado no estoque.</p>`
            : "";
        analise.innerHTML = `<p><strong>${esc(titulo)}</strong></p>${extra}${errosHtml}${foraHtml}`;
    }

    function renderLinhasDif() {
        const data = comparativoAtual;
        if (!data) {
            corpoDif.innerHTML = "";
            contagemDif.textContent = "";
            return;
        }
        const termo = filtroDif.value.trim().toUpperCase();
        const linhas = (data.linhas || []).filter((linha) => {
            if (!termo) return true;
            return (linha.codigo + " " + (linha.descricao || "")).toUpperCase().includes(termo);
        });
        corpoDif.innerHTML = linhas.map((linha) => `<tr>
            <td>${esc(linha.codigo)}</td>
            <td>${esc(linha.descricao || "")}</td>
            <td>${fmtQtd(linha.qtdAntiga)}</td>
            <td>${fmtQtd(linha.qtdNova)}</td>
            <td>${fmtQtd(linha.qtdDiferenca)}</td>
            <td>${linha.custoUnit ? fmtMoeda(linha.custoUnit) : "—"}</td>
            <td>${fmtMoeda(linha.vlAntigo)}</td>
            <td>${fmtMoeda(linha.vlNovo)}</td>
            <td>${fmtMoeda(linha.vlDiferenca)}</td>
        </tr>`).join("") || `<tr><td colspan="9">Nenhum código neste filtro.</td></tr>`;
        contagemDif.textContent = linhas.length.toLocaleString("pt-BR") + " códigos nesta tabela.";
    }

    function mostrarComparacao(data) {
        comparativoAtual = data;
        painelComparacao.style.display = "block";
        const t = data.totais || {};
        const previa = !!data.previa;
        const titulo = previa ? "Prévia — ainda não gravada" : "Gravado na virada";
        const quando = previa
            ? "Estes números são calculados agora. O estoque não mudou e a virada ainda não foi gravada."
            : "Diferença gravada em " + fmtData(data.dtSubida) + " por " + (data.usuarioSubida || "—") + ".";
        resumoComparacao.innerHTML = `<p><strong>${esc(titulo)}</strong>. ${esc(quando)}</p>
            <p>Estoque de <strong>${esc(data.anoVivo ?? "—")}</strong> comparado com a contagem de <strong>${esc(data.anoBalanco ?? "—")}</strong>.
               Abertura: ${esc(fmtData(data.dtAbertura))}. Virada: ${esc(fmtData(data.dtSubida))}.</p>
            <p>Diferença = quantidade contada − estoque atual. Valor positivo: a contagem ficou maior.
               O valor usa o custo da última nota${previa ? ", nesta prévia" : ", congelado na virada"}.</p>
            <table>
                <thead><tr><th></th><th>Estoque atual</th><th>Contagem</th><th>Diferença</th></tr></thead>
                <tbody>
                    <tr><th>Quantidade</th><td>${fmtQtd(t.qtdAntiga)}</td><td>${fmtQtd(t.qtdNova)}</td><td>${fmtQtd(t.qtdDiferenca)}</td></tr>
                    <tr><th>Valor</th><td>${fmtMoeda(t.vlAntigo)}</td><td>${fmtMoeda(t.vlNovo)}</td><td>${fmtMoeda(t.vlDiferenca)}</td></tr>
                </tbody>
            </table>
            <p>${Number(t.codigos || 0).toLocaleString("pt-BR")} códigos.
               ${Number(t.semCusto || 0).toLocaleString("pt-BR")} sem custo de nota, com valor zero.</p>`;
        filtroDif.value = "";
        renderLinhasDif();
        painelComparacao.scrollIntoView({ behavior: "smooth", block: "start" });
    }

    function textoVirada(comp) {
        const t = comp.totais || {};
        return [
            "Virar o estoque de " + comp.anoVivo + " para " + comp.anoBalanco + "?",
            "O armazém precisa estar parado. O ano " + comp.anoVivo + " não será apagado.",
            "",
            "Quantidade atual: " + fmtQtd(t.qtdAntiga),
            "Quantidade contada: " + fmtQtd(t.qtdNova),
            "Diferença (contado − atual): " + fmtQtd(t.qtdDiferenca),
            "Valor atual: " + fmtMoeda(t.vlAntigo),
            "Valor contado: " + fmtMoeda(t.vlNovo),
            "Diferença de valor: " + fmtMoeda(t.vlDiferenca),
            Number(t.semCusto) ? Number(t.semCusto).toLocaleString("pt-BR") + " códigos sem custo de nota ficam com valor zero." : "",
            "",
            "A prévia ainda não está gravada. O número definitivo é recalculado na hora da virada."
        ].filter((linha) => linha !== "").join("\n");
    }

    function renderViradas(lista) {
        if (!lista.length) {
            corpoViradas.innerHTML = `<tr><td colspan="7">Nenhuma virada gravada.</td></tr>`;
            return;
        }
        corpoViradas.innerHTML = lista.map((item) => `<tr>
            <td>${esc(item.ano)}</td>
            <td>${esc(item.anoOrigem ?? "—")}</td>
            <td>${esc(fmtData(item.dtSubida))}</td>
            <td>${esc(item.usuarioSubida || "")}</td>
            <td>${fmtQtd(item.qtdDiferenca)}</td>
            <td>${fmtMoeda(item.vlDiferenca)}</td>
            <td><button type="button" class="btn-secundario" data-virada="${esc(item.id)}">Abrir</button></td>
        </tr>`).join("");
    }

    async function carregar() {
        const data = await api("GET");
        anoVivo = data.anoVivo;
        podeSubir = !!data.podeSubir;
        anoVivoTexto.textContent = "Ano vivo do estoque: " + anoVivo + ".";
        if (!anoBalanco.value) anoBalanco.value = Number(anoVivo) + 1;
        renderViradas(data.viradas || []);
        if (data.balanco) aplicarBalanco(data.balanco);
    }

    async function relatorio() {
        if (!balanco) return;
        lerGrade();
        relatorioBtn.disabled = true;
        try {
            await salvar();
            mostrar("Montando o comparativo. O estoque não será alterado.", "info");
            const data = await api("POST", { acao: "comparar", id: balanco.ID, usuario: usuario() });
            mostrarComparacao(data);
            mostrar("Prévia pronta. Nada foi gravado no estoque nem na virada.", "success");
        } catch (err) {
            mostrar(err.message, "error");
        } finally {
            relatorioBtn.disabled = false;
        }
    }

    async function verVirada(id) {
        mostrar("Carregando a virada gravada...", "info");
        const data = await api("GET", null, { acao: "diferenca", id: String(id) });
        mostrarComparacao(data);
        if (data.gravado) mostrar("Comparativo gravado na virada. Estes números não mudam.", "success");
        else mostrar("Esta virada não tem o comparativo salvo.", "info");
    }

    function exportarDif() {
        if (!comparativoAtual || !window.XLSX) return;
        const data = comparativoAtual;
        const t = data.totais || {};
        const resumoFolha = [
            ["Situação", data.previa ? "Prévia" : "Gravado"],
            ["Ano do estoque atual", data.anoVivo],
            ["Ano da contagem", data.anoBalanco],
            ["Abertura", fmtData(data.dtAbertura)],
            ["Virada", fmtData(data.dtSubida)],
            ["Usuário da abertura", data.usuarioAbertura || ""],
            ["Usuário da virada", data.usuarioSubida || ""],
            ["Quantidade atual", t.qtdAntiga],
            ["Quantidade contada", t.qtdNova],
            ["Diferença de quantidade", t.qtdDiferenca],
            ["Valor atual", t.vlAntigo],
            ["Valor contado", t.vlNovo],
            ["Diferença de valor", t.vlDiferenca],
            ["Códigos", t.codigos],
            ["Códigos sem custo", t.semCusto],
            ["Regra", "Diferença = contado - estoque atual. Valor = quantidade x custo da última nota."]
        ];
        const linhas = (data.linhas || []).map((linha) => ({
            CODIGO: linha.codigo,
            DESCRICAO: linha.descricao,
            QTD_ATUAL: linha.qtdAntiga,
            QTD_CONTADA: linha.qtdNova,
            QTD_DIFERENCA: linha.qtdDiferenca,
            CUSTO_UNIT: linha.custoUnit,
            VL_ATUAL: linha.vlAntigo,
            VL_CONTADO: linha.vlNovo,
            VL_DIFERENCA: linha.vlDiferenca
        }));
        const livro = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(livro, XLSX.utils.aoa_to_sheet(resumoFolha), "Resumo");
        XLSX.utils.book_append_sheet(livro, XLSX.utils.json_to_sheet(linhas), "Codigos");
        XLSX.writeFile(livro, "diferenca-balanco-" + (data.anoBalanco || "comparativo") + ".xlsx");
    }

    async function abrir() {
        const ano = Number(anoBalanco.value);
        mostrar("Abrindo balanço...", "info");
        abrirBtn.disabled = true;
        try {
            const data = await api("POST", { acao: "abrir", ano, usuario: usuario() });
            aplicarBalanco(data.balanco);
            mostrar("Balanço de " + data.balanco.ANO + " aberto. O estoque não foi alterado.", "success");
        } catch (err) {
            mostrar(err.message, "error");
        } finally {
            abrirBtn.disabled = false;
        }
    }

    async function salvar() {
        if (!balanco) return;
        lerGrade();
        mostrar("Salvando contagem...", "info");
        const data = await api("POST", {
            acao: "salvar",
            id: balanco.ID,
            usuario: usuario(),
            itens: payloadItens()
        });
        aplicarBalanco(data.balanco);
        mostrar("Contagem salva. O estoque não foi alterado.", "success");
    }

    async function revisar(acao) {
        try {
            await salvar();
            mostrar(acao === "simular" ? "Simulando..." : "Revisando...", "info");
            const data = await api("POST", { acao, id: balanco.ID, usuario: usuario() });
            mostrarAnalise(data, acao === "simular" ? "Simulação" : "Revisão");
            if ((data.erros || []).length) mostrar("A contagem ainda tem pendência.", "error");
            else mostrar(acao === "simular" ? "Simulação concluída. Nada foi gravado no estoque." : "Revisão concluída.", "success");
        } catch (err) {
            mostrar(err.message, "error");
        }
    }

    async function subir() {
        if (!podeSubir || !balanco) return;
        lerGrade();
        const ano = balanco.ANO;
        subirBtn.disabled = true;
        try {
            await salvar();
            mostrar("Montando o comparativo antes da virada. O estoque ainda não muda.", "info");
            const comp = await api("POST", { acao: "comparar", id: balanco.ID, usuario: usuario() });
            mostrarComparacao(comp);
            if (!window.confirm(textoVirada(comp))) {
                mostrar("Virada cancelada. O estoque não mudou. O comparativo acima é só uma prévia.", "info");
                return;
            }
            mostrar("Lançando o saldo...", "info");
            let data;
            try {
                data = await api("POST", { acao: "subir", id: balanco.ID, usuario: usuario(), confirmarFora: false });
            } catch (err) {
                if (!(err.data && err.data.precisaConfirmar)) throw err;
                const qtd = (err.data.fora || []).length;
                const segue = window.confirm(
                    qtd.toLocaleString("pt-BR") +
                    " endereços com saldo não foram contados. Eles não entram em " + ano + ". Confirmar mesmo assim?"
                );
                if (!segue) {
                    mostrarAnalise(err.data, "Confirmação necessária");
                    mostrar("Subida cancelada. O estoque não mudou.", "info");
                    return;
                }
                data = await api("POST", { acao: "subir", id: balanco.ID, usuario: usuario(), confirmarFora: true });
            }
            mostrar(data.message, "success");
            if (data.comparativo) mostrarComparacao(data.comparativo);
            painelContagem.style.display = "none";
            balanco = null;
            itens = [];
            await carregar();
        } catch (err) {
            if (err.data && err.data.erros) mostrarAnalise(err.data, "Pendências");
            mostrar(err.message, "error");
        } finally {
            subirBtn.disabled = false;
        }
    }

    function importarPlanilha(buffer) {
        const livro = XLSX.read(buffer, { type: "array" });
        const folha = livro.Sheets[livro.SheetNames[0]];
        const linhas = XLSX.utils.sheet_to_json(folha, { defval: "" });
        if (!linhas.length) {
            mostrar("A planilha não tem linhas.", "error");
            return;
        }
        const novo = linhas.map((row) => {
            const porNome = {};
            Object.keys(row).forEach((k) => { porNome[String(k).trim().toUpperCase()] = row[k]; });
            return {
                codigo: String(porNome.CODIGO || "").trim().toUpperCase(),
                descricao: "",
                armazem: String(porNome.ARMAZEM || "").trim(),
                endereco: String(porNome.ENDERECO || "").trim(),
                quantidade: porNome.QUANTIDADE !== undefined && porNome.QUANTIDADE !== ""
                    ? porNome.QUANTIDADE
                    : (porNome.QNT !== undefined ? porNome.QNT : ""),
                saldoRef: null
            };
        }).filter((item) => item.codigo);
        if (!novo.length) {
            mostrar("Não achei a coluna CODIGO.", "error");
            return;
        }
        if (itens.length && !window.confirm("Substituir a contagem da tela pela planilha? O que não estiver salvo será descartado.")) return;
        itens = novo;
        sujo = true;
        render();
        mostrar(novo.length.toLocaleString("pt-BR") + " linhas importadas. Salve para gravar a contagem.", "info");
    }

    function exportar() {
        lerGrade();
        const dados = itens.map((item) => ({
            CODIGO: item.codigo,
            DESCRICAO: item.descricao,
            ARMAZEM: item.armazem,
            ENDERECO: item.endereco,
            QUANTIDADE: numero(item.quantidade),
            SALDO_ATUAL: item.saldoRef
        }));
        const livro = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(livro, XLSX.utils.json_to_sheet(dados), "Contagem");
        XLSX.writeFile(livro, "balanco-" + (balanco ? balanco.ANO : "contagem") + ".xlsx");
    }

    function modelo() {
        const livro = XLSX.utils.book_new();
        const folha = XLSX.utils.json_to_sheet([{ CODIGO: "", ARMAZEM: "", ENDERECO: "", QUANTIDADE: "" }]);
        XLSX.utils.book_append_sheet(livro, folha, "Contagem");
        XLSX.writeFile(livro, "modelo-balanco.xlsx");
    }

    if (window.SGCPermissoes) {
        try {
            await window.SGCPermissoes.carregar();
            if (!window.SGCPermissoes.podeAcessar("balanco-anual")) {
                alert("Acesso negado. Você não tem permissão para o Balanço Anual.");
                window.location.href = "/menu.html";
                return;
            }
        } catch (e) {
            console.warn("Falha ao carregar permissões:", e);
        }
    }

    abrirBtn.addEventListener("click", abrir);
    document.getElementById("adicionarBtn").addEventListener("click", () => {
        lerGrade();
        itens.push(linhaVazia());
        sujo = true;
        render();
    });
    document.getElementById("salvarBtn").addEventListener("click", () => salvar().catch((err) => mostrar(err.message, "error")));
    document.getElementById("revisarBtn").addEventListener("click", () => revisar("revisar"));
    document.getElementById("simularBtn").addEventListener("click", () => revisar("simular"));
    relatorioBtn.addEventListener("click", relatorio);
    document.getElementById("exportarDifBtn").addEventListener("click", exportarDif);
    filtroDif.addEventListener("input", renderLinhasDif);
    corpoViradas.addEventListener("click", (e) => {
        const btn = e.target.closest("[data-virada]");
        if (!btn) return;
        verVirada(btn.dataset.virada).catch((err) => mostrar(err.message, "error"));
    });
    subirBtn.addEventListener("click", subir);
    document.getElementById("limparBtn").addEventListener("click", () => {
        lerGrade();
        if (!itens.length) return;
        if (!window.confirm("Limpar as linhas desta tela? Salve depois para gravar a lista vazia.")) return;
        itens = [];
        sujo = true;
        render();
    });
    document.getElementById("modeloBtn").addEventListener("click", modelo);
    document.getElementById("exportarBtn").addEventListener("click", exportar);
    document.getElementById("escolherPlanilhaBtn").addEventListener("click", () => arquivo.click());
    arquivo.addEventListener("change", () => {
        const file = arquivo.files && arquivo.files[0];
        arquivo.value = "";
        if (!file) return;
        const reader = new FileReader();
        reader.onload = () => importarPlanilha(reader.result);
        reader.readAsArrayBuffer(file);
    });
    filtro.addEventListener("input", () => {
        lerGrade();
        render();
    });
    gradeBody.addEventListener("click", (e) => {
        const btn = e.target.closest("[data-acao='excluir']");
        if (!btn) return;
        lerGrade();
        const idx = Number(btn.closest("tr").dataset.idx);
        itens.splice(idx, 1);
        sujo = true;
        render();
    });
    gradeBody.addEventListener("change", () => {
        lerGrade();
        atualizarResumo();
    });

    try {
        mostrar("Carregando balanço...", "info");
        await carregar();
        if (!balanco) mostrar("Abra o ano da contagem. O estoque ainda é " + anoVivo + ".", "info");
        else statusMessage.style.display = "none";
    } catch (err) {
        mostrar(err.message, "error");
    }
});
