document.addEventListener('DOMContentLoaded', function() {
    const filtroCodigo = document.getElementById('filtroCodigo');
    const filtroDescricao = document.getElementById('filtroDescricao');
    const filtroCurva = document.getElementById('filtroCurva');
    const filtroAtivo = document.getElementById('filtroAtivo');
    const buscarBtn = document.getElementById('buscarBtn');
    const resultadosContainer = document.getElementById('resultadosContainer');
    const tabelaProdutos = document.getElementById('tabelaProdutos');
    const statusMessage = document.getElementById('statusMessage');

    let produtosCarregados = [];
    const ATRIBUTOS = {
        linha: { api: 'linhas', titulo: 'Linhas', pagina: '/shared/cadastros/cadastroLinhas.html' },
        marca: { api: 'marcas', titulo: 'Marcas', pagina: '/shared/cadastros/cadastroMarcas.html' },
        modelo: { api: 'modelos', titulo: 'Modelos', pagina: '/shared/cadastros/cadastroModelos.html' },
    };
    let listasAtributo = { linha: [], marca: [], modelo: [] };
    let gestorChave = null;

    function escaparHtml(valor) {
        return String(valor)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/"/g, '&quot;');
    }

    function opcoesSelect(select, itens, atual) {
        const valor = atual || '';
        const nomes = itens.map((item) => item.nome);
        const fora = valor && !nomes.includes(valor);
        select.innerHTML = `<option value="">—</option>` +
            nomes.map((nome) => `<option value="${escaparHtml(nome)}">${escaparHtml(nome)}</option>`).join('') +
            (fora ? `<option value="${escaparHtml(valor)}">${escaparHtml(valor)} (não cadastrado)</option>` : '');
        select.value = valor;
    }

    async function carregarListas() {
        const pares = await Promise.all(Object.entries(ATRIBUTOS).map(async ([chave, cfg]) => {
            const res = await fetch('/api/shared/cadastros?tipo=' + cfg.api);
            const data = await res.json();
            if (!res.ok) throw new Error(data.message || 'Erro ao carregar ' + cfg.titulo);
            return [chave, data.itens || []];
        }));
        pares.forEach(([chave, itens]) => { listasAtributo[chave] = itens; });
    }

    function aplicarListas(valores) {
        opcoesSelect(document.getElementById('novoLinha'), listasAtributo.linha, valores.novoLinha);
        opcoesSelect(document.getElementById('novoMarca'), listasAtributo.marca, valores.novoMarca);
        opcoesSelect(document.getElementById('novoModelo'), listasAtributo.modelo, valores.novoModelo);
        opcoesSelect(document.getElementById('editLinha'), listasAtributo.linha, valores.editLinha);
        opcoesSelect(document.getElementById('editMarca'), listasAtributo.marca, valores.editMarca);
        opcoesSelect(document.getElementById('editModelo'), listasAtributo.modelo, valores.editModelo);
    }

    function valoresAtuais() {
        const ler = (id) => document.getElementById(id).value;
        return {
            novoLinha: ler('novoLinha'), novoMarca: ler('novoMarca'), novoModelo: ler('novoModelo'),
            editLinha: ler('editLinha'), editMarca: ler('editMarca'), editModelo: ler('editModelo'),
        };
    }

    function mostrarAba(raiz, nome) {
        raiz.querySelectorAll('.prod-tab').forEach((botao) => {
            const ativo = botao.dataset.tab === nome;
            botao.classList.toggle('active', ativo);
            botao.setAttribute('aria-selected', ativo ? 'true' : 'false');
        });
        raiz.querySelectorAll('.prod-panel').forEach((painel) => {
            painel.hidden = painel.dataset.panel !== nome;
        });
    }

    function ligarAbas(raiz) {
        raiz.querySelectorAll('.prod-tab').forEach((botao) => {
            botao.addEventListener('click', () => mostrarAba(raiz, botao.dataset.tab));
        });
    }

    function lerPlano(prefixo) {
        const valor = (id) => document.getElementById(prefixo + id).value.trim();
        return {
            linha: valor('Linha'),
            marca: valor('Marca'),
            modelo: valor('Modelo'),
            cor: valor('Cor'),
            ean: valor('Ean'),
            ncm: valor('Ncm'),
            sapVivo: valor('SapVivo'),
            codClaro: valor('CodClaro'),
        };
    }

    function preencherPlano(prefixo, produto) {
        opcoesSelect(document.getElementById(prefixo + 'Linha'), listasAtributo.linha, produto?.PLN_LINHA || '');
        opcoesSelect(document.getElementById(prefixo + 'Marca'), listasAtributo.marca, produto?.PLN_MARCA || '');
        opcoesSelect(document.getElementById(prefixo + 'Modelo'), listasAtributo.modelo, produto?.PLN_MODELO || '');
        const campos = {
            Cor: produto?.PLN_COR,
            Ean: produto?.PLN_EAN,
            Ncm: produto?.PLN_NCM,
            SapVivo: produto?.PLN_SAP_VIVO,
            CodClaro: produto?.PLN_COD_CLARO,
        };
        Object.entries(campos).forEach(([id, valor]) => {
            document.getElementById(prefixo + id).value = valor || '';
        });
    }

    buscarBtn.addEventListener('click', buscarProdutos);

    // Permite buscar ao pressionar Enter nos campos de filtro
    filtroCodigo.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') buscarProdutos();
    });
    filtroDescricao.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') buscarProdutos();
    });

    // ── Modal Novo Produto ─────────────────────────────
    const modalNovoProduto = document.getElementById('modalNovoProduto');
    const btnNovoProduto = document.getElementById('btnNovoProduto');
    const btnFecharModal = document.getElementById('btnFecharModal');
    const btnCancelarNovo = document.getElementById('btnCancelarNovo');
    const btnSalvarNovo = document.getElementById('btnSalvarNovo');
    const novoCodigo = document.getElementById('novoCodigo');
    const novoDescricao = document.getElementById('novoDescricao');
    const novoTipo = document.getElementById('novoTipo');
    const modalMsg = document.getElementById('modalMsg');

    async function abrirModal() {
        novoCodigo.value = '';
        novoDescricao.value = '';
        novoTipo.value = 'EMBALAGEM';
        try { await carregarListas(); } catch (_) { /* a lista fica vazia e o valor atual continua */ }
        preencherPlano('novo', null);
        mostrarAba(modalNovoProduto, 'geral');
        modalMsg.textContent = '';
        modalMsg.style.color = '';
        modalNovoProduto.style.display = 'flex';
        setTimeout(() => novoCodigo.focus(), 50);
    }
    function fecharModal() {
        modalNovoProduto.style.display = 'none';
    }
    if (btnNovoProduto) btnNovoProduto.addEventListener('click', abrirModal);
    if (btnFecharModal) btnFecharModal.addEventListener('click', fecharModal);
    if (btnCancelarNovo) btnCancelarNovo.addEventListener('click', fecharModal);
    modalNovoProduto.addEventListener('click', (e) => {
        if (e.target === modalNovoProduto) fecharModal();
    });

    async function salvarNovoProduto() {
        const codigo = novoCodigo.value.trim();
        const descricao = novoDescricao.value.trim();
        const tipo = novoTipo.value;

        if (!codigo || !descricao || !tipo) {
            modalMsg.style.color = '#c62828';
            modalMsg.textContent = 'Preencha todos os campos.';
            return;
        }

        btnSalvarNovo.disabled = true;
        modalMsg.style.color = '#1976d2';
        modalMsg.textContent = 'Criando produto...';

        try {
            const res = await fetch('/api/shared/cadastros?tipo=produtos', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ acao: 'criar', codigo, descricao, tipo, ...lerPlano('novo') })
            });
            const data = await res.json();
            if (!res.ok) {
                modalMsg.style.color = '#c62828';
                modalMsg.textContent = data.message || 'Erro ao criar produto.';
                return;
            }
            modalMsg.style.color = '#2e7d32';
            modalMsg.textContent = data.message || 'Produto criado com sucesso!';
            mostrarMensagem(`Produto ${codigo} criado com sucesso!`, 'success');
            setTimeout(() => {
                fecharModal();
                // Recarrega a busca para mostrar o novo item
                filtroCodigo.value = codigo;
                buscarProdutos();
            }, 800);
        } catch (err) {
            modalMsg.style.color = '#c62828';
            modalMsg.textContent = 'Erro: ' + err.message;
        } finally {
            btnSalvarNovo.disabled = false;
        }
    }
    if (btnSalvarNovo) btnSalvarNovo.addEventListener('click', salvarNovoProduto);
    ligarAbas(modalNovoProduto);
    novoCodigo.addEventListener('keypress', (e) => { if (e.key === 'Enter') salvarNovoProduto(); });

    async function buscarProdutos() {
        const codigo = filtroCodigo.value.trim();
        const descricao = filtroDescricao.value.trim();
        const curva = filtroCurva.value;
        const ativo = filtroAtivo.value;

        mostrarMensagem('Buscando produtos...', 'info');
        buscarBtn.disabled = true;

        try {
            let url = '/api/shared/cadastros?tipo=produtos&acao=listar';
            if (codigo) url += `&codigo=${encodeURIComponent(codigo)}`;
            if (descricao) url += `&descricao=${encodeURIComponent(descricao)}`;
            if (curva) url += `&curva=${curva}`;
            if (ativo) url += `&ativo=${ativo}`;

            console.log('🔍 URL da requisição:', url);

            const response = await fetch(url);

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.message || 'Erro ao buscar produtos');
            }

            const resultado = await response.json();
            produtosCarregados = resultado.produtos;

            console.log('✅ Produtos encontrados:', produtosCarregados.length);
            if (produtosCarregados.length > 0) {
                console.log('🔍 Exemplo de produto:', produtosCarregados[0]);
                console.log('🔍 ATIVO do primeiro produto:', produtosCarregados[0].ATIVO, 'tipo:', typeof produtosCarregados[0].ATIVO);
                console.log('🔍 ATIVO stringified:', JSON.stringify(produtosCarregados[0].ATIVO));
                console.log('🔍 ATIVO com Number():', Number(produtosCarregados[0].ATIVO));
                console.log('🔍 ATIVO com parseInt():', parseInt(produtosCarregados[0].ATIVO));
            }
            
            // Converte ATIVO de Buffer para número
            produtosCarregados.forEach(p => {
                if (p.ATIVO && p.ATIVO.type === 'Buffer' && p.ATIVO.data) {
                    p.ATIVO = p.ATIVO.data[0]; // Extrai o valor do Buffer
                }
            });
            
            console.log('✅ Após conversão - ATIVO do primeiro produto:', produtosCarregados[0]?.ATIVO);

            if (produtosCarregados.length === 0) {
                mostrarMensagem('Nenhum produto encontrado com os filtros informados.', 'error');
                resultadosContainer.style.display = 'none';
                buscarBtn.disabled = false;
                return;
            }

            renderizarTabela();
            resultadosContainer.style.display = 'block';
            mostrarMensagem(`${produtosCarregados.length} produto(s) encontrado(s).`, 'success');

        } catch (error) {
            console.error('❌ Erro ao buscar produtos:', error);
            mostrarMensagem(`Erro ao buscar produtos: ${error.message}`, 'error');
        } finally {
            buscarBtn.disabled = false;
        }
    }

    function renderizarTabela() {
        if (produtosCarregados.length === 0) {
            tabelaProdutos.innerHTML = '<p class="info-message">Nenhum produto encontrado.</p>';
            return;
        }

        const html = `
            <table>
                <thead>
                    <tr>
                        <th>Código</th>
                        <th>Descrição</th>
                        <th>Tipo</th>
                        <th style="width: 200px;">Curva ABC</th>
                        <th style="width: 150px;">Status</th>
                        <th style="width: 60px;"></th>
                    </tr>
                </thead>
                <tbody>
                    ${produtosCarregados.map((produto) => {
                        const curvaAtual = produto.CURVA_A_B_C || 'C';
                        // ATIVO já foi convertido de Buffer para número
                        const ativoAtual = produto.ATIVO !== undefined ? produto.ATIVO : 1;
                        
                        return `
                        <tr data-codigo="${produto.CODIGO}">
                            <td><strong>${produto.CODIGO}</strong></td>
                            <td>${produto.DESCRICAO || 'SEM DESCRIÇÃO'}</td>
                            <td>${produto.TIPO || 'N/A'}</td>
                            <td>
                                <select 
                                    class="select-curva" 
                                    data-codigo="${produto.CODIGO}"
                                    data-original="${produto.CURVA_A_B_C || 'C'}"
                                    style="width: 100%; padding: 8px; font-size: 16px; border-radius: 5px; border: 1px solid #ccc;"
                                >
                                    <option value="A" ${curvaAtual === 'A' ? 'selected' : ''}>A - Alta prioridade</option>
                                    <option value="B" ${curvaAtual === 'B' ? 'selected' : ''}>B - Média prioridade</option>
                                    <option value="C" ${curvaAtual === 'C' ? 'selected' : ''}>C - Baixa prioridade</option>
                                </select>
                            </td>
                            <td>
                                <select 
                                    class="select-ativo" 
                                    data-codigo="${produto.CODIGO}"
                                    data-original="${produto.ATIVO !== undefined ? produto.ATIVO : 1}"
                                    style="width: 100%; padding: 8px; font-size: 16px; border-radius: 5px; border: 1px solid #ccc;"
                                >
                                    <option value="1" ${ativoAtual == 1 ? 'selected' : ''}>✅ Ativo</option>
                                    <option value="0" ${ativoAtual == 0 ? 'selected' : ''}>❌ Inativo</option>
                                </select>
                            </td>
                            <td style="text-align:center;">
                                <button class="btn-editar-produto" data-codigo="${produto.CODIGO}" title="Editar produto"
                                    style="background:none; border:1px solid #1976d2; color:#1976d2; border-radius:6px; padding:6px 10px; cursor:pointer; font-size:15px;">
                                    <i class="fa-solid fa-pen-to-square"></i>
                                </button>
                            </td>
                    `}).join('')}
                </tbody>
            </table>
        `;

        tabelaProdutos.innerHTML = html;

        // Adiciona event listeners para os selects - salvamento automático
        document.querySelectorAll('.select-curva, .select-ativo').forEach(select => {
            select.addEventListener('change', async (e) => {
                const codigo = e.target.dataset.codigo;
                const novoValor = e.target.value;
                const tipoCampo = e.target.classList.contains('select-curva') ? 'curva' : 'ativo';
                const linha = e.target.closest('tr');

                const produto = produtosCarregados.find(p => p.CODIGO === codigo);
                if (!produto) return;

                // Desabilita o select durante o salvamento
                e.target.disabled = true;
                linha.style.backgroundColor = '#e3f2fd'; // Azul claro = salvando

                try {
                    // Prepara os dados para salvar
                    const alteracao = {
                        codigo: codigo,
                        curva: tipoCampo === 'curva' ? novoValor : (produto.CURVA_A_B_C || 'C'),
                        ativo: tipoCampo === 'ativo' ? parseInt(novoValor) : (produto.ATIVO !== undefined ? produto.ATIVO : 1)
                    };

                    // Salva automaticamente
                    const response = await fetch('/api/shared/cadastros?tipo=produtos', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            acao: 'atualizar',
                            alteracoes: [alteracao]
                        })
                    });

                    if (!response.ok) {
                        const errorData = await response.json();
                        throw new Error(errorData.message || 'Erro ao salvar');
                    }

                    // Atualiza o produto na memória
                    if (tipoCampo === 'curva') {
                        produto.CURVA_A_B_C = novoValor;
                    } else {
                        produto.ATIVO = parseInt(novoValor);
                    }

                    // Atualiza o data-original
                    e.target.dataset.original = novoValor;

                    // Feedback visual de sucesso
                    linha.style.backgroundColor = '#d4edda'; // Verde = sucesso
                    
                    // Adiciona ícone de confirmação ao lado do select
                    const iconeSucesso = document.createElement('span');
                    iconeSucesso.innerHTML = ' ✅';
                    iconeSucesso.style.cssText = 'color: #28a745; font-size: 20px; margin-left: 8px; animation: pulseSuccess 0.5s ease-in-out;';
                    e.target.parentNode.appendChild(iconeSucesso);
                    
                    setTimeout(() => {
                        linha.style.backgroundColor = '';
                        iconeSucesso.remove();
                    }, 2000);

                    mostrarMensagem('💾 Alteração salva com sucesso!', 'success');

                } catch (error) {
                    console.error('Erro ao salvar:', error);
                    mostrarMensagem('❌ Erro ao salvar: ' + error.message, 'error');
                    linha.style.backgroundColor = '#f8d7da'; // Vermelho = erro
                    
                    // Reverte o valor em caso de erro
                    e.target.value = e.target.dataset.original;
                } finally {
                    // Reabilita o select
                    e.target.disabled = false;
                }
            });
        });
        // Botoes editar
        document.querySelectorAll('.btn-editar-produto').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const codigo = btn.dataset.codigo;
                const produto = produtosCarregados.find(p => p.CODIGO === codigo);
                if (produto) abrirModalEditar(produto);
            });
        });
    }

    // ── Modal Editar Produto ─────────────────────────────
    const modalEditar       = document.getElementById('modalEditarProduto');
    const btnFecharEditar   = document.getElementById('btnFecharEditar');
    const btnCancelarEditar = document.getElementById('btnCancelarEditar');
    const btnSalvarEditar   = document.getElementById('btnSalvarEditar');
    const editCodigo        = document.getElementById('editCodigo');
    const editDescricao     = document.getElementById('editDescricao');
    const editTipo          = document.getElementById('editTipo');
    const editCurva         = document.getElementById('editCurva');
    const editAtivo         = document.getElementById('editAtivo');
    const editEstoqueMinimo = document.getElementById('editEstoqueMinimo');
    const editEstoqueIdeal  = document.getElementById('editEstoqueIdeal');
    const editEstoqueMaximo = document.getElementById('editEstoqueMaximo');
    const editModalMsg      = document.getElementById('editModalMsg');
    let produtoEmEdicao     = null;

    async function abrirModalEditar(produto) {
        produtoEmEdicao = produto;
        editCodigo.value    = produto.CODIGO;
        editDescricao.value = produto.DESCRICAO || '';
        editTipo.value      = produto.TIPO || 'OUTROS';
        editCurva.value     = produto.CURVA_A_B_C || 'C';
        editAtivo.value     = (produto.ATIVO !== undefined ? produto.ATIVO : 1).toString();
        editEstoqueMinimo.value = produto.ESTOQUE_MINIMO ?? '';
        editEstoqueIdeal.value  = produto.ESTOQUE_IDEAL ?? '';
        editEstoqueMaximo.value = produto.ESTOQUE_MAXIMO ?? '';
        try { await carregarListas(); } catch (_) { /* mantém a última lista */ }
        preencherPlano('edit', produto);
        mostrarAba(modalEditar, 'geral');
        editModalMsg.textContent = '';
        modalEditar.style.display = 'flex';
        setTimeout(() => editDescricao.focus(), 50);
    }
    function fecharModalEditar() {
        modalEditar.style.display = 'none';
        produtoEmEdicao = null;
    }
    ligarAbas(modalEditar);
    if (btnFecharEditar)   btnFecharEditar.addEventListener('click', fecharModalEditar);
    if (btnCancelarEditar) btnCancelarEditar.addEventListener('click', fecharModalEditar);
    modalEditar.addEventListener('click', (e) => { if (e.target === modalEditar) fecharModalEditar(); });

    if (btnSalvarEditar) btnSalvarEditar.addEventListener('click', async () => {
        const descricao = editDescricao.value.trim();
        if (!descricao) {
            editModalMsg.style.color = '#c62828';
            editModalMsg.textContent = 'Descrição não pode ser vazia.';
            return;
        }
        btnSalvarEditar.disabled = true;
        editModalMsg.style.color = '#1976d2';
        editModalMsg.textContent = 'Salvando...';
        try {
            const res = await fetch('/api/shared/cadastros?tipo=produtos', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    acao: 'atualizar',
                    alteracoes: [{
                        codigo: produtoEmEdicao.CODIGO,
                        descricao: descricao,
                        tipo: editTipo.value,
                        curva: editCurva.value,
                        ativo: parseInt(editAtivo.value),
                        estoqueMinimo: normalizarNumeroCampo(editEstoqueMinimo.value),
                        estoqueIdeal: normalizarNumeroCampo(editEstoqueIdeal.value),
                        estoqueMaximo: normalizarNumeroCampo(editEstoqueMaximo.value),
                        ...lerPlano('edit')
                    }]
                })
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.message || 'Erro ao salvar');
            // Atualiza produto na memória e na tabela
            produtoEmEdicao.DESCRICAO  = descricao;
            produtoEmEdicao.TIPO       = editTipo.value;
            produtoEmEdicao.CURVA_A_B_C = editCurva.value;
            produtoEmEdicao.ATIVO      = parseInt(editAtivo.value);
            produtoEmEdicao.ESTOQUE_MINIMO = normalizarNumeroCampo(editEstoqueMinimo.value);
            produtoEmEdicao.ESTOQUE_IDEAL  = normalizarNumeroCampo(editEstoqueIdeal.value);
            produtoEmEdicao.ESTOQUE_MAXIMO = normalizarNumeroCampo(editEstoqueMaximo.value);
            const planoSalvo = lerPlano('edit');
            produtoEmEdicao.PLN_LINHA = planoSalvo.linha;
            produtoEmEdicao.PLN_MARCA = planoSalvo.marca;
            produtoEmEdicao.PLN_MODELO = planoSalvo.modelo;
            produtoEmEdicao.PLN_COR = planoSalvo.cor;
            produtoEmEdicao.PLN_EAN = planoSalvo.ean;
            produtoEmEdicao.PLN_NCM = planoSalvo.ncm;
            produtoEmEdicao.PLN_SAP_VIVO = planoSalvo.sapVivo;
            produtoEmEdicao.PLN_COD_CLARO = planoSalvo.codClaro;
            editModalMsg.style.color = '#2e7d32';
            editModalMsg.textContent = 'Salvo com sucesso!';
            mostrarMensagem('Produto atualizado com sucesso!', 'success');
            setTimeout(() => { fecharModalEditar(); renderizarTabela(); }, 700);
        } catch (err) {
            editModalMsg.style.color = '#c62828';
            editModalMsg.textContent = 'Erro: ' + err.message;
        } finally {
            btnSalvarEditar.disabled = false;
        }
    });

    const modalGestor = document.getElementById('modalGestor');
    const gestorTitulo = document.getElementById('gestorTitulo');
    const gestorLista = document.getElementById('gestorLista');
    const gestorNome = document.getElementById('gestorNome');
    const gestorMsg = document.getElementById('gestorMsg');
    const gestorAbrir = document.getElementById('gestorAbrir');
    const gestorForm = document.getElementById('gestorForm');

    function gestorAviso(texto, cor) {
        gestorMsg.style.color = cor || '#333';
        gestorMsg.textContent = texto || '';
    }

    function desenharGestor() {
        const itens = listasAtributo[gestorChave] || [];
        if (!itens.length) {
            gestorLista.innerHTML = '<p>Nenhum item cadastrado.</p>';
            return;
        }
        gestorLista.innerHTML = itens.map((item) => `
            <div class="gestor-item" data-id="${item.id}" data-nome="${escaparHtml(item.nome)}">
                <input type="text" value="${escaparHtml(item.nome)}" />
                <button type="button" class="btn-texto" data-acao="salvar">Salvar</button>
                <button type="button" class="btn-texto perigo" data-acao="excluir">Excluir</button>
            </div>
        `).join('');
    }

    async function abrirGestor(chave) {
        gestorChave = chave;
        const cfg = ATRIBUTOS[chave];
        gestorTitulo.textContent = cfg.titulo;
        gestorAbrir.href = cfg.pagina;
        gestorAbrir.textContent = 'Abrir a tela de ' + cfg.titulo;
        gestorNome.value = '';
        gestorAviso('');
        try { await carregarListas(); } catch (err) { gestorAviso(err.message, '#c62828'); }
        aplicarListas(valoresAtuais());
        desenharGestor();
        modalGestor.style.display = 'flex';
        gestorNome.focus();
    }

    async function acaoGestor(acao, body, substituir) {
        const cfg = ATRIBUTOS[gestorChave];
        const valores = valoresAtuais();
        if (substituir) {
            Object.keys(valores).forEach((chave) => {
                if (valores[chave] === substituir.de) valores[chave] = substituir.para;
            });
        }
        const res = await fetch('/api/shared/cadastros?tipo=' + cfg.api, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ acao, ...body }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.message || 'Erro ao salvar.');
        await carregarListas();
        aplicarListas(valores);
        desenharGestor();
    }

    document.body.addEventListener('click', (e) => {
        const botao = e.target.closest('.btn-gerir');
        if (!botao) return;
        abrirGestor(botao.dataset.attr);
    });
    document.getElementById('btnFecharGestor').addEventListener('click', () => {
        modalGestor.style.display = 'none';
    });
    modalGestor.addEventListener('click', (e) => {
        if (e.target === modalGestor) modalGestor.style.display = 'none';
    });
    gestorForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const nome = gestorNome.value.trim();
        if (!nome) {
            gestorAviso('Informe o nome.', '#c62828');
            return;
        }
        try {
            await acaoGestor('criar', { nome });
            gestorNome.value = '';
            gestorAviso('Cadastrado.', '#2e7d32');
        } catch (err) {
            gestorAviso(err.message, '#c62828');
        }
    });
    gestorLista.addEventListener('click', async (e) => {
        const botao = e.target.closest('button');
        const linha = e.target.closest('.gestor-item');
        if (!botao || !linha) return;
        const id = Number(linha.dataset.id);
        const nome = linha.querySelector('input').value.trim();
        try {
            if (botao.dataset.acao === 'excluir') {
                if (!window.confirm('Excluir este item?')) return;
                await acaoGestor('excluir', { id });
                gestorAviso('Excluído.', '#2e7d32');
                return;
            }
            if (!nome) {
                gestorAviso('Informe o nome.', '#c62828');
                return;
            }
            await acaoGestor('atualizar', { id, nome }, { de: linha.dataset.nome, para: nome });
            gestorAviso('Salvo.', '#2e7d32');
        } catch (err) {
            gestorAviso(err.message, '#c62828');
        }
    });

    function mostrarMensagem(mensagem, tipo) {
        statusMessage.textContent = mensagem;
        statusMessage.className = `status-message ${tipo}`;
        statusMessage.style.display = 'block';

        if (tipo === 'success' || tipo === 'error') {
            setTimeout(() => {
                statusMessage.style.display = 'none';
            }, 5000);
        }
    }

    function normalizarNumeroCampo(valor) {
        const texto = String(valor || '').trim();
        if (!texto) return null;
        const numero = Number(texto.replace(',', '.'));
        return Number.isNaN(numero) ? null : numero;
    }
});
