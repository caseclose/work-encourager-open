using System.Diagnostics;
using System.Text.Json;
using System.Windows.Forms;

namespace WorkEncourager;

/// <summary>
/// The application shell: owns the tray icon, the popup panel and the mini window, and
/// translates the web layer's native actions into Windows behaviour. This type is the
/// counterpart of <c>AppDelegate</c> in MenuBarMain.swift.
/// </summary>
internal sealed class AppHost : ApplicationContext
{
    private readonly NativePreferences _preferences = NativePreferences.Load();
    private readonly PanelWindow _panel;
    private readonly MiniWindow _mini;
    private readonly TrayController _tray;
    private readonly NotificationService _notifications;
    private readonly UpdateChecker _updater;
    private readonly BackupService _backups = new();
    private readonly System.Windows.Forms.Timer _tick;
    private readonly EventWaitHandle _showEvent;
    private readonly Thread _showThread;

    private string _systemTheme;
    private string _webTheme = ThemeHelper.Dark;
    private bool _exiting;

    public AppHost(EventWaitHandle showEvent)
    {
        _showEvent = showEvent;
        AppPaths.EnsureDirectories();
        Log.Info($"启动 {AppInfo.ProductName} {AppInfo.Version}");
        // Older builds stored autostart in HKCU\Run; an elevated app would prompt UAC at logon.
        LaunchAtLogin.MigrateLegacyRegistryEntry();

        _systemTheme = ThemeHelper.CurrentSystemTheme();
        _panel = new PanelWindow(_preferences);
        _panel.MessageReceived += OnWebMessage;
        _panel.HotkeyPressed += TogglePanelFromHotkey;
        _panel.ApplyTheme(_systemTheme);

        _mini = new MiniWindow(_preferences, _systemTheme);
        _mini.OpenRequested += ShowPanel;
        _mini.CloseRequested += OnMiniCloseRequested;

        _tray = new TrayController(this);
        _notifications = new NotificationService(_tray.ShowBalloon);
        _updater = new UpdateChecker(AppInfo.Version);

        _panel.EnsureCreated();
        var hotkeyError = _panel.TrySetHotkey(_preferences.Hotkey);
        if (hotkeyError is not null)
        {
            Log.Error($"恢复全局快捷键失败：{hotkeyError}");
        }

        _showThread = new Thread(WatchShowRequests)
        {
            IsBackground = true,
            Name = "WorkEncourager.ShowPanelWatcher",
        };
        _showThread.Start();

        _tick = new System.Windows.Forms.Timer { Interval = 1000 };
        _tick.Tick += OnTick;
        _tick.Start();

        _mini.ApplyPreferences();
        _ = StartAsync();
    }

    public bool PanelVisible => _panel.PanelVisible;

    public bool MiniEnabled => _preferences.MiniEnabled;

    public bool LaunchAtLoginEnabled => LaunchAtLogin.IsEnabled;

    public bool PrivacyMasked { get; private set; }

    public void SuppressPanelHide() => _panel.SuppressHide(TimeSpan.FromMilliseconds(400));

    public void ShowPanel() => _panel.ShowPanel(anchor: null);

    /// <summary>Tray click: the popup hugs the corner the pointer is in, next to the notification area.</summary>
    public void TogglePanelFromTray() => TogglePanel(Cursor.Position);

    /// <summary>Global hotkey: reopen wherever the panel was last shown.</summary>
    public void TogglePanelFromHotkey() => TogglePanel(anchor: null);

    private void TogglePanel(Point? anchor)
    {
        if (_panel.PanelVisible)
        {
            _panel.HidePanel();
            return;
        }

        SuppressPanelHide();
        _panel.ShowPanel(anchor);
    }

    public void ToggleMask() => _panel.ExecuteWebScript("window.__togglePrivacyMask && window.__togglePrivacyMask()");

    public void ToggleTheme() => _panel.ExecuteWebScript("window.__toggleTheme && window.__toggleTheme()");

    public void ToggleMiniWindow()
    {
        _preferences.MiniEnabled = !_preferences.MiniEnabled;
        _preferences.Save();
        _mini.ApplyPreferences();
        SendState();
    }

