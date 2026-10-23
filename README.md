<div align="center">
  <img src="./assets/icon.png" width="108" height="108" alt="上班鼓励器 App Icon" />
  <h1>上班鼓励器 · Work Encourager</h1>
  <p><strong>把每一个工作日的每一分钟，折算成看得见的实时进账与生活小目标</strong></p>
  <p>
    <a href="https://caseclose.github.io/work-encourager-open/">
      <img src="https://img.shields.io/badge/Website-项目官网_(GitHub_Pages)-d95a2b?style=flat-square&logo=github" alt="Project Website" />
    </a>
    <a href="https://github.com/caseclose/work-encourager-open/releases/latest">
      <img src="https://img.shields.io/github/v/release/caseclose/work-encourager-open?style=flat-square&label=macOS_Release&color=f09b63" alt="Latest Release" />
    </a>
    <img src="https://img.shields.io/badge/macOS-Universal_(Apple_Silicon_%26_Intel)-1d1712?style=flat-square&logo=apple&logoColor=f5c37e" alt="macOS Menu Bar App" />
    <img src="https://img.shields.io/badge/Privacy-100%25_Local-2e7d32?style=flat-square" alt="100% Local Privacy" />
  </p>
  <p>
    <a href="https://caseclose.github.io/work-encourager-open/"><strong>访问项目介绍官网 (GitHub Pages)</strong></a>
    ·
    <a href="https://github.com/caseclose/work-encourager-open/releases/latest"><strong>下载 macOS 状态栏版 (.dmg)</strong></a>
  </p>
</div>

---

## 界面预览

> 以下截图均使用虚拟演示参数与脱敏模式生成，所有真实数据仅保存在用户本机。

| 深色模式（Dark Mode） | 浅色模式（Light Mode） | 隐私脱敏模式（Privacy Mask） |
| :---: | :---: | :---: |
| <img src="./assets/preview-dark.png" width="280" alt="深色模式预览" /> | <img src="./assets/preview-light.png" width="280" alt="浅色模式预览" /> | <img src="./assets/preview-masked.png" width="280" alt="隐私打码模式预览" /> |

---

## 核心特性

### 1. 原生 macOS 顶部状态栏应用 (`NSStatusBar` + `NSPopover`)
- **常驻菜单栏跳表**：在 Mac 屏幕右上角状态栏实时显示 `¥` 徽标与今日累计收入，使用等宽数字字体（`monospacedDigitSystemFont`），数字跳动时菜单栏宽度绝不抖动。
- **八种状态栏显示**：支持收入、剩余金额、下班倒计时、工作进度、目标进度与自动切换等模式。
- **原生弹窗面板**：左键点击状态栏图标弹出完整仪表盘，点击外部自动收起；右键点击可快速呼出「隐藏/显示金额」「切换深色/浅色模式」「退出」快捷菜单。

### 2. 分时段计薪与进度时间轴
- **真实计薪时长折算**：支持分别勾选并扣除**午休时段**与**晚饭时段**，休息期间金额自动停表，休息结束后从已累计金额无缝续算。
- **分段式今日时间轴**：将全天班表拆分为「计薪段」与「斜纹休息段」，游标实时指示当前所处位置，并自动倒计时提示距离下一顿饭或下班还有多久。

### 3. 双层激励体系：自定义今日小目标 + 跨天大件心愿单
- **今日点亮的小目标**：将单日收入具象化为日常美食与数码单品（工作餐、通勤打车、炸鸡、披萨、有线耳机、自助烤肉、无线鼠标、磁吸充电宝、智能手环、Steam 3A 大作、骨传导耳机等），实时展示解锁进度与还差多少分钟。
- **跨天大件心愿单**：结合本月已累算工作日与今日实时进账，动态折算 **iPhone**、**MacBook Air** 等跨天大件所需的总工作天数、已攒百分比与剩余天数。
- **「拍拍自己」即时打气**：点击按钮随机切换暖心鼓励文案，并浮现每分钟进账速率微动效。

