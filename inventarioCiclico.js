document.addEventListener('DOMContentLoaded', function() {
    const gerarListaBtn = document.getElementById('gerarListaBtn');
    const carregarInventariosBtn = document.getElementById('carregarInventariosBtn');
    const adicionarItemBtn = document.getElementById('adicionarItemBtn');
    const salvarInventarioBtn = document.getElementById('salvarInventarioBtn');
    const imprimirInventarioBtn = document.getElementById('imprimirInventarioBtn');
    const exportarExcelBtn = document.getElementById('exportarExcelBtn');
    const finalizarInventarioBtn = document.getElementById('finalizarInventarioBtn');
    const listaInventarioContainer = document.getElementById('listaInventarioContainer');
    const listaInventariosSalvos = document.getElementById('listaInventariosSalvos');
    const tabelaInventario = document.getElementById('tabelaInventario');
    const infoLista = document.getElementById('infoLista');
    const tituloInventario = document.getElementById('tituloInventario');
    const statusMessage = document.getElementById('statusMessage');
    const acuracidadeModal = document.getElementById('acuracidadeModal');
    const acuracidadeContent = document.getElementById('acuracidadeContent');
    const filtroMesInventario = document.getElementById('filtroMesInventario');
    const limparFiltroMesBtn = document.getElementById('limparFiltroMesBtn');

    let inventarioAtual = null;
    let todosInventarios = [];

    gerarListaBtn.addEventListener('click', gerarNovaLista);
    carregarInventariosBtn.addEventListener('click', carregarInventariosSalvos);
    salvarInventarioBtn.addEventListener('click', salvarInventario);
    imprimirInventarioBtn.addEventListener('click', imprimirInventario);
    exportarExcelBtn.addEventListener('click', exportarParaExcel);
    finalizarInventarioBtn.addEventListener('click', finalizarInventario);
    filtroMesInventario.addEventListener('change', aplicarFiltroMes);
    limparFiltroMesBtn.addEventListener('click', limparFiltroMes);

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

    async function gerarNovaLista() {
        try {
            statusMessage.style.color = '#222';
            statusMessage.textContent = 'Gerando lista de inventário...';
            gerarListaBtn.disabled = true;
            gerarListaBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Gerando...';

            const response = await fetch('/api/inventarioCiclico?acao=gerarLista');
            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.message || 'Erro ao gerar lista');
            }

            // ── DEBUG BLOCO 2 ──────────────────────────────────────────
            console.group('📦 DEBUG gerarLista — resposta completa da API');
            console.log('Configuração recebida:', data.configuracao);
            console.log('Blocos (contagens):', data.blocos);
            console.log('Critério:', data.criterio);
            console.log('Total de itens:', data.itens?.length);
            const itensPorBloco = {};
            (data.itens || []).forEach(i => {
                itensPorBloco[i.BLOCO] = itensPorBloco[i.BLOCO] || [];
                itensPorBloco[i.BLOCO].push({ CODIGO: i.CODIGO, DESCRICAO: i.DESCRICAO, ACURACIDADE_ANTERIOR: i.ACURACIDADE_ANTERIOR });
            });
            console.log('Itens por bloco:', itensPorBloco);
            console.log('Itens BAIXA_ACURACIDADE:', itensPorBloco['BAIXA_ACURACIDADE'] || '⚠️ NENHUM');
            if (data.debugBloco2) {
                console.group('🔍 DEBUG BLOCO 2 — diagnóstico detalhado');
                console.log('Etapa atingida:', data.debugBloco2.etapa);
                console.log('ID inventário finalizado usado:', data.debugBloco2.idInventarioFinalizado);
                console.log('Acuracidade mínima configurada:', data.debugBloco2.acuracidadeMinima, '%');
                console.log('Qtd máxima configurada:', data.debugBloco2.qtdMaxima);
                console.log('Total itens no inventário finalizado:', data.debugBloco2.totalItensNoInventarioFinalizado);
                console.log('Itens com ACURACIDADE NULL:', data.debugBloco2.itensComAcuracidadeNull);
                console.log('Itens < acur. mínima (sem excluir bloco1):', data.debugBloco2.itensBaixaAcuracidadeSemFiltro);
                console.log('Itens < acur. mínima (após excluir bloco1):', data.debugBloco2.itensBaixaAcuracidadeAposExcluirBloco1);
                console.log('Códigos excluídos pelo bloco1:', data.debugBloco2.codigosExcluidosBloco1);
                console.log('Retornou da query final:', data.debugBloco2.retornouDaQuery);
                if (data.debugBloco2.erro) console.error('ERRO no bloco2:', data.debugBloco2.erro);
                console.groupEnd();
            }
            console.groupEnd();
            // ── FIM DEBUG ──────────────────────────────────────────────

            inventarioAtual = {
                id: null,
                status: 'NOVO',
                itens: data.itens,
                dataGeracao: data.dataGeracao,
                criterio: data.criterio,
                blocos: data.blocos,
                valorTotalGeral: data.valorTotalGeral
            };

            renderizarInventario(inventarioAtual);
            adicionarItemBtn.style.display = 'inline-block';
            salvarInventarioBtn.style.display = 'inline-block';
            imprimirInventarioBtn.style.display = 'inline-block';
            exportarExcelBtn.style.display = 'inline-block';
            finalizarInventarioBtn.style.display = 'none';
            
            statusMessage.style.color = 'green';
            statusMessage.textContent = 'Lista gerada com sucesso! Salve o inventário para continuar depois.';
            setTimeout(() => { statusMessage.textContent = ''; }, 5000);

        } catch (error) {
            console.error('Erro ao gerar lista:', error);
            statusMessage.style.color = '#c00';
            statusMessage.textContent = `Erro: ${error.message}`;
        } finally {
            gerarListaBtn.disabled = false;
            gerarListaBtn.innerHTML = '<i class="fa-solid fa-clipboard-list"></i> Gerar Nova Lista';
        }
    }

    async function salvarInventario() {
        if (!inventarioAtual) {
            alert('Nenhum inventário para salvar.');
            return;
        }

        const usuario = localStorage.getItem('userName') || 'Sistema';

        try {
            statusMessage.style.color = '#222';
            statusMessage.textContent = 'Salvando inventário...';
            salvarInventarioBtn.disabled = true;

            const response = await fetch('/api/inventarioCiclico', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    acao: 'salvar',
                    inventario: inventarioAtual,
                    usuario: usuario
                })
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.message || 'Erro ao salvar inventário');
            }

            inventarioAtual.id = data.idInventario;
            inventarioAtual.status = 'EM_ANDAMENTO';

            statusMessage.style.color = 'green';
            statusMessage.textContent = `Inventário #${data.idInventario} salvo com sucesso!`;
            setTimeout(() => { statusMessage.textContent = ''; }, 3000);

            renderizarInventario(inventarioAtual);
            salvarInventarioBtn.style.display = 'none';
            finalizarInventarioBtn.style.display = 'inline-block';

        } catch (error) {
            console.error('Erro ao salvar inventário:', error);
            statusMessage.style.color = '#c00';
            statusMessage.textContent = `Erro: ${error.message}`;
        } finally {
            salvarInventarioBtn.disabled = false;
        }
    }

    async function carregarInventariosSalvos() {
        try {
            statusMessage.style.color = '#222';
            statusMessage.textContent = 'Carregando inventários...';
            carregarInventariosBtn.disabled = true;
            listaInventariosSalvos.innerHTML = '<div class="loader"></div>';
            
            const response = await fetch('/api/inventarioCiclico?acao=listar');
            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.message || 'Erro ao carregar inventários');
            }

            todosInventarios = data.inventarios || [];
            
            if (todosInventarios.length === 0) {
                listaInventariosSalvos.innerHTML = '<p class="info-message">Nenhum inventário salvo encontrado.</p>';
                statusMessage.textContent = '';
                return;
            }

            renderizarListaInventarios(todosInventarios);
            
            statusMessage.style.color = 'green';
            statusMessage.textContent = `${todosInventarios.length} inventário(s) carregado(s)`;
            setTimeout(() => { statusMessage.textContent = ''; }, 3000);

        } catch (error) {
            console.error('Erro ao carregar inventários:', error);
            statusMessage.style.color = 'red';
            statusMessage.textContent = `Erro: ${error.message}`;
            listaInventariosSalvos.innerHTML = `<p class="error-message">Erro ao carregar inventários salvos</p>`;
        } finally {
            carregarInventariosBtn.disabled = false;
        }
    }

    function aplicarFiltroMes() {
        const mesAnoSelecionado = filtroMesInventario.value;
        
        if (!mesAnoSelecionado) {
            renderizarListaInventarios(todosInventarios);
            limparFiltroMesBtn.style.display = 'none';
            return;
        }

        limparFiltroMesBtn.style.display = 'inline-block';

        const inventariosFiltrados = todosInventarios.filter(inv => {
            const dataGeracao = new Date(inv.DT_GERACAO);
            const mesAnoInventario = `${dataGeracao.getFullYear()}-${String(dataGeracao.getMonth() + 1).padStart(2, '0')}`;
            return mesAnoInventario === mesAnoSelecionado;
        });

        renderizarListaInventarios(inventariosFiltrados);
        
        statusMessage.style.color = '#2196F3';
        statusMessage.textContent = `${inventariosFiltrados.length} inventário(s) encontrado(s) para ${mesAnoSelecionado}`;
        setTimeout(() => { statusMessage.textContent = ''; }, 3000);
    }

    function limparFiltroMes() {
        filtroMesInventario.value = '';
        limparFiltroMesBtn.style.display = 'none';
        renderizarListaInventarios(todosInventarios);
        
        statusMessage.style.color = 'green';
        statusMessage.textContent = 'Filtro removido';
        setTimeout(() => { statusMessage.textContent = ''; }, 3000);
    }

    function renderizarListaInventarios(inventarios) {
        const table = document.createElement('table');
        table.className = 'consulta-table';
        table.innerHTML = `
            <thead>
                <tr>
                    <th>ID</th>
                    <th>Data Geração</th>
                    <th>Criado Por</th>
                    <th>Data Criação</th>
                    <th>Total Itens</th>
                    <th>Valor Total</th>
                    <th>Status</th>
                    <th>Acuracidade</th>
                    <th>Divergências</th>
                    <th>Ações</th>
                </tr>
            </thead>
            <tbody>
                ${inventarios.map(inv => {
                    // Usa o campo ITENS_DIVERGENTES que vem do backend quando finalizado
                    const itensDivergentes = inv.STATUS === 'FINALIZADO' && inv.ITENS_DIVERGENTES !== undefined
                        ? inv.ITENS_DIVERGENTES
                        : '-';
                    
                    return `
                    <tr>
                        <td><strong>#${inv.ID_INVENTARIO}</strong></td>
                        <td>${formatarDataHora(inv.DT_GERACAO)}</td>
                        <td><strong>${inv.USUARIO_CRIACAO || 'Sistema'}</strong></td>
                        <td>${formatarDataHora(inv.DT_CRIACAO)}</td>
                        <td>${inv.TOTAL_ITENS || 0}</td>
                        <td><strong>R$ ${(inv.VALOR_TOTAL_GERAL || 0).toLocaleString('pt-BR', {minimumFractionDigits: 2, maximumFractionDigits: 2})}</strong></td>
                        <td><span class="status-badge status-${inv.STATUS.toLowerCase()}">${inv.STATUS}</span></td>
                        <td>${inv.ACURACIDADE ? inv.ACURACIDADE.toFixed(2) + '%' : '-'}</td>
                        <td>
                            ${itensDivergentes !== '-' 
                                ? `<span class="badge-divergencia">${itensDivergentes}</span>` 
                                : '-'}
                        </td>
                        <td>
                            <button class="btn-detalhes" onclick="abrirInventario(${inv.ID_INVENTARIO})">
                                <i class="fa-solid fa-folder-open"></i> Abrir
                            </button>
                        </td>
                    </tr>
                `}).join('')}
            </tbody>
        `;
        listaInventariosSalvos.innerHTML = '';
        listaInventariosSalvos.appendChild(table);
    }

    window.abrirInventario = async function(idInventario) {
        try {
            statusMessage.style.color = '#222';
            statusMessage.textContent = 'Carregando inventário...';

            const response = await fetch(`/api/inventarioCiclico?acao=abrir&id=${idInventario}`);
            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.message || 'Erro ao carregar inventário');
            }

            inventarioAtual = data.inventario;
            renderizarInventario(inventarioAtual);

            if (inventarioAtual.status === 'FINALIZADO') {
                adicionarItemBtn.style.display = 'none';
                salvarInventarioBtn.style.display = 'none';
                imprimirInventarioBtn.style.display = 'inline-block';
                exportarExcelBtn.style.display = 'inline-block';
                finalizarInventarioBtn.style.display = 'none';
            } else if (inventarioAtual.status === 'EM_ANDAMENTO') {
                adicionarItemBtn.style.display = 'inline-block';
                salvarInventarioBtn.style.display = 'none';
                imprimirInventarioBtn.style.display = 'inline-block';
                exportarExcelBtn.style.display = 'inline-block';
                finalizarInventarioBtn.style.display = 'inline-block';
            } else {
                adicionarItemBtn.style.display = 'inline-block';
                salvarInventarioBtn.style.display = 'inline-block';
                imprimirInventarioBtn.style.display = 'inline-block';
                exportarExcelBtn.style.display = 'inline-block';
                finalizarInventarioBtn.style.display = 'none';
            }

            statusMessage.style.color = 'green';
            statusMessage.textContent = `Inventário #${idInventario} carregado com sucesso!`;
            setTimeout(() => { statusMessage.textContent = ''; }, 3000);

        } catch (error) {
            console.error('Erro ao abrir inventário:', error);
            statusMessage.style.color = '#c00';
            statusMessage.textContent = `Erro: ${error.message}`;
        }
    };

    function renderizarInventario(inventario) {
        const { itens, dataGeracao, criterio, id, status, blocos } = inventario;
        // Sempre recalcula a partir da soma das linhas para garantir consistência
        const valorTotalGeral = (itens || []).reduce((sum, item) => sum + (item.VALOR_TOTAL_ESTOQUE || 0), 0);

        if (!itens || itens.length === 0) {
            infoLista.innerHTML = '<p class="info-message">Nenhum item encontrado para inventário.</p>';
            listaInventarioContainer.style.display = 'block';
            return;
        }

        tituloInventario.textContent = id ? `Inventário #${id}` : 'Nova Lista de Inventário';

        let blocosInfo = '';
        if (blocos) {
            blocosInfo = `
                <p><strong>Distribuição:</strong></p>
                <ul class="blocos-info">
                    <li><span class="bloco-badge bloco-movimentacao">Movimentação:</span> ${blocos.movimentacao} itens</li>
                    <li><span class="bloco-badge bloco-baixa-acuracidade">Baixa Acuracidade:</span> ${blocos.baixaAcuracidade} itens</li>
                    <li><span class="bloco-badge bloco-maior-valor">Maior Valor:</span> ${blocos.maiorValor} itens</li>
                    <li><span class="bloco-badge bloco-maior-valor-unitario">Maior Vlr Unit.:</span> ${blocos.maiorValorUnitario || 0} itens</li>
                    <li><span class="bloco-badge bloco-nao-contado">Não Contados:</span> ${blocos.naoContado || 0} itens</li>
                </ul>
            `;
        }

        let valorInfo = '';
        if (valorTotalGeral !== undefined) {
            valorInfo = `<p><strong>💰 Valor Total em Estoque:</strong> <span class="valor-total-geral">R$ ${valorTotalGeral.toLocaleString('pt-BR', {minimumFractionDigits: 2, maximumFractionDigits: 2})}</span></p>`;
        }

        infoLista.innerHTML = `
            <p><strong>Status:</strong> <span class="status-badge status-${status.toLowerCase()}">${status.replace('_', ' ')}</span></p>
            <p><strong>Data de Geração:</strong> ${formatarDataHora(dataGeracao)}</p>
            <p><strong>Total de Itens:</strong> ${itens.length}</p>
            <p><strong>Critério:</strong> ${criterio}</p>
            ${blocosInfo}
            ${valorInfo}
        `;

        const podeEditar = status !== 'FINALIZADO';

        const table = document.createElement('table');
        table.className = 'consulta-table inventario-table';
        table.innerHTML = `
            <thead>
                <tr>
                    <th>#</th>
                    <th>Bloco</th>
                    <th>Código</th>
                    <th>Descrição</th>
                    <th>Saldo Sistema</th>
                    <th>Valor Unit.</th>
                    <th>Valor Total</th>
                    <th>Contagem Física</th>
                    <th>Diferença</th>
                    <th>Acuracidade</th>
                    <th>Contado Por</th>
                    ${podeEditar ? '<th>Ações</th>' : ''}
                </tr>
            </thead>
            <tbody>
                ${itens.map((item, index) => {
                    const contagemFisica = item.CONTAGEM_FISICA || 0;
                    const saldoSistema = item.SALDO_ATUAL || 0;
                    const diferenca = contagemFisica - saldoSistema;
                    const acuracidade = saldoSistema > 0 ? ((Math.min(contagemFisica, saldoSistema) / Math.max(contagemFisica, saldoSistema)) * 100) : 0;
                    
                    const usuarioContagem = item.USUARIO_CONTAGEM || '-';
                    const dataContagem = item.DT_CONTAGEM ? formatarDataHora(item.DT_CONTAGEM) : '-';
                    
                    const custoUnitario = item.CUSTO_UNITARIO || 0;
                    const valorTotal = item.VALOR_TOTAL_ESTOQUE || 0;
                    
                    // Define a badge do bloco
                    let blocoTexto = '';
                    let blocoClass = '';
                    if (item.BLOCO === 'MOVIMENTACAO') {
                        blocoTexto = 'Movimentação';
                        blocoClass = 'bloco-movimentacao';
                    } else if (item.BLOCO === 'BAIXA_ACURACIDADE') {
                        blocoTexto = 'Baixa Acurac.';
                        blocoClass = 'bloco-baixa-acuracidade';
                    } else if (item.BLOCO === 'MAIOR_VALOR') {
                        blocoTexto = 'Maior Valor';
                        blocoClass = 'bloco-maior-valor';
                    } else if (item.BLOCO === 'MAIOR_VALOR_UNITARIO') {
                        blocoTexto = 'Maior Vlr Unit.';
                        blocoClass = 'bloco-maior-valor-unitario';
                    } else if (item.BLOCO === 'NAO_CONTADO') {
                        blocoTexto = 'Não Contado';
                        blocoClass = 'bloco-nao-contado';
                    }
                    
                    return `
                    <tr data-codigo="${item.CODIGO}">
                        <td>${index + 1}</td>
                        <td><span class="bloco-badge ${blocoClass}">${blocoTexto}</span></td>
                        <td><strong>${item.CODIGO}</strong></td>
                        <td>${item.DESCRICAO || 'N/A'}</td>
                        <td>${saldoSistema}</td>
                        <td>R$ ${custoUnitario.toLocaleString('pt-BR', {minimumFractionDigits: 2, maximumFractionDigits: 2})}</td>
                        <td><strong>R$ ${valorTotal.toLocaleString('pt-BR', {minimumFractionDigits: 2, maximumFractionDigits: 2})}</strong></td>
                        <td>
                            ${podeEditar ? 
                                `<input type="number" 
                                        class="contagem-input" 
                                        data-codigo="${item.CODIGO}" 
                                        value="${contagemFisica}" 
                                        min="0" 
                                        step="1" />` 
                                : contagemFisica}
                        </td>
                        <td class="${diferenca === 0 ? 'diferenca-zero' : diferenca > 0 ? 'diferenca-positiva' : 'diferenca-negativa'}">
                            ${diferenca > 0 ? '+' : ''}${diferenca}
                        </td>
                        <td>
                            <span class="acuracidade-badge ${acuracidade >= 95 ? 'acuracidade-alta' : acuracidade >= 85 ? 'acuracidade-media' : 'acuracidade-baixa'}">
                                ${acuracidade.toFixed(1)}%
                            </span>
                        </td>
                        <td class="info-contagem">
                            ${usuarioContagem !== '-' ? `<small><strong>${usuarioContagem}</strong><br>${dataContagem}</small>` : '-'}
                        </td>
                        ${podeEditar ? `
                        <td>
                            <button class="btn-excluir-item" data-codigo="${item.CODIGO}" title="Excluir item">
                                <i class="fa-solid fa-trash"></i>
                            </button>
                        </td>
                        ` : ''}
                    </tr>
                `}).join('')}
            </tbody>
            ${valorTotalGeral !== undefined ? `
            <tfoot>
                <tr class="total-row">
                    <td colspan="${podeEditar ? '6' : '6'}" style="text-align: right;"><strong>TOTAL GERAL:</strong></td>
                    <td><strong>R$ ${valorTotalGeral.toLocaleString('pt-BR', {minimumFractionDigits: 2, maximumFractionDigits: 2})}</strong></td>
                    <td colspan="${podeEditar ? '5' : '4'}"></td>
                </tr>
            </tfoot>
            ` : ''}
        `;

        tabelaInventario.innerHTML = '';
        tabelaInventario.appendChild(table);
        listaInventarioContainer.style.display = 'block';

        // Event listener para atualizar contagens em tempo real
        if (podeEditar) {
            table.querySelectorAll('.contagem-input').forEach(input => {
                input.addEventListener('blur', function() {
                    const novaContagem = parseFloat(this.value) || 0;
                    atualizarContagemLocal(this.dataset.codigo, novaContagem);
                    
                    // Salva automaticamente no banco se o inventário já foi salvo
                    if (inventarioAtual.id) {
                        salvarContagemIndividual(inventarioAtual.id, this.dataset.codigo, novaContagem);
                    }
                });
            });

            // Event listener para excluir itens
            table.querySelectorAll('.btn-excluir-item').forEach(btn => {
                btn.addEventListener('click', function() {
                    const codigo = this.dataset.codigo;
                    excluirItemInventario(codigo);
                });
            });
        }
    }

    async function salvarContagemIndividual(idInventario, codigo, contagem) {
        const usuario = localStorage.getItem('userName') || 'Sistema';

        try {
            const response = await fetch('/api/inventarioCiclico', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    acao: 'salvarContagem',
                    idInventario: idInventario,
                    codigo: codigo,
                    contagemFisica: contagem,
                    usuario: usuario
                })
            });

            const data = await response.json();

            if (!response.ok) {
                console.error('Erro ao salvar contagem:', data.message);
            } else {
                // Atualiza o item com os dados de quem contou
                const item = inventarioAtual.itens.find(i => i.CODIGO === codigo);
                if (item) {
                    item.USUARIO_CONTAGEM = usuario;
                    item.DT_CONTAGEM = new Date().toISOString();
                    renderizarInventario(inventarioAtual);
                }
            }

        } catch (error) {
            console.error('Erro ao salvar contagem individual:', error);
        }
    }

    function atualizarContagemLocal(codigo, contagem) {
        if (!inventarioAtual || !inventarioAtual.itens) return;
        
        const item = inventarioAtual.itens.find(i => i.CODIGO === codigo);
        if (item) {
            item.CONTAGEM_FISICA = contagem;
        }
    }

    function excluirItemInventario(codigo) {
        if (!confirm(`Deseja realmente excluir o item ${codigo} do inventário?`)) {
            return;
        }

        // Se o inventário já está salvo, persiste a remoção no banco
        if (inventarioAtual.id) {
            statusMessage.style.color = '#222';
            statusMessage.textContent = 'Removendo item...';

            fetch('/api/inventarioCiclico', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ acao: 'removerItem', idInventario: inventarioAtual.id, codigo })
            })
            .then(r => r.json())
            .then(data => {
                if (data.message && data.error) throw new Error(data.message);
                // Remove da memória local e re-renderiza
                inventarioAtual.itens = inventarioAtual.itens.filter(item => item.CODIGO !== codigo);
                atualizarBlocos();
                renderizarInventario(inventarioAtual);
                statusMessage.style.color = 'green';
                statusMessage.textContent = `Item ${codigo} excluído com sucesso!`;
                setTimeout(() => { statusMessage.textContent = ''; }, 3000);
            })
            .catch(err => {
                statusMessage.style.color = '#c00';
                statusMessage.textContent = `Erro ao remover: ${err.message}`;
            });
            return;
        }

        // Inventário ainda não salvo — apenas memória
        inventarioAtual.itens = inventarioAtual.itens.filter(item => item.CODIGO !== codigo);
        atualizarBlocos();
        renderizarInventario(inventarioAtual);

        statusMessage.style.color = 'green';
        statusMessage.textContent = `Item ${codigo} excluído com sucesso!`;
        setTimeout(() => { statusMessage.textContent = ''; }, 3000);
    }

    // Recalcula blocos na memória local
    function atualizarBlocos() {
        if (inventarioAtual.blocos) {
            inventarioAtual.blocos = {
                movimentacao: inventarioAtual.itens.filter(i => i.BLOCO === 'MOVIMENTACAO').length,
                baixaAcuracidade: inventarioAtual.itens.filter(i => i.BLOCO === 'BAIXA_ACURACIDADE').length,
                maiorValor: inventarioAtual.itens.filter(i => i.BLOCO === 'MAIOR_VALOR').length,
                maiorValorUnitario: inventarioAtual.itens.filter(i => i.BLOCO === 'MAIOR_VALOR_UNITARIO').length,
                naoContado: inventarioAtual.itens.filter(i => i.BLOCO === 'NAO_CONTADO').length
            };
        }
    }

    async function adicionarNovoItem() {
        const codigo = prompt('Digite o código do produto a adicionar:');
        
        if (!codigo || codigo.trim() === '') {
            return;
        }

        const codigoLimpo = codigo.trim().toUpperCase();

        // Verifica se o código já existe na lista
        if (inventarioAtual.itens.some(item => item.CODIGO === codigoLimpo)) {
            alert('Este código já está na lista!');
            return;
        }

        try {
            statusMessage.style.color = '#222';
            statusMessage.textContent = 'Buscando produto...';

            // Busca informações do produto no banco
            const response = await fetch(`/api/inventarioCiclico?acao=buscarProduto&codigo=${codigoLimpo}`);
            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.message || 'Produto não encontrado');
            }

            const novoProduto = data.produto;

            const novoItem = {
                CODIGO: novoProduto.CODIGO,
                DESCRICAO: novoProduto.DESCRICAO,
                SALDO_ATUAL: novoProduto.SALDO_ATUAL || 0,
                SALDO_SISTEMA: novoProduto.SALDO_ATUAL || 0,
                CUSTO_UNITARIO: novoProduto.CUSTO_UNITARIO || 0,
                PRECO_UNITARIO: novoProduto.CUSTO_UNITARIO || 0,
                VALOR_TOTAL_ESTOQUE: (novoProduto.SALDO_ATUAL || 0) * (novoProduto.CUSTO_UNITARIO || 0),
                CONTAGEM_FISICA: 0,
                BLOCO: 'MANUAL',
                TOTAL_MOVIMENTACOES: 0
            };

            // Se o inventário já está salvo, persiste no banco
            if (inventarioAtual.id) {
                statusMessage.textContent = 'Salvando item no banco...';
                const respAdd = await fetch('/api/inventarioCiclico', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ acao: 'adicionarItem', idInventario: inventarioAtual.id, item: novoItem })
                });
                const dataAdd = await respAdd.json();
                if (!respAdd.ok) throw new Error(dataAdd.message || 'Erro ao persistir item');
            }

            inventarioAtual.itens.push(novoItem);
            atualizarBlocos();

            renderizarInventario(inventarioAtual);

            statusMessage.style.color = 'green';
            statusMessage.textContent = `Produto ${codigoLimpo} adicionado com sucesso!`;
            setTimeout(() => { statusMessage.textContent = ''; }, 3000);

        } catch (error) {
            console.error('Erro ao adicionar produto:', error);
            statusMessage.style.color = '#c00';
            statusMessage.textContent = `Erro: ${error.message}`;
        }
    }

    // Adiciona o botão de adicionar item no HTML
    window.adicionarNovoItem = adicionarNovoItem;

    async function finalizarInventario() {
        if (!inventarioAtual || !inventarioAtual.id) {
            alert('Salve o inventário antes de finalizar.');
            return;
        }

        if (!confirm('Deseja finalizar este inventário? Esta ação não pode ser desfeita.')) {
            return;
        }

        const usuario = localStorage.getItem('userName') || 'Sistema';

        try {
            statusMessage.style.color = '#222';
            statusMessage.textContent = 'Finalizando inventário...';
            finalizarInventarioBtn.disabled = true;

            const response = await fetch('/api/inventarioCiclico', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    acao: 'finalizar',
                    idInventario: inventarioAtual.id,
                    itens: inventarioAtual.itens,
                    usuario: usuario
                })
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.message || 'Erro ao finalizar inventário');
            }

            inventarioAtual.status = 'FINALIZADO';
            inventarioAtual.acuracidade = data.acuracidadeGeral;

            renderizarInventario(inventarioAtual);
            mostrarResultadoAcuracidade(data);

            statusMessage.style.color = 'green';
            statusMessage.textContent = 'Inventário finalizado com sucesso!';
            finalizarInventarioBtn.style.display = 'none';

        } catch (error) {
            console.error('Erro ao finalizar inventário:', error);
            statusMessage.style.color = '#c00';
            statusMessage.textContent = `Erro: ${error.message}`;
        } finally {
            finalizarInventarioBtn.disabled = false;
        }
    }

    function mostrarResultadoAcuracidade(resultado) {
        acuracidadeContent.innerHTML = `
            <div class="resultado-acuracidade">
                <h3>Acuracidade Geral: <span class="acuracidade-geral">${resultado.acuracidadeGeral.toFixed(2)}%</span></h3>
                <div class="estatisticas-inventario">
                    <div class="stat-card">
                        <i class="fa-solid fa-box"></i>
                        <p>Total de Itens</p>
                        <strong>${resultado.totalItens}</strong>
                    </div>
                    <div class="stat-card">
                        <i class="fa-solid fa-check-circle"></i>
                        <p>Itens Corretos</p>
                        <strong>${resultado.itensCorretos}</strong>
                    </div>
                    <div class="stat-card">
                        <i class="fa-solid fa-exclamation-triangle"></i>
                        <p>Com Divergência</p>
                        <strong>${resultado.itensDivergentes}</strong>
                    </div>
                </div>
                <button class="btn-destaque" onclick="document.getElementById('acuracidadeModal').style.display='none'">
                    Fechar
                </button>
            </div>
        `;
        acuracidadeModal.style.display = 'block';
    }

    function imprimirInventario() {
        if (!inventarioAtual || !inventarioAtual.itens || inventarioAtual.itens.length === 0) {
            alert('Nenhum inventário carregado para impressão');
            return;
        }

        const { itens, dataGeracao, criterio, id, status, blocos, valorTotalGeral } = inventarioAtual;
        const dataFormatada = formatarDataHora(dataGeracao);
        const usuarioNome = localStorage.getItem('userName') || 'Sistema';

        const janelaImpressao = window.open('', '_blank', 'width=800,height=600');
        
        let blocosInfo = '';
        if (blocos) {
            blocosInfo = `
                <div class="blocos-resumo">
                    <div class="bloco-item movimentacao">
                        <strong>Movimentação:</strong> ${blocos.movimentacao} itens
                    </div>
                    <div class="bloco-item baixa-acuracidade">
                        <strong>Baixa Acuracidade:</strong> ${blocos.baixaAcuracidade} itens
                    </div>
                    <div class="bloco-item maior-valor">
                        <strong>Maior Valor:</strong> ${blocos.maiorValor} itens
                    </div>
                    <div class="bloco-item maior-valor-unitario">
                        <strong>Maior Vlr Unit.:</strong> ${blocos.maiorValorUnitario || 0} itens
                    </div>
                    <div class="bloco-item nao-contado">
                        <strong>Não Contados:</strong> ${blocos.naoContado || 0} itens
                    </div>
                </div>
            `;
        }

        const htmlImpressao = `
<!DOCTYPE html>
<html lang="pt-BR">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Inventário ${id ? '#' + id : 'Nova Lista'} - Impressão</title>
    <style>
        @media print {
            @page { size: A4 landscape; margin: 10mm; }
            body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
            .no-print { display: none !important; }
        }
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: 'Segoe UI', Arial, sans-serif; font-size: 10pt; line-height: 1.3; color: #333; background: white; }
        .header { text-align: center; margin-bottom: 15px; padding-bottom: 10px; border-bottom: 3px solid #2c3e50; }
        .header h1 { font-size: 18pt; color: #2c3e50; margin-bottom: 5px; }
        .header h2 { font-size: 14pt; color: #34495e; font-weight: normal; }
        .info-section { display: grid; grid-template-columns: repeat(2, 1fr); gap: 10px; margin-bottom: 15px; padding: 10px; background-color: #f8f9fa; border-radius: 5px; }
        .info-item { display: flex; gap: 5px; }
        .info-item strong { color: #2c3e50; }
        .blocos-resumo { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; margin-bottom: 15px; }
        .bloco-item { padding: 8px; text-align: center; border-radius: 5px; font-size: 9pt; }
        .bloco-item.movimentacao { background-color: #e3f2fd; border-left: 4px solid #2196F3; }
        .bloco-item.baixa-acuracidade { background-color: #fff3e0; border-left: 4px solid #ff9800; }
        .bloco-item.maior-valor { background-color: #e8f5e9; border-left: 4px solid #4caf50; }
        table { width: 100%; border-collapse: collapse; margin-bottom: 10px; font-size: 9pt; }
        thead { background-color: #2c3e50; color: white; }
        th { padding: 8px 4px; text-align: left; font-weight: 600; border: 1px solid #34495e; }
        td { padding: 6px 4px; border: 1px solid #ddd; }
        tbody tr:nth-child(even) { background-color: #f8f9fa; }
        tbody tr:hover { background-color: #e9ecef; }
        .bloco-badge { display: inline-block; padding: 2px 6px; border-radius: 3px; font-size: 8pt; font-weight: bold; white-space: nowrap; }
        .bloco-movimentacao { background-color: #cfe2ff; color: #084298; }
        .bloco-baixa-acuracidade { background-color: #f8d7da; color: #721c24; }
        .bloco-maior-valor { background-color: #d1e7dd; color: #0f5132; }
        .bloco-maior-valor-unitario { background-color: #cff4fc; color: #055160; }
        .bloco-nao-contado { background-color: #fff3cd; color: #856404; }
        .text-right { text-align: right; }
        .text-center { text-align: center; }
        .footer { margin-top: 20px; padding-top: 10px; border-top: 2px solid #2c3e50; font-size: 8pt; text-align: center; color: #666; }
        .total-row { background-color: #34495e !important; color: white !important; font-weight: bold; }
        .total-row td { border-color: #2c3e50 !important; }
        .btn-imprimir { position: fixed; top: 10px; right: 10px; padding: 10px 20px; background-color: #2c3e50; color: white; border: none; border-radius: 5px; cursor: pointer; font-size: 11pt; box-shadow: 0 2px 5px rgba(0,0,0,0.2); }
        .btn-imprimir:hover { background-color: #34495e; }
        .contagem-campo { border: 1px solid #ccc; padding: 4px; min-width: 60px; min-height: 20px; display: inline-block; }
    </style>
</head>
<body>
    <button class="btn-imprimir no-print" onclick="window.print()">🖨️ Imprimir</button>
    <div class="header">
        <h1>KARDEX SYSTEM</h1>
        <h2>Inventário Cíclico ${id ? '#' + id : '- Nova Lista'}</h2>
    </div>
    <div class="info-section">
        <div class="info-item"><strong>Data de Geração:</strong><span>${dataFormatada}</span></div>
        <div class="info-item"><strong>Status:</strong><span>${status || 'NOVO'}</span></div>
        <div class="info-item"><strong>Total de Itens:</strong><span>${itens.length}</span></div>
        <div class="info-item"><strong>Impresso por:</strong><span>${usuarioNome}</span></div>
        ${valorTotalGeral !== undefined ? `<div class="info-item"><strong>Valor Total em Estoque:</strong><span>R$ ${valorTotalGeral.toLocaleString('pt-BR', {minimumFractionDigits: 2, maximumFractionDigits: 2})}</span></div>` : ''}
    </div>
    ${blocosInfo}
    <table>
        <thead>
            <tr>
                <th style="width: 30px;">#</th>
                <th style="width: 80px;">Bloco</th>
                <th style="width: 100px;">Código</th>
                <th>Descrição</th>
                <th style="width: 70px;" class="text-right">Saldo Sist.</th>
                <th style="width: 70px;" class="text-right">Vlr Unit.</th>
                <th style="width: 80px;" class="text-right">Vlr Total</th>
                <th style="width: 80px;" class="text-center">Contagem</th>
                <th style="width: 120px;">Contado Por</th>
            </tr>
        </thead>
        <tbody>
            ${itens.map((item, index) => {
                const saldoSistema = item.SALDO_ATUAL || 0;
                const custoUnitario = item.CUSTO_UNITARIO || 0;
                const valorTotal = item.VALOR_TOTAL_ESTOQUE || 0;
                let blocoTexto = '', blocoClass = '';
                if (item.BLOCO === 'MOVIMENTACAO') { blocoTexto = 'Movimentação'; blocoClass = 'bloco-movimentacao'; }
                else if (item.BLOCO === 'BAIXA_ACURACIDADE') { blocoTexto = 'Baixa Acurac.'; blocoClass = 'bloco-baixa-acuracidade'; }
                else if (item.BLOCO === 'MAIOR_VALOR') { blocoTexto = 'Maior Valor'; blocoClass = 'bloco-maior-valor'; }
                else if (item.BLOCO === 'MAIOR_VALOR_UNITARIO') { blocoTexto = 'Maior Vlr Unitário'; blocoClass = 'bloco-maior-valor-unitario'; }
                else if (item.BLOCO === 'NAO_CONTADO') { blocoTexto = 'Não Contado'; blocoClass = 'bloco-nao-contado'; }
                return '<tr>' +
                    '<td class="text-center">' + (index + 1) + '</td>' +
                    '<td><span class="bloco-badge ' + blocoClass + '">' + blocoTexto + '</span></td>' +
                    '<td><strong>' + item.CODIGO + '</strong></td>' +
                    '<td>' + (item.DESCRICAO || 'N/A') + '</td>' +
                    '<td class="text-right">' + saldoSistema.toLocaleString('pt-BR') + '</td>' +
                    '<td class="text-right">R$ ' + custoUnitario.toLocaleString('pt-BR', {minimumFractionDigits: 2, maximumFractionDigits: 2}) + '</td>' +
                    '<td class="text-right"><strong>R$ ' + valorTotal.toLocaleString('pt-BR', {minimumFractionDigits: 2, maximumFractionDigits: 2}) + '</strong></td>' +
                    '<td class="text-center"><div class="contagem-campo">' + (item.CONTAGEM_FISICA || '______') + '</div></td>' +
                    '<td>_____________________</td>' +
                    '</tr>';
            }).join('')}
        </tbody>
        ${valorTotalGeral !== undefined ? '<tfoot><tr class="total-row"><td colspan="6" class="text-right"><strong>TOTAL GERAL:</strong></td><td class="text-right"><strong>R$ ' + valorTotalGeral.toLocaleString('pt-BR', {minimumFractionDigits: 2, maximumFractionDigits: 2}) + '</strong></td><td colspan="2"></td></tr></tfoot>' : ''}
    </table>
    <div class="footer">
        <p><strong>Critério de Seleção:</strong> ${criterio}</p>
        <p>Documento gerado em: ${new Date().toLocaleString('pt-BR')}</p>
    </div>
</body>
</html>`;

        janelaImpressao.document.write(htmlImpressao);
        janelaImpressao.document.close();
        setTimeout(() => { janelaImpressao.focus(); }, 250);
    }

    function exportarParaExcel() {
        if (!inventarioAtual || !inventarioAtual.itens || inventarioAtual.itens.length === 0) {
            alert('Nenhum inventário carregado para exportar');
            return;
        }

        const { itens, dataGeracao, criterio, id, status, blocos, valorTotalGeral } = inventarioAtual;
        
        const dadosExcel = itens.map((item, index) => {
            const saldoSistema = item.SALDO_ATUAL || item.SALDO_SISTEMA || 0;
            const contagemFisica = item.CONTAGEM_FISICA || '';
            const diferenca = contagemFisica !== '' ? contagemFisica - saldoSistema : '';
            const acuracidade = contagemFisica !== '' && saldoSistema > 0 
                ? ((Math.min(contagemFisica, saldoSistema) / Math.max(contagemFisica, saldoSistema)) * 100)
                : '';
            
            let blocoTexto = '';
            if (item.BLOCO === 'MOVIMENTACAO') blocoTexto = 'Movimentação';
            else if (item.BLOCO === 'BAIXA_ACURACIDADE') blocoTexto = 'Baixa Acuracidade';
            else if (item.BLOCO === 'MAIOR_VALOR') blocoTexto = 'Maior Valor';
            else if (item.BLOCO === 'MAIOR_VALOR_UNITARIO') blocoTexto = 'Maior Vlr Unitário';
            else if (item.BLOCO === 'NAO_CONTADO') blocoTexto = 'Não Contado';

            return {
                '#': index + 1,
                'Bloco': blocoTexto,
                'Código': item.CODIGO,
                'Descrição': item.DESCRICAO || 'N/A',
                'Localização': item.LOCALIZACAO || '',
                'Saldo Sistema': saldoSistema,
                'Custo Unitário': item.CUSTO_UNITARIO || 0,
                'Valor Total': item.VALOR_TOTAL_ESTOQUE || 0,
                'Contagem Física': contagemFisica,
                'Diferença': diferenca,
                'Acuracidade (%)': acuracidade !== '' ? acuracidade.toFixed(2) : '',
                'Contado Por': item.USUARIO_CONTAGEM || '',
                'Data Contagem': item.DT_CONTAGEM ? formatarDataHora(item.DT_CONTAGEM) : ''
            };
        });

        if (valorTotalGeral !== undefined) {
            dadosExcel.push({
                '#': '',
                'Bloco': '',
                'Código': '',
                'Descrição': '',
                'Saldo Sistema': '',
                'Custo Unitário': 'TOTAL GERAL:',
                'Valor Total': valorTotalGeral,
                'Contagem Física': '',
                'Diferença': '',
                'Acuracidade (%)': '',
                'Contado Por': '',
                'Data Contagem': ''
            });
        }

        const ws = XLSX.utils.json_to_sheet(dadosExcel);

        const colWidths = [
            { wch: 5 }, { wch: 18 }, { wch: 12 }, { wch: 40 }, { wch: 25 }, { wch: 12 }, { wch: 14 },
            { wch: 14 }, { wch: 15 }, { wch: 12 }, { wch: 15 }, { wch: 20 }, { wch: 18 }
        ];
        ws['!cols'] = colWidths;

        const range = XLSX.utils.decode_range(ws['!ref']);
        for (let R = range.s.r + 1; R <= range.e.r; ++R) {
            // Custo Unitário agora na coluna 6 (índice), Valor Total na 7
            const cellRefF = XLSX.utils.encode_cell({ r: R, c: 6 });
            if (ws[cellRefF] && typeof ws[cellRefF].v === 'number') {
                ws[cellRefF].z = 'R$ #,##0.00';
            }
            const cellRefG = XLSX.utils.encode_cell({ r: R, c: 7 });
            if (ws[cellRefG] && typeof ws[cellRefG].v === 'number') {
                ws[cellRefG].z = 'R$ #,##0.00';
            }
        }

        const infoData = [
            { 'Campo': 'ID Inventário', 'Valor': id || 'Novo' },
            { 'Campo': 'Status', 'Valor': status || 'NOVO' },
            { 'Campo': 'Data de Geração', 'Valor': formatarDataHora(dataGeracao) },
            { 'Campo': 'Total de Itens', 'Valor': itens.length },
            { 'Campo': 'Critério', 'Valor': criterio },
            { 'Campo': '', 'Valor': '' },
            { 'Campo': 'BLOCOS', 'Valor': '' },
            { 'Campo': 'Movimentação', 'Valor': blocos?.movimentacao || 0 },
            { 'Campo': 'Baixa Acuracidade', 'Valor': blocos?.baixaAcuracidade || 0 },
            { 'Campo': 'Maior Valor', 'Valor': blocos?.maiorValor || 0 },
            { 'Campo': 'Maior Vlr Unitário', 'Valor': blocos?.maiorValorUnitario || 0 },
            { 'Campo': 'Não Contados', 'Valor': blocos?.naoContado || 0 },
            { 'Campo': '', 'Valor': '' },
            { 'Campo': 'Valor Total em Estoque', 'Valor': valorTotalGeral || 0 }
        ];

        const wsInfo = XLSX.utils.json_to_sheet(infoData);
        wsInfo['!cols'] = [{ wch: 25 }, { wch: 50 }];

        const valorTotalCell = XLSX.utils.encode_cell({ r: 13, c: 1 });
        if (wsInfo[valorTotalCell] && typeof wsInfo[valorTotalCell].v === 'number') {
            wsInfo[valorTotalCell].z = 'R$ #,##0.00';
        }

        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Inventário');
        XLSX.utils.book_append_sheet(wb, wsInfo, 'Informações');

        const nomeArquivo = id 
            ? 'Inventario_' + id + '_' + new Date().toISOString().slice(0,10) + '.xlsx'
            : 'Inventario_Nova_Lista_' + new Date().toISOString().slice(0,10) + '.xlsx';

        XLSX.writeFile(wb, nomeArquivo);

        statusMessage.style.color = 'green';
        statusMessage.textContent = 'Arquivo Excel exportado com sucesso!';
        setTimeout(() => { statusMessage.textContent = ''; }, 3000);
    }

    function formatarDataHora(dataString) {
        if (!dataString) return 'N/A';
        const data = new Date(dataString);
        return data.toLocaleString('pt-BR');
    }
});
