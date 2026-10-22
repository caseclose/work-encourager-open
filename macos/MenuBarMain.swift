import Cocoa
import WebKit
import Carbon
import ServiceManagement
import UserNotifications
import UniformTypeIdentifiers

final class LocalWebSchemeHandler: NSObject, WKURLSchemeHandler {
    private let rootURL: URL

    init(rootURL: URL) {
        self.rootURL = rootURL
    }

    func webView(_ webView: WKWebView, start urlSchemeTask: WKURLSchemeTask) {
        guard let requestURL = urlSchemeTask.request.url else {
            urlSchemeTask.didFailWithError(URLError(.badURL))
            return
        }

        var relativePath = requestURL.path
        if relativePath.isEmpty || relativePath == "/" {
            relativePath = "/index.html"
        }
        let cleanPath = String(relativePath.dropFirst())
        let fileURL = rootURL.appendingPathComponent(cleanPath)

        guard let data = try? Data(contentsOf: fileURL) else {
            urlSchemeTask.didFailWithError(URLError(.fileDoesNotExist))
            return
        }

        let mimeType = Self.mimeType(for: fileURL.pathExtension)
        let headers: [String: String] = [
            "Content-Type": mimeType,
            "Content-Length": "\(data.count)",
            "Access-Control-Allow-Origin": "*",
            "Cache-Control": "no-cache"
        ]

        if let response = HTTPURLResponse(
            url: requestURL,
            statusCode: 200,
            httpVersion: "HTTP/1.1",
            headerFields: headers
        ) {
            urlSchemeTask.didReceive(response)
            urlSchemeTask.didReceive(data)
            urlSchemeTask.didFinish()
        } else {
            urlSchemeTask.didFailWithError(URLError(.cannotParseResponse))
        }
    }

    func webView(_ webView: WKWebView, stop urlSchemeTask: WKURLSchemeTask) {}

    private static func mimeType(for ext: String) -> String {
        switch ext.lowercased() {
        case "html": return "text/html; charset=utf-8"
        case "css": return "text/css; charset=utf-8"
        case "js", "mjs": return "application/javascript; charset=utf-8"
        case "json": return "application/json; charset=utf-8"
        case "svg": return "image/svg+xml"
        case "png": return "image/png"
        default: return "application/octet-stream"
        }
    }
}

final class PopoverWebViewController: NSViewController, WKScriptMessageHandler, WKUIDelegate {
    private(set) var webView: WKWebView!
    var onMessage: (([String: Any]) -> Void)?
    var onFilePanelVisibility: ((Bool) -> Void)?

    override func loadView() {
        let config = WKWebViewConfiguration()
        config.userContentController.add(self, name: "statusBar")
        let webRoot = Bundle.main.resourceURL?.appendingPathComponent("web")
            ?? URL(fileURLWithPath: FileManager.default.currentDirectoryPath)
        config.setURLSchemeHandler(LocalWebSchemeHandler(rootURL: webRoot), forURLScheme: "encourager")
        webView = WKWebView(frame: NSRect(x: 0, y: 0, width: 450, height: 760), configuration: config)
        webView.uiDelegate = self
        webView.setValue(false, forKey: "drawsBackground")
        self.view = webView
        let theme = NSApp.effectiveAppearance.bestMatch(from: [.darkAqua, .aqua]) == .darkAqua ? "dark" : "light"
        webView.load(URLRequest(url: URL(string: "encourager://app/index.html?menubar=1&systemTheme=\(theme)")!))
    }

    func webView(_ webView: WKWebView, createWebViewWith configuration: WKWebViewConfiguration,
                 for navigationAction: WKNavigationAction, windowFeatures: WKWindowFeatures) -> WKWebView? {
        if navigationAction.targetFrame == nil, let url = navigationAction.request.url,
           let scheme = url.scheme, ["https", "http"].contains(scheme) {
            NSWorkspace.shared.open(url)
        }
        return nil
    }

