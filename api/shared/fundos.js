import fs from 'fs';
import path from 'path';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const diag = req.query && (req.query.diag === '1' || req.query.diag === 'db');
  if (diag) {
    const info = { node: process.version, platform: process.platform };
    try {
      const mssql = await import('mssql');
      info.mssql = typeof (mssql.default || mssql) === 'object' || typeof (mssql.default || mssql) === 'function';
    } catch (error) {
      info.mssql = false;
      info.mssqlErro = `${error && error.name}: ${error && error.message}`;
      info.mssqlStack = String((error && error.stack) || '').slice(0, 1500);
    }
    try {
      const db = await import('../../db.js');
      info.db = typeof db.getConnection === 'function';
    } catch (error) {
      info.db = false;
      info.dbErro = `${error && error.name}: ${error && error.message}`;
      info.dbStack = String((error && error.stack) || '').slice(0, 1500);
    }
    return res.status(200).json(info);
  }

  try {
    // Lê a pasta de fundos diretamente
    const fundosDir = path.join(process.cwd(), 'img', 'fundo_menu_principal');
    
    // Verifica se a pasta existe
    if (!fs.existsSync(fundosDir)) {
      return res.status(404).json({ 
        success: false, 
        error: 'Pasta de fundos não encontrada',
        imagens: [],
        total: 0
      });
    }

    // Lê todos os arquivos da pasta
    const arquivos = fs.readdirSync(fundosDir);
    
    // Filtra apenas arquivos de imagem (ignora index.json, README.md, etc)
    const extensoesValidas = /\.(jpg|jpeg|png|gif|webp)$/i;
    const imagens = arquivos
      .filter(arquivo => extensoesValidas.test(arquivo))
      .sort(); // Ordena alfabeticamente

    return res.status(200).json({ 
      success: true, 
      imagens: imagens,
      total: imagens.length
    });
  } catch (error) {
    console.error('Erro ao ler fundos:', error);
    return res.status(500).json({ 
      success: false, 
      error: 'Erro ao carregar fundos',
      imagens: [],
      total: 0
    });
  }
}
