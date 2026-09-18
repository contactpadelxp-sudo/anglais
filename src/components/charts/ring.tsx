"use client";

/* ===================================================================
   L'anneau du mois

   C'est l'objet principal de l'app : la répartition des revenus du
   mois, en grand, avec le montant dans son creux. On lit « combien »
   et « d'où ça vient » en un seul arrêt du regard.

   Trois choses qu'il ne fait pas, et c'est délibéré :

   — Pas d'info-bulle, pas d'atténuation au survol. Sur iPhone il n'y a
     pas de survol : tout ce qui compte est écrit dans la légende.
   — Pas de <text> dans le SVG. Le dessin est donc fluide (viewBox +
     largeur à 100 %) sans qu'aucun glyphe ne se déforme ; le contenu
     du creux est du HTML superposé.
   — Pas de chiffres tabulaires sur le montant du creux : à cette
     taille, `tabular-nums` fait flotter les chiffres étroits. C'est la
     règle que portait `Hero`, dont ce creux a pris la place.
   — Pas de tri par montant. La teinte suit l'activité, et l'ordre
     suit celui des activités — sinon la roue pivoterait à chaque
     changement de mois et ne s'accorderait plus au calendrier posé
     juste dessous.
   =================================================================== */

export type RingSlice = {
  id: string;
  label: string;
  value: number;
  color: string;
};

/** Repère du SVG. Tout le reste en dérive. */
const BOX = 316;
const C = BOX / 2;
const R_OUT = 156;
const THICK = 36;
const R_IN = R_OUT - THICK;
const R_MID = (R_OUT + R_IN) / 2;

/**
 * Écart entre deux parts : les 2 px de la règle maison, traduits en
 * angle au rayon médian. Une constante en radians vaudrait 2 px à un
 * seul diamètre et n'importe quoi ailleurs.
 */
const GAP = 2 / R_MID;

/**
 * Balayage minimal d'une part visible, dérivé de l'écart plutôt que
 * posé à la main : l'arc RENDU vaut le balayage moins un demi-écart de
 * chaque côté, donc à deux fois l'écart il reste exactement la largeur
 * d'un écart — visible, et jamais inversé.
 */
const MIN_SWEEP = 2 * GAP;

function polar(r: number, angle: number) {
  const a = angle - Math.PI / 2;
  return { x: C + r * Math.cos(a), y: C + r * Math.sin(a) };
}

function ring(from: number, to: number) {
  const large = to - from > Math.PI ? 1 : 0;
  const o1 = polar(R_OUT, from);
  const o2 = polar(R_OUT, to);
  const i1 = polar(R_IN, to);
  const i2 = polar(R_IN, from);
  return (
    `M${o1.x},${o1.y}` +
    `A${R_OUT},${R_OUT} 0 ${large} 1 ${o2.x},${o2.y}` +
    `L${i1.x},${i1.y}` +
    `A${R_IN},${R_IN} 0 ${large} 0 ${i2.x},${i2.y}Z`
  );
}

/**
 * Répartit 2π entre les parts, en garantissant à chacune un balayage
 * visible. Ce qu'on donne aux miettes est repris à la plus grosse part
 * — une seule fois, donc jamais en cascade.
 */
function sweeps(values: number[]): number[] {
  const total = values.reduce((s, v) => s + v, 0);
  if (total <= 0) return values.map(() => 0);

  const raw = values.map((v) => (v / total) * Math.PI * 2);
  let dette = 0;
  const ajuste = raw.map((a) => {
    if (a > 0 && a < MIN_SWEEP) {
      dette += MIN_SWEEP - a;
      return MIN_SWEEP;
    }
    return a;
  });
  if (dette > 0) {
    let plusGros = 0;
    for (let i = 1; i < ajuste.length; i += 1)
      if (ajuste[i] > ajuste[plusGros]) plusGros = i;
    ajuste[plusGros] = Math.max(MIN_SWEEP, ajuste[plusGros] - dette);
  }
  return ajuste;
}

