/**
 * La fenêtre est-elle devant l'utilisateur, ou absente de l'écran ?
 *
 * Question simple, réponse à deux voix. Le moteur web signale `visibilitychange`
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
 */

/** Ce qui peut déclarer la fenêtre absente de l'écran. */
export type SourceEtat = 'navigateur' | 'natif';

const _masquee = new Set<SourceEtat>();
const _abonnes = new Set<(masquee: boolean) => void>();
let _branche = false;

/** La fenêtre est-elle hors de vue, au sens d'au moins une source ? */
export function fenetreMasquee(): boolean {
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
  const avant = fenetreMasquee();

  if (masquee) {
    _masquee.add(source);
  } else {
    _masquee.delete(source);
    // Le natif fait foi : s'il voit la fenêtre, elle est vue.
    if (source === 'natif') _masquee.delete('navigateur');
  }

  const apres = fenetreMasquee();
  if (avant !== apres) _abonnes.forEach((fn) => fn(apres));
}

/**
 * S'abonne au passage de la fenêtre hors de vue et à son retour.
 *
 * L'abonné est appelé tout de suite avec l'état courant : l'application peut
 * avoir été lancée réduite, ou démarrée avec la session.
 */
export function surEtatFenetre(fn: (masquee: boolean) => void): () => void {
  brancher();
  _abonnes.add(fn);
  fn(fenetreMasquee());
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
