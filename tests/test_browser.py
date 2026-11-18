from pathlib import Path
from playwright.sync_api import sync_playwright
from html import escape
import json

root=Path(__file__).resolve().parents[1]
js=(root/'custom_components/livebox_reseau/frontend/livebox-topologie-card.js').read_text()
data={}
rows=[('Stitch','ETH0'),('HA','ETH1'),('Syno815','ETH1'),('Base_Eufy','ETH1'),
('Velop RDC','ETH2'),('Alexa salon','ETH2'),('Barre de son','ETH2'),('OpenDTU','ETH2'),('Shelly Jardin','ETH2'),('miHome','ETH2'),('Samsung','ETH2'),('M7','ETH2'),('Congelateur','ETH2'),('Radiateur tahya','ETH2'),('dreame','ETH2'),('iPhone','ETH2'),('TV','ETH2'),('Velop Garage','ETH3'),('CPL Master','ETH4'),('Titan','ETH4'),('Titan 2','ETH4'),('Shelly Beem','ETH4'),('CPL Spare1','ETH4'),('CPL Spare1 2.4','ETH4'),('Shelly Izy Portail','ETH4'),('Shelly Sunflower','ETH4')]
for i,(name,iface) in enumerate(rows,1):
  eid='device_tracker.'+name.lower().replace(' ','_').replace('.','')
  data[eid]={'entity_id':eid,'state':'home' if i%5 else 'not_home','attributes':{'friendly_name':name,'source_type':'router','interface_name':iface,'ip':f'192.168.1.{i+15}','mac':f'00:11:22:33:44:{i:02X}','connection':'ethernet'}}
body='''<!doctype html><meta charset="utf-8"><title>Test carte</title>
<style>body{font-family:Arial,sans-serif;background:#111a21;color:#eee;margin:0;padding:16px}livebox-topologie-card{display:block;width:100%;max-width:1400px;margin:auto}ha-card{background:#14212b} :root{--primary-text-color:#e5eff1;--secondary-text-color:#b1c1cd;--card-background-color:#18232e;--secondary-background-color:#182b39;--divider-color:#425463;--primary-color:#03a9f4;--success-color:#10b981}</style>
<script>window.HASS_STATES=REPLACE_STATE;</script>
<script>REPLACE_SCRIPT</script>
<livebox-topologie-card></livebox-topologie-card>
<script>
const el=document.querySelector('livebox-topologie-card');
el.setConfig({type:'custom:livebox-topologie-card',title:'Mon réseau maison',router_name:'Livebox 7',router_ip:'192.168.1.1'});
el.hass={states:window.HASS_STATES,connection:{sendMessagePromise:async()=>({overrides:{},revision:1}),subscribeMessage:async()=>()=>{}}};
window.el=el;
</script>'''.replace('REPLACE_STATE',json.dumps(data)).replace('REPLACE_SCRIPT',js)
(root/'tests/test_browser.html').write_text(body)

with sync_playwright() as p:
  browser=p.chromium.launch(headless=True,executable_path='/usr/bin/chromium',args=['--no-sandbox','--disable-dev-shm-usage','--disable-gpu'])
  page=browser.new_page(viewport={'width':1440,'height':950},device_scale_factor=1)
  errors=[];page.on('pageerror',lambda err:errors.append(str(err)))
  page.set_content(body, wait_until='domcontentloaded', timeout=10000)
  page.wait_for_timeout(500)
  assert page.locator('livebox-topologie-card').count()==1
  overview=page.locator('livebox-topologie-card').evaluate('(el)=>[el.shadowRoot.querySelectorAll("svg .nodes g").length,el.shadowRoot.querySelector("#summary").textContent]')
  assert overview[0]>=6,overview
  page.screenshot(path=str(root/'tests/desktop_overview.png'),full_page=True)
  page.locator('livebox-topologie-card').evaluate('(el)=>el._focusGroup("eth:ETH2")')
  assert page.locator('livebox-topologie-card').evaluate('(el)=>el.shadowRoot.querySelectorAll("svg .nodes g").length')>=12
  page.screenshot(path=str(root/'tests/desktop_eth2.png'),full_page=True)
  browser.close()
  browser=p.chromium.launch(headless=True,executable_path='/usr/bin/chromium',args=['--no-sandbox','--disable-dev-shm-usage','--disable-gpu'])
  page=browser.new_page(viewport={'width':375,'height':780},device_scale_factor=1)
  page.on('pageerror',lambda err:errors.append(str(err)))
  page.set_content(body, wait_until='domcontentloaded', timeout=10000)
  page.wait_for_timeout(500)
  page.screenshot(path=str(root/'tests/mobile_overview.png'),full_page=True)
  page.locator('livebox-topologie-card').evaluate('(el)=>el._focusGroup("eth:ETH2")')
  page.screenshot(path=str(root/'tests/mobile_eth2.png'),full_page=True)
  print('BROWSER_TESTS',overview,'errors=',errors)
  assert not errors,errors
  browser.close()
