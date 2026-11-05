using System.Diagnostics;
using System.Drawing;
using System.Runtime.InteropServices;
using System.Text.Json;
using System.Windows.Forms;
using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.WinForms;

namespace WorkEncourager;

/// <summary>
/// The tray popup: a borderless always-on-top window that hosts the unchanged web app in
/// WebView2. This is the Windows counterpart of the macOS shell's NSPopover + WKWebView.
///
/// The web layer detects a native shell through <c>window.webkit.messageHandlers.statusBar</c>
/// (the WKWebView bridge) and drives every native action through it. The injected bridge
/// script below re-creates that same object on top of WebView2's web-message channel, so
/// app.js / feature-ui.js run unmodified.
/// </summary>
internal sealed class PanelWindow : Form
{
    private const int BaseWidth = 450;
    private const int BaseHeight = 760;
    private const int HotkeyIdA = 1;
    private const int HotkeyIdB = 2;
    private const string VirtualHost = "work-encourager.local";

    private const string BridgeScript =
        """
        (function () {
          if (!window.chrome || !window.chrome.webview) { return; }
          var statusBar = { postMessage: function (message) { window.chrome.webview.postMessage(message); } };
          var handlers = { statusBar: statusBar };
          try {
            if (window.webkit && window.webkit.messageHandlers) {
              window.webkit.messageHandlers.statusBar = statusBar;
            } else {
              window.webkit = { messageHandlers: handlers };
            }
          } catch (error) {
            try {
              Object.defineProperty(window, 'webkit', { configurable: true, value: { messageHandlers: handlers } });
            } catch (ignored) { }
          }
        })();
        """;

    private readonly NativePreferences _preferences;
    private readonly WebView2 _webView;
    private readonly Label _loadingLabel;
    private readonly Queue<string> _pendingEvents = new();

    private bool _webReady;
    private bool _initializing;
    private bool _suppressHide;
    private DateTime _suppressHideUntil = DateTime.MinValue;
    private bool _polling;
    private bool _allowClose;
    private int _activeHotkeyId = HotkeyIdA;
    private bool _hotkeyRegistered;
    private string _systemTheme = ThemeHelper.Dark;
    private string _panelTheme = ThemeHelper.Dark;

    /// <summary>Set once the popup has really been the active window at least once.</summary>
    private bool _foregroundObserved;

    private DateTime _shownAt = DateTime.MinValue;

    public PanelWindow(NativePreferences preferences)
    {
        _preferences = preferences;
        Text = AppInfo.ProductName;
        FormBorderStyle = FormBorderStyle.None;
        ShowInTaskbar = false;
        StartPosition = FormStartPosition.Manual;
        TopMost = true;
        AutoScaleMode = AutoScaleMode.None;
        DoubleBuffered = true;
        Padding = new Padding(1);
        BackColor = BorderColor(ThemeHelper.Dark);
        Size = new Size(ToPx(BaseWidth), ToPx(BaseHeight));

        _webView = new WebView2
        {
            Dock = DockStyle.Fill,
            DefaultBackgroundColor = Color.Transparent,
            TabStop = false,
        };
        Controls.Add(_webView);

        _loadingLabel = new Label
        {
            Dock = DockStyle.Fill,
            Text = "正在加载…",
            TextAlign = ContentAlignment.MiddleCenter,
            ForeColor = Color.FromArgb(0xB9, 0xA9, 0x92),
            BackColor = Color.Transparent,
            Font = new Font("Microsoft YaHei UI", 10.5f),
        };
        Controls.Add(_loadingLabel);
        _loadingLabel.BringToFront();
    }

    public event Action<JsonElement>? MessageReceived;

    public event Action? HotkeyPressed;

    public string CurrentHotkey { get; private set; } = "none";

    public bool PanelVisible => Visible;

    public string? FailureMessage { get; private set; }

    /// <summary>Maps the web's shortcut vocabulary onto Windows modifiers, keeping ⌘⇧E → Ctrl+Shift+E.</summary>
    public static (uint Modifiers, uint VirtualKey) HotkeyBinding(string value) => value switch
    {
        "cmdShiftE" => (NativeMethods.MOD_CONTROL | NativeMethods.MOD_SHIFT, NativeMethods.VK_E),
        _ => (NativeMethods.MOD_CONTROL | NativeMethods.MOD_ALT, NativeMethods.VK_E),
    };

    public bool Suppressed => _suppressHide || DateTime.UtcNow < _suppressHideUntil;

