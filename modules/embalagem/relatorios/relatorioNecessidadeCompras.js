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
        document.getElementById('kpiTotal').textContent = numero(totalizadores.totalProdutos || 0);
        document.getElementById('kpiAbaixo').textContent = numero(totalizadores.totalAbaixoMinimo || 0);
        document.getElementById('kpiMinimo').textContent = numero(totalizadores.totalNoMinimo || 0);
        document.getElementById('kpiRegular').textContent = numero(totalizadores.totalRegular || 0);
        document.getElementById('kpiExcedente').textContent = numero(totalizadores.totalExcedente || 0);
        document.getElementById('kpiNecessidade').textContent = numero(totalizadores.necessidadeTotalIdeal || 0);
    }

    function renderizarTabela() {
        const html = `
            <table>
                <thead>
                    <tr>
                        <th>#</th>
                        <th>Código</th>
                        <th>Descrição</th>
                        <th>Tipo</th>
                        <th>Curva</th>
                        <th>Saldo</th>
                        <th>Mínimo</th>
                        <th>Ideal</th>
                        <th>Máximo</th>
                        <th>Status</th>
                        <th>Necessidade p/ Ideal</th>
                        <th>Termômetro</th>
                    </tr>
                </thead>
                <tbody>
                    ${dadosRelatorio.map((item, index) => {
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
                    }).join('')}
                </tbody>
            </table>
        `;

        tabelaRelatorio.innerHTML = html;
    }

    function exportarParaExcel() {
        if (!dadosRelatorio.length) {
            mostrarMensagem('Não há dados para exportar.', 'error');
            return;
        }

        const dadosExcel = dadosRelatorio.map((item, index) => ({
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
