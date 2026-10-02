"""Build the 'soft.' scene from work/anim.npz and save work/scene.blend.
blender -b --factory-startup -P blender/scene.py"""
import bpy, bmesh, sys, os, math
import numpy as np
sys.path.insert(0, os.path.dirname(__file__))
from common import *

A = np.load(f'{WORK}/anim.npz')
# v5.1 (jury: 3D渲染 read pink-on-lilac): V5_LOOK=b (default under V5) = deep ink-teal capsule bodies + ink floor under the
# carpet, so after the impact flip the pink clay sits on a dark cool bed; V5_LOOK=a rebuilds the v5.0 lilac bed. No effect without V5.
V5LOOK = os.environ.get('V5_LOOK', 'b') if V5 else ''
BODY_COL = '#08222B' if V5LOOK == 'b' else '#C6B9F3'
FLOOR_INK = '#0A1E24'
FR = A['frames']                    # frame numbers (-PAD .. NF-1+PAD)
NT = len(FR)
P = A['P']; N = len(P)

bpy.ops.wm.read_factory_settings(use_empty=True)
sc = bpy.context.scene
sc.render.fps = FPS
sc.frame_start, sc.frame_end = 0, NF - 1
bpy.context.preferences.edit.keyframe_new_interpolation_type = 'LINEAR'


