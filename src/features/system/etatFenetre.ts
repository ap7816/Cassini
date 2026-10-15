/**
 * La fenêtre est-elle devant l'utilisateur, ou derrière le reste ?
 *
 * Question simple, réponse à trois voix. Le moteur web signale `visibilitychange`
 * quand il croit la page occultée, mais il ne le fait pas toujours à la
 * réduction — cela dépend de la version de WebView2 et de la façon dont Windows
 * masque la fenêtre. Et le côté natif, lui, connaît l'état réel : réduite dans
 * la barre des tâches, ou repliée dans la zone de notification.
 *
 * Les deux voix sont donc écoutées, et leurs avis s'additionnent : la fenêtre
 * est réputée masquée dès que l'une le dit. Interroger une seule source revenait
 * à la croire sur parole, et c'est ce qui laissait l'ambiance jouer dans le vide
 * — l'état natif « pas réduite » d'une fenêtre repliée dans la zone de
 * notification relançait la musique juste après que la visibilité l'eut coupée.
 *
 * Seule exception, dans l'autre sens : quand le natif affirme la fenêtre visible
 * — elle vient de reprendre le focus —, l'avis du moteur web est levé avec le
 * sien. Certains hôtes disent la page masquée alors qu'elle est bien à l'écran,
 * et sans cela l'ambiance ne reviendrait jamais.
 *
 * La troisième voix est le **focus**, et c'est elle qui manquait. Une fenêtre
 * recouverte par une autre application n'est ni réduite ni occultée : le moteur
 * web la dit visible, le natif aussi, et ils ont raison tous les deux. Elle
 * n'est simplement plus devant. Sans cette voix, la musique continuait de jouer
 * par-dessus ce qu'on était parti faire ailleurs — ce qui est précisément le
 * moment où l'on n'en veut pas.
 */

/** Ce qui peut déclarer la fenêtre absente du premier plan. */
export type SourceEtat = 'navigateur' | 'natif' | 'focus';

const _masquee = new Set<SourceEtat>();
const _abonnes = new Set<(masquee: boolean) => void>();
let _branche = false;

/** La fenêtre est-elle hors du premier plan, au sens d'au moins une source ? */
export function fenetreEnArrierePlan(): boolean {
  return _masquee.size > 0;
}

/**
 * Enregistre l'avis d'une source, et prévient les abonnés si le verdict change.
 *
 * Exportée pour les cas où l'application sait, avant tout événement, que la
 * fenêtre disparaît : elle se replie elle-même dans la zone de notification à
 * la fermeture.
 */
export function noterEtat(source: SourceEtat, masquee: boolean): void {
  const avant = fenetreEnArrierePlan();

  if (masquee) {
    _masquee.add(source);
  } else {
    _masquee.delete(source);
    // Le natif fait foi sur ce que le moteur web croit voir — mais pas sur le
    // focus, qui ne se devine pas : une fenêtre peut être à l'écran, entière,
    // et derrière celle d'une autre application.
    if (source === 'natif') _masquee.delete('navigateur');
  }

  const apres = fenetreEnArrierePlan();
  if (avant !== apres) _abonnes.forEach((fn) => fn(apres));
}

/**
 * S'abonne au passage de la fenêtre en arrière-plan et à son retour.
 *
 * L'abonné est appelé tout de suite avec l'état courant : l'application peut
 * avoir été lancée réduite, ou démarrée avec la session.
 */
export function surEtatFenetre(fn: (masquee: boolean) => void): () => void {
  brancher();
  _abonnes.add(fn);
  fn(fenetreEnArrierePlan());
  return () => {
    _abonnes.delete(fn);
  };
}

/**
 * Branche les deux sources, une seule fois pour toute la durée de vie de
 * l'application. Rien ne les débranche : elles ne coûtent qu'un écouteur, et
 * l'état de la fenêtre intéresse l'application tant qu'elle tourne.
 */
function brancher(): void {
  if (_branche) return;
  _branche = true;

  if (typeof document !== 'undefined') {
    const appliquer = () => noterEtat('navigateur', document.visibilityState === 'hidden');
    document.addEventListener('visibilitychange', appliquer);
    appliquer();
  }

  if (typeof window === 'undefined') return;

  // Le focus, lu à la source : `hasFocus` donne l'état de départ, les deux
  // événements donnent la suite. L'application peut très bien démarrer
  // derrière une autre fenêtre.
  window.addEventListener('blur', () => noterEtat('focus', true));
  window.addEventListener('focus', () => noterEtat('focus', false));
  if (typeof document !== 'undefined') noterEtat('focus', !document.hasFocus());

  if (!(window as unknown as Record<string, unknown>).__TAURI_INTERNALS__) return;

  void import('@tauri-apps/api/event').then(({ listen }) => {
    void listen<{ masquee: boolean }>('fenetre-plan', (e) => {
      noterEtat('natif', e.payload?.masquee === true);
    });
  });
}

/** Remet le module à zéro. Réservé aux tests. */
export function _reinitialiserEtatFenetre(): void {
  _masquee.clear();
  _abonnes.clear();
  _branche = true; // n'attache aucun écouteur pendant les tests
}
