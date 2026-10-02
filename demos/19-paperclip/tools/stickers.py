import numpy as np, json, io
from PIL import Image, ImageFilter, ImageOps
from scipy import ndimage as ndi
from rembg import remove, new_session
S=2  # asset px per world px
OUT=10*S  # 10 world-px outline
sess=new_session('birefnet-general')
def disk(r):
    y,x=np.ogrid[-r:r+1,-r:r+1]; return x*x+y*y<=r*r
def clean_alpha(a):
    m=a>127
    lab,n=ndi.label(m)
    if n>1:
        sizes=ndi.sum(m,lab,range(1,n+1)); keep=np.argmax(sizes)+1
        big=[i+1 for i,s in enumerate(sizes) if s>0.04*sizes.max()]
        m=np.isin(lab,big)
    m=ndi.binary_fill_holes(m)
    return m
def cutout(name, world_long, crop=None, fix=None):
    im=Image.open(f'assets/src/{name}.img').convert('RGB')
    if crop: im=im.crop(crop)
    rgba=remove(im,session=sess)
    a=np.array(rgba)[:,:,3]; m=clean_alpha(a)
    ys,xs=np.where(m); pad=4
    box=(max(xs.min()-pad,0),max(ys.min()-pad,0),min(xs.max()+pad,im.width),min(ys.max()+pad,im.height))
    rgb=np.array(im)[box[1]:box[3],box[0]:box[2]].copy(); soft=a[box[1]:box[3],box[0]:box[2]].astype(np.float32)/255
    if fix: rgb=fix(rgb, soft)
    h,w=soft.shape; sc=world_long*S/max(h,w)
    nw,nh=int(round(w*sc)),int(round(h*sc))
    rgb=np.array(Image.fromarray(rgb).resize((nw,nh),Image.LANCZOS)); soft=np.array(Image.fromarray((soft*255).astype(np.uint8)).resize((nw,nh),Image.LANCZOS)).astype(np.float32)/255
    P=OUT+8; H,W=nh+2*P,nw+2*P
    A=np.zeros((H,W),np.float32); A[P:P+nh,P:P+nw]=soft
    RGB=np.ones((H,W,3),np.float32)*255; RGB[P:P+nh,P:P+nw]=rgb
    # outline: dilate hard mask by OUT px, smooth
    hard=A>0.5
    dist=ndi.distance_transform_edt(~hard)
    ol=np.clip(OUT+0.75-dist,0,1)      # anti-aliased edge
    # white under photo, photo composited over white with its soft alpha
    col=RGB*A[...,None]+255*(1-A[...,None])
    out=np.dstack([col,np.maximum(ol,A)*255]).clip(0,255).astype(np.uint8)
    Image.fromarray(out,'RGBA').save(f'assets/stickers/{name}.png',optimize=True)
    return dict(w=W/S,h=H/S)
def card(name, world_long, crop, border=9, radius=6):
    im=Image.open(f'assets/src/{name}.img').convert('RGB').crop(crop)
    w,h=im.size; sc=world_long*S/max(w,h); im=im.resize((int(w*sc),int(h*sc)),Image.LANCZOS)
    b=border*S; r=radius*S; W,H=im.width+2*b,im.height+2*b
    out=Image.new('RGBA',(W,H),(255,255,255,0))
    msk=Image.new('L',(W*4,H*4),0)
    from PIL import ImageDraw
    ImageDraw.Draw(msk).rounded_rectangle((0,0,W*4-1,H*4-1),r*4,fill=255); msk=msk.resize((W,H),Image.LANCZOS)
    base=Image.new('RGBA',(W,H),(255,255,255,255)); base.putalpha(msk)
    base.paste(im,(b,b)); base.putalpha(msk)
    base.save(f'assets/stickers/{name}.png',optimize=True)
    return dict(w=W/S,h=H/S)
def unlabel(rgb, soft):
    # remove printed brand text on the battery label: grey closing inside the bright label area
    hsv=np.array(Image.fromarray(rgb).convert('HSV')).astype(int)
    bright=(hsv[...,2]>150)&(hsv[...,1]<60)&(soft>0.5)
    lab=ndi.binary_closing(bright,disk(9)); lab=ndi.binary_opening(lab,disk(5))
    labd=ndi.binary_dilation(lab,disk(3))
    closed=np.stack([ndi.grey_closing(rgb[...,c],footprint=disk(9)) for c in range(3)],-1)
    closed=np.stack([ndi.gaussian_filter(closed[...,c].astype(float),2) for c in range(3)],-1)
    out=rgb.copy(); out[labd]=closed[labd].astype(np.uint8); return out
meta={}
meta['phone']=cutout('phone',860)
meta['battery']=cutout('battery',420,fix=unlabel)
meta['wafer']=cutout('wafer',330)
meta['cobalt']=cutout('cobalt',310)
meta['lithium']=cutout('lithium',300)
meta['tin']=cutout('tin',280)
im=Image.open('assets/src/pcb.img'); print('pcb',im.size)
W0,H0=im.size; meta['pcb']=card('pcb',400,(int(W0*.18),int(H0*.08),int(W0*.82),int(H0*.92)))
im=Image.open('assets/src/rareearth.img'); print('re',im.size); W0,H0=im.size
meta['rareearth']=card('rareearth',380,(int(W0*.04),int(H0*.12),int(W0*.98),int(H0*.95)))
json.dump(meta,open('assets/stickers/meta.json','w'),indent=1); print(meta)
# contact sheet on bg with shadow
bg=Image.new('RGB',(2200,1300),(0xE9,0xEE,0xF2)); x=40;y=40;rowh=0
for k in meta:
    s=Image.open(f'assets/stickers/{k}.png'); s=s.resize((s.width//2,s.height//2),Image.LANCZOS)
    if x+s.width>2160: x=40;y+=rowh+40;rowh=0
    sh=Image.new('RGBA',s.size,(40,55,70,0)); sh.putalpha(s.getchannel('A').point(lambda v:v*0.28).filter(ImageFilter.GaussianBlur(10)))
    bg.paste(sh,(x+6,y+12),sh); bg.paste(s,(x,y),s); x+=s.width+40; rowh=max(rowh,s.height)
bg.save('/tmp/pc_cand/stickers_sheet.jpg',quality=88)
