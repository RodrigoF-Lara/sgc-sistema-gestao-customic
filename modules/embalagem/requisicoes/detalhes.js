document.addEventListener('DOMContentLoaded', async function() {
    // --- ELEMENTOS GLOBAIS ---
    const headerContainer = document.getElementById('detalhe-header-container');
    const itemsContainer = document.getElementById('detalhe-itens-container');
    const urlParams = new URLSearchParams(window.location.search);
    const idReq = urlParams.get('id');
    const bulkActionsContainer = document.getElementById('bulk-actions-container');
    const bulkCounter = document.getElementById('bulk-counter');
    const bulkStatusSelect = document.getElementById('bulk-status-select');
    const bulkApplyBtn = document.getElementById('bulk-apply-btn');
    const logModal = document.getElementById('logModal');
    const logContent = document.getElementById('logContent');

    if (!idReq) {
        headerContainer.innerHTML = "<p class='error-message'>ID da requisição não encontrado.</p>";
        return;
    }

    // --- FUNÇÕES AUXILIARES ---
    function formatarData(dataString) {
        if (!dataString) return 'N/A';
        const data = new Date(dataString);
        return data.toLocaleDateString('pt-BR', { timeZone: 'UTC' });
    }

    // --- NOVA FUNÇÃO PARA FORMATAR DATA E HORA LOCAL ---
    function formatarDataHoraLocal(dataStringUTC) {
        if (!dataStringUTC) return 'N/A';
        const data = new Date(dataStringUTC); 
        return data.toLocaleString('pt-BR', {
            day: '2-digit', month: '2-digit', year: 'numeric',
            hour: '2-digit', minute: '2-digit', second: '2-digit'
        });
    }

    // --- FUNÇÕES DE RENDERIZAÇÃO ---
    function renderHeader(header) {
        const dataRequisicao = formatarData(header.DT_REQUISICAO);
        const dataNecessidade = formatarData(header.DT_NECESSIDADE);
        const prioridade = (header.PRIORIDADE || 'NORMAL').trim();
        const status = (header.STATUS || 'PENDENTE').trim();
        headerContainer.innerHTML = `
            <div class="detalhe-header">
                <div class="detalhe-header-title">
                    <div class="detalhe-numero">
                        <span class="detalhe-numero-label">Requisição</span>
                        <span class="detalhe-numero-valor">#${header.ID_REQ}</span>
                    </div>
                    <div class="detalhe-header-badges">
                        <span class="prioridade-badge prioridade-${prioridade.toLowerCase()}"><i class="fa-solid fa-flag"></i> ${prioridade}</span>
                        <span class="status-badge status-${status.replace(/\s/g, '-').toLowerCase()}"><i class="fa-solid fa-circle-check"></i> ${status}</span>
                    </div>
                </div>
                <div class="detalhe-header-grid">
                    <div class="detalhe-info-item">
                        <div class="detalhe-info-icon"><i class="fa-solid fa-user"></i></div>
                        <div class="detalhe-info-body">
                            <span class="detalhe-info-label">Solicitante</span>
                            <span class="detalhe-info-valor">${header.SOLICITANTE || 'N/A'}</span>
                        </div>
                    </div>
                    <div class="detalhe-info-item">
                        <div class="detalhe-info-icon"><i class="fa-solid fa-calendar-plus"></i></div>
                        <div class="detalhe-info-body">
                            <span class="detalhe-info-label">Data da Requisição</span>
                            <span class="detalhe-info-valor">${dataRequisicao}</span>
                        </div>
                    </div>
                    <div class="detalhe-info-item">
                        <div class="detalhe-info-icon"><i class="fa-solid fa-calendar-day"></i></div>
                        <div class="detalhe-info-body">
                            <span class="detalhe-info-label">Data de Necessidade</span>
                            <span class="detalhe-info-valor">${dataNecessidade}</span>
                        </div>
                    </div>
                </div>
            </div>`;
    }

    function renderItems(items) {
        itemsContainer.innerHTML = '';
        const table = document.createElement('table');
        const statusOptions = ['Pendente', 'Em separação', 'Separado', 'Aguarda coleta', 'Finalizado'];
        const tableRowsHTML = items.map(item => {
            const statusLimpo = (item.STATUS_ITEM || 'Pendente').trim();
            const optionsHTML = statusOptions.map(opt => `<option value="${opt}" ${statusLimpo === opt ? 'selected' : ''}>${opt}</option>`).join('');
            const descricao = item.DESCRICAO_PRODUTO || 'Descrição não encontrada';
            return `<tr><td><input type="checkbox" class="item-checkbox" data-id-req-item="${item.ID_REQ_ITEM}"></td><td>${item.ID_REQ_ITEM}</td><td>${item.CODIGO}</td><td>${descricao}</td><td>${item.QNT_REQ}</td><td>${item.QNT_PAGA}</td><td>${item.SALDO}</td><td><span class="status-badge status-${statusLimpo.replace(/\s/g, '-').toLowerCase()}">${statusLimpo}</span></td><td><div class="acoes-container"><select class="status-select" data-id-req-item="${item.ID_REQ_ITEM}" data-original-status="${statusLimpo}" ${statusLimpo === 'Finalizado' ? 'disabled' : ''}>${optionsHTML}</select><button class="btn-log" data-id-req-item="${item.ID_REQ_ITEM}" title="Ver Histórico"><i class="fa-solid fa-history"></i></button></div></td></tr>`;
        }).join('');
        table.innerHTML = `<thead><tr><th><input type="checkbox" id="select-all-checkbox"></th><th>Item</th><th>Código</th><th>Descrição</th><th>QNT REQ</th><th>QNT PAGA</th><th>Saldo</th><th>Status</th><th>Ações</th></tr></thead><tbody>${tableRowsHTML}</tbody>`;
        itemsContainer.appendChild(table);
    }

    function updateBulkActionBar() {
        const selectedCheckboxes = itemsContainer.querySelectorAll('.item-checkbox:checked');
        const count = selectedCheckboxes.length;
        bulkActionsContainer.style.display = count > 0 ? 'flex' : 'none';
        bulkCounter.textContent = `${count} item(s) selecionado(s)`;
    }

    async function carregarDetalhes() {
        try {
            headerContainer.innerHTML = '<div class="loader-container"><div class="loader"></div></div>';
            itemsContainer.innerHTML = '';
            const response = await fetch(`/api/embalagem/requisicao?id=${idReq}`);
            const responseData = await response.json();
            if (!response.ok) { throw new Error(responseData.message); }
            renderHeader(responseData.header);
            renderItems(responseData.items);
            updateBulkActionBar();
        } catch (error) {
            console.error("Erro ao carregar detalhes:", error);
            headerContainer.innerHTML = `<p class='error-message'>${error.message}</p>`;
        }
    }

    // --- GERENCIADORES DE EVENTOS ---
    itemsContainer.addEventListener('click', async function(event) {
        const btnLog = event.target.closest('.btn-log');
        if (btnLog) {
            const idReqItem = btnLog.dataset.idReqItem;
            logContent.innerHTML = '<div class="loader"></div>';
            logModal.style.display = 'block';
            try {
                const response = await fetch(`/api/embalagem/requisicao?idReqItemLog=${idReqItem}&idReqLog=${idReq}`);
                const logData = await response.json();
                if (!response.ok) throw new Error(logData.message || 'Erro ao buscar histórico.');
                if (logData.length === 0) {
                    logContent.innerHTML = '<p class="info-message">Nenhum histórico de alteração para este item.</p>';
                    return;
                }
                let logHTML = '';
                logData.forEach(entry => {
                    // CORREÇÃO: Usa a nova função para formatar a data/hora local
                    logHTML += `<div class="log-entry"><p>Status alterado de <strong>${entry.STATUS_ANTERIOR || 'N/A'}</strong> para <strong>${entry.STATUS_NOVO}</strong></p><p class="log-meta">Por: <strong>${entry.RESPONSAVEL}</strong> em ${formatarDataHoraLocal(entry.DT_HR_ALTERACAO)}</p></div>`;
                });
                logContent.innerHTML = logHTML;
            } catch(error) {
                logContent.innerHTML = `<p class="error-message">${error.message}</p>`;
            }
        }
    });

    itemsContainer.addEventListener('change', async function(event) {
        const target = event.target;
        if (target.classList.contains('status-select')) {
            const { idReqItem, originalStatus } = target.dataset;
            const novoStatus = target.value;
            const usuario = localStorage.getItem('userName');
            if (confirm(`Alterar status de "${originalStatus}" para "${novoStatus}"?`)) {
                try {
                    target.disabled = true;
                    const response = await fetch('/api/embalagem/requisicao', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'updateStatus', idReqItem, idReq, novoStatus, statusAntigo: originalStatus, usuario }) });
                    const result = await response.json();
                    if (!response.ok) throw new Error(result.message);
                    if (novoStatus === 'Finalizado' && window.SGCNotifications) {
                        SGCNotifications.add(
                            'requisicao-finalizada',
                            `Requisição #${idReq} — item finalizado`,
                            `Por: ${usuario || 'Sistema'}`
                        );
                    }
                    await carregarDetalhes();
                } catch (error) {
                    alert(`Falha: ${error.message}`);
                    target.value = originalStatus;
                    target.disabled = false;
                }
            } else {
                target.value = originalStatus;
            }
        }
        if (target.id === 'select-all-checkbox' || target.classList.contains('item-checkbox')) {
            if (target.id === 'select-all-checkbox') {
                itemsContainer.querySelectorAll('.item-checkbox').forEach(cb => cb.checked = target.checked);
            }
            updateBulkActionBar();
        }
    });

    bulkApplyBtn.addEventListener('click', async () => {
        const selectedCheckboxes = itemsContainer.querySelectorAll('.item-checkbox:checked');
        const itemIds = Array.from(selectedCheckboxes).map(cb => cb.dataset.idReqItem);
        const novoStatus = bulkStatusSelect.value;
        const usuario = localStorage.getItem('userName');
        if (itemIds.length === 0 || !novoStatus || !usuario) {
            return alert('Selecione os itens, um novo status e certifique-se de estar logado.');
        }
        if (confirm(`Tem certeza que deseja alterar ${itemIds.length} item(ns) para o status "${novoStatus}"?`)) {
            try {
                bulkApplyBtn.disabled = true;
                bulkApplyBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Aplicando...';
                const response = await fetch('/api/embalagem/requisicao', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'bulkUpdateStatus', itemIds, idReq, novoStatus, usuario }) });
                const result = await response.json();
                if (!response.ok) throw new Error(result.message);
                alert(result.message);
                if (novoStatus === 'Finalizado' && window.SGCNotifications) {
                    SGCNotifications.add(
                        'requisicao-finalizada',
                        `Requisição #${idReq} finalizada (${itemIds.length} item(ns))`,
                        `Por: ${usuario || 'Sistema'}`
                    );
                }
                await carregarDetalhes();
            } catch (error) {
                alert(`Falha na atualização em massa: ${error.message}`);
            } finally {
                bulkApplyBtn.disabled = false;
                bulkApplyBtn.textContent = 'Aplicar';
                bulkStatusSelect.value = '';
            }
        }
    });

    document.querySelectorAll('.close-btn').forEach(btn => {
        btn.addEventListener('click', () => btn.closest('.modal').style.display = 'none');
    });
    window.addEventListener('click', (event) => {
        if (event.target.classList.contains('modal')) {
            event.target.style.display = 'none';
        }
    });

    // --- EXPORTAR PARA EXCEL ---
    document.getElementById('exportarExcelBtn').addEventListener('click', async function() {
        try {
            const response = await fetch(`/api/embalagem/requisicao?id=${idReq}`);
            if (!response.ok) throw new Error('Erro ao carregar dados');
            const data = await response.json();
            
            const ws_data = [
                ['Requisição Nº', data.header.ID_REQ],
                ['Solicitante', data.header.SOLICITANTE || 'N/A'],
                ['Data Requisição', formatarData(data.header.DT_REQUISICAO)],
                ['Data Necessidade', formatarData(data.header.DT_NECESSIDADE)],
                ['Prioridade', (data.header.PRIORIDADE || 'NORMAL').trim()],
                ['Status', (data.header.STATUS || 'PENDENTE').trim()],
                [],
                ['Item', 'Código', 'Descrição', 'Endereço', 'Armazém', 'QNT REQ', 'QNT PAGA', 'Saldo', 'Status']
            ];

            data.items.forEach(item => {
                ws_data.push([
                    item.ID_REQ_ITEM,
                    item.CODIGO,
                    item.DESCRICAO_PRODUTO || '',
                    item.ENDERECO || '-',
                    item.ARMAZEM || '-',
                    item.QNT_REQ,
                    item.QNT_PAGA,
                    item.SALDO,
                    (item.STATUS_ITEM || 'Pendente').trim()
                ]);
            });

            const ws = XLSX.utils.aoa_to_sheet(ws_data);
            
            // Ajustar largura das colunas
            ws['!cols'] = [
                { wch: 8 },  // Item
                { wch: 12 }, // Código
                { wch: 40 }, // Descrição
                { wch: 15 }, // Endereço
                { wch: 10 }, // Armazém
                { wch: 10 }, // QNT REQ
                { wch: 10 }, // QNT PAGA
                { wch: 10 }, // Saldo
                { wch: 15 }  // Status
            ];

            const wb = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(wb, ws, 'Requisição');
            XLSX.writeFile(wb, `Requisicao_${idReq}_${new Date().toISOString().split('T')[0]}.xlsx`);
        } catch (error) {
            console.error('Erro ao exportar:', error);
            alert('Erro ao exportar para Excel');
        }
    });

    carregarDetalhes();
});