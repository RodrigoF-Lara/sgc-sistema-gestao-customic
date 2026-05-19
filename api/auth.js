import { getConnection, sql } from "../db.js";

/**
 * API Unificada de Autenticação e Gestão de Usuários
 * 
 * Consolidação de /api/login.js e /api/usuarios.js
 * 
 * Endpoints:
 * - POST (com campo 'pw'): Autenticação/Login
 * - POST (com campo 'senha'): Criar novo usuário
 * - GET: Listar todos os usuários
 * - PUT: Atualizar usuário existente
 * - DELETE: Excluir usuário
 */
export default async function handler(req, res) {
  const { method } = req;

  try {
    const pool = await getConnection();

    switch (method) {
      case "POST":
        // Se tem campo 'pw', é login. Se tem 'senha', é criar usuário
        if (req.body.pw !== undefined) {
          return await fazerLogin(req, res, pool);
        } else {
          return await criarUsuario(req, res, pool);
        }
      
      case "GET":
        return await listarUsuarios(req, res, pool);
      
      case "PUT":
        return await atualizarUsuario(req, res, pool);
      
      case "DELETE":
        return await excluirUsuario(req, res, pool);

      default:
        return res.status(405).json({ error: "Método não permitido" });
    }
  } catch (error) {
    console.error("Erro na API de autenticação:", error);
    return res.status(500).json({ 
      error: "Erro interno do servidor", 
      message: error.message 
    });
  }
}

/**
 * POST (com pw) - Autenticação/Login
 */
async function fazerLogin(req, res, pool) {
  const { usuario, pw } = req.body;

  if (!usuario || !pw) {
    return res.status(400).json({ message: "Usuário e senha obrigatórios" });
  }

  try {
    const result = await pool.request()
      .input('usuario', sql.NVarChar, usuario)
      .input('pw', sql.NVarChar, pw)
      .query(`
        SELECT [USUARIO],[PW],[NIVEL],[CPF],[F_NAME],[L_NAME],[ID],[COD],[SETOR]
        FROM [dbo].[CAD_USUARIO]
        WHERE [USUARIO]=@usuario AND [PW]=@pw
      `);

    if (result.recordset.length === 1) {
      const user = result.recordset[0];
      return res.status(200).json({ usuario: user });
    } else {
      return res.status(401).json({ message: "Usuário ou senha inválidos" });
    }
  } catch (err) {
    console.error("ERRO DETALHADO NO LOGIN:", err);
    return res.status(500).json({ message: "Erro no servidor", error: err.message });
  }
}

/**
 * GET - Listar todos os usuários
 */
