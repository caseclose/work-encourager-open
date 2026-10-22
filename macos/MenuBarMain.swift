import Cocoa
import WebKit

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

final class PopoverWebViewController: NSViewController, WKScriptMessageHandler {
    private(set) var webView: WKWebView!
    var onStatusUpdate: ((String, String?) -> Void)?

    override func loadView() {
        let config = WKWebViewConfiguration()
        let contentController = WKUserContentController()
        contentController.add(self, name: "statusBar")
        config.userContentController = contentController

        let webRoot = Bundle.main.resourceURL?.appendingPathComponent("web")
            ?? URL(fileURLWithPath: FileManager.default.currentDirectoryPath)
        config.setURLSchemeHandler(LocalWebSchemeHandler(rootURL: webRoot), forURLScheme: "encourager")

        webView = WKWebView(frame: NSRect(x: 0, y: 0, width: 450, height: 760), configuration: config)
        webView.setValue(false, forKey: "drawsBackground")
        self.view = webView

        let isDarkSystem = NSApp.effectiveAppearance.bestMatch(from: [.darkAqua, .aqua]) == .darkAqua
        let themeParam = isDarkSystem ? "dark" : "light"
        if let startURL = URL(string: "encourager://app/index.html?menubar=1&systemTheme=\(themeParam)") {
            webView.load(URLRequest(url: startURL))
        }
    }

    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        guard let body = message.body as? [String: Any] else { return }
        if let action = body["action"] as? String, action == "quit" {
            NSApp.terminate(nil)
            return
        }
        if let title = body["title"] as? String {
            let theme = body["theme"] as? String
            onStatusUpdate?(title, theme)
        }
    }
}

final class AppDelegate: NSObject, NSApplicationDelegate {
    private var statusItem: NSStatusItem!
    private let popover = NSPopover()
    private let webViewController = PopoverWebViewController()
    private var refreshTimer: Timer?
    private var eventMonitor: Any?

    func applicationDidFinishLaunching(_ notification: Notification) {
        NSApp.setActivationPolicy(.accessory)

        statusItem = NSStatusBar.system.statusItem(withLength: NSStatusItem.variableLength)
        configureStatusButton(title: "已挣 ¥0.00")

        webViewController.onStatusUpdate = { [weak self] title, theme in
            self?.updateStatusTitle(title)
            self?.applyTheme(theme)
        }

        popover.contentSize = NSSize(width: 450, height: 760)
        popover.behavior = .transient
        popover.animates = true
        popover.contentViewController = webViewController

        // Trigger loadView immediately so WKWebView starts calculating right away
        _ = webViewController.view

        refreshTimer = Timer.scheduledTimer(withTimeInterval: 1.0, repeats: true) { [weak self] _ in
            self?.pollWebViewStatus()
        }
        if let refreshTimer {
            RunLoop.main.add(refreshTimer, forMode: .common)
        }

        eventMonitor = NSEvent.addGlobalMonitorForEvents(matching: [.leftMouseDown, .rightMouseDown]) { [weak self] _ in
            guard let self, self.popover.isShown else { return }
            self.popover.performClose(nil)
        }
    }

    private func configureStatusButton(title: String) {
        guard let button = statusItem.button else { return }
        let symbolConfig = NSImage.SymbolConfiguration(pointSize: 13.5, weight: .semibold)
        let image = NSImage(systemSymbolName: "yensign.circle.fill", accessibilityDescription: "上班鼓励器")
            ?? NSImage(systemSymbolName: "dollarsign.circle.fill", accessibilityDescription: "上班鼓励器")
        if let configuredImage = image?.withSymbolConfiguration(symbolConfig) {
            configuredImage.isTemplate = true
            button.image = configuredImage
            button.imagePosition = .imageLeading
        }
        button.target = self
        button.action = #selector(handleStatusItemClick(_:))
        button.sendAction(on: [.leftMouseUp, .rightMouseUp])
        updateStatusTitle(title)
    }

    private func updateStatusTitle(_ title: String) {
        guard let button = statusItem.button else { return }
        let font = NSFont.monospacedDigitSystemFont(ofSize: 12.5, weight: .medium)
        let attributes: [NSAttributedString.Key: Any] = [
            .font: font,
            .baselineOffset: -0.3
        ]
        button.attributedTitle = NSAttributedString(string: " " + title, attributes: attributes)
    }

    private func applyTheme(_ theme: String?) {
        guard let theme else { return }
        let targetName: NSAppearance.Name = (theme == "dark") ? .darkAqua : .aqua
        if popover.appearance?.name != targetName {
            popover.appearance = NSAppearance(named: targetName)
        }
    }

    private func pollWebViewStatus() {
        webViewController.webView?.evaluateJavaScript("window.__getMenuBarStatus && window.__getMenuBarStatus()") { [weak self] result, _ in
            if let dict = result as? [String: Any], let title = dict["title"] as? String {
                self?.updateStatusTitle(title)
                self?.applyTheme(dict["theme"] as? String)
            }
        }
    }

    @objc private func handleStatusItemClick(_ sender: NSStatusBarButton) {
        guard let event = NSApp.currentEvent else {
            togglePopover(sender)
            return
        }
        if event.type == .rightMouseUp || event.modifierFlags.contains(.control) {
            showContextMenu(sender)
        } else {
            togglePopover(sender)
        }
    }

    @objc private func togglePopover(_ sender: AnyObject?) {
        guard let button = statusItem.button else { return }
        if popover.isShown {
            popover.performClose(sender)
        } else {
            pollWebViewStatus()
            NSApp.activate(ignoringOtherApps: true)
            popover.show(relativeTo: button.bounds, of: button, preferredEdge: .minY)
            popover.contentViewController?.view.window?.makeKey()
        }
    }

    private func showContextMenu(_ sender: NSStatusBarButton) {
        let menu = NSMenu()
        let toggleItem = NSMenuItem(
            title: popover.isShown ? "收起面板" : "展开面板",
            action: #selector(togglePopover(_:)),
            keyEquivalent: ""
        )
        toggleItem.target = self
        menu.addItem(toggleItem)

        let maskItem = NSMenuItem(
            title: "隐藏/显示金额",
            action: #selector(toggleMask),
            keyEquivalent: "h"
        )
        maskItem.target = self
        menu.addItem(maskItem)

        let themeItem = NSMenuItem(
            title: "切换深色/浅色模式",
            action: #selector(toggleTheme),
            keyEquivalent: "t"
        )
        themeItem.target = self
        menu.addItem(themeItem)

        menu.addItem(NSMenuItem.separator())
        let quitItem = NSMenuItem(
            title: "退出上班鼓励器",
            action: #selector(quitApp),
            keyEquivalent: "q"
        )
        quitItem.target = self
        menu.addItem(quitItem)
        statusItem.menu = menu
        sender.performClick(nil)
        statusItem.menu = nil
    }

    @objc private func toggleMask() {
        webViewController.webView?.evaluateJavaScript("window.__togglePrivacyMask && window.__togglePrivacyMask()") { [weak self] _, _ in
            self?.pollWebViewStatus()
        }
    }

    @objc private func toggleTheme() {
        webViewController.webView?.evaluateJavaScript("window.__toggleTheme && window.__toggleTheme()") { [weak self] _, _ in
            self?.pollWebViewStatus()
        }
    }

    @objc private func quitApp() {
        NSApp.terminate(nil)
    }
}

let app = NSApplication.shared
let delegate = AppDelegate()
app.delegate = delegate
app.run()
