"""Chromium: rendu Desktop/mobile avec topologie et capteurs Linksys FICTIFS."""
from pathlib import Path
import json
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1]
JS=(ROOT/'custom_components/livebox_reseau/frontend/livebox-topologie-card.js').read_text()

def mac(n): return f'02:00:00:00:00:{n:02X}'
def device(n,name,iface,kind='AC Outlet'):
    return {'entity_id':f'device_tracker.test_{n}','state':'home','attributes':{
        'friendly_name':name,'source_type':'router','connection':'ethernet','interface_name':iface,
        'mac':mac(n),'ip':f'192.0.2.{n}','type':kind}}
items=[device(1,'Adaptateur principal','ETH3','HomePlug'),device(2,'Adaptateur Wi-Fi','ETH3','HomePlug'),
       device(3,'Adaptateur Wi-Fi_2.4','ETH3'),device(4,'Adaptateur secondaire','ETH3','HomePlug'),
       device(5,'Point extérieur A','ETH3','Access Point'),device(6,'Capteur A','ETH3'),
       device(7,'Prise B','ETH3'),device(8,'Point Wi-Fi salon','ETH2','ExtenderWiFiPlus'),
       device(9,'Point Wi-Fi garage','ETH4','ExtenderWiFiPlus'),device(10,'Prise piscine','ETH4'),
       device(11,'Serveur','ETH1','Computer'),device(12,'Console','ETH2','Game Console')]
states={d['entity_id']:d for d in items}
for i,(label,clients) in enumerate([('Point Wi-Fi garage',[{'mac':mac(10),'type':'wireless','band':'2.4GHz','rssi_dbm':-71},
                                                  {'mac':mac(11),'type':'wired'}]),
                                   ('Point Wi-Fi salon',[{'mac':mac(12),'type':'wireless','band':'5GHz'}])],1):
    key=f'sensor.network_test_{i}_connected_devices'
    states[key]={'entity_id':key,'state':'2','attributes':{'friendly_name':label+' Connected Devices','devices':clients}}
nodes=[dict(id='root',parent=None,name='Routeur test',kind='device')]
for id,par,n in [('m','root',1),('spare','root',2),('radio','spare',3),('second','root',4),
                 ('outdoor','second',5),('sensor','radio',6),('socket','radio',7),
                 ('salon','root',8),('garage','root',9),('pump','root',10),('server','root',11),('console','root',12)]:
    nodes.append({'id':id,'parent':par,'mac':mac(n),'name':items[n-1]['attributes']['friendly_name'],
                  'kind':'cpl' if n in (1,2,4) else 'repeater' if n in (8,9) else 'device',
                  'device_type':items[n-1]['attributes']['type']})
topology={'nodes':nodes,'count':len(nodes)}
html='''<!doctype html><html><head><meta charset="utf-8"><style>
:root{--primary-text-color:#e4eaf2;--secondary-text-color:#aaa;--card-background-color:#20252b;
--secondary-background-color:#292f36;--primary-color:#03a9f4;--divider-color:#4e5660;--success-color:#48ca78;}
body{background:#15191f;color:#f0f0f0;font-family:Arial;margin:0;padding:16px}
ha-card{border:1px solid #48515b;background:#20252b}
livebox-topologie-card{display:block;max-width:1500px;margin:auto;width:100%}
</style></head><body><livebox-topologie-card></livebox-topologie-card></body></html>'''

def setup(page):
    page.set_content(html)
    page.add_script_tag(content=JS)
    page.evaluate('''({states,topology})=>{
       const card=document.querySelector('livebox-topologie-card');
       card.setConfig({type:'custom:livebox-topologie-card',title:'Réseau de démonstration',router_name:'Routeur de test',router_ip:'192.0.2.1'});
       card.hass={states,connection:{sendMessagePromise:msg=>Promise.resolve(msg.type==='livebox_reseau/get'?{overrides:{},revision:1}:topology),subscribeMessage:()=>Promise.resolve(()=>{})}};
       }''',{'states':states,'topology':topology})
    page.wait_for_function("document.querySelector('livebox-topologie-card')?._topologyStatus==='ready'")
    page.wait_for_function("document.querySelector('livebox-topologie-card')?._devices.length===12")

with sync_playwright() as p:
    b=p.chromium.launch(headless=True,executable_path='/usr/bin/chromium',args=['--no-sandbox','--disable-dev-shm-usage','--disable-gpu'])
    try:
        desktop=b.new_page(viewport={'width':1700,'height':1050}); errors=[]
        desktop.on('pageerror',lambda e: errors.append(str(e)))
        setup(desktop)
        desktop.locator('livebox-topologie-card #expand-all').click()
        desktop.wait_for_timeout(450)
        outcome=desktop.evaluate('''()=>{
          const card=document.querySelector('livebox-topologie-card');
          const groups=card._getGroups();let all=[];function w(n){all.push(n);n.children.forEach(w)}groups.forEach(g=>g.roots.forEach(w));
          const g=groups.find(g=>g.key==='eth:ETH3');
          return { count:all.length,root:g.roots.map(n=>n.name),
           spare:g.roots.find(n=>n.name==='Adaptateur Wi-Fi')?.children.map(n=>n.name),
           second:g.roots.find(n=>n.name==='Adaptateur secondaire')?.children.map(n=>n.name),
           rgb:[...card.shadowRoot.querySelectorAll('.node-pill.is-cpl')].length,
           groups:card.shadowRoot.querySelectorAll('.cluster-children.cpl').length,
           wires:card.shadowRoot.querySelectorAll('.network-wires path').length,
           garage:all.find(n=>n.name==='Prise piscine')?.parentId,
           server:all.find(n=>n.name==='Serveur')?.parentId};
        }''')
        assert outcome['count']==12,outcome
        assert outcome['root']==['Adaptateur principal','Adaptateur secondaire','Adaptateur Wi-Fi'],outcome
        assert outcome['spare']==['Adaptateur Wi-Fi_2.4'],outcome
        assert outcome['second']==['Point extérieur A'],outcome
        assert outcome['rgb']>=4,outcome
        assert outcome['groups']>=2,outcome
        assert outcome['wires']>=8,outcome
        assert outcome['server'] is None,outcome
        assert not errors,errors
        desktop.screenshot(path=str(ROOT/'assets/topologie-exemple-fictif.png'),full_page=True)
        mobile=b.new_page(viewport={'width':375,'height':850}); mobileerrors=[]
        mobile.on('pageerror',lambda e:mobileerrors.append(str(e)))
        setup(mobile)
        mobile.locator('livebox-topologie-card #expand-all').click()
        mobile.wait_for_timeout(400)
        size=mobile.evaluate('''()=>({scroll:document.documentElement.scrollWidth,width:document.documentElement.clientWidth,
           paths:document.querySelector('livebox-topologie-card').shadowRoot.querySelectorAll('.network-wires path').length})''')
        assert size['scroll']<=size['width']+2,size
        assert size['paths']>=8,size
        assert not mobileerrors,mobileerrors
        mobile.screenshot(path=str(ROOT/'assets/topologie-mobile-fictif.png'),full_page=True)
        print('V074_UI_OK',json.dumps(outcome,ensure_ascii=False),'mobile',size)
    finally:b.close()
