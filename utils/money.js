// Dinheiro e taxas da API F2: sempre inteiros (centavos e bps). Só convertemos para texto na exibição.
// 1 bps = 0,01% (500 bps = 5%; 50 bps = 0,5%).

const BRL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

function isIntegerLike(value) {
  if (value == null || value === "") return false;
  const n = Number(value);
  return Number.isFinite(n) && Number.isInteger(n);
}

// 4990 -> "R$ 49,90". Valor ausente/inválido -> "—" (nunca "NaN" nem "R$ 0,00" enganoso).
export function formatCents(cents) {
  if (!isIntegerLike(cents)) return "—";
  const n = Number(cents);
  const abs = Math.abs(n);
  // Divisão inteira + resto evita erro de ponto flutuante em valores grandes.
  const text = BRL.format(Math.floor(abs / 100) + (abs % 100) / 100);
  return n < 0 ? `-${text}` : text;
}

// 500 -> "5%", 50 -> "0,5%", 125 -> "1,25%".
export function formatBps(bps) {
  if (!isIntegerLike(bps)) return "—";
  const n = Number(bps);
  const whole = Math.trunc(n / 100);
  const frac = Math.abs(n % 100);
  if (frac === 0) return `${whole}%`;
  const fracText = String(frac).padStart(2, "0").replace(/0$/, "");
  const sign = n < 0 && whole === 0 ? "-" : "";
  return `${sign}${whole},${fracText}%`;
}

// Calcula a comissão (centavos) a partir do bruto e da taxa, como o core (meio centavo para cima).
export function commissionOf(grossCents, bps) {
  if (!isIntegerLike(grossCents) || !isIntegerLike(bps)) return 0;
  return Math.floor((Number(grossCents) * Number(bps) + 5000) / 10000);
}
