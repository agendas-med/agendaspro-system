// Força de senha (0 a 4) e requisitos mínimos de cadastro.
export const MIN_PASSWORD_LENGTH = 8;

export function passwordStrength(password) {
  const value = typeof password === "string" ? password : "";
  const checks = {
    length: value.length >= MIN_PASSWORD_LENGTH,
    lower: /[a-z]/.test(value),
    upper: /[A-Z]/.test(value),
    number: /\d/.test(value),
    symbol: /[^A-Za-z0-9]/.test(value),
  };
  let score = 0;
  if (checks.length) {
    score = 1;
    const variety = [checks.lower, checks.upper, checks.number, checks.symbol].filter(Boolean).length;
    if (variety >= 2) score = 2;
    if (variety >= 3) score = 3;
    if (variety >= 4 && value.length >= 10) score = 4;
  }
  const labels = ["Muito fraca", "Fraca", "Razoável", "Boa", "Forte"];
  return { score, label: labels[score], checks, acceptable: score >= 2 };
}
