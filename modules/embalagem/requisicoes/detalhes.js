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
    let calendarioProdutivo = {
        horaInicio: '08:00',
        horaFim: '18:00',
        diasAtivos: { seg: true, ter: true, qua: true, qui: true, sex: true, sab: false, dom: false }
    };

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

    function montarDataHoraRequisicao(header) {
        if (!header?.DT_REQUISICAO) return null;

        const dataBase = new Date(header.DT_REQUISICAO);
        if (Number.isNaN(dataBase.getTime())) return null;

        const horaTexto = (header.HR_REQUSICAO || '').trim();
        const horaMatch = horaTexto.match(/(\d{1,2}):(\d{2})(?::(\d{2}))?/);

        if (!horaMatch) return dataBase;

        dataBase.setHours(Number(horaMatch[1]), Number(horaMatch[2]), Number(horaMatch[3] || 0), 0);
        return dataBase;
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

    function formatarDataHora(data) {
        if (!data || Number.isNaN(data.getTime())) return 'N/A';
        return data.toLocaleString('pt-BR', {
            day: '2-digit', month: '2-digit', year: 'numeric',
            hour: '2-digit', minute: '2-digit', second: '2-digit'
        });
    }

    function diaProdutivo(dateObj) {
        const diaSemana = dateObj.getDay();
        const diasAtivos = calendarioProdutivo.diasAtivos || {};
        if (diaSemana === 1) return diasAtivos.seg !== false;
        if (diaSemana === 2) return diasAtivos.ter !== false;
        if (diaSemana === 3) return diasAtivos.qua !== false;
        if (diaSemana === 4) return diasAtivos.qui !== false;
        if (diaSemana === 5) return diasAtivos.sex !== false;
        if (diaSemana === 6) return diasAtivos.sab === true;
        return diasAtivos.dom === true;
    }

    function parseHoraParaMinutos(hora) {
        const partes = String(hora || '').split(':');
        if (partes.length < 2) return null;
        const hh = Number(partes[0]);
        const mm = Number(partes[1]);
        if (!Number.isFinite(hh) || !Number.isFinite(mm)) return null;
        return hh * 60 + mm;
    }

    function construirDiaComMinutos(baseDate, minutosDia) {
        const data = new Date(baseDate.getFullYear(), baseDate.getMonth(), baseDate.getDate(), 0, 0, 0, 0);
        data.setMinutes(minutosDia);
        return data;
    }

    function calcularLeadTimeMs(header) {
        const inicio = montarDataHoraRequisicao(header);
        const fim = header?.DT_CONCLUSAO ? new Date(header.DT_CONCLUSAO) : new Date();

        if (!inicio || Number.isNaN(inicio.getTime()) || Number.isNaN(fim.getTime())) return null;

        if (fim <= inicio) return 0;

        const inicioMin = parseHoraParaMinutos(calendarioProdutivo.horaInicio);
        const fimMin = parseHoraParaMinutos(calendarioProdutivo.horaFim);
        if (inicioMin === null || fimMin === null || inicioMin >= fimMin) return Math.max(0, fim.getTime() - inicio.getTime());

        let totalMs = 0;
        let cursor = new Date(inicio.getFullYear(), inicio.getMonth(), inicio.getDate(), 0, 0, 0, 0);
        const ultimoDia = new Date(fim.getFullYear(), fim.getMonth(), fim.getDate(), 0, 0, 0, 0);

        while (cursor <= ultimoDia) {
            if (diaProdutivo(cursor)) {
                const janelaInicio = construirDiaComMinutos(cursor, inicioMin);
                const janelaFim = construirDiaComMinutos(cursor, fimMin);

                const inicioEfetivo = inicio > janelaInicio ? inicio : janelaInicio;
                const fimEfetivo = fim < janelaFim ? fim : janelaFim;

                if (fimEfetivo > inicioEfetivo) {
                    totalMs += fimEfetivo.getTime() - inicioEfetivo.getTime();
                }
            }

            cursor.setDate(cursor.getDate() + 1);
        }

        return totalMs;
    }

    function formatarLeadTime(ms) {
        if (ms === null) return 'N/A';

        const totalMinutos = Math.round(ms / (1000 * 60));
        const dias = Math.floor(totalMinutos / (60 * 24));
        const horas = Math.floor((totalMinutos % (60 * 24)) / 60);
        const minutos = totalMinutos % 60;

        if (dias > 0) return `${dias}d ${horas}h ${minutos}min`;
        if (horas > 0) return `${horas}h ${minutos}min`;
        return `${minutos}min`;
    }

    // --- FUNÇÕES DE RENDERIZAÇÃO ---
    function renderHeader(header) {
        const dataRequisicao = formatarDataHora(montarDataHoraRequisicao(header));
        const dataNecessidade = formatarData(header.DT_NECESSIDADE);
        const dataConclusao = header.DT_CONCLUSAO ? formatarDataHoraLocal(header.DT_CONCLUSAO) : 'Em aberto';
        const leadTime = formatarLeadTime(calcularLeadTimeMs(header));
        const prioridade = (header.PRIORIDADE || 'NORMAL').trim();
        const status = (header.STATUS || 'PENDENTE').trim();
        const leadTimeLabel = header.DT_CONCLUSAO ? leadTime : `Em aberto: ${leadTime}`;
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
                            <span class="detalhe-info-label">Solicitação</span>
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
                    <div class="detalhe-info-item">
                        <div class="detalhe-info-icon"><i class="fa-solid fa-calendar-check"></i></div>
                        <div class="detalhe-info-body">
                            <span class="detalhe-info-label">Conclusão</span>
                            <span class="detalhe-info-valor">${dataConclusao}</span>
                        </div>
                    </div>
                    <div class="detalhe-info-item">
                        <div class="detalhe-info-icon"><i class="fa-regular fa-clock"></i></div>
                        <div class="detalhe-info-body">
                            <span class="detalhe-info-label">Lead Time</span>
                            <span class="detalhe-info-valor">${leadTimeLabel}</span>
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
            const [responseDetalhe, responseCal] = await Promise.all([
                fetch(`/api/embalagem/requisicao?id=${idReq}`),
                fetch('/api/shared/config?tipo=calendarioProdutivo&action=get')
            ]);

            const responseData = await responseDetalhe.json();
            if (!responseDetalhe.ok) { throw new Error(responseData.message); }

            if (responseCal.ok) {
                const calData = await responseCal.json();
                if (calData?.config) {
                    calendarioProdutivo = {
                        horaInicio: calData.config.horaInicio || '08:00',
                        horaFim: calData.config.horaFim || '18:00',
                        diasAtivos: {
                            seg: calData.config?.diasAtivos?.seg !== false,
                            ter: calData.config?.diasAtivos?.ter !== false,
                            qua: calData.config?.diasAtivos?.qua !== false,
                            qui: calData.config?.diasAtivos?.qui !== false,
                            sex: calData.config?.diasAtivos?.sex !== false,
                            sab: calData.config?.diasAtivos?.sab === true,
                            dom: calData.config?.diasAtivos?.dom === true
                        }
                    };
                }
            }

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
                ['Data/Hora Solicitação', formatarDataHora(montarDataHoraRequisicao(data.header))],
                ['Data Necessidade', formatarData(data.header.DT_NECESSIDADE)],
                ['Data/Hora Conclusão', data.header.DT_CONCLUSAO ? formatarDataHoraLocal(data.header.DT_CONCLUSAO) : 'Em aberto'],
                ['Lead Time', data.header.DT_CONCLUSAO ? formatarLeadTime(calcularLeadTimeMs(data.header)) : `Em aberto: ${formatarLeadTime(calcularLeadTimeMs(data.header))}`],
                ['Prioridade', (data.header.PRIORIDADE || 'NORMAL').trim()],
                ['Status', (data.header.STATUS || 'PENDENTE').trim()],
                [],
                ['Item', 'Código', 'Descrição', 'Endereços (com saldo)', 'QNT REQ', 'QNT PAGA', 'Saldo', 'Status']
            ];

            data.items.forEach(item => {
                ws_data.push([
                    item.ID_REQ_ITEM,
                    item.CODIGO,
                    item.DESCRICAO_PRODUTO || '',
                    item.ENDERECOS || '-',
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
                { wch: 50 }, // Endereços (com saldo)
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