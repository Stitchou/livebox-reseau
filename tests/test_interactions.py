"""Interactions réelles (et non appels directs aux méthodes de la carte)."""
from pathlib import Path
from playwright.sync_api import sync_playwright

body = (Path(__file__).parent / 'test_browser.html').read_text()
with sync_playwright() as p:
    browser = p.chromium.launch(headless=True, executable_path='/usr/bin/chromium',
                                args=['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu'])
    for width in (1280, 375):
        page = browser.new_page(viewport={'width': width, 'height': 850})
        errors = []
        page.on('pageerror', lambda e: errors.append(str(e)))
        page.set_content(body, wait_until='domcontentloaded')
        host = page.locator('livebox-topologie-card')
        assert host.evaluate('(e)=>e._focus') is None
        page.locator('livebox-topologie-card svg .nodes g').filter(has_text='Ethernet · ETH2').first.click(force=True)
        assert host.evaluate('(e)=>e._focus') == 'eth:ETH2', 'Clic ETH2 sans effet'
        page.locator('livebox-topologie-card svg .nodes g').filter(has_text='Alexa salon').first.click(force=True)
        assert host.evaluate('(e)=>e.shadowRoot.getElementById("detail").classList.contains("visible")')
        page.locator('livebox-topologie-card #back').click()
        assert host.evaluate('(e)=>e._focus') is None
        assert not errors, errors
        page.close()
    page = browser.new_page(viewport={'width': 1200, 'height': 850})
    errors = []
    page.on('pageerror', lambda e: errors.append(str(e)))
    page.set_content(body, wait_until='domcontentloaded')
    result = page.evaluate('''() => {
      const Card = customElements.get('livebox-topologie-card');
      const editor = Card.getConfigElement();
      const updates = [];
      editor.addEventListener('config-changed', e => updates.push(e.detail.config));
      document.body.appendChild(editor);
      editor.setConfig({type:'custom:livebox-topologie-card',title:'Ancien',grid_options:{columns:'full'}});
      editor.shadowRoot.querySelector('input[type=text]').value='Nouveau titre';
      editor.shadowRoot.querySelector('input[type=text]').dispatchEvent(new Event('change',{bubbles:true}));
      const checkbox=editor.shadowRoot.querySelector('input[type=checkbox]');
      checkbox.checked=false;
      checkbox.dispatchEvent(new Event('change',{bubbles:true}));
      return updates;
    }''')
    assert result[-1]['title'] == 'Nouveau titre'
    assert result[-1]['auto_velop_rdc'] is False
    assert result[-1]['grid_options'] == {'columns':'full'}
    host = page.locator('livebox-topologie-card')
    host.evaluate('(e)=>e._focusGroup("eth:ETH2")')
    host.evaluate('(e)=>e._changeZoom(1.8)')
    canvas = page.locator('livebox-topologie-card svg#network')
    before = canvas.get_attribute('viewBox')
    box = canvas.bounding_box()
    page.mouse.move(box['x']+box['width']*.5,box['y']+box['height']*.5)
    page.mouse.down()
    page.mouse.move(box['x']+box['width']*.7,box['y']+box['height']*.7,steps=9)
    page.mouse.up()
    assert canvas.get_attribute('viewBox') != before, 'Glisser ne déplace plus la carte'
    assert not errors, errors
    browser.close()
print('INTERACTION_TESTS_OK: clic ETH PC/mobile, fiche, retour, éditeur visuel, glissement')
