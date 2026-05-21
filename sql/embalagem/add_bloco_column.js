const sql = require('mssql');

const config = {
    user: 'sa1',
    password: 'customic23*',
    server: 'producao2.database.windows.net',
    database: 'KARDEX',
    options: {
        encrypt: true,
        trustServerCertificate: true
    }
};

async function addBlocoColumn() {
    try {
        const pool = await sql.connect(config);
        
        console.log('Conectado ao banco de dados!');
        
        // Adiciona coluna BLOCO
        await pool.request().query(`
            IF NOT EXISTS (
                SELECT * FROM sys.columns 
                WHERE object_id = OBJECT_ID(N'[dbo].[TB_INVENTARIO_CICLICO_ITEM]') 
                AND name = 'BLOCO'
            )
            BEGIN
                ALTER TABLE [dbo].[TB_INVENTARIO_CICLICO_ITEM]
                ADD [BLOCO] NVARCHAR(50);
            END
        `);
        
        console.log('✓ Coluna BLOCO verificada/adicionada');
        
        console.log('\n==============================================');
        console.log('✓ Coluna BLOCO adicionada com sucesso!');
        console.log('==============================================');
        
        await pool.close();
        
    } catch (err) {
        console.error('Erro:', err);
    }
}

addBlocoColumn();
