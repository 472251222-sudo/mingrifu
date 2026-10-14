"""Reopen every delivered new .blend and render from saved settings, no reconstruction."""
import argparse
import json
import sys
import time
from pathlib import Path
import bpy
HERE=Path(__file__).resolve().parent
parser=argparse.ArgumentParser();parser.add_argument('--source',type=Path,default=HERE/'source-models-v2');parser.add_argument('--output',type=Path,required=True)
args=parser.parse_args(sys.argv[sys.argv.index('--')+1:]);args.output.mkdir(parents=True,exist_ok=False)
records=[]
for folder in sorted(args.source.iterdir()):
    if not (folder/'record.json').is_file():continue
    info=json.loads((folder/'record.json').read_text());asset=info['id'];start=time.perf_counter()
    bpy.ops.wm.open_mainfile(filepath=str((folder/(asset+'.blend')).resolve()))
    bpy.context.scene.render.filepath=str((args.output/(asset+'-raw.png')).resolve());bpy.ops.render.render(write_still=True)
    records.append({'id':asset,'openedExistingBlend':True,'meshObjects':sum(o.type=='MESH' for o in bpy.data.objects),'seconds':round(time.perf_counter()-start,3)})
(args.output/'reopen-records.json').write_text(json.dumps(records,indent=2)+'\n');print(json.dumps(records))
