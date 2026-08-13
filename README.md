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

## Rodar localmente (recomendado para testes rápidos)

### 1) Uma vez: login na Vercel e variáveis de ambiente

```powershell
cd C:\Users\ADM\Documents\Projetos\requisicoes
npm install
vercel login
npm run env:pull
```

Isso grava as credenciais do SQL em `.env.local` (não versionar).

### 2) Em todo dia de trabalho

```powershell
npm run local
```

> **Nota:** não use o nome de script `dev` com `vercel dev` (gera loop). O atalho do projeto é `npm run local`.

Abra **http://localhost:3000** e use o site com as mesmas APIs do ambiente Vercel.

### 3) Fluxo

1. Edite e teste em `localhost` (F5 no navegador).
2. Só depois de validar: commit + push em `main` (deploy no Vercel).

### Só frontend (sem API / login)

Se quiser apenas ver HTML/CSS/JS (menu, layout), sem chamar o banco:

```powershell
npx --yes serve . -l 3000
```

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
