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
- **三种状态栏文案切换**：支持一键切换 **`已挣 ¥...`**、**`剩余 ¥...`**（今日待挣余额）、**`仅金额 ¥...`**。
- **原生弹窗面板**：左键点击状态栏图标弹出完整仪表盘，点击外部自动收起；右键点击可快速呼出「隐藏/显示金额」「切换深色/浅色模式」「退出」快捷菜单。

### 2. 分时段计薪与进度时间轴
- **真实计薪时长折算**：支持分别勾选并扣除**午休时段**与**晚饭时段**，休息期间金额自动停表，休息结束后从已累计金额无缝续算。
- **分段式今日时间轴**：将全天班表拆分为「计薪段」与「斜纹休息段」，游标实时指示当前所处位置，并自动倒计时提示距离下一顿饭或下班还有多久。

### 3. 双层激励体系：今日 12 宫格小目标 + 跨天大件心愿单
- **今日点亮的小目标**：将单日收入具象化为日常美食与数码单品（工作餐、通勤打车、炸鸡、披萨、有线耳机、自助烤肉、无线鼠标、磁吸充电宝、智能手环、Steam 3A 大作、骨传导耳机等），实时展示解锁进度与还差多少分钟。
- **跨天大件心愿单**：结合本月已累算工作日与今日实时进账，动态折算 **iPhone**、**MacBook Air** 等跨天大件所需的总工作天数、已攒百分比与剩余天数。
- **「拍拍自己」即时打气**：点击按钮随机切换暖心鼓励文案，并浮现每分钟进账速率微动效。

### 4. 工位友好的三层隐私保护
- **班表默认折叠**：班表集中在右上角「设置」的折叠分组内，主面板不直接展示月薪输入框。
- **小眼睛一键全局打码**：点击右上角眼睛图标（或右键菜单栏图标），**顶部状态栏**立刻变为 `已挣 ¥***`，**面板内部**所有金额变为 `¥****` / `****`，月薪输入框变为密码圆点，同时保留百分比进度条与倒计时。
- **纯本地存储**：零后端、零网络上报，所有设置仅保存在本机 `localStorage`。

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

- **`WorkEncourager-macOS-universal-v1.0.0.dmg`**：双击挂载后将 `上班鼓励器.app` 拖入 `Applications` 即可。
- **`WorkEncourager-macOS-universal-v1.0.0.zip`**：解压后直接双击运行 `上班鼓励器.app`。

> 若首次打开提示未签名开发者限制，可在终端执行一次 `xattr -cr /Applications/上班鼓励器.app` 或在「系统设置 → 隐私与安全性」中点击「仍要打开」。

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

## 设置与自定义目标

点击面板右上角的滑杆图标进入「设置」，用左上角返回按钮回到主面板。

- **通用**：主题支持跟随系统、浅色、深色；隐藏金额同时作用于菜单栏、面板和目标编辑器。
- **菜单栏**：选择显示已挣、剩余或仅金额。
- **面板**：分别开关计薪统计、今日时间轴、今日小目标与跨天心愿单。
- **目标 → 管理目标**：新增、修改和删除两类目标，设置名称、金额（元，最多两位小数）及单位。每类最多 30 个，允许全部删除；小目标按金额升序展示，不会因超过一天收入而被隐藏。
- **班表 → 薪资与工作时间**：修改月薪、每月工作日、每周上班日、上下班和休息时段。
- **关于**：查看版本、数据隐私说明与项目地址。

通用、菜单栏、面板和班表设置即时保存。目标编辑需要点击「保存目标」后生效；「取消」、返回或 Esc 放弃目标草稿。「恢复本类默认」只影响当前类别，需要保存后生效。重启后仍然保留设置，所有数据仅存于本机，网页与 macOS 应用分别保存。
