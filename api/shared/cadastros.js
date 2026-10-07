import { getConnection, sql } from "../../db.js";

/**
 * API unificada de Cadastros
 * Gerencia produtos e fornecedores
 * 
 * Rotas:
 * - /api/cadastros?tipo=produtos (GET/POST)
 * - /api/cadastros?tipo=fornecedores (GET/POST/PUT/DELETE)
 */
export default async function handler(req, res) {
  const { method, query } = req;
  const { tipo } = query;

  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    const pool = await getConnection();

    if (tipo === 'fornecedores') {
      return await handleFornecedores(req, res, pool, method);
    } else if (tipo === 'produtos') {
      return await handleProdutos(req, res, pool, method);
    } else {
      return res.status(400).json({ error: "Parâmetro 'tipo' é obrigatório (produtos ou fornecedores)" });
    }
  } catch (error) {
    console.error("Erro na API de cadastros:", error);
    return res.status(500).json({ 
      error: "Erro interno do servidor", 
      message: error.message 
    });
  }
}

// =========================================================================
// FORNECEDORES
// =========================================================================

async function handleFornecedores(req, res, pool, method) {
  switch (method) {
    case "GET":
      return await listarFornecedores(req, res, pool);
    
    case "POST":
      return await criarFornecedor(req, res, pool);
    
    case "PUT":
      return await atualizarFornecedor(req, res, pool);
    
    case "DELETE":
      return await excluirFornecedor(req, res, pool);

    default:
      return res.status(405).json({ error: "Método não permitido" });
  }
}

async function listarFornecedores(req, res, pool) {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const pageSize = Math.min(200, Math.max(10, parseInt(req.query.pageSize) || 50));
    const search = (req.query.search || '').trim();
    const offset = (page - 1) * pageSize;

    const request = pool.request()
      .input('offset', sql.Int, offset)
      .input('pageSize', sql.Int, pageSize);

    let whereClause = '';
    if (search) {
      whereClause = `WHERE 
        RAZAO_SOCIAL LIKE @search 
        OR CAST(COD_FORNECEDOR AS NVARCHAR) LIKE @search 
        OR CNPJ LIKE @search`;
      request.input('search', sql.NVarChar, `%${search}%`);
    }

    // Total de registros (com filtro aplicado)
    const totalResult = await request.query(`
      SELECT COUNT(*) AS total FROM [dbo].[CAD_FORNECEDOR] ${whereClause}
    `);
    const total = totalResult.recordset[0].total;

    // Página atual
    const dataResult = await request.query(`
      SELECT 
        COD_FORNECEDOR,
        RAZAO_SOCIAL,
        CNPJ
      FROM [dbo].[CAD_FORNECEDOR]
      ${whereClause}
      ORDER BY RAZAO_SOCIAL
      OFFSET @offset ROWS
      FETCH NEXT @pageSize ROWS ONLY
    `);

    return res.status(200).json({ 
      success: true,
      fornecedores: dataResult.recordset,
      total: total,
      page: page,
      pageSize: pageSize,
      totalPages: Math.ceil(total / pageSize)
    });
  } catch (error) {
    console.error("Erro ao listar fornecedores:", error);
    return res.status(500).json({ 
      error: "Erro ao listar fornecedores", 
      message: error.message 
    });
  }
}

