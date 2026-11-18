from pathlib import Path
from playwright.sync_api import sync_playwright
root=Path(__file__).resolve().parents[1]
html=(root/'tests/test_browser.html').read_text()
with sync_playwright() as p:
    browser=p.chromium.launch(headless=True,executable_path='/usr/bin/chromium',args=['--no-sandbox','--disable-dev-shm-usage','--disable-gpu'])
    page=browser.new_page(viewport={'width':1200,'height':850})
    errors=[]
    page.on('pageerror', lambda e:errors.append(str(e)))
    page.set_content(html,wait_until='domcontentloaded',timeout=10000)
    page.wait_for_function('el._devices.length > 0',timeout=3000)
    page.evaluate('''() => {
       window.saved={};
       el._hass.connection.sendMessagePromise=async req=> {
         if(req.type==='livebox_reseau/get')return {overrides:window.saved,revision:1};
         if(req.type==='livebox_reseau/set'){window.saved[req.key]=req.props; return {overrides:window.saved,revision:2};}
         throw Error('unknown command');
       };
       el._hass.connection.subscribeMessage=async()=>()=>{};
       el._backendStatus='ready'; el._paint();
       const d=el._devices.find(d=>d.name==='Alexa salon'); el._editDevice(d);
       const input=el.shadowRoot.querySelector('.dialog input[type=text],.dialog input:not([type])');
       input.value='Alexa salon configurée';
       const save=[...el.shadowRoot.querySelectorAll('.dialog button')].find(b=>b.textContent==='Enregistrer');
       save.click();
    }''')
    page.wait_for_function('Object.keys(window.saved).length===1',timeout=3000)
    saved=page.evaluate('window.saved')
    assert list(saved.values())[0]['name']=='Alexa salon configurée',saved
    page.evaluate('''() => {
       const other=document.createElement('livebox-topologie-card'); document.body.appendChild(other);
       other.setConfig({type:'custom:livebox-topologie-card'});
       other.hass=el._hass;
       window.other=other;
    }''')
    page.wait_for_function("Object.keys(other._overrides||{}).length===1 && other._devices.length>0",timeout=3000)
    result=page.evaluate('other._getGroups().find(g=>g.key==="eth:ETH2").roots[0].children.some(d=>d.name==="Alexa salon configurée")')
    assert result, 'Second browser card did not recover custom name'
    assert not errors,errors
    print('BROWSER_STORAGE_OK: edition envoyée par WS simulé + récupération par seconde carte')
    browser.close()
