/**
 * Nombres, tailles et dates dans la langue de l'interface.
 *
 * Tout passe par `Intl` : les unités (« Go » en français, « GB » en anglais), le
 * séparateur décimal et le format des dates suivent la langue choisie, sans une
 * lettre écrite à la main. Cinq copies d'un formateur de taille vivaient dans
 * l'application, chacune avec ses unités en dur — deux en français, trois en
 * anglais, affichées quelle que soit la langue.
 *
 * Les formateurs sont gardés par langue : en créer un à chaque rendu d'une
 * liste de cent jeux coûterait pour rien.
 */

const MO = 1024 ** 2;
const GO = 1024 ** 3;
const TO = 1024 ** 4;

type Unite = 'megabyte' | 'gigabyte' | 'terabyte';

const formateurs = new Map<string, Intl.NumberFormat>();

function formateur(cle: string, creer: () => Intl.NumberFormat): Intl.NumberFormat {
  let f = formateurs.get(cle);
  if (!f) {
    f = creer();
    formateurs.set(cle, f);
  }
  return f;
}

function unite(langue: string, u: Unite, decimales: number): Intl.NumberFormat {
  return formateur(
    `${langue}|${u}|${decimales}`,
    () =>
      new Intl.NumberFormat(langue, {
        style: 'unit',
        unit: u,
        unitDisplay: 'short',
        minimumFractionDigits: decimales,
        maximumFractionDigits: decimales,
      }),
  );
}

/**
 * Taille lisible d'un jeu ou d'un disque.
 *
 * Le téraoctet évite « 1863,0 Go », un nombre qu'on relit deux fois. La
 * décimale disparaît au-delà de cent gigaoctets, où elle ne dit plus rien
 * d'utile.
 */
export function formaterTaille(octets: number, langue: string): string {
  if (octets >= TO) return unite(langue, 'terabyte', 1).format(octets / TO);
  if (octets >= GO) {
    const go = octets / GO;
    return unite(langue, 'gigabyte', go >= 100 ? 0 : 1).format(go);
  }
  return unite(langue, 'megabyte', 0).format(octets / MO);
}

/**
 * Durée parlée : « 47 min », « 1 h 12 min ».
 *
 * Pour un total — la durée d'un dossier de musique, par exemple. « 72:14 » se
 * lit comme une piste très longue avant de se lire comme une heure et douze
 * minutes.
 */
export function formaterDuree(secondes: number, langue: string): string {
  const total = Math.max(0, Math.round(secondes / 60));
  const heures = Math.floor(total / 60);
  const minutes = total % 60;

  const enMinutes = uniteSimple(langue, 'minute');
  if (heures === 0) return enMinutes.format(minutes);

  const enHeures = uniteSimple(langue, 'hour');
  return minutes === 0
    ? enHeures.format(heures)
    : `${enHeures.format(heures)} ${enMinutes.format(minutes)}`;
}

function uniteSimple(langue: string, u: 'hour' | 'minute'): Intl.NumberFormat {
  return formateur(
    `${langue}|${u}`,
    () =>
      new Intl.NumberFormat(langue, {
        style: 'unit',
        unit: u,
        unitDisplay: 'short',
        maximumFractionDigits: 0,
      }),
  );
}

/** Nombre à décimales fixes, avec le séparateur décimal de la langue. */
export function formaterNombre(valeur: number, langue: string, decimales: number): string {
  return formateur(
    `${langue}|nombre|${decimales}`,
    () =>
      new Intl.NumberFormat(langue, {
        minimumFractionDigits: decimales,
        maximumFractionDigits: decimales,
      }),
  ).format(valeur);
}

const dates = new Map<string, Intl.DateTimeFormat>();

/** Date au format moyen de la langue. */
export function formaterDate(date: Date, langue: string): string {
  let f = dates.get(langue);
  if (!f) {
    f = new Intl.DateTimeFormat(langue, { dateStyle: 'medium' });
    dates.set(langue, f);
  }
  return f.format(date);
}
