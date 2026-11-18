## 0.7.1 — Raccords réseau arrondis (correctif visuel)

- Tronc Livebox → ETH dessiné par SVG : aucun dépassement au-dessus du premier port ou sous le dernier.
- Sorties des ports et connexions des groupes CPL/Wi-Fi reliées par des courbes calculées sur la géométrie réelle des éléments.
- Recalcul après changement de largeur et déploiement/repli des branches.
- Aucune modification des données Livebox, du stockage partagé ni des règles Velop/CPL de la 0.7.0.

# Historique des versions

## 0.7.0 — développement (non publié en release)

- Nouvelle présentation colorée : branches Ethernet bleues, groupes Wi-Fi verts et groupe Wi-Fi CPL violet fermé.
- Points d'accès à gauche de leurs clients, disposés en grille sans faux liens en chaîne entre clients.
- Regroupement visuel de `CPL Spare1` et `CPL Spare1_2.4` lorsqu'ils sont sur la même branche : conserve l'adresse IP de la seconde entité, les descendants `Children` et les entités HA d'origine.
- Tous les ETH déployables/repliables, disposition sur mobile, sans déplacement manuel des bulles.
- Conservation du stockage partagé HAOS et de l'import `TopologyDiagnostics` de la 0.6.0.
- README et captures de démonstration générés uniquement avec des appareils fictifs.

**Limite :** seule la simulation a été testée. Les associations renvoyées par la Livebox, notamment avec des Velop en mode pont, restent à vérifier sur le réseau réel.
