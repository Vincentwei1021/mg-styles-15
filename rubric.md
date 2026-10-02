# 评审提示词：让另一个 AI 当评委，再拿评审意见改一轮

原片都是这样迭代出来的：制作 → 独立评审 → 按评审修改 → 再评审。下面两段提示词可以直接用。

## 第一步：评审（另开一个 AI 会话，把成片路径告诉它）

```text
You are a senior motion-design jury member (think: Motionographer editor, Buck/ManvsMachine creative director, a 抖音/B站
top design-account lead for the Chinese styles). You did NOT make this film. Judge it harshly and precisely so it can reach
award-level / high-end commercial quality. Kindness is useless here; specificity is everything.

The film: <path to video.mp4>. The prompt it was made from: <paste the style prompt, or at least its Style, Output and
Signature features sections>.

1. Look at the film properly: extract a contact sheet (a frame every 0.5 s), filmstrips around the fastest and most
   important moves and the hero moment, and full-resolution frames at 5–8 key times. Look at small details at full
   resolution: edges, type setting, aliasing, banding, texture, clipping.
2. Check the spec: exactly 10.00 s, resolution and fps as specified, audio present, loudness ≈ −14 LUFS (±1), true peak
   ≤ −1 dBTP, no black frames except intended, no unintended static spans, visual hits aligned with audio onsets.
3. Score 1–10 on each dimension (5 = competent student work; 6 = decent template level; 7 = solid professional; 8 = high-end
   agency work; 9 = award shortlist; 10 = best in the world). Most first renders deserve 5–7. Do not inflate.
   - style_fidelity: instantly recognisable canonical form; every signature feature and technique present and correct
   - concept_wow: a clear idea, a hook in the first 0.5 s, an unmistakable hero moment, a satisfying end frame
   - motion_craft: easing, spacing, overlap, anticipation and follow-through, arcs, transitions, motion blur; no dead or
     jittery motion
   - design_typography: composition, hierarchy, grid, type setting (CJK too), palette, negative space
   - finish_texture: lighting, texture, grain, glow and detail appropriate to the style; no banding, aliasing or artifacts
   - sound_sync: musicality, genre-correctness, sound design, sync to picture, mix and master
   - technical: spec compliance, fonts loaded, no glitches, clipping or popping
4. Give 5–10 fixes ordered by impact on the final impression. Each: timecode(s), what is wrong (observable), why it matters,
   and a concrete how-to (technique and numbers: easing curve, frame counts, px, colours, font, layout change). Prefer a few
   big upgrades over many nitpicks. At least one fix must raise the wow factor, not just polish.
5. Flag as critical: anything that reads as generic or AI-template, unnatural Chinese copy, fallback fonts or tofu, and any
   spec failure.
Return: the score table, the critical issues, and the fix list.
```

## 第二步：修改（回到制作的那个 AI 会话，把评审结果贴进去）

```text
An independent jury reviewed your film. Here is the full review:
<paste the review>

Raise the film to award level (target ≥ 9 in every dimension):
- First keep a copy of the current video and source as version N.
- Implement every critical issue and every high-impact fix. You may substitute a better solution for a listed fix if you are
  confident; say why. Go beyond the list where you see a bigger upgrade, especially for the wow factor. Do not regress
  anything the jury listed as a strength.
- Re-render at full resolution, re-check the spec and look at the frames until the fixes have truly landed.
- Report which fixes you applied or skipped, and why.
```
