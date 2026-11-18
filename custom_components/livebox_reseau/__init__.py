"""Carte Livebox et stockage partagé (utilise les états HA existants)."""

from __future__ import annotations

import asyncio
import logging
import time
from pathlib import Path
from typing import Any

try:
    import probatio as vol  # Home Assistant récent
except ImportError:
    import voluptuous as vol  # Compatibilité HA plus ancien

from homeassistant.components import websocket_api
from homeassistant.components.http import StaticPathConfig
from homeassistant.core import HomeAssistant, callback
from homeassistant.helpers.dispatcher import async_dispatcher_connect, async_dispatcher_send
from homeassistant.helpers.storage import Store
from .topology import normalise_topology

DOMAIN = "livebox_reseau"
STORAGE_VERSION = 1
STORAGE_KEY = "livebox_reseau_map"
SIGNAL_UPDATE = "livebox_reseau_map_updated"
LINKS = {"wifi", "ethernet", "cpl", "other"}
_LOGGER = logging.getLogger(__name__)
FRONTEND_PATH = Path(__file__).parent / "frontend"
URL_BASE = "/livebox-reseau"
RESOURCE_URL = URL_BASE + "/livebox-topologie-card.js?v=0.7.2"
TOPOLOGY_CACHE_SECONDS = 900



def _clean_overrides(raw: Any) -> dict[str, dict[str, Any]]:
    """N'accepter que les valeurs éditables par la carte, sans HTML ou secrets."""
    result: dict[str, dict[str, Any]] = {}
    if not isinstance(raw, dict) or len(raw) > 1000:
        return result
    for key, props in raw.items():
        if not isinstance(key, str) or not (0 < len(key) <= 160):
            continue
        if not isinstance(props, dict):
            continue
        clean: dict[str, Any] = {}
        if isinstance(props.get("name"), str) and 0 < len(props["name"].strip()) <= 100:
            clean["name"] = props["name"].strip()
        if isinstance(props.get("group"), str) and 0 < len(props["group"]) <= 120:
            clean["group"] = props["group"]
        if isinstance(props.get("parent"), str) and 0 < len(props["parent"]) <= 160:
            clean["parent"] = props["parent"]
        if isinstance(props.get("link"), str) and props["link"] in LINKS:
            clean["link"] = props["link"]
        if props.get("hidden") is True:
            clean["hidden"] = True
        if clean:
            result[key] = clean
    return result


async def async_setup(hass: HomeAssistant, config: dict) -> bool:
    """Enregistre la carte intégrée et les commandes WebSocket une seule fois."""
    for command in (websocket_get, websocket_set, websocket_import, websocket_subscribe, websocket_topology):
        websocket_api.async_register_command(hass, command)

    await hass.http.async_register_static_paths(
        [StaticPathConfig(URL_BASE, str(FRONTEND_PATH), False)]
    )

    # Lovelace en mode stockage : enregistrement automatique non destructif.
    # Charge TOUJOURS la collection avant de la modifier (évite l'effacement
    # possible des ressources existantes avec certaines versions HA).
    try:
        lovelace = hass.data.get("lovelace")
        if lovelace and lovelace.resource_mode == "storage":
            resources = lovelace.resources
            await resources.async_get_info()
            existing = list(resources.async_items())
            item = next((r for r in existing if
                         r["url"].split("?")[0] == RESOURCE_URL.split("?")[0]), None)
            if item is None:
                await resources.async_create_item(
                    {"res_type": "module", "url": RESOURCE_URL}
                )
            elif item["url"] != RESOURCE_URL:
                await resources.async_update_item(item["id"],
                                                  {"res_type": "module", "url": RESOURCE_URL})
    except Exception:  # Ressource ajoutable manuellement, n'empêche pas l'intégration
        _LOGGER.warning("Ajout automatique de la carte impossible ; ressource à ajouter manuellement", exc_info=True)
    return True


