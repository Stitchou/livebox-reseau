"""Normalisation sans effet de bord de la topologie retournée par Livebox.

Aucune donnée brute, authentification ou information non nécessaire n'est
réexpédiée aux navigateurs. Les liens 'Children' sont conservés tels quels.
"""
from __future__ import annotations

import hashlib
import re
from typing import Any

_MAX_NODES = 450
_MAX_DEPTH = 18


def _text(value: Any, length: int = 160) -> str:
    return value.strip()[:length] if isinstance(value, str) else ""


def _mac(value: Any) -> str:
    value = _text(value, 40)
    if not value:
        return ""
    compact = re.sub(r"[^0-9A-Fa-f]", "", value).upper()
    if len(compact) == 12 and re.fullmatch(r"[0-9A-F]{12}", compact):
        return ":".join(compact[i:i + 2] for i in range(0, 12, 2))
    return ""


def _kind(node: dict) -> str:
    tags = node.get("Tags", [])
    tags = " ".join(tags) if isinstance(tags, list) else str(tags or "")
    name = _text(node.get("Name", ""), 80).lower()
    ssw = node.get("SSW", {})
    if isinstance(ssw, dict) and ssw.get("CurrentMode") == "Slave":
        return "repeater"
    if "wifi_bridge" in tags.lower():
        return "bridge"
    if any(x in name for x in ("switch", "commutateur")):
        return "switch"
    if any(x in name for x in ("cpl", "powerline", "tp-link")):
        return "cpl"
    return "device"


def normalise_topology(raw: Any) -> dict[str, Any]:
    """Convertit 'status: [{...Children...}]' en liste de nœuds sûrs.

    Parents sans MAC ou clé reçoivent un identifiant dérivé du chemin. La
    structure n'est pas interprétée comme preuve d'un câble physique.
    """
    if isinstance(raw, dict) and "status" in raw:
        raw = raw["status"]
    roots = raw if isinstance(raw, list) else [raw]
    result: list[dict[str, Any]] = []
    seen_ids: set[str] = set()

    def walk(obj: Any, parent: str | None, path: str, depth: int) -> None:
        if depth > _MAX_DEPTH or len(result) >= _MAX_NODES or not isinstance(obj, dict):
            return
        name = _text(obj.get("Name")) or _text(obj.get("FriendlyName"))
        key = _text(obj.get("Key"), 110)
        mac = _mac(obj.get("PhysAddress") or obj.get("MACAddress"))
        children = obj.get("Children")
        children = children if isinstance(children, list) else []
        if not (key or mac or name or children):
            return
        if mac:
            unique = "mac:" + mac
        elif key:
            unique = "key:" + key
        else:
            digest = hashlib.sha256(path.encode("utf-8")).hexdigest()[:16]
            unique = "virtual:" + digest
        # Certains firmwares dupliquent des nœuds : ne jamais fusionner
        # deux branches sans preuve. La seconde occurrence devient virtuelle.
        if unique in seen_ids:
            unique += ":" + hashlib.sha256(path.encode()).hexdigest()[:10]
        seen_ids.add(unique)
        kind = _kind(obj)
        tags = obj.get("Tags", [])
        if not isinstance(tags, list):
            tags = [tags] if isinstance(tags, str) else []
        safe_tags = [_text(tag, 48) for tag in tags if isinstance(tag, str)][:12]
        result.append({
            "id": unique,
            "key": key,
            "mac": mac,
            "name": name or ("Équipement réseau" if children else "Sans nom"),
            "parent": parent,
            "kind": kind,
            "tags": safe_tags,
            "children_count": len(children),
        })
        for index, child in enumerate(children[:_MAX_NODES]):
            walk(child, unique, f"{path}/{index}", depth + 1)

    for index, root in enumerate(roots[:8]):
        walk(root, None, str(index), 0)
    return {"nodes": result, "count": len(result), "source": "livebox-topologydiagnostics"}
