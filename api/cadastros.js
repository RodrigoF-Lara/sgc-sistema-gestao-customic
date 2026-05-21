import { getConnection, sql } from "../db.js";

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

async function handleProdutos(req, res, pool, method) {
  if (method === 'GET') {
    return await listarProdutos(req, res, pool);
  } else if (method === 'POST') {
    const acao = req.body && req.body.acao;
    if (acao === 'criar') {
      return await criarProduto(req, res, pool);
    }
    return await atualizarProdutos(req, res, pool);
  }

  return res.status(405).json({ message: "Método não permitido" });
}

async function listarProdutos(req, res, pool) {
  try {
    const result = await pool.request().query(`
      SELECT CODIGO, DESCRICAO, TIPO, DEPOSITO
      FROM [dbo].[CAD_PROD]
      ORDER BY CODIGO
    `);

    return res.status(200).json(result.recordset);
  } catch (error) {
    console.error("Erro ao listar produtos:", error);
    return res.status(500).json({ message: "Erro ao buscar produtos" });
  }
}

async function criarProduto(req, res, pool) {
  const { codigo, descricao, tipo } = req.body;

  if (!codigo || !descricao || !tipo) {
    return res.status(400).json({ message: "Preencha todos os campos" });
  }

  const tiposValidos = ['OUTROS', 'EMBALAGEM'];
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
