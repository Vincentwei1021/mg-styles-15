"""blender -b work/scene.blend -P blender/render.py -- --frames 0,48,144 --pct 50 --out out/test --samples 128
v5: MG_ROOT=<project root on the render box> MG_DEVICE=OPTIX, --nolink hides the chrome period + its shadow-light pair
(no ball in any ray -> no reflection either; the capsule field still reacts exactly as in the normal plates)."""
import bpy, sys, os, time, argparse
argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
ap = argparse.ArgumentParser()
ap.add_argument('--frames', default='0')
ap.add_argument('--range', default=None)          # a:b inclusive
ap.add_argument('--pct', type=int, default=100)
ap.add_argument('--samples', type=int, default=0)
ap.add_argument('--thresh', type=float, default=0)
ap.add_argument('--out', default='out/frames')
ap.add_argument('--nomb', action='store_true')
ap.add_argument('--skip', action='store_true')
ap.add_argument('--shutter', default='')          # per-frame override 'f=val,f=val' (hero fall readability)
ap.add_argument('--nolink', action='store_true')  # v5: render without the dot (ball + its shadow/reflection)
a = ap.parse_args(argv)
DEMO = os.environ.get('MG_ROOT', os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', '..'))) + '/demos/04-3d-render'
DEV = os.environ.get('MG_DEVICE', 'METAL')
sc = bpy.context.scene
prefs = bpy.context.preferences.addons['cycles'].preferences
prefs.compute_device_type = DEV; prefs.get_devices()
for d in prefs.devices:
    d.use = d.type == DEV
print('devices', [(d.name, d.type, d.use) for d in prefs.devices], flush=True)
sc.cycles.device = 'GPU'
sc.render.resolution_percentage = a.pct
if a.samples: sc.cycles.samples = a.samples
if a.thresh: sc.cycles.adaptive_threshold = a.thresh
if a.nomb: sc.render.use_motion_blur = False
if a.nolink:
    # only the ball is hidden: the shadow-light pair then cancels exactly (its + spot is shadowed by the ball alone), and keeping
    # both lights keeps Cycles' light sampling -> the noise pattern identical to the normal plates everywhere the ball has no effect
    for nm in (('period', 'shadow_pos', 'shadow_neg') if os.environ.get('NOLINK_LIGHTS_OFF') else ('period',)):
        bpy.data.objects[nm].hide_render = True
frames = list(range(int(a.range.split(':')[0]), int(a.range.split(':')[1]) + 1)) if a.range else [int(x) for x in a.frames.split(',')]
od = a.out if a.out.startswith('/') else f'{DEMO}/{a.out}'
os.makedirs(od, exist_ok=True)
for f in frames:
    path = f'{od}/{f:04d}.png'
    if a.skip and os.path.exists(path):
        continue
    t0 = time.time()
    SH = dict((int(k), float(v)) for k, v in (x.split('=') for x in a.shutter.split(',') if x))
    sc.render.motion_blur_shutter = SH.get(f, 0.5)
    sc.frame_set(f)
    sc.render.filepath = path + '.tmp.png'
    bpy.ops.render.render(write_still=True)
    os.replace(path + '.tmp.png', path)          # atomic: a killed render never leaves a half-written plate
    print(f'FRAME {f} {time.time() - t0:.1f}s', flush=True)
