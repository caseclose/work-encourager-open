using System.Drawing;
using System.Windows.Forms;

namespace WorkEncourager;

/// <summary>
/// The tray icon: Windows' equivalent of the macOS NSStatusItem. macOS can print the live
/// amount into the menu bar; the Windows notification area only exposes a tooltip, so the
/// status line lives in the tooltip and the icon switches to its masked variant while the
/// privacy mask is on. (The always-visible amount is the mini window's job on Windows.)
/// </summary>
internal sealed class TrayController : IDisposable
{
    private const int TooltipLimit = 63;

    private readonly AppHost _host;
    private readonly NotifyIcon _notifyIcon;
    private readonly ContextMenuStrip _menu;
    private readonly ToolStripMenuItem _panelItem;
    private readonly ToolStripMenuItem _maskItem;
    private readonly ToolStripMenuItem _themeItem;
    private readonly ToolStripMenuItem _miniItem;
    private readonly ToolStripMenuItem _launchItem;
    private readonly Icon _normalIcon;
    private readonly Icon _maskedIcon;
    private readonly bool _ownsNormalIcon;
    private readonly bool _ownsMaskedIcon;

    private string _lastText = string.Empty;
    private bool _masked;
    private bool _disposed;

    public TrayController(AppHost host)
    {
        _host = host;
        _normalIcon = LoadIcon("app.ico", out _ownsNormalIcon);
        _maskedIcon = LoadIcon("app-masked.ico", out _ownsMaskedIcon);

        _panelItem = new ToolStripMenuItem("展开面板");
        _panelItem.Click += (_, _) => _host.TogglePanelFromTray();

        _maskItem = new ToolStripMenuItem("隐藏金额");
        _maskItem.Click += (_, _) => _host.ToggleMask();

        _themeItem = new ToolStripMenuItem("切换深色/浅色模式");
        _themeItem.Click += (_, _) => _host.ToggleTheme();

        _miniItem = new ToolStripMenuItem("显示迷你窗口");
        _miniItem.Click += (_, _) => _host.ToggleMiniWindow();

        _launchItem = new ToolStripMenuItem("开机自动启动");
        _launchItem.Click += (_, _) => _host.ToggleLaunchAtLogin();

        var quitItem = new ToolStripMenuItem("退出上班鼓励器");
        quitItem.Click += (_, _) => _host.Quit();

        _menu = new ContextMenuStrip();
        _menu.Items.AddRange(new ToolStripItem[]
        {
            _panelItem,
            _maskItem,
            _themeItem,
            _miniItem,
            new ToolStripSeparator(),
            _launchItem,
            new ToolStripSeparator(),
            quitItem,
        });
        _menu.Opening += (_, _) => UpdateMenuState();

        _notifyIcon = new NotifyIcon
        {
            Icon = _normalIcon,
            // macOS shows "已挣 ¥0.00" from the very first frame; keep the same initial text.
            Text = "已挣 ¥0.00",
            Visible = true,
            ContextMenuStrip = _menu,
        };
        _notifyIcon.MouseDown += OnMouseDown;
        _notifyIcon.MouseClick += OnMouseClick;
        _notifyIcon.DoubleClick += (_, _) => _host.ShowPanel();
    }

    public void SetStatus(string? title, bool masked)
    {
        if (_disposed)
        {
            return;
        }

        _masked = masked;
        var text = string.IsNullOrWhiteSpace(title) ? AppInfo.ProductName : title.Trim();
        text = TextUtil.TruncateWithEllipsis(text, TooltipLimit);

        if (!string.Equals(text, _lastText, StringComparison.Ordinal))
        {
            _lastText = text;
            try
            {
                _notifyIcon.Text = text;
            }
            catch (ArgumentException ex)
            {
                // Defensive: some shells reject long tooltips; keep the previous text.
                Log.Error($"设置托盘提示失败：{text}", ex);
            }
        }

        var target = masked ? _maskedIcon : _normalIcon;
        if (!ReferenceEquals(_notifyIcon.Icon, target))
        {
            _notifyIcon.Icon = target;
        }
    }

    public void ShowBalloon(string title, string body)
    {
        if (_disposed)
        {
            return;
        }

        try
        {
            _notifyIcon.ShowBalloonTip(6000, title, body, ToolTipIcon.None);
        }
        catch (Exception ex)
        {
            Log.Error("显示系统提醒失败", ex);
        }
    }

    public void Dispose()
    {
        if (_disposed)
        {
            return;
        }

        _disposed = true;
        _notifyIcon.Visible = false;
        _notifyIcon.Dispose();
        _menu.Dispose();
        if (_ownsNormalIcon)
        {
            _normalIcon.Dispose();
        }

        if (_ownsMaskedIcon)
        {
            _maskedIcon.Dispose();
        }
    }

    private void OnMouseDown(object? sender, MouseEventArgs e)
    {
        // Clicking the tray icon deactivates the popup; suppress the hide-on-blur so the
        // click handler can toggle it explicitly instead of it closing and reopening.
        if (e.Button == MouseButtons.Left)
        {
            _host.SuppressPanelHide();
        }
    }

    private void OnMouseClick(object? sender, MouseEventArgs e)
    {
        if (e.Button == MouseButtons.Left)
        {
            _host.TogglePanelFromTray();
        }
    }

    private void UpdateMenuState()
    {
        _panelItem.Text = _host.PanelVisible ? "收起面板" : "展开面板";
        _maskItem.Text = _host.PrivacyMasked || _masked ? "显示金额" : "隐藏金额";
        _miniItem.Text = _host.MiniEnabled ? "关闭迷你窗口" : "显示迷你窗口";
        _launchItem.Checked = _host.LaunchAtLoginEnabled;
    }

    private static Icon LoadIcon(string fileName, out bool owned)
    {
        var path = Path.Combine(AppPaths.AssetsRoot, fileName);
        try
        {
            if (File.Exists(path))
            {
                owned = true;
                return new Icon(path, SystemInformation.SmallIconSize);
            }

            Log.Error($"找不到托盘图标：{path}");
        }
        catch (Exception ex)
        {
            Log.Error($"加载托盘图标失败：{path}", ex);
        }

        owned = false;
        return SystemIcons.Application;
    }
}