async function criarFornecedor(req, res, pool) {
  const { codFornecedor, razaoSocial, cnpj } = req.body;

  if (!codFornecedor || !razaoSocial) {
    return res.status(400).json({ error: "Código e razão social são obrigatórios" });
  }

  try {
    // Verifica duplicação
    const exists = await pool.request()
      .input('cod', sql.Int, codFornecedor)
      .query('SELECT COD_FORNECEDOR FROM CAD_FORNECEDOR WHERE COD_FORNECEDOR = @cod');

    if (exists.recordset.length > 0) {
      return res.status(409).json({ error: "Este código de fornecedor já existe" });
    }

    // Insere
    await pool.request()
      .input('cod', sql.Int, codFornecedor)
      .input('razao', sql.NVarChar, razaoSocial)
      .input('cnpj', sql.NVarChar, cnpj || null)
      .query(`
        INSERT INTO [dbo].[CAD_FORNECEDOR] (COD_FORNECEDOR, RAZAO_SOCIAL, CNPJ)
        VALUES (@cod, @razao, @cnpj)
      `);

    return res.status(201).json({ 
      success: true, 
      message: "Fornecedor cadastrado com sucesso" 
    });
  } catch (error) {
    console.error("Erro ao criar fornecedor:", error);
    return res.status(500).json({ 
      error: "Erro ao criar fornecedor", 
      message: error.message 
    });
  }
}

async function atualizarFornecedor(req, res, pool) {
  const { codFornecedorOriginal, codFornecedor, razaoSocial, cnpj } = req.body;

  if (!codFornecedorOriginal || !codFornecedor || !razaoSocial) {
    return res.status(400).json({ error: "Dados obrigatórios faltando" });
  }

  try {
    // Se mudou o código, verifica se o novo já existe
    if (codFornecedorOriginal !== codFornecedor) {
      const exists = await pool.request()
        .input('cod', sql.Int, codFornecedor)
        .query('SELECT COD_FORNECEDOR FROM CAD_FORNECEDOR WHERE COD_FORNECEDOR = @cod');

      if (exists.recordset.length > 0) {
        return res.status(409).json({ error: "Este código de fornecedor já existe" });
      }
    }

    await pool.request()
      .input('codOriginal', sql.Int, codFornecedorOriginal)
      .input('cod', sql.Int, codFornecedor)
      .input('razao', sql.NVarChar, razaoSocial)
      .input('cnpj', sql.NVarChar, cnpj || null)
      .query(`
        UPDATE [dbo].[CAD_FORNECEDOR]
        SET COD_FORNECEDOR = @cod,
            RAZAO_SOCIAL = @razao,
            CNPJ = @cnpj
        WHERE COD_FORNECEDOR = @codOriginal
      `);

    return res.status(200).json({ 
      success: true, 
      message: "Fornecedor atualizado com sucesso" 
    });
  } catch (error) {
    console.error("Erro ao atualizar fornecedor:", error);
    return res.status(500).json({ 
      error: "Erro ao atualizar fornecedor", 
      message: error.message 
    });
  }
}

async function excluirFornecedor(req, res, pool) {
  const { codFornecedor } = req.query;

  if (!codFornecedor) {
    return res.status(400).json({ error: "Código do fornecedor é obrigatório" });
  }

  try {
    await pool.request()
      .input('cod', sql.Int, codFornecedor)
      .query('DELETE FROM [dbo].[CAD_FORNECEDOR] WHERE COD_FORNECEDOR = @cod');

    return res.status(200).json({ 
      success: true, 
      message: "Fornecedor excluído com sucesso" 
    });
  } catch (error) {
    console.error("Erro ao excluir fornecedor:", error);
    return res.status(500).json({ 
      error: "Erro ao excluir fornecedor", 
      message: error.message 
    });
  }
}

// =========================================================================
// PRODUTOS (mantém compatibilidade com API antiga)
// =========================================================================

let planejamentoReady = false;

async function ensurePlanejamento(pool) {
  if (planejamentoReady) return;
  await pool.request().query(`
    IF OBJECT_ID(N'dbo.CAD_PROD_PLANEJAMENTO', N'U') IS NULL
    CREATE TABLE dbo.CAD_PROD_PLANEJAMENTO (
      CODIGO NVARCHAR(100) NOT NULL PRIMARY KEY,
      LINHA NVARCHAR(80) NULL,
      MARCA NVARCHAR(60) NULL,
      MODELO NVARCHAR(80) NULL,
      COR NVARCHAR(40) NULL,
      EAN NVARCHAR(20) NULL,
      NCM NVARCHAR(10) NULL,
      SAP_VIVO NVARCHAR(40) NULL,
      COD_CLARO NVARCHAR(40) NULL
    );
  `);
  planejamentoReady = true;
}

