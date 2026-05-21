document.addEventListener('DOMContentLoaded', function() {
    const container = document.getElementById('requisicoes-container');
    const summaryContainer = document.getElementById('summary-container');
    
    // --- ELEMENTOS DE FILTRO ---
    const filterId = document.getElementById('filterId');
    const filterSolicitante = document.getElementById('filterSolicitante');
    const filterStatus = document.getElementById('filterStatus');
    const filterPrioridade = document.getElementById('filterPrioridade');
    const filterDataNecessidade = document.getElementById('filterDataNecessidade');
    
    let todasRequisicoes = []; // Guarda todos os dados do servidor

    // --- FUNÇÕES AUXILIARES ---
    function formatarData(dataString) {
        if (!dataString) return 'N/A';
        const data = new Date(dataString);
        return data.toLocaleDateString('pt-BR', { timeZone: 'UTC' });
    }

    function padronizarStatus(status) {
        let statusLimpo = (status || 'Pendente').trim();
        if (statusLimpo === '') return 'Pendente';
        if (statusLimpo.toUpperCase() === 'CONCLUIDO') return 'Concluído';
        return statusLimpo;
    }

    // --- FUNÇÕES DE RENDERIZAÇÃO ---
    function renderRequisicoes(listaDeRequisicoes) {
        container.innerHTML = '';
        if (listaDeRequisicoes.length === 0) {
            container.innerHTML = '<p class="info-message">Nenhuma requisição encontrada com os filtros aplicados.</p>';
            return;
        }

        const table = document.createElement('table');
        table.className = 'consulta-table';
        table.innerHTML = `
            <thead>
                <tr>
                    <th>ID</th><th>Data</th><th>Solicitante</th><th>Prioridade</th><th>Status</th><th>Nº de Itens</th><th>Ações</th>
                </tr>
            </thead>
            <tbody>
                ${listaDeRequisicoes.map(req => {
                    const prioridade = (req.PRIORIDADE || 'NORMAL').trim();
                    const status = padronizarStatus(req.STATUS);
                    return `
                    <tr>
                        <td>${req.ID_REQ}</td>
                        <td>${formatarData(req.DT_REQUISICAO)}</td>
                        <td>${req.SOLICITANTE}</td>
                        <td><span class="prioridade-badge prioridade-${prioridade.toLowerCase()}">${prioridade}</span></td>
                        <td><span class="status-badge status-${status.replace(/\s/g, '-').toLowerCase()}">${status}</span></td>
                        <td>${req.TOTAL_ITENS}</td>
                        <td>
                            <button class="btn-detalhes" data-id="${req.ID_REQ}">
                                <i class="fa-solid fa-circle-info"></i> Detalhes
                            </button>
                        </td>
                    </tr>
                `}).join('')}
            </tbody>
        `;
        container.appendChild(table);
    }

    function atualizarSumario(listaDeRequisicoes) {
        const total = listaDeRequisicoes.length;
        const pendentes = listaDeRequisicoes.filter(r => padronizarStatus(r.STATUS) === 'Pendente').length;
        const concluidas = listaDeRequisicoes.filter(r => padronizarStatus(r.STATUS) === 'Concluído').length;
        const emAndamento = total - pendentes - concluidas;

        summaryContainer.innerHTML = `
            <div class="summary-card"><h3>Total</h3><p>${total}</p></div>
            <div class="summary-card"><h3>Pendentes</h3><p>${pendentes}</p></div>
            <div class="summary-card"><h3>Em Andamento</h3><p>${emAndamento}</p></div>
            <div class="summary-card"><h3>Concluídas</h3><p>${concluidas}</p></div>
        `;
    }

    function popularFiltroStatus(listaDeRequisicoes) {
        const statuses = [...new Set(listaDeRequisicoes.map(r => padronizarStatus(r.STATUS)))];
        filterStatus.innerHTML = '<option value="">Todos os Status</option>';
        statuses.sort().forEach(status => {
            const option = document.createElement('option');
            option.value = status;
            option.textContent = status;
            filterStatus.appendChild(option);
        });
    }

    // --- FUNÇÃO DE FILTRO ATUALIZADA ---
    function aplicarFiltros() {
        const id = filterId.value;
        const solicitante = filterSolicitante.value.toLowerCase();
        const statusFiltro = filterStatus.value;
        const prioridade = filterPrioridade.value;
        const dataNecessidade = filterDataNecessidade.value; // Formato: YYYY-MM-DD

        const requisicoesFiltradas = todasRequisicoes.filter(req => {
            const matchId = !id || req.ID_REQ.toString() === id;
            const matchSolicitante = (req.SOLICITANTE || '').toLowerCase().includes(solicitante);
            const matchPrioridade = !prioridade || (req.PRIORIDADE || 'NORMAL') === prioridade;
            const statusPadronizado = padronizarStatus(req.STATUS);
            const matchStatus = !statusFiltro || statusPadronizado === statusFiltro;
            
            // Lógica para o filtro de data
            const reqDataNecessidade = req.DT_NECESSIDADE ? req.DT_NECESSIDADE.split('T')[0] : '';
            const matchData = !dataNecessidade || reqDataNecessidade === dataNecessidade;
            
            return matchId && matchSolicitante && matchPrioridade && matchStatus && matchData;
        });

        renderRequisicoes(requisicoesFiltradas);
    }
    
    async function carregarDadosIniciais() {
        try {
            container.innerHTML = '<div class="loader-container"><div class="loader"></div><p>Buscando requisições...</p></div>';
            const response = await fetch("/api/requisicao"); 
            if (!response.ok) throw new Error('Falha ao buscar dados do servidor.');
            
            todasRequisicoes = await response.json();
            
            renderRequisicoes(todasRequisicoes);
            atualizarSumario(todasRequisicoes);
            popularFiltroStatus(todasRequisicoes);
        } catch (error) {
            console.error("Erro ao carregar requisições:", error);
            container.innerHTML = `<p class="error-message">${error.message}</p>`;
        }
    }

    // --- EVENT LISTENERS ATUALIZADOS ---
    filterId.addEventListener('keyup', aplicarFiltros);
    filterSolicitante.addEventListener('keyup', aplicarFiltros);
    filterStatus.addEventListener('change', aplicarFiltros);
    filterPrioridade.addEventListener('change', aplicarFiltros);
    filterDataNecessidade.addEventListener('change', aplicarFiltros);

    container.addEventListener('click', function(event) {
        const detalhesButton = event.target.closest('.btn-detalhes');
        if(detalhesButton) {
            window.location.href = `detalhes.html?id=${detalhesButton.dataset.id}`;
        }
    });

    carregarDadosIniciais();
});