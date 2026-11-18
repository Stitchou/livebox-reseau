from pathlib import Path
from playwright.sync_api import sync_playwright

root=Path(__file__).resolve().parents[1]
html=(root/'tests/test_browser.html').read_text()
start=html.index('<script>/* Livebox Réseau')
end=html.index('</script>',start)+len('</script>')
src=(root/'custom_components/livebox_reseau/frontend/livebox-topologie-card.js').read_text()
html=html[:start]+'<script>'+src+'</script>'+html[end:]
with sync_playwright() as pw:
    browser=pw.chromium.launch(headless=True,executable_path='/usr/bin/chromium',args=['--no-sandbox','--disable-dev-shm-usage','--disable-gpu'])
    for width in (1280,375):
        page=browser.new_page(viewport={'width':width,'height':850})
        errors=[];page.on('pageerror',lambda error:errors.append(str(error)))
        page.set_content(html,wait_until='domcontentloaded',timeout=12000)
        page.wait_for_function('el._devices.length>0',timeout=4000)
        page.evaluate('''() => {
          el._topology={count:6,nodes:[
           {id:'root',name:'Livebox',parent:null,kind:'device'},
           {id:'sw',name:'Switch Mercusys',parent:'root',kind:'switch'},
           {id:'ha',name:'HA',parent:'sw',kind:'device',mac:'00:11:22:33:44:02'},
           {id:'nas',name:'Syno815',parent:'sw',kind:'device',mac:'00:11:22:33:44:03'},
           {id:'cpl',name:'CPL Spare1',parent:'root',kind:'cpl',mac:'00:11:22:33:44:17'},
           {id:'sh',name:'Shelly Izy Portail',parent:'cpl',kind:'device',mac:'00:11:22:33:44:19'},
          ]};el._topologyStatus='ready';el._focusGroup('eth:ETH1');
        }''')
        page.wait_for_function("el.shadowRoot.getElementById('network').querySelectorAll('.nodes g').length >= 4",timeout=4000)
        rendered=page.locator('livebox-topologie-card svg .nodes g').all_text_contents()
        assert any('Switch Mercusys' in name for name in rendered),rendered
        parents=page.evaluate('''() => {
          const g=el._getGroups().find(g=>g.key==='eth:ETH1');return g.roots.find(n=>n.name==='Switch Mercusys').children.map(n=>n.name).sort();
        }''')
        assert parents==['HA','Syno815'],parents
        assert not errors, errors
        page.close()
    browser.close()
print('TOPOLOGY_BROWSER_OK: PC 1280 px + mobile 375 px, switch Mercusys & 2 children')
