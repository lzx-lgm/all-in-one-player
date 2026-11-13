# 全能播放器

像 Mineradio，但多了一个影院：八大音乐平台 + MV / 视频影院，全能音乐 + 视频播放器。

[![License: GPL-3.0](https://img.shields.io/badge/License-GPL--3.0-blue.svg)](LICENSE)
[![Platform](https://img.shields.io/badge/platform-Windows%20%7C%20macOS%20%7C%20Linux-lightgrey.svg)](#)

> 基于 [Mineradio](https://github.com/XxHuberrr/Mineradio-paused)（GPL-3.0）二次开发。
> Mineradio 本身已长期停更；本项目在它的基础上加了 3 个新平台、MV / 视频影院和网页版，
> 并修了登录与播放链路。

## 能做什么

- **八大音乐平台**：QQ 音乐、网易云音乐、酷狗音乐、酷我音乐、汽水音乐、Spotify、Apple Music、YouTube Music。
- **登录同步真歌单**：桌面版用内嵌官方登录窗登录（QQ / 网易云 / 酷狗），登录后同步你自己的真实歌单和「我喜欢」。
- **MV / 视频影院**：右下角「🎬 影院」。原格式、原分辨率、不转码；本地视频拖进去直接播；
  字幕、换音轨、A-B 循环、逐帧、变速保音调、亮度 / 对比 / 饱和、截图、媒体信息；
  浏览器播不了的编码（AC3 / DTS 没声那种），桌面版可以直接扔给系统播放器（装了 PotPlayer 就是它）。
- **网页版 + PWA**：浏览器打开就能用，可安装到桌面；桌面版功能更全（登录同步、本地文件、系统播放器）。
- **歌词舞台 / 频谱 / 视觉控制台**：Mineradio 的视觉系统完整保留。

## 各平台同步情况（实话）

| 平台 | 搜歌 | 播放 | 歌词 | 个人歌单同步 |
| --- | --- | --- | --- | --- |
| QQ 音乐 | ✅ | ✅ 整首 | ✅ | ✅（登录后，「我喜欢」36 首那种） |
| 网易云音乐 | ✅ | ✅ 整首 | ✅ | ✅（登录后） |
| 酷狗音乐 | ✅ | ✅ 整首 | ✅ | ✅（登录后） |
| 酷我音乐 | ✅ | ✅ 整首（中国大陆 IP） | ✅ | ❌ 酷我不提供个人歌单接口 |
| 汽水音乐 | ✅ | ✅ 整首 | ✅ | ✅（登录后） |
| YouTube Music | ✅ | ✅ 整首 | ✅（纯文本） | ⚠️ 需登录（个人曲库接口未完全验证） |
| Apple Music | ✅ | ⚠️ 仅 30 秒试听 | ❌ | ❌（不嵌苹果播放器；整首需去 Apple Music App） |
| Spotify | ✅ | ❌ 官方 API 不给直链 | ✅ | ⚠️ 曲库可读，播放会匹配到其它平台 |

没有哪个按钮是假的：登录不上的平台不会显示「已连接」，播不了的会明说原因。

## 连接原理

桌面版自带一个本地服务器（只监听 127.0.0.1），登录时打开内嵌官方登录窗，
你在官方页面上扫码 / 输入账号，Cookie 只保存在你本机，永不上传、不进仓库。
音频一律走本地代理（按平台带正确 Referer + Range），不直连。

网页版没有内嵌登录窗，同步不了官方账号的私人歌单，只能用公开曲库和试听。

## 安装

从 [Releases](https://github.com/lzx-lgm/all-in-one-player/releases) 下载对应系统的安装包：

- Windows：`全能播放器-2.0.0-Setup.exe`
- macOS：`全能播放器-2.0.0-arm64.dmg` / `全能播放器-2.0.0-x64.dmg`
- Linux：`全能播放器-2.0.0-x86_64.AppImage` / `全能播放器-2.0.0-amd64.deb`

## 本地运行 / 打包

```bash
npm install
npm start            # 桌面版（Electron）
npm run check        # 语法检查
npm run build:win    # Windows 安装包
npm run build:mac    # macOS 安装包
npm run build:linux  # Linux 安装包
```

只跑网页版服务器：`node server.js`（默认只监听 127.0.0.1；要对外暴露请显式设置 `HOST=0.0.0.0`）。

## 许可证

GPL-3.0。详见 [LICENSE](LICENSE)。
本项目基于 Mineradio（GPL-3.0）二次开发：登录窗口代码抄自 Mineradio 的 `desktop/main.js`，
QQ / 网易云的播放地址解析借鉴了它的原理（代码重写）；其余新增代码同样遵循 GPL-3.0。
