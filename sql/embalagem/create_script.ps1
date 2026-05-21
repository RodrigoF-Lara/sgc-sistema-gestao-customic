# Script para criar tabelas via mssql Node.js
# Instala o pacote mssql globalmente se necessário

$scriptContent = @"
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

async function createTables() {
    try {
        const pool = await sql.connect(config);
        
        console.log('Conectado ao banco de dados!');
        
        // Tabela de cabeçalho
        await pool.request().query(\`
            IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[TB_INVENTARIO_CICLICO]') AND type in (N'U'))
            BEGIN
                CREATE TABLE [dbo].[TB_INVENTARIO_CICLICO] (
                    [ID_INVENTARIO] INT IDENTITY(1,1) PRIMARY KEY,
                    [DT_GERACAO] DATETIME NOT NULL,
                    [CRITERIO] NVARCHAR(255),
                    [STATUS] NVARCHAR(50) NOT NULL DEFAULT 'EM_ANDAMENTO',
                    [TOTAL_ITENS] INT,
                    [ACURACIDADE] FLOAT,
                    [USUARIO_CRIACAO] NVARCHAR(100),
                    [DT_CRIACAO] DATETIME DEFAULT GETDATE(),
                    [USUARIO_FINALIZACAO] NVARCHAR(100),
                    [DT_FINALIZACAO] DATETIME
                );
                PRINT 'Tabela TB_INVENTARIO_CICLICO criada!';
            END
        \`);
        
        console.log('✓ Tabela TB_INVENTARIO_CICLICO verificada/criada');
        
        // Tabela de itens
        await pool.request().query(\`
            IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[TB_INVENTARIO_CICLICO_ITEM]') AND type in (N'U'))
            BEGIN
                CREATE TABLE [dbo].[TB_INVENTARIO_CICLICO_ITEM] (
                    [ID_ITEM] INT IDENTITY(1,1) PRIMARY KEY,
                    [ID_INVENTARIO] INT NOT NULL,
                    [CODIGO] NVARCHAR(50) NOT NULL,
                    [DESCRICAO] NVARCHAR(255),
                    [SALDO_SISTEMA] FLOAT DEFAULT 0,
                    [CONTAGEM_FISICA] FLOAT DEFAULT 0,
                    [DIFERENCA] FLOAT DEFAULT 0,
                    [ACURACIDADE] FLOAT,
                    [TOTAL_MOVIMENTACOES] INT,
                    CONSTRAINT [FK_INVENTARIO_ITEM] FOREIGN KEY ([ID_INVENTARIO]) 
                        REFERENCES [dbo].[TB_INVENTARIO_CICLICO]([ID_INVENTARIO])
                        ON DELETE CASCADE
                );
                PRINT 'Tabela TB_INVENTARIO_CICLICO_ITEM criada!';
            END
        \`);
        
        console.log('✓ Tabela TB_INVENTARIO_CICLICO_ITEM verificada/criada');
        
        // Índices
        await pool.request().query(\`
            IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IDX_INVENTARIO_STATUS' AND object_id = OBJECT_ID('TB_INVENTARIO_CICLICO'))
            BEGIN
                CREATE INDEX IDX_INVENTARIO_STATUS ON [dbo].[TB_INVENTARIO_CICLICO]([STATUS]);
            END
        \`);
        
        console.log('✓ Índice IDX_INVENTARIO_STATUS verificado/criado');
        
        await pool.request().query(\`
            IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IDX_INVENTARIO_ITEM_CODIGO' AND object_id = OBJECT_ID('TB_INVENTARIO_CICLICO_ITEM'))
            BEGIN
                CREATE INDEX IDX_INVENTARIO_ITEM_CODIGO ON [dbo].[TB_INVENTARIO_CICLICO_ITEM]([CODIGO]);
            END
        \`);
        
        console.log('✓ Índice IDX_INVENTARIO_ITEM_CODIGO verificado/criado');
        
        console.log('\\n==============================================');
        console.log('✓ Todas as tabelas foram criadas com sucesso!');
        console.log('==============================================');
        
        await pool.close();
        
    } catch (err) {
        console.error('Erro:', err);
    }
}

createTables();
"@

Set-Content -Path "C:\Users\ADM\Documents\Projetos\requisicoes\SQL_Scripts\create_tables.js" -Value $scriptContent

Write-Host "Script Node.js criado em SQL_Scripts\create_tables.js" -ForegroundColor Green
Write-Host "Execute com: node SQL_Scripts\create_tables.js" -ForegroundColor Yellow
