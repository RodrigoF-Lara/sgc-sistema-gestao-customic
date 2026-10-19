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

    let anoVivo = null;
    let podeSubir = false;
    let balanco = null;
    let itens = [];
    let sujo = false;

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

    function mostrar(texto, tipo) {
        statusMessage.style.display = "block";
        statusMessage.className = "status-message " + (tipo || "info");
        statusMessage.textContent = texto;
    }

    async function api(method, body) {
        const response = await fetch("/api/embalagem/balancoAnual", {
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
            <p>${sujo ? "Há alteração ainda não salva." : "Contagem salva. O estoque ainda não mudou."}</p>`;
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

    async function carregar() {
        const data = await api("GET");
        anoVivo = data.anoVivo;
        podeSubir = !!data.podeSubir;
        anoVivoTexto.textContent = "Ano vivo do estoque: " + anoVivo + ".";
        if (!anoBalanco.value) anoBalanco.value = Number(anoVivo) + 1;
        if (data.balanco) aplicarBalanco(data.balanco);
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
        const aviso = "Isso grava a contagem como saldo inicial de " + ano +
            " e passa o estoque vivo para " + ano +
            ". O armazém precisa estar parado. O ano " + anoVivo + " não será apagado. Continuar?";
        if (!window.confirm(aviso)) return;
        try {
            await salvar();
            mostrar("Lançando o saldo...", "info");
            subirBtn.disabled = true;
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
