# 液态流动 Liquid Motion

**原片**：drop.「万物始于一滴」 · 1920×1080 · 30 fps · 10 秒 · AI 评审终评 7.57 / 10

**源码**：[demos/07-liquid/](../demos/07-liquid/)

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
液态流动 Liquid Motion

# Output (fixed)
- 1920×1080, 30 fps, exactly 10.000 s (300 frames), H.264 MP4 with stereo AAC audio (48 kHz), mastered to −14 LUFS
  integrated, true peak ≤ −1 dBTP. Final file: video.mp4.

# Suggested technical route
HTML WebGL2 fragment shader: 2D SDF metaballs (smooth-min) + fake 3D lighting from field gradient normals, text SDF for the logo
(You may choose a better route if it clearly raises quality; say why.)

# Creative seed
「液态创世」Liquid logo genesis — glossy, organic, high energy.
- Deep plum ground; glossy candy liquid (hot orange → pink → violet) with specular highlights and fresnel rim so it reads like thick 3D liquid, not flat blobs.
- 0–2s: droplets fall and splash with squash on landing; 2–4s: blobs merge via metaball fusion — stretched necks, snap, 2–3 frame rebound; secondary droplets follow 2–3 frames late;
- 4–6s: a big liquid wave floods across the frame as a transition (wavy front with 3–5 phase-offset bulges);
- 6–8.5s: the liquid coalesces into a wordmark (e.g. "FLUX") — text SDF blended with the metaballs;
- 8.5–10s: a last drip falls from the logo and ripples; hold.
Ease: flung, never uniform (cubic-bezier(0.22,1,0.36,1)).
Sound: bubbly gloops, pour, splash, drip, deep bass swell under a glossy synth bed.

You are the director: you may change the concept, copy, story beats and brand names if you find a stronger idea, but the result must remain the CANONICAL, instantly-recognisable form of this style and must hit its signature features below.

# Signature features and key techniques (the result is judged against these)
图形像液体一样流动、拉丝、滴落、融合：转场是一泼颜料漫过屏幕，logo 从一滴液体聚合成形。有机、解压、高能量，广泛用于音乐视频、食品饮料广告和转场包装。
视觉特征 波浪边缘转场, 拉丝与滴落, metaball融合, 次级液滴跟随, 有机曲线永不直线
关键技法 液态转场：遮罩路径手 K 波浪形前沿扫过画面，前沿加 3~5 个错相位的凸起
metaball 融合的通用伪造法：高斯模糊(20px+) → 提高对比度阈值（AE 用 Levels 收紧、Web 用 feColorMatrix alpha 阈值），两球靠近即自动'粘连'
拉丝-断裂-回弹：主形离开时留一条细颈，断裂瞬间两端各回弹 2~3 帧
缓动前快后慢 cubic-bezier(0.22,1,0.36,1)，液体只会被'甩'出去不会匀速
次级液滴延迟主体 2~3 帧跟随（follow-through），落地做扁平化 squash

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
