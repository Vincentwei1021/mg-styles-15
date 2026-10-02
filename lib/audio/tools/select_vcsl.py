"""Select a curated subset of VCSL (CC0) files and write a download list."""
import json, re, sys, urllib.parse
tree = json.load(open(sys.argv[1]))['tree']
blobs = [x for x in tree if x['type'] == 'blob' and x['path'].lower().endswith(('.wav', '.mp3', '.flac'))]

RULES = {
    # key: (folder substring, regex on filename or None, short name)
    'dantranh':   ('Chordophones/Zithers/Dan Tranh/', None),
    'piano':      ('Chordophones/Zithers/Grand Piano, Kawai/', r'_sus_.*_v[23]_'),
    'harp':       ('Composite Chordophones/Concert Harp/', r'_mf1'),
    'glock':      ('Struck Idiophones/Glockenspiel/', r'(medium|loud)'),
    'marimba':    ('Struck Idiophones/Marimba/', r'_med_'),
    'kalimba':    ('Plucked Idiophones/Kalimba, Tanzania/', None),
    'vibraphone': ('Struck Idiophones/Vibraphone/', r'hard_.*_v2_'),
    'marktree':   ('Struck Idiophones/Mark Trees/', None),
    'gong':       ('Struck Idiophones/Gong 1/', None),
    'gong2':      ('Struck Idiophones/Gong 2/', None),
    'crash':      ('Struck Idiophones/Clash Cymbals 1/', None),
    'suscymbal':  ('Struck Idiophones/Suspended Cymbal 1/', r'(cresc|hit_f|hit_mp|hit_fff)'),
    'fingercym':  ('Struck Idiophones/Finger Cymbals/', None),
    'triangle':   ('Struck Idiophones/Triangles/', r'(Triangle[136]_Hit_v2_rr1|triangle1_roll)'),
    'woodblock':  ('Struck Idiophones/Woodblock/', None),
    'claves':     ('Struck Idiophones/Claves/', None),
    'slapstick':  ('Struck Idiophones/Slapstick/', None),
    'vibraslap':  ('Struck Idiophones/Vibraslap/', None),
    'flexatone':  ('Struck Idiophones/Flexatone/', None),
    'trainwhistle': ('Train Whistle, Toy/', None),
    'whistle':    ('Ball Whistle/', None),
    'ratchet':    ('Struck Idiophones/Ratchet/', None),
    'guiro':      ('Struck Idiophones/Guiro/', None),
    'cabasa':     ('Struck Idiophones/Cabasa/', None),
    'shaker':     ('Struck Idiophones/Shaker, Small/', None),
    'tambourine': ('Struck Idiophones/Tambourine 1/', None),
    'claps':      ('Struck Idiophones/Claps/', None),
    'cowbell':    ('Struck Idiophones/Cowbells/', None),
    'agogo':      ('Struck Idiophones/Agogo Bells/', None),
    'slitdrum':   ('Struck Idiophones/Slit Drum/', None),
    'sleighbells':('Struck Idiophones/Sleigh Bells/', None),
    'belltree':   ('Struck Idiophones/Bell Tree/', r'Stroke'),
    'tubularbells': ('Struck Idiophones/Tubular Bells 1/', r'_ff'),
    'framedrum':  ('Struck Membranophones/Frame Drum/', None),
    'bassdrum':   ('Struck Membranophones/Bass Drum 1/', None),
    'bassdrum2':  ('Struck Membranophones/Bass Drum 2/', r'hit'),
    'timpani':    ('Struck Membranophones/Timpani 1/', r'Hit_v4_rr1'),
    'tom':        ('Struck Membranophones/Tom 1/', None),
    'bongo':      ('Struck Membranophones/Bongos/', None),
    'conga':      ('Struck Membranophones/Conga/', None),
    'oceandrum':  ('Other Membranophones/Ocean Drum/', None),
    'wineglass':  ('Friction Idiophones/Wine Glasses/', r'Fast_1_[mM]ain'),
}
out = []
tot = 0
for key, (folder, rx) in RULES.items():
    sel = [b for b in blobs if folder in b['path'] and (rx is None or re.search(rx, b['path'].split('/')[-1]))]
    s = sum(b['size'] for b in sel)
    tot += s
    print(f'{key:14s} {len(sel):4d} files {s/1e6:7.1f} MB', file=sys.stderr)
    for b in sel:
        url = 'https://raw.githubusercontent.com/sgossner/VCSL/master/' + urllib.parse.quote(b['path'])
        out.append((key, b['path'], url))
print(f'TOTAL {tot/1e6:.1f} MB', file=sys.stderr)
with open(sys.argv[2], 'w') as f:
    for key, p, url in out:
        f.write(f'{key}\t{p}\t{url}\n')
