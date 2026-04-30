document.addEventListener('DOMContentLoaded', function() {
    const filtroCodigo = document.getElementById('filtroCodigo');
    const filtroDescricao = document.getElementById('filtroDescricao');
    const filtroCurva = document.getElementById('filtroCurva');
    const filtroAtivo = document.getElementById('filtroAtivo');
    const buscarBtn = document.getElementById('buscarBtn');
    const salvarAlteracoesBtn = document.getElementById('salvarAlteracoesBtn');
    const resultadosContainer = document.getElementById('resultadosContainer');
    const tabelaProdutos = document.getElementById('tabelaProdutos');
    const statusMessage = document.getElementById('statusMessage');

    let produtosCarregados = [];
    let produtosAlterados = new Map(); // Map para rastrear alterações { codigo: { curva, ativo } }

    buscarBtn.addEventListener('click', buscarProdutos);
    salvarAlteracoesBtn.addEventListener('click', salvarAlteracoes);

    // Permite buscar ao pressionar Enter nos campos de filtro
    filtroCodigo.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') buscarProdutos();
    });
    filtroDescricao.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') buscarProdutos();
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
                        const alteracao = produtosAlterados.get(produto.CODIGO);
                        const curvaAtual = alteracao?.curva || produto.CURVA_A_B_C || 'C';
                        const ativoAtual = alteracao?.ativo !== undefined ? alteracao.ativo : (produto.ATIVO !== undefined ? produto.ATIVO : 1);
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

        // Adiciona event listeners para os selects
        document.querySelectorAll('.select-curva, .select-ativo').forEach(select => {
            select.addEventListener('change', (e) => {
                const codigo = e.target.dataset.codigo;
                const valorOriginal = e.target.dataset.original;
                const novoValor = e.target.value;
                const tipoCampo = e.target.classList.contains('select-curva') ? 'curva' : 'ativo';

                const produto = produtosCarregados.find(p => p.CODIGO === codigo);
                if (!produto) return;

                // Obtém ou cria alteração para este código
                let alteracao = produtosAlterados.get(codigo) || { 
                    curva: produto.CURVA_A_B_C || 'C', 
                    ativo: produto.ATIVO !== undefined ? produto.ATIVO : 1
                };

                // Atualiza o campo específico
                alteracao[tipoCampo] = tipoCampo === 'ativo' ? parseInt(novoValor) : novoValor;

                // Verifica se há alterações em relação ao original
                const curvaOriginal = produto.CURVA_A_B_C || 'C';
                const ativoOriginal = produto.ATIVO !== undefined ? produto.ATIVO : 1;
                const temAlteracao = alteracao.curva !== curvaOriginal || alteracao.ativo !== ativoOriginal;

                if (temAlteracao) {
                    produtosAlterados.set(codigo, alteracao);
                    e.target.closest('tr').style.backgroundColor = '#fff3cd'; // Destaca linha alterada
                } else {
                    produtosAlterados.delete(codigo);
                    e.target.closest('tr').style.backgroundColor = '';
                }

                // Mostra/esconde botão de salvar
                salvarAlteracoesBtn.style.display = produtosAlterados.size > 0 ? 'inline-block' : 'none';
            });
        });
    }

    async function salvarAlteracoes() {
        if (produtosAlterados.size === 0) {
            mostrarMensagem('Nenhuma alteração para salvar.', 'error');
            return;
        }

        const alteracoes = Array.from(produtosAlterados.entries()).map(([codigo, dados]) => ({
            codigo,
            curva: dados.curva,
            ativo: dados.ativo
        }));

        console.log('💾 Salvando alterações:', alteracoes);

        mostrarMensagem('Salvando alterações...', 'info');
        salvarAlteracoesBtn.disabled = true;

        try {
            const response = await fetch('/api/cadastroProdutos', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    acao: 'atualizar',
                    alteracoes: alteracoes
                })
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.message || 'Erro ao salvar alterações');
            }

            const resultado = await response.json();
            console.log('✅ Alterações salvas:', resultado);

            mostrarMensagem(`${alteracoes.length} produto(s) atualizado(s) com sucesso!`, 'success');

            // Atualiza os dados originais e limpa as alterações
            produtosCarregados.forEach(produto => {
                if (produtosAlterados.has(produto.CODIGO)) {
                    const dados = produtosAlterados.get(produto.CODIGO);
                    produto.CURVA_A_B_C = dados.curva;
                    produto.ATIVO = dados.ativo;
                }
            });

            produtosAlterados.clear();
            salvarAlteracoesBtn.style.display = 'none';

            // Re-renderiza a tabela sem o destaque
            renderizarTabela();

        } catch (error) {
            console.error('❌ Erro ao salvar alterações:', error);
            mostrarMensagem(`Erro ao salvar: ${error.message}`, 'error');
        } finally {
            salvarAlteracoesBtn.disabled = false;
        }
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