def hexcol(h, a=1.0):
    h = h.lstrip('#')
    c = [int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    lin = [x / 12.92 if x <= 0.04045 else ((x + 0.055) / 1.055) ** 2.4 for x in c]
    return (*lin, a)


# ------------------------------------------------------------------ render settings
sc.render.engine = 'CYCLES'
cy = sc.cycles
prefs = bpy.context.preferences.addons['cycles'].preferences
DEV = os.environ.get('MG_DEVICE', 'METAL')      # v5: OPTIX / CUDA on the Linux render box
prefs.compute_device_type = DEV
prefs.get_devices()
for d in prefs.devices:
    d.use = d.type == DEV
cy.device = 'GPU'
cy.samples = 24
cy.use_adaptive_sampling = True
cy.adaptive_threshold = 0.035
cy.adaptive_min_samples = 12
cy.use_denoising = True
cy.denoiser = 'OPENIMAGEDENOISE'
try:
    cy.denoising_use_gpu = True
except Exception:
    pass
cy.max_bounces = 8; cy.diffuse_bounces = 3; cy.glossy_bounces = 4; cy.transmission_bounces = 4
cy.transparent_max_bounces = 8; cy.volume_bounces = 0
cy.caustics_reflective = False; cy.caustics_refractive = False
cy.blur_glossy = 0.8
cy.sample_clamp_indirect = 6.0
cy.filter_width = 1.4
sc.render.use_persistent_data = True
sc.render.resolution_x, sc.render.resolution_y = 1920, 1080
sc.render.resolution_percentage = 100
sc.render.use_motion_blur = True
sc.render.motion_blur_shutter = 0.5
sc.render.film_transparent = False
sc.render.image_settings.file_format = 'PNG'
sc.render.image_settings.color_depth = '8'
sc.render.image_settings.color_mode = 'RGB'
sc.render.image_settings.compression = 15
sc.render.dither_intensity = 1.0
for vt in ('Khronos PBR Neutral', 'AgX', 'Standard'):
    try:
        sc.view_settings.view_transform = vt
        break
    except TypeError:
        pass
sc.view_settings.look = 'None'
sc.view_settings.exposure = -1.2

# ------------------------------------------------------------------ world (studio HDRI for reflections)
world = bpy.data.worlds.new('World'); sc.world = world
wt = world.node_tree
for n in list(wt.nodes):
    wt.nodes.remove(n)
tex = wt.nodes.new('ShaderNodeTexEnvironment')
tex.image = bpy.data.images.load(f'{ROOT}/assets/hdri/studio_small_09_2k.hdr')
mapn = wt.nodes.new('ShaderNodeMapping'); coord = wt.nodes.new('ShaderNodeTexCoord')
mapn.inputs['Rotation'].default_value[2] = math.radians(200)
wt.links.new(coord.outputs['Generated'], mapn.inputs['Vector']); wt.links.new(mapn.outputs['Vector'], tex.inputs['Vector'])
bg = wt.nodes.new('ShaderNodeBackground'); bg.inputs['Strength'].default_value = 0.4
tint = wt.nodes.new('ShaderNodeMix'); tint.data_type = 'RGBA'; tint.blend_type = 'MULTIPLY'
tint.inputs['Factor'].default_value = 0.25
tint.inputs['B'].default_value = hexcol('#EADCF2')
wt.links.new(tex.outputs['Color'], tint.inputs['A'])
# lift the dark parts of the studio HDRI to a pastel floor so chrome never reflects black
lift = wt.nodes.new('ShaderNodeMix'); lift.data_type = 'RGBA'; lift.blend_type = 'LIGHTEN'; lift.inputs['Factor'].default_value = 1.0
lift.inputs['B'].default_value = tuple(c * 0.75 for c in hexcol('#EADCF0')[:3]) + (1.0,)
wt.links.new(tint.outputs['Result'], lift.inputs['A']); wt.links.new(lift.outputs['Result'], bg.inputs['Color'])
out = wt.nodes.new('ShaderNodeOutputWorld')
# glossy rays see a bright pastel studio sky (gradient: soft horizon -> bright top) so chrome/coats read as a big softbox,
# while diffuse lighting keeps using the dimmer HDRI (contrast stays)
lp = wt.nodes.new('ShaderNodeLightPath')
gsep = wt.nodes.new('ShaderNodeSeparateXYZ'); wt.links.new(coord.outputs['Generated'], gsep.inputs[0])
gmr = wt.nodes.new('ShaderNodeMapRange'); gmr.inputs['From Min'].default_value = -0.05; gmr.inputs['From Max'].default_value = 0.75
gmr.inputs['To Min'].default_value = 0.42; gmr.inputs['To Max'].default_value = 1.45; gmr.interpolation_type = 'SMOOTHSTEP'
wt.links.new(gsep.outputs['Z'], gmr.inputs['Value'])
bg2 = wt.nodes.new('ShaderNodeBackground'); bg2.inputs['Color'].default_value = hexcol('#F6E8F1')
wt.links.new(gmr.outputs['Result'], bg2.inputs['Strength'])
# keep the HDRI's octa softboxes as highlights on top of the pastel sky
addh = wt.nodes.new('ShaderNodeAddShader'); bgh = wt.nodes.new('ShaderNodeBackground'); bgh.inputs['Strength'].default_value = 0.35
hi = wt.nodes.new('ShaderNodeMath'); hi.operation = 'MAXIMUM'
wt.links.new(tex.outputs['Color'], bgh.inputs['Color'])
wt.links.new(bg2.outputs[0], addh.inputs[0]); wt.links.new(bgh.outputs[0], addh.inputs[1])
mxs = wt.nodes.new('ShaderNodeMixShader')
wt.links.new(lp.outputs['Is Glossy Ray'], mxs.inputs[0]); wt.links.new(bg.outputs['Background'], mxs.inputs[1])
wt.links.new(addh.outputs[0], mxs.inputs[2]); wt.links.new(mxs.outputs[0], out.inputs['Surface'])


# ------------------------------------------------------------------ materials
def principled(name, **kw):
    m = bpy.data.materials.new(name)
    nt = m.node_tree
    b = next(n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED')
    for k, v in kw.items():
        sock = next((x for x in b.inputs if x.name == k), None)
        if sock is None:
            print('WARN missing input', k); continue
        sock.default_value = v
    return m, b, nt


def mat_cyc():
    m, b, nt = principled('cyc', **{'Base Color': hexcol('#F1E4EC'), 'Roughness': 0.85, 'Specular IOR Level': 0.25,
                                    'Emission Color': hexcol('#F4E6F0')})
    # self-lit infinite-cyc gradient: glows from the far floor up the wall, so the backdrop never goes grey
    tc = nt.nodes.new('ShaderNodeTexCoord'); sep = nt.nodes.new('ShaderNodeSeparateXYZ')
    nt.links.new(tc.outputs['Object'], sep.inputs[0])
    my = nt.nodes.new('ShaderNodeMapRange'); my.inputs['From Min'].default_value = 5.5; my.inputs['From Max'].default_value = 15.0
    my.inputs['To Min'].default_value = 0.0; my.inputs['To Max'].default_value = 1.0; my.interpolation_type = 'SMOOTHSTEP'
    nt.links.new(sep.outputs['Y'], my.inputs['Value'])
    mz = nt.nodes.new('ShaderNodeMapRange'); mz.inputs['From Min'].default_value = 0.0; mz.inputs['From Max'].default_value = 12.0
    mz.inputs['To Min'].default_value = 1.0; mz.inputs['To Max'].default_value = 0.72; mz.interpolation_type = 'SMOOTHSTEP'
    nt.links.new(sep.outputs['Z'], mz.inputs['Value'])
    mul = nt.nodes.new('ShaderNodeMath'); mul.operation = 'MULTIPLY'
    nt.links.new(my.outputs['Result'], mul.inputs[0]); nt.links.new(mz.outputs['Result'], mul.inputs[1])
    mul2 = nt.nodes.new('ShaderNodeMath'); mul2.operation = 'MULTIPLY_ADD'; mul2.inputs[1].default_value = 1.6
    nt.links.new(mul.outputs[0], mul2.inputs[0])
    # the floor behind the camera glows softly too (only seen in reflections: keeps the chrome pastel)
    mf = nt.nodes.new('ShaderNodeMapRange'); mf.inputs['From Min'].default_value = -13.0; mf.inputs['From Max'].default_value = -6.0
    mf.inputs['To Min'].default_value = 0.9; mf.inputs['To Max'].default_value = 0.0; mf.interpolation_type = 'SMOOTHSTEP'
    nt.links.new(sep.outputs['Y'], mf.inputs['Value']); nt.links.new(mf.outputs['Result'], mul2.inputs[2])
    nt.links.new(mul2.outputs[0], b.inputs['Emission Strength'])
    m.cycles.emission_sampling = 'NONE'
    # r1: floor AO (under the capsule carpet + letter/ball contact) darkens both the albedo and the self-glow
    ao = nt.nodes.new('ShaderNodeAmbientOcclusion'); ao.samples = 8; ao.inputs['Distance'].default_value = 0.35
    aom = nt.nodes.new('ShaderNodeMix'); aom.data_type = 'RGBA'; aom.blend_type = 'MULTIPLY'; aom.inputs['Factor'].default_value = 0.6
    aom.inputs['A'].default_value = hexcol('#F1E4EC'); nt.links.new(ao.outputs['AO'], aom.inputs['B'])
    nt.links.new(aom.outputs['Result'], b.inputs['Base Color'])
    # r2: under the crown the bare floor is capsule-cap cream at ~55 % value, fully matte (reads as a dark crater at the launch)
    bxy = nt.nodes.new('ShaderNodeCombineXYZ'); bxy.inputs['X'].default_value = float(BALL_X_SCENE)
    dxy = nt.nodes.new('ShaderNodeVectorMath'); dxy.operation = 'DISTANCE'
    fl = nt.nodes.new('ShaderNodeCombineXYZ'); nt.links.new(sep.outputs['X'], fl.inputs['X']); nt.links.new(sep.outputs['Y'], fl.inputs['Y'])
    nt.links.new(fl.outputs[0], dxy.inputs[0]); nt.links.new(bxy.outputs[0], dxy.inputs[1])
    dm = nt.nodes.new('ShaderNodeMapRange'); dm.inputs['From Min'].default_value = 1.8; dm.inputs['From Max'].default_value = 3.2
    dm.inputs['To Min'].default_value = 1.0; dm.inputs['To Max'].default_value = 0.0; dm.interpolation_type = 'SMOOTHSTEP'
    nt.links.new(dxy.outputs['Value'], dm.inputs['Value'])
    zc = nt.nodes.new('ShaderNodeMapRange'); zc.inputs['From Min'].default_value = 0.2; zc.inputs['From Max'].default_value = 0.6
    zc.inputs['To Min'].default_value = 1.0; zc.inputs['To Max'].default_value = 0.0
    nt.links.new(sep.outputs['Z'], zc.inputs['Value'])
    dmz = nt.nodes.new('ShaderNodeMath'); dmz.operation = 'MULTIPLY'
    nt.links.new(dm.outputs['Result'], dmz.inputs[0]); nt.links.new(zc.outputs['Result'], dmz.inputs[1])
    dk = nt.nodes.new('ShaderNodeMix'); dk.data_type = 'RGBA'; dk.inputs['A'].default_value = hexcol('#F1E4EC'); dk.inputs['B'].default_value = hexcol('#817971')
    if V5LOOK == 'b':    # v5.1: floor under the capsule carpet (y < 12.6) goes ink so the gaps between dark capsules stay dark
        cm = nt.nodes.new('ShaderNodeMapRange'); cm.inputs['From Min'].default_value = 11.0; cm.inputs['From Max'].default_value = 13.5
        cm.inputs['To Min'].default_value = 1.0; cm.inputs['To Max'].default_value = 0.0; cm.interpolation_type = 'SMOOTHSTEP'
        nt.links.new(sep.outputs['Y'], cm.inputs['Value'])
        fk = nt.nodes.new('ShaderNodeMix'); fk.data_type = 'RGBA'; fk.inputs['A'].default_value = hexcol('#F1E4EC'); fk.inputs['B'].default_value = hexcol(FLOOR_INK)
        nt.links.new(cm.outputs['Result'], fk.inputs['Factor']); nt.links.new(fk.outputs['Result'], dk.inputs['A'])
    nt.links.new(dmz.outputs[0], dk.inputs['Factor']); nt.links.new(dk.outputs['Result'], aom.inputs['A'])
    rg = nt.nodes.new('ShaderNodeMapRange'); rg.inputs['To Min'].default_value = 0.85; rg.inputs['To Max'].default_value = 0.95
    nt.links.new(dmz.outputs[0], rg.inputs['Value']); nt.links.new(rg.outputs['Result'], b.inputs['Roughness'])
    sp_ = nt.nodes.new('ShaderNodeMapRange'); sp_.inputs['To Min'].default_value = 0.25; sp_.inputs['To Max'].default_value = 0.05
    nt.links.new(dmz.outputs[0], sp_.inputs['Value']); nt.links.new(sp_.outputs['Result'], b.inputs['Specular IOR Level'])
    return m


def mat_pill(name, col, rough=0.30, coat=1.0, spec=0.5, fxcol='#FF6FAE'):
    m, b, nt = principled(name, **{'Base Color': hexcol(col), 'Roughness': rough, 'Coat Weight': coat, 'Coat Roughness': 0.06,
                                   'Coat IOR': 1.5, 'Subsurface Weight': 0.0, 'Specular IOR Level': spec})
    af = nt.nodes.new('ShaderNodeAttribute'); af.attribute_type = 'INSTANCER'; af.attribute_name = 'fx'
    oi = nt.nodes.new('ShaderNodeObjectInfo')
    hsv = nt.nodes.new('ShaderNodeHueSaturation')
    jv = nt.nodes.new('ShaderNodeMapRange'); jv.inputs['To Min'].default_value = 0.93; jv.inputs['To Max'].default_value = 1.05
    nt.links.new(oi.outputs['Random'], jv.inputs['Value'])
    nt.links.new(jv.outputs['Result'], hsv.inputs['Value'])
    hsv.inputs['Color'].default_value = hexcol(col)
    mix = nt.nodes.new('ShaderNodeMix'); mix.data_type = 'RGBA'
    mix.inputs['B'].default_value = hexcol(fxcol)
    fxm = nt.nodes.new('ShaderNodeMath'); fxm.operation = 'MULTIPLY'; fxm.inputs[1].default_value = 0.95
    nt.links.new(af.outputs['Fac'], fxm.inputs[0])
    nt.links.new(fxm.outputs[0], mix.inputs['Factor'])
    nt.links.new(hsv.outputs['Color'], mix.inputs['A'])
    ao = nt.nodes.new('ShaderNodeAmbientOcclusion'); ao.samples = 8; ao.inputs['Distance'].default_value = 0.16
    aom = nt.nodes.new('ShaderNodeMix'); aom.data_type = 'RGBA'; aom.blend_type = 'MULTIPLY'; aom.inputs['Factor'].default_value = 0.55
    nt.links.new(mix.outputs['Result'], aom.inputs['A']); nt.links.new(ao.outputs['AO'], aom.inputs['B'])
    nt.links.new(aom.outputs['Result'], b.inputs['Base Color'])        # r1: AO signature (~0.3 capsule diameters... 0.16 u)
    return m


def mat_gummy():
    m, b, nt = principled('gummy', **{'Base Color': hexcol('#FF5AA6'), 'Roughness': 0.15, 'Subsurface Weight': 1.0,
                                      'Subsurface Radius': (1.0, 0.5, 0.8), 'Subsurface Scale': 0.11,
                                      'Subsurface IOR': 1.42, 'Coat Weight': 0.45, 'Coat Roughness': 0.04,
                                      'Specular IOR Level': 0.55})
    b.subsurface_method = 'BURLEY'
    return m


def mat_chrome():
    m, b, nt = principled('chrome', **{'Base Color': hexcol('#F4F3F6'), 'Metallic': 1.0, 'Roughness': 0.045})
    return m


BALL_X_SCENE = float(A['BALL_X'])
M_CYC, M_GUM, M_CHR = mat_cyc(), mat_gummy(), mat_chrome()
M_PA = mat_pill('pill_cap', '#EBDCCD')
# v5.1: satin ink-teal body (low F0: the bright pastel studio sky no longer greys the bed), the sweeps / end-hold breathing band
# tint the body teal instead of hot pink (the caps keep the pink tint)
M_PB = mat_pill('pill_body', BODY_COL, 0.35, 0.1, 0.1, '#17545E') if V5LOOK == 'b' else mat_pill('pill_body', BODY_COL)


# ------------------------------------------------------------------ cyc (floor + cove + wall)
def make_cyc():
    prof = []
    for y in np.linspace(-26, 14.5, 42):
        prof.append((y, -PILL_L))
    Rc = 5.0
    for a in np.linspace(0, math.pi / 2, 28)[1:]:
        prof.append((14.5 + Rc * math.sin(a), -PILL_L + Rc * (1 - math.cos(a))))
    for z in np.linspace(-PILL_L + Rc, 30, 10)[1:]:
        prof.append((14.5 + Rc, z))
    xs = np.linspace(-40, 40, 41)
    me = bpy.data.meshes.new('cyc'); bm = bmesh.new()
    grid = [[bm.verts.new((x, y, z)) for (y, z) in prof] for x in xs]
    for i in range(len(xs) - 1):
        for j in range(len(prof) - 1):
            bm.faces.new((grid[i][j], grid[i + 1][j], grid[i + 1][j + 1], grid[i][j + 1]))
    bm.to_mesh(me); bm.free()
    for p in me.polygons:
        p.use_smooth = True
    ob = bpy.data.objects.new('cyc', me); sc.collection.objects.link(ob)
    me.materials.append(M_CYC)
    return ob


make_cyc()


# ------------------------------------------------------------------ capsule instance mesh
def capsule(r, L, seg=28, rings=9):
    """two-tone medicine capsule: cap (top half, material 0) slightly wider than the body (bottom half, material 1)"""
    me = bpy.data.meshes.new('capsule'); bm = bmesh.new()
    h = L / 2 - r
    rb = r * 0.955                  # body radius
    ang = np.linspace(0, 2 * math.pi, seg, endpoint=False)
    ring = lambda rad, z: [bm.verts.new((rad * math.cos(t), rad * math.sin(t), z)) for t in ang]
    loops, mats = [], []
    bottom = bm.verts.new((0, 0, -L / 2 + (r - rb)))
    for i in range(1, rings + 1):                                   # body hemisphere
        a = -math.pi / 2 + (math.pi / 2) * i / rings
        loops.append(ring(rb * math.cos(a), -h + rb * math.sin(a)))
    loops.append(ring(rb, 0.035))                                    # body cylinder up into the cap
    loops.append(ring(r * 0.985, 0.035))                             # cap lip (step)
    loops.append(ring(r, 0.045))
    for i in range(0, rings):                                        # cap hemisphere
        a = (math.pi / 2) * i / rings
        loops.append(ring(r * math.cos(a), h + r * math.sin(a)))
    top = bm.verts.new((0, 0, L / 2))
    nb = rings + 1                                                   # loops belonging to the body
    for k in range(seg):
        f = bm.faces.new((bottom, loops[0][(k + 1) % seg], loops[0][k])); f.material_index = 1
        f = bm.faces.new((top, loops[-1][k], loops[-1][(k + 1) % seg])); f.material_index = 0
    for li, (a, b) in enumerate(zip(loops[:-1], loops[1:])):
        for k in range(seg):
            f = bm.faces.new((a[k], a[(k + 1) % seg], b[(k + 1) % seg], b[k]))
            f.material_index = 1 if li < nb - 1 else 0
    bm.normal_update(); bm.to_mesh(me); bm.free()
    for p in me.polygons:
        p.use_smooth = True
    me.materials.append(M_PA); me.materials.append(M_PB)
    return me


cap_me = capsule(PILL_R, PILL_L)
cap_ob = bpy.data.objects.new('capsule_proto', cap_me)   # hidden prototype used by the GN instancer
sc.collection.objects.link(cap_ob); cap_ob.hide_render = True; cap_ob.hide_viewport = True; cap_ob.location = (0, 0, -50)

# ------------------------------------------------------------------ capsule field data mesh (3 verts / capsule, shape keys per frame)
LOC, ROT, SCL = A['LOC'], A['ROT'], A['SCL']


def pack(k):
    d = np.empty((N, 3, 3), np.float32)
    d[:, 0] = LOC[k]; d[:, 1] = ROT[k]; d[:, 2] = SCL[k]
    return d.reshape(-1)


dme = bpy.data.meshes.new('fielddata')
dme.vertices.add(3 * N)
dme.vertices.foreach_set('co', pack(0))
av = dme.attributes.new('var', 'FLOAT', 'POINT')
vv = np.zeros(3 * N, np.float32); vv[0::3] = A['var']
av.data.foreach_set('value', vv)
ap = dme.attributes.new('phi', 'FLOAT', 'POINT')
pp = np.zeros(3 * N, np.float32); pp[0::3] = A['spin_phi']
ap.data.foreach_set('value', pp)
field = bpy.data.objects.new('field', dme); sc.collection.objects.link(field)
field.shape_key_add(name='Basis', from_mix=False)
for k in range(NT):
    kb = field.shape_key_add(name=f'f{FR[k]}', from_mix=False)
    kb.data.foreach_set('co', pack(k))
    kb.value = 0.0
    f = int(FR[k])
    for ff, val in ((f - 1, 0.0), (f, 1.0), (f + 1, 0.0)):
        kb.value = val
        kb.keyframe_insert('value', frame=ff)
print('shape keys done')


# ------------------------------------------------------------------ geometry nodes helpers
class GN:
    def __init__(self, name):
        self.t = bpy.data.node_groups.new(name, 'GeometryNodeTree')
        self.t.interface.new_socket('Geometry', in_out='INPUT', socket_type='NodeSocketGeometry')
        self.t.interface.new_socket('Geometry', in_out='OUTPUT', socket_type='NodeSocketGeometry')
        self.i = self.t.nodes.new('NodeGroupInput'); self.o = self.t.nodes.new('NodeGroupOutput')

    def n(self, typ, inputs=None, **props):
        nd = self.t.nodes.new(typ)
        for k, v in props.items():
            setattr(nd, k, v)
        for k, v in (inputs or {}).items():
            sock = nd.inputs[k] if not isinstance(k, int) else nd.inputs[k]
            if isinstance(v, bpy.types.NodeSocket):
                self.t.links.new(v, sock)
            else:
                sock.default_value = v
        return nd

    def math(self, op, a, b=None, c=None):
        nd = self.n('ShaderNodeMath', operation=op)
        for idx, v in enumerate((a, b, c)):
            if v is None:
                continue
            if isinstance(v, bpy.types.NodeSocket):
                self.t.links.new(v, nd.inputs[idx])
            else:
                nd.inputs[idx].default_value = v
        return nd.outputs[0]

    def vmath(self, op, a, b=None, scale=None):
        nd = self.n('ShaderNodeVectorMath', operation=op)
        for idx, v in enumerate((a, b)):
            if v is None:
                continue
            if isinstance(v, bpy.types.NodeSocket):
                self.t.links.new(v, nd.inputs[idx])
            else:
                nd.inputs[idx].default_value = v
        if scale is not None:
            s = nd.inputs['Scale']
            if isinstance(scale, bpy.types.NodeSocket):
                self.t.links.new(scale, s)
            else:
                s.default_value = scale
        return nd.outputs['Vector'] if op not in ('LENGTH', 'DOT_PRODUCT', 'DISTANCE') else nd.outputs['Value']

    def link(self, a, b):
        self.t.links.new(a, b)


# ------------------------------------------------------------------ field instancer node tree
g = GN('CapsuleCloner')
geo = g.i.outputs['Geometry']
pts = g.n('GeometryNodePoints', {'Count': N})
idx = g.n('GeometryNodeInputIndex').outputs[0]
pos = g.n('GeometryNodeInputPosition').outputs[0]
i3 = [g.math('MULTIPLY_ADD', idx, 3.0, float(o)) for o in range(3)]


def sample(val, index, dtype='FLOAT_VECTOR'):
    s = g.n('GeometryNodeSampleIndex', data_type=dtype, domain='POINT')
    g.link(geo, s.inputs['Geometry']); g.link(val, s.inputs['Value']); g.link(index, s.inputs['Index'])
    return s.outputs[0]


loc = sample(pos, i3[0]); rotv = sample(pos, i3[1]); sclv = sample(pos, i3[2])
varA = g.n('GeometryNodeInputNamedAttribute', data_type='FLOAT', inputs={'Name': 'var'}).outputs['Attribute']
phiA = g.n('GeometryNodeInputNamedAttribute', data_type='FLOAT', inputs={'Name': 'phi'}).outputs['Attribute']
var = sample(varA, i3[0], 'FLOAT'); phi = sample(phiA, i3[0], 'FLOAT')
setp = g.n('GeometryNodeSetPosition')
g.link(pts.outputs['Points'], setp.inputs['Geometry']); g.link(loc, setp.inputs['Position'])
sep_r = g.n('ShaderNodeSeparateXYZ'); g.link(rotv, sep_r.inputs[0])
tilt = g.n('ShaderNodeCombineXYZ'); g.link(sep_r.outputs['X'], tilt.inputs['X']); g.link(sep_r.outputs['Y'], tilt.inputs['Y'])
rt = g.n('FunctionNodeEulerToRotation'); g.link(tilt.outputs[0], rt.inputs['Euler'])
axis = g.n('ShaderNodeCombineXYZ')
g.link(g.math('COSINE', phi), axis.inputs['X']); g.link(g.math('SINE', phi), axis.inputs['Y'])
ra = g.n('FunctionNodeAxisAngleToRotation'); g.link(axis.outputs[0], ra.inputs['Axis']); g.link(sep_r.outputs['Z'], ra.inputs['Angle'])
rr = g.n('FunctionNodeRotateRotation', rotation_space='GLOBAL')
g.link(ra.outputs[0], rr.inputs['Rotation']); g.link(rt.outputs[0], rr.inputs['Rotate By'])
sep_s = g.n('ShaderNodeSeparateXYZ'); g.link(sclv, sep_s.inputs[0])
scl = g.n('ShaderNodeCombineXYZ')
g.link(sep_s.outputs['X'], scl.inputs['X']); g.link(sep_s.outputs['X'], scl.inputs['Y']); g.link(sep_s.outputs['Y'], scl.inputs['Z'])
obi = g.n('GeometryNodeObjectInfo', transform_space='ORIGINAL'); obi.inputs['Object'].default_value = cap_ob
iop = g.n('GeometryNodeInstanceOnPoints')
g.link(setp.outputs['Geometry'], iop.inputs['Points']); g.link(obi.outputs['Geometry'], iop.inputs['Instance'])
g.link(rr.outputs[0], iop.inputs['Rotation']); g.link(scl.outputs[0], iop.inputs['Scale'])
st1 = g.n('GeometryNodeStoreNamedAttribute', data_type='FLOAT', domain='INSTANCE', inputs={'Name': 'fx'})
g.link(iop.outputs['Instances'], st1.inputs['Geometry']); g.link(sep_s.outputs['Z'], st1.inputs['Value'])
st2 = g.n('GeometryNodeStoreNamedAttribute', data_type='FLOAT', domain='INSTANCE', inputs={'Name': 'var'})
g.link(st1.outputs['Geometry'], st2.inputs['Geometry']); g.link(var, st2.inputs['Value'])
g.link(st2.outputs['Geometry'], g.o.inputs['Geometry'])
mod = field.modifiers.new('cloner', 'NODES'); mod.node_group = g.t

# ------------------------------------------------------------------ letters: jelly deformer
j = GN('Jelly')
for nm, typ in (('Squash', 'NodeSocketFloat'), ('Bend', 'NodeSocketVector'), ('Height', 'NodeSocketFloat')):
    j.t.interface.new_socket(nm, in_out='INPUT', socket_type=typ)
jp = j.n('GeometryNodeInputPosition').outputs[0]
sp = j.n('ShaderNodeSeparateXYZ'); j.link(jp, sp.inputs[0])
S_ = j.i.outputs['Squash']; B_ = j.i.outputs['Bend']; H_ = j.i.outputs['Height']
hn = j.math('DIVIDE', sp.outputs['Z'], H_)
hn = j.math('MINIMUM', j.math('MAXIMUM', hn, 0.0), 1.25)
onep = j.math('ADD', S_, 1.0)
kxy = j.math('INVERSE_SQRT', j.math('MAXIMUM', onep, 0.3))
# barrel bulge: squash (S<0) fattens the middle, stretch thins it
bul = j.math('MULTIPLY_ADD', j.math('MULTIPLY', j.math('MULTIPLY', hn, j.math('SUBTRACT', 1.0, hn)), 4.0), j.math('MULTIPLY', S_, -0.55), 1.0)
kk = j.math('MULTIPLY', kxy, bul)
hn2 = j.math('MULTIPLY', hn, hn)
sb = j.n('ShaderNodeSeparateXYZ'); j.link(B_, sb.inputs[0])
nx = j.math('MULTIPLY_ADD', sp.outputs['X'], kk, j.math('MULTIPLY', sb.outputs['X'], hn2))
ny = j.math('MULTIPLY_ADD', sp.outputs['Y'], kk, j.math('MULTIPLY', sb.outputs['Y'], hn2))
nz = j.math('MULTIPLY', sp.outputs['Z'], onep)
cmb = j.n('ShaderNodeCombineXYZ'); j.link(nx, cmb.inputs['X']); j.link(ny, cmb.inputs['Y']); j.link(nz, cmb.inputs['Z'])
jset = j.n('GeometryNodeSetPosition'); j.link(j.i.outputs['Geometry'], jset.inputs['Geometry']); j.link(cmb.outputs[0], jset.inputs['Position'])
j.link(jset.outputs['Geometry'], j.o.inputs['Geometry'])
sock_ids = {it.name: it.identifier for it in j.t.interface.items_tree if getattr(it, 'in_out', '') == 'INPUT'}

G_ = glyphs()
for ch in LETTERS:
    bpy.ops.wm.ply_import(filepath=f'{MESH}/glyph_{ch}.ply')
    ob = bpy.context.selected_objects[0]
    ob.name = f'L_{ch}'
    cxg = (G_[ch]['xmin'] + G_[ch]['xmax']) / 2
    me = ob.data
    co = np.empty(len(me.vertices) * 3, np.float32); me.vertices.foreach_get('co', co)
    co = co.reshape(-1, 3); co[:, 0] -= cxg
    me.vertices.foreach_set('co', co.ravel())
    for p in me.polygons:
        p.use_smooth = True
    me.materials.clear(); me.materials.append(M_GUM)
    ob.location = (0, 0, 0); ob.rotation_euler = (0, 0, 0); ob.scale = (1, 1, 1)
    md = ob.modifiers.new('Jelly', 'NODES'); md.node_group = j.t
    Hh = G_[ch]['zmax']
    md[sock_ids['Height']] = Hh
    cxw = float(A[f'L_{ch}_cx'])
    Z = A[f'L_{ch}_z']; Sq = A[f'L_{ch}_s']; R = A[f'L_{ch}_rot']; Bd = A[f'L_{ch}_bend']
    cvec = np.array([0, 0, Hh * 0.5])
    for k in range(NT):
        f = int(FR[k])
        rx, ry, rz = R[k]
        # rotation about the letter's centre (pivot at mid-height), origin stays at the bottom
        Rm = (np.array([[math.cos(rz), -math.sin(rz), 0], [math.sin(rz), math.cos(rz), 0], [0, 0, 1]]) @
              np.array([[math.cos(ry), 0, math.sin(ry)], [0, 1, 0], [-math.sin(ry), 0, math.cos(ry)]]) @
              np.array([[1, 0, 0], [0, math.cos(rx), -math.sin(rx)], [0, math.sin(rx), math.cos(rx)]]))
        off = cvec - Rm @ cvec
        ob.location = (cxw + off[0], off[1], Z[k] + off[2])
        ob.rotation_euler = (rx, ry, rz)
        ob.keyframe_insert('location', frame=f); ob.keyframe_insert('rotation_euler', frame=f)
        md[sock_ids['Squash']] = float(Sq[k]); md[sock_ids['Bend']] = (float(Bd[k, 0]), float(Bd[k, 1]), 0.0)
        ob.keyframe_insert(f'modifiers["Jelly"]["{sock_ids["Squash"]}"]', frame=f)
        ob.keyframe_insert(f'modifiers["Jelly"]["{sock_ids["Bend"]}"]', frame=f)
print('letters done')

# ------------------------------------------------------------------ chrome period
bpy.ops.mesh.primitive_uv_sphere_add(segments=128, ring_count=64, radius=BALL_R)
ball = bpy.context.active_object; ball.name = 'period'
bpy.ops.object.shade_smooth()
ball.data.materials.append(M_CHR)
bx = float(A['BALL_X'])
for k in range(NT):
    f = int(FR[k])
    ball.location = (bx, 0, float(A['ball_z'][k]))
    ball.rotation_euler = (float(A['ball_roll'][k]), 0.0, 0.0)
    ball.keyframe_insert('location', frame=f); ball.keyframe_insert('rotation_euler', frame=f)


# ------------------------------------------------------------------ lights
def area(name, loc, target, size, power, color, shape='RECTANGLE', size_y=None, spread=180):
    ld = bpy.data.lights.new(name, 'AREA'); ld.energy = power; ld.color = color[:3]
    ld.shape = shape; ld.size = size
    if size_y:
        ld.size_y = size_y
    ld.spread = math.radians(spread)
    ob = bpy.data.objects.new(name, ld); sc.collection.objects.link(ob)
    ob.location = loc
    d = np.array(target, float) - np.array(loc, float)
    ob.rotation_euler = (0, 0, 0)
    q = __import__('mathutils').Vector(d).to_track_quat('-Z', 'Y')
    ob.rotation_euler = q.to_euler()
    return ob


area('key', (-7.0, 1.0, 7.0), (0.5, 0, 0), 5.0, 5200, (1.0, 0.95, 0.92), 'DISK', spread=75)
RIM = area('rim', (1.5, 7.0, 4.2), (0, 0, 0.6), 7.0, 5000, (1.0, 0.82, 0.90), 'RECTANGLE', 1.8)
if V5LOOK == 'b':    # v5.1: the pink rim no longer lays a pink specular band across the capsule bed behind the word (letters + ball keep it)
    rim_x = bpy.data.collections.new('rim_excl')
    for _o in (bpy.data.objects['field'], bpy.data.objects['cyc']):
        rim_x.objects.link(_o)
    RIM.light_linking.receiver_collection = rim_x
    for _co in rim_x.collection_objects:
        _co.light_linking.link_state = 'EXCLUDE'
area('fill', (6.5, -9.0, 3.0), (0, 0, 0.4), 8.0, 325, (0.86, 0.86, 1.0), 'DISK')   # r1: -1 stop
area('wall', (0.0, 9.0, 1.2), (0.0, 20.0, 4.5), 7.0, 2600, (1.0, 0.90, 0.95), 'DISK')

# r1: off-camera flags so the chrome has real darks (plum card above camera-left) + one pink strip light (right)
def card(name, loc, target, sx, sy, col, strength):
    me = bpy.data.meshes.new(name); me.from_pydata([(-sx / 2, -sy / 2, 0), (sx / 2, -sy / 2, 0), (sx / 2, sy / 2, 0), (-sx / 2, sy / 2, 0)], [], [(0, 1, 2, 3)])
    ob = bpy.data.objects.new(name, me); sc.collection.objects.link(ob); ob.location = loc
    d = np.array(target, float) - np.array(loc, float)
    ob.rotation_euler = __import__('mathutils').Vector(d).to_track_quat('Z', 'Y').to_euler()
    m = bpy.data.materials.new(name + '_m'); m.use_nodes = True; nt = m.node_tree
    for n in list(nt.nodes):
        nt.nodes.remove(n)
    em = nt.nodes.new('ShaderNodeEmission'); em.inputs['Color'].default_value = hexcol(col); em.inputs['Strength'].default_value = strength
    o = nt.nodes.new('ShaderNodeOutputMaterial'); nt.links.new(em.outputs[0], o.inputs['Surface'])
    m.cycles.emission_sampling = 'NONE'
    me.materials.append(m)
    ob.visible_camera = False; ob.visible_diffuse = False; ob.visible_shadow = False
    ob.visible_transmission = False; ob.visible_volume_scatter = False; ob.visible_glossy = True
    return ob


BXc = float(A['BALL_X'])
card('flag_plum', (BXc - 1.6, -6.8, 6.4), (BXc, 0, 0.4), 12.0, 7.0, '#2A1830', 1.0)
card('strip_pink', (BXc + 5.2, -3.4, 2.6), (BXc, 0, 0.5), 0.45, 6.0, '#FF6FAE', 7.0)

# r2: the ball's growing shadow. E(t) ramps with the fall; H = 7 u, radius 0.4 u -> soft 2 D blob high up, crisp D at contact
# v5 fix: this line had an unclosed paren (never re-run after the r2 build); the shipped work/scene.blend has E = 4000
# (checked: shadow_pos energy 4000 at f143), so 4000 is the default that reproduces the approved plates
SHADOW_E = float(os.environ.get('SHADOW_E', '4000'))
blk = bpy.data.collections.new('shadow_blockers'); blk.objects.link(ball)
def shadow_s(t):
    if t < 5.30: return 0.0
    if t < 5.50: return 0.22 * smooth01((t - 5.30) / 0.20)
    if t < 5.96: return 0.22 + 0.78 * smooth01((t - 5.50) / 0.46)
    if t < 6.10: return 1.0
    if t < 7.00: return 1.0 - 0.45 * smooth01((t - 6.10) / 0.90)
    return 0.55
def smooth01(u):
    u = min(max(u, 0.0), 1.0); return u * u * (3 - 2 * u)
SPOTS = []
for nm, sgn, shd in (('shadow_pos', 1.0, True), ('shadow_neg', -1.0, False)):
    ld = bpy.data.lights.new(nm, 'SPOT'); ld.spot_size = math.radians(56); ld.spot_blend = 0.6; ld.shadow_soft_size = 0.4
    ld.use_shadow = shd; ld.color = (1.0, 1.0, 1.0)
    ob = bpy.data.objects.new(nm, ld); sc.collection.objects.link(ob); ob.location = (BXc, 0.0, 7.0); ob.rotation_euler = (0, 0, 0)
    ob.visible_glossy = False; ob.visible_transmission = False; ob.visible_volume_scatter = False
    if shd:
        ob.light_linking.blocker_collection = blk
    for k in range(NT):
        f = int(FR[k]); ld.energy = sgn * SHADOW_E * shadow_s(f / FPS); ld.keyframe_insert('energy', frame=f)
    SPOTS.append(ob)

# ------------------------------------------------------------------ camera
cd = bpy.data.cameras.new('cam'); cam = bpy.data.objects.new('cam', cd); sc.collection.objects.link(cam); sc.camera = cam
cd.sensor_width = 36; cd.sensor_fit = 'HORIZONTAL'
cd.dof.use_dof = True; cd.dof.aperture_blades = 0
cd.clip_start = 0.05; cd.clip_end = 200
CAM, CR, FOC = A['CAM'], A['CAMROT'], A['FOC']
for k in range(NT):
    f = int(FR[k])
    cam.location = tuple(CAM[k, :3]); cam.rotation_euler = tuple(CR[k])
    cd.lens = float(CAM[k, 6]); cd.dof.aperture_fstop = float(CAM[k, 7]); cd.dof.focus_distance = float(FOC[k])
    cam.keyframe_insert('location', frame=f); cam.keyframe_insert('rotation_euler', frame=f)
    cd.keyframe_insert('lens', frame=f); cd.dof.keyframe_insert('aperture_fstop', frame=f); cd.dof.keyframe_insert('focus_distance', frame=f)

# ------------------------------------------------------------------ compositor: gentle depth haze (mist pass) into the cyc colour
vl = sc.view_layers[0]; vl.use_pass_mist = True
world.mist_settings.start = 12.0; world.mist_settings.depth = 13.0
if V5LOOK == 'b':
    world.mist_settings.start = 15.0      # v5.1: pastel haze starts further back (the dark bed right behind the word stays dark)   # r1: start pushed out ~40 %; world.mist_settings.falloff = 'QUADRATIC'
cg = bpy.data.node_groups.new('comp', 'CompositorNodeTree'); sc.compositing_node_group = cg
cg.interface.new_socket('Image', in_out='OUTPUT', socket_type='NodeSocketColor')
rl = cg.nodes.new('CompositorNodeRLayers'); go = cg.nodes.new('NodeGroupOutput')
mixc = cg.nodes.new('ShaderNodeMix'); mixc.data_type = 'RGBA'; mixc.clamp_factor = True
mulm = cg.nodes.new('ShaderNodeMath'); mulm.operation = 'MULTIPLY'; mulm.inputs[1].default_value = 1.35; mulm.use_clamp = True
cg.links.new(rl.outputs['Mist'], mulm.inputs[0]); cg.links.new(mulm.outputs[0], mixc.inputs['Factor'])
cg.links.new(rl.outputs['Image'], mixc.inputs['A'])
mixc.inputs['B'].default_value = (1.95, 1.62, 1.84, 1.0)
glare = cg.nodes.new('CompositorNodeGlare')
glare.inputs['Type'].default_value = 'Bloom'
glare.inputs['Quality'].default_value = 'High'
glare.inputs['Threshold'].default_value = 2.2
glare.inputs['Strength'].default_value = 0.18   # r1: halved
glare.inputs['Size'].default_value = 0.55
cg.links.new(mixc.outputs['Result'], glare.inputs['Image'])
cg.links.new(glare.outputs['Image'], go.inputs['Image'])
try:
    sc.render.use_compositing = True
except Exception as e:
    print('WARN no use_compositing', e)

sc.frame_set(0)
bpy.ops.wm.save_as_mainfile(filepath=f'{WORK}/scene_b.blend' if V5LOOK == 'b' else f'{WORK}/scene.blend', compress=False)
print('saved')
