# mgaudio — soundtrack toolkit for the 10-second MG demos

48 kHz float stereo, numpy + numba (band-limited PolyBLEP oscillators, TPT ladder/SVF filters, Karplus-Strong,
FM), pedalboard, CC0 VCSL samples. A full 10 s mix renders in ~3-8 s. Output: 24-bit WAV, exactly 10.000 s,
-14 LUFS integrated, true peak <= -1.1 dBTP on the strict ideal (band-limited FFT) reading (≈ -1.2 on a BS.1770 4x
meter such as ffmpeg `ebur128=peak=true`).

```python
import sys; sys.path.insert(0, 'lib/audio')   # from the repo root
import mgaudio as mg
from mgaudio import recipes, sfx, drums, synth, sync
```

**Workflow:** pick a recipe for your style (table below) → pass your `drop` (hero moment), `outro` (end-frame / logo
time), `bpm`/`key` → add SFX at the cue times with `m.sfx(...)` → `m.export('out/audio.wav', spectrogram=...)` →
Read the PNG, check `warnings`. Everything is deterministic (seeded).

## 1. Concepts (read this, it prevents 90 % of mistakes)
- **Sound** = buffer + `sync` point (seconds into the buffer). `track.add(s, at=t)` / `m.sfx(s, at=t)` put the
  **sync point** at `t`: one-shots/impacts sync on the transient, **whoosh = pass-by peak**, **riser / reverse
  cymbal / charge / swell / lock_on = their end (the hit)**, `transition(...)`/`text_hit(...)` = the hit. So always
  pass the *visual event time*, never pre-compute offsets.
- **Levels by construction.** Every `sfx.*` returns a loudness-normalised sound (≈ -18 dB short-term K-RMS, peak
  ≤ -1 dBFS): at `gain=0` all SFX sit at the same perceived level, ~2 dB above the music bed. Use `gain` only to
  express intent (-6 = subtle, +2 = hero hit). Instruments/drums are *not* normalised — put them on a track with
  `level=` (LUFS target of that stem), or call `.loud(-18)` to use one as an SFX.  (Loudness of stereo sounds = mean
  of the channel powers, as in BS.1770 - not the mono downmix, which under-reads wide material.)
- **Mix** has two groups: `music` (recipes, normalised to `music_level` = -20 LUFS) and `sfx` (everything added
  with `m.sfx`). The music dips `sfx_duck` = 3 dB around each SFX sync point. Master: HPF 28 Hz, mono < 120 Hz,
  glue comp, 20 kHz linear-phase low-pass (`lp=`), true-peak limiter (4x detection, then verified on the ideal
  reading and re-run with a lower ceiling if needed), loudness normalisation, 4 ms fade-in / 250 ms fade-out.
- **Mono-compatible stereo.** Phones (the target for 抖音/B站 cuts) often play mono. Instruments and SFX are
  widened with M/S (`L = y + s, R = y - s`), never with a delayed copy in one channel (Haas), and the VCSL stereo
  samples (spaced-pair recordings) are channel-aligned at load. Check a mix with `analyze()['stereo_corr']` (> 0.3
  is healthy; < 0 warns). `fx.haas()` still exists for deliberate use - it is NOT mono-safe.
- **Form** (in every recipe, `m.form`): tempo grid anchored so **bar 0 starts exactly at the drop**; sections
  `intro [0,build) → build → drop [drop,outro) → outro [outro,10]`; the chord progression starts at the drop
  (the intro plays its end = turnaround); `m.form.chord_at(t)` gives the voiced chord at any time — use it to keep
  tonal SFX (`ding`, `shimmer_hit`, `magic`, `sparkle(key=...)`) in key.