    func webView(_ webView: WKWebView, runOpenPanelWith parameters: WKOpenPanelParameters,
                 initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping ([URL]?) -> Void) {
        let panel = NSOpenPanel()
        panel.canChooseDirectories = parameters.allowsDirectories
        panel.canChooseFiles = true
        panel.allowsMultipleSelection = parameters.allowsMultipleSelection
        panel.allowedContentTypes = [.png, .jpeg, .webP, .gif, .json]
        panel.title = "选择目标封面或备份文件"
        onFilePanelVisibility?(true)
        NSApp.activate(ignoringOtherApps: true)
        panel.begin { [weak self] response in
            completionHandler(response == .OK ? panel.urls : nil)
            self?.onFilePanelVisibility?(false)
        }
    }

    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        guard let body = message.body as? [String: Any] else { return }
        onMessage?(body)
    }

    func send(_ payload: [String: Any]) {
        guard JSONSerialization.isValidJSONObject(payload),
              let data = try? JSONSerialization.data(withJSONObject: payload),
              let json = String(data: data, encoding: .utf8) else { return }
        webView?.evaluateJavaScript("window.__nativeEvent && window.__nativeEvent(\(json))", completionHandler: nil)
    }
}

final class MiniWindowController: NSObject, NSWindowDelegate {
    let panel: NSPanel
    private let titleLabel = NSTextField(labelWithString: "上班鼓励器")
    private let detailLabel = NSTextField(labelWithString: "点击打开主面板")
    private let emojiLabel = NSTextField(labelWithString: "¥")
    private let progressBar = NSProgressIndicator()
    var onOpen: (() -> Void)?
    var onClose: (() -> Void)?

    override init() {
        panel = NSPanel(contentRect: NSRect(x: 100, y: 180, width: 280, height: 112),
                        styleMask: [.titled, .closable, .utilityWindow, .nonactivatingPanel, .fullSizeContentView],
                        backing: .buffered, defer: false)
        super.init()
        panel.title = "上班鼓励器 · 迷你窗口"
        panel.titleVisibility = .hidden
        panel.titlebarAppearsTransparent = true
        panel.isMovableByWindowBackground = true
        panel.hidesOnDeactivate = false
        panel.isReleasedWhenClosed = false
        panel.collectionBehavior = [.canJoinAllSpaces, .fullScreenAuxiliary]
        panel.delegate = self
        panel.setFrameAutosaveName("WorkEncouragerMiniWindow")
        let background = NSVisualEffectView()
        background.material = .hudWindow
        background.blendingMode = .behindWindow
        background.state = .active
        panel.contentView = background
        let openButton = NSButton(image: NSImage(systemSymbolName: "arrow.up.right.square", accessibilityDescription: "打开主面板")!, target: self, action: #selector(openMain))
        openButton.bezelStyle = .inline
        openButton.isBordered = false
        openButton.toolTip = "打开主面板"
        titleLabel.font = .monospacedDigitSystemFont(ofSize: 21, weight: .semibold)
        titleLabel.lineBreakMode = .byTruncatingTail
        detailLabel.font = .systemFont(ofSize: 11)
        detailLabel.textColor = .secondaryLabelColor
        detailLabel.lineBreakMode = .byTruncatingTail
        emojiLabel.font = .systemFont(ofSize: 27)
        progressBar.isIndeterminate = false
        progressBar.minValue = 0
        progressBar.maxValue = 1
        progressBar.style = .bar
        for view in [titleLabel, detailLabel, emojiLabel, progressBar, openButton] {
            view.translatesAutoresizingMaskIntoConstraints = false
            background.addSubview(view)
        }
        NSLayoutConstraint.activate([
            emojiLabel.leadingAnchor.constraint(equalTo: background.leadingAnchor, constant: 16),
            emojiLabel.topAnchor.constraint(equalTo: background.topAnchor, constant: 28),
            emojiLabel.widthAnchor.constraint(equalToConstant: 36),
            titleLabel.leadingAnchor.constraint(equalTo: emojiLabel.trailingAnchor, constant: 10),
            titleLabel.topAnchor.constraint(equalTo: background.topAnchor, constant: 28),
            titleLabel.trailingAnchor.constraint(equalTo: openButton.leadingAnchor, constant: -6),
            openButton.trailingAnchor.constraint(equalTo: background.trailingAnchor, constant: -12),
            openButton.topAnchor.constraint(equalTo: background.topAnchor, constant: 31),
            openButton.widthAnchor.constraint(equalToConstant: 20),
            detailLabel.leadingAnchor.constraint(equalTo: titleLabel.leadingAnchor),
            detailLabel.trailingAnchor.constraint(equalTo: background.trailingAnchor, constant: -14),
            detailLabel.topAnchor.constraint(equalTo: titleLabel.bottomAnchor, constant: 4),
            progressBar.leadingAnchor.constraint(equalTo: background.leadingAnchor, constant: 16),
            progressBar.trailingAnchor.constraint(equalTo: background.trailingAnchor, constant: -16),
            progressBar.bottomAnchor.constraint(equalTo: background.bottomAnchor, constant: -13),
            progressBar.heightAnchor.constraint(equalToConstant: 5)
        ])
        _ = panel.setFrameUsingName("WorkEncouragerMiniWindow")
    }

    func update(_ payload: [String: Any]) {
        if let title = payload["title"] as? String { titleLabel.stringValue = String(title.prefix(80)) }
        if let detail = payload["detail"] as? String { detailLabel.stringValue = String(detail.prefix(160)) }
        if let emoji = payload["emoji"] as? String { emojiLabel.stringValue = String(emoji.prefix(8)) }
        if let value = payload["progress"] as? Double, value.isFinite { progressBar.doubleValue = min(1, max(0, value)) }
    }

    func configure(enabled: Bool, pinned: Bool, opacity: Double) {
        panel.level = pinned ? .floating : .normal
        panel.alphaValue = CGFloat(min(1, max(0.35, opacity)))
        if enabled { panel.orderFrontRegardless() } else { panel.orderOut(nil) }
    }

    @objc private func openMain() { onOpen?() }
    func windowWillClose(_ notification: Notification) { onClose?() }
}

final class AppDelegate: NSObject, NSApplicationDelegate, UNUserNotificationCenterDelegate {
    private var statusItem: NSStatusItem!
    private let popover = NSPopover()
    private let webViewController = PopoverWebViewController()
    private var refreshTimer: Timer?
    private var eventMonitor: Any?
    private var miniWindow: MiniWindowController?
    private var latestMini: [String: Any] = [:]
    private var hotkeyRef: EventHotKeyRef?
    private var hotkeyHandler: EventHandlerRef?
    private var activeHotkey = "none"
    private var notificationStatus = "notDetermined"
    private var checkingUpdates = false
    private let preferences = UserDefaults.standard
    private let maxBackupBytes = 15 * 1024 * 1024
    private var version: String { Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? "1.3.0" }
    private var miniEnabled: Bool { preferences.bool(forKey: "miniEnabled") }
    private var miniPinned: Bool { preferences.object(forKey: "miniPinned") as? Bool ?? true }
    private var miniOpacity: Double { min(1, max(0.35, preferences.object(forKey: "miniOpacity") as? Double ?? 1)) }

