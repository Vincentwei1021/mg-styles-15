# 复古系（80s Synthwave / Y2K 千禧） Retro: 80s Synthwave / VHS / Y2K

**原片**：NEON DRIVE · Midnight「霓虹夜驰 1986」 · 1920×1080 · 30 fps · 10 秒 · AI 评审终评 8.21 / 10

**源码**：[demos/10-synthwave/](../demos/10-synthwave/)

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
复古系（80s Synthwave / Y2K 千禧） Retro: 80s Synthwave / VHS / Y2K

# Output (fixed)
- 1920×1080, 30 fps, exactly 10.000 s (300 frames), H.264 MP4 with stereo AAC audio (48 kHz), mastered to −14 LUFS
  integrated, true peak ≤ −1 dBTP. Final file: video.mp4.

# Suggested technical route
HTML WebGL (perspective grid, sun, mountains shader) + canvas chrome text + CSS/SVG glow; VHS pass
(You may choose a better route if it clearly raises quality; say why.)

# Creative seed
「OUTRUN 1986」The quintessential 80s synthwave title sequence.
- Starry night, striped retro sun (horizontal band cut-outs, magenta→orange→yellow), wireframe mountains, palm silhouettes, neon magenta/cyan perspective grid rushing toward the camera.
- 0–1s: VHS tracking noise + 'PLAY ▶' OSD; 1–4s: camera flies low over the grid, sun rises; 4–6s: CHROME title (e.g. "NEON DRIVE", multi-stop metallic gradient, bevel highlight, star glint sweeping across) SLAMS in with a lens flare; 6–7.5s: pink neon script word (e.g. "Midnight") writes on like a neon tube with flicker; 7.5–10s: sustained ride, subtle VHS chroma bleed/scanlines, end on the hero frame.
- Double glow (tight ~4px + wide ~30px), deep purple sky gradient.
Sound: synthwave — gated-reverb snare, arpeggiated saw bass, lush pads, big chord + crash on the title slam.

You are the director: you may change the concept, copy, story beats and brand names if you find a stronger idea, but the result must remain the CANONICAL, instantly-recognisable form of this style and must hit its signature features below.

# Signature features and key techniques (the result is judged against these)
对特定年代媒介美学的整体引用：80s synthwave 是霓虹网格+日落渐变+镀铬字；VHS 是扫描线+色偏+磁带噪声；Y2K 千禧风是液态镀铬金属、酸性绿紫、拟物系统窗口和低保真 3D。近两年 Y2K 在音乐视频与潮流品牌片中强势回潮，B站模板市场大量供应'酸性镀铬'素材。
视觉特征 霓虹辉光, 透视网格地平线, 扫描线与RGB色偏, 镀铬金属字, 酸性配色, 拟物窗口UI
关键技法 synthwave 三件套：透视网格滚动（一点透视 grid + 纵向位移循环）、日落多层渐变球、双层辉光（内层紧 4px 高亮+外层散 30px 低透明）
VHS 做旧链：RGB split（红蓝通道各偏 1~2px）→ 扫描线（2px 间隔 10% 黑条）→ 波浪扭曲抖动（每秒 1~2 次随机 glitch 抽帧）→ 4:3 圆角遮罩
Y2K 镀铬字：极高对比的多段金属渐变 + bevel 高光 + 环境映射感反光，配 lens flare
Y2K 运动语言：弹窗式 pop 出现、光标点击、窗口拖拽，界面拟物即动画叙事
帧率故意不稳：关键段落抽帧到 15fps 或倒放 2 帧制造磁带卡顿

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