## 2. Recipes (`mgaudio.recipes`) → a `Mix` with the music already arranged
Common params: `duration=10, bpm=None, key, mode, prog, drop=None, build=None, outro=None, hits=(), energy=None,
music_level=-20, sfx_duck=3, final=None` (+ recipe extras). `bpm=None` → recipe default, or if `hits` (≥2 times) are
given, the tempo in the recipe range whose 8th-note grid best fits them (`m.form.fit_err` = worst error).
`drop` default ≈ 42 % on a bar line; `outro` default leaves ~1-2 s for the final chord/button (or give section
lengths: `build_bars=1, drop_bars=2`; `chord_beats=2` doubles the harmonic rhythm); unknown kwargs raise TypeError;
`energy=[(t, 0..1), ...]` overrides the filter/intensity curve. Chords: roman (`'i VI III VII'`, `bVII` = relative to
the parallel major) or symbols (`'Am F C G'`).

| recipe | styles | default bpm (range) · key · prog | extras |
|---|---|---|---|
| `synthwave` | 10 synthwave | 100 (84-118) · A minor · i VI III VII | `lead=True` |
| `darksynth` | 22 HUD/FUI, cyber | 110 (96-124) · D phrygian · i bII i bVII | |
| `vaporwave` | 17 vaporwave | 72 (60-90) · F · IVmaj7 iii7 ii9 Imaj7 | `slow=4` semitones, `tape_stop=True` |
| `chiptune` | 20 pixel | 150 (120-170) · C · I V vi IV | |
| `techno` | 09 Bauhaus/geometric | 124 (118-132) · A minor · i9 i9 iv9 i9 | minimal/click, dub stabs |
| `acid` | 21 acid graphics | 130 (124-140) · A minor · i i bVI bVII | `pattern` (303 steps) |
| `pop` | 01 flat vector, 04 3D | 122 (110-130) · C · I V vi IV | EDM-pop, supersaw drop |
| `future_bass` | 07 liquid, 08 morph | 150 (130-165) · D · IVmaj7 V iii7 vi9 | `gap=True` pre-drop break |
| `trap` | 13 图文快闪 text flash | 140 (130-160) · E minor · i VI iv V | `accent_hits=True` 808 stabs on hits, `gap` |
| `glitch_hop` | 16 glitch/故障 | 105 (95-115) · E minor · i VI iv v | stutter rolls, bitcrush, tape stop |
| `lofi` | 11 grain, 05 cel, 06 collage | 84 (70-96) · F · ii9 V13 Imaj9 vi9 | `keys='rhodes'/'piano'`, `flavor='chill'/'boombap'`, `vinyl` |
| `ambient` | 12 aurora glass, 04 3D, 02 line art | 78/100/72 · E · Imaj9 vi9 IVmaj9 V6/9 | `flavor='glass'/'product'/'piano'` |
| `guofeng` | 15 国潮新中式 | 92/84 (76-110) · D 宫 · I vi IV V | `flavor='modern'/'classical'`, `dizi=True` |
| `variety` | 18 综艺花字, 14 sticker journal | 128/112 · F · I vi ii V | `flavor='bouncy'/'cute'` (uke) |
| `explainer` | 19 回形针, 03 isometric | 112 (100-124) · D · Imaj7 V vi7 IVmaj7 | marimba tech bed |

`recipes.STYLES[slug]` → (recipe, kwargs, alternative, SFX palette). `recipes.for_style('13-text-flash', drop=3.2)`.
Recipe mixes stay editable: `list(m.tracks)` (kick, snare, bass, pad, arp, lead, riser, crash ...), `m['lead'].mute = True`,
`m['pad'].gain = -3`, `m['arp'].automate('lpf', [...])`, or add your own tracks/notes on `m.grid` / `m.form` before export.

