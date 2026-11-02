<div align="center">

# Cassini

**Tous tes jeux, sur toutes tes plateformes, dans une galaxie que tu traverses.**

[![CI](https://github.com/ap7816/Cassini/actions/workflows/ci.yml/badge.svg)](https://github.com/ap7816/Cassini/actions/workflows/ci.yml)
[![Licence MIT](https://img.shields.io/badge/licence-MIT-blue.svg)](LICENSE)
[![Tauri v2](https://img.shields.io/badge/Tauri-v2-24C8DB.svg)](https://tauri.app)
[![Windows](https://img.shields.io/badge/Windows-10%20%7C%2011-0078D6.svg)](#installation)

![La galaxie de Cassini](docs/images/galaxie.png)

</div>

---

Cassini trouve les jeux installés sur une machine Windows — Steam, Epic, Battle.net,
Ubisoft, Riot, Rockstar, GOG, Xbox, HoYoPlay — et les range dans **une galaxie en
trois dimensions**. Chaque launcher devient un système solaire, chaque jeu une
planète dont la taille suit son poids sur le disque et dont la surface porte son
affiche. Changer de launcher, c'est voyager : la caméra quitte un soleil et rejoint
l'autre en trois à six secondes selon la distance.

C'est une application de bureau native, pas un site web : **Tauri v2** pour la
fenêtre et le côté Rust, **React** et **three.js** pour ce qui s'affiche dedans.

![Voyage d'un système à l'autre](docs/images/voyage.gif)

---

## Ce qu'elle fait

**Elle trouve les jeux toute seule.** Neuf launchers, chacun avec sa méthode : les
fichiers `.acf` de Steam, les manifestes d'Epic, la base de Battle.net, le registre
Windows pour les autres. Un surveillant de fichiers repère les installations et les
désinstallations sans qu'on relance quoi que ce soit.

**Elle montre les jaquettes.** Pour Steam, l'URL du CDN se calcule depuis l'AppID —
toujours disponible, même quand le jeu est désinstallé. Ailleurs, SteamGridDB prend
le relais si l'on fournit une clé, et l'icône de l'exécutable sert de dernier
recours. Rien n'est embarqué dans l'application : tout arrive à l'exécution et reste
sur la machine.

**Elle lance et désinstalle.** Lancer passe par le protocole du launcher quand il en
a un. Désinstaller cherche le désinstalleur dans le registre, et **nomme le
programme qui va s'ouvrir** quand ce n'est pas celui du jeu — une précaution qui
vient d'un vrai incident, où désinstaller un jeu Epic retirait le launcher Epic.

**Elle fait aussi lecteur de musique.** MP3, FLAC, WAV, OGG, M4A, Opus ; scan
récursif, pochettes cherchées chez iTunes, égaliseur, visualiseur, et un mini-lecteur
qui suit d'une page à l'autre. Une musique d'ambiance accompagne la galaxie, et
s'efface quand on écoute la sienne.

**Et elle vit.** Aurores, tempêtes, étoiles filantes, comètes, supernovas, trous
noirs — le ciel bouge, avec sa propre musique, et tout se coupe depuis les réglages.

<table>
<tr>
<td width="50%"><img src="docs/images/fiche-jeu.png" alt="La fiche d'un jeu"></td>
<td width="50%"><img src="docs/images/bibliotheque.png" alt="La bibliothèque en grille"></td>
</tr>
<tr>
<td align="center"><em>La fiche d'un jeu, ouverte sur sa planète</em></td>
<td align="center"><em>La bibliothèque, pour qui préfère une grille</em></td>
</tr>
<tr>
<td width="50%"><img src="docs/images/reglages.png" alt="Les réglages"></td>
<td width="50%"><img src="docs/images/lecteur-musique.png" alt="Le lecteur de musique"></td>
</tr>
<tr>
<td align="center"><em>Les réglages, onglet Graphisme</em></td>
<td align="center"><em>Le lecteur de musique</em></td>
</tr>
</table>

---

## Installation

Windows 10 ou 11. L'installeur se télécharge depuis
[**ArcHive-updates**](https://github.com/ap7816/ArcHive-updates/releases/latest) —
l'application se met à jour toute seule ensuite.

---

## Développement

**Prérequis :** Node.js LTS, Rust (rustup), et Visual Studio Build Tools 2022 avec
« Desktop development with C++ », MSVC v143 et le SDK Windows. WebView2 est déjà là
sur Windows 10 et 11.

Depuis « Developer PowerShell for VS 2022 » :

```bash
git clone https://github.com/ap7816/Cassini.git
```

```bash
cd Cassini; npm install; npm run tauri dev
```

| Commande                                | Ce qu'elle fait                                       |
| --------------------------------------- | ----------------------------------------------------- |
| `npm run tauri dev`                     | L'application complète, en développement              |
| `npm run dev`                           | Le front seul, dans un navigateur — sans le côté Rust |
| `npm run tauri build`                   | L'installeur de release                               |
| `npm test`                              | Les tests TypeScript                                  |
| `npm run test:rapport`                  | Les tests unitaires et un rapport HTML                |
| `npm run test:e2e`                      | Les parcours filmés                                   |
| `npm run captures`                      | Refabrique les images de ce README                    |
| `npm run typecheck` · `lint` · `format` | Types, lint, mise en forme                            |

---

## Tests

**261 cas**, en trois suites, toutes jouées par la
[CI](.github/workflows/ci.yml) à chaque poussée.

| Suite                     | Cas | Ce qu'elle tient                                                                               |
| ------------------------- | --- | ---------------------------------------------------------------------------------------------- |
| **TypeScript** (Vitest)   | 204 | Fusion des bibliothèques, stockage, traductions, géométrie des orbites, trajectoires de caméra |
| **Rust** (cargo)          | 50  | Scans de launchers, lecture du registre, choix du désinstalleur, extraction d'icônes           |
| **Parcours** (Playwright) | 7   | L'application ouverte et traversée, de bout en bout                                            |

Les parcours **laissent une vidéo et des captures de chaque cas**. Ils ne comparent
aucun pixel : un rendu 3D change avec la carte graphique, et un test qui échouerait
pour cette raison-là ne dirait rien d'utile. Les films servent à regarder, pas à
juger. La CI les garde en artefact téléchargeable, y compris quand tout passe.

`npm run test:rapport:tout` réunit les trois suites dans une page HTML : l'échec en
premier, sa pile débarrassée du bruit, la comparaison avec l'exécution précédente,
et les vidéos repliées en bas de chaque cas.

---

## Comment c'est fait

```
src/
  pages/SolarSystem/   la galaxie — scène three.js, orbites, trajectoires, textures
  features/            bibliothèque, musique, réglages, succès, événements du ciel
  services/            pont vers Tauri, et repli navigateur pour le développement
src-tauri/src/
  *_scan.rs            un fichier par launcher
  uninstall.rs         le choix du désinstalleur, et ses garde-fous
  security.rs          ce que le front a le droit de demander au système
e2e/                   les parcours filmés
scripts/               le rapport de tests, les captures du README
```

Le front ne touche jamais au système directement : il passe par des commandes Tauri,
et `security.rs` décide ce qui est permis. Un chemin de musique est confiné à une
racine choisie par l'utilisateur ; une désinstallation est refusée si l'entrée du
registre désigne autre chose que le jeu demandé.

Hors de Tauri — `npm run dev` —, le même code lit `localStorage` au lieu du magasin
natif. C'est ce qui permet aux parcours Playwright d'ouvrir une vraie galaxie dans un
navigateur, avec une bibliothèque semée.

---

## Publier une version

1. Monter le numéro dans `package.json`, `src-tauri/tauri.conf.json` et
   `src-tauri/Cargo.toml` — c'est le deuxième qui fait foi pour la mise à jour
   automatique
2. Écrire les notes dans `src/features/patchNotes/changelog.ts`, en français et en
   anglais
3. Commit, puis `git tag vX.Y.Z && git push origin vX.Y.Z`

GitHub Actions construit l'installeur, le signe, et publie le manifeste sur
`ArcHive-updates`, d'où les copies installées se mettent à jour. Compter vingt
minutes.

> Le dépôt de mises à jour garde son ancien nom : son adresse est gravée dans chaque
> copie déjà installée. Le renommer priverait toute la base installée de mises à jour,
> et sans message.

---

## Licence

Code sous [licence MIT](LICENSE). Les musiques et les images ont leurs propres
conditions, rassemblées dans [CREDITS.md](CREDITS.md).
