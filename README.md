# SGC — Sistema de Gestão Customic

Plataforma web modular para gestão industrial da Customic.

| | |
|---|---|
| **Status** | Módulo Embalagem em produção • Módulo Produção em desenvolvimento |
| **Stack** | Vanilla JS/HTML/CSS · Node.js Serverless (Vercel) · SQL Server |
| **Deploy** | https://sgc-customic.vercel.app — auto-deploy via push em `main` |

## Para começar

- Visão arquitetural completa → [ARCHITECTURE.md](ARCHITECTURE.md)
- Instruções para o agente de IA → [.github/copilot-instructions.md](.github/copilot-instructions.md)
- Módulo Embalagem → [modules/embalagem/README.md](modules/embalagem/README.md)
- Módulo Produção (roadmap) → [modules/producao/README.md](modules/producao/README.md)
- Recursos compartilhados → [shared/README.md](shared/README.md)
- Scripts SQL → [sql/README.md](sql/README.md)

## Rodar localmente

```powershell
npm install
vercel dev    # ou: npm run dev (se script existir)
```

Variáveis de ambiente (Vercel ou `.env`): credenciais SQL Server (`DB_USER`, `DB_PASS`,
`DB_HOST`, `DB_NAME`).

## Estrutura

```
shared/      código transversal (frontend, cadastros, config)
modules/     features por módulo de negócio (embalagem, producao)
api/         handlers serverless por escopo (shared/, embalagem/)
sql/         scripts DDL/DML por escopo (shared/, embalagem/)
db.js        pool SQL importado por todas as APIs
```

> **Política de documentação:** toda mudança que afete estrutura, endpoints, tabelas,
> fluxos ou navegação deve atualizar a documentação no MESMO commit.
> Documentação desatualizada é tratada como bug.
