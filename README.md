# All-in-One Player · 全能播放器 OmniRadio+

![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)
![Platform: Web](https://img.shields.io/badge/Web-PWA-blue.svg)
![Platform: Desktop](https://img.shields.io/badge/Desktop-Windows%20%7C%20macOS%20%7C%20Linux-9cf.svg)
![Electron](https://img.shields.io/badge/Electron-31-47848F.svg)
![Version](https://img.shields.io/badge/Version-1.0.4-orange.svg)

> **一句话：像 Mineradio，但多了一个影院。**
> One player for all your music — plus a cinema for MVs and videos, in original format and original resolution.
>
> 纯黑银河底、粒子视觉、歌词舞台、视觉控制台、3D 歌单架，再加上 Mineradio 没有的 **MV / 视频原始格式、原始分辨率直通播放**（不转码、不压缩、不裁切）。
>
> **English:** A Mineradio-style all-in-one music player for 8 platforms, with an extra cinema mode: MVs and local videos play in their original format and original resolution — no transcoding, no compression, no cropping. Web + desktop (Windows / macOS / Linux) from the same codebase.

**快速入口：** [📥 下载安装包（Releases）](https://github.com/lzx-lgm/all-in-one-player/releases) · [🌐 在线试用网页版](https://muse.ai/s/quan-neng-bo-fang-qi-xnl6xkiaxcekxon/_VvZwdW44EQlcCu--a2vHJ1e36VzWvz-xz2JcREVHho) · [🖥️ 桌面版说明](#桌面软件版electron真同步官网歌单) · [❓ 常见问题](#常见问题faq)

## 一眼看懂

| | 全能播放器 | Mineradio |
|---|---|---|
| 音乐平台 | 8 个：汽水、Spotify、Apple Music、YouTube Music、QQ音乐、网易云、酷狗、酷我 | 多平台聚合 |
| MV / 视频 | ✅ 原始格式、原始分辨率直通，全屏 / 画中画 / 1:1 原生尺寸 | ❌ 只有音乐 |
| 登录方式 | 官方扫码登录，不碰密码；桌面版内嵌登录窗真同步歌单 | 内嵌登录窗 + 本地凭证 |
| 网页版 | ✅ 浏览器直接用，可安装为 PWA | 需 Bridge 扩展 |
| 桌面版 | ✅ Windows / macOS / Linux 安装包 | Windows 为主 |
| 本地文件 | ✅ 音频 + 视频拖放即播，不上传 | ✅ 本地音频 / 视频 |

网页版与桌面软件版是**同一套代码**：网页版全系统浏览器适配并可安装为 PWA；桌面版用 Electron 封装，Windows / macOS / Linux 三个系统都有安装包，统一发布在本仓库的 [Releases](https://github.com/lzx-lgm/all-in-one-player/releases)。

## 功能

- **8 平台聚合**：汽水音乐、Spotify、Apple Music、YouTube Music、QQ音乐、网易云音乐、酷狗音乐、酷我音乐，统一搜索、点平台切源。
- **音乐真播放**：播放/暂停、上一首/下一首、进度拖动、音量、倍速（0.5×–2×）、循环（关/全部/单曲）、随机，全部真实工作。
- **歌词舞台 + 同步歌词**：歌词随播放进度逐行推进；歌词与音乐源分离，走 **QQ → 酷狗 → 网易云** 独立回退链，界面标注实际命中的歌词源。
- **实时频谱**：Web Audio AnalyserNode 驱动，随正在播放的音频真实跳动；粒子背景与视觉预设（星河/极光/流光/暮色）可在视觉控制台即时调（高亮色、粒子强度、歌词溢光/大小、律动强度）。
- **3D 歌单架**：歌单以透视卡片陈列，点击直接播放。
- **MV / 视频影院（独有）**：在线演示 MV 与**本地文件**都按**原始格式、原始分辨率**播放，界面显示源文件真实分辨率、格式与来源；支持全屏、画中画、倍速、1:1 原生尺寸显示。本地音频（MP3/WAV/FLAC 等）与视频（MP4/WebM/MOV 等）拖放或点选即播，只在本机解码、不上传。浏览器解码不了的少数编码（如部分 MKV/AVI）请用桌面版（Electron 完整解码）打开。
- **搜索与切源真实生效**：搜索实时过滤曲库与 MV；切换音乐源时立即清空旧内容并显示骨架屏，标题与内容同时换新源，不串台。

## 连接原理（借鉴 Mineradio，不做假登录）

1. **选平台 → 官方扫码登录 → 同步收藏**（页面内有三步向导）：点「登录账号」选平台后，跳转到**平台官方登录页**扫码登录（网易云/QQ/酷狗/汽水扫码，QQ 可选 QQ 扫码或微信扫码）。播放器只是一个窗口，**不在本站输入任何平台密码**；登录凭证 Cookie 只保存在官方页面与本机（桌面版本地存储）。失效时如实显示「已过期」，未登录就是「未登录」，绝不假装已连接。
2. **资料库语义统一**：只同步用户**已收藏**的专辑/艺人/歌单，不做全站目录浏览。八个源共用同一套「音乐源」抽象与端点表：
   `/api/<平台>/library/index`、`/api/<平台>/library/albumTracks`、`/api/<平台>/library/playlistTracks`。
3. **播放换源**：非 Apple 源走应用内播放链路；Spotify 官方不提供音频直链、汽水付费歌常只给试听——遇到试听/VIP 时，6 秒内并行去其它已登录平台按「歌名+艺人+时长」匹配同一首歌自动换源，找不到就保留试听并明示。
4. **本地兜底**：不登录任何平台，也能导入本地音频/视频真实播放。

> 说明：网页版前端无法替用户完成第三方登录（浏览器读不到其它域名的 Cookie），也不会把状态假装成「已连接」。桌面版用内嵌官方登录窗 + 本机凭证真同步（见下「桌面软件版」一节），但同样不会绕过任何平台的版权、会员或付费限制；仓库内置的演示音频/演示 MV 为公开样片源（SoundHelix / Google 公开样片），仅用于验证播放链路。

## 快速开始（网页版）

```bash
git clone https://github.com/lzx-lgm/all-in-one-player.git
cd all-in-one-player
# 任选其一本地预览（静态文件，无需构建）：
npx serve .            # 或 python3 -m http.server 8000
# 浏览器打开 http://localhost:3000 （serve 默认端口）或 http://localhost:8000
```

也可以直接用任意静态托管（GitHub Pages / Cloudflare Pages / Vercel）部署仓库根目录。

### 安装为 PWA（网页版装到桌面）

- **桌面 Chrome / Edge**：地址栏右侧「安装」图标，或菜单 →「将此站安装为应用」；也可点页面右上角「安装网页版」。
- **Android Chrome**：菜单 ⋮ →「安装应用 / 添加到主屏幕」。
- **iOS Safari**：分享 →「添加到主屏幕」。
- 安装后独立窗口、全屏沉浸打开；页面本体经 Service Worker 缓存，可离线再打开（在线流媒体仍需网络）。

## 桌面软件版（Electron）——真同步官网歌单

网页版读不到其它域名的 Cookie，所以网页版里点「我已在官方页完成登录」只能作本机标记，列的是本页面演示曲库。**桌面版不一样**，它按 Mineradio 的原理真同步：

1. **本地服务**：主进程启动一个只监听 `127.0.0.1` 的本地服务（`electron/server.js`），渲染层从它加载同一套网页版代码，并通过它调用 `/api/*`。
2. **内嵌登录窗**：点「登录账号」后，打开一个内嵌官方登录窗（独立 session partition，平台 + 身份双隔离），在官方登录页里扫码登录。本应用**从不输入任何平台密码**，也不向你索要账号密码或 Cookie。
3. **凭证只存本机**：登录成功后，主进程只把官方 Cookie 收进本机用户数据目录下的 `auth/<平台>-<身份>.json`（0600 权限），永不打印、永不记入日志、永不提交进仓库。`.gitignore` 另有双重保险。
4. **服务端取歌单**：本地服务用凭证向官方接口请求你真实的已创建 + 已收藏歌单与喜欢歌曲，渲染层只拿到歌单结构与可播地址。登录失效时如实显示「已过期」，点重新扫码即可。
5. **QQ 号与微信是两个独立身份**：不同登录窗、不同凭证文件、不同状态行，绝不合并。微信登录的资产与 QQ 号不互通，歌单为空时请切回「QQ号扫码登录」。
6. **QQ 二维码空白**：QQ 登录页签的二维码间歇性空白是官网侧问题（微信页签稳定；空白后有时会被残留会话的快捷登录自动接管）。登录窗停留 12 秒仍无凭证时，播放器会弹出重试引导：重开登录窗 / 先切微信页签再切回 QQ / 刷新 / 复制链接到浏览器扫码。
7. **不绕过付费/会员**：拿不到可播地址（VIP、会员、Spotify 无官方直链、汽水常只给试听）就如实返回原因，播放时 6 秒内去其它已登录平台按「歌名+艺人+时长」匹配同一首歌换源，找不到就保留试听并明示。

### 真同步的覆盖范围（桌面版 v1）

| 平台 | 登录窗 + 凭证收存 | 真实歌单同步 | 可播地址 |
|---|---|---|---|
| 网易云音乐 | ✅ | ✅（已创建 + 已收藏 + 我喜欢） | ✅ |
| QQ音乐（QQ号身份） | ✅ | ✅（已创建歌单 + 我喜欢） | ✅ |
| QQ音乐（微信身份） | ✅（独立身份） | ✅（该身份自己的歌单，常为空） | ✅ |
| 酷狗 / 酷我 / 汽水 | ✅ | best-effort（网页端接口不稳定，取不到时如实提示） | 换源兜底 |
| Spotify | ✅ | ❌ 官方不提供音频直链（与 Mineradio 实测结论一致） | 自动换源 |
| Apple Music / YouTube Music | ✅ | best-effort | 官方链路 / 换源 |

```bash
npm install     # 安装 electron 与 electron-builder
npm run check   # 语法检查（electron/main.js、server.js、preload.js、js/app.js）
npm start       # 本地运行桌面版
npm run dist:win    # Windows 安装包 .exe（NSIS）→ release/
npm run dist:mac    # macOS 安装包 .dmg（Universal）→ release/
npm run dist:linux  # Linux 安装包 .AppImage + .deb → release/
```

- 打包配置在 `package.json` 的 `build` 字段（electron-builder）：appId `com.lzxlgm.allinoneplayer`，产物命名 `AllInOnePlayer-Setup-<版本>.exe` / `AllInOnePlayer-<版本>-universal.dmg` / `AllInOnePlayer-<版本>.AppImage|.deb`。
- 在 Windows 上打 .exe、在 macOS 上打 .dmg 最稳妥；或直接用仓库自带的 GitHub Actions（见下）。

### 自动发布到 Releases

仓库带 `.github/workflows/build.yml`：给代码打版本标签并推送，三台构建机（Windows/macOS/Ubuntu）会并行打包并把安装包自动发布到 Releases：

```bash
git tag v1.0.0
git push origin v1.0.0
```

完成后到 **https://github.com/lzx-lgm/all-in-one-player/releases** 下载三个系统的安装包。网页版页面内的「下载软件版」入口也指向这个 Releases 地址。

## 项目结构

```
all-in-one-player/
├─ index.html              # 网页版入口（引用下方分离的 CSS / JS）
├─ css/style.css           # 全部样式（Mineradio 式纯黑视觉体系）
├─ js/app.js               # 全部逻辑：播放器 / 歌词回退链 / 换源 / 影院 / 粒子 / PWA
├─ assets/                 # PWA 清单、Service Worker、图标
│  ├─ manifest.webmanifest
│  ├─ sw.js
│  ├─ icon-192.png / icon-512.png
├─ electron/
│  ├─ main.js              # Electron 主进程：启动本地服务 + 内嵌官方登录窗（真同步）
│  ├─ server.js            # 本地服务：静态托管 + /api/* 歌单/可播地址（本机凭证）
│  └─ preload.js           # 安全桥接（contextBridge 白名单）
├─ build/icon.png          # 打包图标
├─ package.json            # 脚本 + electron-builder 配置
└─ .github/workflows/build.yml
```

## 系统适配一览

| 形态 | Windows | macOS | Linux | Android | iOS |
|---|---|---|---|---|---|
| 网页版（浏览器） | ✅ | ✅ | ✅ | ✅ | ✅ |
| PWA 安装到桌面 | ✅ Chrome/Edge | ✅ Chrome/Edge | ✅ Chrome | ✅ | ✅ 添加到主屏幕 |
| 软件版安装包 | `.exe` | `.dmg` | `.AppImage` / `.deb` | —（用 PWA） | —（用 PWA） |

## 常见问题 FAQ

**Q：网页版登录后为什么看不到我真正的歌单？**
A：网页版是静态页面，浏览器不允许它读取其它网站的 Cookie，所以网页版只能作本机标记、列演示曲库。想真同步你的歌单，请用桌面版：它用内嵌官方登录窗扫码登录，凭证只存本机，歌单是真的从官方接口拉回来的。

**Q：QQ 登录的二维码为什么是空白的？**
A：这是 QQ 音乐官网侧的问题，间歇性出现：QQ 页签第一次打开时扫码区全白、无报错，微信页签一直正常。空白时可以：重开登录窗、先切到微信页签再切回 QQ、刷新页面、或复制链接到浏览器扫码；有时残留会话会直接快捷登录回你的账号。桌面版登录窗停留 12 秒仍无凭证时会自动弹出重试引导。

**Q：用微信扫码登录 QQ 音乐，为什么歌单是空的？**
A：微信扫码登录的是一个独立身份，和 QQ 号的资产、会员不互通，歌单为空是正常的。请切回「QQ号扫码登录」，那才是你有歌单的那个身份。

**Q：Spotify 的歌为什么放不了？**
A：Spotify 官方 Web API 本身不提供音频直链（Mineradio 实测结论也一样）。播放器会去其它已登录平台按「歌名 + 艺人 + 时长」自动匹配同一首歌换源，找不到就保留试听并明示，不会假装在放。

**Q：VIP / 会员歌曲能免费听吗？**
A：不能。本项目不绕过任何平台的版权、会员或付费限制，拿不到可播地址就如实说明原因，再去其它已登录平台匹配同一首歌。

**Q：我的账号密码 / Cookie 会不会被上传？**
A：不会。播放器从不在本站输入任何平台密码；桌面版凭证只存在你本机用户数据目录（`auth/<平台>-<身份>.json`，0600 权限），永不打印、永不记入日志、永不提交进仓库。

**Q：安装包在哪里下载？**
A：打上版本标签（如 `v1.0.0`）并推送后，GitHub Actions 会自动在 [Releases](https://github.com/lzx-lgm/all-in-one-player/releases) 发布 Windows `.exe`、macOS `.dmg`、Linux `.AppImage` / `.deb`。

## License

MIT © lzx-lgm。各音乐平台名称、曲库与内容版权归各自平台与权利方所有；本项目与各平台无隶属关系。
