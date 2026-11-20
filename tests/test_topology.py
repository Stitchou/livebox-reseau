"""Tests purs, sans Home Assistant ni Livebox réelle."""
import importlib.util
from pathlib import Path

file = Path(__file__).resolve().parents[1]/'custom_components/livebox_reseau/topology.py'
spec=importlib.util.spec_from_file_location('livebox_topology',file)
m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)


def test_topology_parents_and_security():
    raw={'status':[{'Key':'lb','Name':'Livebox 7','Password':'SECRET','Children':[
        {'Key':'sw-1','Name':'Switch','Children':[
            {'Key':'n1','Name':'HA','PhysAddress':'02:00:00:00:00:01'},
            {'Key':'n2','Name':'NAS de test','PhysAddress':'02:00:00:00:00:02'}]},
        {'Key':'cpl-1','Name':'CPL secondaire','Children':[
            {'Key':'n3','Name':'Capteur de test','PhysAddress':'02-00-00-00-00-03'}]},
        {'Key':'repeater','Name':'Point Wi-Fi','Tags':['wifi_bridge'], 'Children':[
            {'Key':'n4','Name':'Téléphone de test','PhysAddress':'02:00:00:00:00:04'}]},
    ]}]}
    parsed=m.normalise_topology(raw)
    nodes=parsed['nodes'];assert parsed["count"]==8
    by_name={n['name']:n for n in nodes}
    assert by_name['HA']['parent']==by_name['Switch']['id']
    assert by_name['Capteur de test']['parent']==by_name['CPL secondaire']['id']
    assert by_name['Point Wi-Fi']['kind']=='bridge'
    assert by_name['Téléphone de test']['parent']==by_name['Point Wi-Fi']['id']
    assert by_name['Capteur de test']['mac']=='02:00:00:00:00:03'
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


def test_device_type_homeplug_is_not_a_name_heuristic():
    raw={'status':[{'Key':'root','Name':'Routeur','Children':[
        {'Key':'02:00:00:00:00:15','Name':'Device-2536','DeviceType':'HomePlug',
         'InterfaceName':'ETH3','Active':True,'Children':[
           {'Key':'02:00:00:00:00:16','Name':'Point exterieur','DeviceType':'Access Point'}]},
        {'Key':'02:00:00:00:00:17','Name':'Adaptateur Wi-Fi','DeviceType':'HomePlug'}]}]}
    data=m.normalise_topology(raw)
    plug=next(n for n in data['nodes'] if n['name']=='Device-2536')
    assert plug['kind']=='cpl' and plug['device_type']=='HomePlug'
    assert plug['mac']=='02:00:00:00:00:15'
    assert plug['interface_name']=='ETH3'
    assert next(n for n in data['nodes'] if n['name']=='Point exterieur')['parent']==plug['id']
    inventory=m.normalise_inventory({'02:00:00:00:00:15':{'Name':'Device-2536','DeviceType':'HomePlug',
        'InterfaceName':'ETH3','Active':True,'IPAddress':'192.0.2.15','Password':'TOP_SECRET'}})
    assert inventory[0]['device_type']=='HomePlug' and inventory[0]['active'] is True
    assert 'TOP_SECRET' not in str(inventory)
