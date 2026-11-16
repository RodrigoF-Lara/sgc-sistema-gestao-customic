// Envio pelo Microsoft Graph, só pela caixa autorizada do SGC.
// Credenciais: MS_GRAPH_TENANT_ID, MS_GRAPH_CLIENT_ID, MS_GRAPH_CLIENT_SECRET.
// Destino do aviso de orçamento: ORCAMENTO_EMAIL_DIRETOR (um ou mais, separados por vírgula).

const REMETENTE = "sgc@customicpulz.onmicrosoft.com";
const ESCOPO = "https://graph.microsoft.com/.default";
const ENVIAR = `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(REMETENTE)}/sendMail`;
const BASE_PUBLICA = "https://sgc-customic.vercel.app";

let tokenCache = { valor: "", expira: 0 };

function credenciais() {
  const tenant = String(process.env.MS_GRAPH_TENANT_ID || "").trim();
  const client = String(process.env.MS_GRAPH_CLIENT_ID || "").trim();
  const secret = String(process.env.MS_GRAPH_CLIENT_SECRET || "").trim();
  if (!tenant || !client || !secret) return null;
  return { tenant, client, secret };
}

function destinatariosDiretor() {
  return String(process.env.ORCAMENTO_EMAIL_DIRETOR || "")
    .split(/[;,]/)
    .map((item) => item.trim())
    .filter((item) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(item));
}

function escapar(valor) {
  return String(valor ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function moeda(valor) {
  const n = Number(valor);
  if (!Number.isFinite(n)) return "R$ 0,00";
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function quantidade(valor) {
  const n = Number(valor);
  if (!Number.isFinite(n)) return "";
  return n.toLocaleString("pt-BR", { maximumFractionDigits: 4 });
}

function basePublica() {
  return String(process.env.SGC_PUBLIC_URL || BASE_PUBLICA).trim().replace(/\/$/, "") || BASE_PUBLICA;
}

function linkOrcamento(id) {
  return `${basePublica()}/modules/embalagem/orcamentos/orcamentos.html?id=${encodeURIComponent(id)}`;
}

async function tokenDeAcesso() {
  const agora = Date.now();
  if (tokenCache.valor && tokenCache.expira > agora + 60000) return tokenCache.valor;
  const { tenant, client, secret } = credenciais();
  const corpo = new URLSearchParams({
    client_id: client,
    client_secret: secret,
    scope: ESCOPO,
    grant_type: "client_credentials",
  });
  const res = await fetch(`https://login.microsoftonline.com/${encodeURIComponent(tenant)}/oauth2/v2.0/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: corpo,
    signal: AbortSignal.timeout(20000),
  });
  const dados = await res.json().catch(() => ({}));
  if (!res.ok || !dados.access_token) {
    tokenCache = { valor: "", expira: 0 };
    const codigo = dados.error || res.status;
    console.error("Token do Microsoft Graph recusado.", codigo);
    throw new Error("A Microsoft não autorizou o envio.");
  }
  const segundos = Number(dados.expires_in) || 3600;
  tokenCache = { valor: dados.access_token, expira: Date.now() + segundos * 1000 };
  return dados.access_token;
}

async function postar(token, destinatarios, assunto, html) {
  return fetch(ENVIAR, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      message: {
        subject: String(assunto || "").slice(0, 200),
        body: { contentType: "HTML", content: html },
        toRecipients: destinatarios.map((address) => ({ emailAddress: { address } })),
      },
      saveToSentItems: true,
    }),
    signal: AbortSignal.timeout(20000),
  });
}

async function enviar(destinatarios, assunto, html) {
  let token = await tokenDeAcesso();
  let res = await postar(token, destinatarios, assunto, html);
  if (res.status === 401) {
    tokenCache = { valor: "", expira: 0 };
    token = await tokenDeAcesso();
    res = await postar(token, destinatarios, assunto, html);
  }
  if (res.status === 202 || res.status === 200) return;
  const dados = await res.json().catch(() => ({}));
  const codigo = (dados.error && dados.error.code) || res.status;
  console.error("Envio pelo Microsoft Graph recusado.", codigo);
  throw new Error("A Microsoft recusou o envio do aviso.");
}

function htmlOrcamento(orcamento) {
  const link = linkOrcamento(orcamento.id);
  const itens = Array.isArray(orcamento.itens) ? orcamento.itens : [];
  const linhas = itens.slice(0, 8).map((item) => (
    `<tr>
      <td style="padding:6px 8px;border-bottom:1px solid #e0e0e0">${escapar(item.codigo)}</td>
      <td style="padding:6px 8px;border-bottom:1px solid #e0e0e0">${escapar(item.descricao || "")}</td>
      <td style="padding:6px 8px;border-bottom:1px solid #e0e0e0;text-align:right">${escapar(quantidade(item.quantidade))}</td>
      <td style="padding:6px 8px;border-bottom:1px solid #e0e0e0;text-align:right">${escapar(moeda(item.valorTotal))}</td>
    </tr>`
  )).join("");
  const resto = itens.length > 8 ? `<p>E mais ${itens.length - 8} produto(s) na tela.</p>` : "";
  const obs = String(orcamento.observacao || "").trim().slice(0, 800);
  const fornecedor = orcamento.razaoSocial
    ? `${orcamento.razaoSocial} (${orcamento.codFornecedor})`
    : String(orcamento.codFornecedor || "");
  return `<div style="font-family:Segoe UI,Arial,sans-serif;color:#1a253c;font-size:15px;line-height:1.45">
    <p>Há um orçamento novo aguardando a sua aprovação.</p>
    <p><strong>Número:</strong> ${escapar(orcamento.numero || orcamento.id)}<br>
    <strong>Fornecedor:</strong> ${escapar(fornecedor)}<br>
    <strong>Valor:</strong> ${escapar(moeda(orcamento.valorTotal))}<br>
    <strong>Prazo após a aprovação:</strong> ${escapar(orcamento.prazoDias == null ? "" : orcamento.prazoDias + " dias")}<br>
    <strong>Registrado por:</strong> ${escapar(orcamento.criadoPor || "")}</p>
    ${linhas ? `<table style="border-collapse:collapse;width:100%;max-width:640px" cellpadding="0" cellspacing="0">
      <tr style="background:#1a253c;color:#fff">
        <th style="padding:6px 8px;text-align:left">Produto</th>
        <th style="padding:6px 8px;text-align:left">Descrição</th>
        <th style="padding:6px 8px;text-align:right">Qtd.</th>
        <th style="padding:6px 8px;text-align:right">Total</th>
      </tr>
      ${linhas}
    </table>` : ""}
    ${resto}
    ${obs ? `<p><strong>Observação:</strong> ${escapar(obs)}</p>` : ""}
    <p><a href="${escapar(link)}">Abrir o orçamento no SGC</a></p>
  </div>`;
}

export async function avisarDiretorOrcamento(orcamento) {
  const destinatarios = destinatariosDiretor();
  if (!destinatarios.length) {
    return { enviado: false, motivo: "O e-mail do diretor ainda não está configurado." };
  }
  if (!credenciais()) {
    return { enviado: false, motivo: "As credenciais da Microsoft ainda não estão configuradas." };
  }
  const numero = orcamento.numero || orcamento.id;
  try {
    await enviar(
      destinatarios,
      `Orçamento ${numero} aguardando aprovação`,
      htmlOrcamento(orcamento),
    );
    return { enviado: true };
  } catch (err) {
    console.error("Aviso de orçamento ao diretor falhou.", err && err.message);
    return { enviado: false, motivo: "O aviso ao diretor não saiu." };
  }
}