### 4. 工位友好的三层隐私保护
- **班表默认折叠**：班表集中在右上角「设置」的折叠分组内，主面板不直接展示月薪输入框。
- **小眼睛一键全局打码**：点击右上角眼睛图标（或右键菜单栏图标），**顶部状态栏**立刻变为 `已挣 ¥***`，**面板内部**所有金额变为 `¥****` / `****`，月薪输入框变为密码圆点，同时保留百分比进度条与倒计时。
- **纯本地存储**：无数据上报，个人设置保存在本机；手动检查更新时仅请求 GitHub 公开版本信息。

### 5. 深色 / 浅色双主题
- 点击右上角太阳 / 月亮图标即可在**深咖暖金（Dark）**与**暖米羊皮纸（Light）**主题间切换，macOS 状态栏原生弹窗外观（`DarkAqua` / `Aqua`）也会同步切换。

---

## 计薪公式

```text
每天计薪分钟 = (下班时间 − 上班时间) − 午休时长 − 晚饭时长
每日预计收入 = 月薪 ÷ 每月工作日
每分钟收入   = 每日预计收入 ÷ 每天计薪分钟
今天已挣金额 = 每分钟收入 × 今天已计薪分钟（精确到秒）
```

---

## 快速开始

### 方式一：直接下载 macOS 安装包（免编译，支持 Apple Silicon & Intel）

