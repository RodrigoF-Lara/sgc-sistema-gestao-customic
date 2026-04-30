document.addEventListener('DOMContentLoaded', function() {
    const filtroCodigo = document.getElementById('filtroCodigo');
    const filtroDescricao = document.getElementById('filtroDescricao');
    const filtroCurva = document.getElementById('filtroCurva');
    const buscarBtn = document.getElementById('buscarBtn');
    const salvarAlteracoesBtn = document.getElementById('salvarAlteracoesBtn');
    const resultadosContainer = document.getElementById('resultadosContainer');
    const tabelaProdutos = document.getElementById('tabelaProdutos');
    const statusMessage = document.getElementById('statusMessage');

    let produtosCarregados = [];
    let produtosAlterados = new Map(); // Map para rastrear alterações

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

        mostrarMensagem('Buscando produtos...', 'info');
        buscarBtn.disabled = true;

        try {
            let url = '/api/cadastroProdutos?acao=listar';
            if (codigo) url += `&codigo=${encodeURIComponent(codigo)}`;
            if (descricao) url += `&descricao=${encodeURIComponent(descricao)}`;
            if (curva) url += `&curva=${curva}`;

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
                    </tr>
                </thead>
                <tbody>
                    ${produtosCarregados.map((produto) => {
                        const curvaAtual = produtosAlterados.get(produto.CODIGO) || produto.CURVA_A_B_C || 'C';
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
                        </tr>
                    `}).join('')}
                </tbody>
            </table>
        `;

        tabelaProdutos.innerHTML = html;

        // Adiciona event listeners para os selects
        document.querySelectorAll('.select-curva').forEach(select => {
            select.addEventListener('change', (e) => {
                const codigo = e.target.dataset.codigo;
                const valorOriginal = e.target.dataset.original;
                const novoValor = e.target.value;

                if (novoValor !== valorOriginal) {
                    produtosAlterados.set(codigo, novoValor);
                    e.target.parentElement.parentElement.style.backgroundColor = '#fff3cd'; // Destaca linha alterada
                } else {
                    produtosAlterados.delete(codigo);
                    e.target.parentElement.parentElement.style.backgroundColor = '';
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

        const alteracoes = Array.from(produtosAlterados.entries()).map(([codigo, curva]) => ({
            codigo,
            curva
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
                    produto.CURVA_A_B_C = produtosAlterados.get(produto.CODIGO);
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
