# 📝 Notes du projet

## Description

Ce fichier contient les notes de développement, idées et rappels pour le projet.

---

## ✅ TODO

- [ ] Refactoriser le module d'authentification
- [ ] Ajouter des tests unitaires pour l'API
- [ ] Mettre à jour la documentation
- [x] Configurer le CI/CD avec GitHub Actions

---

## 🐛 Bugs connus

- Le formulaire de connexion ne valide pas les emails avec des caractères spéciaux
- Timeout occasionnel sur la route `/api/users` en production

---

## 💡 Idées / Améliorations

- Ajouter un système de cache Redis pour les requêtes fréquentes
- Migrer vers TypeScript
- Intégrer un dashboard d'analytics

---

## 📅 Changelog rapide

| Date       | Note                            |
| ---------- | ------------------------------- |
| 2026-04-08 | Mise à jour des dépendances     |
| 2026-03-15 | Ajout de la route `/api/search` |
| 2026-02-28 | Première version en production  |

---

## 🔗 Ressources utiles

- [Documentation officielle](https://docs.example.com)
- [Trello du projet](https://trello.com/mon-projet)
- [Slack de l'équipe](https://slack.com/mon-equipe)

---

## 🗒️ Notes diverses

> **Important :** Ne jamais commiter les fichiers `.env` dans le repo.

Les variables d'environnement nécessaires sont listées dans `.env.example`.
