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

    function abrirModal() {
        novoCodigo.value = '';
        novoDescricao.value = '';
        novoTipo.value = 'OUTROS';
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
            const res = await fetch('/api/cadastroProdutos', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ acao: 'criar', codigo, descricao, tipo })
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
    [novoCodigo, novoDescricao].forEach(inp => {
        inp.addEventListener('keypress', (e) => { if (e.key === 'Enter') salvarNovoProduto(); });
    });

    async function buscarProdutos() {
        const codigo = filtroCodigo.value.trim();
        const descricao = filtroDescricao.value.trim();
        const curva = filtroCurva.value;
        const ativo = filtroAtivo.value;

        mostrarMensagem('Buscando produtos...', 'info');
        buscarBtn.disabled = true;

        try {
            let url = '/api/cadastroProdutos?acao=listar';
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
                        </tr>
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
                    const response = await fetch('/api/cadastroProdutos', {
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
    }

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
});
