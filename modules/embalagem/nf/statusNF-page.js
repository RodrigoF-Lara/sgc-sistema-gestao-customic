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
    const leadTimeStatusContent = document.getElementById('leadTimeStatusContent');
    let filteredDataView = [];

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

    function formatarDataHoraLocalSemFuso(valor) {
        if (!valor) return 'N/A';

        if (typeof valor === 'string') {
            const match = valor.match(/^(\d{4})-(\d{2})-(\d{2})[T\s](\d{2}):(\d{2})(?::(\d{2}))?/);
            if (match) {
                const data = new Date(
                    Number(match[1]),
                    Number(match[2]) - 1,
                    Number(match[3]),
                    Number(match[4]),
                    Number(match[5]),
                    Number(match[6] || 0),
                    0
                );
                return data.toLocaleString('pt-BR', {
                    day: '2-digit', month: '2-digit', year: 'numeric',
                    hour: '2-digit', minute: '2-digit', second: '2-digit'
                });
            }
        }

        const data = new Date(valor);
        if (Number.isNaN(data.getTime())) return 'N/A';
        return data.toLocaleString('pt-BR', {
            day: '2-digit', month: '2-digit', year: 'numeric',
            hour: '2-digit', minute: '2-digit', second: '2-digit'
        });
    }

    function parseDataHoraSemFuso(valor) {
        if (!valor) return null;

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

        const data = new Date(valor);
        return Number.isNaN(data.getTime()) ? null : data;
    }

    function formatarDuracaoMinutos(totalMinutos) {
        const minutos = Number(totalMinutos);
        if (!Number.isFinite(minutos) || minutos < 0) return 'N/A';

        const dias = Math.floor(minutos / (60 * 24));
        const horas = Math.floor((minutos % (60 * 24)) / 60);
        const mins = minutos % 60;

        if (dias > 0) return `${dias}d ${horas}h ${mins}min`;
        if (horas > 0) return `${horas}h ${mins}min`;
        return `${mins}min`;
    }

    function processoEhFinalizado(processo) {
        const status = (processo || '').trim().toUpperCase();
        return ['ARMAZENADO', 'FINALIZADO', 'CONCLUIDO', 'CONCLUÍDO'].includes(status);
    }

    /**
     * Corte fixo do indicador de lead time das NFs.
     * Histórico anterior a esta data permanece no sistema, mas não entra na média
     * (status inconsistente no passado).
     */
    const DATA_CORTE_LEAD_TIME_NF = new Date(2026, 6, 20, 0, 0, 0, 0); // 20/07/2026 00:00

    function obterDataCorteLeadTimeNF() {
        return DATA_CORTE_LEAD_TIME_NF;
    }

    function formatarDataCurta(data) {
        if (!data || Number.isNaN(data.getTime())) return '';
        return data.toLocaleDateString('pt-BR', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric'
        });
    }

    /** Só entra no indicador se o fluxo começou a partir de 20/07/2026 (DT_HR_INICIO). */
    function itemElegivelLeadTimeIndicador(item) {
        const inicio = parseDataHoraSemFuso(item.DT_HR_INICIO);
        if (!inicio) return false;
        return inicio.getTime() >= obterDataCorteLeadTimeNF().getTime();
    }

    function filtrarItensLeadTimeIndicador(data) {
        return (data || []).filter(itemElegivelLeadTimeIndicador);
    }

    function calcularLeadTimeTotalItemMinutos(item) {
        const inicio = parseDataHoraSemFuso(item.DT_HR_INICIO);
        if (!inicio) return null;

        const fluxoFinalizado = processoEhFinalizado(item.PROCESSO);
        if (!fluxoFinalizado) {
            return Math.max(0, Math.round((Date.now() - inicio.getTime()) / (1000 * 60)));
        }

        const totalInformado = Number(item.LEAD_TIME_TOTAL_MIN);
        if (Number.isFinite(totalInformado) && totalInformado >= 0) return totalInformado;

        const fim = parseDataHoraSemFuso(item.DT_HR_FIM);
        if (!fim) return null;
        return Math.max(0, Math.round((fim.getTime() - inicio.getTime()) / (1000 * 60)));
    }

    function calcularLeadTimeMedioMinutos(data) {
        // Indicador: apenas itens com início do fluxo a partir de 20/07/2026
        const temposValidos = filtrarItensLeadTimeIndicador(data)
            .map(item => calcularLeadTimeTotalItemMinutos(item))
            .filter(valor => Number.isFinite(valor) && valor >= 0);

        if (temposValidos.length === 0) return null;

        const soma = temposValidos.reduce((acc, atual) => acc + atual, 0);
        return Math.round(soma / temposValidos.length);
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

        const leadTimeMedioMin = calcularLeadTimeMedioMinutos(data);
        const dataCorte = obterDataCorteLeadTimeNF();
        const qtdLeadTime = filtrarItensLeadTimeIndicador(data).length;

        summaryContainer.innerHTML = '';

        const leadTimeCard = document.createElement('div');
        leadTimeCard.className = 'summary-card leadtime-clickable';
        leadTimeCard.id = 'leadTimeMedioCard';
        leadTimeCard.title = `Indicador considera apenas fluxos iniciados a partir de ${formatarDataCurta(dataCorte)}. Dados anteriores permanecem no histórico, mas não entram na média.`;
        leadTimeCard.innerHTML = `
            <h3>Lead Time Médio</h3>
            <p>${formatarDuracaoMinutos(leadTimeMedioMin)}</p>
            <small style="display:block;margin-top:6px;opacity:.85;font-weight:500;">
                Desde ${formatarDataCurta(dataCorte)} · ${qtdLeadTime} item(ns)
            </small>`;
        summaryContainer.appendChild(leadTimeCard);

        for (const status in statusCounts) {
            const count = statusCounts[status];
            const statusClass = 'status-' + status.toLowerCase().replace(/\s+/g, '-').replace(/[^\w-]+/g, '');
            const card = document.createElement('div');
            card.className = `summary-card ${statusClass}`;
            card.innerHTML = `<h3>${status}</h3><p>${count}</p>`;
            summaryContainer.appendChild(card);
        }
    }

    function renderLeadTimePorStatusModal(data) {
        const dataCorte = obterDataCorteLeadTimeNF();
        const dataIndicador = filtrarItensLeadTimeIndicador(data);

        const agregados = dataIndicador.reduce((acc, item) => {
            const status = (item.PROCESSO || 'Indefinido').trim() || 'Indefinido';
            const leadTimeMin = calcularLeadTimeTotalItemMinutos(item);
            if (!Number.isFinite(leadTimeMin) || leadTimeMin < 0) return acc;

            if (!acc[status]) {
                acc[status] = { status, quantidade: 0, somaMinutos: 0 };
            }

            acc[status].quantidade += 1;
            acc[status].somaMinutos += leadTimeMin;
            return acc;
        }, {});

        const linhas = Object.values(agregados)
            .map(item => ({
                status: item.status,
                quantidade: item.quantidade,
                mediaMinutos: Math.round(item.somaMinutos / item.quantidade)
            }))
            .sort((a, b) => b.quantidade - a.quantidade || a.status.localeCompare(b.status, 'pt-BR'));

        if (linhas.length === 0) {
            leadTimeStatusContent.innerHTML = `
                <p class="info-message">
                    Sem dados suficientes para o indicador com os filtros atuais.
                    <br><br>
                    O lead time médio considera apenas fluxos <strong>iniciados a partir de ${formatarDataCurta(dataCorte)}</strong>,
                    para não distorcer o indicador com histórico antigo de troca de status.
                </p>`;
            return;
        }

        const mediaGeral = calcularLeadTimeMedioMinutos(data);

        leadTimeStatusContent.innerHTML = `
            <div class="info-message" style="margin-bottom: 10px;">
                <strong>Média Geral:</strong> ${formatarDuracaoMinutos(mediaGeral)}
                <br>
                <strong>Itens considerados:</strong> ${linhas.reduce((acc, item) => acc + item.quantidade, 0)}
                <br>
                <strong>Período do indicador:</strong> a partir de ${formatarDataCurta(dataCorte)}
                <br>
                <span style="opacity:.85;">Registros anteriores permanecem no sistema e no histórico da NF, mas não entram nesta média.</span>
            </div>
            <table id="leadTimeStatusTable">
                <thead>
                    <tr>
                        <th>Status</th>
                        <th>Quantidade de Itens</th>
                        <th>Lead Time Médio</th>
                    </tr>
                </thead>
                <tbody>
                    ${linhas.map(linha => `
                        <tr>
                            <td>${linha.status}</td>
                            <td>${linha.quantidade}</td>
                            <td>${formatarDuracaoMinutos(linha.mediaMinutos)}</td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        `;
    }

    /**
     * Busca os dados da API com base no tipo de produto e renderiza a tela.
     */
    async function fetchDataAndRender() {
        const tipoProdutoSelecionado = filters.tipoProduto.value;
        try {
            container.innerHTML = `<div class="loader-container"><div class="loader"></div><p>Buscando dados...</p></div>`;
            summaryContainer.innerHTML = ''; // Limpa o resumo durante a carga

            const response = await fetch(`/api/embalagem/statusNF?tipoProduto=${tipoProdutoSelecionado}`);
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
                    <th>NF</th><th>Código</th><th>Descrição</th><th>Quantidade</th><th>Usuário</th><th>Data</th><th>Hora</th><th>Último Status</th><th>Lead Time Total</th><th>Ações</th>
                </tr>
            </thead>
            <tbody></tbody>`;
        const tbody = table.querySelector('tbody');
        data.forEach(item => {
            const dataFormatada = formatarDataUTC(item.DT);
            const leadTimeTotalMin = calcularLeadTimeTotalItemMinutos(item);
            const leadTimeTotal = formatarDuracaoMinutos(leadTimeTotalMin);
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
                <td data-label="Lead Time Total">${leadTimeTotal}</td>
                <td class="actions-cell" data-label="Ações">
                    <button class="btn-detalhes btn-update" 
                            data-nf="${item.NF}" data-codigo="${item.CODIGO}" 
                            data-id-nf="${item.ID_NF}" data-id-nf-prod="${item.ID_NF_PROD}" 
                            data-qnt="${item.QNT}" 
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
        filteredDataView = filteredData;
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
            updateForm.dataset.qnt = data.qnt;
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
            const response = await fetch(`/api/embalagem/statusNF?acao=log&nf=${nf}&codigo=${codigo}`);
            if (!response.ok) throw new Error((await response.json()).message || 'Falha ao buscar log.');
            const logData = await response.json();

            if (logData.length === 0) {
                logContent.innerHTML = '<p>Nenhum histórico encontrado para este item.</p>';
                return;
            }

            const logComDuracao = logData.map((entry, index) => {
                const ultimoEntry = logData[logData.length - 1];
                const fluxoFinalizado = processoEhFinalizado(ultimoEntry?.PROCESSO);
                const atual = parseDataHoraSemFuso(entry.DT_HR_EVENTO);
                const proximo = index < logData.length - 1 ? parseDataHoraSemFuso(logData[index + 1].DT_HR_EVENTO) : null;
                let diffMin = null;
                let emAberto = false;

                if (proximo && atual) {
                    diffMin = Math.max(0, Math.round((proximo.getTime() - atual.getTime()) / (1000 * 60)));
                } else if (!fluxoFinalizado && atual) {
                    diffMin = Math.max(0, Math.round((Date.now() - atual.getTime()) / (1000 * 60)));
                    emAberto = true;
                }

                return {
                    ...entry,
                    TEMPO_ATE_PROXIMO: diffMin,
                    TEMPO_EM_ABERTO: emAberto
                };
            });

            const inicio = parseDataHoraSemFuso(logData[0].DT_HR_EVENTO);
            const ultimoEvento = logData[logData.length - 1];
            const fluxoFinalizado = processoEhFinalizado(ultimoEvento?.PROCESSO);
            const fim = fluxoFinalizado ? parseDataHoraSemFuso(ultimoEvento.DT_HR_EVENTO) : new Date();
            const totalMin = inicio && fim
                ? Math.max(0, Math.round((fim.getTime() - inicio.getTime()) / (1000 * 60)))
                : null;

            logContent.innerHTML = `
                <div class="info-message" style="margin-bottom: 10px;">
                    <strong>Lead Time Total:</strong> ${fluxoFinalizado ? formatarDuracaoMinutos(totalMin) : `Em aberto: ${formatarDuracaoMinutos(totalMin)}`}
                    <br>
                    <strong>Início:</strong> ${formatarDataHoraLocalSemFuso(logData[0].DT_HR_EVENTO)}
                    <br>
                    <strong>Fim:</strong> ${fluxoFinalizado ? formatarDataHoraLocalSemFuso(ultimoEvento.DT_HR_EVENTO) : 'Em andamento'}
                </div>
                <table id="logTable">
                    <thead><tr><th>Data</th><th>Hora</th><th>Usuário</th><th>Processo</th><th>Tempo até próximo status</th></tr></thead>
                    <tbody>
                        ${logComDuracao.map(entry => `
                            <tr>
                                <td>${formatarDataUTC(entry.DT)}</td>
                                <td>${entry.HH}</td>
                                <td>${entry.USUARIO}</td>
                                <td>${entry.PROCESSO}</td>
                                <td>${entry.TEMPO_ATE_PROXIMO === null ? '-' : (entry.TEMPO_EM_ABERTO ? `Em aberto: ${formatarDuracaoMinutos(entry.TEMPO_ATE_PROXIMO)}` : formatarDuracaoMinutos(entry.TEMPO_ATE_PROXIMO))}</td>
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
        const { nf, codigo, idNf, idNfProd, qnt } = updateForm.dataset;
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
            const response = await fetch('/api/embalagem/statusNF', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ acao: 'atualizarStatus', nf, codigo, processo, usuario, id_nf: idNf, id_nf_prod: idNfProd, qnt })
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

            if (processo && processo.toUpperCase() === 'ARMAZENADO' && window.SGCNotifications) {
                SGCNotifications.add(
                    'nf-armazenada',
                    `NF ${nf} armazenada`,
                    `Código: ${codigo} | Por: ${usuario || 'Sistema'}`
                );
            }

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

    summaryContainer.addEventListener('click', function(e) {
        const leadTimeCard = e.target.closest('#leadTimeMedioCard');
        if (!leadTimeCard) return;

        renderLeadTimePorStatusModal(filteredDataView);
        openModal('leadTimeStatusModal', {});
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

    // Atualiza tempos em aberto sem exigir recarga manual da página
    setInterval(() => {
        if (allData.length > 0) {
            applyFilters();
        }
    }, 30000);

    // --- Carga Inicial ---
    fetchDataAndRender();
});