export function MonthRing({
  slices,
  children,
}: {
  slices: RingSlice[];
  /** Le contenu du creux : montant, libellé, variation. */
  children: React.ReactNode;
}) {
  const positive = slices.filter((s) => s.value > 0);
  const angles = sweeps(positive.map((s) => s.value));

  // Décalages cumulés calculés d'avance : le rendu ne fait que lire.
  const offsets = angles.reduce<number[]>(
    (acc, a) => [...acc, acc[acc.length - 1] + a],
    [0],
  );

  return (
    /* L'échelle du creux vient du CSS, pas d'une mesure JS : le texte se
       dimensionne en unités de CONTENEUR, exactement comme le SVG se
       dimensionne par son viewBox. Mesurer côté client obligeait le
       serveur à deviner une largeur, et le creux sautait d'une taille à
       l'autre à l'hydratation partout sauf à 390 px. */
    <div
      className="relative mx-auto w-full"
      style={{ maxWidth: 360, containerType: "inline-size" }}
    >
      <svg
        viewBox={`0 0 ${BOX} ${BOX}`}
        className="block h-auto w-full"
        role="img"
        aria-label={
          positive.length > 0
            ? `Répartition du mois : ${positive.map((s) => s.label).join(", ")}`
            : "Aucun revenu ce mois-ci"
        }
      >
        {positive.length === 0 ? (
          // Mois vide : l'anneau garde sa place et sa taille. Un cercle
          // en pointillés à 36 px d'épaisseur serait illisible.
          <circle
            cx={C}
            cy={C}
            r={R_MID}
            fill="none"
            // --surface-2 vaut 1,10:1 sur la carte et --grid 1,24:1 :
            // ni l'un ni l'autre ne se voit. --axis monte à 1,75:1, ce
            // qui suffit ici parce que le creux écrit déjà « 0,00 € » —
            // l'anneau gris ne porte pas le sens tout seul.
            stroke="var(--axis)"
            strokeWidth={THICK}
          />
        ) : positive.length === 1 ? (
          // Une seule part : un cercle stroké. Un arc dont les deux
          // extrémités coïncident ne dessine rien du tout — la
          // spécification SVG omet le segment.
          <circle
            cx={C}
            cy={C}
            r={R_MID}
            fill="none"
            stroke={positive[0].color}
            strokeWidth={THICK}
          />
        ) : (
          positive.map((slice, i) => {
            const from = offsets[i] + GAP / 2;
            const to = Math.max(from + 0.004, offsets[i + 1] - GAP / 2);
            return (
              <path key={slice.id} d={ring(from, to)} fill={slice.color} />
            );
          })
        )}
      </svg>

      {/* Le creux. Sa boîte vaut 208 px sur les 316 du repère, donc
          65,8 % — exprimée en pourcentage, elle suit le dessin quelle
          que soit la largeur réelle. */}
      <div
        className="absolute left-1/2 top-1/2 flex -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-[0.3em] text-center"
        // En PIXELS, jamais en rem : le dessin ne dépend que du viewBox,
        // donc le texte ne doit pas dépendre en plus de la taille de
        // police racine du navigateur — sinon les deux se désaccordent
        // chez qui a agrandi les caractères du système.
        // 16 px quand le conteneur fait 316 px, soit 5,063 % de sa
        // largeur — la même proportion que le viewBox, à toute taille.
        style={{ width: "65.8%", fontSize: "5.063cqw" }}
      >
        {children}
      </div>
    </div>
  );
}

/**
 * Taille du montant au centre, choisie sur le nombre de CHIFFRES de la
 * partie entière et non sur la longueur de la chaîne : « 1 234 € » et
 * « 1 234,56 € » occupent la même largeur de chiffres, seule la queue
 * change. Mesures faites dans la police réellement servie.
 */
export function amountSize(cents: number): number {
  const digits = String(Math.abs(Math.trunc(cents / 100))).length;
  const negatif = cents < 0;

  /*
   * Tailles MESURÉES dans la police réellement servie, au pire mélange
   * de chiffres (les zéros sont les plus larges de Geist), contre le
   * budget réel de la boîte du creux : 65,8 % de 316 = 207,9 px, moins
   * 4 % de garde, soit 199,6 px.
   *
   *   chiffres   positif            négatif
   *   ≤ 4        37 → 192,2 px      34 → 190,8 px
   *   5          32 → 186,9 px      29 → 181,5 px
   *   ≥ 6        29 → 188,0 px      26 → 179,4 px
   *
   * Le signe compte : il ajoute un glyphe que « nombre de chiffres »
   * ne voit pas, et « -88 888,88 € » débordait à 32 px.
   */
  if (digits <= 4) return negatif ? 34 : 37;
  if (digits === 5) return negatif ? 29 : 32;
  return negatif ? 26 : 29;
}
