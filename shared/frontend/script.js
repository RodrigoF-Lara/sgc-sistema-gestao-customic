function normalizarChaveCsv(chave) {
    return String(chave || "")
        .replace(/^\uFEFF/, "")
        .trim()
        .toUpperCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/\s+/g, "_");
}

function valorCampoCsv(row, aliases) {
    if (!row || typeof row !== "object") return null;
    const map = {};
    for (const [chave, valor] of Object.entries(row)) {
        map[normalizarChaveCsv(chave)] = valor;
    }
    for (const alias of aliases) {
        const valor = map[alias];
        if (valor !== undefined && valor !== null && String(valor).trim() !== "") {
            return String(valor).trim();
        }
    }
    return null;
}

function normalizarItensCsv(data) {
    if (!Array.isArray(data)) return [];
    const itens = [];
    for (const row of data) {
        const codigo = valorCampoCsv(row, ["CODIGO", "COD", "CODE", "PRODUTO"]);
        const qntRaw = valorCampoCsv(row, ["QNT_REQ", "QNT", "QTD", "QUANTIDADE", "QTD_REQ", "QNTREQ"]);
        if (!codigo) continue;
        const quantidade = parseFloat(String(qntRaw ?? "").replace(",", "."));
        if (!Number.isFinite(quantidade) || quantidade <= 0) continue;
        itens.push({ CODIGO: codigo, QNT_REQ: quantidade });
    }
    return itens;
}

function detectarDelimiter(texto) {
    const primeira = String(texto || "").split(/\r?\n/).find((linha) => linha.trim());
    if (!primeira) return ";";
    const pontoEVirgula = (primeira.match(/;/g) || []).length;
    const virgula = (primeira.match(/,/g) || []).length;
    return pontoEVirgula >= virgula ? ";" : ",";
}

function lerArquivoComoTexto(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ""));
        reader.onerror = () => reject(new Error("Não foi possível ler o arquivo CSV."));
        reader.readAsText(file, "UTF-8");
    });
}

function parseCsv(texto) {
    return new Promise((resolve, reject) => {
        if (typeof Papa === "undefined") {
            reject(new Error("Biblioteca de CSV ainda não carregou. Atualize a página."));
            return;
        }
        Papa.parse(texto, {
            header: true,
            skipEmptyLines: true,
            delimiter: detectarDelimiter(texto),
            complete: (results) => resolve(results),
            error: (err) => reject(new Error(err?.message || "Falha ao ler o CSV.")),
        });
    });
}

const csvForm = document.getElementById("csvForm");
if (!csvForm) {
    // Página sem o formulário de nova requisição
} else csvForm.addEventListener("submit", async function (e) {
    e.preventDefault();

    if (window.SGC_PODE_NOVA_REQ === false) {
        alert("Sem permissão para criar nova requisição.");
        return;
    }

    const fileInput = document.getElementById("csvFile");
    const dtNecessidade = document.getElementById("dtNecessidade").value;
    const prioridade = document.getElementById("prioridade").value;
    const statusElem = document.getElementById("status");
    const aguardeAnimacao = document.getElementById("aguardeAnimacao");
    const resumoContainer = document.getElementById("resumo-container");
    const resumoRequisicaoTbody = document.querySelector("#resumoRequisicao tbody");

    if (!fileInput.files.length || !dtNecessidade || !prioridade) {
        statusElem.style.color = "#c00";
        statusElem.textContent = "Preencha todos os campos e selecione um arquivo CSV!";
        return;
    }

    const userName = localStorage.getItem("userName");
    if (!userName) {
        statusElem.style.color = "#c00";
        statusElem.textContent = "Sessão sem solicitante. Faça login novamente.";
        return;
    }

    function authHeaders() {
        if (window.SGCPermissoes) return window.SGCPermissoes.authHeaders();
        const h = { "Content-Type": "application/json" };
        const nivel = localStorage.getItem("userLevel");
        const code = localStorage.getItem("userCode");
        if (nivel) h["x-user-level"] = nivel;
        if (code) h["x-user-code"] = code;
        return h;
    }

    aguardeAnimacao.style.display = "block";
    statusElem.style.color = "#222";
    statusElem.textContent = "Validando CSV";
    let dots = 0;
    const animInterval = setInterval(() => {
        dots = (dots + 1) % 4;
        statusElem.textContent = (statusElem.dataset.fase || "Enviando") + ".".repeat(dots);
    }, 500);

    try {
        statusElem.dataset.fase = "Validando CSV";
        const texto = await lerArquivoComoTexto(fileInput.files[0]);
        const parsed = await parseCsv(texto);
        const itens = normalizarItensCsv(parsed.data);

        if (itens.length === 0) {
            throw new Error("Nenhum item válido no arquivo. Use as colunas CODIGO e QNT_REQ (separador ; ou ,).");
        }

        statusElem.dataset.fase = "Enviando";
        statusElem.textContent = "Enviando";

        const response = await fetch("/api/embalagem/requisicao", {
            method: "POST",
            headers: authHeaders(),
            body: JSON.stringify({
                action: "createWithItems",
                dtNecessidade,
                prioridade,
                solicitante: userName,
                data: itens,
            }),
        });

        const dataResp = await response.json().catch(() => ({}));
        if (!response.ok) {
            throw new Error(dataResp.error || dataResp.message || "Erro ao criar requisição");
        }

        const idReq = dataResp.idReq;
        clearInterval(animInterval);
        const dataHora = new Date().toLocaleString("pt-BR");
        statusElem.style.color = "green";
        statusElem.textContent = `${dataResp.message || "Requisição criada"} (Inserido em: ${dataHora})`;

        if (window.SGCNotifications) {
            SGCNotifications.add(
                "requisicao-criada",
                `Requisição #${idReq} criada com ${itens.length} item(ns)`,
                `Solicitante: ${userName} | Prioridade: ${prioridade}`
            );
        }

        if (resumoRequisicaoTbody) {
            resumoRequisicaoTbody.innerHTML = "";
            itens.forEach((item) => {
                const row = document.createElement("tr");
                row.innerHTML = `
                    <td>${idReq}</td>
                    <td>${dtNecessidade}</td>
                    <td>${prioridade}</td>
                    <td>${item.CODIGO}</td>
                    <td>${item.QNT_REQ}</td>
                `;
                resumoRequisicaoTbody.appendChild(row);
            });
        }
        if (resumoContainer) resumoContainer.style.display = "block";
    } catch (error) {
        clearInterval(animInterval);
        console.error(error);
        statusElem.style.color = "#c00";
        statusElem.textContent = `Erro ao criar requisição: ${error.message}`;
    } finally {
        aguardeAnimacao.style.display = "none";
        delete statusElem.dataset.fase;
    }
});