    public void EnsureCreated()
    {
        _ = Handle;
    }

    public int ToPx(float value) => (int)Math.Round(value * DeviceDpi / 96f);

    public async Task InitializeAsync(string systemTheme)
    {
        _systemTheme = systemTheme;
        if (_webReady || _initializing)
        {
            return;
        }

        _initializing = true;
        try
        {
            if (!Directory.Exists(AppPaths.WebRoot))
            {
                Fail("找不到 web 资源目录，请重新安装或从源码构建。");
                return;
            }

            // The app keeps counting while the panel is hidden in the tray: the web layer must
            // keep its timers running for pomodoro stages and reminders.
            var browserArguments =
                "--disable-background-timer-throttling " +
                "--disable-renderer-backgrounding " +
                "--disable-backgrounding-occluded-windows " +
                "--disable-features=CalculateNativeWinOcclusion";

            // Developer hook (never used in normal runs): expose a CDP endpoint so automated
            // UI verification can drive the panel from outside the process.
            if (int.TryParse(Environment.GetEnvironmentVariable("WORK_ENCOURAGER_CDP_PORT"), out var cdpPort)
                && cdpPort is > 1024 and < 65536)
            {
                browserArguments += $" --remote-debugging-port={cdpPort}";
            }

            var options = new CoreWebView2EnvironmentOptions
            {
                AdditionalBrowserArguments = browserArguments,
            };

            var environment = await CoreWebView2Environment
                .CreateAsync(browserExecutableFolder: null, userDataFolder: AppPaths.WebView2Data, options)
                .ConfigureAwait(true);
            await _webView.EnsureCoreWebView2Async(environment).ConfigureAwait(true);

            var core = _webView.CoreWebView2;
            core.Settings.AreDevToolsEnabled = Program.DevToolsEnabled;
            core.Settings.IsStatusBarEnabled = false;
            core.Settings.IsZoomControlEnabled = false;
            core.Settings.AreDefaultContextMenusEnabled = true;
            core.Settings.AreBrowserAcceleratorKeysEnabled = false;
            core.SetVirtualHostNameToFolderMapping(VirtualHost, AppPaths.WebRoot, CoreWebView2HostResourceAccessKind.Allow);
            await core.AddScriptToExecuteOnDocumentCreatedAsync(BridgeScript).ConfigureAwait(true);

            core.WebMessageReceived += OnWebMessageReceived;
            core.NavigationCompleted += OnNavigationCompleted;
            core.ProcessFailed += OnProcessFailed;
            core.NewWindowRequested += OnNewWindowRequested;

            var theme = _systemTheme is "light" ? "light" : "dark";
            core.Navigate($"https://{VirtualHost}/index.html?menubar=1&systemTheme={theme}");
        }
        catch (WebView2RuntimeNotFoundException ex)
        {
            Fail("未找到 Microsoft Edge WebView2 运行时，请安装后重试：https://go.microsoft.com/fwlink/p/?LinkId=2124703", ex);
        }
        catch (Exception ex)
        {
            Fail($"面板初始化失败：{ex.Message}", ex);
        }
        finally
        {
            _initializing = false;
        }
    }

    /// <param name="anchor">
    /// Screen point the popup should hug (a tray click). Null means "open where the panel was
    /// last shown", which is what the global hotkey and a second launch use.
    /// </param>
    public void ShowPanel(Point? anchor)
    {
        if (IsDisposed)
        {
            return;
        }

        SuppressHide(TimeSpan.FromMilliseconds(300));
        PositionPanel(anchor);
        Show();
        _shownAt = DateTime.UtcNow;
        NativeMethods.ForceForegroundWindow(Handle);
        Activate();
        _webView.Focus();

        // A tray popup opened from a background context can lose the first foreground attempt to
        // the Windows foreground lock; retry once after the window is actually on screen.
        BeginInvoke(new Action(() =>
        {
            if (Visible && !_foregroundObserved)
            {
                NativeMethods.ForceForegroundWindow(Handle);
                Activate();
            }
        }));

        RememberPanelPosition();
    }

    /// <summary>
    /// The shell may hide the popup on focus loss only after it has been foreground once, or after
    /// a short grace period — otherwise a refused foreground activation makes it flash and vanish.
    /// </summary>
    public bool CanHideOnFocusLoss
        => IsHandleCreated && (_foregroundObserved || DateTime.UtcNow - _shownAt > TimeSpan.FromMilliseconds(2500));