## 3. SFX (`mgaudio.sfx`) — all return a normalised `Sound`; `seed=` for variation, `level=` to override loudness
| family | functions (key args) |
|---|---|
| motion | `whoosh(dur=.7, kind='swoosh'\|air\|swish\|heavy\|sci\|cloth\|fire\|soft, direction=1/-1/0, peak=.62, doppler=.35)` · `swish(dur=.28)` · `transition(dur, 'whoosh_hit'\|'riser_hit'\|'reverse_hit'\|'swish_pop')` |
| tension/hits | `riser(dur=2, kind='hybrid'\|noise\|tonal\|shepard\|sweep, note)` · `downlifter(dur)` · `impact(kind='cinematic'\|punch\|soft\|metal\|glitch\|thud\|trailer, size)` · `boom(dur, f0)` · `sub_drop()` · `reverse_cymbal(dur)` · `swell(sound, decay)` (reverse-reverb into sound) · `charge(dur)` |
| UI | `pop('mouth'\|bubble\|soft\|cork, pitch)` · `blip(note, kind='sine'\|tri\|square\|fm, glide)` · `click('soft'\|hard\|mouse\|switch\|wood)` · `tick('clock'\|hi\|wood\|tock)` · `toggle(on)` · `ding(note)` · `ui('confirm'\|error\|notify\|hover\|swipe\|open\|close\|delete)` |
| liquid | `bubble(size)` · `bubbles(dur, density)` · `drip(pitch)` · `gloop(pitch, dur)` · `splash(size)` · `squelch(dur)` · `morph(dur, up)` · `stretch(dur, up)` |
| paper/desk | `paper('rustle'\|flip\|crumple\|slide, dur)` · `tape_rip(dur)` · `sticker_slap()` · `sticker_peel()` · `stamp('seal'\|rubber\|wood)` 印章 · `pen('pen'\|pencil\|marker\|chalk, dur, strokes=[(t,d)])` · `shutter('dslr'\|film\|phone)` · `typewriter()` · `typing(n_keys, rate, kind, bell)` · `scissors()` |
| glitch | `glitch(dur, 'digital'\|data\|error\|crunch\|stutter)` · `stutter(sound, slice, repeats, pitch_step)` · `bitcrush_burst()` · `digital_noise(dur)` · `data_chirp(n)` |
| retro media | `vhs_noise(dur)` · `head_switch()` · `vinyl(dur)` (beds at fixed low level) · `static(dur, 'tv'\|radio)` · `crt_on()` · `crt_off()` · `crt_whine(dur)` · `tape_stop(sound)` · `power_down()` · `record_scratch(sound, 'stop'\|baby\|chirp)` |
| sci-fi/HUD | `laser('pew'\|zap\|beam)` · `hud_beep(note)` · `hud_scan(dur, direction)` · `lock_on(dur)` (sync = lock) · `hud_data(dur)` · `hud_open()` · `hud_alert()` · `hud_ping(note)` |
| magic | `sparkle(dur, density, key, mode)` · `shimmer_hit(note)` · `magic(dur, key, up)` · `chime(notes)` |
| 8-bit | `coin()` · `jump()` · `powerup()` · `oneup()` · `explosion_8bit()` (+ `mgaudio.chip.*`) |
| cartoon/综艺 | `boing(pitch)` · `sproing()` · `duang(pitch)` · `slide_whistle(up, dur)` · `squeak()` · `zip_(up)` · `cork_pop()` · `rimshot_joke()` · `heartbeat(bpm)` |
| text | `text_hit('slam'\|flash\|pop\|glitch)` (快闪 word hits) |

## 4. Instruments & drums (not normalised; `vel` 0..1; notes as MIDI or `'A4'`)
- `synth.voice(note, dur, vel, osc='saw', osc2, unison, detune, cutoff, res, filt='ladder', fenv, fenv_amt, env, glide_from, vib_*, drive, pitch_env)` — generic 2-osc VA.
  Presets: `lead(n,d,v,'saw'|'80s'|'square'|'soft'|'sync'|'chip')`, `pluck(n,d,v,'saw'|'future'|'soft'|'square'|'house'|'bell')`, `pad(notes,d,v,'warm'|'strings'|'80s'|'dark'|'choir'|'air'|'glass')`, `supersaw(notes,d)`, `stab(notes,d,v,'dub'|'rave'|'brass'|'organ')`, `bass(n,d,v,'analog'|'saw80s'|'reese'|'sub'|'pluck'|'square'|'fm')`, `b808(n,d,v,glide_from)`, `mono_line(events)` (legato/slides), `acid_line(steps, bpm, cutoff_curve=[(t,hz)])` (TB-303), `poly(notes, d, fn)`.
