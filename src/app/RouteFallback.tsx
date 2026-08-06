import css from './RouteFallback.module.css';

/**
 * Affiché le temps qu'une route chargée à la demande arrive.
 *
 * Volontairement minimal : sur un chargement local le chunk arrive en quelques
 * dizaines de millisecondes, un écran de chargement élaboré ne ferait que
 * clignoter. L'animation démarre en retard (voir le CSS) pour ne rien montrer
 * du tout quand le chunk est déjà en cache.
 */
export function RouteFallback() {
  return (
    <div className={css.wrap} role="status" aria-live="polite">
      <span className={css.spinner} aria-hidden="true" />
    </div>
  );
}
