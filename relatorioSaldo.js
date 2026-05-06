document.addEventListener('DOMContentLoaded', function() {
    const filtroCurvaABC = document.getElementById('filtroCurvaABC');
    const filtroTipoProduto = document.getElementById('filtroTipoProduto');
    const filtroSaldoZero = document.getElementById('filtroSaldoZero');
    const gerarRelatorioBtn = document.getElementById('gerarRelatorioBtn');
    const totalizadoresContainer = document.getElementById('totalizadoresContainer');
    const resultadosContainer = document.getElementById('resultadosContainer');
    const tabelaRelatorio = document.getElementById('tabelaRelatorio');
    const statusMessage = document.getElementById('statusMessage');
    const imprimirBtn = document.getElementById('imprimirBtn');
    const exportarExcelBtn = document.getElementById('exportarExcelBtn');

    let dadosRelatorio = [];
    let totalizadores = {};

    // Carrega os tipos de produto
    carregarTiposProduto();

    gerarRelatorioBtn.addEventListener('click', gerarRelatorio);
    imprimirBtn.addEventListener('click', imprimirRelatorio);
    exportarExcelBtn.addEventListener('click', exportarParaExcel);

    async function carregarTiposProduto() {
        try {
            const response = await fetch('/api/relatorios?acao=tiposProduto');
            if (!response.ok) throw new Error('Erro ao carregar tipos');
            
            const data = await response.json();
            
            // Preenche o select com os tipos
            data.tipos.forEach(tipo => {
                const option = document.createElement('option');
                option.value = tipo;
                option.textContent = tipo;
                filtroTipoProduto.appendChild(option);
            });
            
            console.log('✅ Tipos de produto carregados:', data.tipos.length);
        } catch (error) {
            console.error('❌ Erro ao carregar tipos de produto:', error);
        }
    }

    async function gerarRelatorio() {
        const curvaABC = filtroCurvaABC.value;
        const tipoProduto = filtroTipoProduto.value;
        const incluirSaldoZero = filtroSaldoZero.value;

        mostrarMensagem('Gerando relatório...', 'info');
        gerarRelatorioBtn.disabled = true;

        try {
            let url = `/api/relatorios?acao=saldoEstoque&incluirSaldoZero=${incluirSaldoZero}`;
            if (curvaABC) {
                url += `&curvaABC=${curvaABC}`;
            }
            if (tipoProduto) {
                url += `&tipoProduto=${encodeURIComponent(tipoProduto)}`;
            }
            
            console.log('🔍 URL da requisição:', url);
            console.log('🎯 Filtros:', { curvaABC: curvaABC || 'Todas', tipoProduto: tipoProduto || 'Todos', incluirSaldoZero });

            const response = await fetch(url);

            if (!response.ok) {
                const errorData = await response.json();
                console.error('❌ Erro na resposta:', errorData);
                throw new Error(errorData.message || 'Erro ao buscar dados');
            }

            const resultado = await response.json();
            
            console.log('✅ Resultado recebido:', resultado);
            
            dadosRelatorio = resultado.dados;
            totalizadores = resultado.totalizadores;

            if (dadosRelatorio.length === 0) {
                mostrarMensagem(
                    `⚠️ Nenhum produto encontrado com os filtros selecionados.`, 
                    'error'
                );
                totalizadoresContainer.style.display = 'none';
                resultadosContainer.style.display = 'none';
                gerarRelatorioBtn.disabled = false;
                return;
            }

            renderizarTotalizadores();
            renderizarTabela();
            
            totalizadoresContainer.style.display = 'block';
            resultadosContainer.style.display = 'block';
            
            mostrarMensagem(
                `Relatório gerado com sucesso! ${dadosRelatorio.length} produtos encontrados.`, 
                'success'
            );

        } catch (error) {
            console.error('❌ Erro ao gerar relatório:', error);
            mostrarMensagem(`Erro ao gerar relatório: ${error.message}`, 'error');
        } finally {
            gerarRelatorioBtn.disabled = false;
        }
    }

    function renderizarTotalizadores() {
        document.getElementById('totalProdutos').textContent = 
            totalizadores.totalProdutos.toLocaleString('pt-BR');
        
        document.getElementById('totalCurvaA').textContent = 
            totalizadores.totalCurvaA.toLocaleString('pt-BR');
        
        document.getElementById('totalCurvaB').textContent = 
            totalizadores.totalCurvaB.toLocaleString('pt-BR');
        
        document.getElementById('totalCurvaC').textContent = 
            totalizadores.totalCurvaC.toLocaleString('pt-BR');
        
        document.getElementById('totalSaldo').textContent = 
            totalizadores.totalSaldo.toLocaleString('pt-BR');
    }

    function renderizarTabela() {
        if (dadosRelatorio.length === 0) {
            tabelaRelatorio.innerHTML = '<p class="info-message">Nenhum produto encontrado.</p>';
            return;
        }

        const html = `
            <table>
                <thead>
                    <tr>
                        <th>#</th>
                        <th>Código</th>
                        <th>Descrição</th>
                        <th>Tipo</th>
                        <th>Curva ABC</th>
                        <th>Saldo</th>
                        <th>Último Fornecedor</th>
                    </tr>
                </thead>
                <tbody>
                    ${dadosRelatorio.map((item, index) => {
                        const curva = item.CURVA_A_B_C || 'C';
                        const curvaClass = curva === 'A' ? 'curva-a' 
                            : curva === 'B' ? 'curva-b' 
                            : 'curva-c';
                        
                        return `
                        <tr>
                            <td>${index + 1}</td>
                            <td><strong>${item.CODIGO}</strong></td>
                            <td>${item.DESCRICAO || 'SEM DESCRIÇÃO'}</td>
                            <td><span class="badge" style="background-color: #6c757d;">${item.TIPO || 'N/A'}</span></td>
                            <td><span class="badge ${curvaClass}">${curva}</span></td>
                            <td><strong>${parseFloat(item.SALDO || 0).toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</strong></td>
                            <td>${item.ULTIMO_FORNECEDOR || 'Não informado'}</td>
                        </tr>
                    `}).join('')}
                </tbody>
                <tfoot>
                    <tr class="total-row">
                        <td colspan="6" style="text-align: right;"><strong>TOTAL GERAL:</strong></td>
                        <td><strong>${totalizadores.totalSaldo.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</strong></td>
                    </tr>
                </tfoot>
            </table>
        `;

        tabelaRelatorio.innerHTML = html;
    }

    function imprimirRelatorio() {
        window.print();
    }

    function exportarParaExcel() {
        if (dadosRelatorio.length === 0) {
            mostrarMensagem('Não há dados para exportar', 'error');
            return;
        }

        // Prepara dados para exportação
        const dadosExcel = dadosRelatorio.map((item, index) => {
            return {
                '#': index + 1,
                'Código': item.CODIGO,
                'Descrição': item.DESCRICAO || 'SEM DESCRIÇÃO',
                'Tipo': item.TIPO || 'N/A',
                'Curva ABC': item.CURVA_A_B_C || 'C',
                'Saldo': parseFloat(item.SALDO || 0),
                'Último Fornecedor': item.ULTIMO_FORNECEDOR || 'Não informado'
            };
        });

        // Cria worksheet e workbook
        const ws = XLSX.utils.json_to_sheet(dadosExcel);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Saldo Estoque');

        // Gera nome do arquivo com data
        const dataAtual = new Date().toISOString().split('T')[0];
        const nomeArquivo = `relatorio_saldo_estoque_${dataAtual}.xlsx`;

        // Faz download
        XLSX.writeFile(wb, nomeArquivo);
        
        mostrarMensagem('Relatório exportado com sucesso!', 'success');
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