- `fm.epiano`, `fm.bell(n,d,v,'bell'|'tubular'|'glock'|'celesta'|'pluck'|'chime')`, `fm.glass_pad`, `fm.bass(...,'punch'|'wood'|'growl')`, `fm.mallet(...,'marimba'|'vibes'|'xylo'|'kalimba')`, `fm.brass`.
- `pluck.guzheng(n, d, v, orn=None|'rou'|'vib'|'slide_up'|'slide_down'|'huihua'|'slide_up_rou', interval=2)` (sampled 筝-like zither, synth fallback) · `guzheng_gliss(lo, hi, dur, key, mode, up)` 刮奏 (sync = last string) · `guzheng_tremolo` 摇指 · `pipa(n, d, v, tremolo=True)` 轮指 · `guitar(...,'nylon'|'steel'|'muted'|'uke')` · `strum(chord, d, v, 'uke')` · `harp` · `pizz` · `koto_harmonic`.
- `wind.wind_line([(t, dur, note, vel, orn)], 'dizi'|'flute'|'xiao')` orn: `'grace'` 叠音 `'da'` 打音 `'trill'` 颤音 `'slide'` 滑音 `'fall'` `'tongue'`; `wind.dizi(n,d)`.
- `chip.pulse(n, d, duty=.125|.25|.5, arp=[0,4,7], vib, sweep)` · `chip.triangle` · `chip.noise(d, period 0-15)` · `chip.arp_chord(notes, d)` · chip drums/SFX.
- `drums.kick('punchy'|'house'|'techno'|'soft'|'lofi'|'808'|'synthwave'|'cinematic'|'chip')` · `snare('tight'|'fat'|'808'|'trap'|'lofi'|'synthwave'(gated)|'brush'|'rimshot')` · `clap('808'|'tight'|'big'|'snap')` · `hat('closed'|'open'|'pedal'|'trap'|'lofi'|'half')` · `cymbal('crash'|'ride'|'china'|'splash'|'bell')` · `crash()` (sampled) · `tom(pitch='low'|'mid'|'high'|Hz|'A2', vel, kind='acoustic'|'synth')` · `rim` `shaker` `cowbell` `clave` `snap` `triangle_hit` · Chinese: `taiko('taiko'|'dagu'|'tanggu'|'rim')` `gong('chinese'|'small'|'tamtam'|'sample')` `bo('xiaobo'|'nao', choke)` `woodblock('muyu'|'bangzi'|'block')` · `drums.kit(name)` → dict of `f(vel)`: pop 808 trap house techno lofi synthwave chip acoustic cinematic guofeng.
- `samples.inst('piano'|'dantranh'|'harp'|'glock'|'marimba'|'kalimba'|'vibraphone').play(note, dur=None, vel, bend=[(t,semis)])` · `samples.hit('gong'|'crash'|'suscymbal'|'woodblock'|'tambourine'|'claps'|'timpani'|..., match=regex, vel)` · `samples.available()` (see SAMPLES.md).