function textoPlano(valor, max) {
  const s = String(valor ?? "").trim();
  if (!s) return null;
  return s.slice(0, max);
}

function planoDe(body) {
  return {
    linha: textoPlano(body.linha, 80),
    marca: textoPlano(body.marca, 60),
    modelo: textoPlano(body.modelo, 80),
    cor: textoPlano(body.cor, 40),
    ean: textoPlano(body.ean, 20),
    ncm: textoPlano(body.ncm, 10),
    sapVivo: textoPlano(body.sapVivo, 40),
    codClaro: textoPlano(body.codClaro, 40),
  };
}

async function gravarPlanejamento(conn, codigo, plano) {
  await new sql.Request(conn)
    .input("codigo", sql.NVarChar(100), String(codigo).trim())
    .input("linha", sql.NVarChar(80), plano.linha)
    .input("marca", sql.NVarChar(60), plano.marca)
    .input("modelo", sql.NVarChar(80), plano.modelo)
    .input("cor", sql.NVarChar(40), plano.cor)
    .input("ean", sql.NVarChar(20), plano.ean)
    .input("ncm", sql.NVarChar(10), plano.ncm)
    .input("sapVivo", sql.NVarChar(40), plano.sapVivo)
    .input("codClaro", sql.NVarChar(40), plano.codClaro)
    .query(`
      MERGE dbo.CAD_PROD_PLANEJAMENTO AS alvo
      USING (SELECT @codigo AS CODIGO) AS origem ON alvo.CODIGO = origem.CODIGO
      WHEN MATCHED THEN UPDATE SET
        LINHA=@linha, MARCA=@marca, MODELO=@modelo, COR=@cor,
        EAN=@ean, NCM=@ncm, SAP_VIVO=@sapVivo, COD_CLARO=@codClaro
      WHEN NOT MATCHED THEN INSERT
        (CODIGO, LINHA, MARCA, MODELO, COR, EAN, NCM, SAP_VIVO, COD_CLARO)
        VALUES (@codigo, @linha, @marca, @modelo, @cor, @ean, @ncm, @sapVivo, @codClaro);
    `);
}

async function handleProdutos(req, res, pool, method) {
  await ensurePlanejamento(pool);
  if (method === 'GET') {
    return await listarProdutos(req, res, pool);
  } else if (method === 'POST') {
    const acao = req.body && req.body.acao;
    if (acao === 'criar') {
      return await criarProduto(req, res, pool);
    }
    if (acao === 'atualizar') {
      return await atualizarProdutosAlteracoes(req, res, pool);
    }
    return await atualizarProdutos(req, res, pool);
  }

  return res.status(405).json({ message: "Método não permitido" });
}

