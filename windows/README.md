# 上班鼓励器 · Windows 桌面版

把 [work-encourager-open](https://github.com/caseclose/work-encourager-open) 的 macOS 顶部菜单栏应用移植为
**Windows 系统托盘程序**。界面没有重写：仓库根目录的网页（`index.html` + 原生 JS）原样复用，
原生外壳用 C# / WinForms + WebView2 重写了 `macos/MenuBarMain.swift` 的每一项职责。

```
macos/MenuBarMain.swift            windows/WorkEncourager/*.cs
──────────────────────────────     ─────────────────────────────────────
NSStatusItem + 状态栏文字          NotifyIcon（托盘图标 + 悬停提示）
NSPopover + WKWebView              无边框 Form + WebView2（450×760）
NSPanel 迷你悬浮窗                 MiniWindow（自绘：Emoji/金额/进度条）
Carbon RegisterEventHotKey         RegisterHotKey + WM_HOTKEY
SMAppService 开机启动              HKCU\...\Run（带 --tray）
UNUserNotificationCenter           托盘通知（含金额拦截）
NSUserDefaults                     %LOCALAPPDATA%\WorkEncourager\native-preferences.json
NSSavePanel / NSOpenPanel          SaveFileDialog / OpenFileDialog
URLSession 检查更新                HttpClient + 相同的版本解析规则
Single instance（AppKit 默认）     Named Mutex + 命名事件唤醒
```

## 功能对照

| 能力 | 现状 |
| --- | --- |
| 实时计薪、休息停表、时间轴 | 与网页版完全一致（同一套 `earn.js`） |
| 九种显示方式（收入/剩余/倒计时/进度/目标/番茄钟/自动…） | 一致，显示在托盘提示与迷你悬浮窗 |
| 点击外部自动收起面板 | 一致（失活 + 1 秒看门狗双保险） |
| 右键菜单：展开/收起、隐藏金额、切换主题、迷你窗、退出 | 一致，另加「开机自动启动」开关 |
| 隐私打码 | 一致；托盘图标同时切换为灰度版本提示当前处于打码状态 |
| 深色/浅色主题 | 一致，原生窗口跟随网页主题 |
| 迷你悬浮窗（置顶/不透明度/拖动/点击打开面板） | 一致（Windows 托盘没有文字区域，它是**常驻显示金额**的主要方式） |
| 小目标 / 大件心愿 / 番茄钟 / 提醒中心 / 陪伴伙伴 | 与网页版一致 |
| 完整备份 / 仅目标备份、导入校验 | 一致（15 MB 上限、先校验后替换） |
| 检查 GitHub 更新 | 一致（API + 发布页兜底 + 语义化版本比较） |
| 全局快捷键 | ⌘⇧E → **Ctrl+Shift+E**；⌃⌥E → **Ctrl+Alt+E** |
| 开机自动启动 | 计划任务（最高权限）：登录时静默启动、不再弹 UAC；旧版 HKCU Run 项会自动迁移 |
| 单实例 | 再次启动只是唤起已运行面板 |
| 首次启动 | 自动打开主面板（否则新用户找不到托盘图标） |

## 安装包（MSI，推荐）

`windows/build.ps1` 会同时生成 `dist/WorkEncourager-Setup-<版本>.msi`（WiX 构建，已签名）：

- 双击运行 → UAC → 欢迎/许可 → 安装到 `C:\Program Files\WorkEncourager`。
- **自动注入代码签名证书**：把 `WorkEncourager-signing.cer` 加入本机「受信任的根证书颁发机构」
  和「受信任的发布者」，装完再启动就是「已验证的发布者：Work Encourager」，无需再手动信任。
- **自动创建快捷方式**：公共桌面「上班鼓励器」+ 开始菜单「上班鼓励器」。
- 卸载（设置 → 应用 / `msiexec /x`）会移除程序文件、快捷方式、开机启动计划任务，
  以及安装时注入的受信任证书。
- 静默安装：`msiexec /i WorkEncourager-Setup-1.4.1.msi /qn`。

zip 免安装版仍然需要手动运行一次 `trust-signing-cert.ps1`（见下一节）。

## 管理员权限与代码签名

Windows 版按需求以**管理员权限**运行（`app.manifest` 中 `requestedExecutionLevel level="requireAdministrator"`）：

- 手动启动 `WorkEncourager.exe` 会弹一次 UAC。
- 「开机自动启动」改用**计划任务**（`schtasks`，`/SC ONLOGON /RL HIGHEST`），登录时以最高权限静默启动，不再弹 UAC；
  旧版本写在 `HKCU\Software\Microsoft\Windows\CurrentVersion\Run` 的启动项会在首次启动时自动迁移成计划任务。
- 卸载时会删除该计划任务；也可手动执行 `schtasks /Delete /TN WorkEncourager /F`。

**关于“未知发布者”**：发布包使用仓库自带的本地自签名代码签名证书（`CN=Work Encourager`）签名，
构建时由 `windows/tools/sign-app.ps1` 自动签名并加时间戳。自签名证书只有在**本机信任**之后才会显示发布者名：

```powershell
# 首次使用（管理员 PowerShell），把 zip 内的证书加入本机受信任根/受信任发布者
powershell -ExecutionPolicy Bypass -File trust-signing-cert.ps1
```

完成后再次启动，UAC 与文件属性里会显示「已验证的发布者：Work Encourager」，不再是「未知发布者」。

> 对外分发注意：自签名证书只在信任过它的机器上生效，其他用户仍需运行一次 `trust-signing-cert.ps1`；
> 要让陌生用户直接看到发布者，需要购买 CA 签发的代码签名证书（OV/EV），把证书装进本机证书存储后
> 用同一个 `sign-app.ps1` 重新签名即可（脚本按证书主题查找，替换主题或改成按指纹查找即可）。
>
> 清理本机信任：
> `Get-ChildItem Cert:\LocalMachine\Root, Cert:\LocalMachine\TrustedPublisher | Where-Object { $_.Subject -like 'CN=Work Encourager*' } | Remove-Item`

## 快速开始

**方式一：直接用发布包（推荐，机器无需装 .NET）**

```
dist\WorkEncourager-win-x64-portable\WorkEncourager.exe
```

双击即可运行，托盘出现图标。想装进开始菜单与桌面：把 `install.ps1` 放在 exe 同一目录后执行

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File install.ps1
```

卸载：`install.ps1 -Uninstall`（个人数据仍保留在 `%LOCALAPPDATA%\WorkEncourager`，按需自行删除）。

**方式二：从源码构建**

前置条件：

- Windows 10/11 x64
- [.NET 10 SDK](https://dotnet.microsoft.com/download)
- [Microsoft Edge WebView2 运行时](https://developer.microsoft.com/microsoft-edge/webview2/)
  （Windows 11 自带，Windows 10 多数机器随 Edge 已安装）
- Node.js 20+（仅在跑网页层单测时需要）

```powershell
# 构建 + 跑 84 个网页层单测 + 生成 dist/ 两个发布目录
powershell -ExecutionPolicy Bypass -File windows/build.ps1

# 构建并打 zip 发布包
powershell -ExecutionPolicy Bypass -File windows/build.ps1 -Zip

# 构建并直接启动（Debug）
powershell -ExecutionPolicy Bypass -File windows/build.ps1 -Configuration Debug -Run
```

也可以直接用 dotnet：

```powershell
dotnet build windows\WorkEncourager\WorkEncourager.csproj -c Debug
.windows\WorkEncourager\bin\Debug\net10.0-windows\WorkEncourager.exe
```

## 目录结构

```
windows/
├── WorkEncourager/
│   ├── WorkEncourager.csproj    # 目标框架、图标、把 web 资源复制到发布目录
│   ├── Program.cs               # 入口、单实例、--tray/--devtools
│   ├── AppHost.cs               # ApplicationContext：托盘/面板/迷你窗编排与动作分发
│   ├── PanelWindow.cs           # 无边框弹出面板 + WebView2 + 全局热键
│   ├── MiniWindow.cs            # 迷你悬浮窗（原生自绘）
│   ├── TrayController.cs        # 托盘图标、提示、右键菜单
│   ├── NativePreferences.cs     # 原生偏好持久化（对应 UserDefaults）
│   ├── NotificationService.cs   # 系统通知 + 金额拦截
│   ├── UpdateChecker.cs         # GitHub 版本检查（移植 Swift 逻辑）
│   ├── BackupService.cs         # 备份导出/导入
│   ├── LaunchAtLogin.cs         # 开机启动（HKCU Run）
│   ├── BridgeJson.cs            # 原生 ↔ 网页 JSON 协议
│   ├── NativeMethods.cs         # Win32 互操作
│   ├── ThemeHelper.cs           # 读取系统主题
│   └── Assets/                  # app.ico / app-masked.ico（由 tools/make-icon.ps1 生成）
├── tools/
│   ├── make-icon.ps1            # 从 assets/icon.png 生成多尺寸 .ico（无外部依赖）
│   └── ui-probe.mjs             # 通过 CDP 的端到端自动化验证脚本
├── build.ps1                    # 构建 / 发布 / 打包
├── install.ps1                  # 安装 / 卸载
└── README.md                    # 本文件
```

## 原始桥接协议（维护必读）

网页层（`feature-ui.js` / `app.js`）只认 macOS 的 WKWebView 桥：

```js
window.webkit.messageHandlers.statusBar.postMessage({ action: '...' })   // 网页 → 原生
window.__nativeEvent(payload)                                            // 原生 → 网页
```

Windows 外壳在页面加载前注入一段兼容脚本，用 WebView2 的 `window.chrome.webview` 实现同一个对象，
因此**网页代码一行未改**：

```js
window.webkit = { messageHandlers: { statusBar: { postMessage: m => window.chrome.webview.postMessage(m) } } };
```

支持的原生动作与 macOS 版一一对应：

| action | 说明 |
| --- | --- |
| `quit` | 退出应用 |
| `nativeState` | 请求刷新并回推 `{type:'state', ...}` |
| `setLaunchAtLogin` | `{enabled}` → 写/删 Run 键 |
| `setHotkey` | `{value: 'none'\|'cmdShiftE'\|'ctrlAltE'}` |
| `setMiniWindow` | `{enabled,pinned,opacity}` |
| `requestNotifications` / `notify` | 通知授权与发送（含金额拦截） |
| `checkUpdates` / `openRelease` | 版本检查、打开已校验的 GitHub 发布页 |
| `exportBackup` / `importBackup` | 原生文件对话框 |

原生 → 网页：`{type:'state'} `（设置页状态）、`{type:'result', action, ok, message}`（操作结果）、
`{type:'importBackup', text}`（导入内容）。另外每秒轮询一次
`window.__setSystemTheme(...)` + `window.__getMenuBarStatus()`，与 macOS 版的 `pollWebViewStatus()` 相同，
用于同步系统主题与托盘状态。

## 数据与隐私

| 内容 | 位置 |
| --- | --- |
| 薪资、班表、目标、番茄钟、提醒等网页设置 | `%LOCALAPPDATA%\WorkEncourager\WebView2`（WebView2 配置目录内的 localStorage） |
| 原生偏好（迷你窗、快捷键、面板位置） | `%LOCALAPPDATA%\WorkEncourager\native-preferences.json` |
| 运行日志 | `%LOCALAPPDATA%\WorkEncourager\logs\work-encourager.log` |

与 macOS 版一致：网页设置与原生偏好分开保存，二者都不上传；只有手动「检查更新」会访问 GitHub。

## 与 macOS / 网页版的差异

1. **托盘图标不能显示文字。** Windows 通知区域只有图标 + 悬停提示（tooltip），没有 macOS 菜单栏那样
   的文字区。因此实时金额显示在：① 托盘悬停提示；② 迷你悬浮窗（可拖动、可置顶、可调不透明度，可长期常驻）；
   ③ 打开的主面板。打码状态下托盘图标会变成灰度版本。
2. **系统通知**走 Windows 通知中心/气泡，权限状态由「设置 → 系统 → 通知」总开关决定；
   与原版一样，通知内容里的金额会被原生端拦截（`已挣 ¥123` 这类文案直接拒绝发送）。
   通知是否响铃由 Windows 通知设置决定，无法像 macOS 那样对单条通知静音（原版仅 `sound:true` 才响）。
3. **全局快捷键**：Windows 没有 ⌘ 键，`cmdShiftE` 映射为 `Ctrl+Shift+E`，`ctrlAltE` 保持 `Ctrl+Alt+E`。
4. **文件对话框**使用 Windows 原生样式；备份校验规则与大小上限（15 MB）与 macOS 版一致，
   导出为原子写入（临时文件 + 替换），导入要求合法 UTF-8 与对象/数组类型的 JSON。
5. **单实例**：第二次启动不会开新进程，而是把已运行窗口唤到前台。
6. **网页里的外链**（`target="_blank"`）交给默认浏览器打开，与 macOS 的
   `WKUIDelegate.createWebViewWith → NSWorkspace.open` 一致，不会在应用内弹窗。
7. **字体替换导致的 Emoji 方块**：如果系统做过字体替换（把 `Segoe UI Emoji` 指向 PingFang 等中文字体），
   Emoji 会显示为方块。这是系统字体配置问题，浏览器里同样会方块，不是本应用缺陷。
   发布包内附修复脚本（管理员 PowerShell，先备份原值、可一键撤销）：

   ```powershell
   powershell -ExecutionPolicy Bypass -File fix-emoji-font.ps1            # 修复
   powershell -ExecutionPolicy Bypass -File fix-emoji-font.ps1 -Restore   # 撤销
   ```

   脚本把 `Segoe UI Emoji (TrueType)` / `Segoe UI Symbol (TrueType)` 指回
   `seguiemj.ttf` / `seguisym.ttf`，原值备份在 `%LOCALAPPDATA%\WorkEncourager\emoji-font-backup.json`；
   修复后新启动的程序立即生效，已开着的应用重启一次即可。

## 调试与验证

- 打开 DevTools：`WorkEncourager.exe --devtools`（或 `--devtools` 参数配合 F12）。
- 暴露 CDP 端口供自动化驱动：设置环境变量 `WORK_ENCOURAGER_CDP_PORT=9333` 后启动，
  然后 `curl http://127.0.0.1:9333/json/version` 可看到 WebView2 端点。
- 端到端验证脚本：

  ```powershell
  $env:WORK_ENCOURAGER_CDP_PORT = '9333'
  Start-Process .\windows\WorkEncourager\bin\Debug\net10.0-windows\WorkEncourager.exe
  npm install --no-save playwright-core   # 在仓库根目录执行，脚本要能解析到该依赖
  node windows\tools\ui-probe.mjs
  ```

  脚本会检查原生桥是否就位、计薪是否跳动、打码、热键设置、迷你窗、通知（含金额拦截）、
  更新检查、备份校验等，并输出 PASS/FAIL 摘要。

- 日志：`%LOCALAPPDATA%\WorkEncourager\logs\work-encourager.log`。

## 已知限制

- 仅构建 `win-x64`；ARM64 可用 `dotnet publish -r win-arm64` 自行发布（代码无 x64 特定逻辑）。
- 托盘图标默认可能被 Windows 11 收进「隐藏的图标」弹出区，可在设置里拖到任务栏常驻。
- 应用清单要求管理员权限（`requireAdministrator`），每次手动启动都会弹一次 UAC；开机自启走计划任务，登录时不会弹 UAC。