    public void MarkForegroundObserved() => _foregroundObserved = true;

    public void HidePanel()
    {
        if (Visible)
        {
            Hide();
        }
    }

    public void SuppressHide(TimeSpan duration) => _suppressHideUntil = DateTime.UtcNow.Add(duration);

    /// <summary>Keeps the popup visible while a modal native dialog (backup import/export) is open.</summary>
    public T RunModal<T>(Func<T> action)
    {
        _suppressHide = true;
        try
        {
            return action();
        }
        finally
        {
            _suppressHide = false;
            SuppressHide(TimeSpan.FromMilliseconds(250));
        }
    }

    public void AllowClose() => _allowClose = true;

    public void ApplyTheme(string theme)
    {
        if (theme is not ("dark" or "light"))
        {
            return;
        }

        _panelTheme = theme;
        BackColor = BorderColor(theme);
        _loadingLabel.ForeColor = theme == "light"
            ? Color.FromArgb(0x7C, 0x6A, 0x58)
            : Color.FromArgb(0xB9, 0xA9, 0x92);
    }

    public void SendEvent(object payload) => SendEventJson(BridgeJson.Serialize(payload));

    public void SendEventJson(string json)
    {
        if (IsDisposed)
        {
            return;
        }

        if (InvokeRequired)
        {
            try
            {
                BeginInvoke(new Action(() => SendEventJson(json)));
            }
            catch (Exception ex) when (ex is InvalidOperationException or ObjectDisposedException)
            {
                // Window is being torn down.
            }

            return;
        }

        if (!_webReady)
        {
            if (_pendingEvents.Count < 64)
            {
                _pendingEvents.Enqueue(json);
            }

            return;
        }

        _ = RunScriptAsync($"window.__nativeEvent && window.__nativeEvent({json})");
    }

    public void ExecuteWebScript(string script)
    {
        if (InvokeRequired)
        {
            try
            {
                BeginInvoke(new Action(() => ExecuteWebScript(script)));
            }
            catch (Exception ex) when (ex is InvalidOperationException or ObjectDisposedException)
            {
                // Window is being torn down.
            }

            return;
        }

        if (_webReady)
        {
            _ = RunScriptAsync(script);
        }
    }

    /// <summary>Fetches the native status payload from the web layer; also syncs the system theme.</summary>
    public async Task<JsonElement?> PollStatusAsync(string systemTheme)
    {
        if (!_webReady || _polling)
        {
            return null;
        }

        _polling = true;
        try
        {
            _systemTheme = systemTheme;
            var script =
                $"window.__setSystemTheme && window.__setSystemTheme('{systemTheme}'); " +
                "window.__getMenuBarStatus && window.__getMenuBarStatus()";
            var raw = await _webView.ExecuteScriptAsync(script).ConfigureAwait(true);
            if (string.IsNullOrEmpty(raw) || raw == "null")
            {
                return null;
            }

            using var document = JsonDocument.Parse(raw);
            return document.RootElement.Clone();
        }
        catch (Exception ex)
        {
            // A navigation or shutdown can invalidate the script channel between ticks; polling
            // is best-effort and must never take the shell down.
            Log.Error("轮询面板状态失败", ex);
            return null;
        }
        finally
        {
            _polling = false;
        }
    }

    /// <summary>Registers a global shortcut. Returns an error message, or null on success.</summary>
    public string? TrySetHotkey(string value)
    {
        var normalized = NativePreferences.NormalizeHotkey(value);
        if (normalized == CurrentHotkey)
        {
            return null;
        }

        EnsureCreated();

        if (normalized == "none")
        {
            UnregisterHotkey();
            CurrentHotkey = "none";
            return null;
        }

        var candidateId = _activeHotkeyId == HotkeyIdA ? HotkeyIdB : HotkeyIdA;
        var (modifiers, virtualKey) = HotkeyBinding(normalized);
        if (!NativeMethods.RegisterHotKey(Handle, candidateId, modifiers | NativeMethods.MOD_NOREPEAT, virtualKey))
        {
            var error = Marshal.GetLastWin32Error();
            Log.Error($"注册全局快捷键 {normalized} 失败，Win32 错误 {error}");
            return $"快捷键被其他应用占用或注册失败（{error}），原快捷键保持不变。";
        }

        UnregisterHotkey();
        _activeHotkeyId = candidateId;
        _hotkeyRegistered = true;
        CurrentHotkey = normalized;
        return null;
    }