## 5. Mix / Track API (`mg.Mix`)
```python
m = mg.Mix(duration=10.0, bpm=120, anchor=0.0, beats_per_bar=4, swing=0.0)   # recipes create this for you
t = m.track('pad', level=-25, gain=0, pan=0, width=1, sends={'hall': -10}, fx=[callable|pedalboard plugin], hp=None, lp=None, group='music')
t.add(sound, at, gain=0, pan=None)            # sync point at `at` (seconds);  t.add_beat(sound, beat) on the grid
t.loop(fn, 'x...x...x...x...', t0, t1, vel=1, humanize=0, vel_jitter=0)   # per-bar step pattern; fn(vel)->Sound
t.hits(fn, [(t, vel), ...])  ·  t.notes(fn, [(t, note, dur, vel)], unit='sec')
t.automate('gain'|'lpf'|'hpf'|'pan'|'width', [(t, value), ...])            # dB / Hz (log interp) / -1..1
t.duck(by='kick', depth=6, attack=.004, hold=.01, release=.18)           # sidechain pump (trigger times of that track/group)
t.region('stutter'|'tape_stop'|'mute'|'reverse'|'lofi'|'bitcrush'|'filter', at, dur, slice=..., pitch_step=...)
#   region edges are crossfaded (xfade=0.003 s) so they never click.  'tape_stop' = speed 1 -> 0 over dur and the
#   audio AFTER it stays silent (for endings / a gap before the drop); resume=True brings the music back after it.
#   'filter': hz=[(t_rel, Hz), ...], q, mode='lp'|'hp'|'bp'.   'lofi': sr, bits.   'bitcrush': bits, rate.
m.sfx(sound, at, gain=0, pan=None, verb=None, send='room', track='sfx')  # sound design; verb = send dB
m.group('music')  # the music bus Track: .level, .gain, .automate(...), .duck(...), .region(...)
m.bus('name', fn)  # custom send bus;  built-ins: room ambience plate hall verb big cathedral gated spring shimmer delay(3/16) delay8 delay4 tape_delay slap
m.stutter(at, dur) · m.tape_stop(at, dur) · m.mute(at, dur)                # region FX on the music group (see above)
m.master_kw.update(warmth=1.5, air=1.0)                                     # master options (tilt, width, glue_gr, mono_bass ...)
res = m.export(path, lufs=-14, tp=-1, spectrogram='x.png', stems_dir=None)  # render + master + 24-bit + analyze()
m.report()                                                                  # per-stem LUFS/peak table
```
`m.grid`: `bar(i, beat)`, `beat(b)`, `step(i, div, bar)`, `snap(t, div)`, `bar_at(t)`. `m.form`: `bpm bar beat build drop
outro end`, `chord_at(t, shift)`, `bass_at(t, octave)`, `segments(t0,t1)` → `(start, end, voicing, symbol)`, `bars(t0,t1)`,
`at(bar, beat)`, `energy_at(t)`, `curve(lo, hi)`, `sections`, `summary()`.
Pattern languages (`recipes.bass_events / comp_events`): bass `R r O o F f 3 b p - .` (root, octave, fifth, third,
fifth-below, approach-note, tie, rest), comp `X x - .`. Step strings: `X`=1.0 `x`=.78 `o`=.55 `g`=.3 (ghost) `.` rest.

## 6. Helpers
- `theory`: `hz('A4')`, `midi`, `name`, `scale('D4','gong',2)`, modes incl. `gong shang jue zhi yu` (五声), `chord('Am7')`,
  `roman('bVII','A','minor')`, `progression(prog, key, mode)` (voice-led, cluster-free), `degree`, `euclid`.
- `seq`: `step_times(grid,t0,t1,div,pattern)`, `arp(grid, chord_fn, t0, t1, div, pattern='up'|'updown'|..|[idx], octaves, gate, accents, rest)`,
  `melody(grid, t0, notes, rhythm)`, `degrees(key, mode, [1,3,5])`, `roll(t0, t1, 8, 32, grid)` (accelerating snare roll),
  `euclid_pattern(5,16)`, `humanize(events)`.
- `sync`: `frame(t, fps)`, `snap(times, grid, div, tol)`, `grid_report(times, grid)`, `fit_bpm(hits, lo, hi, div=2)` →
  `(bpm, anchor, max_err)`, `place(m, times, make, gain, pan, early_frames, fps, verb)`, `stagger(t0, n, step)`, `load_cues(path)`.
- `fx`: `reverb(x, kind, decay, mix)`, `delay`, `chorus`, `flanger`, `phaser`, `saturate(x, dB, 'tanh'|'tape'|'tube'|'hard'|'fold'|'diode')`,
  `tape`, `wow_flutter`, `bitcrush(x, bits, rate)`, `lofi`, `telephone`, `mp3_artifacts`, `compress`, `sidechain`, `trance_gate`,
  `tremolo`, `autopan`, `widen`, `varispeed`, `repitch`, `pitch_shift`, `tape_stop`, `tape_start`, `stutter`, `scratch`, `shimmer`, `pb(x, *pedalboard_plugins)`.
