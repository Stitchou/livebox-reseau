"""Tests purs, sans Home Assistant ni Livebox réelle."""
import importlib.util
from pathlib import Path

file = Path(__file__).resolve().parents[1]/'custom_components/livebox_reseau/topology.py'
spec=importlib.util.spec_from_file_location('livebox_topology',file)
m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)


def test_topology_parents_and_security():
    raw={'status':[{'Key':'lb','Name':'Livebox 7','Password':'SECRET','Children':[
        {'Key':'sw-1','Name':'Switch','Children':[
            {'Key':'n1','Name':'HA','PhysAddress':'48:0F:CF:57:8E:2C'},
            {'Key':'n2','Name':'Syno815','PhysAddress':'00:11:32:73:AE:89'}]},
        {'Key':'cpl-1','Name':'CPL Spare1','Children':[
            {'Key':'n3','Name':'Shelly','PhysAddress':'AA-BB-CC-DD-EE-FF'}]},
        {'Key':'repeater','Name':'Velop RDC','Tags':['wifi_bridge'], 'Children':[
            {'Key':'n4','Name':'Alexa salon','PhysAddress':'F4:03:2A:14:D1:81'}]},
    ]}]}
    parsed=m.normalise_topology(raw)
    nodes=parsed['nodes'];assert parsed["count"]==8
    by_name={n['name']:n for n in nodes}
    assert by_name['HA']['parent']==by_name['Switch']['id']
    assert by_name['Shelly']['parent']==by_name['CPL Spare1']['id']
    assert by_name['Velop RDC']['kind']=='bridge'
    assert by_name['Alexa salon']['parent']==by_name['Velop RDC']['id']
    assert by_name['Shelly']['mac']=='AA:BB:CC:DD:EE:FF'
    assert 'SECRET' not in str(parsed) and 'Password' not in str(parsed)


def test_invalid_and_limits():
    assert m.normalise_topology({'status':[]})['count']==0
    assert m.normalise_topology({'status':'error'})['count']==0
    raw={'Name':'root','Children':[{'Name':'switch','Children':[{'Name':'node'}]}]}
    assert m.normalise_topology(raw)['count']==3
    raw={'Name':'root','Children':[{'Name':str(i)} for i in range(2000)]}
    assert m.normalise_topology(raw)['count']==450
    raw={'Name':'r','Children':[{'Name':'A','Key':'same'},{'Name':'B','Key':'same'}]}
    out=m.normalise_topology(raw)['nodes']
    assert len({x['id'] for x in out})==3
