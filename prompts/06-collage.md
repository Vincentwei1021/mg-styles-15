# 拼贴剪贴 Collage / Cutout Animation

**原片**：NOGGIN 脑洞季刊「脑洞大开 The Mind Is a Collage」 · 1920×1080 · 30 fps · 10 秒 · AI 评审终评 8.14 / 10

**源码**：[demos/06-collage/](../demos/06-collage/)

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
拼贴剪贴 Collage / Cutout Animation

# Output (fixed)
- 1920×1080, 30 fps, exactly 10.000 s (300 frames), H.264 MP4 with stereo AAC audio (48 kHz), mastered to −14 LUFS
  integrated, true peak ≤ −1 dBTP. Final file: video.mp4.

# Suggested technical route
HTML: DOM/Canvas with PNG cutouts from /assets/images (rembg), SVG/CSS white-edge + halftone filters; stepped 12 fps (render 30 fps, hold motion on 12 fps grid)
(You may choose a better route if it clearly raises quality; say why.)

# Creative seed
「脑洞拼贴」Surreal Dada/Monty-Python cutout collage in a modern editorial magazine finish.
- Newsprint/kraft paper ground; a public-domain Victorian portrait cutout with rough white scissor edge + halftone; the top of the head FLIPS OPEN like a lid (Terry Gilliam homage) revealing deep space (NASA PD imagery) from which flowers, birds, planets, pointing hands and a vintage rocket spill out.
- Jaw/mouth on a separate cut flaps with the sound; hands slap elements onto the page; torn-paper strips; bold constructivist red/black diagonal typography (e.g. "THE MIND IS A COLLAGE" / 脑洞大开).
- Motion on 12 fps (even 6 fps for some holds) with ±2px hand-placement jitter; paper-flip / torn-paper transition to the end card.
Sound: vinyl crackle, jazzy boom-bap bed, paper rustles, scissors snips, slaps and a comic 'pop' when the lid opens.

You are the director: you may change the concept, copy, story beats and brand names if you find a stronger idea, but the result must remain the CANONICAL, instantly-recognisable form of this style and must hit its signature features below.

# Signature features and key techniques (the result is judged against these)
把老照片、报纸、手撕纸片剪出来重新拼装的复古超现实风格，源头是 Monty Python 和苏联构成主义海报。人物头身比例失衡、嘴巴单独开合、半调网点纹理是标志。近年与'杂志风'合流，成为音乐类、街头潮流类短视频的高频风格。
视觉特征 照片剪影白描边, 半调网点, 报纸纹理, 比例失衡的超现实拼装, 定格式抽帧运动
关键技法 素材处理：人物/物件抠图后加 2~4px 白描边（剪刀剪出来的感觉）+ 半调 halftone 滤镜
关节动画：锚点设在肩/肘/颌，做 puppet 式分段旋转，嘴巴用两三张替换帧开合
刻意降帧：主体运动 12fps 甚至 6fps（stop-motion 感），位置加 ±2px 随机抖动模拟手摆
图层结构：背景纸纹 → 大形色块 → 照片剪影 → 手写涂鸦/胶带贴纸 → 颗粒调整层
转场用'手把元素拍上来'或整页翻纸

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
