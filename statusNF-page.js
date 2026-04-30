document.addEventListener('DOMContentLoaded', function() {
    const container = document.getElementById('status-container');
    const summaryContainer = document.getElementById('summary-container');
    let allData = []; // Armazena os dados atualmente exibidos

    // --- Elementos dos Modais ---
    const updateModal = document.getElementById('updateModal');
    const updateForm = document.getElementById('updateForm');
    const modalStatus = document.getElementById('modalStatus');
    const logModal = document.getElementById('logModal');
    const logContent = document.getElementById('logContent');

    // --- Elementos de Filtro ---
    const filters = {
        tipoProduto: document.getElementById('filterTipoProduto'),
        nf: document.getElementById('filterNF'),
        codigo: document.getElementById('filterCodigo'),
        descricao: document.getElementById('filterDescricao'),
        usuario: document.getElementById('filterUsuario'),
        data: document.getElementById('filterData'),
        processo: document.getElementById('filterProcesso')
    };

    // --- FUNÇÕES ---

    /**
     * Formata uma data ISO para o formato "dd/mm/yyyy" tratando como UTC.
     */
    function formatarDataUTC(dateString) {
        if (!dateString) return 'N/A';
        const data = new Date(dateString);
        return data.toLocaleDateString('pt-BR', { timeZone: 'UTC' });
    }

    /**
     * Popula o filtro de status com valores únicos da base de dados.
     */
    function populateStatusFilter(data) {
        const uniqueStatuses = [...new Set(data.map(item => item.PROCESSO))];
        filters.processo.innerHTML = '<option value="">Todos os Status</option>';
        uniqueStatuses.sort().forEach(status => {
            const option = document.createElement('option');
            option.value = status;
            option.textContent = status;
            filters.processo.appendChild(option);
        });
    }

    /**
     * Renderiza os cards de totalizadores por status.
     */
    function renderSummary(data) {
        const statusCounts = data.reduce((acc, item) => {
            const status = item.PROCESSO || 'Indefinido';
            acc[status] = (acc[status] || 0) + 1;
            return acc;
        }, {});

        summaryContainer.innerHTML = '';
        for (const status in statusCounts) {
            const count = statusCounts[status];
            const statusClass = 'status-' + status.toLowerCase().replace(/\s+/g, '-').replace(/[^\w-]+/g, '');
            const card = document.createElement('div');
            card.className = `summary-card ${statusClass}`;
            card.innerHTML = `<h3>${status}</h3><p>${count}</p>`;
            summaryContainer.appendChild(card);
        }
    }

    /**
     * Busca os dados da API com base no tipo de produto e renderiza a tela.
     */
    async function fetchDataAndRender() {
        const tipoProdutoSelecionado = filters.tipoProduto.value;
        try {
            container.innerHTML = `<div class="loader-container"><div class="loader"></div><p>Buscando dados...</p></div>`;
            summaryContainer.innerHTML = ''; // Limpa o resumo durante a carga

            const response = await fetch(`/api/statusNF?tipoProduto=${tipoProdutoSelecionado}`);
            if (!response.ok) throw new Error((await response.json()).message || 'Falha ao buscar dados.');
            
            allData = await response.json();
            populateStatusFilter(allData);
            applyFilters(); // Aplica os filtros de texto aos novos dados
        } catch (error) {
            console.error("Erro ao carregar dados:", error);
            container.innerHTML = `<p class="error-message">Não foi possível carregar os dados: ${error.message}</p>`;
            summaryContainer.innerHTML = '';
        }
    }

    /**
     * Renderiza a tabela principal de forma responsiva.
     */
    function renderTable(data) {
        container.innerHTML = '';
        if (data.length === 0) {
            container.innerHTML = '<p class="info-message">Nenhum registro encontrado com os filtros aplicados.</p>';
            return;
        }
        const table = document.createElement('table');
        table.className = 'consulta-table';
        table.innerHTML = `
            <thead>
                <tr>
                    <th>NF</th><th>Código</th><th>Descrição</th><th>Quantidade</th><th>Usuário</th><th>Data</th><th>Hora</th><th>Último Status</th><th>Ações</th>
                </tr>
            </thead>
            <tbody></tbody>`;
        const tbody = table.querySelector('tbody');
        data.forEach(item => {
            const dataFormatada = formatarDataUTC(item.DT);
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td data-label="NF">${item.NF}</td>
                <td data-label="Código">${item.CODIGO}</td>
                <td data-label="Descrição">${item.DESCRICAO || 'N/A'}</td>
                <td data-label="Quantidade">${item.QNT || 0}</td>
                <td data-label="Usuário">${item.USUARIO}</td>
                <td data-label="Data">${dataFormatada}</td>
                <td data-label="Hora">${item.HH}</td>
                <td data-label="Último Status">${item.PROCESSO}</td>
                <td class="actions-cell" data-label="Ações">
                    <button class="btn-detalhes btn-update" 
                            data-nf="${item.NF}" data-codigo="${item.CODIGO}" 
                            data-id-nf="${item.ID_NF}" data-id-nf-prod="${item.ID_NF_PROD}" 
                            title="Alterar Status">
                        <i class="fa-solid fa-pen-to-square"></i>
                    </button>
                    <button class="btn-detalhes btn-log" 
                            data-nf="${item.NF}" data-codigo="${item.CODIGO}" 
                            title="Ver Histórico">
                        <i class="fa-solid fa-list-ul"></i>
                    </button>
                </td>`;
            tbody.appendChild(tr);
        });
        container.appendChild(table);
    }

    /**
     * Aplica os filtros de texto/data nos dados já carregados.
     */
    function applyFilters() {
        const filterValues = {
            nf: filters.nf.value.toLowerCase(),
            codigo: filters.codigo.value.toLowerCase(),
            descricao: filters.descricao.value.toLowerCase(),
            usuario: filters.usuario.value.toLowerCase(),
            data: filters.data.value,
            processo: filters.processo.value
        };

        const filteredData = allData.filter(item => {
            const itemDate = new Date(item.DT).toISOString().split('T')[0];
            const itemDescricao = (item.DESCRICAO || '').toLowerCase();

            return (
                item.NF.toLowerCase().includes(filterValues.nf) &&
                item.CODIGO.toLowerCase().includes(filterValues.codigo) &&
                itemDescricao.includes(filterValues.descricao) &&
                item.USUARIO.toLowerCase().includes(filterValues.usuario) &&
                (!filterValues.data || itemDate === filterValues.data) &&
                (!filterValues.processo || item.PROCESSO === filterValues.processo)
            );
        });
        renderTable(filteredData);
        renderSummary(filteredData);
    }

    /**
     * Abre um modal específico.
     */
    function openModal(modalId, data) {
        const modal = document.getElementById(modalId);
        if (modalId === 'updateModal') {
            document.getElementById('modalNF').textContent = data.nf;
            document.getElementById('modalCodigo').textContent = data.codigo;
            updateForm.dataset.nf = data.nf;
            updateForm.dataset.codigo = data.codigo;
            updateForm.dataset.idNf = data.idNf;
            updateForm.dataset.idNfProd = data.idNfProd;
            modalStatus.textContent = '';
            updateForm.reset();
        } else if (modalId === 'logModal') {
            document.getElementById('logModalNF').textContent = data.nf;
            document.getElementById('logModalCodigo').textContent = data.codigo;
            fetchAndDisplayLog(data.nf, data.codigo);
        }
        modal.style.display = 'block';
    }

    /**
     * Fecha um modal específico.
     */
    function closeModal(modalId) {
        document.getElementById(modalId).style.display = 'none';
    }

    /**
     * Busca e exibe o histórico (log) de um item no modal.
     */
    async function fetchAndDisplayLog(nf, codigo) {
        logContent.innerHTML = `<div class="loader"></div>`;
        try {
            const response = await fetch(`/api/statusNF?acao=log&nf=${nf}&codigo=${codigo}`);
            if (!response.ok) throw new Error((await response.json()).message || 'Falha ao buscar log.');
            const logData = await response.json();

            if (logData.length === 0) {
                logContent.innerHTML = '<p>Nenhum histórico encontrado para este item.</p>';
                return;
            }
            logContent.innerHTML = `
                <table id="logTable">
                    <thead><tr><th>Data</th><th>Hora</th><th>Usuário</th><th>Processo</th></tr></thead>
                    <tbody>
                        ${logData.map(entry => `
                            <tr>
                                <td>${formatarDataUTC(entry.DT)}</td>
                                <td>${entry.HH}</td>
                                <td>${entry.USUARIO}</td>
                                <td>${entry.PROCESSO}</td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>`;
        } catch (error) {
            logContent.innerHTML = `<p class="error-message">Erro ao carregar histórico: ${error.message}</p>`;
        }
    }

    /**
     * Lida com o envio do formulário de atualização de status.
     */
   // ...existing code...
    async function handleUpdateSubmit(e) {
        e.preventDefault();
        const { nf, codigo, idNf, idNfProd } = updateForm.dataset;
        const processo = document.getElementById('novoProcesso').value;
        const usuario = localStorage.getItem('userName');
        if (!processo) {
            modalStatus.textContent = "Selecione um processo.";
            modalStatus.style.color = "#c00";
            return;
        }
        modalStatus.textContent = "Salvando...";
        modalStatus.style.color = "#222";
        try {
            const response = await fetch('/api/statusNF', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ acao: 'atualizarStatus', nf, codigo, processo, usuario, id_nf: idNf, id_nf_prod: idNfProd })
            });

            // tenta parsear JSON; se falhar, usa texto bruto para erro
            const raw = await response.text();
            let result;
            try {
                result = JSON.parse(raw);
            } catch (parseErr) {
                result = { message: raw };
            }

            if (!response.ok) throw new Error(result.message || 'Erro ao salvar.');

            modalStatus.textContent = result.message || 'Alteração salva com sucesso.';
            modalStatus.style.color = "green";
            fetchDataAndRender(); // Recarrega os dados
            setTimeout(() => closeModal('updateModal'), 1500);
        } catch (error) {
            console.error("Erro ao salvar alteração:", error);
            modalStatus.textContent = `Erro: ${error.message}`;
            modalStatus.style.color = "#c00";
        }
    }
// ...existing code...

    // --- EVENT LISTENERS ---

    // Filtro principal de TIPO dispara uma nova busca de dados no servidor
    filters.tipoProduto.addEventListener('change', fetchDataAndRender);

    // Outros filtros aplicam a filtragem nos dados já carregados (client-side)
    ['nf', 'codigo', 'descricao', 'usuario', 'data', 'processo'].forEach(key => {
        const filterElement = filters[key];
        if (filterElement) {
            filterElement.addEventListener('keyup', applyFilters);
            filterElement.addEventListener('change', applyFilters);
        }
    });
    
    // Listener para os botões de Ações na tabela
    container.addEventListener('click', function(e) {
        const updateBtn = e.target.closest('.btn-update');
        const logBtn = e.target.closest('.btn-log');
        if (updateBtn) {
            openModal('updateModal', { ...updateBtn.dataset });
        } else if (logBtn) {
            openModal('logModal', { ...logBtn.dataset });
        }
    });
    
    // Listeners para fechar os modais
    document.querySelectorAll('.close-btn').forEach(btn => {
        btn.addEventListener('click', () => closeModal(btn.dataset.modalId));
    });

    window.addEventListener('click', function(e) {
        if (e.target.classList.contains('modal')) {
            closeModal(e.target.id);
        }
    });

    // Listener para o formulário de update
    updateForm.addEventListener('submit', handleUpdateSubmit);

    // --- Carga Inicial ---
    fetchDataAndRender();
});