    public void ToggleLaunchAtLogin()
    {
        var (ok, message) = LaunchAtLogin.Set(!LaunchAtLogin.IsEnabled);
        if (!ok)
        {
            Log.Error(message);
        }

        SendState();
    }

    public void Quit()
    {
        if (_exiting)
        {
            return;
        }

        _exiting = true;
        Log.Info("退出应用");
        try
        {
            _tick.Stop();
            _preferences.Save();
            _panel.AllowClose();
            _panel.Close();
        }
        catch (Exception ex)
        {
            Log.Error("退出时清理面板失败", ex);
        }

        try
        {
            _tray.Dispose();
        }
        catch (Exception ex)
        {
            Log.Error("退出时释放托盘失败", ex);
        }

        ExitThread();
    }

    protected override void ExitThreadCore()
    {
        base.ExitThreadCore();
        try
        {
            _showEvent.Set();
        }
        catch (Exception)
        {
            // Ignore: the watcher thread is background-only.
        }

        _tick.Dispose();
        SaveWindowPreferences();
        _mini.Dispose();
        _panel.Dispose();
    }

    private async Task StartAsync()
    {
        await _panel.InitializeAsync(_systemTheme).ConfigureAwait(true);
        if (_panel.FailureMessage is { } failure)
        {
            _tray.ShowBalloon("无法加载面板", failure);
        }

        if (!Program.LaunchInTrayOnly)
        {
            ShowPanel();
        }
    }

    private async void OnTick(object? sender, EventArgs e)
    {
        if (_exiting)
        {
            return;
        }

        var theme = ThemeHelper.CurrentSystemTheme();
        if (!string.Equals(theme, _systemTheme, StringComparison.Ordinal))
        {
            _systemTheme = theme;
        }

        var status = await _panel.PollStatusAsync(_systemTheme).ConfigureAwait(true);
        if (status is JsonElement payload && payload.ValueKind == JsonValueKind.Object)
        {
            ApplyStatus(payload);
        }

        WatchPanelFocus();
    }

    /// <summary>
    /// Fallback for the popover contract: the panel must disappear when another application
    /// becomes active. Form.Deactivate covers the normal case; this watchdog also covers
    /// shells where the first activation attempt was refused by the foreground lock.
    /// </summary>
    private void WatchPanelFocus()
    {
        if (!_panel.PanelVisible || _panel.Suppressed || !_panel.CanHideOnFocusLoss)
        {
            return;
        }

        var foreground = NativeMethods.GetForegroundWindow();
        if (foreground == IntPtr.Zero)
        {
            return;
        }

        _ = NativeMethods.GetWindowThreadProcessId(foreground, out var processId);
        if (processId == Environment.ProcessId)
        {
            _panel.MarkForegroundObserved();
            return;
        }

        _panel.HidePanel();
    }

    private void OnWebMessage(JsonElement payload)
    {
        if (payload.ValueKind != JsonValueKind.Object)
        {
            return;
        }

        if (payload.GetStringOrNull("action") is { Length: > 0 } action)
        {
            HandleAction(action, payload);
            return;
        }

        ApplyStatus(payload);
    }

    private void ApplyStatus(JsonElement payload)
    {
        PrivacyMasked = payload.GetBoolOrNull("masked") ?? PrivacyMasked;
        _tray.SetStatus(payload.GetStringOrNull("title"), PrivacyMasked);

        var theme = payload.GetStringOrNull("theme");
        if (theme is "dark" or "light" && !string.Equals(theme, _webTheme, StringComparison.Ordinal))
        {
            _webTheme = theme;
            _mini.SetTheme(theme);
            _panel.ApplyTheme(theme);
        }

        if (payload.GetObjectOrNull("mini") is JsonElement mini)
        {
            _mini.Update(
                mini.GetStringOrNull("emoji") ?? "¥",
                mini.GetStringOrNull("title") ?? string.Empty,
                mini.GetStringOrNull("detail") ?? string.Empty,
                mini.GetDoubleOrNull("progress") ?? 0);
        }
    }