async function listarProdutos(req, res, pool) {
  try {
    const { codigo, descricao, curva, ativo } = req.query || {};

    const request = pool.request();
    const where = [];

    if (codigo) {
      request.input('codigo', sql.NVarChar, String(codigo).trim());
      where.push('p.CODIGO LIKE @codigo + \'%\'');
    }
    if (descricao) {
      request.input('descricao', sql.NVarChar, String(descricao).trim());
      where.push('p.DESCRICAO LIKE \'%\' + @descricao + \'%\'');
    }
    if (curva) {
      request.input('curva', sql.NVarChar, String(curva).trim());
      where.push('p.CURVA_A_B_C = @curva');
    }
    if (ativo !== undefined && ativo !== '' && ativo !== null) {
      request.input('ativo', sql.Int, parseInt(ativo, 10));
      where.push('p.ATIVO = @ativo');
    }

    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

    const result = await request.query(`
      SELECT TOP 500 p.CODIGO, p.DESCRICAO, p.TIPO, p.DEPOSITO, p.CURVA_A_B_C, p.ATIVO,
             p.ESTOQUE_MINIMO, p.ESTOQUE_IDEAL, p.ESTOQUE_MAXIMO,
             pl.LINHA AS PLN_LINHA, pl.MARCA AS PLN_MARCA, pl.MODELO AS PLN_MODELO,
             pl.COR AS PLN_COR, pl.EAN AS PLN_EAN, pl.NCM AS PLN_NCM,
             pl.SAP_VIVO AS PLN_SAP_VIVO, pl.COD_CLARO AS PLN_COD_CLARO
      FROM [dbo].[CAD_PROD] p
      LEFT JOIN dbo.CAD_PROD_PLANEJAMENTO pl ON pl.CODIGO = p.CODIGO
      ${whereSql}
      ORDER BY p.CODIGO
    `);

    const produtos = result.recordset.map(p => ({
      ...p,
      ATIVO: (p.ATIVO && p.ATIVO.type === 'Buffer' && p.ATIVO.data)
        ? p.ATIVO.data[0]
        : (typeof p.ATIVO === 'boolean' ? (p.ATIVO ? 1 : 0) : p.ATIVO)
    }));

    return res.status(200).json({ produtos });
  } catch (error) {
    console.error("Erro ao listar produtos:", error);
    return res.status(500).json({ message: "Erro ao buscar produtos", error: error.message });
  }
}

async function atualizarProdutosAlteracoes(req, res, pool) {
  const { alteracoes } = req.body;

  if (!Array.isArray(alteracoes) || alteracoes.length === 0) {
    return res.status(400).json({ message: "Envie um array de alterações" });
  }

  try {
    const transaction = new sql.Transaction(pool);
    await transaction.begin();

    for (const alt of alteracoes) {
      const sets = [];
      const reqUp = new sql.Request(transaction);
      reqUp.input('codigo', sql.NVarChar, alt.codigo);

      if (alt.descricao !== undefined) {
        reqUp.input('descricao', sql.NVarChar, alt.descricao);
        sets.push('DESCRICAO = @descricao');
      }
      if (alt.tipo !== undefined) {
        reqUp.input('tipo', sql.NVarChar, alt.tipo);
        sets.push('TIPO = @tipo');
      }
      if (alt.curva !== undefined) {
        reqUp.input('curva', sql.NVarChar, alt.curva);
        sets.push('CURVA_A_B_C = @curva');
      }
      if (alt.ativo !== undefined) {
        reqUp.input('ativo', sql.Int, parseInt(alt.ativo, 10));
        sets.push('ATIVO = @ativo');
      }
      if (alt.estoqueMinimo !== undefined) {
        reqUp.input('estoqueMinimo', sql.Decimal(18, 3), alt.estoqueMinimo === null || alt.estoqueMinimo === '' ? null : Number(alt.estoqueMinimo));
        sets.push('ESTOQUE_MINIMO = @estoqueMinimo');
      }
      if (alt.estoqueIdeal !== undefined) {
        reqUp.input('estoqueIdeal', sql.Decimal(18, 3), alt.estoqueIdeal === null || alt.estoqueIdeal === '' ? null : Number(alt.estoqueIdeal));
        sets.push('ESTOQUE_IDEAL = @estoqueIdeal');
      }
      if (alt.estoqueMaximo !== undefined) {
        reqUp.input('estoqueMaximo', sql.Decimal(18, 3), alt.estoqueMaximo === null || alt.estoqueMaximo === '' ? null : Number(alt.estoqueMaximo));
        sets.push('ESTOQUE_MAXIMO = @estoqueMaximo');
      }

      const temPlano = ["linha", "marca", "modelo", "cor", "ean", "ncm", "sapVivo", "codClaro"]
        .some((campo) => alt[campo] !== undefined);
      if (sets.length === 0 && !temPlano) continue;

      if (sets.length) {
        await reqUp.query(`
          UPDATE [dbo].[CAD_PROD]
          SET ${sets.join(', ')}
          WHERE CODIGO = @codigo
        `);
      }
      if (temPlano) await gravarPlanejamento(transaction, alt.codigo, planoDe(alt));
    }

    await transaction.commit();

    return res.status(200).json({
      message: `${alteracoes.length} alteração(ões) salva(s)`
    });
  } catch (error) {
    console.error("Erro ao atualizar produtos (alteracoes):", error);
    return res.status(500).json({ message: "Erro ao salvar alterações", error: error.message });
  }
}