    func applicationDidFinishLaunching(_ notification: Notification) {
        NSApp.setActivationPolicy(.accessory)
        UNUserNotificationCenter.current().delegate = self
        statusItem = NSStatusBar.system.statusItem(withLength: NSStatusItem.variableLength)
        configureStatusButton(title: "已挣 ¥0.00")
        webViewController.onMessage = { [weak self] payload in self?.handleMessage(payload) }
        webViewController.onFilePanelVisibility = { [weak self] visible in
            guard let self else { return }
            if visible { self.popover.performClose(nil) } else { self.showPopover() }
        }
        popover.contentSize = NSSize(width: 450, height: 760)
        popover.behavior = .transient
        popover.animates = true
        popover.contentViewController = webViewController
        _ = webViewController.view
        installHotkeyHandler()
        let savedHotkey = preferences.string(forKey: "hotkey") ?? "none"
        if let failure = setHotkey(savedHotkey) {
            NSLog("Saved hotkey unavailable: %@", failure)
        }
        configureMiniWindow()
        refreshNotificationStatus()
        refreshTimer = Timer.scheduledTimer(withTimeInterval: 1, repeats: true) { [weak self] _ in self?.pollWebViewStatus() }
        if let refreshTimer { RunLoop.main.add(refreshTimer, forMode: .common) }
        eventMonitor = NSEvent.addGlobalMonitorForEvents(matching: [.leftMouseDown, .rightMouseDown]) { [weak self] _ in
            guard let self, self.popover.isShown else { return }
            self.popover.performClose(nil)
        }
    }

