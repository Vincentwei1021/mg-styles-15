# 逐帧手绘 / 线条沸腾 Cel Animation / Frame-by-Frame & Line Boil

**原片**：手作 HAND MADE · 1920×1080 · 24 fps · 10 秒 · AI 评审终评 8.07 / 10

**源码**：[demos/05-cel-boil/](../demos/05-cel-boil/)

## 怎么用

1. 新建一个空文件夹，在里面打开一个能写代码、能执行命令的 AI 助手（例如 Claude Code）。本机需要能跑网页渲染（Node + Chrome）和 ffmpeg。
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
逐帧手绘 / 线条沸腾 Cel Animation / Frame-by-Frame & Line Boil

# Output (fixed)
- 1920×1080, 24 fps, exactly 10.000 s (240 frames), H.264 MP4 with stereo AAC audio (48 kHz), mastered to −14 LUFS
  integrated, true peak ≤ −1 dBTP. Final file: video.mp4.

# Suggested technical route
HTML Canvas2D: custom variable-width brush renderer (centreline + pressure → outline polygon), boil = 3–4 jitter variants cycled every 2 frames; paper texture multiply
(You may choose a better route if it clearly raises quality; say why.)

# Creative seed
「手作魔法」Hand-made frame-by-frame magic, Buck/Giant-Ant hybrid (clean shapes + hand-drawn cel FX), animated on 2s at 24 fps.
- Warm paper ground; ink linework that BOILS (lines redrawn with slight variation every 2 frames); fills slightly off-register like hand colouring.
- Story: a matchstick strikes (SMEAR frame, on 1s for the fast action) → a flame spirit character jumps out, anticipation + squash, dances (on 2s) → it bursts into cel FX: smoke puffs curling, sparks, star bursts, speed lines → the FX re-form into hand-lettered title (e.g. "HAND MADE" or 手作) that keeps boiling on a 1s hold (on 3s for the hold).
- Palette 3–4 colours: ink black, tomato red, sunny yellow, cream paper; paper grain multiply 10–15%.
Sound: playful jazzy pizzicato/xylophone bed + cartoon SFX: strike, fwoosh, pop, poof, sparkle — synced to the frame.

You are the director: you may change the concept, copy, story beats and brand names if you find a stronger idea, but the result must remain the CANONICAL, instantly-recognisable form of this style and must hit its signature features below.

# Signature features and key techniques (the result is judged against these)
手绘逐帧或在矢量动画上叠加逐帧质感，标志性特征是 line boil——线条每隔几帧轻微抖动，仿佛画面在'呼吸'。Giant Ant、Buck 等工作室大量使用 cel 元素（烟、水花、速度线）点缀主动画，反数字精致感的核心手段。
视觉特征 线条持续微抖(boil), 一拍二/一拍三节奏, smear拖影帧, 手绘烟火水花点缀, 纸纹底
关键技法 打帧节奏：24fps 下'一拍二'（实际12fps）为主，快动作切'一拍一'，静止镜头'一拍三'
line boil 伪造法：AE 用 Turbulent Displace（数量2~5、大小50）+ 每 2 帧随机化 evolution + Posterize Time 12fps；真 boil 则画 3~4 张微差线稿循环
smear frame：快速位移的中间帧把物体拉长 150%~300% 只保留 1 帧
cel FX 点缀层：烟/水花/闪电用纯手绘逐帧叠在矢量主体上（Buck 式 hybrid）
整体叠纸纹（multiply 10~15%）统一手作气质

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