async def async_setup_entry(hass: HomeAssistant, entry) -> bool:
    """Charge une fois la configuration et expose les commandes authentifiées."""
    if DOMAIN in hass.data:
        return True
    store: Store[dict[str, Any]] = Store(hass, STORAGE_VERSION, STORAGE_KEY)
    saved = await store.async_load() or {}
    if not isinstance(saved, dict):
        saved = {}
    hass.data[DOMAIN] = {
        "store": store,
        "lock": asyncio.Lock(),
        "revision": int(saved.get("revision", 0)) if str(saved.get("revision", 0)).isdigit() else 0,
        "overrides": _clean_overrides(saved.get("overrides", {})),
        "topology_lock": asyncio.Lock(),
        "topology_cached_at": 0.0,
        "topology_cached": None,
    }
    return True


async def async_unload_entry(hass: HomeAssistant, entry) -> bool:
    """Les commandes restent enregistrées jusqu'au redémarrage, mais deviennent inactives."""
    hass.data.pop(DOMAIN, None)
    return True


def _payload(hass: HomeAssistant) -> dict[str, Any]:
    data = hass.data[DOMAIN]
    return {"revision": data["revision"], "overrides": dict(data["overrides"])}


@websocket_api.websocket_command({vol.Required("type"): "livebox_reseau/get"})
@callback
def websocket_get(hass, connection, msg):
    """Les utilisateurs connectés peuvent lire les paramètres du dashboard."""
    if DOMAIN not in hass.data:
        connection.send_error(msg["id"], websocket_api.ERR_NOT_FOUND, "Intégration non chargée")
        return
    connection.send_result(msg["id"], _payload(hass))


@websocket_api.require_admin
@websocket_api.websocket_command({
    vol.Required("type"): "livebox_reseau/set",
    vol.Required("key"): str,
    vol.Required("props"): dict,
})
@websocket_api.async_response
async def websocket_set(hass, connection, msg):
    """Édite UN équipement pour éviter d'effacer les changements simultanés."""
    if DOMAIN not in hass.data:
        connection.send_error(msg["id"], websocket_api.ERR_NOT_FOUND, "Intégration non chargée")
        return
    key = msg["key"]
    if not (0 < len(key) <= 160):
        connection.send_error(msg["id"], websocket_api.ERR_INVALID_FORMAT, "Identifiant invalide")
        return
    proposed = msg["props"]
    if not isinstance(proposed, dict) or len(proposed) > 5 or any(
        k not in {"name", "group", "parent", "link", "hidden"} for k in proposed
    ):
        connection.send_error(msg["id"], websocket_api.ERR_INVALID_FORMAT, "Propriétés invalides")
        return
    cleaned = _clean_overrides({key: proposed})
    if proposed and key not in cleaned:
        connection.send_error(msg["id"], websocket_api.ERR_INVALID_FORMAT, "Valeurs invalides")
        return
    if proposed and (set(cleaned[key]) != set(proposed)):
        connection.send_error(msg["id"], websocket_api.ERR_INVALID_FORMAT, "Valeurs invalides")
        return
    data = hass.data[DOMAIN]
    async with data["lock"]:
        updated = dict(data["overrides"])
        if cleaned:
            updated[key] = cleaned[key]
        else:
            updated.pop(key, None)
        rev = data["revision"] + 1
        try:
            await data["store"].async_save({"revision": rev, "overrides": updated})
        except Exception:
            connection.send_error(msg["id"], websocket_api.ERR_UNKNOWN_ERROR, "Échec enregistrement")
            return
        data["revision"] = rev
        data["overrides"] = updated
        payload = _payload(hass)
    async_dispatcher_send(hass, SIGNAL_UPDATE, payload)
    connection.send_result(msg["id"], payload)


@websocket_api.require_admin
@websocket_api.websocket_command({
    vol.Required("type"): "livebox_reseau/import",
    vol.Required("overrides"): dict,
})
@websocket_api.async_response
async def websocket_import(hass, connection, msg):
    """Migration volontaire des réglages enregistrés dans un ancien navigateur."""
    if DOMAIN not in hass.data:
        connection.send_error(msg["id"], websocket_api.ERR_NOT_FOUND, "Intégration non chargée")
        return
    raw = msg["overrides"]
    if len(raw) > 200 or len(str(raw)) > 50000:
        connection.send_error(msg["id"], websocket_api.ERR_INVALID_FORMAT, "Import trop volumineux")
        return
    cleaned = _clean_overrides(raw)
    if len(cleaned) != len(raw):
        connection.send_error(msg["id"], websocket_api.ERR_INVALID_FORMAT, "Import invalide")
        return
    data = hass.data[DOMAIN]
    async with data["lock"]:
        updated = {**data["overrides"], **cleaned}
        rev = data["revision"] + 1
        try:
            await data["store"].async_save({"revision": rev, "overrides": updated})
        except Exception:
            connection.send_error(msg["id"], websocket_api.ERR_UNKNOWN_ERROR, "Échec enregistrement")
            return
        data["revision"] = rev
        data["overrides"] = updated
        payload = _payload(hass)
    async_dispatcher_send(hass, SIGNAL_UPDATE, payload)
    connection.send_result(msg["id"], payload)


