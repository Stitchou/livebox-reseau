import asyncio, importlib.util, sys, types
from pathlib import Path

# Fausse API Home Assistant: teste le comportement du stockage sans HAOS réel.
vol=types.ModuleType('probatio');vol.Required=lambda key:key
sys.modules['probatio']=vol
ha=types.ModuleType('homeassistant');ha.__path__=[]
comp=types.ModuleType('homeassistant.components');comp.__path__=[]
ws=types.ModuleType('homeassistant.components.websocket_api')
ws.ERR_NOT_FOUND='not_found';ws.ERR_INVALID_FORMAT='invalid_format';ws.ERR_UNKNOWN_ERROR='unknown_error'
ws.websocket_command=lambda schema: lambda f:f
ws.async_response=lambda f:f
ws.require_admin=lambda f:f
ws.async_register_command=lambda hass,f:hass.registered.append(f.__name__)
ws.event_message=lambda id,payload:{'id':id,'event':payload}
core=types.ModuleType('homeassistant.core');core.HomeAssistant=object;core.callback=lambda f:f
helpers=types.ModuleType('homeassistant.helpers');helpers.__path__=[]
dispatcher=types.ModuleType('homeassistant.helpers.dispatcher')
dispatcher.async_dispatcher_connect=lambda hass,signal,fn:hass.listeners.setdefault(signal,[]).append(fn) or (lambda:None)
dispatcher.async_dispatcher_send=lambda hass,signal,payload:[f(payload) for f in hass.listeners.get(signal,[])]
storage=types.ModuleType('homeassistant.helpers.storage')
class Store:
    def __class_getitem__(cls, x):return cls
    def __init__(self,hass,version,key):self.hass=hass;self.key=key
    async def async_load(self):return self.hass.files.get(self.key)
    async def async_save(self,data):self.hass.files[self.key]=data
storage.Store=Store
sys.modules.update({'homeassistant':ha,'homeassistant.components':comp,'homeassistant.components.websocket_api':ws,'homeassistant.core':core,'homeassistant.helpers':helpers,'homeassistant.helpers.storage':storage,'homeassistant.helpers.dispatcher':dispatcher})
class Hass:
    def __init__(self):
        self.files={};self.data={};self.registered=[];self.listeners={};self.http=self
        self.static_paths=[]
    async def async_register_static_paths(self, paths):self.static_paths.extend(paths)
class StaticPathConfig:
    def __init__(self,url_path,path,cache_headers):
        self.url_path=url_path;self.path=path;self.cache_headers=cache_headers
http=types.ModuleType('homeassistant.components.http');http.StaticPathConfig=StaticPathConfig
sys.modules['homeassistant.components.http']=http
class FakeResources:
    def __init__(self):self.entries=[{'id':'existing','url':'/hacsfiles/other/file.js','type':'module'}]
    async def async_get_info(self):return {'resources':len(self.entries)}
    def async_items(self):return self.entries
    async def async_create_item(self,item):self.entries.append({'id':str(len(self.entries)),**item})
    async def async_update_item(self,id,updates):next(x for x in self.entries if x['id']==id).update(updates)

class Conn:
    def __init__(self):self.last=None;self.errors=[];self.messages=[];self.subscriptions={}
    def send_result(self,id,payload=None):self.last=payload
    def send_error(self,id,code,message):self.errors.append((code,message))
    def send_message(self,message):self.messages.append(message)
spec=importlib.util.spec_from_file_location('livebox_reseau',str(Path(__file__).resolve().parents[1] / 'custom_components/livebox_reseau/__init__.py'))
m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
async def main():
    hass=Hass();conn=Conn()
    resources=FakeResources();hass.data['lovelace']=types.SimpleNamespace(resource_mode='storage',resources=resources)
    assert await m.async_setup(hass,{})
    assert len(hass.registered)==4 and len(hass.static_paths)==1
    assert len(resources.entries)==2 and resources.entries[0]['url']=='/hacsfiles/other/file.js'
    assert resources.entries[1]['url'].startswith('/livebox-reseau/livebox-topologie-card.js')
    assert await m.async_setup_entry(hass,None)
    m.websocket_get(hass,conn,{'id':1});assert conn.last['overrides']=={}
    m.websocket_subscribe(hass,conn,{'id':2});assert len(conn.subscriptions)==1
    await m.websocket_set(hass,conn,{'id':3,'type':'livebox_reseau/set','key':'mac:AB','props':{'name':'Salon','parent':'device_tracker.velop_rdc','link':'wifi'}})
    assert conn.last['revision']==1 and conn.last['overrides']['mac:AB']['name']=='Salon'
    assert conn.messages[-1]['event']['revision']==1
    await m.websocket_set(hass,conn,{'id':4,'type':'livebox_reseau/set','key':'mac:CD','props':{'hidden':True}})
    assert len(conn.last['overrides'])==2 and conn.last['revision']==2
    await m.websocket_set(hass,conn,{'id':5,'type':'livebox_reseau/set','key':'mac:AB','props':{}})
    assert 'mac:AB' not in conn.last['overrides'] and conn.last['revision']==3
    await m.websocket_set(hass,conn,{'id':6,'type':'livebox_reseau/set','key':'mac:XX','props':{'link':'invalid'}})
    assert conn.errors[-1][0]=='invalid_format'
    assert conn.last['revision']==3
    await m.websocket_set(hass,conn,{'id':7,'type':'livebox_reseau/set','key':'mac:XX','props':{'link':['wifi']}})
    assert conn.errors[-1][0]=='invalid_format'
    await m.websocket_import(hass,conn,{'id':8,'type':'livebox_reseau/import','overrides':{'mac:AA':{'name':'Velop RDC'}}})
    assert conn.last['overrides']['mac:AA']['name']=='Velop RDC' and conn.last['revision']==4
    assert await m.async_unload_entry(hass,None)
    assert await m.async_setup_entry(hass,None)
    m.websocket_get(hass,conn,{'id':9})
    assert conn.last['overrides']['mac:AA']['name']=='Velop RDC' and conn.last['revision']==4
    print('BACKEND_TESTS_OK: commandes, ressource HA, persistance + diffusion simulées')
asyncio.run(main())
