# Identité visuelle

## Sources

| Fichier | Usage |
| --- | --- |
| `logo.svg` | La marque nue, sur fond sombre. Copiée dans `src/assets/` (sidebar, écran de démarrage) et dans `public/` (favicon web). |
| `app-icon.svg` | Source des icônes système : la marque sur une tuile sombre. |

Les deux sont volontairement séparés. Une marque claire seule disparaît sur
une barre des tâches Windows en thème clair ; la tuile garantit le contraste
quel que soit le thème, sans avoir à maintenir deux couleurs de marque.

## Régénérer les icônes

```bash
npx @tauri-apps/cli icon design/app-icon.svg
```

Le CLI accepte le SVG directement — inutile de passer par un PNG intermédiaire.
Il écrit dans `src-tauri/icons/`, y compris les variantes iOS et Android que ce
projet n'utilise pas mais qui sont suivies par git.

Après modification de `logo.svg`, penser à recopier le fichier :

```bash
cp design/logo.svg src/assets/logo.svg
cp design/logo.svg public/logo.svg
```

## Le dessin

Un C dont le contre-poinçon abrite un corps en orbite. La lettre porte le nom,
le point rappelle ce que l'application met en scène.

Géométrie : anneau extérieur r=28, intérieur r=16, ouverture 80° centrée sur
20°, point central r=8. Le centre est décalé de +1,5 en x — c'est le centrage
optique, la masse étant à gauche et l'ouverture à droite.

Deux formes pleines, aucun trait fin, aucun dégradé : la marque reste lisible
à 16 px.

## `legacy/`

L'ancien logo, conservé pour référence :

- `favicon.png` — sidebar (`src/assets/`)
- `favicon_logo.png` — écran de démarrage
- `favicon-public.png` — favicon web (`public/favicon.png`)

Les icônes Tauri dérivées ne sont pas dupliquées ici : elles restent
récupérables dans l'historique git, au commit `2475d6c` et avant.

```bash
git show 2475d6c:src-tauri/icons/icon.ico > icon-ancien.ico
```
