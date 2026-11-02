# Crédits

Le code de Cassini est sous licence MIT (voir [LICENSE](LICENSE)). Les
ressources ci-dessous ont leurs propres conditions, et la licence MIT ne
s'y étend pas.

## Musiques d'ambiance

`public/ambiant1.mp3` à `public/ambiant4.mp3`, jouées au démarrage et en
fond de la galaxie.

| Fichier        | Origine                                                                                                  |
| -------------- | -------------------------------------------------------------------------------------------------------- |
| `ambiant1.mp3` | « Space Galaxy Universe Music » — viacheslavstarostin, [Pixabay](https://pixabay.com/music/) (ID 473849) |
| `ambiant2.mp3` | Pixabay — identifiant non conservé                                                                       |
| `ambiant3.mp3` | Pixabay — identifiant non conservé                                                                       |
| `ambiant4.mp3` | Pixabay — identifiant non conservé                                                                       |

La [licence Pixabay](https://pixabay.com/service/license-summary/) autorise
l'usage commercial et n'exige aucune attribution ; elle interdit la revente du
fichier audio seul, ce que Cassini ne fait pas. Les identifiants des trois
dernières pistes n'ont pas été relevés au téléchargement et les fichiers ne
portent pas de tag ID3 — l'origine est connue, la référence exacte non.

## Musique des événements du ciel

`src/features/evenements/pistes/souravdasix0ii-news-and-event-388018.mp3`,
jouée lors d'une supernova, d'une comète ou d'un trou noir. Pixabay
(ID 388018), même licence. Le dossier accepte d'autres morceaux : voir son
[LISEZMOI](src/features/evenements/pistes/LISEZMOI.md).

## Images de jeux

Cassini n'embarque aucune image de jeu. Elles sont récupérées à l'exécution :

- **Steam CDN** — calculé depuis l'AppID, sans clé
- **SteamGridDB** — clé fournie par l'utilisateur dans les réglages, facultative
- **iTunes Search API** — pochettes d'albums pour le lecteur de musique
- **Icônes Windows** — extraites de l'exécutable installé, en local

Ces images appartiennent à leurs éditeurs respectifs et ne sont ni
redistribuées ni mises en cache hors de la machine de l'utilisateur.

## Dépendances

Les bibliothèques tierces gardent leurs licences : voir `package.json` pour
le front (React, three.js, i18next) et `src-tauri/Cargo.toml` pour le côté
Rust (Tauri et ses greffons).