    private void HandleAction(string action, JsonElement payload)
    {
        try
        {
            switch (action)
            {
                case "quit":
                    Quit();
                    break;

                case "nativeState":
                    _notifications.RefreshStatus();
                    SendState();
                    break;

                case "setLaunchAtLogin":
                {
                    // macOS guards on a present Bool and returns without a result; mirror that.
                    if (payload.GetBoolOrNull("enabled") is not bool enabled)
                    {
                        break;
                    }

                    var (ok, message) = LaunchAtLogin.Set(enabled);
                    SendResult(action, ok, message);
                    SendState();
                    break;
                }

                case "setHotkey":
                {
                    var value = payload.GetStringOrNull("value");
                    if (value is not ("none" or "cmdShiftE" or "ctrlAltE"))
                    {
                        SendResult(action, false, "未知的快捷键选项。");
                        SendState();
                        break;
                    }

                    var error = _panel.TrySetHotkey(value);
                    if (error is null)
                    {
                        _preferences.Hotkey = _panel.CurrentHotkey;
                        _preferences.Save();
                    }

                    SendResult(
                        action,
                        error is null,
                        error ?? (value == "none" ? "全局快捷键已关闭。" : "全局快捷键已设置。"));
                    SendState();
                    break;
                }

                case "setMiniWindow":
                {
                    if (payload.GetBoolOrNull("enabled") is bool enabled)
                    {
                        _preferences.MiniEnabled = enabled;
                    }

                    if (payload.GetBoolOrNull("pinned") is bool pinned)
                    {
                        _preferences.MiniPinned = pinned;
                    }

                    if (payload.GetDoubleOrNull("opacity") is double opacity)
                    {
                        _preferences.MiniOpacity = Math.Clamp(opacity, 0.35, 1.0);
                    }

                    _preferences.Save();
                    _mini.ApplyPreferences();
                    SendResult(action, true, _preferences.MiniEnabled ? "迷你窗口已更新。" : "迷你窗口已关闭。");
                    SendState();
                    break;
                }

                case "requestNotifications":
                {
                    var (ok, message) = _notifications.RequestAuthorization();
                    SendResult(action, ok, message);
                    SendState();
                    break;
                }

                case "notify":
                {
                    var outcome = _notifications.Notify(
                        payload.GetStringOrNull("title"),
                        payload.GetStringOrNull("body"),
                        payload.GetBoolOrNull("sound") ?? false);
                    if (outcome is { } result)
                    {
                        SendResult(action, result.Ok, result.Message);
                    }

                    break;
                }

                case "checkUpdates":
                    _ = CheckUpdatesAsync();
                    break;

                case "openRelease":
                    OpenRelease(payload);
                    break;

                case "exportBackup":
                    ExportBackup(payload);
                    break;

                case "importBackup":
                    ImportBackup();
                    break;

                default:
                    SendResult(action, false, "不支持的原生操作。");
                    break;
            }
        }
        catch (Exception ex)
        {
            Log.Error($"处理原生动作 {action} 失败", ex);
            SendResult(action, false, $"操作失败：{ex.Message}");
        }
    }

    private async Task CheckUpdatesAsync()
    {
        var result = await _updater.CheckAsync().ConfigureAwait(true);
        var extra = new Dictionary<string, object?>();
        if (result.UpdateAvailable is bool updateAvailable)
        {
            extra["updateAvailable"] = updateAvailable;
        }

        if (result.LatestVersion is not null)
        {
            extra["latestVersion"] = result.LatestVersion;
        }

        if (result.CurrentVersion is not null)
        {
            extra["currentVersion"] = result.CurrentVersion;
        }

        if (result.Url is not null)
        {
            extra["url"] = result.Url;
        }

        SendResult("checkUpdates", result.Ok, result.Message, extra);
    }

