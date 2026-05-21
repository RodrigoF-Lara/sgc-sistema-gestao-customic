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

        // === Layout fiel ao VBA antigo ===
        // Linha 1: título com fundo amarelo
        // Linha 2: vazia
        // Linha 3: cabeçalhos
        // Linha 4+: dados
        const HEADERS = [
            'CÓDIGO', 'QNT', 'DESCRICAO',
            'CUSTO_CONTABIL_MEDIO', 'CUSTO_FISCAL_MEDIO', 'CUSTO_PAGO',
            'ENDEREÇO', 'FORNECEDOR', 'USUARIO', 'DATA', 'HORA'
        ];

        const aoa = [];
        aoa.push([`POSIÇÃO DE ESTOQUE REFERENTE À: ${dataRef}`]);
        aoa.push([]);
        aoa.push(HEADERS);
        dadosRelatorio.forEach(r => {
            aoa.push([
                r.CODIGO ?? '',
                r.QNT ?? '',
                r.DESCRICAO ?? '',
                r.CUSTO_CONTABIL_MEDIO ?? '',
                r.CUSTO_FISCAL_MEDIO ?? '',
                r.CUSTO_PAGO ?? '',
                r.ENDERECO ?? '',
                r.FORNECEDOR ?? '',
                r.USUARIO ?? '',
                fmtData(r.DT),
                r.HR ?? ''
            ]);
        });

        const ws = XLSX.utils.aoa_to_sheet(aoa);

        // Mescla A1:K1 (título) — equivalente ao Range("A1:H1") do VBA, ampliado para todas as colunas
        ws['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: HEADERS.length - 1 } }];

        // Larguras (similares ao AutoFit + ColumnWidth=12 do VBA)
        ws['!cols'] = [
            { wch: 12 }, // CÓDIGO
            { wch: 10 }, // QNT
            { wch: 50 }, // DESCRICAO
            { wch: 22 }, // CUSTO_CONTABIL_MEDIO
            { wch: 22 }, // CUSTO_FISCAL_MEDIO
            { wch: 14 }, // CUSTO_PAGO
            { wch: 14 }, // ENDEREÇO
            { wch: 45 }, // FORNECEDOR
            { wch: 18 }, // USUARIO
            { wch: 12 }, // DATA
            { wch: 10 }  // HORA
        ];

        // === Estilos (xlsx-js-style) ===
        const borderThin = {
            top: { style: 'thin', color: { rgb: '000000' } },
            bottom: { style: 'thin', color: { rgb: '000000' } },
            left: { style: 'thin', color: { rgb: '000000' } },
            right: { style: 'thin', color: { rgb: '000000' } }
        };

        // A1 — título amarelo
        if (ws['A1']) {
            ws['A1'].s = {
                font: { bold: true, sz: 12, color: { rgb: '000000' } },
                fill: { fgColor: { rgb: 'FFFF00' } },
                alignment: { horizontal: 'left', vertical: 'center' }
            };
        }

        // Linha 3 — cabeçalho (negrito + bordas + fundo cinza claro)
        for (let c = 0; c < HEADERS.length; c++) {
            const cellRef = XLSX.utils.encode_cell({ r: 2, c });
            if (!ws[cellRef]) continue;
            ws[cellRef].s = {
                font: { bold: true, color: { rgb: '000000' } },
                fill: { fgColor: { rgb: 'F2F2F2' } },
                alignment: { horizontal: 'center', vertical: 'center' },
                border: borderThin
            };
        }

        // Linhas de dados — bordas finas + alinhamento centralizado
        for (let r = 3; r < aoa.length; r++) {
            for (let c = 0; c < HEADERS.length; c++) {
                const cellRef = XLSX.utils.encode_cell({ r, c });
                if (!ws[cellRef]) {
                    ws[cellRef] = { t: 's', v: '' };
                }
                ws[cellRef].s = {
                    alignment: { horizontal: 'center', vertical: 'center' },
                    border: borderThin
                };
                // Coluna H (FORNECEDOR) — alinhar à esquerda como no VBA
                if (c === 7) {
                    ws[cellRef].s.alignment = { horizontal: 'left', vertical: 'center' };
                }
            }
        }

        // Range usado
        ws['!ref'] = XLSX.utils.encode_range({
            s: { r: 0, c: 0 },
            e: { r: aoa.length - 1, c: HEADERS.length - 1 }
        });

        // Sem gridlines (equivalente a DisplayGridlines=False)
        ws['!sheetView'] = [{ showGridLines: false }];

        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Planilha1');

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
