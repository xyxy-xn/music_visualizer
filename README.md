# PULSE — Music Visualizer

深空金曜风格的网页音乐可视化。上传本地音频后，中心圆核、透明圆环、环形音轨波浪、粒子与外扩光波会跟随节奏卡点变化。

## 怎么打开（重要）

**不要双击项目根目录的 `index.html`。**  
那是 Vite 开发入口，依赖本地服务；用资源管理器直接打开会出现白底、无特效。

### 方式 A：双击离线版（推荐）

双击：

[`双击打开-PULSE.html`](./双击打开-PULSE.html)

这是打包好的单文件页面，CSS/JS 已内联，可直接用浏览器打开。

若文件不存在或代码改过，先生成一次：

```bash
npm install
npm run build:standalone
```

### 方式 B：本地开发服务

双击 [`启动本地服务.bat`](./启动本地服务.bat)，或：

```bash
cd music_visualizer
npm install
npm run dev
```

浏览器会打开 `http://127.0.0.1:5173/`。

## 使用

1. 点击 **上传** 或把音频拖进页面  
2. 自动播放；可用 **播放 / 暂停**、进度条控制  
3. **灵敏度** 调高更容易触发鼓点光波与粒子爆发  

支持：MP3、WAV、OGG、M4A、FLAC（取决于浏览器）。

## 特效说明

| 层 | 行为 |
|----|------|
| 中心圆核 | 跟低频能量缩放、发光 |
| 透明同心环 | 中高频调制透明度与呼吸 |
| 环形音轨波浪 | 频谱映射到圆周，实时起伏 |
| 粒子 | 常态外喷；起奏时 burst |
| 光波 | 低/中/高频起奏分别触发暖大波 / 锐利波 / 细碎火花环 |

卡点：分频能量 + spectral flux + 自适应阈值。「乐器感」用低/中/高三频段近似。

## 构建

```bash
npm run build            # Vite dist + 更新 双击打开-PULSE.html
npm run build:standalone # 只更新离线单文件
```

## 技术

- Vite + TypeScript（开发）
- Web Audio API + Canvas 2D
- 离线包：esbuild IIFE 单 HTML