async function criarProduto(req, res, pool) {
  const { codigo, descricao, tipo } = req.body;

  if (!codigo || !descricao || !tipo) {
    return res.status(400).json({ message: "Preencha todos os campos" });
  }

  const tiposValidos = [
    'EMBALAGEM',
    'CAPAS',
    'MAQUINA DE FILMES',
    'ALCAS',
    'WALLETS',
    'CABOS',
    'MATERIAL DE ESCRITORIO',
    'MATERIAL DE LIMPEZA',
    'OUTROS'
  ];
  const tipoUpper = String(tipo).toUpperCase().trim();
  if (!tiposValidos.includes(tipoUpper)) {
    return res.status(400).json({ message: "Tipo inválido" });
  }

  try {
    const checkResult = await pool.request()
      .input('CODIGO', sql.NVarChar, codigo)
      .query('SELECT CODIGO FROM [dbo].[CAD_PROD] WHERE CODIGO = @CODIGO');

    if (checkResult.recordset.length > 0) {
      return res.status(409).json({ message: "Código já existe" });
    }

    const transaction = new sql.Transaction(pool);
    await transaction.begin();

    await new sql.Request(transaction)
      .input('CODIGO', sql.NVarChar, codigo)
      .input('DESCRICAO', sql.NVarChar, descricao)
      .input('TIPO', sql.NVarChar, tipoUpper)
      .query(`
        INSERT INTO [dbo].[CAD_PROD] ([CODIGO], [DESCRICAO], [DEPOSITO], [TIPO])
        VALUES (@CODIGO, @DESCRICAO, 'CUSTOMIC-01', @TIPO)
      `);

    await new sql.Request(transaction)
      .input('CODIGO', sql.NVarChar, codigo)
      .query(`
        INSERT INTO [dbo].[BOM] ([COD_PAI], [COD_FILHO], [QNT_FILHO])
        VALUES (@CODIGO, @CODIGO, 1)
      `);

    const plano = planoDe(req.body);
    if (Object.values(plano).some(Boolean)) {
      await gravarPlanejamento(transaction, codigo, plano);
    }

    await transaction.commit();

    return res.status(201).json({ message: "Produto criado com sucesso!" });
  } catch (error) {
    console.error("Erro ao criar produto:", error);
    return res.status(500).json({ message: "Erro ao criar produto" });
  }
}

async function atualizarProdutos(req, res, pool) {
  const { produtos } = req.body;

  if (!Array.isArray(produtos) || produtos.length === 0) {
    return res.status(400).json({ message: "Envie um array de produtos" });
  }

  try {
    const transaction = new sql.Transaction(pool);
    await transaction.begin();

    for (const prod of produtos) {
      await new sql.Request(transaction)
        .input('CODIGO', sql.NVarChar, prod.CODIGO)
        .input('DESCRICAO', sql.NVarChar, prod.DESCRICAO)
        .input('TIPO', sql.NVarChar, prod.TIPO)
        .query(`
          UPDATE [dbo].[CAD_PROD]
          SET DESCRICAO = @DESCRICAO, TIPO = @TIPO
          WHERE CODIGO = @CODIGO
        `);
    }

    await transaction.commit();

    return res.status(200).json({ 
      message: `${produtos.length} produto(s) atualizado(s)` 
    });
  } catch (error) {
    console.error("Erro ao atualizar produtos:", error);
    return res.status(500).json({ message: "Erro ao atualizar produtos" });
  }
}
