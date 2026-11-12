-- Foto do produto usada no cadastro e na contagem do balanço.
-- A API também cria esta tabela na primeira gravação ou leitura.
-- Uma foto por código, até 3 MB (JPG, PNG, GIF ou WEBP).

IF OBJECT_ID(N'dbo.CAD_PROD_FOTO', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.CAD_PROD_FOTO (
        CODIGO         NVARCHAR(100)  NOT NULL PRIMARY KEY,
        NOME_ARQUIVO   NVARCHAR(255)  NOT NULL,
        MIME           NVARCHAR(80)   NOT NULL,
        CONTEUDO       VARBINARY(MAX) NOT NULL,
        TAMANHO        INT            NOT NULL,
        ATUALIZADO_EM  DATETIME       NOT NULL CONSTRAINT DF_CAD_PROD_FOTO_EM DEFAULT (GETDATE()),
        ATUALIZADO_POR NVARCHAR(100)  NULL,
        CONSTRAINT CK_CAD_PROD_FOTO_TAM CHECK (TAMANHO > 0 AND TAMANHO <= 3145728)
    );
END
GO