- `filters`: `lpf/hpf(x, hz | [(t,hz)...])`, `bpf`, `svf(x, cutoff, q, mode)`, `ladder(x, cutoff, res, drive)`, `eq(x, [('hp',30),('pk',3000,-3,1.2),('hs',8000,2)])`, `formant`.
- Sound methods: `.gain(dB) .pan(p) .width(w) .fade(i,o) .reverse() .trim(a,b) .length(d) .pad(before, after) .lpf(hz) .hpf(hz)
  .fx(*chain) .pitch(semis) .loud(target) .normalize(dB) .at_sync(t) .stereo() .mono()`; `mg.layer([(snd, offset, gain_db, pan), ...])`.

## 7. QC (`mgaudio.qc`)
`mg.analyze(path)` → `{duration, samples, lufs, true_peak (ideal band-limited 8x reading - the strictest), sample_peak, crest_db, dc, clipped, nonfinite, bands (% energy:
sub<60 bass<250 lowmid<2k presence<5k brilliance<12k air), stereo_corr, longest_gap, onsets (refined, ~±5 ms), warnings}`.
Typical good master: sub 5-35 %, bass 30-65 %, presence 1-5 %, brilliance 0.5-6 %. Warnings: duration ≠ 10.000 s, LUFS off by >0.6,
TP > -1, DC, clipping, sub > 45 %, presence > 7 % (harsh), dull, thin, phase, silence gap > 0.6 s.
`mg.spectrogram(path, png, marks=hits, sections=m.form.sections)` · `mg.hit_alignment(path, hits)` · `mg.check_duration(path, 10)`
· `qc.sheet({name: sound}, png)` (SFX contact sheet) · CLI: `python3 -m mgaudio out/audio.wav --png out/spec.png --hits 1.2,4.8`.

## 8. Example (a) — recipe + SFX at visual hits + export
```python
import sys; sys.path.insert(0, 'lib/audio')   # from the repo root
import mgaudio as mg
from mgaudio import recipes, sfx

cues = {'pops': [0.50, 0.90, 1.30, 1.70], 'whoosh': 3.90, 'drop': 4.80, 'logo': 8.40}   # json.load(open('cues.json'))
m = recipes.synthwave(bpm=100, key='A', drop=cues['drop'], outro=cues['logo'])
f = m.form
for i, t in enumerate(cues['pops']):                                    # rising pops walking L -> R
    m.sfx(sfx.pop('bubble', pitch=1 + 0.08 * i), at=t, pan=-0.45 + 0.3 * i)
m.sfx(sfx.whoosh(0.8, 'sci', direction=1), at=cues['whoosh'])            # sync = pass-by peak
m.sfx(sfx.impact('cinematic'), at=cues['drop'], gain=-2, verb=-10)       # verb = send to 'room'
m.sfx(sfx.shimmer_hit(f.chord_at(cues['logo'])[-1] + 12), at=cues['logo'], gain=-4)   # in key
res = m.export('out/audio.wav', spectrogram='out/audio_spec.png')
assert not res['warnings'], res['warnings']
```