@websocket_api.websocket_command({vol.Required("type"): "livebox_reseau/subscribe"})
@callback
def websocket_subscribe(hass, connection, msg):
    """Met à jour les navigateurs/téléphones déjà ouverts lorsqu'un réglage change."""
    if DOMAIN not in hass.data:
        connection.send_error(msg["id"], websocket_api.ERR_NOT_FOUND, "Intégration non chargée")
        return

    @callback
    def forward(payload):
        connection.send_message(websocket_api.event_message(msg["id"], payload))

    connection.subscriptions[msg["id"]] = async_dispatcher_connect(hass, SIGNAL_UPDATE, forward)
    connection.send_result(msg["id"])


@websocket_api.websocket_command({vol.Required("type"): "livebox_reseau/topology"})
@websocket_api.async_response
async def websocket_topology(hass, connection, msg):
    """Lit la topologie sur l'API déjà authentifiée d'Orange Livebox.

    Lecture de diagnostic uniquement, jamais de modifications réseau. Cache de
    15 min partagé entre tous les dashboards ; n'enregistre pas le JSON dans
    Recorder ou dans le stockage de l'intégration.
    """
    if DOMAIN not in hass.data:
        connection.send_error(msg["id"], websocket_api.ERR_NOT_FOUND, "Intégration non chargée")
        return
    state = hass.data[DOMAIN]
    async with state["topology_lock"]:
        now = time.monotonic()
        previous = state["topology_cached"]
        if previous is not None and now - state["topology_cached_at"] < TOPOLOGY_CACHE_SECONDS:
            connection.send_result(msg["id"], previous)
            return
        entries = hass.config_entries.async_entries("livebox")
        coordinator = next((getattr(e, "runtime_data", None) for e in entries
                            if getattr(getattr(e, "runtime_data", None), "api", None)), None)
        if coordinator is None:
            connection.send_error(msg["id"], websocket_api.ERR_NOT_FOUND,
                                  "Orange Livebox non chargée ou API indisponible")
            return
        api = getattr(getattr(coordinator, "api", None), "topologydiagnostics", None)
        build = getattr(api, "async_set_topodiags_build", None)
        if not callable(build):
            connection.send_error(msg["id"], websocket_api.ERR_NOT_FOUND,
                                  "API TopologyDiagnostics indisponible dans cette version Orange")
            return
        try:
            response = await asyncio.wait_for(build({
                "Timeout": 30, "LLTDIcon": False, "SendXmlFile": False,
            }), timeout=48)
            parsed = normalise_topology(response)
            if parsed["count"] <= 1:
                raise ValueError("La Livebox n'a pas renvoyé d'arbre détaillé")
            state["topology_cached"] = parsed
            state["topology_cached_at"] = time.monotonic()
        except (TimeoutError, ValueError, TypeError, AttributeError, RuntimeError) as exc:
            _LOGGER.warning("Lecture de topologie Livebox impossible : %s", type(exc).__name__)
            if previous is not None:
                connection.send_result(msg["id"], {**previous, "stale": True})
            else:
                connection.send_error(msg["id"], websocket_api.ERR_UNKNOWN_ERROR,
                                      "Topologie Livebox indisponible : " + type(exc).__name__)
            return
        except Exception as exc:
            _LOGGER.exception("Échec inattendu de la lecture de topologie Livebox")
            if previous is not None:
                connection.send_result(msg["id"], {**previous, "stale": True})
            else:
                connection.send_error(msg["id"], websocket_api.ERR_UNKNOWN_ERROR,
                                      "Topologie Livebox indisponible")
            return
        connection.send_result(msg["id"], parsed)