    func applicationWillTerminate(_ notification: Notification) {
        if let hotkeyRef { UnregisterEventHotKey(hotkeyRef) }
        if let hotkeyHandler { RemoveEventHandler(hotkeyHandler) }
        if let eventMonitor { NSEvent.removeMonitor(eventMonitor) }
    }

    private func result(_ action: String, _ ok: Bool, _ message: String, extra: [String: Any] = [:]) {
        var payload = extra
        payload["type"] = "result"
        payload["action"] = action
        payload["ok"] = ok
        payload["message"] = message
        webViewController.send(payload)
    }

    private func sendState() {
        let loginStatus = SMAppService.mainApp.status
        let loginLabel: String
        switch loginStatus {
        case .enabled: loginLabel = "enabled"
        case .requiresApproval: loginLabel = "requiresApproval"
        case .notRegistered: loginLabel = "notRegistered"
        case .notFound: loginLabel = "notFound"
        @unknown default: loginLabel = "unknown"
        }
        webViewController.send([
            "type": "state", "launchAtLogin": loginStatus == .enabled, "launchAtLoginStatus": loginLabel,
            "hotkey": activeHotkey, "miniEnabled": miniEnabled, "miniPinned": miniPinned,
            "miniOpacity": miniOpacity, "notifications": notificationStatus, "version": version
        ])
    }

    private func handleMessage(_ payload: [String: Any]) {
        if let action = payload["action"] as? String {
            switch action {
            case "quit": NSApp.terminate(nil)
            case "nativeState": refreshNotificationStatus()
            case "setLaunchAtLogin":
                guard let enabled = payload["enabled"] as? Bool else { return }
                do {
                    if enabled { try SMAppService.mainApp.register() } else { try SMAppService.mainApp.unregister() }
                    let status = SMAppService.mainApp.status
                    let success = enabled ? status == .enabled : status != .enabled && status != .requiresApproval
                    result(action, success, success ? (enabled ? "已开启开机启动。" : "已关闭开机启动。") : "请在系统设置 → 通用 → 登录项中允许上班鼓励器运行。")
                } catch { result(action, false, "开机启动设置失败：\(error.localizedDescription)") }
                sendState()
            case "setHotkey":
                guard let value = payload["value"] as? String else { return }
                if let error = setHotkey(value) { result(action, false, error) }
                else { result(action, true, value == "none" ? "全局快捷键已关闭。" : "全局快捷键已设置。") }
                sendState()
            case "setMiniWindow":
                if let enabled = payload["enabled"] as? Bool { preferences.set(enabled, forKey: "miniEnabled") }
                if let pinned = payload["pinned"] as? Bool { preferences.set(pinned, forKey: "miniPinned") }
                if let opacity = payload["opacity"] as? Double, opacity.isFinite { preferences.set(min(1, max(0.35, opacity)), forKey: "miniOpacity") }
                configureMiniWindow()
                result(action, true, miniEnabled ? "迷你窗口已更新。" : "迷你窗口已关闭。")
                sendState()
            case "requestNotifications": requestNotifications()
            case "notify": notify(payload)
            case "checkUpdates": checkUpdates()
            case "openRelease":
                guard let text = payload["url"] as? String, let url = URL(string: text),
                      url.scheme == "https", url.host == "github.com",
                      url.path.hasPrefix("/caseclose/work-encourager-open/releases") else {
                    result(action, false, "无效的版本页面地址。")
                    return
                }
                let opened = NSWorkspace.shared.open(url)
                result(action, opened, opened ? "已打开版本发布页。" : "无法打开版本发布页。")
            case "exportBackup": exportBackup(payload)
            case "importBackup": importBackup()
            default: result(action, false, "不支持的原生操作。")
            }
            return
        }
        if let title = payload["title"] as? String { updateStatusTitle(title) }
        applyTheme(payload["theme"] as? String)
        if let mini = payload["mini"] as? [String: Any] {
            latestMini = mini
            miniWindow?.update(mini)
        }
    }

    private func configureMiniWindow() {
        if miniWindow == nil && miniEnabled {
            let controller = MiniWindowController()
            controller.onOpen = { [weak self] in self?.showPopover() }
            controller.onClose = { [weak self] in
                self?.preferences.set(false, forKey: "miniEnabled")
                self?.sendState()
            }
            controller.update(latestMini)
            miniWindow = controller
        }
        miniWindow?.configure(enabled: miniEnabled, pinned: miniPinned, opacity: miniOpacity)
    }

