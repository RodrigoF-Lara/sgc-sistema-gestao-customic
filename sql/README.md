# Scripts SQL

Organização planejada (Fase 1 do roadmap):

```
sql/
├── shared/      ← tabelas e índices compartilhados (usuários, fornecedores, produtos, notificações)
├── embalagem/   ← scripts atuais de SQL_Scripts/ (kardex, requisições, inventário, NF)
└── producao/    ← novos scripts do módulo Produção
```

> Os scripts atuais permanecem temporariamente em `SQL_Scripts/` até a migração.

## Scripts notáveis

| Script | Módulo | Função |
|---|---|---|
| `embalagem/create_tb_saving_meta.sql` | Embalagem | Cria `TB_SAVING_META` (metas de redução de custo por item/mês — Saving de Compras) |
| `embalagem/alter_tb_requisicoes_add_dt_conclusao.sql` | Embalagem | Adiciona `TB_REQUISICOES.DT_CONCLUSAO` para medir lead time de atendimento |
| `embalagem/backfill_tb_requisicoes_dt_conclusao.sql` | Embalagem | Preenche `TB_REQUISICOES.DT_CONCLUSAO` das requisições antigas concluídas a partir do log de itens |
| `embalagem/create_tb_req_delete_log.sql` | Embalagem | Cria `TB_REQ_DELETE_LOG` para auditoria de exclusões de requisições |
| `embalagem/fix_requisicoes_hora_solicitacao_inconsistente.sql` | Embalagem | Corrige registros onde a solicitação ficou maior que a conclusão por drift de fuso |
| `shared/create_tb_config_calendario_produtivo.sql` | Shared | Cria `TB_CONFIG_CALENDARIO_PRODUTIVO` para definir dias/horários úteis usados no lead time |
| `shared/create_permissoes_tables.sql` | Shared | Cria `SHR_NIVEIS_USUARIO` + `SHR_PERMISSOES_MENU` e seed dos cargos (adm, gerente_estoque, …) |
| `shared/migrate_cad_usuario_nivel_to_varchar.sql` | Shared | **Obrigatório:** converte `CAD_USUARIO.NIVEL` de INT → VARCHAR (senão cargos texto dão erro de conversão) |
