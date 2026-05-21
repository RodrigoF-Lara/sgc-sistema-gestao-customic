const sql = require('mssql');

// Carrega as variáveis de ambiente do arquivo .env
try {
    require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
} catch (e) {
    console.log('⚠️ dotenv não encontrado, usando variáveis de ambiente do sistema');
}

const config = {
    user: process.env.AZURE_SQL_USER || process.env.DB_USER,
    password: process.env.AZURE_SQL_PASSWORD || process.env.DB_PASS,
    database: process.env.AZURE_SQL_DATABASE || process.env.DB_NAME,
    server: process.env.AZURE_SQL_SERVER || process.env.DB_SERVER,
    options: {
        encrypt: true,
        trustServerCertificate: false
    }
};

console.log('🔍 Config:', {
    server: config.server,
    database: config.database,
    user: config.user
});

async function limparInventarios() {
    if (!config.server) {
        console.error('❌ ERRO: Variáveis de ambiente não configuradas!');
        console.log('Configure as variáveis no arquivo .env ou nas variáveis de ambiente do sistema.');
        return;
    }
    try {
        const pool = await sql.connect(config);
        
        console.log('Conectado ao banco de dados!');
        
        // Limpa primeiro a tabela de itens (tem FK para a tabela de cabeçalho)
        await pool.request().query(`
            DELETE FROM [dbo].[TB_INVENTARIO_CICLICO_ITEM];
            PRINT 'Tabela TB_INVENTARIO_CICLICO_ITEM limpa!';
        `);
        
        console.log('✓ Tabela TB_INVENTARIO_CICLICO_ITEM limpa');
        
        // Depois limpa a tabela de cabeçalho
        await pool.request().query(`
            DELETE FROM [dbo].[TB_INVENTARIO_CICLICO];
            PRINT 'Tabela TB_INVENTARIO_CICLICO limpa!';
        `);
        
        console.log('✓ Tabela TB_INVENTARIO_CICLICO limpa');
        
        // Reseta o IDENTITY para começar do 1 novamente
        await pool.request().query(`
            DBCC CHECKIDENT ('[dbo].[TB_INVENTARIO_CICLICO_ITEM]', RESEED, 0);
            DBCC CHECKIDENT ('[dbo].[TB_INVENTARIO_CICLICO]', RESEED, 0);
            PRINT 'IDs resetados para começar do 1!';
        `);
        
        console.log('✓ IDs resetados');
        
        await pool.close();
        console.log('\n✅ Tabelas de inventário limpas com sucesso!');
        
    } catch (err) {
        console.error('❌ Erro ao limpar tabelas:', err);
    }
}

limparInventarios();
