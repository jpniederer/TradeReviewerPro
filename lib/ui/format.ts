export function money(value: number, digits = 0) {
  return new Intl.NumberFormat("en-US", {
    style: "currency", currency: "USD", maximumFractionDigits: digits,
  }).format(value);
}

export function percent(value: number | null) {
  if (value === null) return "Not enough data";
  return `${value >= 0 ? "+" : ""}${value.toFixed(1)}%`;
}

export function friendlyDate(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short", day: "numeric", year: "numeric", timeZone: "UTC",
  }).format(new Date(`${value}T00:00:00Z`));
}

export function scoreTone(score: number) {
  if (score >= 75) return "high";
  if (score >= 58) return "mid";
  return "low";
}
