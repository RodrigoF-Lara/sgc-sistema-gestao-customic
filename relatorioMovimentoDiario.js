document.addEventListener('DOMContentLoaded', function () {
    const dataPosicao = document.getElementById('dataPosicao');
    const tipoProduto = document.getElementById('tipoProduto');
    const hojeBtn = document.getElementById('hojeBtn');
    const gerarRelatorioBtn = document.getElementById('gerarRelatorioBtn');
    const totalizadoresContainer = document.getElementById('totalizadoresContainer');
    const resultadosContainer = document.getElementById('resultadosContainer');
    const tabelaRelatorio = document.getElementById('tabelaRelatorio');
    const statusMessage = document.getElementById('statusMessage');
    const imprimirBtn = document.getElementById('imprimirBtn');
    const exportarExcelBtn = document.getElementById('exportarExcelBtn');

    let dadosRelatorio = [];
    let totalizadores = {};

    // Data padrão: hoje
    dataPosicao.valueAsDate = new Date();

    hojeBtn.addEventListener('click', () => { dataPosicao.valueAsDate = new Date(); });
    gerarRelatorioBtn.addEventListener('click', gerarRelatorio);
    imprimirBtn.addEventListener('click', imprimirRelatorio);
    exportarExcelBtn.addEventListener('click', exportarParaExcel);

    async function gerarRelatorio() {
        const data = dataPosicao.value;
        const tipo = tipoProduto.value;

        if (!data) {
            mostrarMensagem('Selecione uma data', 'error');
            return;
        }

        mostrarMensagem('Gerando relatório...', 'info');
        gerarRelatorioBtn.disabled = true;

        try {
            let url = `/api/relatorios?acao=movimentoDiario&data=${data}`;
            if (tipo) url += `&tipoProduto=${encodeURIComponent(tipo)}`;

            const response = await fetch(url);
            if (!response.ok) {
                const err = await response.json();
                throw new Error(err.message || 'Erro ao buscar dados');
            }

            const resultado = await response.json();
            dadosRelatorio = resultado.dados || [];
            totalizadores = resultado.totalizadores || {};

            if (dadosRelatorio.length === 0) {
                mostrarMensagem('⚠️ Nenhuma movimentação encontrada para a data selecionada.', 'error');
                totalizadoresContainer.style.display = 'none';
                resultadosContainer.style.display = 'none';
                return;
            }

            renderizarTotalizadores();
            renderizarTabela();
            totalizadoresContainer.style.display = 'block';
            resultadosContainer.style.display = 'block';
            mostrarMensagem(`Relatório gerado: ${dadosRelatorio.length} movimentação(ões).`, 'success');
        } catch (error) {
            console.error('❌', error);
            mostrarMensagem(`Erro: ${error.message}`, 'error');
        } finally {
            gerarRelatorioBtn.disabled = false;
        }
    }

    function fmtMoeda(v) {
        const n = Number(v || 0);
        return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    }

    function fmtNum(v) {
        return Number(v || 0).toLocaleString('pt-BR');
    }

    function fmtData(s) {
        if (!s) return '-';
        const parts = String(s).split('T')[0];
        const [a, m, d] = parts.split('-');
        return `${d}/${m}/${a}`;
    }

    function renderizarTotalizadores() {
        document.getElementById('totalItens').textContent = fmtNum(totalizadores.totalItens);
        document.getElementById('totalQnt').textContent = fmtNum(totalizadores.totalQnt);
        document.getElementById('valorContabil').textContent = fmtMoeda(totalizadores.valorContabilTotal);
        document.getElementById('valorFiscal').textContent = fmtMoeda(totalizadores.valorFiscalTotal);
    }

    function renderizarTabela() {
        const html = `
            <table>
                <thead>
                    <tr>
                        <th>#</th>
                        <th>Código</th>
                        <th>Qtd</th>
                        <th>Descrição</th>
                        <th>Custo Contábil Médio</th>
                        <th>Custo Fiscal Médio</th>
                        <th>Custo Pago</th>
                        <th>Endereço</th>
                        <th>Fornecedor</th>
                        <th>Usuário</th>
                        <th>Data</th>
                        <th>Hora</th>
                    </tr>
                </thead>
                <tbody>
                    ${dadosRelatorio.map((r, i) => `
                        <tr>
                            <td>${i + 1}</td>
                            <td><strong>${r.CODIGO ?? ''}</strong></td>
                            <td>${fmtNum(r.QNT)}</td>
                            <td>${r.DESCRICAO ?? ''}</td>
                            <td>${r.CUSTO_CONTABIL_MEDIO != null ? fmtMoeda(r.CUSTO_CONTABIL_MEDIO) : '-'}</td>
                            <td>${r.CUSTO_FISCAL_MEDIO != null ? fmtMoeda(r.CUSTO_FISCAL_MEDIO) : '-'}</td>
                            <td>${r.CUSTO_PAGO != null ? fmtMoeda(r.CUSTO_PAGO) : '-'}</td>
                            <td>${r.ENDERECO ?? ''}</td>
                            <td>${r.FORNECEDOR ?? ''}</td>
                            <td>${r.USUARIO ?? ''}</td>
                            <td>${fmtData(r.DT)}</td>
                            <td>${r.HR ?? ''}</td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>`;
        tabelaRelatorio.innerHTML = html;
    }

    function imprimirRelatorio() {
        if (dadosRelatorio.length === 0) {
            mostrarMensagem('Nenhum dado para imprimir', 'error');
            return;
        }
        const usuarioNome = localStorage.getItem('userName') || 'Sistema';
        const dataRef = fmtData(totalizadores.data);
        const janela = window.open('', '_blank', 'width=1000,height=700');
        const html = `
<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"><title>Movimento Diário ${dataRef}</title>
<style>
@media print { @page { size: A4 landscape; margin: 8mm; } body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } .no-print { display:none !important; } }
* { margin:0; padding:0; box-sizing:border-box; }
body { font-family: 'Segoe UI', Arial, sans-serif; font-size: 9pt; color:#333; }
.header { text-align:center; margin-bottom:10px; padding-bottom:8px; border-bottom: 2px solid #2c3e50; }
.header h1 { font-size: 16pt; color:#2c3e50; }
.header h2 { font-size: 12pt; color:#34495e; font-weight: normal; }
.info { display:flex; justify-content:space-between; margin-bottom:8px; font-size:9pt; }
table { width:100%; border-collapse: collapse; font-size: 8pt; }
thead { background:#2c3e50; color:#fff; }
th, td { padding: 4px 5px; border: 1px solid #ccc; text-align:left; }
tbody tr:nth-child(even) { background:#f5f7fa; }
.totais { margin-top:10px; padding:8px; background:#e3f2fd; border-left:4px solid #2196F3; font-size:10pt; }
.btn { position:fixed; top:8px; right:8px; padding:8px 14px; background:#2c3e50; color:#fff; border:none; border-radius:4px; cursor:pointer; }
</style></head><body>
<button class="btn no-print" onclick="window.print()">🖨️ Imprimir</button>
<div class="header"><h1>KARDEX SYSTEM</h1><h2>Posição de Estoque referente a: ${dataRef}</h2></div>
<div class="info"><span><strong>Emitido por:</strong> ${usuarioNome}</span><span><strong>Emissão:</strong> ${new Date().toLocaleString('pt-BR')}</span><span><strong>Movs:</strong> ${dadosRelatorio.length}</span></div>
<table><thead><tr>
<th>#</th><th>Código</th><th>Qtd</th><th>Descrição</th><th>C.Contábil</th><th>C.Fiscal</th><th>C.Pago</th><th>Endereço</th><th>Fornecedor</th><th>Usuário</th><th>Data</th><th>Hora</th>
</tr></thead><tbody>
${dadosRelatorio.map((r,i)=>`<tr>
<td>${i+1}</td><td>${r.CODIGO ?? ''}</td><td>${fmtNum(r.QNT)}</td><td>${r.DESCRICAO ?? ''}</td>
<td>${r.CUSTO_CONTABIL_MEDIO!=null?fmtMoeda(r.CUSTO_CONTABIL_MEDIO):'-'}</td>
<td>${r.CUSTO_FISCAL_MEDIO!=null?fmtMoeda(r.CUSTO_FISCAL_MEDIO):'-'}</td>
<td>${r.CUSTO_PAGO!=null?fmtMoeda(r.CUSTO_PAGO):'-'}</td>
<td>${r.ENDERECO ?? ''}</td><td>${r.FORNECEDOR ?? ''}</td><td>${r.USUARIO ?? ''}</td>
<td>${fmtData(r.DT)}</td><td>${r.HR ?? ''}</td></tr>`).join('')}
</tbody></table>
<div class="totais">
<strong>Totais:</strong> ${fmtNum(totalizadores.totalItens)} movimentações |
Qtd: ${fmtNum(totalizadores.totalQnt)} |
Valor Contábil: ${fmtMoeda(totalizadores.valorContabilTotal)} |
Valor Fiscal: ${fmtMoeda(totalizadores.valorFiscalTotal)}
</div>
</body></html>`;
        janela.document.write(html);
        janela.document.close();
        setTimeout(() => janela.focus(), 250);
    }

    function exportarParaExcel() {
        if (dadosRelatorio.length === 0) {
            mostrarMensagem('Nenhum dado para exportar', 'error');
            return;
        }
        const dataRef = fmtData(totalizadores.data);

        const dados = dadosRelatorio.map((r, i) => ({
            '#': i + 1,
            'CÓDIGO': r.CODIGO,
            'QNT': r.QNT,
            'DESCRICAO': r.DESCRICAO,
            'CUSTO_CONTABIL_MEDIO': r.CUSTO_CONTABIL_MEDIO ?? '',
            'CUSTO_FISCAL_MEDIO': r.CUSTO_FISCAL_MEDIO ?? '',
            'CUSTO_PAGO': r.CUSTO_PAGO ?? '',
            'ENDEREÇO': r.ENDERECO ?? '',
            'FORNECEDOR': r.FORNECEDOR ?? '',
            'USUARIO': r.USUARIO ?? '',
            'DATA': fmtData(r.DT),
            'HORA': r.HR ?? ''
        }));

        const info = [
            { Campo: 'Relatório', Valor: 'Movimento Diário - Posição de Estoque' },
            { Campo: 'Data Referência', Valor: dataRef },
            { Campo: 'Emissão', Valor: new Date().toLocaleString('pt-BR') },
            { Campo: 'Emitido por', Valor: localStorage.getItem('userName') || 'Sistema' },
            { Campo: '', Valor: '' },
            { Campo: 'Total Movimentações', Valor: totalizadores.totalItens },
            { Campo: 'Qtd Total', Valor: totalizadores.totalQnt },
            { Campo: 'Valor Contábil Total', Valor: totalizadores.valorContabilTotal },
            { Campo: 'Valor Fiscal Total', Valor: totalizadores.valorFiscalTotal }
        ];

        const wb = XLSX.utils.book_new();
        const wsInfo = XLSX.utils.json_to_sheet(info);
        wsInfo['!cols'] = [{ wch: 25 }, { wch: 40 }];
        XLSX.utils.book_append_sheet(wb, wsInfo, 'Informações');

        const wsDados = XLSX.utils.json_to_sheet(dados);
        wsDados['!cols'] = [
            { wch: 5 }, { wch: 12 }, { wch: 10 }, { wch: 45 },
            { wch: 18 }, { wch: 18 }, { wch: 14 }, { wch: 14 },
            { wch: 40 }, { wch: 18 }, { wch: 12 }, { wch: 10 }
        ];
        XLSX.utils.book_append_sheet(wb, wsDados, 'Movimentações');

        const nome = `Movimento_Diario_${dataRef.replace(/\//g, '-')}.xlsx`;
        XLSX.writeFile(wb, nome);
        mostrarMensagem('Arquivo Excel exportado!', 'success');
    }

    function mostrarMensagem(msg, tipo) {
        statusMessage.textContent = msg;
        statusMessage.className = 'status-message';
        statusMessage.style.color = tipo === 'success' ? 'green' : tipo === 'error' ? 'red' : '#666';
        if (tipo === 'success' || tipo === 'error') {
            setTimeout(() => { statusMessage.textContent = ''; }, 5000);
        }
    }
});
