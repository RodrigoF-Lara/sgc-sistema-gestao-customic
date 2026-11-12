// Cartucho tuck-end simplificado, em milímetros, medidas internas.
// A espessura não entra no desenho: a compensação de vinco ainda não foi validada.
// Não é faca de produção.

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

export function facaCartucho(comprimento, largura, altura) {
  const L = numero(comprimento);
  const W = numero(largura);
  const H = numero(altura);
  if (![L, W, H].every((n) => Number.isFinite(n) && n >= 10 && n <= 2000)) {
    return { erro: "Medidas inválidas. Use milímetros entre 10 e 2000." };
  }

  const cola = arred(clamp(W * 0.45, 12, 25));
  const tuck = arred(clamp(Math.min(W * 0.8, H * 0.9), 12, Math.max(12, W)));
  const poeira = arred(Math.max(8, Math.min(tuck - 2, W * 0.5 - 1)));
  const inset = 1.5;
  const x1 = cola;
  const x2 = arred(cola + L);
  const x3 = arred(cola + L + W);
  const x4 = arred(cola + L + W + L);
  const x5 = arred(cola + 2 * L + 2 * W);
  const y1 = tuck;
  const y2 = arred(tuck + H);
  const y3 = arred(H + 2 * tuck);

  const corte = [
    [arred(4), arred(y1 + 6)],
    [0, arred(y1 + 12)],
    [0, arred(y2 - 12)],
    [arred(4), arred(y2 - 6)],
    [x1, y2],
    [x1, y3],
    [x2, y3],
    [x2, y2],
    [arred(x2 + inset), y2],
    [arred(x2 + inset), arred(y2 + poeira)],
    [arred(x3 - inset), arred(y2 + poeira)],
    [arred(x3 - inset), y2],
    [x3, y2],
    [x4, y2],
    [arred(x4 + inset), y2],
    [arred(x4 + inset), arred(y2 + poeira)],
    [arred(x5 - inset), arred(y2 + poeira)],
    [arred(x5 - inset), y2],
    [x5, y2],
    [x5, y1],
    [arred(x5 - inset), y1],
    [arred(x5 - inset), arred(y1 - poeira)],
    [arred(x4 + inset), arred(y1 - poeira)],
    [arred(x4 + inset), y1],
    [x4, y1],
    [x3, y1],
    [arred(x3 - inset), y1],
    [arred(x3 - inset), arred(y1 - poeira)],
    [arred(x2 + inset), arred(y1 - poeira)],
    [arred(x2 + inset), y1],
    [x2, y1],
    [x2, 0],
    [x1, 0],
    [x1, y1],
  ];

  const vincos = [
    [x1, y1, x1, y2],
    [x2, y1, x2, y2],
    [x3, y1, x3, y2],
    [x4, y1, x4, y2],
    [x1, y1, x2, y1],
    [x1, y2, x2, y2],
    [arred(x2 + inset), y1, arred(x3 - inset), y1],
    [arred(x2 + inset), y2, arred(x3 - inset), y2],
    [arred(x4 + inset), y1, arred(x5 - inset), y1],
    [arred(x4 + inset), y2, arred(x5 - inset), y2],
  ];

  return {
    folhaLargura: x5,
    folhaAltura: y3,
    cola,
    tuck,
    poeira,
    corte,
    vincos,
    colaPontos: [
      [x1, y1],
      [arred(4), arred(y1 + 6)],
      [0, arred(y1 + 12)],
      [0, arred(y2 - 12)],
      [arred(4), arred(y2 - 6)],
      [x1, y2],
    ],
    paineis: [
      { nome: "Cola", x: 0, y: y1, largura: x1, altura: arred(y2 - y1) },
      { nome: "Frente", x: x1, y: y1, largura: L, altura: H },
      { nome: "Lateral", x: x2, y: y1, largura: W, altura: H },
      { nome: "Verso", x: x3, y: y1, largura: L, altura: H },
      { nome: "Lateral", x: x4, y: y1, largura: W, altura: H },
    ],
  };
}