    private void OpenRelease(JsonElement payload)
    {
        if (!TryValidateReleaseUrl(payload.GetStringOrNull("url"), out var uri))
        {
            SendResult("openRelease", false, "无效的版本页面地址。");
            return;
        }

        try
        {
            Process.Start(new ProcessStartInfo(uri!.AbsoluteUri) { UseShellExecute = true });
            SendResult("openRelease", true, "已打开版本发布页。");
        }
        catch (Exception ex)
        {
            Log.Error("打开版本发布页失败", ex);
            SendResult("openRelease", false, "无法打开版本发布页。");
        }
    }

    private void ExportBackup(JsonElement payload)
    {
        var text = payload.GetStringOrNull("text");
        var filename = payload.GetStringOrNull("filename");
        var result = _panel.RunModal(() => _backups.Export(text, filename, _panel));
        SendResult("exportBackup", result.Ok, result.Message, CancelledFlag(result));
    }

    private void ImportBackup()
    {
        var (result, text) = _panel.RunModal(() => _backups.Import(_panel));
        if (result.Ok && text is not null)
        {
            _panel.SendEvent(new Dictionary<string, object?>
            {
                ["type"] = "importBackup",
                ["text"] = text,
            });
            return;
        }

        SendResult("importBackup", result.Ok, result.Message, CancelledFlag(result));
    }

    private void OnMiniCloseRequested()
    {
        _preferences.MiniEnabled = false;
        _preferences.Save();
        _mini.ApplyPreferences();
        SendState();
    }

    private void SendResult(string action, bool ok, string message, IDictionary<string, object?>? extra = null)
    {
        var payload = new Dictionary<string, object?>
        {
            ["type"] = "result",
            ["action"] = action,
            ["ok"] = ok,
            ["message"] = message,
        };
        if (extra is not null)
        {
            foreach (var pair in extra)
            {
                if (!payload.ContainsKey(pair.Key))
                {
                    payload[pair.Key] = pair.Value;
                }
            }
        }

        _panel.SendEvent(payload);
    }

    private void SendState()
    {
        _panel.SendEvent(new Dictionary<string, object?>
        {
            ["type"] = "state",
            ["launchAtLogin"] = LaunchAtLogin.IsEnabled,
            ["launchAtLoginStatus"] = LaunchAtLogin.Status,
            ["hotkey"] = _panel.CurrentHotkey,
            ["miniEnabled"] = _preferences.MiniEnabled,
            ["miniPinned"] = _preferences.MiniPinned,
            ["miniOpacity"] = _preferences.ClampedOpacity,
            ["notifications"] = _notifications.Status,
            ["version"] = AppInfo.Version,
        });
    }

    private void WatchShowRequests()
    {
        while (true)
        {
            try
            {
                if (!_showEvent.WaitOne())
                {
                    return;
                }
            }
            catch (ObjectDisposedException)
            {
                return;
            }

            if (_exiting)
            {
                return;
            }

            try
            {
                if (_panel.IsHandleCreated)
                {
                    _panel.BeginInvoke(new Action(ShowPanel));
                }
            }
            catch (Exception ex) when (ex is InvalidOperationException or ObjectDisposedException)
            {
                // The panel is between handles or shutting down; the next request will succeed.
            }
        }
    }

    private void SaveWindowPreferences()
    {
        try
        {
            _preferences.Save();
        }
        catch (Exception ex)
        {
            Log.Error("保存原生偏好失败", ex);
        }
    }

    private static Dictionary<string, object?>? CancelledFlag(BackupResult result)
        => result.Cancelled ? new Dictionary<string, object?> { ["cancelled"] = true } : null;

    private static bool TryValidateReleaseUrl(string? url, out Uri? uri)
    {
        uri = null;
        if (string.IsNullOrWhiteSpace(url)
            || !Uri.TryCreate(url, UriKind.Absolute, out var parsed)
            || parsed.Scheme != Uri.UriSchemeHttps
            || !string.Equals(parsed.Host, "github.com", StringComparison.OrdinalIgnoreCase)
            || !parsed.AbsolutePath.StartsWith("/caseclose/work-encourager-open/releases", StringComparison.Ordinal))
        {
            return false;
        }

        uri = parsed;
        return true;
    }
}
