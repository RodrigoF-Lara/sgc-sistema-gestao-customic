const sql = require('mssql');

const config = {
    user: process.env.DB_USER,
    password: process.env.DB_PASS,
    server: process.env.DB_SERVER,
    database: process.env.DB_NAME,
    options: {
        encrypt: true,
        trustServerCertificate: true
    }
};

async function alterTable() {
    try {
        const pool = await sql.connect(config);
        
        console.log('Conectado ao banco de dados!');
        
        // Adiciona coluna USUARIO_CONTAGEM
        await pool.request().query(`
            IF NOT EXISTS (
                SELECT * FROM sys.columns 
                WHERE object_id = OBJECT_ID(N'[dbo].[TB_INVENTARIO_CICLICO_ITEM]') 
                AND name = 'USUARIO_CONTAGEM'
            )
            BEGIN
                ALTER TABLE [dbo].[TB_INVENTARIO_CICLICO_ITEM]
                ADD [USUARIO_CONTAGEM] NVARCHAR(100);
            END
        `);
        
        console.log('✓ Coluna USUARIO_CONTAGEM verificada/adicionada');
        
        // Adiciona coluna DT_CONTAGEM
        await pool.request().query(`
            IF NOT EXISTS (
                SELECT * FROM sys.columns 
                WHERE object_id = OBJECT_ID(N'[dbo].[TB_INVENTARIO_CICLICO_ITEM]') 
                AND name = 'DT_CONTAGEM'
            )
            BEGIN
                ALTER TABLE [dbo].[TB_INVENTARIO_CICLICO_ITEM]
                ADD [DT_CONTAGEM] DATETIME;
            END
        `);
        
        console.log('✓ Coluna DT_CONTAGEM verificada/adicionada');
        
        console.log('\n==============================================');
        console.log('✓ Colunas de rastreamento adicionadas!');
        console.log('==============================================');
        
        await pool.close();
        
    } catch (err) {
        console.error('Erro:', err);
    }
}

alterTable();
