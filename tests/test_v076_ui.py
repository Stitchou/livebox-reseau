"""v0.7.6: la fiche appareil ne propose plus de mapping manuel."""
from pathlib import Path
from playwright.sync_api import sync_playwright

root = Path(__file__).resolve().parents[1]
js = (root / 'custom_components/livebox_reseau/frontend/livebox-topologie-card.js').read_text()

states = {
    'device_tracker.plug': {'entity_id': 'device_tracker.plug', 'state': 'home', 'attributes': {
        'friendly_name': 'Adaptateur CPL', 'source_type': 'router', 'connection': 'ethernet',
        'interface_name': 'ETH3', 'mac': '02:00:00:00:00:01', 'ip': '192.0.2.39', 'type': 'HomePlug'}},
    'device_tracker.cudy': {'entity_id': 'device_tracker.cudy', 'state': 'home', 'attributes': {
        'friendly_name': 'Point accès extérieur', 'source_type': 'router', 'connection': 'ethernet',
        'interface_name': 'ETH3', 'mac': '02:00:00:00:00:02', 'ip': '192.0.2.40', 'type': 'Access Point'}},
}
topology = {'nodes': [
    {'id': 'root', 'parent': None, 'name': 'Box', 'kind': 'device'},
    {'id': 'cpl', 'parent': 'root', 'name': 'Adaptateur CPL', 'mac': '02:00:00:00:00:01', 'kind': 'cpl', 'device_type': 'HomePlug'},
    {'id': 'ap', 'parent': 'cpl', 'name': 'Point accès extérieur', 'mac': '02:00:00:00:00:02', 'kind': 'access_point', 'device_type': 'Access Point'},
], 'count': 3}
with sync_playwright() as pw:
    browser = pw.chromium.launch(headless=True, executable_path='/usr/bin/chromium', args=['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu'])
    try:
        page = browser.new_page(viewport={'width': 1100, 'height': 850})
        page.set_content('''<style>body{background:#16191d;color:white}ha-card{display:block;background:#222;color:white;}
          :root{--primary-text-color:#eee;--secondary-text-color:#aaa;--card-background-color:#222;
          --secondary-background-color:#292929;--divider-color:#444;--primary-color:#00aeef}</style>
          <livebox-topologie-card></livebox-topologie-card>''')
        page.add_script_tag(content=js)
        failures = []
        page.on('pageerror', lambda e: failures.append(str(e)))
        page.evaluate('''({states,topology}) => {
          const card = document.querySelector('livebox-topologie-card');
          card.setConfig({type:'custom:livebox-topologie-card'});
          card.hass = {states, connection: {
            sendMessagePromise: msg => Promise.resolve(msg.type==='livebox_reseau/get'
              ? {overrides:{'mac:020000000002':{group:'eth:ETH4',name:'Manually renamed',hidden:true}},revision:4}
              : topology),
            subscribeMessage:()=>Promise.resolve(()=>{})}};
        }''', {'states': states, 'topology': topology})
        page.wait_for_function("document.querySelector('livebox-topologie-card')?._topologyStatus==='ready'")
        card = page.locator('livebox-topologie-card')
        card.locator('#expand-all').click()
        card.get_by_role('button', name='Point accès extérieur').click()
        detail = card.locator('#detail')
        assert detail.is_visible()
        assert detail.get_by_role('button', name='Fiche HA').count() == 1
        assert detail.get_by_role('button', name='Fermer la fiche').count() == 1
        assert detail.get_by_text('Configurer').count() == 0
        assert card.locator('#hidden').count() == 0
        assert card.locator('select').count() == 0
        assert card.locator('#modal-host .dialog').count() == 0
        assert 'Manually renamed' not in detail.inner_text()
        assert card.evaluate("el=>el._getGroups().find(g=>g.key==='eth:ETH3').roots[0].children[0].name") == 'Point accès extérieur'
        detail.get_by_role('button', name='Fermer la fiche').click()
        assert not detail.is_visible()
        assert not failures, failures
        print('V076_UI_OK: Fiche HA + Fermer, aucun Configurer, aucun mapping, overrides historiques ignorés')
    finally:
        browser.close()
