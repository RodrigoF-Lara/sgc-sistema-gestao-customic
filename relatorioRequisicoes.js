document.addEventListener('DOMContentLoaded', function() {
    const dataInicio = document.getElementById('dataInicio');
    const dataFim = document.getElementById('dataFim');
    const filtroStatus = document.getElementById('filtroStatus');
    const gerarRelatorioBtn = document.getElementById('gerarRelatorioBtn');
    const totalizadoresContainer = document.getElementById('totalizadoresContainer');
    const resultadosContainer = document.getElementById('resultadosContainer');
    const tabelaRelatorio = document.getElementById('tabelaRelatorio');
    const statusMessage = document.getElementById('statusMessage');
    const imprimirBtn = document.getElementById('imprimirBtn');
    const exportarExcelBtn = document.getElementById('exportarExcelBtn');

    let dadosRelatorio = [];
    let totalizadores = {};

    // Define data padrão (últimos 30 dias)
    const hoje = new Date();
    const trintaDiasAtras = new Date(hoje);
    trintaDiasAtras.setDate(hoje.getDate() - 30);
    
    dataFim.valueAsDate = hoje;
    dataInicio.valueAsDate = trintaDiasAtras;

    gerarRelatorioBtn.addEventListener('click', gerarRelatorio);
    imprimirBtn.addEventListener('click', imprimirRelatorio);
    exportarExcelBtn.addEventListener('click', exportarParaExcel);

    async function gerarRelatorio() {
        const inicio = dataInicio.value;
        const fim = dataFim.value;
        const status = filtroStatus.value;

        if (!inicio || !fim) {
            mostrarMensagem('Por favor, selecione as datas de início e fim', 'error');
            return;
        }

        if (new Date(inicio) > new Date(fim)) {
            mostrarMensagem('Data de início não pode ser maior que data fim', 'error');
            return;
        }

        mostrarMensagem('Gerando relatório...', 'info');
        gerarRelatorioBtn.disabled = true;

        try {
            let url = `/api/relatorios?acao=requisicoes&dataInicio=${inicio}&dataFim=${fim}`;
            if (status) {
                url += `&status=${status}`;
            }
            
            console.log('🔍 URL da requisição:', url);
            console.log('📅 Período:', { inicio, fim, status });

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
                    `⚠️ Nenhuma requisição encontrada para o período selecionado.`, 
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
                `Relatório gerado com sucesso! ${dadosRelatorio.length} requisições encontradas.`, 
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
        document.getElementById('totalRequisicoes').textContent = 
            totalizadores.totalRequisicoes.toLocaleString('pt-BR');
        
        document.getElementById('totalItens').textContent = 
            totalizadores.totalItens.toLocaleString('pt-BR');
        
        document.getElementById('totalConcluidas').textContent = 
            totalizadores.totalConcluidas.toLocaleString('pt-BR');
        
        document.getElementById('totalPendentes').textContent = 
            totalizadores.totalPendentes.toLocaleString('pt-BR');
        
        document.getElementById('totalParciais').textContent = 
            totalizadores.totalParciais.toLocaleString('pt-BR');
        
        document.getElementById('totalPrioridadeAlta').textContent = 
            totalizadores.totalPrioridadeAlta.toLocaleString('pt-BR');
        
        document.getElementById('totalPrioridadeNormal').textContent = 
            totalizadores.totalPrioridadeNormal.toLocaleString('pt-BR');
        
        document.getElementById('totalPrioridadeBaixa').textContent = 
            totalizadores.totalPrioridadeBaixa.toLocaleString('pt-BR');
        
        const inicioFormatado = formatarData(dataInicio.value);
        const fimFormatado = formatarData(dataFim.value);
        document.getElementById('periodoInfo').textContent = 
            `${inicioFormatado} a ${fimFormatado}`;
    }

    function renderizarTabela() {
        if (dadosRelatorio.length === 0) {
            tabelaRelatorio.innerHTML = '<p class="info-message">Nenhuma requisição encontrada para o período selecionado.</p>';
            return;
        }

        const html = `
            <table>
                <thead>
                    <tr>
                        <th>#</th>
                        <th>ID Requisição</th>
                        <th>Data Requisição</th>
                        <th>Data Necessidade</th>
                        <th>Solicitante</th>
                        <th>Prioridade</th>
                        <th>Status</th>
                        <th>Qtd Itens</th>
                        <th>Itens Finalizados</th>
                        <th>% Concluído</th>
                    </tr>
                </thead>
                <tbody>
                    ${dadosRelatorio.map((item, index) => {
                        const percentualConcluido = item.TOTAL_ITENS > 0 
                            ? Math.round((item.ITENS_FINALIZADOS / item.TOTAL_ITENS) * 100) 
                            : 0;
                        
                        const statusClass = item.STATUS === 'Concluído' ? 'status-concluido' 
                            : item.STATUS === 'Pendente' ? 'status-pendente' 
                            : 'status-parcial';
                        
                        const prioridadeClass = item.PRIORIDADE === 'Alta' ? 'prioridade-alta' 
                            : item.PRIORIDADE === 'Média' ? 'prioridade-media' 
                            : 'prioridade-baixa';
                        
                        return `
                        <tr>
                            <td>${index + 1}</td>
                            <td><strong>${item.ID_REQ}</strong></td>
                            <td>${formatarData(item.DT_REQUISICAO)}</td>
                            <td>${formatarData(item.DT_NECESSIDADE)}</td>
                            <td>${item.SOLICITANTE}</td>
                            <td><span class="badge ${prioridadeClass}">${item.PRIORIDADE}</span></td>
                            <td><span class="badge ${statusClass}">${item.STATUS}</span></td>
                            <td>${item.TOTAL_ITENS}</td>
                            <td>${item.ITENS_FINALIZADOS}</td>
                            <td>
                                <div class="progress-bar-container">
                                    <div class="progress-bar" style="width: ${percentualConcluido}%"></div>
                                    <span class="progress-text">${percentualConcluido}%</span>
                                </div>
                            </td>
                        </tr>
                    `}).join('')}
                </tbody>
                <tfoot>
                    <tr class="total-row">
                        <td colspan="7" style="text-align: right;"><strong>TOTAL GERAL:</strong></td>
                        <td><strong>${totalizadores.totalItens.toLocaleString('pt-BR')}</strong></td>
                        <td colspan="2"></td>
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

        // Prepara dados de totalizadores
        const dadosTotalizadores = [
            { 'Indicador': 'Total de Requisições', 'Valor': totalizadores.totalRequisicoes },
            { 'Indicador': 'Total de Itens', 'Valor': totalizadores.totalItens },
            { 'Indicador': 'Concluídas', 'Valor': totalizadores.totalConcluidas },
            { 'Indicador': 'Pendentes', 'Valor': totalizadores.totalPendentes },
            { 'Indicador': 'Parciais', 'Valor': totalizadores.totalParciais },
            { 'Indicador': '', 'Valor': '' }, // Linha em branco
            { 'Indicador': '🔴 Prioridade Alta', 'Valor': totalizadores.totalPrioridadeAlta },
            { 'Indicador': '🟡 Prioridade Normal', 'Valor': totalizadores.totalPrioridadeNormal },
            { 'Indicador': '🟢 Prioridade Baixa', 'Valor': totalizadores.totalPrioridadeBaixa },
            { 'Indicador': '', 'Valor': '' }, // Linha em branco
            { 'Indicador': 'Período', 'Valor': `${formatarData(dataInicio.value)} a ${formatarData(dataFim.value)}` }
        ];

        // Prepara dados para exportação
        const dadosExcel = dadosRelatorio.map((item, index) => {
            const percentualConcluido = item.TOTAL_ITENS > 0 
                ? Math.round((item.ITENS_FINALIZADOS / item.TOTAL_ITENS) * 100) 
                : 0;
            
            return {
                '#': index + 1,
                'ID Requisição': item.ID_REQ,
                'Data Requisição': formatarData(item.DT_REQUISICAO),
                'Data Necessidade': formatarData(item.DT_NECESSIDADE),
                'Solicitante': item.SOLICITANTE,
                'Prioridade': item.PRIORIDADE,
                'Status': item.STATUS,
                'Qtd Itens': item.TOTAL_ITENS,
                'Itens Finalizados': item.ITENS_FINALIZADOS,
                '% Concluído': percentualConcluido
            };
        });

        // Cria workbook
        const wb = XLSX.utils.book_new();
        
        // Adiciona aba de totalizadores
        const wsTotalizadores = XLSX.utils.json_to_sheet(dadosTotalizadores);
        XLSX.utils.book_append_sheet(wb, wsTotalizadores, 'Resumo');
        
        // Adiciona aba de detalhamento
        const ws = XLSX.utils.json_to_sheet(dadosExcel);
        XLSX.utils.book_append_sheet(wb, ws, 'Requisições');

        // Gera nome do arquivo com data
        const dataAtual = new Date().toISOString().split('T')[0];
        const nomeArquivo = `relatorio_requisicoes_${dataAtual}.xlsx`;

        // Faz download
        XLSX.writeFile(wb, nomeArquivo);
        
        mostrarMensagem('Relatório exportado com sucesso!', 'success');
    }

    function formatarData(dataString) {
        if (!dataString) return '-';
        const data = new Date(dataString);
        return data.toLocaleDateString('pt-BR', { timeZone: 'UTC' });
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
