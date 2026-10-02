# 写一种新风格的提示词

每份风格提示词都由「通用部分」和「风格专属部分」组成。通用部分（开头的角色设定，以及 How to work / Rules / Craft checklist /
自评 / Deliver）所有风格都一样，可以直接从任意一份 `prompts/*.md` 里复制。要写一种新风格，只需要填下面四段：

```text
# Style
<中文风格名 English style name>

# Output (fixed)
- <宽>×<高>, <帧率> fps, exactly 10.000 s, H.264 MP4 with stereo AAC audio (48 kHz), mastered to −14 LUFS integrated,
  true peak ≤ −1 dBTP. Final file: video.mp4.

# Suggested technical route
<用什么做最合适：SVG/Canvas/WebGL/Three.js/Blender……以及关键实现手段。>
(You may choose a better route if it clearly raises quality; say why.)

# Creative seed
<「一句话片名」+ 这种风格最经典又最惊艳的读法：
 - 0–X s 发生什么（钩子 → 升级 → 高潮 → 结尾画面），
 - 配色（3–6 个具体色值），字体气质，
 - Sound: 音乐风格 + 关键音效。>

You are the director: you may change the concept, copy, story beats and brand names if you find a stronger idea, but the
result must remain the CANONICAL, instantly-recognisable form of this style and must hit its signature features below.

# Signature features and key techniques (the result is judged against these)
<这种风格的来源和用途（一两句）>
视觉特征 <逗号分隔的标志特征>
关键技法 <可执行的技法，越具体越好：曲线参数、帧数、层结构……每条一行>
```

写好的关键：
- **Signature features 要可检验**。写「弹性缓动 overshoot 用 cubic-bezier(0.34,1.56,0.64,1)，错峰 2–4 帧」，而不是「动效要有弹性」。
- **Creative seed 要有节拍**。按秒写出钩子、升级、高潮和结尾，AI 才不会做成平铺直叙的模板。
- **品牌名和文案用虚构的**，避免商标问题。
