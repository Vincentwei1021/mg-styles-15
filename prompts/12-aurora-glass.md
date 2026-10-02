# 弥散渐变 / 玻璃拟态 Gradient Blur (Aurora) & Glassmorphism

**原片**：Aurora — think in light「思考，自有光」 · 1920×1080 · 30 fps · 10 秒 · AI 评审终评 8.07 / 10

**源码**：[demos/12-aurora-glass/](../demos/12-aurora-glass/)

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
弥散渐变 / 玻璃拟态 Gradient Blur (Aurora) & Glassmorphism

# Output (fixed)
- 1920×1080, 30 fps, exactly 10.000 s (300 frames), H.264 MP4 with stereo AAC audio (48 kHz), mastered to −14 LUFS
  integrated, true peak ≤ −1 dBTP. Final file: video.mp4.

# Suggested technical route
HTML WebGL: aurora mesh-gradient shader + glass refraction (SDF lens, chromatic dispersion) + DOM/CSS backdrop-filter glass cards
(You may choose a better route if it clearly raises quality; say why.)

# Creative seed
「Liquid Glass」2025–26 AI-product-launch aesthetic: slow, translucent, expensive.
- Deep indigo-black base; 4–5 aurora blobs (violet/blue/cyan/magenta, adjacent hues only) drifting on bezier paths, blending into a mesh gradient, 3–5% noise dithering (no banding).
- Frosted glass cards (backdrop blur ~30px, 5–10% white fill, 1px 30% white inner highlight, large radius) float in with parallax depth and slight 3D tilt; micro-UI inside (chat bubble, voice waveform, toggles) animates with opacity + 8px rise.
- WOW: a Liquid-Glass lens (true refraction, chromatic dispersion on the rim, specular edge) glides across and magnifies the aurora and the cards.
- Title (invented product, e.g. "Aurora — think in light") in a light elegant sans; sine/breathing easing everywhere; nothing fast.
Sound: ambient cinematic pad, soft shimmer, very subtle UI ticks.

You are the director: you may change the concept, copy, story beats and brand names if you find a stronger idea, but the result must remain the CANONICAL, instantly-recognisable form of this style and must hit its signature features below.

# Signature features and key techniques (the result is judged against these)
大面积高斯模糊的彩色光斑（aurora/mesh gradient）缓慢漂移作底，磨砂半透明玻璃卡片浮在其上。苹果 iOS 26 Liquid Glass 与各家 AI 产品发布把这一风格推成 2024-2026 科技品牌片的默认视觉，气质是'慢、透、高级'。
视觉特征 大色斑高斯模糊漂移, 磨砂玻璃卡片, 1px高光描边, 邻近色低对比配色, 缓慢呼吸感节奏
关键技法 底层 aurora：3~5 个纯色大圆 blur 80~150px，各自沿贝塞尔路径 20~40 秒漂移循环，彼此 blend 出 mesh gradient 感
玻璃卡片配方：backdrop-filter blur(20~40px) + 白色 5~10% 填充 + 1px 白色 30% 内描边 + 大半径圆角
配色用邻近色 2~3 色（紫蓝青/橙粉红），撞色会脏；暗底亮斑比亮底更出效果
全局叠 3~5% 噪点防 banding（与颗粒质感技法交叉）
缓动接近 linear 或 sine 呼吸曲线，一切都慢——快动作会立刻破坏气质；文字入场也只用 opacity+8px 位移

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
