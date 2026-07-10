document.addEventListener('DOMContentLoaded', function() {
    const container = document.getElementById('requisicoes-container');
    const summaryContainer = document.getElementById('summary-container');
    
    // --- ELEMENTOS DE FILTRO ---
    const filterId = document.getElementById('filterId');
    const filterSolicitante = document.getElementById('filterSolicitante');
    const filterStatus = document.getElementById('filterStatus');
    const filterPrioridade = document.getElementById('filterPrioridade');
    const filterDataNecessidade = document.getElementById('filterDataNecessidade');
    const userLevel = localStorage.getItem('userLevel');
    const userName = localStorage.getItem('userName');
    const userCode = localStorage.getItem('userCode');
    
    let todasRequisicoes = []; // Guarda todos os dados do servidor
    let leadTimePopover = null;
    let calendarioProdutivo = {
        horaInicio: '08:00',
        horaFim: '18:00',
        diasAtivos: { seg: true, ter: true, qua: true, qui: true, sex: true, sab: false, dom: false }
    };

    function usuarioEhAdmin() {
        return userLevel === '1' || userLevel === 1 || Number(userLevel) === 1;
    }

    // --- FUNÇÕES AUXILIARES ---
    function formatarData(dataString) {
        if (!dataString) return 'N/A';
        const data = new Date(dataString);
        return data.toLocaleDateString('pt-BR', { timeZone: 'UTC' });
    }

    function formatarDataHora(data) {
        if (!data || Number.isNaN(data.getTime())) return 'N/A';

        return data.toLocaleString('pt-BR', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit'
        });
    }

    function parseDataHoraSemFuso(valor) {
        if (!valor) return null;

        if (valor instanceof Date) {
            if (Number.isNaN(valor.getTime())) return null;
            return new Date(
                valor.getUTCFullYear(),
                valor.getUTCMonth(),
                valor.getUTCDate(),
                valor.getUTCHours(),
                valor.getUTCMinutes(),
                valor.getUTCSeconds(),
                valor.getUTCMilliseconds()
            );
        }

        if (typeof valor === 'string') {
            const match = valor.match(/^(\d{4})-(\d{2})-(\d{2})[T\s](\d{2}):(\d{2})(?::(\d{2}))?/);
            if (match) {
                return new Date(
                    Number(match[1]),
                    Number(match[2]) - 1,
                    Number(match[3]),
                    Number(match[4]),
                    Number(match[5]),
                    Number(match[6] || 0),
                    0
                );
            }
        }

        const parsed = new Date(valor);
        return Number.isNaN(parsed.getTime()) ? null : parsed;
    }

    function padronizarStatus(status) {
        let statusLimpo = (status || 'Pendente').trim();
        if (statusLimpo === '') return 'Pendente';
        if (statusLimpo.toUpperCase() === 'CONCLUIDO') return 'Concluído';
        return statusLimpo;
    }

    function montarDataHoraRequisicao(req) {
        if (!req?.DT_REQUISICAO) return null;

        let dataBase = null;
        if (typeof req.DT_REQUISICAO === 'string') {
            const match = req.DT_REQUISICAO.match(/^(\d{4})-(\d{2})-(\d{2})/);
            if (match) {
                dataBase = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 0, 0, 0, 0);
            }
        }

        if (!dataBase) {
            const parsed = new Date(req.DT_REQUISICAO);
            if (Number.isNaN(parsed.getTime())) return null;
            dataBase = new Date(parsed.getUTCFullYear(), parsed.getUTCMonth(), parsed.getUTCDate(), 0, 0, 0, 0);
        }

        const horaTexto = (req.HR_REQUSICAO || '').trim();
        const horaMatch = horaTexto.match(/(\d{1,2}):(\d{2})(?::(\d{2}))?/);

        if (!horaMatch) return dataBase;

        const horas = Number(horaMatch[1]);
        const minutos = Number(horaMatch[2]);
        const segundos = Number(horaMatch[3] || 0);

        dataBase.setHours(horas, minutos, segundos, 0);
        return dataBase;
    }

    function diaProdutivo(dateObj) {
        const diaSemana = dateObj.getDay(); // 0=dom, 1=seg ... 6=sab
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

    function calcularLeadTimeMs(req) {
        const inicio = montarDataHoraRequisicao(req);
        const fim = req.DT_CONCLUSAO ? parseDataHoraSemFuso(req.DT_CONCLUSAO) : new Date();

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

    function obterTooltipLeadTime(req) {
        const solicitacao = formatarDataHora(montarDataHoraRequisicao(req));
        const conclusao = req.DT_CONCLUSAO ? formatarDataHora(parseDataHoraSemFuso(req.DT_CONCLUSAO)) : 'Em aberto';

        return `Solicitação: ${solicitacao}\nConclusão: ${conclusao}`;
    }

    function fecharPopoverLeadTime() {
        if (!leadTimePopover) return;
        leadTimePopover.remove();
        leadTimePopover = null;
    }

    function exibirDetalhesLeadTime(req, anchorEl) {
        const solicitacao = formatarDataHora(montarDataHoraRequisicao(req));
        const conclusao = req.DT_CONCLUSAO ? formatarDataHora(parseDataHoraSemFuso(req.DT_CONCLUSAO)) : 'Em aberto';

        const idReqAtual = String(req.ID_REQ || '');
        if (leadTimePopover && leadTimePopover.dataset.idReq === idReqAtual) {
            fecharPopoverLeadTime();
            return;
        }

        fecharPopoverLeadTime();

        const popover = document.createElement('div');
        popover.className = 'lead-time-popover';
        popover.dataset.idReq = idReqAtual;
        popover.style.position = 'fixed';
        popover.style.zIndex = '1200';
        popover.style.background = '#ffffff';
        popover.style.border = '1px solid #d9e2ec';
        popover.style.borderRadius = '10px';
        popover.style.boxShadow = '0 10px 24px rgba(15, 23, 42, 0.16)';
        popover.style.padding = '10px 12px';
        popover.style.minWidth = '250px';
        popover.style.maxWidth = '320px';
        popover.style.fontSize = '12px';
        popover.style.lineHeight = '1.4';
        popover.style.color = '#1f2937';

        const titulo = document.createElement('div');
        titulo.textContent = 'Detalhes do Lead Time';
        titulo.style.fontWeight = '700';
        titulo.style.marginBottom = '6px';

        const linhaSolicitacao = document.createElement('div');
        linhaSolicitacao.textContent = `Solicitação: ${solicitacao}`;

        const linhaConclusao = document.createElement('div');
        linhaConclusao.textContent = `Conclusão: ${conclusao}`;

        popover.appendChild(titulo);
        popover.appendChild(linhaSolicitacao);
        popover.appendChild(linhaConclusao);
        document.body.appendChild(popover);

        const rect = anchorEl.getBoundingClientRect();
        const popRect = popover.getBoundingClientRect();
        const margem = 8;

        let top = rect.bottom + margem;
        if (top + popRect.height > window.innerHeight - margem) {
            top = rect.top - popRect.height - margem;
        }
        if (top < margem) top = margem;

        let left = rect.left;
        if (left + popRect.width > window.innerWidth - margem) {
            left = window.innerWidth - popRect.width - margem;
        }
        if (left < margem) left = margem;

        popover.style.top = `${top}px`;
        popover.style.left = `${left}px`;
        leadTimePopover = popover;
    }

    function formatarLeadTime(ms) {
        if (ms === null) return 'N/A';

        const totalMinutos = Math.max(1, Math.round(ms / (1000 * 60)));
        const dias = Math.floor(totalMinutos / (60 * 24));
        const horas = Math.floor((totalMinutos % (60 * 24)) / 60);
        const minutos = totalMinutos % 60;

        if (dias > 0) return `${dias}d ${horas}h ${minutos}min`;
        if (horas > 0) return `${horas}h ${minutos}min`;
        return `${minutos}min`;
    }

    function obterTextoLeadTime(req) {
        const leadTimeMs = calcularLeadTimeMs(req);
        const status = padronizarStatus(req.STATUS);
        const leadTime = formatarLeadTime(leadTimeMs);

        if (leadTime === 'N/A') return leadTime;

        return status === 'Concluído' ? leadTime : `Em aberto: ${leadTime}`;
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
                    <th>ID</th><th>Data</th><th>Solicitante</th><th>Prioridade</th><th>Status</th><th>Lead Time</th><th>Nº de Itens</th><th>Ações</th>
                </tr>
            </thead>
            <tbody>
                ${listaDeRequisicoes.map(req => {
                    const prioridade = (req.PRIORIDADE || 'NORMAL').trim();
                    const status = padronizarStatus(req.STATUS);
                    const statusClass = status ? status.replace(/\s/g, '-').toLowerCase() : 'pendente';
                    return `
                    <tr>
                        <td>${req.ID_REQ || '-'}</td>
                        <td>${formatarData(req.DT_REQUISICAO)}</td>
                        <td>${req.SOLICITANTE || '-'}</td>
                        <td><span class="prioridade-badge prioridade-${prioridade.toLowerCase()}">${prioridade}</span></td>
                        <td><span class="status-badge status-${statusClass}">${status || 'Pendente'}</span></td>
                        <td>
                            <span
                                class="lead-time-clickable"
                                title="${obterTooltipLeadTime(req)}"
                                data-id-req="${req.ID_REQ}"
                                style="cursor:pointer; text-decoration: underline dotted; text-underline-offset: 2px;"
                            >${obterTextoLeadTime(req)}</span>
                        </td>
                        <td>${req.TOTAL_ITENS || 0}</td>
                        <td>
                            <button class="btn-detalhes" data-id="${req.ID_REQ}">
                                <i class="fa-solid fa-circle-info"></i> Detalhes
                            </button>
                            ${usuarioEhAdmin() ? `
                                <button class="btn-excluir-req" data-id="${req.ID_REQ}" style="margin-left:8px; background:#c0392b;">
                                    <i class="fa-solid fa-trash"></i> Excluir
                                </button>
                            ` : ''}
                        </td>
                    </tr>
                `}).join('')}
            </tbody>
        `;
        container.appendChild(table);
    }

    async function excluirRequisicao(idReq) {
        if (!usuarioEhAdmin()) {
            alert('Apenas usuários ADMIN podem excluir requisições.');
            return;
        }

        const motivo = prompt(`Informe o motivo da exclusão da requisição #${idReq}:`);
        if (motivo === null) return;
        if (!motivo.trim()) {
            alert('O motivo da exclusão é obrigatório para auditoria.');
            return;
        }

        const confirmado = confirm(`Confirma excluir a requisição #${idReq}? Esta ação remove cabeçalho e itens.`);
        if (!confirmado) return;

        try {
            const response = await fetch('/api/embalagem/requisicao', {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    idReq,
                    usuario: userName || 'Usuário não identificado',
                    usuarioCodigo: userCode || '',
                    motivo: motivo.trim()
                })
            });

            const result = await response.json();
            if (!response.ok) {
                const detalhe = result.details ? ` (${result.details})` : '';
                throw new Error((result.message || 'Falha ao excluir requisição.') + detalhe);
            }

            todasRequisicoes = todasRequisicoes.filter(req => Number(req.ID_REQ) !== Number(idReq));
            popularFiltroStatus(todasRequisicoes);
            aplicarFiltros();
            alert(result.message || 'Requisição excluída com sucesso.');
        } catch (error) {
            alert(`Erro ao excluir requisição: ${error.message}`);
        }
    }

    function atualizarSumario(listaDeRequisicoes) {
        const total = listaDeRequisicoes.length;
        const pendentes = listaDeRequisicoes.filter(r => padronizarStatus(r.STATUS) === 'Pendente').length;
        const concluidas = listaDeRequisicoes.filter(r => padronizarStatus(r.STATUS) === 'Concluído').length;
        const emAndamento = total - pendentes - concluidas;
        const concluidasComLeadTime = listaDeRequisicoes
            .filter(r => padronizarStatus(r.STATUS) === 'Concluído')
            .map(calcularLeadTimeMs)
            .filter(ms => ms !== null);
        const leadTimeMedioMs = concluidasComLeadTime.length > 0
            ? concluidasComLeadTime.reduce((acumulado, ms) => acumulado + ms, 0) / concluidasComLeadTime.length
            : null;

        summaryContainer.innerHTML = `
            <div class="summary-card"><h3>Total</h3><p>${total}</p></div>
            <div class="summary-card"><h3>Pendentes</h3><p>${pendentes}</p></div>
            <div class="summary-card"><h3>Em Andamento</h3><p>${emAndamento}</p></div>
            <div class="summary-card"><h3>Concluídas</h3><p>${concluidas}</p></div>
            <div class="summary-card"><h3>Lead Time Médio</h3><p>${formatarLeadTime(leadTimeMedioMs)}</p></div>
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
        atualizarSumario(requisicoesFiltradas);
    }
    
    async function carregarDadosIniciais() {
        try {
            container.innerHTML = '<div class="loader-container"><div class="loader"></div><p>Buscando requisições...</p></div>';
            const [responseReqs, responseCal] = await Promise.all([
                fetch('/api/embalagem/requisicao'),
                fetch('/api/shared/config?tipo=calendarioProdutivo&action=get')
            ]);

            if (!responseReqs.ok) throw new Error('Falha ao buscar dados do servidor.');

            todasRequisicoes = await responseReqs.json();

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
            return;
        }

        const excluirButton = event.target.closest('.btn-excluir-req');
        if (excluirButton) {
            excluirRequisicao(excluirButton.dataset.id);
            return;
        }

        const leadTimeElement = event.target.closest('.lead-time-clickable');
        if (leadTimeElement) {
            const idReqLeadTime = Number(leadTimeElement.dataset.idReq);
            const req = todasRequisicoes.find(item => Number(item.ID_REQ) === idReqLeadTime);
            if (req) {
                exibirDetalhesLeadTime(req, leadTimeElement);
            }
            return;
        }

        if (leadTimePopover && !event.target.closest('.lead-time-popover')) {
            fecharPopoverLeadTime();
        }
    });

    window.addEventListener('scroll', fecharPopoverLeadTime, true);
    window.addEventListener('resize', fecharPopoverLeadTime);

    carregarDadosIniciais();
});