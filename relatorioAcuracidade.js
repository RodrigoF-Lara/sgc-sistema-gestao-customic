document.addEventListener('DOMContentLoaded', function() {
    const filtroPeriodoInicio = document.getElementById('filtroPeriodoInicio');
    const filtroPeriodoFim = document.getElementById('filtroPeriodoFim');
    const filtroStatus = document.getElementById('filtroStatus');
    const gerarRelatorioBtn = document.getElementById('gerarRelatorioBtn');
    const totalizadoresContainer = document.getElementById('totalizadoresContainer');
    const resultadosContainer = document.getElementById('resultadosContainer');
    const tabelaRelatorioBody = document.getElementById('tabelaRelatorioBody');
    const statusMessage = document.getElementById('statusMessage');
    const imprimirBtn = document.getElementById('imprimirBtn');
    const exportarExcelBtn = document.getElementById('exportarExcelBtn');
    const detalhesModal = document.getElementById('detalhesModal');

    let dadosRelatorio = [];
    let totalizadores = {};

    // Define data padrão (último mês)
    const hoje = new Date();
    const primeiroDiaMes = new Date(hoje.getFullYear(), hoje.getMonth(), 1);
    filtroPeriodoInicio.valueAsDate = primeiroDiaMes;
    filtroPeriodoFim.valueAsDate = hoje;

    gerarRelatorioBtn.addEventListener('click', gerarRelatorio);
    imprimirBtn.addEventListener('click', imprimirRelatorio);
    exportarExcelBtn.addEventListener('click', exportarParaExcel);

    // Event listeners para fechar modal
    document.querySelectorAll('.close-btn').forEach(btn => {
        btn.addEventListener('click', function() {
            document.getElementById(this.dataset.modal).style.display = 'none';
        });
    });

    window.addEventListener('click', function(e) {
        if (e.target.classList.contains('modal')) {
            e.target.style.display = 'none';
        }
    });

    async function gerarRelatorio() {
        const dataInicio = filtroPeriodoInicio.value;
        const dataFim = filtroPeriodoFim.value;
        const status = filtroStatus.value;

        if (!dataInicio || !dataFim) {
            mostrarMensagem('Por favor, selecione o período.', 'error');
            return;
        }

        mostrarMensagem('Gerando relatório...', 'info');
        gerarRelatorioBtn.disabled = true;

        try {
            let url = `/api/relatorios?acao=acuracidade&dataInicio=${dataInicio}&dataFim=${dataFim}`;
            if (status) {
                url += `&status=${status}`;
            }
            
            console.log('🔍 URL da requisição:', url);

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
                    `⚠️ Nenhum inventário encontrado no período selecionado.`, 
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
                `Relatório gerado com sucesso! ${dadosRelatorio.length} inventário(s) encontrado(s).`, 
                'success'
            );

        } catch (error) {
            console.error('❌ Erro ao gerar relatório:', error);
            mostrarMensagem(`Erro: ${error.message}`, 'error');
            totalizadoresContainer.style.display = 'none';
            resultadosContainer.style.display = 'none';
        } finally {
            gerarRelatorioBtn.disabled = false;
        }
    }

    function renderizarTotalizadores() {
        document.getElementById('totalInventarios').textContent = totalizadores.totalInventarios || 0;
        document.getElementById('acuracidadeMedia').textContent = 
            totalizadores.acuracidadeMedia !== null 
                ? `${totalizadores.acuracidadeMedia.toFixed(2)}%` 
                : 'N/A';
        document.getElementById('totalItens').textContent = totalizadores.totalItens || 0;
        document.getElementById('acuracidadeMinima').textContent = 
            totalizadores.acuracidadeMinima !== null 
                ? `${totalizadores.acuracidadeMinima.toFixed(2)}%` 
                : 'N/A';
        document.getElementById('acuracidadeMaxima').textContent = 
            totalizadores.acuracidadeMaxima !== null 
                ? `${totalizadores.acuracidadeMaxima.toFixed(2)}%` 
                : 'N/A';
    }

    function renderizarTabela() {
        tabelaRelatorioBody.innerHTML = '';

        dadosRelatorio.forEach(inv => {
            const row = document.createElement('tr');
            
            const statusClass = inv.STATUS === 'FINALIZADO' ? 'badge-concluido' : 'badge-pendente';
            const acuracidadeClass = getAcuracidadeClass(inv.ACURACIDADE);
            
            row.innerHTML = `
                <td>${inv.ID_INVENTARIO}</td>
                <td>${formatarDataUTC(inv.DT_GERACAO)}</td>
                <td>${inv.DT_FINALIZACAO ? formatarDataUTC(inv.DT_FINALIZACAO) : '-'}</td>
                <td style="max-width: 300px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" 
                    title="${inv.CRITERIO || ''}">${inv.CRITERIO || '-'}</td>
                <td><span class="badge ${statusClass}">${inv.STATUS}</span></td>
                <td>${inv.TOTAL_ITENS || 0}</td>
                <td><span class="badge ${acuracidadeClass}">${inv.ACURACIDADE !== null ? inv.ACURACIDADE.toFixed(2) + '%' : 'N/A'}</span></td>
                <td>${inv.USUARIO_FINALIZACAO || inv.USUARIO_CRIACAO || '-'}</td>
                <td>
                    <button class="btn-secundario btn-small" onclick="verDetalhes(${inv.ID_INVENTARIO})" 
                            title="Ver detalhes">
                        <i class="fa-solid fa-eye"></i>
                    </button>
                </td>
            `;
            
            tabelaRelatorioBody.appendChild(row);
        });
    }

    function getAcuracidadeClass(acuracidade) {
        if (acuracidade === null) return '';
        if (acuracidade >= 95) return 'badge-concluido';
        if (acuracidade >= 85) return 'badge-parcial';
        return 'badge-pendente';
    }

    window.verDetalhes = async function(idInventario) {
        try {
            mostrarMensagem('Carregando detalhes...', 'info');
            
            const response = await fetch(`/api/relatorios?acao=detalhesInventario&idInventario=${idInventario}`);
            
            if (!response.ok) {
                throw new Error('Erro ao carregar detalhes');
            }
            
            const resultado = await response.json();
            
            console.log('📋 Detalhes do inventário:', resultado);
            
            mostrarDetalhesModal(resultado.inventario, resultado.itens);
            
        } catch (error) {
            console.error('❌ Erro ao carregar detalhes:', error);
            mostrarMensagem(`Erro: ${error.message}`, 'error');
        }
    };

    function mostrarDetalhesModal(inventario, itens) {
        const tituloDetalhes = document.getElementById('tituloDetalhes');
        const infoInventario = document.getElementById('infoInventario');
        const tabelaDetalhesBody = document.getElementById('tabelaDetalhesBody');
        
        tituloDetalhes.textContent = `Inventário #${inventario.ID_INVENTARIO}`;
        
        infoInventario.innerHTML = `
            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 15px;">
                <div><strong>Data Geração:</strong> ${formatarDataUTC(inventario.DT_GERACAO)}</div>
                <div><strong>Data Finalização:</strong> ${inventario.DT_FINALIZACAO ? formatarDataUTC(inventario.DT_FINALIZACAO) : 'Em andamento'}</div>
                <div><strong>Status:</strong> <span class="badge ${inventario.STATUS === 'FINALIZADO' ? 'badge-concluido' : 'badge-pendente'}">${inventario.STATUS}</span></div>
                <div><strong>Critério:</strong> ${inventario.CRITERIO || '-'}</div>
                <div><strong>Total de Itens:</strong> ${inventario.TOTAL_ITENS || 0}</div>
                <div><strong>Acuracidade:</strong> <span class="badge ${getAcuracidadeClass(inventario.ACURACIDADE)}">${inventario.ACURACIDADE !== null ? inventario.ACURACIDADE.toFixed(2) + '%' : 'N/A'}</span></div>
                <div><strong>Usuário Criação:</strong> ${inventario.USUARIO_CRIACAO || '-'}</div>
                <div><strong>Usuário Finalização:</strong> ${inventario.USUARIO_FINALIZACAO || '-'}</div>
            </div>
        `;
        
        tabelaDetalhesBody.innerHTML = '';
        
        itens.forEach(item => {
            const row = document.createElement('tr');
            const acuracidadeClass = getAcuracidadeClass(item.ACURACIDADE);
            
            row.innerHTML = `
                <td>${item.CODIGO}</td>
                <td style="max-width: 300px;">${item.DESCRICAO || '-'}</td>
                <td>${item.SALDO_SISTEMA !== null ? parseFloat(item.SALDO_SISTEMA).toFixed(2) : '0.00'}</td>
                <td>${item.CONTAGEM_FISICA !== null ? parseFloat(item.CONTAGEM_FISICA).toFixed(2) : '0.00'}</td>
                <td style="color: ${item.DIFERENCA > 0 ? '#28a745' : item.DIFERENCA < 0 ? '#dc3545' : '#666'}; font-weight: bold;">
                    ${item.DIFERENCA !== null ? (item.DIFERENCA > 0 ? '+' : '') + parseFloat(item.DIFERENCA).toFixed(2) : '0.00'}
                </td>
                <td><span class="badge ${acuracidadeClass}">${item.ACURACIDADE !== null ? item.ACURACIDADE.toFixed(2) + '%' : 'N/A'}</span></td>
                <td>${item.TOTAL_MOVIMENTACOES || 0}</td>
            `;
            
            tabelaDetalhesBody.appendChild(row);
        });
        
        detalhesModal.style.display = 'block';
    }

    function formatarDataUTC(dataString) {
        if (!dataString) return '-';
        const data = new Date(dataString);
        const dia = String(data.getUTCDate()).padStart(2, '0');
        const mes = String(data.getUTCMonth() + 1).padStart(2, '0');
        const ano = data.getUTCFullYear();
        return `${dia}/${mes}/${ano}`;
    }

    function imprimirRelatorio() {
        window.print();
    }

    function exportarParaExcel() {
        if (dadosRelatorio.length === 0) {
            mostrarMensagem('Não há dados para exportar', 'error');
            return;
        }

        try {
            const dadosExcel = dadosRelatorio.map(inv => ({
                'ID': inv.ID_INVENTARIO,
                'Data Geração': formatarDataUTC(inv.DT_GERACAO),
                'Data Finalização': inv.DT_FINALIZACAO ? formatarDataUTC(inv.DT_FINALIZACAO) : '-',
                'Critério': inv.CRITERIO || '-',
                'Status': inv.STATUS,
                'Total Itens': inv.TOTAL_ITENS || 0,
                'Acuracidade (%)': inv.ACURACIDADE !== null ? inv.ACURACIDADE.toFixed(2) : 'N/A',
                'Usuário Criação': inv.USUARIO_CRIACAO || '-',
                'Usuário Finalização': inv.USUARIO_FINALIZACAO || '-'
            }));

            const ws = XLSX.utils.json_to_sheet(dadosExcel);
            const wb = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(wb, ws, 'Acuracidade');

            const dataInicio = filtroPeriodoInicio.value.replace(/-/g, '');
            const dataFim = filtroPeriodoFim.value.replace(/-/g, '');
            const nomeArquivo = `Relatorio_Acuracidade_${dataInicio}_${dataFim}.xlsx`;

            XLSX.writeFile(wb, nomeArquivo);
            
            mostrarMensagem('Arquivo Excel exportado com sucesso!', 'success');
        } catch (error) {
            console.error('❌ Erro ao exportar Excel:', error);
            mostrarMensagem('Erro ao exportar arquivo Excel', 'error');
        }
    }

    function mostrarMensagem(texto, tipo) {
        statusMessage.textContent = texto;
        statusMessage.className = `status-message ${tipo}`;
        statusMessage.style.display = 'block';
        
        if (tipo === 'success') {
            setTimeout(() => {
                statusMessage.style.display = 'none';
            }, 5000);
        }
    }
});
