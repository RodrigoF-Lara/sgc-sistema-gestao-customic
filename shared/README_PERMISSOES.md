# Módulo de Permissões (SGC) — Cargos + Setor

## Modelo

```
CAD_USUARIO.NIVEL (texto)  =  codigo do cargo  ex: gerente_estoque
CAD_USUARIO.SETOR          =  setor            ex: ESTOQUE
         │
         ▼
 SHR_NIVEIS_USUARIO
   codigo | label                  | setor
   adm    | ADM                    | NULL
   gerente_estoque | GERENTE (estoque) | ESTOQUE
         │
         ▼
 SHR_PERMISSOES_MENU (link_id × codigo × permitido)
```

### Cargos seed (estoque)

| Código | Exibição |
|--------|----------|
| `adm` | ADM *(protegido, acesso total)* |
| `gerente_estoque` | GERENTE (estoque) |
| `coordenador_estoque` | COORDENADOR (estoque) |
| `supervisor_estoque` | SUPERVISOR (estoque) |
| `lider_estoque` | LIDER (estoque) |
| `analista_estoque` | ANALISTA (estoque) |
| `assistente_estoque` | ASSISTENTE (estoque) |
| `auxiliar_estoque` | AUXILIAR (estoque) |
| `estagio_estoque` | ESTÁGIO (estoque) |

### Migração dos números antigos

| Antigo | Novo |
|--------|------|
| 1 | `adm` |
| 2 | `gerente_estoque` |
| 3 | `assistente_estoque` |
| 4 | `auxiliar_estoque` |

## APIs (importante para o Vercel Hobby)

O plano **Hobby limita a 12 Serverless Functions**. O projeto já usa 12 arquivos em `api/`,
então cargos e matriz **não** têm endpoint próprio — entram em `config.js`:

| Uso | URL |
|-----|-----|
| Listar/CRUD cargos | `GET/POST /api/shared/config?tipo=niveis` |
| Matriz / minhas / catálogo | `GET/POST /api/shared/config?tipo=permissoes&action=...` |

Lógica em `lib/niveisApi.js`, `lib/permissoesApi.js`, `lib/permissoesHelper.js`, `lib/menuCatalog.js`
(fora de `api/` → não contam como function).

## Deploy

1. Rode no SQL Server:

```text
sql/shared/create_permissoes_tables.sql
```

Isso:
- converte `CAD_USUARIO.NIVEL` de INT → VARCHAR (se ainda for numérico)
- cria/atualiza cargos
- faz seed da matriz para cargos de estoque

2. Deploy do código.

3. **Todos os usuários precisam fazer login de novo** (para gravar o cargo no `localStorage`).

4. Como ADM, revise a matriz em **Configurações → Permissões**.

## Novos setores (ex.: produção)

1. Em **Cargos**, crie por exemplo:
   - código: `gerente_producao`
   - nome: `GERENTE (produção)`
   - setor: `PRODUCAO`
2. Na matriz, marque o que esse cargo pode acessar.
3. No cadastro de usuário, selecione o cargo (setor preenche sozinho).

## Regras

- **ADM** (`adm`, e legado `1`) → acesso total
- **Default negado** sem linha na matriz
- **Home** sempre livre
- Código do cargo: só `a-z`, `0-9`, `_` (sem acento)
