"""Genre recipes: each returns a populated Mix (music group only) on a drop-anchored grid.

    m = recipes.synthwave(bpm=100, key='A', drop=4.8, hits=[1.2, 4.8, 7.2])
    m.form            # Form: bpm, bar, build/drop/outro times, chord_at(t), bars(), ...
    m.sfx(sfx.whoosh(0.6), at=4.5)      # add sound design on the 'sfx' group
    m.export('out/audio.wav', spectrogram='out/audio_spec.png')
"""
from .base import Form, LV, new_mix, bass_events, comp_events, chord_tone_melody, place_notes, place_segments  # noqa
from .retro import synthwave, darksynth, vaporwave, chiptune  # noqa
from .club import techno, acid, pop, future_bass, trap, glitch_hop  # noqa
from .chill import lofi, ambient  # noqa
from .world import guofeng  # noqa
from .fun import variety, explainer  # noqa

RECIPES = {
    'synthwave': synthwave, 'darksynth': darksynth, 'vaporwave': vaporwave, 'chiptune': chiptune,
    'techno': techno, 'acid': acid, 'pop': pop, 'future_bass': future_bass, 'trap': trap, 'glitch_hop': glitch_hop,
    'lofi': lofi, 'ambient': ambient, 'guofeng': guofeng, 'variety': variety, 'explainer': explainer,
}

# demo slug -> (recipe, default kwargs, alternative, SFX palette suggestions)
STYLES = {
    '01-flat-vector': ('pop', {}, 'future_bass', 'pop swish whoosh(kind="swoosh") blip click ui transition("swish_pop")'),
    '02-line-art': ('ambient', {'flavor': 'piano'}, 'explainer', 'pen whoosh(kind="air") tick chime sparkle'),
    '03-isometric': ('explainer', {}, 'pop', 'pop click blip ui whoosh tick hud_beep'),
    '04-3d-render': ('pop', {'bpm': 118}, 'ambient(flavor="product")', 'pop bubble gloop boing whoosh(kind="soft") impact("soft")'),
    '05-cel-boil': ('lofi', {'keys': 'piano'}, 'variety', 'paper pen pop boing whoosh(kind="cloth") swish'),
    '06-collage': ('lofi', {'flavor': 'boombap', 'keys': 'piano'}, 'vaporwave',
                   'paper tape_rip sticker_slap scissors shutter record_scratch stamp("rubber")'),
    '07-liquid': ('future_bass', {}, 'lofi', 'bubble bubbles drip gloop splash squelch morph'),
    '08-morph': ('future_bass', {'bpm': 140}, 'techno', 'morph stretch whoosh(kind="sci") pop blip'),
    '09-bauhaus': ('techno', {}, 'explainer', 'click tick blip pop whoosh(kind="swish") impact("punch")'),
    '10-synthwave': ('synthwave', {}, 'darksynth', 'whoosh(kind="sci") laser shimmer_hit impact("cinematic") riser'),
    '11-grain': ('lofi', {}, 'ambient(flavor="piano")', 'paper vinyl pen whoosh(kind="soft") shutter("film")'),
    '12-aurora-glass': ('ambient', {'flavor': 'glass'}, 'future_bass', 'shimmer_hit sparkle magic whoosh(kind="air") swell'),
    '13-text-flash': ('trap', {}, 'pop', 'text_hit("slam"/"flash"/"pop"/"glitch") whoosh swish impact("punch") shutter("phone")'),
    '14-sticker-journal': ('variety', {'flavor': 'cute'}, 'lofi', 'sticker_slap sticker_peel paper pen pop tape_rip sparkle'),
    '15-guochao': ('guofeng', {}, 'guofeng(flavor="classical")',
                   'stamp("seal") paper whoosh(kind="cloth") drums.gong drums.taiko drums.woodblock("bangzi")'),
    '16-glitch': ('glitch_hop', {}, 'darksynth', 'glitch digital_noise data_chirp bitcrush_burst static stutter'),
    '17-vaporwave': ('vaporwave', {}, 'lofi', 'vhs_noise head_switch tape_stop crt_on static chime'),
    '18-hanazi': ('variety', {}, 'pop', 'boing sproing duang slide_whistle pop squeak zip_ cork_pop rimshot_joke'),
    '19-paperclip': ('explainer', {}, 'pop', 'pop click tick blip ui whoosh(kind="swish") paper typing'),
    '20-pixel': ('chiptune', {}, None, 'coin jump powerup oneup explosion_8bit blip'),
    '21-acid': ('acid', {}, 'techno', 'glitch morph whoosh(kind="sci") zap impact("metal") gloop'),
    '22-hud': ('darksynth', {}, 'techno', 'hud_beep hud_scan lock_on hud_data hud_open hud_alert hud_ping data_chirp'),
}


def recipe(name, **kw):
    """recipe('synthwave', bpm=100) -> Mix."""
    return RECIPES[name](**kw)


def for_style(slug, **kw):
    """Default recipe for a demo slug ('10-synthwave' or just 'synthwave'): for_style('13-text-flash', drop=3.2)."""
    key = next((k for k in STYLES if k == slug or k.split('-', 1)[1] == slug), None)
    if key is None:
        raise KeyError(f'unknown style {slug!r}; one of {list(STYLES)}')
    name, dkw, _, _ = STYLES[key]
    return RECIPES[name](**{**dkw, **kw})
