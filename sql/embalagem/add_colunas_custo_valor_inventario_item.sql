-- Adiciona as colunas de custo unitário e valor total ao item do inventário cíclico
ALTER TABLE [dbo].[TB_INVENTARIO_CICLICO_ITEM]
ADD CUSTO_UNITARIO FLOAT NULL,
    VALOR_TOTAL_ESTOQUE FLOAT NULL;