async function listarUsuarios(req, res, pool) {
  try {
    const result = await pool.request().query(`
      SELECT 
        USUARIO,
        NIVEL,
        CPF,
        F_NAME,
        L_NAME,
        SETOR,
        COD,
        ROW_NUMBER() OVER (ORDER BY F_NAME, L_NAME) as ID
    });
  } catch (error) {
    console.error("Erro ao listar usuários:", error);
    return res.status(500).json({ 
      error: "Erro ao listar usuários", 
      message: error.message 
    });
  }
}

/**
 * POST (com senha) - Criar novo usuário
 */
async function criarUsuario(req, res, pool) {
  const { usuario, senha, nivel, cpf, firstName, lastName, setor = '', cod = '' } = req.body;

  // Validação dos campos obrigatórios
  if (!usuario || !senha || !nivel || !cpf || !firstName || !lastName) {
    return res.status(400).json({ 
      error: "Campos obrigatórios: USUARIO, SENHA, NIVEL, CPF, F_NAME, L_NAME" 
    });
  }

  try {
    // Verifica se o usuário já existe
    const existeUsuario = await pool.request()
      .input('usuario', sql.VarChar(50), usuario.toUpperCase())
      .query(`
        SELECT COUNT(*) as count 
        FROM [dbo].[CAD_USUARIO] 
        WHERE USUARIO = @usuario
      `);

    if (existeUsuario.recordset[0].count > 0) {
      return res.status(409).json({ 
        error: "USUÁRIO JÁ EXISTENTE, ESCOLHA OUTRO NOME OU ALTERE!" 
      });
    }

    // Verifica se o CPF já existe
    const existeCPF = await pool.request()
      .input('cpf', sql.VarChar(14), cpf)
      .query(`
        SELECT COUNT(*) as count 
        FROM [dbo].[CAD_USUARIO] 
        WHERE CPF = @cpf
      `);

    if (existeCPF.recordset[0].count > 0) {
      return res.status(409).json({ 
        error: "CPF já cadastrado no sistema!" 
      });
    }

    // Insere o novo usuário
    const result = await pool.request()
      .input('usuario', sql.VarChar(50), usuario.toUpperCase())
      .input('senha', sql.VarChar(50), senha.toUpperCase())
      .input('nivel', sql.VarChar(20), nivel.toUpperCase())
      .input('cpf', sql.VarChar(14), cpf)
      .input('firstName', sql.VarChar(50), firstName.toUpperCase())
      .input('lastName', sql.VarChar(50), lastName.toUpperCase())
      .input('setor', sql.VarChar(50), setor.toUpperCase())
      .input('cod', sql.VarChar(20), cod.toUpperCase())
      .query(`
        INSERT INTO [dbo].[CAD_USUARIO] 
          (USUARIO, PW, NIVEL, CPF, F_NAME, L_NAME, SETOR, COD)
        VALUES 
          (@usuario, @senha, @nivel, @cpf, @firstName, @lastName, @setor, @cod);
        
        SELECT SCOPE_IDENTITY() as ID;
      `);

    const novoId = result.recordset[0].ID;

    return res.status(201).json({ 
      success: true,
      message: "USUÁRIO INCLUÍDO COM SUCESSO!",
      id: novoId
    });
  } catch (error) {
    console.error("Erro ao criar usuário:", error);
    return res.status(500).json({ 
      error: "Erro ao criar usuário", 
      message: error.message 
    });
  }
}

/**
 * PUT - Atualizar usuário existente
 */
async function atualizarUsuario(req, res, pool) {
  const { usuarioOriginal, usuario, senha, nivel, cpf, firstName, lastName, setor = '', cod = '' } = req.body;

  if (!usuarioOriginal) {
    return res.status(400).json({ error: "Nome de usuário original é obrigatório" });
  }

  try {
    // Verifica se o usuário existe
    const usuarioExiste = await pool.request()
      .input('usuarioOriginal', sql.VarChar(50), usuarioOriginal.toUpperCase())
      .query(`
        SELECT USUARIO FROM [dbo].[CAD_USUARIO] WHERE USUARIO = @usuarioOriginal
      `);

    if (usuarioExiste.recordset.length === 0) {
      return res.status(404).json({ error: "Usuário não encontrado" });
    }

    // Se está alterando o nome de usuário, verifica se o novo já existe
    if (usuario && usuario.toUpperCase() !== usuarioOriginal.toUpperCase()) {
      const usuarioDuplicado = await pool.request()
        .input('usuario', sql.VarChar(50), usuario.toUpperCase())
        .query(`
          SELECT COUNT(*) as count 
          FROM [dbo].[CAD_USUARIO] 
          WHERE USUARIO = @usuario
        `);

      if (usuarioDuplicado.recordset[0].count > 0) {
        return res.status(409).json({ 
          error: "Este nome de usuário já está em uso por outro usuário!" 
        });
      }
    }

    // Monta a query de UPDATE dinamicamente baseado nos campos fornecidos
    let updateFields = [];
    let request = pool.request().input('usuarioOriginal', sql.VarChar(50), usuarioOriginal.toUpperCase());

    if (usuario) {
      updateFields.push('USUARIO = @usuario');
      request.input('usuario', sql.VarChar(50), usuario.toUpperCase());
    }
    if (senha) {
      updateFields.push('PW = @senha');
      request.input('senha', sql.VarChar(50), senha.toUpperCase());
    }
    if (nivel) {
      updateFields.push('NIVEL = @nivel');
      request.input('nivel', sql.VarChar(20), nivel.toUpperCase());
    }
    if (cpf) {
      updateFields.push('CPF = @cpf');
      request.input('cpf', sql.VarChar(14), cpf);
    }
    if (firstName) {
      updateFields.push('F_NAME = @firstName');
      request.input('firstName', sql.VarChar(50), firstName.toUpperCase());
    }
    if (lastName) {
      updateFields.push('L_NAME = @lastName');
      request.input('lastName', sql.VarChar(50), lastName.toUpperCase());
    }
    if (setor !== undefined) {
      updateFields.push('SETOR = @setor');
      request.input('setor', sql.VarChar(50), setor.toUpperCase());
    }
    if (cod !== undefined) {
      updateFields.push('COD = @cod');
      request.input('cod', sql.VarChar(20), cod.toUpperCase());
    }

    if (updateFields.length === 0) {
      return res.status(400).json({ error: "Nenhum campo para atualizar" });
    }

    await request.query(`
      UPDATE [dbo].[CAD_USUARIO] 
      SET ${updateFields.join(', ')}
      WHERE USUARIO = @usuarioOriginal
    `);

    return res.status(200).json({ 
      success: true,
      message: "Usuário atualizado com sucesso!"
    });
  } catch (error) {
    console.error("Erro ao atualizar usuário:", error);
    return res.status(500).json({ 
      error: "Erro ao atualizar usuário", 
      message: error.message 
    });
  }
}

/**
 * DELETE - Excluir usuário
 */
async function excluirUsuario(req, res, pool) {
  const { usuario } = req.query;

  if (!usuario) {
    return res.status(400).json({ error: "Nome do usuário é obrigatório" });
  }

  try {
    // Verifica se o usuário existe
    const usuarioExiste = await pool.request()
      .input('usuario', sql.VarChar(50), usuario.toUpperCase())
      .query(`
        SELECT USUARIO FROM [dbo].[CAD_USUARIO] WHERE USUARIO = @usuario
      `);

    if (usuarioExiste.recordset.length === 0) {
      return res.status(404).json({ error: "Usuário não encontrado" });
    }

    // Exclui o usuário
    await pool.request()
      .input('usuario', sql.VarChar(50), usuario.toUpperCase())
      .query(`
        DELETE FROM [dbo].[CAD_USUARIO] WHERE USUARIO = @usuario
      `);

    return res.status(200).json({ 
      success: true,
      message: "Usuário excluído com sucesso!"
    });
  } catch (error) {
    console.error("Erro ao excluir usuário:", error);
    return res.status(500).json({ 
      error: "Erro ao excluir usuário", 
      message: error.message 
    });
  }
}
