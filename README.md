# 15 种 MG 动态设计风格：成片、提示词和源码

15 支 10 秒的动态设计短片，每支一种风格，全部由 Claude Opus 5.5 按提示词写代码做出来：画面、动画、配乐和音效都由代码生成。
这个仓库放了每支片的成片、风格说明、完整提示词和源码。`index.html` 是展示页，部署到 GitHub Pages 后可以在一个页面里看全部内容。

| # | 风格 | 原片 | 提示词 | 源码 |
|---|---|---|---|---|
| 01 | 逐帧手绘 / 线条沸腾 | 手作 HAND MADE | [prompts/05-cel-boil.md](prompts/05-cel-boil.md) | [demos/05-cel-boil](demos/05-cel-boil) |
| 02 | 等轴 2.5D | ISOPOLIS「让城市自己生长」 | [prompts/03-isometric.md](prompts/03-isometric.md) | [demos/03-isometric](demos/03-isometric) |
| 03 | 扁平矢量动画 | popwise「One Dot」 | [prompts/01-flat-vector.md](prompts/01-flat-vector.md) | [demos/01-flat-vector](demos/01-flat-vector) |
| 04 | 线条动画 | ATELIER LINEA「一笔画」 | [prompts/02-line-art.md](prompts/02-line-art.md) | [demos/02-line-art](demos/02-line-art) |
| 05 | 3D 渲染系（C4D/Blender 质感） | soft.「柔软着陆」 | [prompts/04-3d-render.md](prompts/04-3d-render.md) | [demos/04-3d-render](demos/04-3d-render) |
| 06 | 形变动画 | morphe.「一形万象」 | [prompts/08-morph.md](prompts/08-morph.md) | [demos/08-morph](demos/08-morph) |
| 07 | 粗描边贴纸人科普 MG | 一部手机里，藏着多少种元素？ | [prompts/19-paperclip.md](prompts/19-paperclip.md) | [demos/19-paperclip](demos/19-paperclip) |
| 08 | 赛博朋克 HUD / FUI | 隼眼-9 · 目标锁定 | [prompts/22-hud.md](prompts/22-hud.md) | [demos/22-hud](demos/22-hud) |
| 09 | 拼贴剪贴 | NOGGIN 脑洞季刊 | [prompts/06-collage.md](prompts/06-collage.md) | [demos/06-collage](demos/06-collage) |
| 10 | 弥散渐变 / 玻璃拟态 | Aurora「思考，自有光」 | [prompts/12-aurora-glass.md](prompts/12-aurora-glass.md) | [demos/12-aurora-glass](demos/12-aurora-glass) |
| 11 | 几何构成 / 包豪斯 | 二十拍构成 KONSTRUKTION | [prompts/09-bauhaus.md](prompts/09-bauhaus.md) | [demos/09-bauhaus](demos/09-bauhaus) |
| 12 | 复古 80s Synthwave / VHS | NEON DRIVE「霓虹夜驰 1986」 | [prompts/10-synthwave.md](prompts/10-synthwave.md) | [demos/10-synthwave](demos/10-synthwave) |
| 13 | 像素风 | PIXEL QUEST 像素冒险 | [prompts/20-pixel.md](prompts/20-pixel.md) | [demos/20-pixel](demos/20-pixel) |
| 14 | 液态流动 | drop.「万物始于一滴」 | [prompts/07-liquid.md](prompts/07-liquid.md) | [demos/07-liquid](demos/07-liquid) |
| 15 | 综艺花字（9:16 竖屏） | 喵呜日记 EP.07 | [prompts/18-hanazi.md](prompts/18-hanazi.md) | [demos/18-hanazi](demos/18-hanazi) |

## 仓库里有什么

