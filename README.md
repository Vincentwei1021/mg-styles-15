**English** | [简体中文](README.zh-CN.md)

# 15 Motion Design Styles: Films, Prompts and Source

Fifteen 10-second motion-design films, one style each, all made by Claude Opus 5.5 writing code from a prompt: the picture, the
animation, the music and the sound effects all come from code. This repository holds every film, a description of its style,
the full prompt and the complete source.

**Watch online: https://vincentwei1021.github.io/mg-styles-15/**

[![The showcase page: the Frame-by-Frame film next to its style notes, with the prompt open below](docs/screenshot-en.jpg)](https://vincentwei1021.github.io/mg-styles-15/)

Each style has its own section: the film, what the style is and how this film was made. Below it, the full prompt and a browser
for every source file open with one click. The page switches between English and Chinese.

| # | Style | Film | Prompt | Source |
|---|---|---|---|---|
| 01 | Frame-by-Frame / Line Boil | HAND MADE | [prompts/05-cel-boil.md](prompts/05-cel-boil.md) | [demos/05-cel-boil](demos/05-cel-boil) |
| 02 | Isometric 2.5D | ISOPOLIS — Let the City Grow | [prompts/03-isometric.md](prompts/03-isometric.md) | [demos/03-isometric](demos/03-isometric) |
| 03 | Flat Vector | popwise — One Dot | [prompts/01-flat-vector.md](prompts/01-flat-vector.md) | [demos/01-flat-vector](demos/01-flat-vector) |
| 04 | Line Art | ATELIER LINEA — One Line | [prompts/02-line-art.md](prompts/02-line-art.md) | [demos/02-line-art](demos/02-line-art) |
| 05 | 3D Render (C4D / Blender look) | soft. — Soft Landing | [prompts/04-3d-render.md](prompts/04-3d-render.md) | [demos/04-3d-render](demos/04-3d-render) |
| 06 | Shape Morph | morphe. — One Shape, Every Story | [prompts/08-morph.md](prompts/08-morph.md) | [demos/08-morph](demos/08-morph) |
| 07 | Sticker Explainer | How Many Elements Hide in a Phone? | [prompts/19-paperclip.md](prompts/19-paperclip.md) | [demos/19-paperclip](demos/19-paperclip) |
| 08 | Cyberpunk HUD / FUI | KESTREL-9 · Target Acquired | [prompts/22-hud.md](prompts/22-hud.md) | [demos/22-hud](demos/22-hud) |
| 09 | Collage / Cut-out | NOGGIN Quarterly | [prompts/06-collage.md](prompts/06-collage.md) | [demos/06-collage](demos/06-collage) |
| 10 | Aurora & Glassmorphism | Aurora — Think in Light | [prompts/12-aurora-glass.md](prompts/12-aurora-glass.md) | [demos/12-aurora-glass](demos/12-aurora-glass) |
| 11 | Geometric Bauhaus | KONSTRUKTION · 20 Beats | [prompts/09-bauhaus.md](prompts/09-bauhaus.md) | [demos/09-bauhaus](demos/09-bauhaus) |
| 12 | 80s Synthwave / VHS | NEON DRIVE — Midnight 1986 | [prompts/10-synthwave.md](prompts/10-synthwave.md) | [demos/10-synthwave](demos/10-synthwave) |
| 13 | Pixel Art | PIXEL QUEST | [prompts/20-pixel.md](prompts/20-pixel.md) | [demos/20-pixel](demos/20-pixel) |
| 14 | Liquid Motion | drop. — It All Starts with a Drop | [prompts/07-liquid.md](prompts/07-liquid.md) | [demos/07-liquid](demos/07-liquid) |
| 15 | Variety Captions (9:16 vertical) | Miaowu Diary EP.07 | [prompts/18-hanazi.md](prompts/18-hanazi.md) | [demos/18-hanazi](demos/18-hanazi) |

## What is in the repository

| Path | Contents |
|---|---|
| `index.html`, `site/` | The showcase page: each style's film, description, prompt and a source browser, in English and Chinese |
| `videos/` | The 15 films and their cover frames. 8 use the original streams as they are; the other 7 were 37–100 Mb/s, too heavy to stream on the web, and were re-encoded to H.264 under 28 Mb/s |
| `prompts/` | One complete prompt per style, with instructions (the instructions are in Chinese; the prompts are in English, with Chinese style notes) |
| `demos/<name>/` | Each film's source: the picture code (`index.html` and JS), the soundtrack script `audio.py`, the timing sheet `cues.json`, and the scripts that generated the film's own assets |
| `harness/render.mjs` | The renderer: captures every frame in headless Chrome, then muxes video and audio with ffmpeg |
| `harness/preview.html` | Scrub through any film in the browser |
| `lib/audio/` | mgaudio, the toolkit that synthesises the music and sound effects, plus the 103 instrument samples the 15 soundtracks use |
| `assets/` | Textures and the HDRI the films share; a list of the fonts (the font files are not in the repository) |
| `rubric.md`, `template.md` | A review prompt; a template for writing a prompt for a new style |
| `docs/` | The screenshots in this README |

## Make a film from a prompt

1. Open an AI assistant that can write code and run commands (for example Claude Code) in an empty folder. The machine needs Node, Chrome and ffmpeg; the suggested route for the 3D style uses Blender.
2. Open any file in `prompts/` and send the whole prompt block.
3. To make it your own: only `Creative seed` is a specific story. Replace its story, brand name, copy and colours with yours, or change `Output` to vertical 1080×1920 or another length. Keep `Signature features`: it is what makes the style recognisable at a glance.
4. To push it further: once the film is done, have a second AI review it with [rubric.md](rubric.md) and paste the review back for another round. The original films went through make → review → revise twice.
5. To write a new style: fill in the four sections of [template.md](template.md) (output spec, technical route, creative seed, signature features) and copy the shared parts as they are.

To save effort, you can also point the AI at this repository's `harness/render.mjs` for rendering and `lib/audio` for the soundtrack, instead of building both from scratch.

## Run the source

```bash
# from the repository root
npm install
pip install -r requirements.txt
python3 demos/01-flat-vector/audio.py          # soundtrack → demos/01-flat-vector/out/audio.wav
node harness/render.mjs demos/01-flat-vector   # render every frame → demos/01-flat-vector/out/video.mp4
python3 -m http.server 8000                    # preview: http://localhost:8000/harness/preview.html?demo=01-flat-vector
```

- Serve from the repository root: the paths inside the films (`/assets/...`, `/node_modules/...`) are relative to it.
- The renderer uses Chrome's default macOS location; elsewhere, point the `MG_CHROME` environment variable at Chrome.
- The 3D film's picture is a Blender-rendered frame sequence; the steps are in [demos/04-3d-render/README.md](demos/04-3d-render/README.md).

## Deploy your own copy

1. Fork this repository, or push all of its files (including `.nojekyll`) to the `main` branch of your own repository. The largest file is 38 MB, under GitHub's 100 MB per-file limit, so Git LFS is not needed.
2. In the repository, open Settings → Pages → Build and deployment, choose Deploy from a branch, branch `main`, folder `/ (root)`. On a free account Pages works only for public repositories.
3. A minute or two later, open `https://<user>.github.io/<repo>/`. The page detects the repository by itself, so "Open on GitHub" jumps to the right file; with a custom domain, put the repository URL in `<meta name="repo">` in `index.html`.

The site is about 560 MB, 425 MB of it video. GitHub Pages allows 1 GB per site and a soft limit of 100 GB of traffic a month; videos download only when played.

## Good to know

- The font files are not in the repository: their licences differ, and the Chinese fonts are large. [assets/fonts/README.md](assets/fonts/README.md) lists which ones are needed and where they go. Without them the browser falls back to system fonts, and the lettering will differ from the films.
- The same prompt makes a different film every time. Each original film went through several rounds of iteration; a single run usually does not reach the same finish.
- The soundtrack scripts are deterministic: rerun in the same environment, they give the same result every time. Rerun with the versions in `requirements.txt`, 4 of them match the films' audio (within the least significant bit) and the other 11 differ in places, probably because of changes in the numerical libraries.
- When you make your own films, use only assets licensed for commercial use (CC0, OFL and the like). The prompts already ask for this.
