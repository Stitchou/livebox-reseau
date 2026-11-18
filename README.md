# Livebox Réseau — Topologie pour Home Assistant

Une carte de topologie graphique Lovelace, utilisable sur PC et téléphone, qui **lit les `device_tracker` de l’intégration Orange Livebox existante**. Aucun scan IP supplémentaire, aucun identifiant Livebox, aucune purge de Recorder.

**Version : 0.4.2 (préversion expérimentale).** Aucune validation sur un Home Assistant réel n’a encore été réalisée. À tester sur une sauvegarde récente.

## Fonctions

- Nom réel fourni par l’intégration Orange, adresse IP, MAC, disponibilité.
- Branches regroupées par `interface_name` (`ETH0`, `ETH1`, `ETH2`...), Wi-Fi si reconnu.
- Graphique SVG : Livebox au centre, clic sur une branche pour explorer ses appareils, recherche, zoom/déplacement.
- Personnalisation de chaque appareil : nom, branche, parent, type de liaison, masquer.
- Réglages partagés entre PC et téléphone via Home Assistant (`.storage/livebox_reseau_map`) et l’API WebSocket ; droits administrateur requis pour modifier.
- Règle facultative `auto_velop_rdc: true` : les autres appareils vus sur `ETH2` sont rattachés à Velop RDC en Wi-Fi, **uniquement parce que cette configuration a été confirmée par l’utilisateur**.

### Limites importantes

L’attribut `ETH2` signifie que la Livebox voit l’appareil à travers cette interface, **pas** qu’il existe une liaison physique directe. Le composant ne lit pas `TopologyDiagnostics` directement et **ne découvre pas automatiquement les switchs, CPL ou points d’accès non gérés**. Les parents ne sont configurés qu’avec les données confirmées ou spécifiées par l’utilisateur. Les cartes ne modifient jamais les états de l’intégration Orange.

## Installation depuis HACS (dépôt personnel)

1. Publier les fichiers de ce projet à la racine d’un dépôt GitHub, par exemple `Stitchou/livebox-reseau` (avec `hacs.json`, `README.md`, `custom_components/livebox_reseau/...`). Ne **pas** téléverser le fichier ZIP lui-même comme unique fichier.
2. Dans HACS → ⋮ → Dépôts personnalisés, saisir `https://github.com/Stitchou/livebox-reseau` et sélectionner **Intégration**.
3. Installer **Livebox Réseau — carte graphique** depuis HACS, puis redémarrer Home Assistant **Core**.
4. Dans Paramètres → Appareils et services → Ajouter une intégration, ajouter **Livebox Réseau**.
5. La ressource JavaScript est ajoutée automatiquement lorsque les ressources Lovelace sont en mode stockage. Vérifier dans Paramètres → Tableaux de bord → Ressources. Si elle n’apparaît pas, l’ajouter manuellement en **Module JavaScript** : `/livebox-reseau/livebox-topologie-card.js?v=0.4.2`.
6. Dans le dashboard, ajouter une carte **Manuel** :

```yaml
type: custom:livebox-topologie-card
title: Mon réseau Livebox
router_name: Livebox 7
router_ip: 192.168.1.1
auto_velop_rdc: true
grid_options:
  columns: full
  rows: auto
```

7. Attendre l’indicateur **● Synchronisé HA** ; si **⚠ Stockage HA absent** apparaît, utiliser **Réessayer** et vérifier que l’intégration est bien ajoutée dans Appareils et services. **Ne pas croire qu’une sauvegarde a été faite si le statut n’est pas synchronisé.**
8. Rafraîchir Firefox avec `Ctrl + Maj + R` si nécessaire. Sur mobile, la même configuration de liens apparaît avec le compte Home Assistant, sans export YAML.

## Mise à niveau depuis les versions précédentes

Ce paquet utilise un **nouveau type de carte** (`custom:livebox-topologie-card`) et la **même clé de stockage** que la version de test 0.3 (`livebox_reseau_map`). L’ancienne carte `custom:livebox-reseau-card` ne sera pas automatiquement remplacée ; remplacez son YAML par celui ci-dessus. Vous pouvez conserver l’ancien fichier `/config/www/livebox-reseau-card.js` jusqu’à validation de la nouvelle carte, puis retirer l’ancienne ressource Lovelace.

## Sécurité et stockage

- Les commandes WebSocket `set`/`import` exigent un compte administrateur ; `get`/`subscribe` requièrent une connexion HA.
- Aucune communication avec un serveur externe, pas de token ni mot de passe stocké.
- Les fichiers frontend statiques ne contiennent aucun secret.
- Le stockage de personnalisation est sous `.storage/livebox_reseau_map` sur ton instance, il reste **local**.

## Tests

`node --check custom_components/livebox_reseau/frontend/livebox-topologie-card.js`

`python -m compileall -q custom_components/livebox_reseau`

Les tests de logique et stockage sont exécutés hors de HAOS avec des modules simulés. Le déploiement dans HAOS et la connexion à la vraie Livebox restent à vérifier.

### Vérifier que le stockage est opérationnel

La carte Lovelace peut s'afficher même si son composant Python n'est pas chargé. **Un fichier JavaScript seul ne peut pas enregistrer les réglages dans `.storage`**. Après installation HACS et ajout de l'intégration dans **Appareils et services**, la pastille affiche **● Synchronisé HA**.

- **● Synchronisé HA** : les modifications réalisées par un administrateur sont envoyées à HAOS.
- **⚠ Stockage HA absent** : aucune modification n'est annoncée comme sauvegardée. Lire l'encart d'erreur, vérifier que l'intégration est configurée, puis cliquer **Réessayer**.
- Pour vérifier : renommer un appareil, actualiser la page, puis ouvrir le même dashboard sur le téléphone ; le nom doit être identique.

**Cette persistance a été testée avec un serveur et des navigateurs simulés, mais reste à vérifier sur ton HAOS.** Un redémarrage de Core est nécessaire uniquement après avoir installé les fichiers Python de l'intégration.