## 9. Example (b) — fully custom composition
```python
import sys; sys.path.insert(0, 'lib/audio')   # from the repo root
import mgaudio as mg
from mgaudio import synth, drums, sfx, seq
from mgaudio.recipes import Form, bass_events

f = Form(duration=10, bpm=96, key='D', mode='minor', prog='i VI III VII', drop=4.0)   # sections + harmony
m = mg.Mix(10.0, bpm=f.bpm, anchor=f.drop)          # grid bar 0 = the drop
m.group('music').level = -20
g = m.grid
kit = drums.kit('synthwave')
m.track('kick', level=-17).loop(kit['kick'], 'x...x...x...x...', f.drop, f.outro).add(kit['kick'](), f.outro)
m.track('snare', level=-21, sends={'plate': -14}).loop(kit['snare'], '....x.......x...', f.drop, f.outro)
m.track('hat', level=-29, pan=0.2).loop(lambda v: drums.hat('closed', v), 'x.x.x.x.x.x.x.x.', f.build, f.outro)
bass = m.track('bass', level=-21)
for t, n, d, v in bass_events(f, g, f.build, f.outro, 'r.r.r.r.r.r.r.o.'):
    bass.add(synth.bass(n, d, v, 'saw80s'), t)
bass.duck(by='kick', depth=5, release=0.15)
pad = m.track('pad', level=-25, sends={'hall': -10})
for a, b, voicing, sym in f.segments(0, 10):         # voice-led chord per bar, final chord in the outro
    pad.add(synth.pad(voicing, b - a, 0.8, '80s'), a)
pad.automate('lpf', [(0, 800), (f.drop, 12000), (10, 12000)])
pad.duck(by='kick', depth=3)
arp = m.track('arp', level=-26, sends={'delay': -9})
for t, n, d, v in seq.arp(g, lambda t: f.chord_at(t, 12), 0, f.outro, div=16, pattern='updown'):
    arp.add(synth.pluck(n, d, v, 'saw'), t)
m.track('riser', level=-26).add(sfx.riser(f.drop - f.build, 'noise'), f.drop)   # sync = end = the drop
m.track('crash', level=-27).add(drums.crash(), f.drop)
m.sfx(sfx.text_hit('slam'), at=f.drop)
m.export('out/audio.wav', spectrogram='out/audio_spec.png')
m.report()
```

## 10. Example (c) — sync: fit tempo to the picture, place SFX exactly
```python
import sys; sys.path.insert(0, 'lib/audio')   # from the repo root
import mgaudio as mg
from mgaudio import recipes, sfx, sync

hits = [0.50, 1.00, 1.50, 2.25, 4.00, 5.25]         # visual events (s) from cues.json
m = recipes.pop(hits=hits, drop=4.00)               # bpm=None + hits -> best-fitting tempo in the recipe range
print(m.form.bpm, m.form.fit_err)                   # 120.0, ~0
for row in sync.grid_report(hits, m.grid, 16):      # (t, grid_t, err, 'bar k step s/16')
    print(row)
bpm, anchor, err = sync.fit_bpm(hits, 100, 130, div=2)       # or choose yourself
sync.place(m, hits[:4], lambda i: sfx.pop('mouth', pitch=1 + 0.06 * i), gain=-2, early_frames=1, fps=30,
           pan=[-0.5, -0.2, 0.2, 0.5])              # 1 frame early: the transient reads ON the hit frame
sync.place(m, [hits[4]], sfx.transition(0.8, 'whoosh_hit'))  # whoosh -> hit, sync = the hit
sync.place(m, [hits[5]], lambda: sfx.glitch(0.25, 'digital'), verb=-14)
m.export('out/audio.wav', spectrogram='out/audio_spec.png')
print(mg.hit_alignment('out/audio.wav', hits))      # onset per hit (~±5 ms; the pops read -33 ms = the 1-frame lead)
```
Runnable copies: `examples/a_recipe_plus_sfx.py`, `b_custom.py`, `c_sync.py`; all recipes: `examples/run_all.py`;
every SFX + contact sheets: `examples/sfx_gallery.py` → `examples/out/sfx/_sheet*.png`.

## 11. Sound-design rules of thumb
- Hero hit = layer: `impact(...)` (+ `boom()` for size) at the drop; lead into it with `riser`/`reverse_cymbal`
  (sync = the hit) or `transition('riser_hit')`. Don't stack more than ~3 SFX on one frame.
- Whoosh `dur` ≈ the on-screen travel time; `direction` = screen direction; `peak` = when it crosses centre.
- Repeated UI hits: vary `pitch`/`seed` per hit (`sync.place(..., lambda i: ...)`), keep them in key (`blip(note=...)`
  with `m.form.chord_at(t)`), pan with the object. Beds (`vinyl`, `vhs_noise`) go on at t=0 with `gain` -6..0.
- Leave the ending to the recipe (final chord rings, master fades the last 250 ms). Everything must be placed ≥ 0 s.
- Speed: first import JIT-loads (~1-2 s); a recipe + 20 SFX exports in ~3-8 s. Don't re-render samples in loops needlessly.
