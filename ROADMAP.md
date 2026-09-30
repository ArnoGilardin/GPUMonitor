# Plan d'amélioration — GPU Monitor

## Phase 1 — Terminer le produit ✅ (livrée dans la v2.0)

Objectif : un outil réellement utilisable pour superviser plusieurs serveurs GPU.

### Multi-serveurs
- Page **Serveurs** : ajout d'un serveur depuis l'interface, clé collecteur dédiée
  (affichée une seule fois, stockée hachée), commandes d'installation prêtes à copier,
  édition (nom, tags, emplacement, description), rotation de clé, suppression.
- **Mode maintenance** : coupe les alertes d'un serveur pendant une intervention.
- Statuts complets : en ligne / avertissement / critique / hors ligne / en attente du
  premier rapport / maintenance.
- Enregistrement automatique conservé pour les collecteurs utilisant la clé globale ;
  `REQUIRE_SERVER_KEYS=true` pour l'interdire.
- Simulateur de parc (`npm run simulate`, profil Docker `demo`).

### Tableau de bord et historique
- Statistiques réelles (les tendances « +12 % » étaient codées en dur), puissance
  instantanée au lieu d'une somme sur une heure, VRAM totale du parc.
- Filtres par statut et par tag, recherche globale (en-tête), tris par charge,
  température, puissance.
- Page serveur : graphiques **réels** par GPU (les courbes étaient aléatoires),
  plages 1 h → 30 j avec agrégation côté base, réseau, infos système, export CSV.

### Alertes
- La durée d'une règle est enfin respectée (avant : déclenchement immédiat).
- **Résolution automatique** quand la condition disparaît.
- Nouvelle règle **serveur hors ligne**, plus puissance GPU, RAM et load.
- Portée des règles : tous les serveurs, un tag ou un serveur.
- Acquittement des alertes, notifications à la résolution.
- Webhooks formatés pour Slack et Discord, test côté serveur (le test partait du
  navigateur et était bloqué par CORS), email via SendGrid.

### Administration et sécurité
- Gestion des utilisateurs (admin / lecteur), changement de mot de passe,
  journal d'audit consultable.
- Inscription publique désactivée par défaut (n'importe qui pouvait créer un compte) ;
  le premier compte d'une base vide devient administrateur.
- Secrets obligatoires en production, comparaison des clés à temps constant,
  validation de toutes les entrées (zod), plus de journalisation des jetons.
- Paramètres réellement enregistrés (rétention, délai hors ligne), purge horaire.

### Technique
- Pilote PostgreSQL standard (`pg`) : le pilote Neon ne fonctionnait pas avec le
  Postgres du `docker-compose`.
- Requêtes groupées (plus de N+1), index sur les séries temporelles, dernier
  échantillon **par GPU** (avant : 10 lignes arbitraires).
- WebSocket événementiel (push à chaque rapport) au lieu d'un sondage de la base toutes
  les 10 s, reconnexion avec rafraîchissement du jeton.
- Dockerfile corrigé (la construction échouait), synchronisation du schéma au démarrage.
- Collecteur v2 : noms et UUID des GPU, AMD via JSON, réseau, RAM/disque détaillés,
  infos hôte, mémoire tampon hors connexion, ne s'arrête plus après 10 échecs,
  installeur systemd / Docker.
- Tests : 30 tests unitaires (vitest), tests du collecteur, 8 tests e2e Playwright.

## Phase 2 — Exploitation à grande échelle (prochaine étape)

| Priorité | Chantier | Pourquoi |
| --- | --- | --- |
| Haute | Migrations versionnées (`drizzle-kit generate`) au lieu de `push` | Mises à jour sûres et réversibles en production |
| Haute | Agrégats continus (TimescaleDB ou tables horaires) | Garder des mois d'historique avec des centaines de GPU |
| Haute | Intégration continue (typecheck, tests, build Docker) | Éviter les régressions |
| Moyenne | Métriques par processus GPU (qui utilise quel GPU, `nvidia-smi --query-compute-apps`) | Question n°1 des utilisateurs d'un cluster |
| Moyenne | Métriques NVIDIA avancées : ECC, throttling, clocks, PCIe, NVLink (DCGM) | Détecter les GPU défaillants avant la panne |
| Moyenne | Export Prometheus `/metrics` et datasource Grafana | S'intégrer à l'existant |
| Moyenne | Fenêtres de maintenance planifiées et silences d'alertes | Interventions prévues sans bruit |
| Basse | Envoi groupé du collecteur (batch) et compression | Parcs de plus de 500 serveurs |

## Phase 3 — Fonctionnalités d'équipe

- Groupes / projets avec droits par groupe de serveurs.
- SSO (OIDC : Google, Azure AD, Keycloak) et 2FA.
- Canaux de notification multiples (par règle ou par tag), escalade, PagerDuty / Opsgenie,
  Telegram, Microsoft Teams.
- Rapports hebdomadaires : taux d'utilisation, GPU inactifs, consommation électrique
  et coût (€/kWh configurable).
- Tableaux de bord personnalisables et vues sauvegardées.

## Phase 4 — Intelligence

- Détection d'anomalies (température qui dérive, ventilateur en fin de vie).
- Prévisions de saturation disque / VRAM.
- Recommandations de placement des jobs sur les GPU les moins chargés.
- Application mobile / PWA avec notifications push.
