# Project notes

_En français : [notes.fr.md](notes.fr.md)_

Working notes for Cassini: how it is built, what is done, what is left. The
[README](README.md) is the short version for anyone arriving on the project.
This file is the long one.

Both language versions carry the same content. When you change one, change the
other, or say in the commit message which one is now ahead.

## Contents

- [What Cassini is](#what-cassini-is)
- [How it works](#how-it-works)
- [Feature status](#feature-status)
- [VS Code tasks](#vs-code-tasks)
- [Implementation notes](#implementation-notes)
- [Still to do](#still-to-do)

---

## What Cassini is

A Windows desktop app, built with Tauri v2 and React, that gathers every
installed game into one library. Instead of opening Steam, Epic, Battle.net,
Ubisoft Connect, Riot, Rockstar, Hytale, HoYoPlay and the Xbox app one after
another, Cassini scans them all and shows the result in a single place: either
as a list, or as a galaxy where each launcher is a solar system and each game a
planet.

---

## How it works

### Startup

Every launch scans the nine launchers in parallel through
`scannerTousLesLaunchers`. The scans start together, but the merge is
sequential: each platform applies on top of the previous result, otherwise the
last one would overwrite the others. Storage is only rewritten when the content
actually changed. The comparison uses an order insensitive fingerprint, without
which the galaxy would rebuild on every launch. Changes propagate live to the
list and the 3D scene through `subscribeGames`. The library itself lives in the
Tauri store (`archive.json`), with `localStorage` as a fallback outside Tauri.

### Launcher scanning (Rust side)

Each platform has its own Tauri command, called from the frontend:

| Command                | What it reads                                                       |
| ---------------------- | ------------------------------------------------------------------- |
| `scan_steam_games`     | The Windows registry and the `.acf` manifests of each Steam library |
| `scan_epic_games`      | The `.item` manifests in Epic's ProgramData folder                  |
| `scan_battlenet_games` | The registry, filtered on Blizzard as publisher                     |
| `scan_riot_games`      | League of Legends, Valorant and the rest                            |
| `scan_rockstar_games`  | GTA, RDR2 and others, through the Rockstar launcher                 |
| `scan_ubisoft_games`   | Ubisoft Connect                                                     |
| `scan_xbox_games`      | `XboxGames` folders plus the user's package inventory               |
| `scan_hoyoplay_games`  | HoYoPlay's registry inventory                                       |
| `scan_hytale_games`    | The Hytale launcher                                                 |

After a rescan, games that are no longer present are marked as not installed
rather than deleted.

### Deduplication

The same game can appear on several platforms, Overwatch on Steam and
Battle.net for instance. Cassini deduplicates on a normalised name and applies
a priority: Steam, then Epic, then Battle.net. User data such as favourite
status, last session and custom image is merged onto the surviving entry.

### Launching a game

Every game carries a `launchUrl`, either a protocol link like
`steam://rungameid/12345` or a path to an executable. Clicking Play asks the OS
to open it. The last session date is recorded automatically.

### Cover art

Resolution happens in cascade, per card:

1. **Custom image** (`customImageUrl`). Absolute priority, never replaced.
2. **Steam, by AppID.** The CDN URL is computed from the game id, so it needs no
   API key and stays available even when the game is uninstalled. On failure it
   falls back to the portrait format.
3. **SteamGridDB**, for everything else. The API key lives in the Windows
   credential manager and never passes through JavaScript: the frontend calls
   `fetch_sgdb_image(title)` and Rust fetches the key at the last moment.
   Results are cached in the store.

The service is called `coverArtService`. It was named `rawgService` back when it
queried RAWG.io, and a few filenames still carry that history.

### Search and filters

The global search bar filters by title as you type. The library has two tabs,
all games and favourites, plus filters by platform, install state and tag. The
current view and search live in the URL as query parameters.

### Launchers page

Lists the launchers detected on the machine, with a way to open each one or
reveal its install folder. Icons are extracted from the executable and cached.

### Music player

Plays MP3, FLAC, WAV, OGG, M4A and Opus. You pick a folder and Rust scans it
recursively. The last track and the volume are remembered.

The player is not a page any more. It opens as a layer over the solar system,
through `Ctrl+M` or the button at the foot of the launcher rail. Leaving the
view to change album meant losing what you were looking at. The layer is a
player and nothing else: cover, title, a progress bar, five controls, volume,
a search field, and two sections, what you just listened to and then everything
else, capped at eighty rows. Past that you search rather than scroll. No
metadata is read to build the list, because title and folder are enough to
choose from and reading them all would slow the opening for nothing.

The music page remains for what needs room and happens rarely: renaming, moving,
changing a cover, colouring a folder. A discreet link in the player leads there.

A small bar at the bottom left says what is playing: cover, title, track
controls, and a progress thread along the edge. Shuffle, repeat and volume used
to sit there too. They are in the player now, one click away on the cover.

### iTunes metadata

At startup the app looks up artist, album and cover art on iTunes for every
track. Results are kept in memory only. The search term is built as
`Artist - Title`, using the ID3 artist tag when there is one, and a match score
is computed in Rust (`word_recall`, threshold 0.7). Tracks without a good enough
match show nothing rather than the wrong cover.

### The heads-up display

There is no navigation sidebar any more. In the end only the solar system
should remain. What the sidebar carried moved to the four corners of the view:
the wordmark top left, the frame counter top right, the flight controls bottom
right, and what is playing bottom left. The first two align with the right hand
column and follow its width, which is adjustable.

Settings and music are two layers over the scene, `Ctrl+,` and `Ctrl+M`. They
never unmount the scene, which stays behind them. Both trap the tab key, return
focus where it started, and close on Escape or on a click outside.

The other pages, library and launchers, are hidden by default. Settings brings
them back one at a time, and their button then appears in the same place. They
are not removed, only taken off the shortest path.

### Windows integration

- **Launch at startup** writes a key under
  `HKCU\Software\Microsoft\Windows\CurrentVersion\Run`.
- **Run in background** turns the close button into a hide: the app goes to the
  system tray, a click on the icon brings it back, and the tray menu quits for
  real.

---

## Feature status

Partial means part of it works and part is missing. The detail is in
[Implementation notes](#implementation-notes).

### Library

| Feature                                          | Status                      |
| ------------------------------------------------ | --------------------------- |
| Automatic scanning, nine launchers               | Done                        |
| Deduplication across platforms                   | Done                        |
| Launch with animated overlay                     | Done                        |
| Last session per game                            | Done                        |
| Favourites                                       | Done                        |
| Covers: Steam CDN, SteamGridDB, custom           | Done                        |
| Cover cache in the store, with a way to clear it | Done                        |
| Real time search by title                        | Done                        |
| Tags, by hand, proposed or free                  | Done                        |
| Sort by name and recency                         | Done                        |
| Filter by platform, install state and tag        | Done                        |
| Size on disk                                     | Done                        |
| Add a game by picking an `.exe`                  | Code written, no button yet |
| Export and import the library as JSON            | Done                        |
| Sort by size or total playtime                   | To do                       |
| Per game notes                                   | To do                       |
| List view as an alternative to the grid          | To do                       |
| Playtime statistics and charts                   | To do                       |
| Cover cache with an expiry date                  | To do                       |

### Platforms

| Platform                                         | Status                 |
| ------------------------------------------------ | ---------------------- |
| Steam, Epic, Battle.net, Ubisoft, Riot, Rockstar | Done                   |
| Xbox and Microsoft Store, Game Pass included     | Done, except uninstall |
| HoYoverse: Genshin, Honkai, Zenless              | Done                   |
| Hytale                                           | Done                   |
| GOG Galaxy                                       | To do                  |

### Solar system

| Feature                                             | Status |
| --------------------------------------------------- | ------ |
| The galaxy as the home page                         | Done   |
| Planet size from disk usage, or from playtime       | Done   |
| Four families of planetary rings                    | Done   |
| Per planet customisation: size, distance, rings     | Done   |
| Custom solar systems, including tag driven ones     | Done   |
| Drag planets in edit mode                           | Done   |
| Adjustable width for the list and the launcher rail | Done   |
| Chosen opening system                               | Done   |
| Keyboard shortcuts                                  | Done   |
| Visible size difference for a very large game       | Done   |
| Fainter orbit rings seen from close up              | To do  |

### Sky

| Feature                                                 | Status |
| ------------------------------------------------------- | ------ |
| Random events: shooting star, flyby, storm, comet       | Done   |
| Supernova and black hole, the two large ones            | Done   |
| Events visible from any distance                        | Done   |
| One soundtrack per large event, with its own volume     | Done   |
| Turn sky events off without turning off the gas curtain | Done   |
| Achievements for seeing each event                      | Done   |
| Steam promo ship, news ship                             | To do  |
| Choose your own ambient music                           | To do  |

### Music player

| Feature                                          | Status |
| ------------------------------------------------ | ------ |
| Recursive folder scan                            | Done   |
| Collapsible folders, search, now playing bar     | Done   |
| Remembers last track and volume                  | Done   |
| Recently played, last ten tracks                 | Done   |
| Per folder colour, right click                   | Done   |
| Move a track from a right click menu             | Done   |
| Embedded ID3 cover art                           | Done   |
| iTunes enrichment, online covers for every track | Done   |
| Shuffle and repeat                               | Done   |
| Folder tree or large folder icons                | To do  |

### App

| Feature                                                  | Status |
| -------------------------------------------------------- | ------ |
| Automatic updates through GitHub Releases                | Done   |
| French and English                                       | Done   |
| Dark and light theme                                     | Done   |
| Custom accent colour and background image                | Done   |
| Launch at startup, run in background                     | Done   |
| Full reset                                               | Done   |
| Background scanning, live install state                  | Done   |
| Debug panel, absent from published builds                | Done   |
| Unit tests and filmed journeys                           | Done   |
| Accessibility: language, contrast, focus, reduced motion | Done   |
| Accessibility: comfort settings in the Settings panel    | To do  |
| Larger base font size                                    | To do  |
| Desktop notifications when a game finishes downloading   | To do  |

---

## VS Code tasks

`Ctrl+Shift+P` then **Run Task**, or `Ctrl+Shift+B` for the build. Tasks live in
`.vscode/tasks.json`, named `Category: what it does`. VS Code sorts the list
alphabetically, so the prefix is what groups them.

### Application

| Task                                              | What it does                                                                                                                                                                  |
| ------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **lancer en développement**                       | The whole app, Rust included, with hot reload. The everyday one.                                                                                                              |
| **lancer le front seul (navigateur)**             | Vite on `localhost:1420`, without the Rust side. Launcher scans fail and the galaxy is built from browser storage. Useful for interface work without waiting on a Rust build. |
| **construire un .exe d'essai (local, non signé)** | Produces an installer under `src-tauri/target/release/bundle/`, to try on your own machine.                                                                                   |

**Building a test `.exe` and publishing are not the same thing.** The build task
compiles locally and stops there. The file stays on your disk, and it is not
signed, because the private key only exists as a GitHub secret. The updater
checks signatures against the public key in `tauri.conf.json`, so a locally
built installer can never serve as an update. It answers one question: does the
installer work, and does the app start once installed.

Publishing is the other end of the chain. The task pushes a tag, GitHub Actions
compiles on its own machines, signs the result, and attaches the `.exe`, its
signature and the `latest.json` that installed copies read. That is the only
route that reaches a user.

### Tests

| Task                               | What it does                                                                                                                           |
| ---------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| **les 254 tests unitaires**        | TypeScript then Rust, 8 seconds. The default test task.                                                                                |
| **TypeScript seulement (204 cas)** | Library logic, storage, translations, orbit geometry.                                                                                  |
| **TypeScript en surveillance**     | Reruns affected tests on every save. Leave it running.                                                                                 |
| **Rust seulement (50 cas)**        | Scanners, registry, uninstaller matching, icon extraction.                                                                             |
| **parcours filmés (7 cas)**        | Playwright opens the app and walks through it. Leaves a video and screenshots per journey. 1 min 30.                                   |
| **interface Vitest**               | The tests in a browser, case by case. Open the address printed in the terminal: it carries a token, and without it the UI returns 403. |
| **interface Playwright**           | Replays a journey step by step, with the selector inspector. For writing a new one.                                                    |

### Reports

| Task                               | What it does                                                                                                           |
| ---------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| **les 261 tests, films compris**   | Runs all three suites, writes `rapport-tests.html` and opens it. 2 minutes.                                            |
| **rapide, sans rejouer les films** | Unit tests only, but the report still shows the last known videos. 8 seconds.                                          |
| **ouvrir le dossier des films**    | Opens `.rapports/e2e/artefacts`. The name starts with a dot, so File Explorer hides it until you turn hidden items on. |

### Quality

| Task                                     | What it does                                                                                                       |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| **tout vérifier avant de pousser**       | Types, lint, formatting, rustfmt and clippy. Exactly what CI runs, so passing here means passing there.            |
| **vérifier les types (TypeScript)**      | `tsc` without emitting files.                                                                                      |
| **chercher les défauts (ESLint)**        | Any warning fails the task, as on CI.                                                                              |
| **corriger ce qui peut l'être (ESLint)** | Applies automatic fixes. Modifies files.                                                                           |
| **remettre en forme (Prettier)**         | Rewrites the whole repo to the project format. Modifies files.                                                     |
| **clippy et rustfmt (Rust)**             | Same bar on the Rust side. CI pins the compiler to 1.92.0, so a Rust release cannot introduce new lints overnight. |

### Documentation and publishing

| Task                                    | What it does                                                                                                                                                  |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **refaire les captures du README**      | Opens the app, seeds twenty games, shoots six views and films the journey. The GIF needs a real ffmpeg: `FFMPEG=/path/to/ffmpeg` if yours is not on the PATH. |
| **publier la version aux utilisateurs** | Tags and pushes. See above. There is no going back: a repository rule forbids moving or deleting a tag once pushed, because the updater relies on it.         |

### Before publishing

1. Bump the version in `package.json`, `src-tauri/tauri.conf.json` and
   `src-tauri/Cargo.toml`.
2. Write the release notes in `src/features/patchNotes/changelog.ts`, in both
   languages.
3. Run **Qualité : tout vérifier avant de pousser**.
4. Run **Rapport : les 261 tests, films compris**.
5. Commit, push, then **Publication : publier la version aux utilisateurs**.

---

## Implementation notes

What follows records decisions that are not obvious from the code, and a few
dead ends worth not walking into twice.

### The galaxy

The nine launchers share one galaxy. Each system is built as the camera
approaches and released as it moves away. Planet size comes from size on disk,
or from playtime when that setting is on. Steam keeps playtime locally in
`userdata/<account>/config/localconfig.vdf`, which `steam_scan::temps_de_jeu`
reads without an API key. Systems without known playtime fall back to disk
usage, and a game never launched falls among the small ones.

About one planet in three has rings, drawn from four families modelled on the
real solar system: Saturn's wide divided sheet, Uranus's narrow and steeply
tilted ribbons, Jupiter's dust veil, and Neptune's arcs. What tells them apart
from a distance is relative width, opacity, tilt and whether they are complete.
A seed alone only changed the grain, and two rings looked the same as soon as
you stepped back.

The arcs had to be redone. They drew two to four isolated sectors, cut square,
with nothing to say they belonged to the same circle, so you saw shards
floating around the planet. A continuous veil now carries them, their ends fade
out through vertex alpha, and the draw is three to five sectors. The ring
texture also moved to mipmaps: its 1024 texels sometimes land in ten pixels, for
a narrow ring seen from far away or any ring seen edge on, and without reduced
levels the banding turned into crawling dots.

### Custom systems

The **+** button creates a system: name, icon among twelve, colour, and games
picked from the whole library. Edit opens a panel over the scene that acts
live: sun size, planet speed down to frozen, flat orbits, and per planet
distance, angle and size. You add and remove games, sort them in one go, and
delete the system from there. Nothing is saved before you press Save, and
Cancel restores the system as it was.

These changes only rebuild the system concerned. The galaxy and the camera stay
put. Only name and colour, which touch the label and the tints, rebuild the
scene. A system references its games without owning them: a game filed under
Favourites stays in its launcher and has a planet in both.

Launcher systems are customisable like the others, minus what belongs to the
library, so no name, icon or game list. Their settings are stored separately
and a setting returned to its default is not kept.

A system can also be driven by a tag. It takes every game carrying that tag and
updates itself when you tag another one, with no list to maintain.

Logic in `lib/customSystems.ts`, application to planets in
`scene/placements.ts`, both tested outside the browser.

### Dragging planets

While editing a system, a planet can be grabbed with the mouse and follows the
pointer. The radius is projected onto the plane of its own orbit, tilt included,
then converted back to distance and angle. The camera does not rotate during the
gesture, because the grab happens in the capture phase, before the controls. The
editor stays in charge of the draft: the scene reports the drag, the editor
turns it into a bounded placement like the ones the sliders produce, and opens
that planet's settings so you can watch them follow.

The arrows that moved a planet up or down one orbit are gone. Dragging places it
where you want rather than one step at a time.

### Sky events, visible from anywhere

The shooting star, the flyby, the supernova and the comet used to live at their
real place in the galaxy. That condemned them twice over: the camera's far plane
cut them off past twenty thousand units, and they shrank as you moved away. A
supernova on the far side of the galaxy existed for nobody.

Each one now keeps its real trajectory but only its direction is used, and it is
drawn on a sphere around the eye at `RAYON_CIEL` (2200). Same patch of sky, same
apparent size, nothing left to clip. Anything with extent follows the same rule:
the trail is built in angle rather than distance, the comet's tail is bounded in
fractions of the sky, and the direction given to them is the part of their course
perpendicular to the view, because something coming straight at you does not
cross the sky. Distance to the sun still comes from the real position, since
that is what sets the tail length.

`scene/ciel.test.ts` checks all four, from close up and from three times the far
plane. It is what caught the flyby being drawn at four million units, from a
scratch vector that was also being used as an output.

### Events fall anywhere

They used to be born in a cone around the view, for a good reason: a sixty
degree field out of three hundred and sixty is a one in six chance of being
seen, and a shooting star nobody sees is not a shooting star.

But a shooting star that always falls in front of you is not a sky, it is a
show. And once an achievement rewarded each event, that achievement was worth
nothing, because you could not miss them. The draw is now uniform over the whole
sphere through `randomDirection`, which favours no pole, where drawing latitude
and longitude independently piles points up at both ends of the axis. What
happens behind your back happens anyway, and is lost.

What remains of the old precaution: courses stay short. The trail and the flyby
draw their arrival around their departure rather than anywhere on the sphere,
otherwise they would cross the entire sky in one second for the first and forty
for the second.

### The black hole

The largest and rarest sky event. Once per session at most, and never in the
first twenty minutes. It touches nothing else.

**It arrives, it does not switch on.** Nine seconds to appear, a minute in
place, sixteen to leave. The departure is the longest of the three, because
leaving as fast as it arrived reads like a switch. It grows from a fifth of its
size to full, then shrinks, with size slightly ahead of brightness: you first
see something fairly large but dark, which then lights up. The reverse order
would look like an explosion. Each part has its own timing: the shadow and its
photon ring first, since they are the object, then the disc, by the time gas has
fallen and heated. On the way out, the same order reversed. The exit trails off
as a square root rather than dropping to zero, which gives the eye time to lose
it instead of watching it vanish.

Four parts, each with a reason to be there. **The horizon** is a sphere. It
lights nothing, its whole job is to write depth and therefore hide what passes
behind it. **The disc** is a real ring lying in a plane, randomly tilted each
time, turning faster on the inside than the outside. It is what gives the relief:
its far half disappears behind the sphere and comes out the other side. **The
photon ring** and **the corona** stay facing the eye, which is correct: light
that went around the object comes back out as a circle around the shadow from
any viewpoint. The corona only shows when the disc is seen at an angle, since
you need disc behind the shadow for there to be anything to lift.

It is **pinned to the sky**, high above the galaxy, around fifty degrees up, in
a direction chosen once and kept. Two earlier attempts say why. Placed at its
real spot in the galaxy, it was cut off by the far plane as soon as you moved
away. Mapped onto the sky sphere but aimed from a fixed point in the world, it
slid across the sky whenever you orbited a system, when it should sit there like
a star. A direction does not move for anyone. What you lose is being able to
approach it, but an object you can reach is not a sky event.

Its orientation is **chosen rather than random**: the disc normal is world up
brought perpendicular to that direction, then tilted about fifteen degrees. The
disc plane then contains the screen horizontal, so its ellipse lies flat, and the
tilt opens just enough to see the top. Random, it stood on edge half the time.
Flat and seen from below, it was only a target.

Two brightness traps, paid for in full. The values had been tuned **without the
bloom pass**, whose threshold is 0.85, so on screen the object was a white
blob. Large surfaces now stay under the threshold and keep their colour, and
only the photon ring is allowed to cross it. And additive blending already
multiplies colour by opacity, so supplying both meant painting squared.

**What was tried and removed**, so as not to walk back in the same way:

- **Swallowing systems one by one**, each star and planet taken in turn in a
  spiral. Thirty seconds of ceremony that held the scene hostage and moved
  everything in it, for something meant to be seen elsewhere.
- **Sucking in the screen itself** through an SVG filter on the shell. It does
  twist the whole app, buttons included, for about ten milliseconds a frame,
  provided the filter region hugs the shell (140 % margin: 36 ms; 104 %:
  13.3 ms, against 12.1 ms at rest). But its displacement map is eight bits, and
  that map decides everything: past roughly three pixels of offset between
  neighbouring levels, the image stops sliding and starts corrugating. Dithering
  the rounding turns the steps into grain and pushes the limit back without
  lifting it.
- Hence the split, **twist on one side, gather on the other**. A pixel that
  rotates stays at its distance from the hole and therefore on screen, while a
  pixel that slides fetches its colour from outside the window and empties the
  image from the edges before anything has been eaten. Twisting through the
  filter, gathering through a CSS transform whose origin is the point itself,
  because a filter cannot pull the whole image toward one place.
- Two coordinate traps: the destination has to be read in layout coordinates,
  the shell being itself in the middle of shrinking onto it, and the projection
  returns the mirrored point once the object passes behind the eye.

None of this is in the app. The black hole swallows nothing, and that is for the
best.

### The supernova

It used to be a bright point on a square facing the eye: a core, a halo, four
spikes, all drawn in screen pixels. Next to the black hole you saw a lamp and a
mass. An explosion is not a light in the distance. What you recognise is that
something **leaves**.

Three parts, and it is their order in time that makes the explosion. **The
flash** is the old square, core, halo and spikes, but it is no longer the whole
thing: it dominates the first second then fades faster than the rest, otherwise
the whole reads as a lamp surrounded by smoke. **The shock wave** is a swelling
sphere of which you only see the edge, because at the edge the line of sight
crosses the shell at a grazing angle and meets far more matter than in the
middle. That is why a remnant looks like a ring while being a sphere. **The
debris** is a second shell, slower, thicker, lumpier, because an explosion is
not clean and some clumps leave faster than others.

It grows as the fifth root of time squared, the Sedov and Taylor law for a blast
pushing the medium around it: very fast at first, slower and slower after. A
steady growth would give an inflating balloon. But that law alone saturates:
between two thirds and the end the radius only gains fifteen percent, which does
not read, and the last third became a large red circle sitting still waiting to
fade. A second term gives it speed back at the end, so it is still growing while
it fades, and that is how you **lose sight** of it rather than watch it stop.
`supernova.test.ts` holds the law: never shrinking, a quarter of its size at
three seconds, still gaining a third during its last third.

The brightness ramp took two attempts. Eight seconds gave a lamp being switched
on; one second was not seen arriving at all, with nothing in the previous frame
and everything in the next. Two and a half seconds, accelerating, lets you see
the thing **coming**. The plateau that follows is not physics, it is the time it
takes to turn your head.

**It goes off beside the view, not inside it.** Drawn like the others in a cone
around the view axis, half the time it landed right in front of the system you
were looking at, which you then could not see at all. Small events can afford
that, being thin and three seconds long. A twenty seven degree explosion lasting
a minute cannot. It now sits between twenty four and thirty two degrees off
axis, angled upward. The window is tight on both sides: closer and it covers the
system, further and it leaves the frame on a narrow window, and an event you
cannot see is not an event. `ciel.test.ts` checks this over twenty draws,
screen projection included. The frame offers about thirty degrees upward for a
sixty degree field, against forty or so sideways, so the room is to the side,
not above.

Two things learnt on screen. An opacity cap applied **before** the strength
flattened the top of the curve: the shell edge reached it everywhere, the tears
disappeared into the cap, and all that was left was a smooth ring. And noise
taken as is stays around its mean, so with both faces of the sphere averaging
together you got a soap bubble. Thresholded with `smoothstep` it makes holes,
and holes are how you see something tearing apart.

**And it leaves nothing behind.** A glow used to stay pinned to the sky until
the end of the session. That was fine when the supernova was a point. It is not
a point any more, so what remained was a large motionless red circle planted in
a corner of the sky forever. An explosion disperses. The duration followed, from
seventy seconds to fifty eight, with a sharper decay, since a dim motionless
half served nobody.

### Event music, and the switch that silences them

The switch is in the Graphics tab, under Living sky, since it is a scene
setting. The soundtracks are in the Ambience card of the Personalisation tab,
next to the background music and its volume, because they have no business
sitting among image settings.

**Sky events** is a switch of its own. It stops the draws, shooting star,
storm, comet, flyby, supernova and black hole, without touching the gas curtain,
which stays under Living sky. You may want a breathing sky without anything
crossing your view while you tidy your library. The debug panel can still
trigger them by hand.

**Music is set per event**: supernova, blue comet and black hole each have their
own, and only those three. Shooting stars come back every thirty seconds, and
music each time would stop being an announcement and become noise. It fades in
and out, stops with the event, and the ambience goes quiet meanwhile as it
already does for the player.

The bundled tracks live in `features/evenements/pistes/` and are collected at
build time by `import.meta.glob`, so dropping a file in is enough to add it, and
one is drawn at random per event. Users can also pick one from their own
machine: only the path is kept, the file stays where it is, and it goes through
Tauri's asset protocol, whose scope already covers `$HOME` and `$AUDIO`.

**Volume is also per event**, next to the track, like the ambience one. It is no
longer derived from the ambience volume halved, because this is not background
music and a setting derived from another always surprises somebody. The default
is exactly what the old calculation gave on a fresh install, so nothing changes
for anyone who changes nothing.

Two things learnt while fixing this: a native dialog that fails has to say so,
because swallowed in silence the button looked dead; and a `HEAD` probe on a
static file proves nothing in development, the dev server answering 200 with the
index page for any unknown path.

### Achievements

Seven, one per sky event, from the most common to the rarest. These are rare
things, a black hole shows up once every thirty hours spent in front of the
galaxy, and the only way to know you had seen them all was to remember.

**Seen, not occurred.** The event falls wherever it likes. It only counts if it
stayed **in the camera frustum** long enough to be seen, three seconds. One
frame used to be enough, which was far too little: moving fast, you unlocked the
achievement for an event that passed in a corner of the screen without being
noticed. The count accumulates rather than requiring continuity, because looking
away for a second and back is still watching. It is capped at two thirds of the
event's life, otherwise a one second shooting star would be impossible. And a
single frame cannot count for more than a quarter of a second, so an oversized
time step from a struggling machine or a backgrounded tab does not hand over the
achievement at once.

Look the other way and you miss it, and it will not come back. That is what
gives the rest its value, and it is why events are no longer born in front of the
view.

The hook sits at the display, not at the places that launch events. The reason
is dull and decisive: there are two paths per event, the random draw and the
debug panel, and hooking both means forgetting one. Reporting repeatedly costs
nothing, since the module returns false for an achievement already unlocked.
That is what lets the scene report what it shows without tracking what it has
already reported, and it is the first thing `succes.test.ts` checks.

The notification is mounted at app level rather than at the galaxy, because an
achievement can land while you are looking at it and should still be seen if you
have just left. It lasts seven seconds, against three or four for a toast: there
is a name and an explanation to read, and it happens seven times in the life of
an install.

**The chime is synthesised**, computed on the fly rather than read from a file.
A few hundred kilobytes for one second of sound heard seven times would be
expensive, and a computed note raises no licensing or loading question.

The first attempt, three triangles rising to 1320 Hz, was piercing and sounded
like a toy. What changed: a fifth lower, bells rather than triangles, meaning a
fundamental and two partials that decay faster than it, since that uneven decay
and nothing else is what makes timbre; a bass an octave under the phrase for
weight; a single echo at 140 ms, because a sound that stops dead reads as a bug;
and a six cent detuned double on the last note, whose slow beating makes it
shine. Measured on an offline render, the spectral centroid falls from 1867 to
626 Hz, an octave and a half lower, peaking at 0.46 without clipping.

The decay is a **time constant**, not a ramp to zero. An exponential ramp
towards a near zero target falls in a straight line to its target: measured, it
left nothing after three hundred milliseconds, and the long note stopped with the
others. A time constant always decays by the same proportion, which is how
everything that resonates dies away, and the tail now holds 1.9 s.

**A settings tab shows them**, unlocked and missing: the observation log, a
ship's log rather than a trophy list. Number, title, a guiding line, verdict.
Nothing is hidden, because the name of an observation says what there is to see,
and hiding it would not make a mystery, only a list of empty boxes. The gauge is
segmented, one block per observation, because a block lighting up means
something while a bar advancing fourteen percent does not.

**They survive the app**, and that was a hair's breadth from not being true.
Storage is only populated once `initStorage()` returns, and modules are
evaluated before the first line of `main.tsx`. Reading the list at module load
gave an empty set on every launch, losing yesterday's achievements, and the first
achievement of the day erased them for good by rewriting the list. It is now read
on first access, which comes from the scene or the interface and therefore much
later. `succes.test.ts` holds the guarantee by reloading the module before
writing to storage.

### The camera, from one system to the next

It used to move too fast, look in the wrong place, and arrive on a system seen
from above. Three separate decisions were at fault.

**The gaze went straight while the camera climbed.** That was the worst of the
three. The position followed an arc rising well above the disc, which is what
gives the journey its sense of pulling back, but the look at point was
interpolated in a straight line from one system centre to the next and never
rose. Halfway through, the camera was above a target left at the bottom, almost
directly below it: sixty three degrees of pitch, measured. You crossed the
galaxy looking at the floor.

The gaze now has its own arc. It rises almost as much as the camera, and the
small remaining difference is exactly what produces the downward tilt. More
importantly it leads: its control point is four fifths of the way along, so at
the midpoint it has covered 61 % of the route while the camera has covered half.
You fly over looking where you are going, and the destination enters the frame
well before you arrive. Measured result: the pitch never strays more than a
degree from the arrival framing across the whole trip. `flightPath.test.ts`
holds it.

**Arrival framing went from 48° to 30°** above the orbital plane. From high up
you were looking at a map: flat circles, every planet at the same apparent
distance. At thirty degrees the orbits become ellipses again, planets pass in
front of and behind their sun, and the system regains depth. Distance followed,
1.22 times the frame instead of 1.42, because at that elevation it is the width
of the system that drives the framing, and width does not change as you come
down, where apparent height does.

**Durations** went from 1.6 to 3.4 s up to 2.4 to 4.5 s, and later to 3.2 to 6 s.
The arc rises 30 % of the distance instead of 45.

**The easing** is quintic (`6t⁵ − 15t⁴ + 10t³`) throughout, instead of cubic.
Both its velocity and its acceleration are zero at each end, where the cubic only
zeroed velocity, and that is precisely what removes the small jolt at departure
and arrival, because the eye does not follow a position but a velocity, and a
velocity that appears all at once is visible.

### Keyboard speed followed the wrong system

Free movement is scaled to the framing rather than expressed in absolute units,
because a library of two hundred games spans thousands of units and one of three
spans a few dozen, and a fixed speed would be unusable in one case or the other.
But that framing was the one of the current system **at scene mount**, and
nothing updated it. You travelled to a larger or smaller launcher and the
keyboard speed stayed as it was, so you either crawled through a vast system or
crossed a small one in a single press.

Speed is now scaled to the **nearest** system, read every frame. That is a
different quantity from the **targeted** system, which drives travel duration and
must stay the destination's throughout, so the two carry two names. Label range
follows the same rule, for the same reason.

### Systems seen from very far away

Pulling back, planets released themselves, which is intended, suns held on for a
while, then went out one by one. You pulled back to take in the whole galaxy, and
the galaxy disappeared.

The cause was not apparent size. Markers already existed for that, one bright
point per sun at a fixed pixel size. It was the **camera far plane**, at twenty
thousand units, beyond which nothing is drawn. On a library of seven launchers,
the systems on the far side drop past it as soon as you step back, and their
marker with them, since it lived at their exact position.

Markers are therefore **mapped onto a sphere around the eye** when further than
twelve thousand units: same direction, so same place in the sky, at a distance
the camera can see. Below the threshold the marker stays exactly on its sun,
since that is what you aim at to travel there, and an offset landmark would lie.

**And they shrink with distance**, which the first version did not do. Their size
was fixed at twenty six pixels to save them from disappearing, which made seven
glowing balloons hanging in a field of fine stars as soon as you stepped back.
Ordinary attenuation would do the opposite and erase them. Hence a `1/d` falloff,
the one perspective gives, bounded at both ends: never larger than from close up,
never finer than a background star. Tuned on what you want to see rather than on a
formula: eight pixels at four thousand units, the floor past eleven thousand. In
other words, as soon as a system stops reading as a system, its marker is a star.

Size varies from one marker to another, which `PointsMaterial` cannot do, its
size being a uniform shared by the whole object. Hence about fifteen lines of
shader, which cost nothing since the galaxy has a handful of suns and it is still
a single draw call. One trap: `gl_PointSize` counts in device pixels, not CSS
pixels, so it has to be multiplied by the pixel ratio, which `PointsMaterial` was
doing behind our backs.

**And names go quiet at the same threshold.** From that far a system is only one
bright point among others. Its name has nothing left to label, and seven labels
floating in the void make a list, not a galaxy. Both changes share one threshold,
so there is only one thing to understand: below it, a system with its name; above
it, a star.

### Interface motion

Done without a library. One rule, and everything follows from it: nothing moves
at constant speed. An object that starts and stops dead does not exist, and the
eye knows it.

Framer Motion is not installed, and adding it would cost about fifty kilobytes
plus a JavaScript computation every frame, which is expensive for a button press
in an app that already runs a galaxy. The browser can do it alone now that
`linear()` accepts a list of points: you sample the real curve of a spring, the
solution of `m·x″ + c·x′ + k·x = 0` taken at thirty six points, and the engine
interpolates. Same motion, zero bytes, zero frames of computation, and it works
in a transition too.

Three springs, and their duration is however long they take to settle rather
than a round number. **100/15** for what appears, overshooting its target by
2.8 % before coming back, and that overshoot is what reads as organic rather than
slid. **320/30** for what you touch, almost without overshoot, because a button
that bounces under the finger looks broken. **180/26**, critically damped, for
what leaves and for colours.

**The cascade** offsets each element by a twentieth of a second from the
previous one: settings cards, observation log, game list, library grid, release
notes. The rank comes from CSS rather than JSX, and it is capped at the
eleventh. Without that cap, a forty game library would make the last thumbnail
wait two seconds, and a cascade you wait for is not a cascade.

**One CSS cascade difficulty, solved with two specificities.** `transition` is a
single property: whichever rule wins takes the whole list, and you cannot append
a line to it. Modules already declare their transitions with a class, so a rule
at zero specificity would have been overridden and hover would snap instead of
easing out. The transition declaration therefore sits above and takes over what
the modules were animating, checked before writing, the only two width
transitions in the repo being progress bars. The motion itself, on the other
hand, stays at zero specificity, because several components already have their
own gesture, the game card lifting its play button for instance, and overriding
them all with one 1.02 would have impoverished the interface rather than
polishing it.

One last detail that matters: turning animations off is not done with
`animation: none`, which would leave elements in their starting state, meaning
transparent. The duration is shortened to a thousandth of a millisecond instead.
Nothing moves, everything stays visible.

### Cover art and the network

Without wifi, covers did not load, which is expected. What was not: when the
network came back they did not return, even on a library refresh. You had to
restart the app.

The cause was one line. A load failure was recorded as _this game has no cover_,
in a set kept for the whole session. Offline, the entire library went in at once
and nobody asked for anything again. Worse for Steam games: the CDN address is
computed without network, the image failed for lack of network, the display
concluded Valve had no image, and the service **evicted a perfectly valid address
from the persistent cache**. One outage therefore cost covers until the next
launch.

Three fixes. On the native side, `sgdb_search_and_fetch` no longer conflates _the
provider answered and has nothing_ with _I could not reach it_: the first returns
`Ok(None)`, the second an error, where `.ok()?` used to flatten both into "nothing
found". In the service, only the first is remembered, and offline we do not even
ask. In the display, an image failing offline no longer triggers the fallback
chain that emptied the cache.

And when the network returns, everything restarts on its own: remembered failures
are forgotten, and each thumbnail carries the **network epoch** it was resolved
in. The epoch changes, the label no longer matches, the chain starts again.
Labelling rather than resetting inside an effect is the pattern the game card
already used for its id, and it avoids the cascading render this repo forbids.

**That leaves knowing there is no network, and this is where the first version
got it wrong.** It relied on `navigator.onLine`, which is right in a browser and
wrong in the app. WebView2 leaves it at `true` when you turn wifi off and emits no
`offline` event, so the app saw neither the outage nor the return, which was
exactly what we were trying to fix.

Two voices, then, as for window state and for the same reason. The web engine
answers fast and asks nobody, and serves in a plain browser. The native side
actually goes and looks: it queries the address Windows queries to light its own
"no internet" indicator, and the **content** of the response matters as much as
its status, since a captive portal answers 200 with its own page, which is very
much an absence of internet for anyone after a cover. The native side has the
last word.

The probe costs one round trip, twenty two bytes measured at 300 ms, so it
rations itself: every ten seconds when we believe we are cut off, since the
return must be noticed quickly; every thirty when all is well; never when the
window is not in front of the user; and immediately when a cover has just
failed. That last case is the surest signal of all, since we just tried and it
did not go through.

**A banner says so**, top centre, under the headers: "Offline, missing covers
will load when the network returns". It also announces what will happen, because
a warning that only states the problem leaves people looking for an action that
does not exist.

### The Graphics tab, arranged like a game menu

It used to carry four homemade settings, image sharpness on a 1 to 2 slider, sky
density on another, and two switches, none of which meant anything to anyone.
Graphics menus have a shared vocabulary, twenty years old and understood by
everyone: a preset, a render scale, a frame limit, and the detail for whoever
wants it.

**The preset first**, Low, Medium, High, Ultra, because it is the only thing
needed by someone who does not know what bloom is: they try Low and see whether
it runs better. It is **not stored**. It is derived from the values, which
removes the whole class of bugs where the label says High while the settings say
otherwise. Touching anything drops it to Custom on its own, which is the
convention again.

**Render scale** replaces sharpness and finally says what it does: the fraction
of the screen resolution the scene is drawn at, from 50 to 200 %. Above 100 % it
is supersampling. The old sharpness was a pixel density cap that changed nothing
at all on most screens, so existing installs start from 100 %, which is what they
already had. The internal cap at three is a safeguard: on a two pixel per point
screen, 200 % would ask for sixteen times the base resolution.

**The frame limit** is new, and it is the most useful setting in the list on a
laptop: past what you want, every frame is work nobody will see. It skips the
frame without touching the clock, so the scene advances by exactly what it should
when it is finally drawn. Worth knowing, and written in `cadence.ts`: skipping
frames can only produce submultiples of the screen rate, so 144 Hz limited to 60
gives 48. That is the price of regularity.

**The frame counter** becomes a setting rather than always being there. It was a
measurement tool left switched on for everybody.

Finally, what is not graphics left the card. Living sky and Sky events decide
what happens in the sky, not how it is drawn, so they have their own card,
Scene ambience.

### Decor music stops when the window is not in front. The player does not

The ambience already stopped when the window left the screen, but leaving the
screen only covered two cases: minimised to the taskbar, or folded into the tray.
A window **covered by another application** is neither. The web engine calls it
visible, the native side agrees, and both are right. It is simply not in front
any more.

`etatFenetre` therefore listens to a third voice, focus, and its verdict is no
longer "hidden" but "in the background". The native side keeps the last word on
what the web engine thinks it sees, but not on focus, which it does not know
about: a window can be on screen, whole, and behind another application's.

**Two pieces of music subscribe, not three.** The ambience from `AppLayout`, and
event music in its own module, each as close as possible to what it has to pause.
Neither was asked for by anyone: they accompany a galaxy you are looking at, and
you are not looking at it any more. Neither fades out on the way, because an
alt-tab has to cut immediately.

The player keeps going. It used to be subscribed like the other two, on the
grounds that you may want your music to stop when launching a game. But a track
you put on yourself is a decision, and stopping it decides on your behalf that
you no longer want it the moment you open another window. The rest of the app
already took this for granted: the tray menu carries play/pause and stop, and the
comment in `set_tray_music` says why, since minimised, that is the only place left
to silence the player. Two entries that commanded nothing, since playback had
already stopped by itself on minimising.

### Uninstalling an Epic game removed the Epic launcher

The install folder was treated as the surest sign, since two games can have
similar names but never the same folder. That was true, but the comparison also
accepted a folder that **contained** the game's, and a launcher is precisely what
installs above its games. The registry gives `C:\Program Files\Epic Games\` to
Epic Games Launcher, every Epic game sits inside it, and the match therefore
scored a hundred out of a hundred, the best possible score, ahead of the game's
own entry. Checked on the machine rather than deduced: both installed Epic games
resolved to the launcher's uninstaller, an `MsiExec /X{…}` that removes the
launcher and nothing else. Ubisoft Connect and HoYoPlay set the same trap.

Only the **same** folder counts now, up to separators and a trailing slash, since
the registry writes both forms. The other direction went with it: a folder
contained in the game's is a component installed beside the game, not the game.
Both existed only to catch a different name, which the exact name rule already
handles when it is sure.

Two further guards, because an irreversible action deserves to be held twice. A
**launcher can no longer answer for one of its games**: known launchers are
rejected at the door unless the launcher is what you asked to remove. And the
**confirmation names what is about to open** when it does not carry the game's
name. The uninstaller was being looked up before acting precisely so it could be
announced, the comment said so, and the sentence still used the game title. You
read "Uninstall Fortnite?" and it was the launcher that left.

An Epic game has no registry entry of its own, so the message now points to the
launcher that installed it, which is the only thing that knows how to remove it.

### Settings in dashboard vocabulary

The app already had its own language, `--hud` and its hairlines, corner
brackets, scanline texture, monospaced counters, all of it in `App.css`. The
settings shell used it; its contents did not. You opened a cockpit and found
buttons, pills and a white dropdown that could have come from any application.

What changed, and why. **Buttons** take the monospaced face, spaced capitals, the
texture behind them, and light up with a glow on hover instead of lightening
their background, because a dashboard button is engraved, not painted.
**Sliders** become graduated rules with a travelling handle, the native control
being exactly the same in every application in the world. **Card titles** carry
the segmented hairline of the panel header, running to the edge, since that line
more than the colour is what turns a title into an instrument label. **Colour
pills** become square plates, a channel selector rather than a paint palette.
**Fields and dropdowns** move onto dark glass.

Two things learnt. A styled `<select>` is still painted by Windows until you
remove its native appearance, and it had stayed white despite its colours, which
was the first thing the eye found in the panel; the chevron then becomes your
responsibility. And a monospaced face is a face for **numbers**: in a dropdown,
"Français" ended up clipped to "Franç". The split the rest of the app already
uses, Chakra Petch for words and Share Tech Mono for values, is the right one.

None of this invents a colour or a token. The same `--hud-*` in both themes, and
the light theme follows without a single extra line.

### Tags

Each game carries tags added by hand, from the solar system card as well as from
the library grid: six proposed tags and as many free ones as you like, twelve per
game at most, twenty four characters each. Proposed tags are stored under an id
and displayed translated, so changing language does not freeze an English label
in a French interface. Free tags stay as written. Duplicates ignore case.

These are user data: a scan never touches them, and two copies of the same game
on two launchers merge their tags at deduplication (`services/tags.ts`, tested
outside the browser).

Three uses. A tag filter in the library bar, with the count per tag, kept in the
URL. Filter chips under the solar system search, offering only the tags carried
by games in the displayed system. And a solar system driven by a tag, described
above.

### Dark and light theme

Settings, Personalisation, Theme: dark, light, or system, which follows Windows
live. The theme is set as `data-theme` on `<html>` before paint, and `App.css`
redefines the tokens there. Four tokens join the `--hud` family: ink for text and
highlights, ground for glass and panels, shadow for the halo behind text, and
veil over the background image, plus a vividness token for the share of a bright
colour in coloured text. The roughly 230 colours hardcoded in stylesheets were
converted to these tokens by a script, then reviewed by hand.

Space stays black in both themes, because it is the sky, not the interface.
Anything sitting on it without glass, the logo and the planet labels, carries a
class that restores the dark colours, and the veils under panels stay dark. In
light mode the default accent, an off white, takes the blue of the structure, and
an accent that is too light is darkened while keeping its hue until it reaches
the AA threshold. Contrast was measured screen by screen: all active text passes
4.5 in light mode.

### Xbox and Microsoft Store

Done, and without elevation, which was the announced difficulty since
`WindowsApps` stays unreadable. `xbox_scan.rs` crosses two sources: the
`XboxGames` folders on each drive, where each game carries a
`MicrosoftGame.Config` with package identity, display title and logos, plus an
`appxmanifest.xml` naming the application to launch; and the user's package
inventory in the registry, which gives the full package name. The family name is
derived from it, hence the target `shell:AppsFolder\<family>!<application>`,
checked against the shell and matching exactly what Windows expects.

This target form is neither a URL nor a path. It is validated character by
character, in Rust before launching **and** when the library is read back. That
second check was missing at first and wiped the target on every startup, leaving
the Play button with nothing to launch.

These games appear in no cover database, so Cassini shows the logo the game
carries itself, read from its folder. And since no executable can provide a
launcher icon, `store_icons.rs` asks the shell for the Xbox app's own icon, the
same one as in the Start menu, taken from the machine, with a bundled drawing as
a fallback.

Uninstalling is still missing. Windows reserves it to its own Settings app.

### Keyboard shortcuts

Movement in the scene belongs to the scene: WASD and ZQSD, configurable keys and
sensitivity in `lib/flyKeys.ts`, effective only when the view has focus.
Everything else goes through a single listener in `SolarSystemPage`. Spread over
several components, shortcuts ended up stepping on each other and nobody could
say which ones existed.

`1` to `9` go to the matching system in the rail, launchers first then custom
systems. `Ctrl+F` brings the search back under the hand, `F` toggles the chosen
game's favourite status, `?` opens the shortcut list, `Escape` closes whatever is
open. `Ctrl+,` and `Ctrl+M` stay with the layers, `Space` with the player.

Two precautions. Nothing fires while typing: a text field or editable area keeps
the keys, otherwise typing "favori" in the search box would toggle the favourite
eight times. Only `Ctrl+F` goes through, so you can return to the search from
anywhere. And digits are read from `e.code` rather than `e.key`, because the top
row of an AZERTY keyboard produces symbols.

`AideRaccourcis` is the only place where they are all listed. The movement keys
are not copied there, since they are configurable and a second source of truth
always ends up lying. The list points to the Commands panel, which shows them.

### Accessibility

An audit was run over the whole app, then the findings fixed. Document language
now follows the interface language, where the page used to declare itself
English. Notifications are announced through an `aria-live` region, with
`role="alert"` for errors. Dialogs trap the tab key and return focus where it
started (`hooks/useFocus.ts`), Escape closes everywhere, and the focus outline
that three stylesheets were cancelling is back.

Contrast was measured and corrected: the list dropped below 2.5 whenever a pale
planet drifted behind it. Its background went from 0.34 to 0.80 and the low
opacities to between 0.62 and 0.9, and no text is under 11 px any more. The worst
measured case went from 1.35 to 5.40, against an AA threshold of 4.5.

Reduced motion is respected. A global rule in `App.css` covers the sixteen
stylesheets that ignored it, and the 3D scene, which CSS cannot reach, freezes
orbits, rotations and camera travel when the system asks for it.

Three adjustable tracks were plain `div` elements listening to the mouse: player
progress, player volume, and the thread in the bottom bar. Invisible to a screen
reader, unreachable by keyboard. They now go through `components/Glissiere`,
which carries `role="slider"`, the name, the value and its plain reading
("1:23 of 4:10" rather than "33"), arrow keys, Home and End, and a focus
outline, without changing a pixel of what you see.

A second audit was run with axe-core over nine views, and found twenty
violations. Eighteen came from one defect: `SettingRow` showed its label in a
`div` with the control beside it and nothing linking the two, so nine dropdowns
and eleven checkboxes and sliders had no accessible name at all. Each control now
carries the i18n key its row already displays. `FilterSelect` did have a
`<label>`, but a floating one with no `htmlFor`, which affected six dropdowns in
the library and launchers pages. And the music visualiser covers the screen with
a decorative canvas that appeared in the accessibility tree only as a block of
content outside any landmark.

The keyboard walk found one more, which axe did not report: a game button took
its name from its concatenated contents and announced itself as
"1Portal 212,0 Go". It now carries a composed name, and the three purely visual
pieces mixed into it, the orbit number, the fallback thumbnail initial and the
favourite star, are marked decorative.

What is already in good shape, measured rather than assumed: thirteen keyboard
stops on the galaxy, all named, all with a visible focus ring; the settings layer
is a `dialog` with `aria-modal`, focus stays trapped over twenty five tab
presses, and Escape closes it; and the ten HUD contrasts, which axe declines to
compute because the panels paint their background with pseudo elements, measured
by compositing the layers down to the black sky, the lowest being 7.43 against a
threshold of 4.5.

One accepted exception. `label-content-name-mismatch` flags the three game
buttons, because the orbit number and the thumbnail initial stay visible to the
eye without appearing in the name. The rule exists so that a voice control user
can say what they read. Here what they read is not a label but adjacent
decoration, and putting it in the name would read back as "1, P, Portal 2,
12,0 Go" to anyone listening. Listening comfort wins.

Still to do: expose text size and list opacity in Settings, where the plumbing
exists but is only driven by the debug panel; honour `prefers-contrast`; and test
the layout at 200 % zoom.

### Security

A review was run over the whole exposed surface. The content policy is strict:
`default-src 'self'`, `script-src 'self'` with no `unsafe-inline` and no `eval`,
`object-src 'none'`, `frame-ancestors 'none'`, `form-action 'none'`, and a named
list of image hosts. The `asset:` protocol is bounded to the user profile, with
an explicit refusal of `.ssh`, `.aws`, `.gnupg` and the Windows credential
stores. Tauri permissions open only seven URL schemes and thirteen launcher
executables, named one by one.

On the Rust side, the thirty five commands were gone through one at a time.
Every command that receives a path validates it before use: confinement under
the music root for anything that writes, under the user profile for anything that
reads, and canonical resolution of `..` and links. `launch_target` accepts only
one of the five known schemes or an existing local path on a drive letter, so no
UNC, no `..`, no control characters. Nothing goes through `cmd /c start` any
more, which re-parsed `&` and `|`. See `security.rs` and its four tests.

On the JavaScript side there is no `dangerouslySetInnerHTML`, no `eval`, no
function construction, and the only `innerHTML` is a clear. The SteamGridDB key
stays in the Windows credential manager and never crosses JavaScript. Updates are
signed with minisign and the index is public.

Fixed along the way: `react-router-dom` was carrying two high severity advisories
(7.13.0 to 7.18.3, `npm audit` now at zero). The five advisories concerned server
side rendering, which this app does not use, but a patch release is not worth
arguing about.

**Rust dependencies.** `cargo audit` passes the 690 lockfile entries. Eight
advisories on the first pass, seven cleared by updating the lockfile alone, with
no code change and five versions moved:

- `rustls-webpki` 0.103.10 to 0.103.15. The most serious one, since it is the
  library that validates the automatic updater's certificates. Three advisories:
  name constraints wrongly accepted for URIs, constraints accepted for a wildcard
  certificate, and a reachable panic while reading a revocation list.
- `h2` 0.4.14 to 0.4.19. Unbounded empty DATA frames on `reqwest`'s HTTP/2 path,
  the one that queries iTunes and SteamGridDB.
- `quick-xml` 0.38.4 to 0.41.0, through `plist` 1.8.0 to 1.10.0. Two advisories
  at severity 7.5: quadratic time on duplicate attributes, and unbounded
  allocation of namespace declarations. `plist` only compiles on macOS and the
  published build is Windows, so real exposure was nil, but `plist`'s `^0.38`
  constraint prevented moving, and 1.10 lifts it.
- `crossbeam-epoch` 0.9.18 to 0.9.21. Invalid pointer dereference in a debug
  display, through `rayon` and the `exr` image decoder.

The eighth stands, and it is a false positive. `rkyv` 0.7.46 is an **optional**
dependency of `rust_decimal`, itself pulled in by `byte-unit` then
`tauri-plugin-log`. The feature is not enabled, `cargo tree -i rkyv` returns
nothing across all targets and edge kinds, so the code is never compiled.
`cargo audit` reads the lockfile, which lists optional dependencies too.

Sixteen "unmaintained" or "unsound" warnings remain (`paste`, `fxhash`, the
`unic-*` crates, `glib`, `anyhow`, `rand`). All transitive, none with a fixed
version to date. Nothing to do until `tauri` moves.

**The updater token, removed and revoked.** `VITE_UPDATER_TOKEN` was read through
`import.meta.env`, and Vite replaces that expression with the literal value at
build time. The token was therefore not read at startup, it was baked into the
JavaScript, which ships inside the `.exe`. It served no purpose either, since the
update endpoint is a public repository and GitHub asks for nothing. It has been
removed from the code and the workflow, and the credential revoked.

That revocation has a consequence worth knowing.
`raw.githubusercontent.com` answers 404 to any request carrying an invalid
authorization header, where with no header it answers 200. Every release from
v0.9.0 onward ships the now revoked token and sends it on every startup, so the
whole installed base gets a 404 on its update check and silently concludes it is
up to date. No release can reach them, since the 404 comes from the header rather
than from what is at the other end. The only way out is a manual reinstall, which
keeps library and settings. The README says so in a callout and the 6.0.2 release
notes say so inside the app.

Still open: the bundle identifier is still `com.anton.tauri-app`. Changing it
would move the data store, so it is a deliberate choice.

### Performance

The app runs at 60 frames per second for 16.7 ms a frame. That is not a
computation cost, it is exactly 1/60 s, vertical sync. The development screen
only offers 60 Hz, so it is a hardware ceiling rather than a symptom. The counter
measures the interval between frames and not the work, so at 60 and 16.7 you
cannot tell whether there are 3 ms of headroom or none.

Found and removed: `antialias: true` on the WebGL context was not smoothing a
single pixel. The whole scene goes through the compositor, whose render targets
have no multisampling, and the canvas buffer only receives the full screen quad
of the last pass, which has no interior edges. We were paying for a multisampled
2560×1440 buffer and its resolve on every frame for nothing.

The rest of the loop is tight and was checked rather than assumed: layout reads
are grouped before any style write, the hover raycast is conditioned on mouse
movement, systems are built on approach and released on departure, bloom is
computed at half resolution, and the scene stops drawing when a layer covers it.
Bundle splitting is already right: 1,008 kB for the home page, three.js and the
scene being needed for the first paint, with everything else in chunks loaded on
demand, none above 24 kB.

Still to do: display work time alongside the interval, the only measure that
would show real headroom; and check which GPU WebView2 actually renders on, the
machine having two. The app logs the one it gets.

### Keep the Tauri CLI and crate in step

A local build warned that it could not add the bundle type to the binary, and
that the updater might then be unable to update the package. The `tauri` crate
was 2.10.3 while `@tauri-apps/cli` was 2.9.6, pinned there by the npm lockfile,
so CI would have built the release with the same mismatch and shipped a binary
the updater could not act on.

Checked rather than assumed: the `__TAURI_BUNDLE_TYPE` marker was present in
the built binary. The crate was emitting it, the CLI no longer recognised it.
Updating the CLI fixed it, and packaging now reports
`Patching ...\cassini.exe with bundle type information: nsis`.

Worth re-reading that line on every release. It is a warning, not an error, so
the build succeeds either way and nothing else says the updater is broken.

The local build task also passes `--config '{"bundle":{"createUpdaterArtifacts":
false}}'`. Without it the task ends on a signing error and exit code 1, since
the private key only exists as a GitHub secret, which contradicts a task whose
own label says "unsigned". The release keeps the repository configuration and
signs for real.

### Debug panel, absent from published builds

A floating panel, opened with `Ctrl+Alt+D` or the bug button at the bottom left:
61 settings in sixteen collapsible groups, with accent insensitive search. It
covers general interface, navigation, header, game list, launcher rail, game
card, 3D labels, camera, light, atmosphere, planets, suns, systems, loading and
motion, plus layout tools such as element outlines, animations off and the frame
counter.

Direct settings apply live. Those that fix a count or an object size rebuild the
scene once the slider is released. Modified values are highlighted, counted per
group, and remembered between sessions. "Copy the differences" sorts them by the
file to report them in: scene settings into `src/features/debug/tuning.ts`,
interface ones as the fallback value of their CSS variable.

It is absent from the published build. The panel is mounted behind
`import.meta.env.DEV`, which Vite replaces with `false` at build time. Checked on
a production build: neither the component nor its labels appear, where a
development build emits them. The defaults module itself does ship, since the
scene reads from it what it used to read from its own constants.

### Background scanning and live install state

`scannerTousLesLaunchers()` runs once per launch, from `AppLayout`, rather than on
window focus or every thirty minutes as first planned. The nine scans start in
parallel, the merge is sequential, and storage is only rewritten when an order
insensitive fingerprint changed.

`watcher.rs` watches what changes the library while the window is open: Steam
manifests (`steamapps/appmanifest_*.acf`, every library) and Epic ones
(`Manifests/*.item`) through the `notify` crate, and the registry Uninstall keys
through `RegNotifyChangeKeyValue`, where Battle.net, Riot, Ubisoft, Rockstar and
the Hytale launcher register themselves. Only a manifest appearing or
disappearing counts, since Steam rewrites its own throughout a download. Bursts
are grouped on the Rust side with 1.5 s of quiet, then the `bibliotheque-changee`
event has `AppLayout` rerun the usual scan, at most once every ten seconds, with
the last signal never lost. A scan on window focus and the Refresh button
complete the picture.

### Testing

Three suites, 261 cases, all run by CI on every push.

| Suite      | Cases | What it holds                                                            |
| ---------- | ----- | ------------------------------------------------------------------------ |
| Vitest     | 204   | Library merging, storage, translations, orbit geometry, camera paths     |
| Cargo      | 50    | Launcher scanners, registry reads, uninstaller matching, icon extraction |
| Playwright | 7     | Full journeys through the running app                                    |

What is covered is what a regression would not show: `deduplicateGames` and
`mergeById` (platform priority, favourite and last session lifted from the
discarded copy), `appliquerScan` (a scan never loses anything, and a scanner only
touches its own platform, otherwise scanning Steam would mark every Epic game as
uninstalled), `placePopup` (the card never leaves the frame, the tab stays inside
the card) and `composerFiche` (the coupling between card width and planet offset,
which any isolated change breaks silently).

Vitest runs in a Node environment with its own configuration. The app's own
config is asynchronous and carries the dev server, and mixing the two made the
tests depend on settings that change for other reasons.

The Playwright journeys record a video and screenshots of each run. They compare
no pixels: a 3D render changes with the GPU and the driver, so a test failing
over that would say nothing useful. Videos are there to watch, not to assert on.

Two lessons from writing the unit tests. `normalizeName` **removes** the hyphen
instead of replacing it with a space, so "Spider-Man" becomes `spiderman` and does
not match "Spider Man". The case is rare, since both stores usually write the
title the same way, and the behaviour is recorded by a test rather than quietly
changed. And the game card stays centred up to nearly 848 px of panel width;
only below that does the planet start getting pushed aside.

Getting the journeys to pass on CI took four attempts, and the first three were
wrong diagnoses worth recording:

1. Screenshots were suspected and turned off on CI. No gain.
2. Vite compiling on demand was suspected, so CI now serves the production build
   through `vite preview`. No gain, but it is a better thing to test anyway,
   since it is the bundle that actually ships.
3. Render quality was suspected, so the journeys seed the app's own Low preset.
   A real gain locally under forced software rendering, 8 to 30 frames per
   second, but not enough.
4. The trace downloaded from the runner gave the answer: **a single click took
   85 seconds**, and a `waitForTimeout(0)` took 5. Playwright only acts on an
   element once it is stable, meaning still from one frame to the next, and on a
   GPU-less runner where planets orbit and the camera travels, that condition
   takes an unreasonable time to arrive. The journeys now request reduced motion,
   which the app already honours by making camera travel instant and stopping
   orbits. Every case dropped under 4.4 seconds.

The job also moved to a Linux runner. The journeys only exercise the frontend, so
nothing required Windows, and the Windows runner was both slow and erratic on
this load, from 9.8 seconds to 6.2 minutes for comparable cases. The two unit
test jobs stay on Windows, since their suites genuinely reason about Windows
paths and registry keys.

Clippy runs with `-D warnings` on a **pinned** toolchain, 1.92.0. With a floating
`stable`, every Rust release brings new lints and breaks CI on code that has not
changed, which is exactly what happened on the first run: the machine was on 1.92
and the runner took 1.99, and eight unknown lints failed the job.

Playwright does not download its browsers when packages are installed, and recent
npm versions block install scripts anyway, so `pretest:e2e` runs
`playwright install chromium` before the tests. Without it the seven journeys all
fail on "Executable doesn't exist", which looks nothing like a test failure and
leaves no video, since there is nothing to film when the browser will not start.

React components are not covered. That would need jsdom, which we will add the
day a component justifies it rather than loading a simulated browser for
functions that compute.

---

## Still to do

### Features

- **Playtime statistics.** A page or side panel. Available data: `lastPlayedAt`
  per session, though only the last one is stored today. Real statistics would
  need a `playHistory: string[]` array on the `Game` type. Charts by week or
  month, either a light library or a hand drawn canvas. Also worth showing:
  estimated total time, most played game, active days.
- **Advanced sorting.** Add `'size'` and `'playtime'` to `SortMode`, which is
  currently `'recent' | 'az' | 'za'`. The sort dropdown is already in place, so
  it is a matter of adding the options and the case in the comparator.
- **Desktop notifications.** Through `tauri-plugin-notification`. Main use case:
  spotting when a Steam download finishes, by watching for a new `.acf` manifest
  with the `notify` crate, then announcing that the game is ready. Needs the
  `notification` permission in `tauri.conf.json`.
- **GOG Galaxy.** A `scan_gog_games` command. GOG stores its games in the
  registry under `HKLM\SOFTWARE\GOG.com\Games` and in
  `C:\ProgramData\GOG.com\Galaxy\`. Each registry entry has `path`, `gameID` and
  `gameName`, and the launch URL would be `goggalaxy://openGame/{id}`. `'GOG'`
  already exists in `GamePlatform` but nothing fills it.
- **List view.** A `viewMode: 'grid' | 'list'` URL parameter on the library. In
  list mode each game is a compact row: thumbnail, title, platform, last session
  and a Play button. The current card stays for the grid.
- **Per game notes.** A `notes: string` field on `Game`, a text area in a side
  panel or modal, autosaved with a 500 ms debounce, and a coloured dot on cards
  that have notes.
- **Folder tree in the music player.** An alternative view with large folder
  tiles showing the first album cover found, the folder name and the track count,
  expanding to the tracks below. Useful with many folders.
- **Add your own games and programs.** The code is written but nothing calls it,
  which is why the table says to do rather than partial: the table describes what
  you can do, not what sleeps in the repository. `createGameFromPath` builds a
  `Game` from an executable or shortcut path, with the title derived from the
  filename, a stable id derived from the path, and platform `'Other'`, and
  `addGameFromPicker` opens the file picker and adds it. All that is missing is a
  button, and a way to choose title and icon. The risk I expected does not exist:
  `appliquerScan` only touches games of the platform being scanned, and `'Other'`
  is no scanner's domain, so a manual entry will never be marked uninstalled.
- **Fainter orbit rings seen from close up.** The blue circles around the sun sit
  at 30 % opacity, raised from 16 % to stay readable from far away, and they
  saturate the view up close. The lead: fade opacity as the camera approaches, as
  the haze already does, both governed by the same quantity, distance to the
  system.
- **Cover cache expiry.** The cache stores `{ key: url }` with no date. Making it
  `{ key: { url, fetchedAt } }` and ignoring entries older than thirty days on
  read, plus a "clear expired" button beside the existing "clear all".
- **Larger base font size** across the app.
- **Choose your own ambient music** in the settings.

### An open question

**Why open Cassini rather than a Windows shortcut.** This is not a feature but
the question behind all of them. A desktop shortcut launches a game in one click
without opening anything. As long as Cassini only launches games, it adds a step.
What it brings of its own, the overview, the unified library, what you see at a
glance and nowhere else, deserves to be identified before being built.
