document.addEventListener('DOMContentLoaded', function () {
    const filtroCurvaABC = document.getElementById('filtroCurvaABC');
    const filtroTipoProduto = document.getElementById('filtroTipoProduto');
    const filtroStatus = document.getElementById('filtroStatus');
    const chkAtivos = document.getElementById('chkAtivos');
    const chkInativos = document.getElementById('chkInativos');
    const gerarRelatorioBtn = document.getElementById('gerarRelatorioBtn');
    const totalizadoresContainer = document.getElementById('totalizadoresContainer');
    const resultadosContainer = document.getElementById('resultadosContainer');
    const tabelaRelatorio = document.getElementById('tabelaRelatorio');
    const statusMessage = document.getElementById('statusMessage');
    const imprimirBtn = document.getElementById('imprimirBtn');
    const exportarExcelBtn = document.getElementById('exportarExcelBtn');

    let dadosRelatorio = [];
    let totalizadores = {};
    let filtrosTabela = {
        codigo: '',
        descricao: '',
        tipo: '',
        curva: '',
        status: ''
    };
    let ordenacaoAtual = {
        coluna: null,
        direcao: 'asc'
    };

    carregarTiposProduto();

    gerarRelatorioBtn.addEventListener('click', gerarRelatorio);
    imprimirBtn.addEventListener('click', function () { window.print(); });
    exportarExcelBtn.addEventListener('click', exportarParaExcel);

    async function carregarTiposProduto() {
        try {
            const response = await fetch('/api/embalagem/relatorios?acao=tiposProduto');
            if (!response.ok) throw new Error('Erro ao carregar tipos de produto.');
            const data = await response.json();

            data.tipos.forEach(tipo => {
                const option = document.createElement('option');
                option.value = tipo;
                option.textContent = tipo;
                filtroTipoProduto.appendChild(option);
            });
        } catch (error) {
            console.error('Erro ao carregar tipos de produto:', error);
        }
    }

    async function gerarRelatorio() {
        if (!chkAtivos.checked && !chkInativos.checked) {
            mostrarMensagem('Selecione ao menos uma opção de status (Ativo/Inativo).', 'error');
            return;
        }

        gerarRelatorioBtn.disabled = true;
        mostrarMensagem('Gerando relatório...', 'info');

        try {
            let url = '/api/embalagem/relatorios?acao=necessidadeCompras';
            if (filtroCurvaABC.value) url += `&curvaABC=${encodeURIComponent(filtroCurvaABC.value)}`;
            if (filtroTipoProduto.value) url += `&tipoProduto=${encodeURIComponent(filtroTipoProduto.value)}`;
            if (filtroStatus.value) url += `&statusTermometro=${encodeURIComponent(filtroStatus.value)}`;
            if (chkAtivos.checked) url += '&ativos=sim';
            if (chkInativos.checked) url += '&inativos=sim';

            const response = await fetch(url);
            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.message || 'Falha ao consultar relatório.');
            }

            const payload = await response.json();
            dadosRelatorio = payload.dados || [];
            totalizadores = payload.totalizadores || {};
            filtrosTabela = {
                codigo: '',
                descricao: '',
                tipo: '',
                curva: '',
                status: ''
            };
            ordenacaoAtual = {
                coluna: null,
                direcao: 'asc'
            };

            if (!dadosRelatorio.length) {
                totalizadoresContainer.style.display = 'none';
                resultadosContainer.style.display = 'none';
                mostrarMensagem('Nenhum item encontrado com os filtros selecionados.', 'error');
                return;
            }

            renderizarTotalizadores();
            renderizarTabela();
            totalizadoresContainer.style.display = 'block';
            resultadosContainer.style.display = 'block';
            mostrarMensagem(`Relatório gerado com sucesso. ${dadosRelatorio.length} item(ns) encontrado(s).`, 'success');
        } catch (error) {
            console.error('Erro ao gerar relatório:', error);
            mostrarMensagem(`Erro ao gerar relatório: ${error.message}`, 'error');
        } finally {
            gerarRelatorioBtn.disabled = false;
        }
    }

    function renderizarTotalizadores() {
        const dadosVisiveis = obterDadosVisiveis();
        const totaisVisiveis = calcularTotalizadores(dadosVisiveis);

        document.getElementById('kpiTotal').textContent = numero(totaisVisiveis.totalProdutos || 0);
        document.getElementById('kpiAbaixo').textContent = numero(totaisVisiveis.totalAbaixoMinimo || 0);
        document.getElementById('kpiMinimo').textContent = numero(totaisVisiveis.totalNoMinimo || 0);
        document.getElementById('kpiRegular').textContent = numero(totaisVisiveis.totalRegular || 0);
        document.getElementById('kpiExcedente').textContent = numero(totaisVisiveis.totalExcedente || 0);
        document.getElementById('kpiNecessidade').textContent = numero(totaisVisiveis.necessidadeTotalIdeal || 0);
    }

    function renderizarTabela() {
        const dadosVisiveis = obterDadosVisiveis();
        const html = `
            <table>
                <thead>
                    <tr>
                        <th>#</th>
                        <th class="sortable" data-sort="CODIGO">Código${iconeOrdenacao('CODIGO')}</th>
                        <th class="sortable" data-sort="DESCRICAO">Descrição${iconeOrdenacao('DESCRICAO')}</th>
                        <th class="sortable" data-sort="TIPO">Tipo${iconeOrdenacao('TIPO')}</th>
                        <th class="sortable" data-sort="CURVA_A_B_C">Curva${iconeOrdenacao('CURVA_A_B_C')}</th>
                        <th class="sortable" data-sort="SALDO">Saldo${iconeOrdenacao('SALDO')}</th>
                        <th class="sortable" data-sort="ESTOQUE_MINIMO">Mínimo${iconeOrdenacao('ESTOQUE_MINIMO')}</th>
                        <th class="sortable" data-sort="ESTOQUE_IDEAL">Ideal${iconeOrdenacao('ESTOQUE_IDEAL')}</th>
                        <th class="sortable" data-sort="ESTOQUE_MAXIMO">Máximo${iconeOrdenacao('ESTOQUE_MAXIMO')}</th>
                        <th class="sortable" data-sort="STATUS_TERMOMETRO">Status${iconeOrdenacao('STATUS_TERMOMETRO')}</th>
                        <th class="sortable" data-sort="NECESSIDADE_COMPRA">Necessidade p/ Ideal${iconeOrdenacao('NECESSIDADE_COMPRA')}</th>
                        <th class="sortable" data-sort="PERCENTUAL_TERMOMETRO">Termômetro${iconeOrdenacao('PERCENTUAL_TERMOMETRO')}</th>
                    </tr>
                    <tr class="filter-row">
                        <th></th>
                        <th><input class="filter-input" data-filter="codigo" type="text" placeholder="Filtrar" value="${escaparHtml(filtrosTabela.codigo)}"></th>
                        <th><input class="filter-input" data-filter="descricao" type="text" placeholder="Filtrar" value="${escaparHtml(filtrosTabela.descricao)}"></th>
                        <th><input class="filter-input" data-filter="tipo" type="text" placeholder="Filtrar" value="${escaparHtml(filtrosTabela.tipo)}"></th>
                        <th><input class="filter-input" data-filter="curva" type="text" placeholder="Filtrar" value="${escaparHtml(filtrosTabela.curva)}"></th>
                        <th></th>
                        <th></th>
                        <th></th>
                        <th></th>
                        <th>
                            <select class="filter-select" data-filter="status">
                                <option value="">Todos</option>
                                <option value="ABAIXO DO MINIMO" ${filtrosTabela.status === 'ABAIXO DO MINIMO' ? 'selected' : ''}>Abaixo</option>
                                <option value="NO MINIMO" ${filtrosTabela.status === 'NO MINIMO' ? 'selected' : ''}>No mínimo</option>
                                <option value="REGULAR" ${filtrosTabela.status === 'REGULAR' ? 'selected' : ''}>Regular</option>
                                <option value="EXCEDENTE" ${filtrosTabela.status === 'EXCEDENTE' ? 'selected' : ''}>Excedente</option>
                                <option value="SEM PARAMETRO" ${filtrosTabela.status === 'SEM PARAMETRO' ? 'selected' : ''}>Sem parâmetro</option>
                            </select>
                        </th>
                        <th></th>
                        <th></th>
                    </tr>
                </thead>
                <tbody>
                    ${dadosVisiveis.length ? dadosVisiveis.map((item, index) => {
                        const saldo = Number(item.SALDO || 0);
                        const minimo = Number(item.ESTOQUE_MINIMO || 0);
                        const ideal = Number(item.ESTOQUE_IDEAL || 0);
                        const maximo = Number(item.ESTOQUE_MAXIMO || 0);
                        const necessidade = Number(item.NECESSIDADE_COMPRA || 0);
                        const status = item.STATUS_TERMOMETRO || 'SEM PARAMETRO';

                        const percentual = maximo > 0 ? Math.min((saldo / maximo) * 100, 100) : 0;
                        const barClass = obterBarraClass(status);
                        const statusClass = obterStatusClass(status);

                        return `
                            <tr>
                                <td>${index + 1}</td>
                                <td><strong>${item.CODIGO}</strong></td>
                                <td>${item.DESCRICAO || ''}</td>
                                <td>${item.TIPO || ''}</td>
                                <td>${item.CURVA_A_B_C || 'C'}</td>
                                <td>${numero(saldo)}</td>
                                <td>${numero(minimo)}</td>
                                <td>${numero(ideal)}</td>
                                <td>${numero(maximo)}</td>
                                <td><span class="status-chip ${statusClass}">${status}</span></td>
                                <td><strong>${numero(necessidade)}</strong></td>
                                <td>
                                    <div class="termometro-wrap">
                                        <div class="termometro-track">
                                            <div class="termometro-fill ${barClass}" style="width:${percentual.toFixed(1)}%"></div>
                                        </div>
                                        <div class="termometro-meta">${percentual.toFixed(1)}% do máximo</div>
                                    </div>
                                </td>
                            </tr>
                        `;
                    }).join('') : `
                        <tr>
                            <td colspan="12" class="sem-resultados-tabela">Nenhum item encontrado com os filtros da tabela.</td>
                        </tr>
                    `}
                </tbody>
            </table>
        `;

        tabelaRelatorio.innerHTML = html;
        vincularEventosTabela();
    }

    function exportarParaExcel() {
        const dadosVisiveis = obterDadosVisiveis();

        if (!dadosVisiveis.length) {
            mostrarMensagem('Não há dados para exportar.', 'error');
            return;
        }

        const dadosExcel = dadosVisiveis.map((item, index) => ({
            '#': index + 1,
            'Código': item.CODIGO,
            'Descrição': item.DESCRICAO || '',
            'Tipo': item.TIPO || '',
            'Curva ABC': item.CURVA_A_B_C || 'C',
            'Saldo': Number(item.SALDO || 0),
            'Estoque Mínimo': Number(item.ESTOQUE_MINIMO || 0),
            'Estoque Ideal': Number(item.ESTOQUE_IDEAL || 0),
            'Estoque Máximo': Number(item.ESTOQUE_MAXIMO || 0),
            'Status': item.STATUS_TERMOMETRO || 'SEM PARAMETRO',
            'Necessidade para Ideal': Number(item.NECESSIDADE_COMPRA || 0)
        }));

        const ws = XLSX.utils.json_to_sheet(dadosExcel);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Necessidade Compras');

        const dataAtual = new Date().toISOString().slice(0, 10);
        XLSX.writeFile(wb, `relatorio_necessidade_compras_${dataAtual}.xlsx`);
        mostrarMensagem('Arquivo Excel exportado com sucesso.', 'success');
    }

    function vincularEventosTabela() {
        tabelaRelatorio.querySelectorAll('.sortable').forEach(th => {
            th.addEventListener('click', function () {
                const coluna = this.dataset.sort;
                alternarOrdenacao(coluna);
            });
        });

        tabelaRelatorio.querySelectorAll('.filter-input, .filter-select').forEach(campo => {
            const evento = campo.tagName === 'SELECT' ? 'change' : 'input';
            campo.addEventListener(evento, function () {
                filtrosTabela[this.dataset.filter] = this.value.trim();
                renderizarTotalizadores();
                renderizarTabela();
            });
        });
    }

    function alternarOrdenacao(coluna) {
        if (ordenacaoAtual.coluna === coluna) {
            ordenacaoAtual.direcao = ordenacaoAtual.direcao === 'asc' ? 'desc' : 'asc';
        } else {
            ordenacaoAtual.coluna = coluna;
            ordenacaoAtual.direcao = 'asc';
        }

        renderizarTotalizadores();
        renderizarTabela();
    }

    function obterDadosVisiveis() {
        let lista = [...dadosRelatorio];

        if (filtrosTabela.codigo) {
            const termo = filtrosTabela.codigo.toLowerCase();
            lista = lista.filter(item => String(item.CODIGO || '').toLowerCase().includes(termo));
        }

        if (filtrosTabela.descricao) {
            const termo = filtrosTabela.descricao.toLowerCase();
            lista = lista.filter(item => String(item.DESCRICAO || '').toLowerCase().includes(termo));
        }

        if (filtrosTabela.tipo) {
            const termo = filtrosTabela.tipo.toLowerCase();
            lista = lista.filter(item => String(item.TIPO || '').toLowerCase().includes(termo));
        }

        if (filtrosTabela.curva) {
            const termo = filtrosTabela.curva.toLowerCase();
            lista = lista.filter(item => String(item.CURVA_A_B_C || '').toLowerCase().includes(termo));
        }

        if (filtrosTabela.status) {
            lista = lista.filter(item => String(item.STATUS_TERMOMETRO || '') === filtrosTabela.status);
        }

        if (!ordenacaoAtual.coluna) {
            return lista;
        }

        const direcao = ordenacaoAtual.direcao === 'asc' ? 1 : -1;

        lista.sort((a, b) => compararValores(obterValorOrdenacao(a, ordenacaoAtual.coluna), obterValorOrdenacao(b, ordenacaoAtual.coluna)) * direcao);
        return lista;
    }

    function obterValorOrdenacao(item, coluna) {
        if (coluna === 'PERCENTUAL_TERMOMETRO') {
            const saldo = Number(item.SALDO || 0);
            const maximo = Number(item.ESTOQUE_MAXIMO || 0);
            return maximo > 0 ? (saldo / maximo) * 100 : 0;
        }

        if (['SALDO', 'ESTOQUE_MINIMO', 'ESTOQUE_IDEAL', 'ESTOQUE_MAXIMO', 'NECESSIDADE_COMPRA'].includes(coluna)) {
            return Number(item[coluna] || 0);
        }

        return String(item[coluna] || '').toLowerCase();
    }

    function compararValores(a, b) {
        if (typeof a === 'number' && typeof b === 'number') {
            return a - b;
        }

        return String(a).localeCompare(String(b), 'pt-BR', { numeric: true, sensitivity: 'base' });
    }

    function calcularTotalizadores(lista) {
        return {
            totalProdutos: lista.length,
            totalAbaixoMinimo: lista.filter(r => r.STATUS_TERMOMETRO === 'ABAIXO DO MINIMO').length,
            totalNoMinimo: lista.filter(r => r.STATUS_TERMOMETRO === 'NO MINIMO').length,
            totalRegular: lista.filter(r => r.STATUS_TERMOMETRO === 'REGULAR').length,
            totalExcedente: lista.filter(r => r.STATUS_TERMOMETRO === 'EXCEDENTE').length,
            necessidadeTotalIdeal: lista.reduce((acc, r) => acc + Number(r.NECESSIDADE_COMPRA || 0), 0)
        };
    }

    function iconeOrdenacao(coluna) {
        if (ordenacaoAtual.coluna !== coluna) return '<i class="fa-solid fa-sort"></i>';
        return ordenacaoAtual.direcao === 'asc'
            ? '<i class="fa-solid fa-sort-up"></i>'
            : '<i class="fa-solid fa-sort-down"></i>';
    }

    function escaparHtml(valor) {
        return String(valor || '')
            .replaceAll('&', '&amp;')
            .replaceAll('<', '&lt;')
            .replaceAll('>', '&gt;')
            .replaceAll('"', '&quot;')
            .replaceAll("'", '&#39;');
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

    function numero(valor) {
        return Number(valor || 0).toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 3 });
    }

    function obterStatusClass(status) {
        if (status === 'ABAIXO DO MINIMO') return 'status-abaixo';
        if (status === 'NO MINIMO') return 'status-minimo';
        if (status === 'REGULAR') return 'status-regular';
        if (status === 'EXCEDENTE') return 'status-excedente';
        return 'status-sem-parametro';
    }

    function obterBarraClass(status) {
        if (status === 'ABAIXO DO MINIMO') return 'status-abaixo';
        if (status === 'NO MINIMO') return 'status-minimo';
        if (status === 'REGULAR') return 'status-regular';
        if (status === 'EXCEDENTE') return 'status-excedente';
        return 'status-sem-parametro';
    }
});