    protected override CreateParams CreateParams
    {
        get
        {
            var parameters = base.CreateParams;
            parameters.ExStyle |= NativeMethods.WS_EX_TOOLWINDOW;
            parameters.ClassStyle |= NativeMethods.CS_DROPSHADOW;
            return parameters;
        }
    }

    protected override void OnHandleCreated(EventArgs e)
    {
        base.OnHandleCreated(e);
        NativeMethods.ApplyRoundedCorners(Handle);
    }

    protected override void OnActivated(EventArgs e)
    {
        base.OnActivated(e);
        _foregroundObserved = true;
    }

    protected override void OnDeactivate(EventArgs e)
    {
        base.OnDeactivate(e);
        if (_allowClose || Suppressed)
        {
            return;
        }

        HidePanel();
    }

    protected override void OnFormClosing(FormClosingEventArgs e)
    {
        // Shutdown/logoff and the task manager must be able to close us; only the user's own
        // close gesture should collapse the popup into the tray.
        if (!_allowClose
            && e.CloseReason is not (CloseReason.WindowsShutDown or CloseReason.TaskManagerClosing or CloseReason.ApplicationExitCall))
        {
            e.Cancel = true;
            Hide();
        }

        base.OnFormClosing(e);
    }

    protected override void WndProc(ref Message m)
    {
        if (m.Msg == NativeMethods.WM_HOTKEY)
        {
            HotkeyPressed?.Invoke();
            return;
        }

        base.WndProc(ref m);
    }

    protected override void Dispose(bool disposing)
    {
        if (disposing)
        {
            UnregisterHotkey();
            _webView.Dispose();
        }

        base.Dispose(disposing);
    }

    private void UnregisterHotkey()
    {
        if (_hotkeyRegistered)
        {
            _ = NativeMethods.UnregisterHotKey(Handle, _activeHotkeyId);
            _hotkeyRegistered = false;
        }
    }

    private async Task RunScriptAsync(string script)
    {
        try
        {
            await _webView.ExecuteScriptAsync(script).ConfigureAwait(true);
        }
        catch (Exception ex) when (ex is InvalidOperationException or ObjectDisposedException or COMException)
        {
            Log.Error("执行面板脚本失败", ex);
        }
    }

    private void OnWebMessageReceived(object? sender, CoreWebView2WebMessageReceivedEventArgs e)
    {
        try
        {
            var payload = BridgeJson.TryParse(e.WebMessageAsJson);
            if (payload is not JsonElement element)
            {
                return;
            }

            // Never dispatch straight from the WebView2 callback: actions may open modal native
            // dialogs or tear the WebView down, and WebView2 does not support nested message loops
            // or reentrancy inside its event handlers. Post the work to the next message-loop turn.
            if (InvokeRequired)
            {
                BeginInvoke(new Action(() => DispatchMessage(element)));
            }
            else
            {
                BeginInvoke(new Action(() => DispatchMessage(element)));
            }
        }
        catch (Exception ex) when (ex is InvalidOperationException or ObjectDisposedException)
        {
            // The window is being torn down; the message is no longer interesting.
        }
        catch (Exception ex)
        {
            Log.Error("处理网页消息失败", ex);
        }
    }

    private void DispatchMessage(JsonElement payload)
    {
        if (IsDisposed)
        {
            return;
        }

        try
        {
            MessageReceived?.Invoke(payload);
        }
        catch (Exception ex)
        {
            Log.Error("处理网页消息失败", ex);
        }
    }

    private void OnNavigationCompleted(object? sender, CoreWebView2NavigationCompletedEventArgs e)
    {
        if (!e.IsSuccess)
        {
            if (!_webReady)
            {
                Fail($"面板加载失败：{e.WebErrorStatus}");
            }

            return;
        }

        _webReady = true;
        FailureMessage = null;
        _loadingLabel.Visible = false;
        Log.Info("面板已加载");
        while (_pendingEvents.Count > 0)
        {
            SendEventJson(_pendingEvents.Dequeue());
        }
    }

    private void OnProcessFailed(object? sender, CoreWebView2ProcessFailedEventArgs e)
    {
        Log.Error($"面板渲染进程异常：{e.ProcessFailedKind}");
        _webReady = false;

        // Recover even while the popup is hidden in the tray: otherwise the tray tooltip and the
        // mini window freeze forever and the next open shows a blank panel.
        if (IsDisposed)
        {
            return;
        }

        _loadingLabel.Text = "面板需要重新加载…";
        _loadingLabel.Visible = true;
        try
        {
            _webView.Reload();
        }
        catch (Exception ex)
        {
            Log.Error("重新加载面板失败", ex);
        }
    }