前往 [**GitHub Releases**](https://github.com/caseclose/work-encourager-open/releases/latest) 下载最新版本的安装包：

- **`WorkEncourager-macOS-universal-v1.3.0.dmg`**：双击挂载后将 `上班鼓励器.app` 拖入 `Applications` 即可。
- **`WorkEncourager-macOS-universal-v1.3.0.zip`**：解压后直接双击运行 `上班鼓励器.app`。

> 需要 macOS 13 或更新版本，安装包同时支持 Apple Silicon 与 Intel。此版本采用本地签名，尚未经过 Apple 公证；确认从本仓库下载后，可在「系统设置 → 隐私与安全性」中允许打开。Release 同时提供 SHA256 校验文件。

### 方式二：从源码编译并运行 macOS 顶部状态栏应用

要求 macOS 13.0+ 且已安装 Xcode Command Line Tools（`swiftc`）：

```bash
# 编译打包并自动安装启动 ~/Applications/上班鼓励器.app
npm run start:mac

# 生成 Universal Binary (.dmg + .zip) 发布包到 release/ 目录
npm run release:mac
```

### 方式三：作为网页应用运行

```bash
# 运行计薪与时间轴单元测试
npm test

# 启动本地静态服务器 (http://localhost:5173)
npm start
```

在浏览器中打开 [http://localhost:5173](http://localhost:5173)，点击右上角「设置」，展开「班表 → 薪资与工作时间」，填入月薪与上下班时间即可开始跳表。

---

## 目录结构

```text
.
├── index.html               # 主面板结构（同时适配桌面网页与 macOS 状态栏弹窗）
├── styles.css               # 深色 / 浅色双主题与响应式样式
├── app.js                   # 状态同步、目标激励、隐私打码与本地持久化
├── settings.js              # 统一设置页、主题、隐私及面板显示偏好
├── goals.js                 # 目标默认值、校验与本地存储
├── goal-editor.js           # 目标新增、修改、删除与草稿保存
├── earn.js                  # 纯函数计薪核心、分段时间轴与月度累算逻辑
├── earn.test.mjs            # Node.js 单元测试套件
├── assets/                  # README 预览截图与应用图标
└── macos/
    ├── MenuBarMain.swift    # 原生 macOS 状态栏应用 (NSStatusItem + NSPopover + WKWebView)
    ├── generate-icon.swift  # CoreGraphics 全尺寸 Retina 应用图标生成器
    └── build-app.sh         # 一键构建 AppIcon.icns 与 .app 应用包脚本
```

## 1.3.0 设置与使用

[下载 v1.3.0 与阅读完整更新说明](https://github.com/caseclose/work-encourager-open/releases/tag/v1.3.0)

<img src="./assets/preview-settings.png" width="360" alt="1.3.0 设置页，包含悬浮窗、伙伴与原生操作" />

点击面板右上角的滑杆图标进入「设置」，左上角返回主面板。原有数据会继续保留。

- **目标个性化**：两类目标均可添加、修改、删除，设置 Emoji、颜色、本地图片封面、置顶与顺序。拖动或上移/下移后保存；置顶目标优先展示，其余按手动顺序排列。每类最多 30 项。
- **达成庆祝**：轻量动画、系统通知或静默。小目标每日、大目标每月去重；首次打开、导入已完成目标、修改价格不会重复庆祝。动画尊重系统的“减少动态效果”。
- **日历与临时班表**：按日期设置放假、补班、提前下班及休息时段，可恢复常规班表。节假日和调休由用户手动标记。完整工作日仍按“月薪 ÷ 每月工作日”计算，短班改变当天计薪速度；本月累计按含临时日期的班表折算。
- **菜单栏**：已挣、剩余、仅金额、下班倒计时、今日进度、目标进度、距目标所需计薪时长、随状态自动切换，共八种模式。目标优先选择置顶项。
- **提醒中心**：午休、晚饭、下班与定时活动提醒，可设置允许提醒时段及跨午夜免打扰。只在应用运行期间发送，不补发错过的通知；通知不包含薪资或金额。
- **迷你悬浮窗（macOS）**：可拖动、置顶、调整不透明度，显示收入、下班倒计时或目标进度，点击打开主面板。位置与窗口偏好会保留。
- **启动与操作（macOS）**：开机自动启动、全局快捷键（⌘⇧E 或 ⌃⌥E）、记住上次页面。通知和登录项需要 macOS 允许；失败会显示实际原因。网页中不支持的原生选项会禁用。
- **备份与恢复**：完整 JSON 备份包含薪资、班表、目标及应用偏好；“仅导出目标”不含薪资。导入先校验并显示范围，确认后替换。系统权限、登录项与快捷键不随备份导入。
- **陪伴伙伴**：可选橘猫或小芽，随计薪、休息和下班切换动态状态；点击伙伴获得一句鼓励。默认关闭。
- **更新与关于**：手动检查 GitHub 最新正式版本并打开发布页；展示版本、贡献者 Feng Wang / @caseclose 与项目链接。

主题、隐私、菜单栏、提醒和面板开关即时保存；目标编辑和日历单日改动需要保存。取消或返回会放弃目标草稿。所有个人数据保存在本机，网页与 macOS 应用分别保存；仅手动检查更新时连接 GitHub，不上传薪资、班表或目标。目标封面在本机裁成 256×256 JPEG，总容量最多约 2 MB。

完整备份是可读的 JSON 文件，请自行保管。大件心愿展示的是本月收入等价进度，不是实际储蓄余额。

### 番茄钟（1.4.0）

主面板可开始、暂停、继续、跳过和重置番茄钟；设置中可调整专注、短休息、长休息和长休息间隔。默认 25 / 5 / 15 分钟，每 4 个番茄长休息。计时保存在本机，阶段结束后手动开始下一段，跳过不计完成。菜单栏和迷你悬浮窗均可选择番茄钟倒计时。阶段通知需开启权限，遵循允许提醒及免打扰时段；退出或睡眠期间不唤醒电脑，恢复运行后检查截止时间。完整备份包含番茄钟偏好，不包含当前计时。

番茄钟支持收起，保留计时和开始／暂停操作。设置内可选择经典倒计时、树苗成长、星光积累；完成专注会累计收获，重置本轮保留累计收获。设置 → 模块布局支持拖动、上移、下移及恢复默认顺序，布局和样式随完整备份保存。
