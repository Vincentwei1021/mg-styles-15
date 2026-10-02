# 04-3d-render 的制作步骤

画面由 Blender（5.1，Cycles）渲染成序列帧，`index.html` 再把帧、文字和颗粒合成，最后和别的片子一样用渲染脚本出片。在这个目录里依次运行：

```bash
python3 blender/make_letters.py                          # 字形 → 充气字母网格 assets/mesh/*.ply（已附带）
python3 blender/sim.py                                   # 全部运动 → work/anim.npz，碰撞时间 → out/events.json（已附带）
blender -b --factory-startup -P blender/scene.py         # 搭场景 → work/scene.blend
blender -b work/scene.blend -P blender/render.py -- --range 0:239   # 240 帧 → out/frames/（macOS 用 Metal；NVIDIA 设 MG_DEVICE=OPTIX）
python3 audio.py                                         # 配乐 → out/audio.wav
cd ../.. && node harness/render.mjs demos/04-3d-render   # 合成 → out/video.mp4
```