    /// <summary>
    /// target="_blank" links (the app's "project" / "contributors" links) must open in the
    /// default browser, exactly like WKUIDelegate.createWebViewWith does on macOS — otherwise
    /// WebView2 pops an in-app window and the popup loses focus.
    /// </summary>
    private void OnNewWindowRequested(object? sender, CoreWebView2NewWindowRequestedEventArgs e)
    {
        e.Handled = true;
        if (!Uri.TryCreate(e.Uri, UriKind.Absolute, out var uri)
            || (uri.Scheme != Uri.UriSchemeHttps && uri.Scheme != Uri.UriSchemeHttp))
        {
            return;
        }

        try
        {
            Process.Start(new ProcessStartInfo(uri.AbsoluteUri) { UseShellExecute = true });
            Log.Info($"在默认浏览器中打开：{uri.AbsoluteUri}");
        }
        catch (Exception ex)
        {
            Log.Error($"打开外部链接失败：{uri.AbsoluteUri}", ex);
        }
    }

    private void Fail(string message, Exception? exception = null)
    {
        FailureMessage = message;
        _webReady = false;
        if (exception is null)
        {
            Log.Error(message);
        }
        else
        {
            Log.Error(message, exception);
        }

        if (!IsDisposed)
        {
            _loadingLabel.Text = message;
            _loadingLabel.Visible = true;
        }
    }

    private void PositionPanel(Point? anchor)
    {
        var border = Padding.Left + Padding.Right;
        var margin = ToPx(8);

        var screen = anchor is Point anchorPoint
            ? Screen.FromPoint(anchorPoint)
            : Screen.FromPoint(Cursor.Position);
        var workArea = screen.WorkingArea;
        var height = Math.Min(ToPx(BaseHeight), Math.Max(ToPx(320), workArea.Height - margin * 2));
        ClientSize = new Size(ToPx(BaseWidth) + border, height + border);

        if (anchor is not Point point)
        {
            // Programmatic open: reuse the remembered spot when it is still on a screen.
            if (_preferences.PanelX is int savedX && _preferences.PanelY is int savedY)
            {
                var remembered = new Rectangle(new Point(savedX, savedY), Size);
                if (Screen.AllScreens.Any(candidate => candidate.WorkingArea.IntersectsWith(remembered)))
                {
                    Location = ClampToWorkArea(new Point(savedX, savedY), workArea);
                    Log.Info($"显示面板（记住位置 {Location.X},{Location.Y} {Width}x{Height} dpi={DeviceDpi}）");
                    return;
                }
            }

            // First programmatic open: tuck it into the corner where the tray usually lives.
            Location = new Point(
                Math.Max(workArea.Left, workArea.Right - Width - margin),
                Math.Max(workArea.Top, workArea.Bottom - Height - margin));
            Log.Info($"显示面板（默认位置 {Location.X},{Location.Y} {Width}x{Height} dpi={DeviceDpi}）");
            return;
        }

        var alignRight = point.X >= workArea.Left + workArea.Width / 2;
        var alignBottom = point.Y >= workArea.Top + workArea.Height / 2;
        var x = alignRight ? workArea.Right - Width - margin : workArea.Left + margin;
        var y = alignBottom ? workArea.Bottom - Height - margin : workArea.Top + margin;
        Location = ClampToWorkArea(new Point(x, y), workArea);
        Log.Info($"显示面板（光标位置 {Location.X},{Location.Y} {Width}x{Height} dpi={DeviceDpi}）");
    }

    private Point ClampToWorkArea(Point location, Rectangle workArea)
    {
        var x = Math.Clamp(location.X, workArea.Left, Math.Max(workArea.Left, workArea.Right - Width));
        var y = Math.Clamp(location.Y, workArea.Top, Math.Max(workArea.Top, workArea.Bottom - Height));
        return new Point(x, y);
    }

    private void RememberPanelPosition()
    {
        if (_preferences.PanelX == Location.X && _preferences.PanelY == Location.Y)
        {
            return;
        }

        _preferences.PanelX = Location.X;
        _preferences.PanelY = Location.Y;
        _preferences.Save();
    }

    private static Color BorderColor(string theme) => theme == "light"
        ? Color.FromArgb(0xE2, 0xD3, 0xBE)
        : Color.FromArgb(0x3A, 0x2F, 0x26);
}
