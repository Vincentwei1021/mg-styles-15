# 赛博朋克 HUD / FUI Cyberpunk HUD / FUI (Fictional UI)

**原片**：隼眼-9 · 目标锁定 KESTREL-9 TARGET ACQUIRED · 1920×1080 · 30 fps · 10 秒 · AI 评审终评 7.93 / 10

**源码**：[demos/22-hud/](../demos/22-hud/)

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
赛博朋克 HUD / FUI Cyberpunk HUD / FUI (Fictional UI)

# Output (fixed)
- 1920×1080, 30 fps, exactly 10.000 s (300 frames), H.264 MP4 with stereo AAC audio (48 kHz), mastered to −14 LUFS
  integrated, true peak ≤ −1 dBTP. Final file: video.mp4.

# Suggested technical route
HTML: SVG/Canvas FUI layers + Three.js wireframe hologram; seeded random data; glow/scanline post pass
(You may choose a better route if it clearly raises quality; say why.)

# Creative seed
「目标锁定 TARGET ACQUIRED」Cyberpunk HUD / FUI, film-UI grade (Territory Studio-level density & restraint).
- Deep teal-black; cyan #00E5FF linework with orange/red #FF6A00 alert state; hex grid, concentric rotating rings with ticks, radar sweep (conic) with blips, data columns (monospace numbers rolling 3–5 frames then settling), typewriter status lines with cursor, sparkline graphs, a central Three.js wireframe hologram (globe or drone) with scanlines.
- Layered build-up: lines draw on in hierarchical staggered order → data comes alive → a target is found → lock brackets snap 1.4 → 1.0 (fast-out slow-in) → everything flips to alert orange with 'TARGET LOCKED / 目标锁定', coordinates "N31°14′ E121°29′".
- Glow, slight chromatic aberration, scanlines, restrained micro-glitches.
Sound: darksynth pulse + HUD beeps, scan sweeps, ascending lock-on tone, alarm on lock.

You are the director: you may change the concept, copy, story beats and brand names if you find a stronger idea, but the result must remain the CANONICAL, instantly-recognisable form of this style and must hit its signature features below.

# Signature features and key techniques (the result is judged against these)
模拟科幻电影/游戏界面的抬头显示包装：青橙霓虹线框、目标锁定框、雷达扫描、数据流小字。在科技数码测评、游戏剪辑（赛博朋克2077、EVA 二创）、军事航天科普和 AI 产品演示中作为『科技感』的默认皮肤，B 站 AE HUD 案例教程播放量达 20 万。
视觉特征 青色/橙色霓虹线框, 目标锁定框与十字准星, 雷达/环形扫描 loop, 等宽小字数据流与打字机文字, 六边形网格与辉光
关键技法 线框生长：SVG stroke-dasharray/dashoffset 描边动画，元素按层级错帧展开
环形雷达：conic-gradient 扫描扇区旋转 loop + 目标点闪烁
数字滚动：随机数快速跳变 3~5 帧后落定真实值；文字打字机 + 光标闪烁
锁定框：四角括号从大到小收缩吸附目标（scale 1.4→1.0 + 快出缓入）
全局外发光（glow）+ 轻微色差 + 扫描线叠加统一质感

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
