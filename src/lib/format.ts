/** Formatage — tout en français, montants stockés en centimes. */

const eur = new Intl.NumberFormat("fr-FR", {
  style: "currency",
  currency: "EUR",
  maximumFractionDigits: 0,
});

const eurPrecise = new Intl.NumberFormat("fr-FR", {
  style: "currency",
  currency: "EUR",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const plain = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 });

// Une décimale, mais seulement si elle n'est pas nulle : « 1,3 k€ »
// sans transformer « 5 k€ » en « 5,0 k€ ».
const oneDecimal = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 1 });

/** 128400 → « 1 284 € ». Les centimes ne sont affichés que si utiles. */
export function money(cents: number, opts: { precise?: boolean; sign?: boolean } = {}) {
  const precise = opts.precise ?? cents % 100 !== 0;
  const body = precise ? eurPrecise.format(cents / 100) : eur.format(cents / 100);
  if (opts.sign && cents > 0) return `+${body}`;
  return body;
}

/**
 * Version compacte pour les axes et les grandes valeurs : 12,9 k€.
 * La décimale est conservée — l'arrondir ferait afficher « 1 k€ » sur
 * une graduation qui vaut 1 250 €.
 */
export function moneyCompact(cents: number) {
  const v = cents / 100;
  const abs = Math.abs(v);
  if (abs >= 1_000_000) return `${oneDecimal.format(Math.round(v / 10_000) / 100)} M€`;
  if (abs >= 1_000) return `${oneDecimal.format(Math.round(v / 10) / 100)} k€`;
  return `${plain.format(Math.round(v))} €`;
}

/**
 * Le montant tel qu'il se tape sur net-entreprises : l'URSSAF ne veut
 * pas de centimes, elle arrondit à l'euro le plus proche. Afficher
 * « 1 240,37 € » en face d'une case qui n'accepte que des entiers
 * oblige à arrondir de tête — et c'est là qu'on se trompe.
 */
export function eurosArrondis(cents: number): number {
  return Math.round(cents / 100);
}

export function moneyArrondi(cents: number) {
  return eur.format(eurosArrondis(cents));
}

export function percent(ratio: number, digits = 0) {
  if (!Number.isFinite(ratio)) return "—";
  const n = (ratio * 100).toLocaleString("fr-FR", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
  // Espace fine insécable avant le signe : c'est la règle française, et
  // surtout le « % » ne part plus seul à la ligne suivante quand la
  // colonne est étroite — « Cotisations 12,80 » puis « % » en dessous.
  return `${n}\u202f%`;
}

export function signedPercent(ratio: number, digits = 0) {
  if (!Number.isFinite(ratio)) return "—";
  const s = percent(Math.abs(ratio), digits);
  // « −0 % » n'existe pas. Une variation qui s'arrondit à zéro se dit
  // « stable » : le signe annonçait une baisse que le chiffre dément.
  if (s === percent(0, digits)) return "stable";
  if (ratio > 0) return `+${s}`;
  if (ratio < 0) return `−${s}`;
  return s;
}

export function count(n: number) {
  return plain.format(n);
}

/** « 12 ventes » / « 1 vente » */
export function plural(n: number, one: string, many: string) {
  return `${plain.format(n)} ${n > 1 ? many : one}`;
}

/** Saisie utilisateur « 12,50 » ou « 12.50 » → 1250 centimes. */
export function parseMoney(input: string): number {
  const cleaned = input.replace(/\s|€/g, "").replace(",", ".");
  if (cleaned === "" || cleaned === "-") return 0;
  const n = Number(cleaned);
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100);
}

/** 1250 → « 12,50 » pour pré-remplir un champ de saisie. */
export function centsToInput(cents: number): string {
  if (!cents) return "";
  return (cents / 100).toFixed(2).replace(".", ",").replace(/,00$/, "");
}