    private func installHotkeyHandler() {
        var spec = EventTypeSpec(eventClass: OSType(kEventClassKeyboard), eventKind: UInt32(kEventHotKeyPressed))
        let pointer = Unmanaged.passUnretained(self).toOpaque()
        let status = InstallEventHandler(GetApplicationEventTarget(), { _, _, userData in
            guard let userData else { return OSStatus(eventNotHandledErr) }
            let owner = Unmanaged<AppDelegate>.fromOpaque(userData).takeUnretainedValue()
            DispatchQueue.main.async { owner.togglePopover(nil) }
            return noErr
        }, 1, &spec, pointer, &hotkeyHandler)
        if status != noErr { NSLog("Hotkey event handler failed: %d", status) }
    }

    private func setHotkey(_ value: String) -> String? {
        guard ["none", "cmdShiftE", "ctrlAltE"].contains(value) else { return "未知的快捷键选项。" }
        if value == activeHotkey { return nil }
        if value == "none" {
            if let hotkeyRef { UnregisterEventHotKey(hotkeyRef) }
            hotkeyRef = nil
            activeHotkey = "none"
            preferences.set(value, forKey: "hotkey")
            return nil
        }
        guard hotkeyHandler != nil else { return "无法注册全局快捷键，请重启应用后重试。" }
        let modifiers = value == "cmdShiftE" ? UInt32(cmdKey | shiftKey) : UInt32(controlKey | optionKey)
        var replacement: EventHotKeyRef?
        let identifier = EventHotKeyID(signature: OSType(0x57454e43), id: 1)
        let status = RegisterEventHotKey(UInt32(kVK_ANSI_E), modifiers, identifier, GetApplicationEventTarget(), 0, &replacement)
        guard status == noErr, replacement != nil else { return "快捷键被其他应用占用或注册失败（\(status)），原快捷键保持不变。" }
        if let hotkeyRef { UnregisterEventHotKey(hotkeyRef) }
        hotkeyRef = replacement
        activeHotkey = value
        preferences.set(value, forKey: "hotkey")
        return nil
    }

    private func refreshNotificationStatus() {
        UNUserNotificationCenter.current().getNotificationSettings { [weak self] settings in
            DispatchQueue.main.async {
                switch settings.authorizationStatus {
                case .authorized: self?.notificationStatus = "authorized"
                case .provisional: self?.notificationStatus = "provisional"
                case .denied: self?.notificationStatus = "denied"
                case .notDetermined: self?.notificationStatus = "notDetermined"
                @unknown default: self?.notificationStatus = "unknown"
                }
                self?.sendState()
            }
        }
    }

