# Extract flattened glyph contours for the wordmark from the instanced Outfit SemiBold -> glyphs.json
import json, sys
from fontTools.ttLib import TTFont
from fontTools.pens.recordingPen import RecordingPen
f = TTFont('assets/fonts/Outfit-SemiBold.ttf'); gs = f.getGlyphSet(); cmap = f.getBestCmap()
upm = f['head'].unitsPerEm
def flat(ops, steps=14):
    contours=[]; cur=[]; p=None
    for op,args in ops:
        if op=='moveTo': cur=[args[0]]; p=args[0]
        elif op=='lineTo': cur.append(args[0]); p=args[0]
        elif op=='qCurveTo':
            pts=list(args); on=pts[-1]; offs=pts[:-1]
            # implied on-curve points between consecutive off-curve points
            seq=[]
            for i,o in enumerate(offs):
                if i>0: seq.append(((offs[i-1][0]+o[0])/2,(offs[i-1][1]+o[1])/2))
                seq.append(o)
            # seq alternates: off, (implied on, off)...
            segs=[]; start=p; i=0
            ctrl=offs
            ons=[((offs[k][0]+offs[k+1][0])/2,(offs[k][1]+offs[k+1][1])/2) for k in range(len(offs)-1)]+[on]
            s=start
            for k,c in enumerate(offs):
                e=ons[k]
                for j in range(1,steps+1):
                    t=j/steps; x=(1-t)**2*s[0]+2*(1-t)*t*c[0]+t*t*e[0]; y=(1-t)**2*s[1]+2*(1-t)*t*c[1]+t*t*e[1]
                    cur.append((x,y))
                s=e
            p=on
        elif op=='curveTo':
            c1,c2,e=args; s=p
            for j in range(1,steps+1):
                t=j/steps; u=1-t
                cur.append((u**3*s[0]+3*u*u*t*c1[0]+3*u*t*t*c2[0]+t**3*e[0], u**3*s[1]+3*u*u*t*c1[1]+3*u*t*t*c2[1]+t**3*e[1]))
            p=e
        elif op in ('closePath','endPath'):
            if cur and cur[0]==cur[-1]: cur=cur[:-1]
            contours.append(cur); cur=[]
    return contours
out={'upm':upm,'ascender':f['hhea'].ascent,'xHeight':getattr(f['OS/2'],'sxHeight',0),'glyphs':{}}
for ch in 'morphe':
    g=cmap[ord(ch)]; rp=RecordingPen(); gs[g].draw(rp)
    cs=flat(rp.value)
    area=lambda c: sum(c[i][0]*c[(i+1)%len(c)][1]-c[(i+1)%len(c)][0]*c[i][1] for i in range(len(c)))/2
    out['glyphs'][ch]={'adv':f['hmtx'][g][0],'contours':[[ [round(x,1),round(y,1)] for x,y in c] for c in cs],'areas':[round(area(c)) for c in cs]}
    print(ch, f['hmtx'][g][0], len(cs), [len(c) for c in cs], out['glyphs'][ch]['areas'])
json.dump(out,open('glyphs.json','w'))
