document.addEventListener('DOMContentLoaded', function() {
    const dataPeriodo = document.getElementById('dataPeriodo');
    const filtroFornecedor = document.getElementById('filtroFornecedor');
    const filtroCodigo = document.getElementById('filtroCodigo');
    const filtroContagem = document.getElementById('filtroContagem');
    const gerarRelatorioBtn = document.getElementById('gerarRelatorioBtn');
    const totalizadoresContainer = document.getElementById('totalizadoresContainer');
    const resultadosContainer = document.getElementById('resultadosContainer');
    const tabelaRelatorio = document.getElementById('tabelaRelatorio');
    const statusMessage = document.getElementById('statusMessage');
    const imprimirBtn = document.getElementById('imprimirBtn');
    const exportarExcelBtn = document.getElementById('exportarExcelBtn');

    // Modal de movimentações
    const modalMov = document.getElementById('modal-movimentacoes');
    document.getElementById('modal-mov-fechar').addEventListener('click', () => modalMov.style.display = 'none');
    modalMov.addEventListener('click', e => { if (e.target === modalMov) modalMov.style.display = 'none'; });

    let dadosRelatorio = [];
    let totalizadores = {};
    let sortColuna = null;
    let sortDirecao = 'asc';
    let filtroCodigoValor = '';

    // Define período padrão (mês atual)
    const hoje = new Date();
    const mesAtual = hoje.getFullYear() + '-' + String(hoje.getMonth() + 1).padStart(2, '0');
    dataPeriodo.value = mesAtual;

    gerarRelatorioBtn.addEventListener('click', gerarRelatorio);
    imprimirBtn.addEventListener('click', imprimirRelatorio);
    exportarExcelBtn.addEventListener('click', exportarParaExcel);

    filtroCodigo.addEventListener('input', () => {
        filtroCodigoValor = filtroCodigo.value.trim().toLowerCase();
        renderizarTabela();
    });

    async function gerarRelatorio() {
        const periodo = dataPeriodo.value;
        const fornecedor = filtroFornecedor.value.trim();

        if (!periodo) {
            mostrarMensagem('Por favor, selecione um período', 'error');
            return;
        }

        mostrarMensagem('Gerando relatório...', 'info');
        gerarRelatorioBtn.disabled = true;

        try {
            let url = `/api/relatorios?acao=consumoMedio&periodo=${periodo}`;
            if (fornecedor) {
                url += `&fornecedor=${encodeURIComponent(fornecedor)}`;
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
                    `⚠️ Nenhum item encontrado para o período selecionado.`, 
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
                `Relatório gerado com sucesso! ${dadosRelatorio.length} itens encontrados.`, 
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
        document.getElementById('totalItens').textContent = 
            totalizadores.totalItens.toLocaleString('pt-BR');
        
        document.getElementById('valorTotalEstoque').textContent = 
            `R$ ${totalizadores.valorTotalEstoque.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
        
        document.getElementById('totalFornecedores').textContent = 
            totalizadores.totalFornecedores.toLocaleString('pt-BR');
        
        // Formata o período
        const [ano, mes] = dataPeriodo.value.split('-');
        const meses = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
        document.getElementById('periodoInfo').textContent = 
            `${meses[parseInt(mes) - 1]}/${ano}`;
    }

    // Mapeamento: índice da coluna → campo no objeto de dados (null = não ordenável)
    const colunasOrdenacao = [
        null,                        // #
        'CODIGO',                    // Código
        'SALDO_ATUAL',               // Saldo Atual
        'DESCRICAO',                 // Descrição
        'PRECO_UNITARIO',            // Preço Unit.
        '_VALOR_TOTAL',              // Valor Total (calculado)
        'FORNECEDOR',                // Fornecedor
        'CONSUMO_MEDIO_1MES',        // Consumo 1 Mês
        'CONSUMO_MEDIO_BIMESTRAL',   // Consumo Bimestral
        'CONSUMO_MEDIO_SEMESTRAL',   // Consumo Semestral
        'CONSUMO_MEDIO_ANUAL'        // Consumo Anual
    ];

    function getDadosOrdenados() {
        let lista = dadosRelatorio;
        // Filtro por código ou descrição
        if (filtroCodigoValor) {
            lista = lista.filter(item =>
                String(item.CODIGO).toLowerCase().includes(filtroCodigoValor) ||
                (item.DESCRICAO || '').toLowerCase().includes(filtroCodigoValor)
            );
        }
        if (!sortColuna) return lista;
        return [...lista].sort((a, b) => {
            let va = sortColuna === '_VALOR_TOTAL' ? (a.SALDO_ATUAL || 0) * (a.PRECO_UNITARIO || 0) : (a[sortColuna] ?? '');
            let vb = sortColuna === '_VALOR_TOTAL' ? (b.SALDO_ATUAL || 0) * (b.PRECO_UNITARIO || 0) : (b[sortColuna] ?? '');
            if (typeof va === 'string') va = va.toLowerCase();
            if (typeof vb === 'string') vb = vb.toLowerCase();
            if (va < vb) return sortDirecao === 'asc' ? -1 : 1;
            if (va > vb) return sortDirecao === 'asc' ? 1 : -1;
            return 0;
        });
    }

    function iconeSort(campo) {
        if (sortColuna !== campo) return '<i class="fa fa-sort" style="opacity:.35;margin-left:4px;"></i>';
        return sortDirecao === 'asc'
            ? '<i class="fa fa-sort-up" style="margin-left:4px;"></i>'
            : '<i class="fa fa-sort-down" style="margin-left:4px;"></i>';
    }

    function renderizarTabela() {
        if (dadosRelatorio.length === 0) {
            tabelaRelatorio.innerHTML = '<p class="info-message">Nenhum registro encontrado para o período selecionado.</p>';
            return;
        }

        const dados = getDadosOrdenados();

        // Atualiza contagem do filtro
        if (filtroCodigoValor) {
            filtroContagem.textContent = `${dados.length} de ${dadosRelatorio.length} itens`;
        } else {
            filtroContagem.textContent = '';
        }

        const cabecalhos = [
            { label: '#',                        campo: null },
            { label: 'Código',                   campo: 'CODIGO' },
            { label: 'Saldo Atual',              campo: 'SALDO_ATUAL' },
            { label: 'Descrição',                campo: 'DESCRICAO' },
            { label: 'Preço Unit. Últ. NF',      campo: 'PRECO_UNITARIO' },
            { label: 'Valor Total Estoque',      campo: '_VALOR_TOTAL' },
            { label: 'Fornecedor',               campo: 'FORNECEDOR' },
            { label: 'Consumo Médio 1 Mês',      campo: 'CONSUMO_MEDIO_1MES', janela: 30 },
            { label: 'Consumo Médio Bimestral',  campo: 'CONSUMO_MEDIO_BIMESTRAL', janela: 60 },
            { label: 'Consumo Médio Semestral',  campo: 'CONSUMO_MEDIO_SEMESTRAL', janela: 180 },
            { label: 'Consumo Médio Anual',      campo: 'CONSUMO_MEDIO_ANUAL', janela: 365 },
        ];

        const thsHtml = cabecalhos.map(col => {
            if (!col.campo) return `<th>#</th>`;
            return `<th style="cursor:pointer;white-space:nowrap;" data-campo="${col.campo}">${col.label}${iconeSort(col.campo)}</th>`;
        }).join('');

        const colunasConsumo = {
            'CONSUMO_MEDIO_1MES':       { campo: 'CONSUMO_MEDIO_1MES',       janela: 30,  label: '1 Mês' },
            'CONSUMO_MEDIO_BIMESTRAL':  { campo: 'CONSUMO_MEDIO_BIMESTRAL',  janela: 60,  label: 'Bimestral' },
            'CONSUMO_MEDIO_SEMESTRAL':  { campo: 'CONSUMO_MEDIO_SEMESTRAL',  janela: 180, label: 'Semestral' },
            'CONSUMO_MEDIO_ANUAL':      { campo: 'CONSUMO_MEDIO_ANUAL',      janela: 365, label: 'Anual' },
        };

        const html = `
            <table>
                <thead><tr>${thsHtml}</tr></thead>
                <tbody>
                    ${dados.map((item, index) => {
                        const valorTotal = (item.SALDO_ATUAL || 0) * (item.PRECO_UNITARIO || 0);
                        return `
                        <tr>
                            <td>${index + 1}</td>
                            <td><strong>${item.CODIGO}</strong></td>
                            <td>${(item.SALDO_ATUAL || 0).toLocaleString('pt-BR')}</td>
                            <td>${item.DESCRICAO || 'SEM DESCRIÇÃO'}</td>
                            <td>R$ ${(item.PRECO_UNITARIO || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                            <td><strong>R$ ${valorTotal.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong></td>
                            <td>${item.FORNECEDOR || 'NÃO INFORMADO'}</td>
                            <td class="cel-consumo" data-codigo="${item.CODIGO}" data-janela="30" data-label="1 Mês" data-descricao="${(item.DESCRICAO||'').replace(/"/g,'&quot;')}" style="cursor:pointer;color:#1565c0;text-decoration:underline dotted;">${(item.CONSUMO_MEDIO_1MES || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                            <td class="cel-consumo" data-codigo="${item.CODIGO}" data-janela="60" data-label="Bimestral" data-descricao="${(item.DESCRICAO||'').replace(/"/g,'&quot;')}" style="cursor:pointer;color:#1565c0;text-decoration:underline dotted;">${(item.CONSUMO_MEDIO_BIMESTRAL || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                            <td class="cel-consumo" data-codigo="${item.CODIGO}" data-janela="180" data-label="Semestral" data-descricao="${(item.DESCRICAO||'').replace(/"/g,'&quot;')}" style="cursor:pointer;color:#1565c0;text-decoration:underline dotted;">${(item.CONSUMO_MEDIO_SEMESTRAL || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                            <td class="cel-consumo" data-codigo="${item.CODIGO}" data-janela="365" data-label="Anual" data-descricao="${(item.DESCRICAO||'').replace(/"/g,'&quot;')}" style="cursor:pointer;color:#1565c0;text-decoration:underline dotted;">${(item.CONSUMO_MEDIO_ANUAL || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                        </tr>`;
                    }).join('')}
                </tbody>
                <tfoot>
                    <tr class="total-row">
                        <td colspan="5" style="text-align: right;"><strong>TOTAL GERAL:</strong></td>
                        <td><strong>R$ ${totalizadores.valorTotalEstoque.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong></td>
                        <td></td>
                    </tr>
                </tfoot>
            </table>
        `;
        tabelaRelatorio.innerHTML = html;

        // Ordenação por cabeçalho
        tabelaRelatorio.querySelectorAll('th[data-campo]').forEach(th => {
            th.addEventListener('click', () => {
                const campo = th.dataset.campo;
                if (sortColuna === campo) {
                    sortDirecao = sortDirecao === 'asc' ? 'desc' : 'asc';
                } else {
                    sortColuna = campo;
                    sortDirecao = 'asc';
                }
                renderizarTabela();
            });
        });

        // Clique nas células de consumo → abre modal
        tabelaRelatorio.querySelectorAll('.cel-consumo').forEach(td => {
            td.addEventListener('click', () => {
                const codigo = td.dataset.codigo;
                const janela = parseInt(td.dataset.janela);
                const label = td.dataset.label;
                const descricao = td.dataset.descricao;
                abrirModalMovimentacoes(codigo, descricao, janela, label);
            });
        });
    }

    async function abrirModalMovimentacoes(codigo, descricao, janelaDias, label) {
        const corpo = document.getElementById('modal-mov-corpo');
        document.getElementById('modal-mov-titulo').textContent = `${codigo} — ${descricao}`;
        document.getElementById('modal-mov-subtitulo').textContent = `Movimentações usadas no cálculo do Consumo Médio ${label} (últimos ${janelaDias} dias, a partir de 01/04/2026)`;
        corpo.innerHTML = '<p style="color:#888; padding:20px 0; text-align:center;"><i class="fa fa-spinner fa-spin"></i> Carregando...</p>';
        modalMov.style.display = 'flex';

        try {
            const resp = await fetch(`/api/relatorios?acao=movimentacoesProduto&codigo=${encodeURIComponent(codigo)}&janela=${janelaDias}`);
            if (!resp.ok) throw new Error('Erro ao buscar movimentações');
            const { movimentacoes, totalSaidas } = await resp.json();

            if (!movimentacoes.length) {
                corpo.innerHTML = '<p style="text-align:center; color:#888; padding:20px 0;">Nenhuma movimentação encontrada neste período.</p>';
                return;
            }

            const consumoMensal = totalSaidas * 30 / janelaDias;

            corpo.innerHTML = `
                <div style="display:flex; gap:16px; margin-bottom:16px; flex-wrap:wrap;">
                    <div style="background:#e3f2fd; border-radius:8px; padding:12px 20px; text-align:center;">
                        <div style="font-size:11px; color:#555; font-weight:600;">TOTAL SAÍDAS (JANELA)</div>
                        <div style="font-size:22px; font-weight:700; color:#1565c0;">${totalSaidas.toLocaleString('pt-BR')}</div>
                    </div>
                    <div style="background:#e8f5e9; border-radius:8px; padding:14px 24px; text-align:center; border:2px solid #2e7d32;">
                        <div style="font-size:12px; color:#2e7d32; font-weight:700;">CONSUMO MÉDIO MENSAL</div>
                        <div style="font-size:26px; font-weight:700; color:#2e7d32;">${consumoMensal.toLocaleString('pt-BR', {minimumFractionDigits:0, maximumFractionDigits:0})}</div>
                        <div style="font-size:11px; color:#666;">unidades/mês • janela ${label}</div>
                    </div>
                    <div style="background:#f3e5f5; border-radius:8px; padding:12px 20px; text-align:center;">
                        <div style="font-size:11px; color:#555; font-weight:600;">Nº MOVIMENTAÇÕES</div>
                        <div style="font-size:22px; font-weight:700; color:#6a1b9a;">${movimentacoes.length}</div>
                    </div>
                </div>
                <table style="width:100%; border-collapse:collapse; font-size:13px;">
                    <thead>
                        <tr style="background:#343a40; color:#fff;">
                            <th style="padding:8px 10px; text-align:left;">Data</th>
                            <th style="padding:8px 10px; text-align:left;">Hora</th>
                            <th style="padding:8px 10px; text-align:left;">Operação</th>
                            <th style="padding:8px 10px; text-align:right;">Quantidade</th>
                            <th style="padding:8px 10px; text-align:left;">Usuário</th>
                            <th style="padding:8px 10px; text-align:left;">Motivo</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${movimentacoes.map((m, i) => `
                            <tr style="background:${i%2===0?'#fff':'#f8f9fa'}; border-bottom:1px solid #eee;">
                                <td style="padding:7px 10px;">${m.DT ? new Date(m.DT).toLocaleDateString('pt-BR') : '-'}</td>
                                <td style="padding:7px 10px;">${m.HR || '-'}</td>
                                <td style="padding:7px 10px;"><span style="background:#ffe0e0; color:#c62828; padding:2px 8px; border-radius:12px; font-size:12px; font-weight:600;">SAÍDA</span></td>
                                <td style="padding:7px 10px; text-align:right; font-weight:600;">${Math.abs(m.QNT).toLocaleString('pt-BR')}</td>
                                <td style="padding:7px 10px;">${m.USUARIO || '-'}</td>
                                <td style="padding:7px 10px;">${m.MOTIVO || '-'}</td>
                            </tr>`).join('')}
                    </tbody>
                    <tfoot>
                        <tr style="background:#fff3cd; font-weight:700;">
                            <td colspan="3" style="padding:8px 10px; text-align:right;">TOTAL SAÍDAS:</td>
                            <td style="padding:8px 10px; text-align:right;">${totalSaidas.toLocaleString('pt-BR')}</td>
                            <td colspan="2"></td>
                        </tr>
                    </tfoot>
                </table>`;
        } catch (e) {
            corpo.innerHTML = `<p style="color:#c62828; padding:20px 0; text-align:center;">Erro ao carregar movimentações: ${e.message}</p>`;
        }
    }

    function imprimirRelatorio() {
        const janela = window.open('', '_blank');
        
        const [ano, mes] = dataPeriodo.value.split('-');
        const meses = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
        const periodoFormatado = `${meses[parseInt(mes) - 1]} de ${ano}`;
        
        const conteudo = `
            <!DOCTYPE html>
            <html lang="pt-BR">
            <head>
                <meta charset="UTF-8">
                <title>Consumo de Estoque - ${periodoFormatado}</title>
                <style>
                    body { font-family: Arial, sans-serif; padding: 20px; }
                    h1 { text-align: center; background: #FFE135; padding: 15px; margin: 0 0 20px 0; }
                    h2 { color: #333; margin-top: 20px; }
                    table { width: 100%; border-collapse: collapse; margin-top: 10px; }
                    th, td { padding: 8px; border: 1px solid #000; text-align: left; }
                    th { background: #000; color: white; font-weight: bold; }
                    tr:nth-child(even) { background: #f9f9f9; }
                    .total-row { background: #FFE135; font-weight: bold; }
                    .footer { margin-top: 20px; font-size: 12px; text-align: center; }
                </style>
            </head>
            <body>
                <h1>CONSUMO DE ESTOQUE REFERENTE À ${periodoFormatado.toUpperCase()}</h1>
                ${tabelaRelatorio.innerHTML}
                <div class="footer">
                    <p>Relatório gerado em ${new Date().toLocaleString('pt-BR')}</p>
                    <p style="page-break-after: always;"></p>
                </div>
            </body>
            </html>
        `;
        
        janela.document.write(conteudo);
        janela.document.close();
        
        setTimeout(() => {
            janela.print();
        }, 250);
    }

    function exportarParaExcel() {
        const [ano, mes] = dataPeriodo.value.split('-');
        const meses = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
        const nomeArquivo = `Consumo_Estoque_${meses[parseInt(mes) - 1]}_${ano}.xlsx`;

        const ws_data = [
            ['CONSUMO DE ESTOQUE REFERENTE À ' + meses[parseInt(mes) - 1] + '/' + ano],
            [],
            ['#', 'Código', 'Saldo Atual', 'Descrição', 'Preço Unit. Últ. NF', 'Valor Total Estoque', 'Fornecedor', 'Consumo Médio 1 Mês', 'Consumo Médio Bimestral', 'Consumo Médio Semestral', 'Consumo Médio Anual'],
            ...dadosRelatorio.map((item, index) => {
                const valorTotal = (item.SALDO_ATUAL || 0) * (item.PRECO_UNITARIO || 0);
                return [
                    index + 1,
                    item.CODIGO,
                    item.SALDO_ATUAL || 0,
                    item.DESCRICAO || 'SEM DESCRIÇÃO',
                    item.PRECO_UNITARIO || 0,
                    valorTotal,
                    item.FORNECEDOR || 'NÃO INFORMADO',
                    item.CONSUMO_MEDIO_1MES || 0,
                    item.CONSUMO_MEDIO_BIMESTRAL || 0,
                    item.CONSUMO_MEDIO_SEMESTRAL || 0,
                    item.CONSUMO_MEDIO_ANUAL || 0
                ];
            }),
            [],
            ['', '', '', '', 'TOTAL GERAL:', totalizadores.valorTotalEstoque, '']
        ];

        const ws = XLSX.utils.aoa_to_sheet(ws_data);
        ws['!cols'] = [
            { wch: 5 },
            { wch: 12 },
            { wch: 15 },
            { wch: 35 },
            { wch: 18 },
            { wch: 20 },
            { wch: 35 }
        ];

        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Consumo');
        XLSX.writeFile(wb, nomeArquivo);
    }

    function mostrarMensagem(mensagem, tipo = 'info') {
        statusMessage.textContent = mensagem;
        statusMessage.className = 'status-message';
        
        if (tipo === 'error') {
            statusMessage.style.color = '#c00';
        } else if (tipo === 'success') {
            statusMessage.style.color = 'green';
        } else {
            statusMessage.style.color = '#222';
        }

        if (tipo === 'success') {
            setTimeout(() => { statusMessage.textContent = ''; }, 5000);
        }
    }

    function formatarData(data) {
        if (!data) return '-';
        const d = new Date(data);
        return d.toLocaleDateString('pt-BR');
    }
});
