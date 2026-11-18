"""Configuration UI de Livebox Réseau : aucune donnée de connexion nécessaire."""

try:
    import probatio as vol
except ImportError:
    import voluptuous as vol
from homeassistant import config_entries

DOMAIN = "livebox_reseau"


class LiveboxReseauConfigFlow(config_entries.ConfigFlow, domain=DOMAIN):
    """Permet d'activer le stockage partagé depuis l'interface de HA."""

    VERSION = 1

    async def async_step_user(self, user_input=None):
        if self._async_current_entries():
            return self.async_abort(reason="single_instance_allowed")
        if user_input is not None:
            return self.async_create_entry(title="Livebox Réseau", data={})
        return self.async_show_form(step_id="user", data_schema=vol.Schema({}))