| 路径 | 内容 |
|---|---|
| `index.html`、`site/` | 展示页：每种风格的成片、风格说明、提示词和源码浏览 |
| `videos/` | 15 支成片和封面帧。8 支直接用原片码流；另外 7 支原片码率 37–100 Mb/s，网页播放太吃带宽，重新压成了 28 Mb/s 以内的 H.264 |
| `prompts/` | 每种风格一份完整提示词，附用法 |
| `demos/<名字>/` | 每支片的源码：画面代码（`index.html` 和 js）、配乐脚本 `audio.py`、时间点 `cues.json`，以及生成片中素材的脚本 |
| `harness/render.mjs` | 渲染脚本：无头 Chrome 逐帧截图，ffmpeg 合成视频和音轨 |
| `harness/preview.html` | 在浏览器里拖时间轴看任意一帧 |
| `lib/audio/` | 配乐和音效的合成工具包 mgaudio，加上 15 支配乐用到的 103 个乐器采样 |
| `assets/` | 片子共用的纹理和 HDRI；字体清单（字体文件不在仓库里） |
| `rubric.md`、`template.md` | 评审用的提示词；写一种新风格的模板 |

## 部署到 GitHub Pages

1. 新建一个仓库，把这个文件夹里的全部内容（包括 `.nojekyll`）推到 `main` 分支。最大的单个文件 38 MB，在 GitHub 100 MB 的单文件上限以内，不需要 Git LFS。
2. 仓库 Settings → Pages → Build and deployment，Source 选 Deploy from a branch，分支 `main`，目录 `/ (root)`。
3. 几分钟后打开 `https://<用户名>.github.io/<仓库名>/`。页面会自己识别仓库地址，「在 GitHub 查看」按钮直接跳到对应文件。如果用自定义域名，在 `index.html` 的 `<meta name="repo">` 里填上仓库地址。

整个站点约 560 MB，其中视频 425 MB。GitHub Pages 的站点上限是 1 GB，每月流量软上限 100 GB。视频只有点播放才会下载。

## 用提示词做一支

1. 在一个空文件夹里打开能写代码、能执行命令的 AI 助手（例如 Claude Code）。本机需要 Node、Chrome 和 ffmpeg，3D 那种建议路线要用 Blender。
2. 打开 `prompts/` 里任意一份，把「提示词」那段整段发给它。
3. 想换成自己的内容：每份提示词里只有 `Creative seed` 是具体故事，把里面的故事、品牌名、文案、配色换成你的；也可以把 `Output` 改成竖屏 1080×1920 或改时长。`Signature features` 那段别删，它决定这种风格能不能被一眼认出来。
4. 想做得更好：成片出来后，另开一个 AI 用 [rubric.md](rubric.md) 评审，把评审意见贴回去改一轮。原片就是「制作 → 评审 → 修改」改了两轮。
5. 写一种新风格：照 [template.md](template.md) 填四段（输出规格、技术路线、创意种子、风格特征），其余通用部分照抄。

想省事的话，可以让 AI 直接用这个仓库里的 `harness/render.mjs` 渲染、用 `lib/audio` 做配乐，不用从零搭。

## 跑源码

```bash
# 在仓库根目录
npm install
pip install -r requirements.txt
python3 demos/01-flat-vector/audio.py          # 合成配乐 → demos/01-flat-vector/out/audio.wav
node harness/render.mjs demos/01-flat-vector   # 逐帧渲染 → demos/01-flat-vector/out/video.mp4
python3 -m http.server 8000                    # 预览：http://localhost:8000/harness/preview.html?demo=01-flat-vector
```

- 页面要从仓库根目录起服务，片子里的路径（`/assets/...`、`/node_modules/...`）都相对根目录。
- 渲染脚本默认用 macOS 上的 Chrome，其他系统用环境变量 `MG_CHROME` 指定 Chrome 路径。
- 3D 那支的画面是 Blender 渲染的序列帧，步骤见 [demos/04-3d-render/README.md](demos/04-3d-render/README.md)。

## 需要知道的

- 字体文件没有放进仓库（授权各不相同，中文字体也很大）。需要哪些、放在哪里，见 [assets/fonts/README.md](assets/fonts/README.md)。缺字体时浏览器会用系统字体代替，画面里的字形会和成片不一样。
- 同一份提示词每次做出来的片子都不一样。原片每支都经过多轮迭代，一次运行通常达不到原片的完成度。
- 配乐脚本是确定性的：同一环境下重跑，结果每次相同。用 `requirements.txt` 里的版本重跑，有 4 支和成片音轨一致（误差在最低有效位以内），其余 11 支有局部差异，原因可能是数值库版本的变化。
- 做自己的片子时，字体、图片等素材请只用允许商用的授权（CC0、OFL 等），提示词里已经这样要求。
