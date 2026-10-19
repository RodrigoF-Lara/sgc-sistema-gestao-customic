(function () {
    const LIMITE = 150;
    let estoque = [];
    const pedido = new Map();

    function semAcento(valor) {
        return String(valor || "").trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    }

    function escapar(valor) {
        return String(valor ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;");
    }

    function numero(valor) {
        const n = Number(String(valor ?? "").trim().replace(",", "."));
        return Number.isFinite(n) ? n : NaN;
    }

    function fmt(valor) {
        return Number(valor || 0).toLocaleString("pt-BR", { maximumFractionDigits: 3 });
    }

    function chave(codigo) {
        return String(codigo || "").trim().toUpperCase();
    }

    function authHeaders() {
        if (window.SGCPermissoes && window.SGCPermissoes.authHeaders) {
            return window.SGCPermissoes.authHeaders();
        }
        const headers = {};
        const nivel = localStorage.getItem("userLevel");
        const code = localStorage.getItem("userCode");
        if (nivel) headers["x-user-level"] = nivel;
        if (code) headers["x-user-code"] = code;
        return headers;
    }

    const status = document.getElementById("listaStatus");

    function avisar(texto, tipo) {
        if (!status) return;
        status.hidden = !texto;
        status.className = "req-aviso " + (tipo || "info");
        status.textContent = texto || "";
    }

    function filtrados() {
        const texto = semAcento(document.getElementById("filtroTextoReq").value);
        if (!texto) return estoque;
        return estoque.filter((item) => semAcento(item.CODIGO).includes(texto) || semAcento(item.DESCRICAO).includes(texto));
    }

    function renderDisponivel() {
        const box = document.getElementById("listaDisponivel");
        if (!estoque.length) {
            box.innerHTML = '<p class="req-vazio">Clique em Gerar lista para carregar os produtos com saldo.</p>';
            return;
        }
        const linhas = filtrados();
        if (!linhas.length) {
            box.innerHTML = '<p class="req-vazio">Nenhum produto com esse texto.</p>';
            return;
        }
        const visiveis = linhas.slice(0, LIMITE);
        const aviso = linhas.length > LIMITE
            ? `<p class="req-vazio">Mostrando ${LIMITE} de ${linhas.length}. Digite o código ou parte da descrição para reduzir a lista.</p>`
            : `<p class="req-vazio">${linhas.length} produto(s).</p>`;
        box.innerHTML = aviso + `<div class="req-scroll"><table>
            <thead><tr>
                <th>#</th><th>Código</th><th>Descrição</th><th>Tipo</th><th>Curva</th><th>Saldo</th><th>Quantidade</th><th></th>
            </tr></thead><tbody>
            ${visiveis.map((item, indice) => {
                const ja = pedido.get(chave(item.CODIGO));
                const curva = item.CURVA_A_B_C || "C";
                const curvaClass = curva === "A" ? "curva-a" : curva === "B" ? "curva-b" : "curva-c";
                return `<tr class="${ja ? "req-ja" : ""}">
                    <td>${indice + 1}</td>
                    <td><strong>${escapar(item.CODIGO)}</strong></td>
                    <td>${escapar(item.DESCRICAO || "SEM DESCRIÇÃO")}</td>
                    <td><span class="badge" style="background:#6c757d">${escapar(item.TIPO || "N/A")}</span></td>
                    <td><span class="badge ${curvaClass}">${escapar(curva)}</span></td>
                    <td><strong>${fmt(item.SALDO)}</strong></td>
                    <td><input class="req-qtd" type="number" min="0" max="${Number(item.SALDO)}" step="any" value="${ja ? ja.quantidade : ""}" data-qtd="${escapar(item.CODIGO)}" /></td>
                    <td><button type="button" class="btn-incluir" data-incluir="${escapar(item.CODIGO)}">${ja ? "Atualizar" : "Incluir"}</button></td>
                </tr>`;
            }).join("")}
            </tbody></table></div>`;
    }

    function renderPedido() {
        const box = document.getElementById("listaPedido");
        const titulo = document.getElementById("tituloPedido");
        const itens = [...pedido.values()];
        if (titulo) {
            titulo.innerHTML = '<i class="fa-solid fa-clipboard-check"></i> Itens da requisição (' + itens.length + ")";
        }
        if (!itens.length) {
            box.innerHTML = '<p class="req-vazio">Nenhum item incluído ainda.</p>';
            return;
        }
        box.innerHTML = `<div class="req-scroll"><table>
            <thead><tr><th>Código</th><th>Descrição</th><th>Disponível</th><th>Quantidade</th><th></th></tr></thead>
            <tbody>
            ${itens.map((item) => `<tr>
                <td><strong>${escapar(item.codigo)}</strong></td>
                <td>${escapar(item.descricao)}</td>
                <td>${fmt(item.saldo)}</td>
                <td><input class="req-qtd" type="number" min="0" max="${item.saldo}" step="any" value="${item.quantidade}" data-editar="${escapar(item.codigo)}" /></td>
                <td><button type="button" class="btn-incluir perigo" data-excluir="${escapar(item.codigo)}">Excluir</button></td>
            </tr>`).join("")}
            </tbody></table></div>`;
    }

    function campoQuantidade(codigo) {
        const alvo = chave(codigo);
        return [...document.querySelectorAll("[data-qtd]")].find((input) => chave(input.dataset.qtd) === alvo);
    }

    function incluir(codigo, quantidadeInformada) {
        const item = estoque.find((linha) => chave(linha.CODIGO) === chave(codigo));
        if (!item) return;
        const qtd = quantidadeInformada != null ? quantidadeInformada : numero(campoQuantidade(item.CODIGO)?.value);
        if (!(qtd > 0)) {
            avisar("Informe a quantidade do código " + item.CODIGO + ".", "erro");
            return;
        }
        if (qtd > Number(item.SALDO) + 0.0000001) {
            avisar("Código " + item.CODIGO + ": o máximo é o saldo disponível (" + fmt(item.SALDO) + ").", "erro");
            return;
        }
        pedido.set(chave(item.CODIGO), {
            codigo: String(item.CODIGO).trim(),
            descricao: item.DESCRICAO || "",
            saldo: Number(item.SALDO) || 0,
            quantidade: qtd,
        });
        avisar(pedido.size + " item(ns) na requisição.", "info");
        renderPedido();
        renderDisponivel();
    }

    document.getElementById("listaDisponivel").addEventListener("click", (e) => {
        const botao = e.target.closest("[data-incluir]");
        if (!botao) return;
        incluir(botao.dataset.incluir);
    });

    document.getElementById("listaDisponivel").addEventListener("keydown", (e) => {
        if (e.key !== "Enter") return;
        const input = e.target.closest("[data-qtd]");
        if (!input) return;
        e.preventDefault();
        incluir(input.dataset.qtd);
    });

    document.getElementById("listaPedido").addEventListener("change", (e) => {
        const input = e.target.closest("[data-editar]");
        if (!input) return;
        const atual = pedido.get(chave(input.dataset.editar));
        if (!atual) return;
        const qtd = numero(input.value);
        if (!(qtd > 0) || qtd > atual.saldo + 0.0000001) {
            input.value = atual.quantidade;
            avisar("Código " + atual.codigo + ": a quantidade fica maior que zero e até o saldo disponível (" + fmt(atual.saldo) + ").", "erro");
            return;
        }
        atual.quantidade = qtd;
        renderDisponivel();
    });

    document.getElementById("listaPedido").addEventListener("click", (e) => {
        const botao = e.target.closest("[data-excluir]");
        if (!botao) return;
        pedido.delete(chave(botao.dataset.excluir));
        avisar(pedido.size ? pedido.size + " item(ns) na requisição." : "", "info");
        renderPedido();
        renderDisponivel();
    });

    document.getElementById("listaPedido").addEventListener("keydown", (e) => {
        if (e.key === "Enter") e.preventDefault();
    });

    document.getElementById("filtroTextoReq").addEventListener("input", () => {
        if (estoque.length) renderDisponivel();
    });
    document.getElementById("filtroTextoReq").addEventListener("keydown", (e) => {
        if (e.key === "Enter") e.preventDefault();
    });

    async function carregarTipos() {
        try {
            const res = await fetch("/api/embalagem/relatorios?acao=tiposProduto");
            const data = await res.json();
            const select = document.getElementById("filtroTipoReq");
            (data.tipos || []).forEach((tipo) => {
                const option = document.createElement("option");
                option.value = tipo;
                option.textContent = tipo;
                select.appendChild(option);
            });
        } catch (_) { /* segue com todos os tipos */ }
    }

    document.getElementById("btnGerarLista").addEventListener("click", async () => {
        const botao = document.getElementById("btnGerarLista");
        const html = botao.innerHTML;
        botao.disabled = true;
        botao.innerHTML = '<i class="fa-solid fa-spinner sgc-giro"></i> Aguardando...';
        avisar("Aguardando... buscando os produtos com saldo. Não feche esta página.", "info");
        try {
            const params = new URLSearchParams({ acao: "itensDisponiveis" });
            const curva = document.getElementById("filtroCurvaReq").value;
            const tipo = document.getElementById("filtroTipoReq").value;
            if (curva) params.set("curvaABC", curva);
            if (tipo) params.set("tipoProduto", tipo);
            const res = await fetch("/api/embalagem/requisicao?" + params.toString(), { headers: authHeaders() });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(data.message || "Erro ao gerar a lista.");
            estoque = data.itens || [];
            avisar(
                estoque.length
                    ? estoque.length + " produto(s) com saldo. Filtre pelo código ou por parte da descrição."
                    : "Nenhum produto ativo com saldo para esses filtros.",
                estoque.length ? "info" : "erro"
            );
            renderDisponivel();
        } catch (err) {
            avisar(err.message, "erro");
        } finally {
            botao.disabled = false;
            botao.innerHTML = html;
        }
    });

    window.SGCItensRequisicao = function () {
        if (!pedido.size) return { erro: "Inclua ao menos um item na requisição.", itens: [] };
        for (const item of pedido.values()) {
            if (!(item.quantidade > 0) || item.quantidade > item.saldo + 0.0000001) {
                return { erro: "Código " + item.codigo + ": a quantidade passa do saldo disponível (" + fmt(item.saldo) + ")." };
            }
        }
        return {
            itens: [...pedido.values()].map((item) => ({
                CODIGO: item.codigo,
                DESCRICAO: item.descricao,
                QNT_REQ: item.quantidade,
            })),
        };
    };

    window.SGCLimparItensRequisicao = function () {
        pedido.clear();
        renderPedido();
        renderDisponivel();
        avisar("Requisição gerada. A lista de itens foi esvaziada.", "info");
    };

    renderDisponivel();
    renderPedido();
    carregarTipos();
})();
