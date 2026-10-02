# 3D 渲染系（C4D/Blender 质感） 3D Render / CGI Motion Design

**原片**：soft.「Soft Landing 柔软着陆」 · 1920×1080 · 24 fps · 10 秒 · AI 评审终评 7.71 / 10

**源码**：[demos/04-3d-render/](../demos/04-3d-render/)

## 怎么用

1. 新建一个空文件夹，在里面打开一个能写代码、能执行命令的 AI 助手（例如 Claude Code）。本机需要能跑网页渲染（Node + Chrome）和 ffmpeg；这种风格建议的路线要用 Blender。
2. 把下面「提示词」整段复制进去发送。
3. 想换成自己的内容：改 `Creative seed` 里的故事、品牌名、文案和配色，或者改 `Output` 里的尺寸（比如竖屏 1080×1920）。不要删 `Signature features` 那一段，它是这种风格被一眼认出来的依据。
4. 想再提高：成片出来后，另开一个 AI 用 [rubric.md](../rubric.md) 评审，把评审意见贴回给制作的 AI 再改一轮。原片就是这样改了两轮。

## 提示词

```text
You are the director, motion designer, engineer and sound designer of ONE 10-second motion-design film.
The goal is the most classic, yet most stunning form of this style — award-shortlist / high-end commercial quality. A clean,
template-looking result is a fail. Benchmarks: Buck, ManvsMachine, Ordinary Folk, Giant Ant, Territory Studio, Apple keynote
motion, Pentagram motion identities, top Behance/Motionographer features, top 抖音/B站 designer accounts.

# Style
3D 渲染系（C4D/Blender 质感） 3D Render / CGI Motion Design

# Output (fixed)
- 1920×1080, 24 fps, exactly 10.000 s (240 frames), H.264 MP4 with stereo AAC audio (48 kHz), mastered to −14 LUFS
  integrated, true peak ≤ −1 dBTP. Final file: video.mp4.

# Suggested technical route
Blender 5.1.2 CLI (bpy script → Cycles on Metal GPU with OIDN denoise, or EEVEE if it holds quality) → PNG sequence → ffmpeg; optional HTML overlay pass for typography
(You may choose a better route if it clearly raises quality; say why.)

# Creative seed
「Soft & Satisfying」The C4D/Octane pastel product-ident look (Maxon demo-reel vibe): soft candy materials, cloner arrays, physics-feel motion.
- Pastel studio: infinite cyc backdrop, big soft area lights + HDRI (see /assets/hdri), shallow DOF (f/1.8 feel), 24 fps, real motion blur.
- A MoGraph-style cloner field (geometry-nodes grid of glossy rounded pills/spheres) ripples with an effector wave; a hero object — inflated/bevelled 3D wordmark (e.g. "SOFT" or an invented brand) or a glossy jelly logo — drops in, squash-and-stretch jiggle (damped spring), collides with and displaces the cloner field.
- Material trio: SSS gummy (candy pink / peach), glossy plastic (cream / lilac), frosted glass or chrome accent — with AO, soft reflections, subtle subsurface glow.
- Camera: long-tail ease (80% of the move in the first 20%), ends on a clean hero composition held ~1s.
Sound: ASMR-satisfying soft thuds, squishes, bubbly pops, airy cinematic pad; hits frame-synced to impacts.

You are the director: you may change the concept, copy, story beats and brand names if you find a stronger idea, but the result must remain the CANONICAL, instantly-recognisable form of this style and must hit its signature features below.

# Signature features and key techniques (the result is judged against these)
Cinema 4D + Redshift/Octane 或 Blender 渲染的实体质感动画：软胶、玻璃、金属、布料，配合克隆阵列和物理模拟。是高端产品片（手机、饮料、球鞋）和品牌 ident 的主流，Maxon 官方 Demo Reel 就是该风格的年度风向标。
视觉特征 PBR真实材质, 浅景深, 柔和棚拍布光, 克隆器阵列, 软体碰撞, 糖果色软胶质感
关键技法 MoGraph 核心：Cloner 克隆器 + Random/Plain Effector 做群体波浪式动画
质感三件套：SSS 次表面散射（软胶感）+ AO + HDRI 三点布光
运动多用长尾 ease：位移曲线前 20% 完成 80% 路程，收尾极慢，配 motion blur
24/25fps 电影帧率 + 浅景深（f/1.8 感）区别于 2D 系的 30fps 利落感
常见结构：产品为轴心，粒子/流体/布料围绕它做物理模拟编排

# How to work
1. Treatment. Write down one clear idea: a hook in the first 0.5 s (never open on more than 0.3 s of empty or black), an
   escalation, one unmistakable hero moment at ~60–75 % of the runtime, and a composed end frame held ~0.8–1.2 s with living
   micro-motion. Map every signature feature above to a moment. Keep one cue sheet (beats and hit times) that both the
   picture and the sound read from.
2. Key frames before motion. Build the look, render stills at 6–10 key times and actually look at them. Each still should be
   poster-worthy: composition, hierarchy, negative space, type set properly (kerning, line-height, weight contrast, CJK
   punctuation, ~5 % safe margins). Iterate until nothing looks default, generic, cramped or "AI-template".
3. Motion. Build the choreography and preview at low resolution. Step through the fastest moves frame by frame: spacing,
   easing, arcs, overlap, anticipation and follow-through, motion blur. No unintended dead spans; the energy follows the music.
4. Sound. Write genre-correct music and sound design locked to the cue sheet. Check that visual hits land on audio onsets.
   Master to the output spec.
5. Final. Render at full resolution (motion blur where apt), then check: exactly 10.00 s, resolution, fps, audio present and at
   the right loudness, no black frames, no fallback fonts or tofu, no clipped elements at the frame edges, no shimmer on thin
   lines, no gradient banding. Fix and repeat until you would submit it to a festival.
6. Write an honest self-critique: what is strongest, what is weakest, what you would do with more time.

# Rules
- Rendering must be deterministic: every frame is a pure function of time t. Seeded randomness only; physics and particles
  precomputed or closed-form; no real-time clocks; no state-triggered CSS transitions. A reliable route: a web page that can
  draw any time t on request, captured frame by frame with a headless browser and encoded with ffmpeg (or a Blender script
  that renders a PNG sequence).
- Assets: only CC0 / public domain / OFL / Apache / free-for-commercial-use. Record each source and licence in CREDITS.md.
  No real brand trademarks; invent brand names.
- On-screen text must be correct and natural: idiomatic Chinese, proper CJK punctuation, no typos.

# Craft checklist (what a jury looks for)
- Style authenticity: an expert names the style in one second; every signature technique is present and executed correctly.
- Motion craft: purposeful easing (no linear unless mechanical by design), overlap and stagger, anticipation and
  follow-through, arcs, squash and stretch where the style allows, consistent physics, motion blur where apt; transitions
  carried by elements, not crossfades.
- Rhythm: hits locked to the music; contrast between busy and calm; no monotony.
- Design: strong composition, grid, typographic hierarchy, controlled palette; texture and finishing (grain, glow, vignette)
  only where the style wants it; nothing looks accidental.
- Technical polish: no jitter (unless intended), no popping, no aliasing, no banding, no fallback fonts, no half-loaded images.
- Sound: genre-correct, musical, synced, mastered.

# Before you deliver, score yourself honestly
1–10 on style fidelity, concept wow, motion craft, design & typography, finish & texture, sound & sync, technical
(6 = template-level, 8 = high-end agency, 9 = award shortlist). Aim for 9; fix whatever scores lowest first.

# Deliver
video.mp4, plus a short report: the concept in two sentences; a beat sheet with timecodes; how each signature feature is
realised; the tech route; check numbers (duration, resolution, fps, loudness, true peak); your honest top-3 weaknesses.
```