    private func requestNotifications() {
        UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .sound]) { [weak self] granted, error in
            DispatchQueue.main.async {
                self?.result("requestNotifications", granted,
                             error.map { "通知授权失败：\($0.localizedDescription)" } ?? (granted ? "系统提醒已允许。" : "系统提醒未允许，可在系统设置 → 通知中修改。"))
                self?.refreshNotificationStatus()
            }
        }
    }

    private func notify(_ payload: [String: Any]) {
        guard let title = payload["title"] as? String, let body = payload["body"] as? String,
              !title.isEmpty, !body.isEmpty else { return }
        // Never reveal salary or currency amounts in system notifications, even if a caller sends one.
        let text = title + " " + body
        let sensitive = text.range(of: "[¥￥$€£]|(?:月薪|工资|收入|已挣|到账).{0,12}[0-9]", options: .regularExpression) != nil
        guard !sensitive else { result("notify", false, "提醒中包含金额，已阻止发送。"); return }
        UNUserNotificationCenter.current().getNotificationSettings { [weak self] settings in
            guard settings.authorizationStatus == .authorized || settings.authorizationStatus == .provisional else {
                DispatchQueue.main.async { self?.result("notify", false, "系统通知未授权。") }
                return
            }
            let content = UNMutableNotificationContent()
            content.title = String(title.prefix(80))
            content.body = String(body.prefix(300))
            if payload["sound"] as? Bool == true { content.sound = .default }
            let request = UNNotificationRequest(identifier: UUID().uuidString, content: content, trigger: nil)
            UNUserNotificationCenter.current().add(request) { error in
                DispatchQueue.main.async { self?.result("notify", error == nil, error.map { "提醒发送失败：\($0.localizedDescription)" } ?? "提醒已发送。") }
            }
        }
    }

    func userNotificationCenter(_ center: UNUserNotificationCenter, willPresent notification: UNNotification,
                                withCompletionHandler completionHandler: @escaping (UNNotificationPresentationOptions) -> Void) {
        completionHandler([.banner, .sound])
    }

    private static func numericVersion(_ value: String) -> [Int]? {
        let normalized = value.hasPrefix("v") ? String(value.dropFirst()) : value
        let buildParts = normalized.split(separator: "+", omittingEmptySubsequences: false)
        guard buildParts.count <= 2 else { return nil }
        let allowed = CharacterSet(charactersIn: "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-")
        func validIdentifiers(_ value: Substring, isPrerelease: Bool) -> Bool {
            value.split(separator: ".", omittingEmptySubsequences: false).allSatisfy { identifier in
                guard !identifier.isEmpty, identifier.unicodeScalars.allSatisfy({ allowed.contains($0) }) else { return false }
                let numeric = identifier.allSatisfy { $0 >= "0" && $0 <= "9" }
                return !isPrerelease || !numeric || identifier.count == 1 || identifier.first != "0"
            }
        }
        if buildParts.count == 2 && !validIdentifiers(buildParts[1], isPrerelease: false) { return nil }
        let prereleaseParts = buildParts[0].split(separator: "-", maxSplits: 1, omittingEmptySubsequences: false)
        if prereleaseParts.count == 2 && !validIdentifiers(prereleaseParts[1], isPrerelease: true) { return nil }
        let components = prereleaseParts[0].split(separator: ".", omittingEmptySubsequences: false)
        guard components.count == 3 else { return nil }
        var version: [Int] = []
        for component in components {
            guard !component.isEmpty, component.allSatisfy({ $0 >= "0" && $0 <= "9" }),
                  component.count == 1 || component.first != "0", let number = Int(component) else { return nil }
            version.append(number)
        }
        return version
    }

    private func reportUpdateVersion(_ latest: String, url: String) {
        guard let latestParts = Self.numericVersion(latest), let currentParts = Self.numericVersion(version) else {
            result("checkUpdates", false, "版本号格式无效，无法比较更新。")
            return
        }
        let newer = currentParts.lexicographicallyPrecedes(latestParts)
        let message = newer ? "发现新版本 \(latest)。" : currentParts == latestParts ? "当前已是最新版本。" : "当前版本 \(version) 高于 GitHub 正式版 \(latest)。"
        result("checkUpdates", true, message, extra: [
            "updateAvailable": newer, "latestVersion": latest, "currentVersion": version, "url": url
        ])
    }

    private func checkPublicReleasePage(apiStatus: Int) {
        // GitHub's unauthenticated API may be rate-limited while the public release page remains available.
        checkingUpdates = true
        let url = URL(string: "https://github.com/caseclose/work-encourager-open/releases/latest")!
        var request = URLRequest(url: url, cachePolicy: .reloadIgnoringLocalCacheData, timeoutInterval: 15)
        request.httpMethod = "HEAD"
        request.setValue("WorkEncourager/\(version)", forHTTPHeaderField: "User-Agent")
        URLSession.shared.dataTask(with: request) { [weak self] _, response, error in
            DispatchQueue.main.async {
                guard let self else { return }
                self.checkingUpdates = false
                let prefix = "/caseclose/work-encourager-open/releases/tag/"
                guard error == nil, let response = response as? HTTPURLResponse, response.statusCode == 200,
                      let finalURL = response.url, finalURL.scheme == "https", finalURL.host == "github.com",
                      finalURL.query == nil, finalURL.fragment == nil, finalURL.path.hasPrefix(prefix) else {
                    self.result("checkUpdates", false, "无法读取版本信息（API HTTP \(apiStatus)，发布页查询也未成功）。")
                    return
                }
                let tag = String(finalURL.path.dropFirst(prefix.count))
                guard !tag.contains("/"), Self.numericVersion(tag) != nil else {
                    self.result("checkUpdates", false, "无法读取版本信息（API HTTP \(apiStatus)，发布页版本号无效）。")
                    return
                }
                self.reportUpdateVersion(tag, url: finalURL.absoluteString)
            }
        }.resume()
    }

    private func checkUpdates() {
        guard !checkingUpdates else { result("checkUpdates", false, "正在检查更新，请稍候。"); return }
        checkingUpdates = true
        let url = URL(string: "https://api.github.com/repos/caseclose/work-encourager-open/releases/latest")!
        var request = URLRequest(url: url, cachePolicy: .reloadIgnoringLocalCacheData, timeoutInterval: 15)
        request.setValue("application/vnd.github+json", forHTTPHeaderField: "Accept")
        request.setValue("WorkEncourager/\(version)", forHTTPHeaderField: "User-Agent")
        URLSession.shared.dataTask(with: request) { [weak self] data, response, error in
            DispatchQueue.main.async {
                guard let self else { return }
                self.checkingUpdates = false
                if let error { self.result("checkUpdates", false, "检查失败：\(error.localizedDescription)"); return }
                guard let response = response as? HTTPURLResponse else { self.result("checkUpdates", false, "未收到版本服务器响应。"); return }
                if [403, 429].contains(response.statusCode) {
                    self.checkPublicReleasePage(apiStatus: response.statusCode)
                    return
                }
                if response.statusCode == 404 {
                    self.result("checkUpdates", true, "项目尚未发布可下载版本。", extra: ["updateAvailable": false, "currentVersion": self.version])
                    return
                }
                guard response.statusCode == 200, let data,
                      let release = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any],
                      let latest = release["tag_name"] as? String,
                      let latestParts = Self.numericVersion(latest), latestParts.count == 3,
                      let currentParts = Self.numericVersion(self.version), currentParts.count == 3,
                      let url = release["html_url"] as? String else {
                    self.result("checkUpdates", false, "无法读取版本信息（HTTP \(response.statusCode)）。")
                    return
                }
                self.reportUpdateVersion(latest, url: url)
            }
        }.resume()
    }

    private func exportBackup(_ payload: [String: Any]) {
        guard let text = payload["text"] as? String, let data = text.data(using: .utf8), data.count <= maxBackupBytes,
              (try? JSONSerialization.jsonObject(with: data)) != nil else {
            result("exportBackup", false, "备份需要为有效 JSON，且不超过 15 MB。")
            return
        }
        let panel = NSSavePanel()
        panel.allowedContentTypes = [.json]
        panel.canCreateDirectories = true
        let proposed = (payload["filename"] as? String ?? "work-encourager-backup.json") as NSString
        panel.nameFieldStringValue = String(proposed.lastPathComponent.prefix(120))
        panel.title = "导出上班鼓励器备份"
        popover.performClose(nil)
        NSApp.activate(ignoringOtherApps: true)
        panel.begin { [weak self] response in
            guard let self else { return }
            guard response == .OK, let url = panel.url else { self.result("exportBackup", false, "已取消导出。", extra: ["cancelled": true]); self.showPopover(); return }
            do {
                try data.write(to: url, options: .atomic)
                self.result("exportBackup", true, "备份已导出。")
            } catch { self.result("exportBackup", false, "导出失败：\(error.localizedDescription)") }
            self.showPopover()
        }
    }

    private func importBackup() {
        let panel = NSOpenPanel()
        panel.allowedContentTypes = [.json]
        panel.allowsMultipleSelection = false
        panel.canChooseDirectories = false
        panel.title = "导入上班鼓励器备份"
        popover.performClose(nil)
        NSApp.activate(ignoringOtherApps: true)
        panel.begin { [weak self] response in
            guard let self else { return }
            guard response == .OK, let url = panel.url else { self.result("importBackup", false, "已取消导入。", extra: ["cancelled": true]); self.showPopover(); return }
            do {
                let size = try url.resourceValues(forKeys: [.fileSizeKey]).fileSize ?? self.maxBackupBytes + 1
                guard size <= self.maxBackupBytes else { self.result("importBackup", false, "备份文件不能超过 15 MB。"); self.showPopover(); return }
                let text = try String(contentsOf: url, encoding: .utf8)
                self.webViewController.send(["type": "importBackup", "text": text])
            } catch { self.result("importBackup", false, "读取失败：\(error.localizedDescription)") }
            self.showPopover()
        }
    }

    private func configureStatusButton(title: String) {
        guard let button = statusItem.button else { return }
        let symbol = NSImage.SymbolConfiguration(pointSize: 13.5, weight: .semibold)
        let image = NSImage(systemSymbolName: "yensign.circle.fill", accessibilityDescription: "上班鼓励器")
        if let configured = image?.withSymbolConfiguration(symbol) {
            configured.isTemplate = true
            button.image = configured
            button.imagePosition = .imageLeading
        }
        button.target = self
        button.action = #selector(handleStatusItemClick(_:))
        button.sendAction(on: [.leftMouseUp, .rightMouseUp])
        updateStatusTitle(title)
    }

    private func updateStatusTitle(_ title: String) {
        guard let button = statusItem.button else { return }
        button.attributedTitle = NSAttributedString(string: " " + String(title.prefix(80)), attributes: [
            .font: NSFont.monospacedDigitSystemFont(ofSize: 12.5, weight: .medium), .baselineOffset: -0.3
        ])
    }

    private func applyTheme(_ theme: String?) {
        guard let theme else { return }
        let targetName: NSAppearance.Name = theme == "dark" ? .darkAqua : .aqua
        if popover.appearance?.name != targetName { popover.appearance = NSAppearance(named: targetName) }
        miniWindow?.panel.appearance = NSAppearance(named: targetName)
    }

    private func pollWebViewStatus() {
        let theme = NSApp.effectiveAppearance.bestMatch(from: [.darkAqua, .aqua]) == .darkAqua ? "dark" : "light"
        let script = "window.__setSystemTheme && window.__setSystemTheme('\(theme)'); window.__getMenuBarStatus && window.__getMenuBarStatus()"
        webViewController.webView?.evaluateJavaScript(script) { [weak self] result, _ in
            if let payload = result as? [String: Any] { self?.handleMessage(payload) }
        }
    }

    @objc private func handleStatusItemClick(_ sender: NSStatusBarButton) {
        if let event = NSApp.currentEvent, event.type == .rightMouseUp || event.modifierFlags.contains(.control) { showContextMenu(sender) }
        else { togglePopover(sender) }
    }

    private func showPopover() {
        guard !popover.isShown, let button = statusItem.button else { return }
        pollWebViewStatus()
        NSApp.activate(ignoringOtherApps: true)
        popover.show(relativeTo: button.bounds, of: button, preferredEdge: .minY)
        popover.contentViewController?.view.window?.makeKey()
    }

    @objc private func togglePopover(_ sender: AnyObject?) {
        if popover.isShown { popover.performClose(sender) } else { showPopover() }
    }

    private func showContextMenu(_ sender: NSStatusBarButton) {
        let menu = NSMenu()
        let entries: [(String, Selector, String)] = [
            (popover.isShown ? "收起面板" : "展开面板", #selector(togglePopover(_:)), ""),
            ("隐藏/显示金额", #selector(toggleMask), "h"),
            ("切换深色/浅色模式", #selector(toggleTheme), "t"),
            (miniEnabled ? "关闭迷你窗口" : "显示迷你窗口", #selector(toggleMini), "")
        ]
        for (title, action, key) in entries {
            let item = NSMenuItem(title: title, action: action, keyEquivalent: key)
            item.target = self
            menu.addItem(item)
        }
        menu.addItem(.separator())
        let quit = NSMenuItem(title: "退出上班鼓励器", action: #selector(quitApp), keyEquivalent: "q")
        quit.target = self
        menu.addItem(quit)
        statusItem.menu = menu
        sender.performClick(nil)
        statusItem.menu = nil
    }

    @objc private func toggleMask() {
        webViewController.webView?.evaluateJavaScript("window.__togglePrivacyMask && window.__togglePrivacyMask()") { [weak self] _, _ in self?.pollWebViewStatus() }
    }
    @objc private func toggleTheme() {
        webViewController.webView?.evaluateJavaScript("window.__toggleTheme && window.__toggleTheme()") { [weak self] _, _ in self?.pollWebViewStatus() }
    }
    @objc private func toggleMini() {
        preferences.set(!miniEnabled, forKey: "miniEnabled")
        configureMiniWindow()
        sendState()
    }
    @objc private func quitApp() { NSApp.terminate(nil) }
}

let app = NSApplication.shared
let delegate = AppDelegate()
app.delegate = delegate
app.run()
