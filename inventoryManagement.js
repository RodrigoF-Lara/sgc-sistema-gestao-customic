document.addEventListener("DOMContentLoaded", () => {
  const codigoEl = document.getElementById("codigo");
  const btnConsultar = document.getElementById("consultarBtn");
  const produtoInfo = document.getElementById("produtoInfo");
  const infoCodigo = document.getElementById("infoCodigo");
  const infoDescricao = document.getElementById("infoDescricao");
  const infoQuantidade = document.getElementById("infoQuantidade");

  const entradaSaidaContainer = document.getElementById("entradaSaidaContainer");
  const statusEl = document.getElementById("status");
  
  // Novos elementos para modal
  const btnEntrada = document.getElementById("btnEntrada");
  const btnSaida = document.getElementById("btnSaida");
  const modalMovimento = document.getElementById("modalMovimento");
  const closeModal = document.getElementById("closeModal");
  const formMovimento = document.getElementById("formMovimento");
  const tituloModal = document.getElementById("tituloModal");
  const iconModal = document.getElementById("iconModal");
  const inputTipoMovimento = document.getElementById("inputTipoMovimento");
  const submitBtn = document.getElementById("submitBtn");

  const historicoContainer = document.getElementById("historicoContainer");
  const historicoBody = document.getElementById("historicoBody");
  
  // Novos elementos para estatísticas
  const estatisticasContainer = document.getElementById("estatisticasContainer");
  const saldoPorLocalContainer = document.getElementById("saldoPorLocalContainer");

  const btnZerarEndereco = document.getElementById("btnZerarEndereco");
  const modalZerarEndereco = document.getElementById("modalZerarEndereco");
  const btnZerarCodigo = document.getElementById("btnZerarCodigo");
  const modalZerarCodigo = document.getElementById("modalZerarCodigo");
  const btnAlterarEndereco = document.getElementById("btnAlterarEndereco");
  const modalAlterarEndereco = document.getElementById("modalAlterarEndereco");

  let codigoAtual = "";
  let loteSelecionado = null;

  async function consultar(codigo) {
    codigoAtual = codigo;
    produtoInfo.style.display = "none";
    entradaSaidaContainer.style.display = "none";
    historicoContainer.style.display = "none";
    estatisticasContainer.style.display = "none";
    saldoPorLocalContainer.style.display = "none";
    
    statusEl.style.color = "#222";
    statusEl.textContent = "Buscando...";
    
    try {
      const res = await fetch(`/api/inventory?codigo=${encodeURIComponent(codigo)}`);
      if (!res.ok) {
        const err = await res.json().catch(() => ({ message: "Erro ao consultar" }));
        throw new Error(err.message || "Erro ao consultar");
      }
      const data = await res.json();
      
      infoCodigo.textContent = data.codigo || codigo;
      infoDescricao.textContent = data.descricao || "-";
      infoQuantidade.textContent = (data.saldo !== undefined) ? data.saldo : "-";
      
      produtoInfo.style.display = "block";
      entradaSaidaContainer.style.display = "block";
      historicoContainer.style.display = "block";
      
      renderHistorico(data.movimentos || []);
      renderEstatisticas(data);
      await buscarSaldoAgrupado(codigo);
      
      statusEl.textContent = "";
      
      // Habilita botões de entrada e saída
      btnEntrada.disabled = false;
      btnSaida.disabled = false;
      btnZerarEndereco.disabled = false;
      btnZerarCodigo.disabled = false;
      btnAlterarEndereco.disabled = false;
      loteSelecionado = null; // Reseta lote selecionado

    } catch (err) {
      statusEl.style.color = "#c00";
      statusEl.textContent = `Erro: ${err.message}`;
      btnEntrada.disabled = true;
      btnSaida.disabled = true;
      btnZerarEndereco.disabled = true;
      btnZerarCodigo.disabled = true;
      btnAlterarEndereco.disabled = true;
    }
  }

  async function buscarSaldoAgrupado(codigo) {
    const saldoLocalBody = document.getElementById("saldoLocalBody");
    saldoPorLocalContainer.style.display = 'block';
    saldoLocalBody.innerHTML = '<tr><td colspan="5">Buscando...</td></tr>';
    
    try {
        const res = await fetch(`/api/inventory?action=saldoLocal&codigo=${encodeURIComponent(codigo)}`);
        const data = await res.json();
        if (!res.ok) throw new Error(data.message);
        renderSaldoAgrupado(data.locais);
    } catch (err) {
        saldoLocalBody.innerHTML = `<tr><td colspan="5" style="color:#c00;">${err.message}</td></tr>`;
    }
  }

  function renderSaldoAgrupado(locais) {
    const saldoLocalBody = document.getElementById("saldoLocalBody");
    saldoLocalBody.innerHTML = "";
    if (!locais || locais.length === 0) {
      saldoLocalBody.innerHTML = '<tr><td colspan="5" class="info-message">Nenhum saldo encontrado para este produto.</td></tr>';
      return;
    }
    
    locais.forEach(local => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${local.ARMAZEM || "-"}</td>
            <td>${local.ENDERECO || "-"}</td>
            <td>${local.TAM_LOTE || 0}</td>
            <td class="text-right">${local.QNT_CAIXAS || 0}</td>
            <td class="text-right"><strong>${local.SALDO || 0}</strong></td>
        `;
        saldoLocalBody.appendChild(tr);
    });
  }

  function renderEstatisticas(data) {
    if (!estatisticasContainer) return;
    
    const movimentos = data.movimentos || [];
    const entradas = movimentos.filter(m => m.OPERACAO === 'ENTRADA');
    const saidas = movimentos.filter(m => m.OPERACAO === 'SAÍDA');
    const saldoTotal = data.saldo || 0;
    
    estatisticasContainer.innerHTML = `
      <h3>📊 Estatísticas Rápidas</h3>
      <div class="estatisticas-grid">
        <div class="stat-card destaque-saldo">
          <i class="fa-solid fa-boxes-stacked"></i>
          <span class="stat-label">Saldo Total em Estoque</span>
          <span class="stat-value" style="color: #030303; font-size: 32px;">${saldoTotal.toLocaleString('pt-BR')}</span>
        </div>
        <div class="stat-card">
          <i class="fa-solid fa-arrow-up"></i>
          <span class="stat-label">Total Entradas</span>
          <span class="stat-value">${entradas.length}</span>
        </div>
        <div class="stat-card">
          <i class="fa-solid fa-arrow-down" style="color: #f44336;"></i>
          <span class="stat-label">Total Saídas</span>
          <span class="stat-value">${saidas.length}</span>
        </div>
        <div class="stat-card">
          <i class="fa-solid fa-calendar-days"></i>
          <span class="stat-label">Última Movimentação</span>
          <span class="stat-value">${movimentos[0]?.DT ? movimentos[0].DT.split('-').reverse().join('/') : '-'}</span>
        </div>
      </div>
    `;
    
    estatisticasContainer.style.display = "block";
  }

  function renderHistorico(rows) {
    historicoBody.innerHTML = "";
    if (!rows || rows.length === 0) {
      historicoBody.innerHTML =
        '<tr><td colspan="9" style="text-align:center;">Nenhum histórico encontrado</td></tr>';
      return;
    }

    rows.forEach((row) => {
      historicoBody.innerHTML += `
        <tr data-id-movimento="${row.ID_TB_RESUMO}">
          <td>${row.ID_TB_RESUMO || "-"}</td>
          <td><span class="badge ${
            row.OPERACAO === "ENTRADA" ? "badge-entrada" : "badge-saida"
          }">${row.OPERACAO === "ENTRADA" ? "⬆️" : "⬇️"} ${
        row.OPERACAO || "-"
      }</span></td>
          <td>${row.ENDERECO || "-"}</td>
          <td>${row.ARMAZEM ? String(row.ARMAZEM).padStart(2, "0") : "-"}</td>
          <td class="text-right"><strong>${row.QNT || 0}</strong></td>
          <td>${row.USUARIO || "-"}</td>
          <td>${row.DT ? row.DT.split('-').reverse().join('/') : '-'}</td>
          <td>${row.HR || "-"}</td>
          <td class="actions-cell">
            ${
              row.OPERACAO === "ENTRADA"
                ? `<button class="btn-reimprimir" title="Reimprimir Etiqueta">
                <i class="fa-solid fa-print"></i>
              </button>`
                : ""
            }
          </td>
        </tr>
      `;
    });
  }

  let _pendingLabelData = null;

  function selecionarEImprimirEtiqueta(dadosOuArray) {
    _pendingLabelData = dadosOuArray;
    document.getElementById('modalEtiqueta').style.display = 'flex';
  }

  document.getElementById('closeModalEtiqueta').addEventListener('click', () => {
    document.getElementById('modalEtiqueta').style.display = 'none';
    _pendingLabelData = null;
  });

  document.getElementById('btnEtiqueta100x150').addEventListener('click', () => {
    document.getElementById('modalEtiqueta').style.display = 'none';
    if (_pendingLabelData) gerarEtiqueta100x150(_pendingLabelData);
    _pendingLabelData = null;
  });

  document.getElementById('btnEtiqueta40x30').addEventListener('click', () => {
    document.getElementById('modalEtiqueta').style.display = 'none';
    if (_pendingLabelData) gerarEtiqueta40x30(_pendingLabelData);
    _pendingLabelData = null;
  });

  window.addEventListener('click', (e) => {
    const modal = document.getElementById('modalEtiqueta');
    if (e.target === modal) { modal.style.display = 'none'; _pendingLabelData = null; }
  });

  function gerarEtiqueta100x150(dadosOuArray) {
    const etiquetas = Array.isArray(dadosOuArray) ? dadosOuArray : [dadosOuArray];
    if (etiquetas.length === 0) {
      console.error("gerarEtiqueta100x150 foi chamada sem dados de etiqueta válidos.");
      return;
    }

    const janelaEtiqueta = window.open("", "_blank", "width=800,height=600");

    if (!janelaEtiqueta || typeof janelaEtiqueta.closed == 'undefined' || janelaEtiqueta.closed) {
      alert("A janela de impressão foi bloqueada pelo navegador. Por favor, habilite os pop-ups para este site e tente reimprimir a etiqueta a partir do histórico.");
      return;
    }

    const etiquetasHtml = etiquetas.map(dados => `
      <div class="etiqueta">
        <div class="header">
            <div class="header-top">
                <span class="id-badge">ID: ${dados.idMovimento || "N/A"}</span>
                <h1>KARDEX SYSTEM</h1>
            </div>
        </div>
        
        <div class="codigo-principal">
            <div class="descricao-card">
                <div class="descricao-label">DESCRIÇÃO DO PRODUTO:</div>
                <div class="descricao-text">${dados.descricao || "N/A"}</div>
            </div>
        </div>
        
        <div class="qr-grande-container">
            <div id="qr-${dados.idMovimento}" class="qr-grande"></div>
            <div class="codigo-texto">${dados.codigo}</div>
        </div>
        
        <div class="info-principal">
            <div class="info-row destaque">
                <span class="info-label">QUANTIDADE:</span>
                <span class="info-value" style="font-size: 10pt;">${dados.quantidade}</span>
            </div>
            
            <div class="info-row">
                <span class="info-label">ENDEREÇO:</span>
                <span class="info-value">${dados.endereco || "-"}</span>
            </div>
            
            <div class="info-row">
                <span class="info-label">ARMAZÉM:</span>
                <span class="info-value">${dados.armazem ? String(dados.armazem).padStart(2, "0") : "-"}</span>
            </div>
        </div>
        
        <div class="footer">
            <div class="footer-left">
                ${dados.dataHora}
            </div>
            <div class="footer-right">
                ${dados.usuario} | KARDEX 2026
            </div>
        </div>
    </div>
    `).join('');

    const htmlEtiqueta = `
<!DOCTYPE html>
<html lang="pt-BR">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Etiqueta - ${etiquetas[0].codigo}</title>
    <script src="https://cdn.jsdelivr.net/npm/jsbarcode@3.11.5/dist/JsBarcode.all.min.js"><\/script>
    <script src="https://cdn.jsdelivr.net/npm/qrcodejs@1.0.0/qrcode.min.js"><\/script>
    <style>
        @media print {
            @page { 
                size: 100mm 150mm;
                margin: 0;
            }
            body { 
                -webkit-print-color-adjust: exact; 
                print-color-adjust: exact;
                padding: 0 !important;
                background: white !important;
                display: block !important;
            }
            .no-print { display: none !important; }
            .etiqueta {
                page-break-inside: avoid;
                margin-bottom: 0 !important;
                border: none !important;
            }
        }
        
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        
        body {
            font-family: 'Arial', sans-serif;
            background: #ccc;
            display: flex;
            flex-direction: column;
            align-items: center;
            padding: 5mm;
        }
        
        .etiqueta {
            width: 100mm;
            height: 150mm;
            border: 1px dashed #666;
            padding: 3mm;
            background: white;
            display: flex;
            flex-direction: column;
            box-sizing: border-box;
            justify-content: space-between;
            margin-bottom: 5mm;
        }
        
        .header {
            text-align: center;
            border-bottom: 2px solid #333;
            padding-bottom: 1.5mm;
            margin-bottom: 1.5mm;
        }
        
        .header-top {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 1.5mm;
        }
        
        .header-top .id-badge {
            background-color: #2c3e50;
            color: white;
            padding: 1.5mm 3mm;
            border-radius: 3mm;
            font-size: 11pt;
            font-weight: bold;
        }
        
        .header h1 {
            font-size: 15pt;
            font-weight: bold;
            color: #1976d2;
            flex: 1;
            text-align: center;
            margin: 0;
        }
        
        .header .tipo-movimento {
            display: none;
        }

        .qr-code {
            width: 18mm !important;
            height: 18mm !important;
            display: flex;
            align-items: center;
            justify-content: center;
        }
        .qr-code img, .qr-code canvas {
            width: 18mm !important;
            height: 18mm !important;
        }
        
        .qr-grande-container {
            text-align: center;
            margin: 2mm 0;
            flex: 1;
            display: flex;
            flex-direction: column;
            justify-content: center;
            align-items: center;
        }

        .qr-grande {
            width: 60mm;
            height: 60mm;
            display: flex;
            align-items: center;
            justify-content: center;
        }
        .qr-grande img, .qr-grande canvas {
            width: 60mm !important;
            height: 60mm !important;
        }
        
        .codigo-barras {
            text-align: center;
            margin: 2mm 0;
            flex: 1;
            display: flex;
            flex-direction: column;
            justify-content: center;
        }
        
        .codigo-barras svg {
            width: 100% !important;
            max-width: 130mm !important;
            height: auto !important;
        }
        
        .info-principal {
            margin: 1mm 0;
        }
        
        .info-row {
            display: flex;
            justify-content: space-between;
            margin-bottom: 0.8mm;
            padding: 1.2mm;
            background-color: #f5f5f5;
            border-left: 3px solid #1976d2;
        }
        
        .info-row.destaque {
            background-color: #e3f2fd;
            border-left-color: #0d47a1;
        }
        
        .info-label {
            font-weight: bold;
            color: #333;
            font-size: 8.5pt;
            min-width: 35%;
        }
        
        .info-value {
            color: #000;
            font-size: 8.5pt;
            font-weight: 600;
            text-align: right;
            flex: 1;
        }
        
        .descricao-card {
            margin: 1mm 0;
            padding: 2mm;
            background-color: #fff3e0;
            border: 1px solid #ff9800;
            border-radius: 2mm;
        }

        .descricao-label {
            font-weight: bold;
            font-size: 8pt;
            color: #e65100;
            margin-bottom: 1mm;
        }

        .descricao-text {
            font-size: 13pt;
            color: #000;
            font-weight: 700;
            line-height: 1.2;
        }
        
        .footer {
            border-top: 2px solid #333;
            padding-top: 2mm;
            display: flex;
            justify-content: space-between;
            align-items: center;
            font-size: 7pt;
            color: #666;
        }
        
        .footer-left {
            font-style: italic;
        }
        
        .footer-right {
            text-align: right;
            font-weight: bold;
        }

        .codigo-principal {
          text-align: center;
          padding: 2mm 0;
        }

        .codigo-texto {
            font-size: 18pt;
            font-weight: bold;
            letter-spacing: 2px;
            color: #111;
            margin-top: 2mm;
        }
        
        .btn-imprimir {
            position: fixed;
            top: 10px;
            right: 10px;
            padding: 10px 20px;
            background-color: #1976d2;
            color: white;
            border: none;
            border-radius: 5px;
            cursor: pointer;
            font-size: 14px;
            box-shadow: 0 2px 5px rgba(0,0,0,0.3);
            z-index: 1000;
        }
        
        .btn-imprimir:hover {
            background-color: #1565c0;
        }
    </style>
</head>
<body>
    <button class="btn-imprimir no-print" onclick="window.print()">🖨️ Imprimir Etiqueta</button>
    ${etiquetasHtml}    
    <script>
        const etiquetasData = ${JSON.stringify(etiquetas)};
        window.onload = function() {
            etiquetasData.forEach(dados => {
                if (dados.idMovimento && document.getElementById('qr-' + dados.idMovimento)) {
                    new QRCode(document.getElementById('qr-' + dados.idMovimento), {
                        text: 'ID: ' + dados.idMovimento + ' | COD: ' + dados.codigo,
                        width: 227,
                        height: 227,
                        correctLevel: QRCode.CorrectLevel.M
                    });
                }
            });
            window.focus();
        };
    <\/script>
</body>
</html>`;

    janelaEtiqueta.document.write(htmlEtiqueta);
    janelaEtiqueta.document.close();

    // Adiciona um pequeno delay para garantir que o conteúdo foi renderizado antes de imprimir
    setTimeout(() => {
      janelaEtiqueta.print();
    }, 500);
  }

  function gerarEtiqueta40x30(dadosOuArray) {
    const etiquetas = Array.isArray(dadosOuArray) ? dadosOuArray : [dadosOuArray];
    if (etiquetas.length === 0) return;

    const janelaEtiqueta = window.open("", "_blank", "width=420,height=360");
    if (!janelaEtiqueta || typeof janelaEtiqueta.closed == 'undefined' || janelaEtiqueta.closed) {
      alert("A janela de impressão foi bloqueada pelo navegador. Por favor, habilite os pop-ups para este site e tente reimprimir a etiqueta a partir do histórico.");
      return;
    }

    const etiquetasHtml = etiquetas.map(dados => `
      <div class="etiqueta">
        <div class="topo">
          <span class="codigo-text">${dados.codigo}</span>
          <span class="qtd-text">QTD: ${dados.quantidade}</span>
        </div>
        <div class="descricao">${(dados.descricao || '')}</div>
        <div class="meio">
          <div id="qr-${dados.idMovimento}" class="qr-area"></div>
          <div class="meio-info">
            <div class="info-linha"><span class="info-label">ID:</span> ${dados.idMovimento || '-'}</div>
            <div class="info-linha"><span class="info-label">END:</span> ${dados.endereco || '-'} / ARM: ${dados.armazem ? String(dados.armazem).padStart(2,'0') : '-'}</div>
            <div class="rodape data">${dados.dataHora || ''}</div>
            <div class="rodape usuario">${dados.usuario || ''}</div>
          </div>
        </div>
      </div>
    `).join('');

    const htmlEtiqueta40 = `
<!DOCTYPE html>
<html lang="pt-BR">
<head>
    <meta charset="UTF-8">
    <title>Etiqueta 40x30 - ${etiquetas[0].codigo}</title>
    <script src="https://cdn.jsdelivr.net/npm/qrcodejs@1.0.0/qrcode.min.js"><\/script>
    <style>
        @media print {
            @page {
                size: 40mm 30mm;
                margin: 0;
            }
            body {
                -webkit-print-color-adjust: exact;
                print-color-adjust: exact;
                padding: 0 !important;
                background: white !important;
                display: block !important;
            }
            .no-print { display: none !important; }
            .etiqueta {
                page-break-inside: avoid;
                border: none !important;
                margin: 0 !important;
            }
        }
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
            font-family: Arial, sans-serif;
            background: #ccc;
            display: flex;
            flex-direction: column;
            align-items: center;
            padding: 4mm;
            gap: 4mm;
        }
        .etiqueta {
            width: 40mm;
            height: 30mm;
            background: white;
            border: 1px dashed #999;
            padding: 1.2mm 1.5mm;
            display: flex;
            flex-direction: column;
            justify-content: space-between;
            overflow: hidden;
        }
        .topo {
            display: flex;
            justify-content: space-between;
            align-items: center;
            border-bottom: 0.5pt solid #ccc;
            padding-bottom: 0.5mm;
        }
        .codigo-text {
            font-size: 7pt;
            font-weight: bold;
            color: #000;
            letter-spacing: 0.3px;
        }
        .qtd-text {
            font-size: 7pt;
            font-weight: bold;
            color: #1565c0;
        }
        .meio {
            flex: 1;
            display: flex;
            flex-direction: row;
            align-items: center;
            gap: 1.5mm;
            overflow: hidden;
        }
        .qr-area {
            flex-shrink: 0;
            width: 17mm;
            height: 17mm;
            display: flex;
            align-items: center;
            justify-content: center;
        }
        .qr-area img, .qr-area canvas {
            width: 17mm !important;
            height: 17mm !important;
        }
        .meio-info {
            flex: 1;
            display: flex;
            flex-direction: column;
            justify-content: space-between;
            gap: 0.5mm;
            overflow: hidden;
        }
        .descricao {
            font-size: 5.5pt;
            color: #222;
            font-weight: bold;
            line-height: 1.3;
            overflow: hidden;
            display: -webkit-box;
            -webkit-line-clamp: 2;
            -webkit-box-orient: vertical;
            border-bottom: 0.5pt solid #eee;
            padding-bottom: 0.5mm;
        }
        .info-linha {
            font-size: 5pt;
            color: #333;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
        }
        .info-label {
            font-weight: bold;
            color: #1565c0;
        }
        .rodape {
            font-size: 4.5pt;
            color: #888;
            font-style: italic;
        }
        .rodape.usuario {
            margin-top: auto;
            padding-top: 1mm;
            border-top: 0.5pt solid #eee;
            font-weight: bold;
            color: #555;
        }
        .btn-imprimir {
            position: fixed;
            top: 8px;
            right: 8px;
            padding: 8px 16px;
            background: #1976d2;
            color: white;
            border: none;
            border-radius: 4px;
            cursor: pointer;
            font-size: 13px;
            box-shadow: 0 2px 5px rgba(0,0,0,0.3);
        }
        .btn-imprimir:hover { background: #1565c0; }
    </style>
</head>
<body>
    <button class="btn-imprimir no-print" onclick="window.print()">🖨️ Imprimir Etiqueta</button>
    ${etiquetasHtml}
    <script>
        const etiquetasData = ${JSON.stringify(etiquetas)};
        window.onload = function() {
            etiquetasData.forEach(dados => {
                if (dados.idMovimento && document.getElementById('qr-' + dados.idMovimento)) {
                    new QRCode(document.getElementById('qr-' + dados.idMovimento), {
                        text: String(dados.idMovimento),
                        width: 64,
                        height: 64,
                        correctLevel: QRCode.CorrectLevel.L
                    });
                }
            });
            window.focus();
        };
    <\/script>
</body>
</html>`;

    janelaEtiqueta.document.write(htmlEtiqueta40);
    janelaEtiqueta.document.close();
    setTimeout(() => { janelaEtiqueta.print(); }, 500);
  }

  // --- Lógica de Zerar Código ---

  btnZerarCodigo.addEventListener("click", () => {
    if (!codigoAtual) return;
    const descricao = document.getElementById("infoDescricao").textContent.trim();
    const saldo = document.getElementById("infoQuantidade").textContent.trim();
    document.getElementById("msgZerarCodigo").textContent =
      `Você está prestes a zerar TODAS as ${saldo} unidades do produto ${descricao} (${codigoAtual}) em todos os endereços.`;
    modalZerarCodigo.style.display = "flex";
  });

  document.getElementById("closeModalZerarCodigo").addEventListener("click", () => {
    modalZerarCodigo.style.display = "none";
  });

  document.getElementById("cancelarZerarCodigo").addEventListener("click", () => {
    modalZerarCodigo.style.display = "none";
  });

  window.addEventListener("click", (e) => {
    if (e.target === modalZerarCodigo) modalZerarCodigo.style.display = "none";
  });

  document.getElementById("confirmarZerarCodigo").addEventListener("click", async () => {
    const btn = document.getElementById("confirmarZerarCodigo");
    btn.disabled = true;
    btn.textContent = "Zerando...";
    const usuario = localStorage.getItem("userName") || "WEB";

    try {
      const res = await fetch("/api/inventory", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          codigo: codigoAtual,
          tipo: "ZERAR_CODIGO",
          quantidade: 0,
          usuario,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message);

      modalZerarCodigo.style.display = "none";
      statusEl.style.color = "#28a745";
      statusEl.textContent = data.message || "Código zerado com sucesso!";
      setTimeout(() => consultar(codigoAtual), 500);
    } catch (err) {
      alert(`Erro ao zerar código: ${err.message}`);
    } finally {
      btn.disabled = false;
      btn.textContent = "⚠️ SIM, ZERAR TUDO";
    }
  });

  // --- Lógica de Alterar Endereço ---

  btnAlterarEndereco.addEventListener("click", () => {
    if (!codigoAtual) return;
    document.getElementById("armAtualAlterar").value = "";
    document.getElementById("endAtualAlterar").value = "";
    document.getElementById("armNovoAlterar").value = "";
    document.getElementById("endNovoAlterar").value = "";
    document.getElementById("confirmarAlterarContainer").style.display = "none";
    const btn = document.getElementById("submitAlterar");
    btn.textContent = "🔍 Localizar Saldo";
    btn.dataset.step = "localizar";
    btn.disabled = false;
    modalAlterarEndereco.style.display = "flex";
  });

  document.getElementById("closeModalAlterar").addEventListener("click", () => {
    modalAlterarEndereco.style.display = "none";
  });

  document.getElementById("cancelarAlterar").addEventListener("click", () => {
    modalAlterarEndereco.style.display = "none";
  });

  window.addEventListener("click", (e) => {
    if (e.target === modalAlterarEndereco) modalAlterarEndereco.style.display = "none";
  });

  document.getElementById("formAlterarEndereco").addEventListener("submit", async (e) => {
    e.preventDefault();
    const armAtual = document.getElementById("armAtualAlterar").value.trim();
    const endAtual = document.getElementById("endAtualAlterar").value.trim();
    const armNovo = document.getElementById("armNovoAlterar").value.trim();
    const endNovo = document.getElementById("endNovoAlterar").value.trim();
    const usuario = localStorage.getItem("userName") || "WEB";
    const btn = document.getElementById("submitAlterar");
    const step = btn.dataset.step || "localizar";

    if (step === "localizar") {
      btn.disabled = true;
      btn.textContent = "Buscando...";
      try {
        const res = await fetch(`/api/inventory?action=saldoPorLote&codigo=${encodeURIComponent(codigoAtual)}`);
        const data = await res.json();
        if (!res.ok) throw new Error(data.message);

        const lotesFiltrados = (data.lotes || []).filter(l =>
          String(l.ARMAZEM).trim() === armAtual && String(l.ENDERECO).trim() === endAtual
        );

        if (lotesFiltrados.length === 0) {
          alert(`Nenhum saldo encontrado para o produto ${codigoAtual} no armazém ${armAtual} / endereço ${endAtual}.`);
          btn.disabled = false;
          btn.textContent = "🔍 Localizar Saldo";
          return;
        }

        const totalSaldo = lotesFiltrados.reduce((sum, l) => sum + (l.SALDO || 0), 0);
        const descricao = document.getElementById("infoDescricao").textContent.trim();
        document.getElementById("mensagemConfirmarAlterar").textContent =
          `Transferir ${totalSaldo} unidades de "${descricao}" (${codigoAtual}) ` +
          `de ARM:${armAtual} END:${endAtual} → ARM:${armNovo} END:${endNovo}?`;
        document.getElementById("confirmarAlterarContainer").style.display = "block";
        btn.textContent = "✓ CONFIRMAR TRANSFERÊNCIA";
        btn.dataset.step = "confirmar";
        btn.disabled = false;
      } catch (err) {
        alert(`Erro: ${err.message}`);
        btn.disabled = false;
        btn.textContent = "🔍 Localizar Saldo";
      }
    } else {
      btn.disabled = true;
      btn.textContent = "Transferindo...";
      try {
        const res = await fetch("/api/inventory", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            codigo: codigoAtual,
            tipo: "ALTERAR_ENDERECO",
            quantidade: 0,
            usuario,
            armazem: armAtual,
            endereco: endAtual,
            novoArmazem: armNovo,
            novoEndereco: endNovo,
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.message);

        btn.disabled = false;
        modalAlterarEndereco.style.display = "none";
        statusEl.style.color = "#28a745";
        statusEl.textContent = data.message || "Endereço alterado com sucesso!";
        setTimeout(() => consultar(codigoAtual), 500);
      } catch (err) {
        alert(`Erro ao alterar endereço: ${err.message}`);
        btn.disabled = false;
        btn.textContent = "✓ CONFIRMAR TRANSFERÊNCIA";
      }
    }
  });

  // --- Lógica de Zerar Endereço ---

  btnZerarEndereco.addEventListener("click", () => {
    if (!codigoAtual) return;
    document.getElementById("armazemZerar").value = "";
    document.getElementById("enderecoZerar").value = "";
    document.getElementById("confirmarZerarContainer").style.display = "none";
    const submitBtn = document.getElementById("submitZerarEndereco");
    submitBtn.textContent = "✓ Localizar Saldo";
    submitBtn.dataset.step = "localizar";
    submitBtn.disabled = false;
    modalZerarEndereco.style.display = "flex";
  });

  document.getElementById("closeModalZerar").addEventListener("click", () => {
    modalZerarEndereco.style.display = "none";
  });

  document.getElementById("cancelarZerar").addEventListener("click", () => {
    modalZerarEndereco.style.display = "none";
  });

  window.addEventListener("click", (e) => {
    if (e.target === modalZerarEndereco) {
      modalZerarEndereco.style.display = "none";
    }
  });

  document.getElementById("formZerarEndereco").addEventListener("submit", async (e) => {
    e.preventDefault();
    const arm = document.getElementById("armazemZerar").value.trim();
    const end = document.getElementById("enderecoZerar").value.trim();
    const usuario = localStorage.getItem("userName") || "WEB";
    const submitBtn = document.getElementById("submitZerarEndereco");
    const step = submitBtn.dataset.step || "localizar";

    if (step === "localizar") {
      // Passo 1: buscar o saldo do endereço e confirmar
      submitBtn.disabled = true;
      submitBtn.textContent = "Buscando...";
      try {
        const res = await fetch(`/api/inventory?action=saldoPorLote&codigo=${encodeURIComponent(codigoAtual)}`);
        const data = await res.json();
        if (!res.ok) throw new Error(data.message);

        const lotesFiltrados = (data.lotes || []).filter(l =>
          String(l.ARMAZEM).trim() === arm && String(l.ENDERECO).trim() === end
        );

        if (lotesFiltrados.length === 0) {
          alert(`Nenhum saldo encontrado para o produto ${codigoAtual} no armazém ${arm} / endereço ${end}.`);
          submitBtn.disabled = false;
          submitBtn.textContent = "✓ Localizar Saldo";
          return;
        }

        const totalSaldo = lotesFiltrados.reduce((sum, l) => sum + (l.SALDO || 0), 0);
        const descricao = document.getElementById("infoDescricao").textContent.trim();
        document.getElementById("mensagemConfirmarZerar").textContent =
          `Confirmar SAÍDA de ${totalSaldo} unidades do produto ${descricao} (${codigoAtual}) ` +
          `no armazém ${arm} / endereço ${end}?`;
        document.getElementById("confirmarZerarContainer").style.display = "block";
        submitBtn.textContent = "⚠️ CONFIRMAR ZERAMENTO";
        submitBtn.dataset.step = "confirmar";
        submitBtn.disabled = false;
      } catch (err) {
        alert(`Erro: ${err.message}`);
        submitBtn.disabled = false;
        submitBtn.textContent = "✓ Localizar Saldo";
      }
    } else {
      // Passo 2: executar o zeramento
      submitBtn.disabled = true;
      submitBtn.textContent = "Zerando...";
      try {
        const res = await fetch("/api/inventory", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            codigo: codigoAtual,
            tipo: "ZERAR_ENDERECO",
            quantidade: 0,
            usuario,
            armazem: arm,
            endereco: end,
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.message);

        submitBtn.disabled = false;
        modalZerarEndereco.style.display = "none";
        statusEl.style.color = "#28a745";
        statusEl.textContent = data.message || "Endereço zerado com sucesso!";
        setTimeout(() => consultar(codigoAtual), 500);
      } catch (err) {
        alert(`Erro ao zerar endereço: ${err.message}`);
        submitBtn.disabled = false;
        submitBtn.textContent = "⚠️ CONFIRMAR ZERAMENTO";
      }
    }
  });

  // --- Lógica de Eventos ---

  btnConsultar.addEventListener("click", () => {
    const codigo = codigoEl.value.trim();
    if (codigo) consultar(codigo);
  });

  codigoEl.addEventListener("keypress", (e) => {
    if (e.key === "Enter") {
      const codigo = codigoEl.value.trim();
      if (codigo) consultar(codigo);
    }
  });

  btnEntrada.addEventListener("click", () => {
    if (!codigoAtual) return;
    tituloModal.textContent = "📥 Registrar ENTRADA";
    tituloModal.style.color = "#4caf50";
    iconModal.textContent = "📥";
    iconModal.style.color = "#4caf50";
    inputTipoMovimento.value = "ENTRADA";
    submitBtn.className = "btn-movimento entrada";
    submitBtn.textContent = "✓ Registrar Entrada";

    // Mostra/oculta campos e ajusta validação
    document.getElementById('loteSelectorContainer').style.display = 'none';
    document.getElementById('loteIdModal').required = false; // <-- Correção
    document.getElementById('entradaFields').style.display = 'block';
    document.getElementById('repeticoesContainer').style.display = 'block';
    
    modalMovimento.style.display = "flex";
  });

  btnSaida.addEventListener("click", async () => {
    if (!codigoAtual) {
      alert('Consulte um produto antes de registrar uma saída.');
      return;
    }
    tituloModal.textContent = `📤 Registrar SAÍDA`;
    tituloModal.style.color = "#f44336";
    iconModal.textContent = "📤";
    iconModal.style.color = "#f44336";
    inputTipoMovimento.value = "SAIDA";
    submitBtn.className = "btn-movimento saida";
    submitBtn.textContent = "✓ Registrar Saída";

    // Mostra/oculta campos e ajusta validação
    document.getElementById('loteSelectorContainer').style.display = 'block';
    document.getElementById('loteIdModal').required = true; // <-- Correção
    document.getElementById('entradaFields').style.display = 'none';
    document.getElementById('repeticoesContainer').style.display = 'none';
    
    modalMovimento.style.display = "flex";

    // Busca e popula os lotes disponíveis
    const loteSelect = document.getElementById('loteIdModal');
    loteSelect.innerHTML = '<option value="">Carregando lotes...</option>';
    loteSelect.disabled = true;
    loteSelecionado = null; // Reseta seleção anterior

    try {
        const res = await fetch(`/api/inventory?action=saldoPorLote&codigo=${encodeURIComponent(codigoAtual)}`);
        const data = await res.json();
        if (!res.ok) throw new Error(data.message);

        if (data.lotes && data.lotes.length > 0) {
            loteSelect.innerHTML = '<option value="">Selecione um lote...</option>';
            data.lotes.forEach(lote => {
                const option = document.createElement('option');
                option.value = lote.ID;
                option.textContent = `ID: ${lote.ID} | End: ${lote.ENDERECO || 'N/A'} | Saldo: ${lote.SALDO}`;
                option.dataset.saldo = lote.SALDO;
                loteSelect.appendChild(option);
            });
            loteSelect.disabled = false;
        } else {
            loteSelect.innerHTML = '<option value="">Nenhum lote com saldo encontrado.</option>';
        }
    } catch (err) {
        loteSelect.innerHTML = `<option value="">Erro ao carregar lotes.</option>`;
        console.error(err);
    }
  });

  closeModal.addEventListener("click", () => {
    modalMovimento.style.display = "none";
  });
  
  window.addEventListener("click", (e) => {
    if (e.target === modalMovimento) {
      modalMovimento.style.display = "none";
    }
  });
  
  formMovimento.addEventListener("submit", (e) => {
    e.preventDefault();
    handleMovimento();
  });

  document.getElementById('loteIdModal').addEventListener('change', function() {
    const selectedOption = this.options[this.selectedIndex];
    if (selectedOption && selectedOption.value) {
        loteSelecionado = {
            id: selectedOption.value,
            saldo: parseFloat(selectedOption.dataset.saldo)
        };
        // Atualiza o título do modal com o ID selecionado
        tituloModal.textContent = `📤 Registrar SAÍDA (Lote ID: ${loteSelecionado.id})`;
    } else {
        loteSelecionado = null;
        tituloModal.textContent = `📤 Registrar SAÍDA`;
    }
  });

  // Listener para o botão de reimprimir etiqueta
  document.getElementById('historicoBody').addEventListener('click', function(event) {
    const target = event.target.closest('.btn-reimprimir');
    if (target) {
        const row = target.closest('tr');
        const operacao = row.cells[1].textContent.trim().replace('⬆️', '').replace('⬇️', '').trim();
        
        if (operacao !== 'ENTRADA') {
            alert('A reimpressão de etiquetas está disponível apenas para movimentações de ENTRADA.');
            return;
        }

        const dados = {
            idMovimento: row.cells[0].textContent.trim(),
            codigo: codigoAtual,
            descricao: document.getElementById('infoDescricao').textContent.trim(),
            quantidade: row.cells[4].textContent.trim(),
            endereco: row.cells[2].textContent.trim(),
            armazem: row.cells[3].textContent.trim(),
            usuario: row.cells[5].textContent.trim(),
            dataHora: `${row.cells[6].textContent.trim()} ${row.cells[7].textContent.trim()}`,
            tipoMovimento: operacao
        };
        selecionarEImprimirEtiqueta(dados);
    }
  });

  async function handleMovimento() {
    const tipo = inputTipoMovimento.value;
    const quantidade = Number(document.getElementById("tamanhoLoteModal").value) || 0;
    const repeticoes = (tipo === 'ENTRADA') ? (Number(document.getElementById("repeticoesModal").value) || 1) : 1;
    const observacao = document.getElementById("observacaoModal").value.trim();
    const endereco = (document.getElementById("enderecoModal").value || "").trim();
    const armazem = (document.getElementById("armazemModal").value || "").trim();
    const usuario = localStorage.getItem("userName") || "WEB";

    if (!codigoAtual || quantidade <= 0) {
      alert("A quantidade deve ser maior que zero.");
      return;
    }

    if (tipo === 'SAIDA') {
      if (!loteSelecionado) {
        alert("Erro fatal: Nenhum lote selecionado. A operação não pode continuar.");
        return;
      }
      if (quantidade > loteSelecionado.saldo) {
        alert(`Quantidade inválida. O lote selecionado (${loteSelecionado.id}) possui saldo de apenas ${loteSelecionado.saldo}.`);
        return;
      }
    }

    statusEl.style.color = "#222";
    statusEl.textContent = "Registrando...";

    // Bloqueia o botão para evitar cliques duplicados
    submitBtn.disabled = true;
    const textoOriginalBtn = submitBtn.textContent;
    submitBtn.textContent = "⏳ Aguarde...";

    const etiquetasParaImprimir = [];

    try {
      for (let i = 0; i < repeticoes; i++) {
        if (repeticoes > 1) {
          submitBtn.textContent = `⏳ Registrando ${i + 1}/${repeticoes}...`;
          statusEl.textContent = `Registrando ${i + 1} de ${repeticoes}...`;
        }
        
        const body = {
          codigo: codigoAtual,
          tipo,
          quantidade: quantidade,
          usuario,
          endereco,
          armazem,
          observacao,
        };
        
        if (tipo === 'SAIDA') {
            body.idTbResumo = loteSelecionado.id;
        }

        const res = await fetch("/api/inventory", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });

        const data = await res.json();
        if (!res.ok) {
            throw new Error(data.message || `Erro ao registrar movimento ${i + 1}`);
        }
        
        if (tipo === 'ENTRADA' && data.labelData) {
            data.labelData.dataHora = new Date().toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
            etiquetasParaImprimir.push(data.labelData);
        }
      }

      if (etiquetasParaImprimir.length > 0) {
        selecionarEImprimirEtiqueta(etiquetasParaImprimir);
      }
      
      modalMovimento.style.display = "none";
      formMovimento.reset();
      submitBtn.disabled = false;
      submitBtn.textContent = textoOriginalBtn;
      
      // Atraso para dar tempo ao DB de atualizar antes de reconsultar
      setTimeout(() => {
          consultar(codigoAtual);
      }, 500);
      
      statusEl.style.color = "#28a745";
      statusEl.textContent = `${repeticoes} movimento(s) registrado(s) com sucesso!`;

    } catch (err) {
      submitBtn.disabled = false;
      submitBtn.textContent = textoOriginalBtn;
      statusEl.style.color = "#c00";
      statusEl.textContent = `Erro: ${err.message}`;
      modalMovimento.style.display = "none"; // Garante que o modal feche em caso de erro.
      // Re-consulta mesmo em caso de erro para atualizar a lista com os que deram certo
      setTimeout(() => {
        consultar(codigoAtual);
      }, 500);
    }
  }
});