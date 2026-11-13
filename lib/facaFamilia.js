// Famílias de estudo. Não são faca de produção.
// Cartucho e microondulado usam a mesma faca. Bandeja e envelope têm desenho próprio.
// O milímetro por vinco vazio ou zero não muda a folha.

import { facaCartucho, lerMmVinco, marcasRegistro } from "./facaCartucho.js";

export const FAMILIAS = ["CARTUCHO", "BANDEJA", "ENVELOPE", "MICROONDULADO"];

function numero(valor) {
  if (typeof valor === "number") return valor;
  const texto = String(valor ?? "").trim().replace(/\s/g, "").replace(",", ".");
  return Number(texto);
}

function arred(n) {
  return Math.round(n * 100) / 100;
}

function clamp(n, min, max) {
  return Math.min(max, Math.max(min, n));
}

function lerSangria(valor) {
  if (valor == null || String(valor).trim() === "") return { valor: 0 };
  const n = numero(valor);
  if (!Number.isFinite(n)) return { erro: "Sangria inválida." };
  const v = arred(n);
  if (v < 0 || v > 25) return { erro: "A sangria de estudo fica entre 0 e 25 mm." };
  return { valor: v };
}

function medidasInternas(comprimento, largura, altura) {
  const L = numero(comprimento);
  const W = numero(largura);
  const H = numero(altura);
  if (![L, W, H].every((n) => Number.isFinite(n) && n >= 10 && n <= 2000)) {
    return { erro: "Medidas inválidas. Use milímetros entre 10 e 2000." };
  }
  return { L, W, H };
}

function facaBandeja(comprimento, largura, altura, sangria, compensacao) {
  const medidas = medidasInternas(comprimento, largura, altura);
  if (medidas.erro) return medidas;
  const faixa = lerSangria(sangria);
  if (faixa.erro) return faixa;
  const mmLido = lerMmVinco(compensacao);
  if (mmLido.erro) return mmLido;
  const { L, W, H } = medidas;
  const mm = mmLido.valor;
  const x1 = arred(H + mm);
  const x2 = arred(x1 + L + mm);
  const x3 = arred(x2 + H);
  const y1 = arred(H + mm);
  const y2 = arred(y1 + W + mm);
  const y3 = arred(y2 + H);
  const estudo = marcasRegistro(x3, y3, faixa.valor);
  return {
    familia: "BANDEJA",
    compensacao: mm,
    folhaLargura: x3,
    folhaAltura: y3,
    cola: 0,
    tuck: 0,
    poeira: 0,
    sangria: estudo.sangria,
    sangriaCaixa: estudo.sangriaCaixa,
    marcas: estudo.marcas,
    corte: [
      [x1, 0], [x2, 0], [x2, y1], [x3, y1], [x3, y2], [x2, y2],
      [x2, y3], [x1, y3], [x1, y2], [0, y2], [0, y1], [x1, y1],
    ],
    vincos: [
      [x1, y1, x2, y1],
      [x1, y2, x2, y2],
      [x1, y1, x1, y2],
      [x2, y1, x2, y2],
    ],
    colaPontos: [],
    paineis: [
      { nome: "Parede", x: x1, y: 0, largura: arred(x2 - x1), altura: y1 },
      { nome: "Parede", x: 0, y: y1, largura: x1, altura: arred(y2 - y1) },
      { nome: "Base", x: x1, y: y1, largura: arred(x2 - x1), altura: arred(y2 - y1) },
      { nome: "Parede", x: x2, y: y1, largura: arred(x3 - x2), altura: arred(y2 - y1) },
      { nome: "Parede", x: x1, y: y2, largura: arred(x2 - x1), altura: arred(y3 - y2) },
    ],
    rotuloEstudo: "BANDEJA DE ESTUDO. SEM ABA DE COLA. NAO E FACA DE PRODUCAO. UNIDADE: MM.",
  };
}

function facaEnvelope(comprimento, largura, altura, sangria, compensacao) {
  const medidas = medidasInternas(comprimento, largura, altura);
  if (medidas.erro) return medidas;
  const faixa = lerSangria(sangria);
  if (faixa.erro) return faixa;
  const mmLido = lerMmVinco(compensacao);
  if (mmLido.erro) return mmLido;
  const { L, W, H } = medidas;
  const mm = mmLido.valor;
  const aba = arred(Math.max(W, 12) + mm);
  const lapela = arred(clamp(H * 0.5, 18, 70) + mm);
  const x1 = aba;
  const x2 = arred(aba + L);
  const x3 = arred(x2 + aba);
  const y1 = lapela;
  const y2 = arred(lapela + H);
  const meio = arred((x1 + x2) / 2);
  const estudo = marcasRegistro(x3, y2, faixa.valor);
  return {
    familia: "ENVELOPE",
    compensacao: mm,
    folhaLargura: x3,
    folhaAltura: y2,
    cola: aba,
    tuck: lapela,
    poeira: 0,
    sangria: estudo.sangria,
    sangriaCaixa: estudo.sangriaCaixa,
    marcas: estudo.marcas,
    corte: [
      [0, y1], [x1, y1], [meio, 0], [x2, y1], [x3, y1],
      [x3, y2], [x2, y2], [x1, y2], [0, y2],
    ],
    vincos: [
      [x1, y1, x1, y2],
      [x2, y1, x2, y2],
      [x1, y1, x2, y1],
    ],
    colaPontos: [
      [x1, y1],
      [0, y1],
      [0, y2],
      [x1, y2],
    ],
    paineis: [
      { nome: "Lapela", x: x1, y: 0, largura: L, altura: y1 },
      { nome: "Cola", x: 0, y: y1, largura: x1, altura: H },
      { nome: "Frente", x: x1, y: y1, largura: L, altura: H },
      { nome: "Aba", x: x2, y: y1, largura: aba, altura: H },
    ],
    rotuloEstudo: "ENVELOPE DE ESTUDO. NAO E FACA DE PRODUCAO. UNIDADE: MM.",
  };
}

export function facaEstudo(familia, comprimento, largura, altura, sangria, compensacao) {
  const fam = String(familia || "CARTUCHO").trim().toUpperCase();
  if (!FAMILIAS.includes(fam)) return { erro: "Família inválida." };
  if (fam === "BANDEJA") return facaBandeja(comprimento, largura, altura, sangria, compensacao);
  if (fam === "ENVELOPE") return facaEnvelope(comprimento, largura, altura, sangria, compensacao);
  const desenho = facaCartucho(comprimento, largura, altura, sangria, compensacao);
  if (desenho.erro || fam === "CARTUCHO") return desenho;
  desenho.familia = "MICROONDULADO";
  desenho.rotuloEstudo = "MICROONDULADO DE ESTUDO. USA A FACA DO CARTUCHO. NAO E FACA DE PRODUCAO. UNIDADE: MM.";
  return desenho;
}
