using System.Drawing;
using System.Drawing.Drawing2D;
using System.Drawing.Text;
using System.Windows.Forms;

namespace WorkEncourager;

/// <summary>
/// The draggable floating mini window — the Windows counterpart of the macOS NSPanel HUD.
/// It is drawn natively (no WebView2) exactly like the Swift version uses NSTextField and
/// NSProgressIndicator: emoji, headline amount, status line, and a progress bar.
/// </summary>
internal sealed class MiniWindow : Form
{
    private const int BaseWidth = 280;
    private const int BaseHeight = 112;

    private readonly NativePreferences _preferences;

    private string _theme;
    private string _emoji = "¥";
    private string _title = "先设置薪资与班表";
    private string _detail = "打开面板开始使用";
    private double _progress;

    private bool _dragging;
    private bool _moved;
    private Point _dragStart;
    private Point _dragOrigin;

    public MiniWindow(NativePreferences preferences, string theme)
    {
        _preferences = preferences;
        _theme = theme;

        Text = "上班鼓励器 · 迷你窗口";
        FormBorderStyle = FormBorderStyle.None;
        ShowInTaskbar = false;
        StartPosition = FormStartPosition.Manual;
        AutoScaleMode = AutoScaleMode.None;
        DoubleBuffered = true;
        BackColor = Color.FromArgb(0x1D, 0x17, 0x12);
        SetStyle(ControlStyles.AllPaintingInWmPaint | ControlStyles.OptimizedDoubleBuffer | ControlStyles.UserPaint, true);

        Size = new Size(ToPx(BaseWidth), ToPx(BaseHeight));
        RestorePosition();
        ApplyPreferences();
    }

    public event Action? OpenRequested;

    public event Action? CloseRequested;

    public void Update(string emoji, string title, string detail, double progress)
    {
        _emoji = string.IsNullOrEmpty(emoji) ? "¥" : TextUtil.Truncate(emoji, 8);
        _title = TextUtil.Truncate(title, 80);
        _detail = TextUtil.Truncate(detail, 160);
        _progress = double.IsFinite(progress) ? Math.Clamp(progress, 0, 1) : 0;
        if (Visible)
        {
            Invalidate();
        }
    }

    public void SetTheme(string theme)
    {
        if (theme is not ("dark" or "light") || theme == _theme)
        {
            return;
        }

        _theme = theme;
        BackColor = ThemeHelper.IsDark(theme) ? Color.FromArgb(0x1D, 0x17, 0x12) : Color.FromArgb(0xF7, 0xEF, 0xE4);
        Invalidate();
    }

    public void ApplyPreferences()
    {
        TopMost = _preferences.MiniPinned;
        var opacity = (float)_preferences.ClampedOpacity;
        if (Math.Abs(Opacity - opacity) > 0.001)
        {
            Opacity = opacity;
        }

        if (_preferences.MiniEnabled)
        {
            EnsureOnScreen();
            if (!Visible)
            {
                Show();
            }

            Invalidate();
        }
        else if (Visible)
        {
            Hide();
        }
    }

    protected override bool ShowWithoutActivation => true;

    protected override CreateParams CreateParams
    {
        get
        {
            var parameters = base.CreateParams;
            parameters.ExStyle |= NativeMethods.WS_EX_TOOLWINDOW | NativeMethods.WS_EX_NOACTIVATE;
            parameters.ClassStyle |= NativeMethods.CS_DROPSHADOW;
            return parameters;
        }
    }

    protected override void OnHandleCreated(EventArgs e)
    {
        base.OnHandleCreated(e);
        NativeMethods.ApplyRoundedCorners(Handle);
        var size = new Size(ToPx(BaseWidth), ToPx(BaseHeight));
        if (Size != size)
        {
            Size = size;
        }

        ApplyRegion();
    }

    protected override void OnResize(EventArgs e)
    {
        base.OnResize(e);
        ApplyRegion();
    }

    protected override void OnPaint(PaintEventArgs e)
    {
        var graphics = e.Graphics;
        graphics.SmoothingMode = SmoothingMode.AntiAlias;
        graphics.TextRenderingHint = TextRenderingHint.ClearTypeGridFit;

        var dark = ThemeHelper.IsDark(_theme);
        var background = dark ? Color.FromArgb(0x1D, 0x17, 0x12) : Color.FromArgb(0xF7, 0xEF, 0xE4);
        var border = dark ? Color.FromArgb(0x4A, 0x3B, 0x2E) : Color.FromArgb(0xE0, 0xD0, 0xBA);
        var foreground = dark ? Color.FromArgb(0xF7, 0xEF, 0xE4) : Color.FromArgb(0x24, 0x1C, 0x16);
        var secondary = dark ? Color.FromArgb(0xB9, 0xA9, 0x92) : Color.FromArgb(0x7C, 0x6A, 0x58);
        var accent = dark ? Color.FromArgb(0xF0, 0x9B, 0x63) : Color.FromArgb(0xD9, 0x5A, 0x2B);

        using (var frame = RoundedRectangle(new Rectangle(0, 0, Width - 1, Height - 1), ToPx(14)))
        using (var fill = new SolidBrush(background))
        using (var outline = new Pen(border))
        {
            graphics.FillPath(fill, frame);
            graphics.DrawPath(outline, frame);
        }

        var contentLeft = ToPx(62);
        var contentRight = Math.Max(contentLeft + ToPx(40), Width - ToPx(56));

        using (var emojiFont = new Font("Segoe UI Emoji", 22f, GraphicsUnit.Point))
        using (var emojiBrush = new SolidBrush(foreground))
        using (var centered = new StringFormat { Alignment = StringAlignment.Near, LineAlignment = StringAlignment.Center })
        {
            graphics.DrawString(
                _emoji,
                emojiFont,
                emojiBrush,
                new RectangleF(ToPx(14), ToPx(22), ToPx(44), ToPx(44)),
                centered);
        }

        using (var titleFont = new Font("Segoe UI", 15f, FontStyle.Bold, GraphicsUnit.Point))
        using (var detailFont = new Font("Microsoft YaHei UI", 8.5f, GraphicsUnit.Point))
        using (var titleBrush = new SolidBrush(foreground))
        using (var detailBrush = new SolidBrush(secondary))
        using (var ellipsis = new StringFormat
               {
                   Trimming = StringTrimming.EllipsisCharacter,
                   FormatFlags = StringFormatFlags.NoWrap,
               })
        {
            graphics.DrawString(
                _title,
                titleFont,
                titleBrush,
                new RectangleF(contentLeft, ToPx(20), contentRight - contentLeft, ToPx(30)),
                ellipsis);
            graphics.DrawString(
                _detail,
                detailFont,
                detailBrush,
                new RectangleF(contentLeft, ToPx(52), Math.Max(ToPx(40), Width - ToPx(18) - contentLeft), ToPx(22)),
                ellipsis);
        }

        using (var glyphFont = new Font("Segoe UI Symbol", 10f, GraphicsUnit.Point))
        using (var glyphBrush = new SolidBrush(secondary))
        using (var centered = new StringFormat { Alignment = StringAlignment.Center, LineAlignment = StringAlignment.Center })
        {
            graphics.DrawString("↗", glyphFont, glyphBrush, OpenButtonRect(), centered);
            graphics.DrawString("×", glyphFont, glyphBrush, CloseButtonRect(), centered);
        }

        var track = new Rectangle(ToPx(14), Height - ToPx(19), Width - ToPx(28), ToPx(6));
        using (var trackPath = RoundedRectangle(track, ToPx(3)))
        using (var trackBrush = new SolidBrush(dark ? Color.FromArgb(0x39, 0x2E, 0x24) : Color.FromArgb(0xE8, 0xDA, 0xC6)))
        {
            graphics.FillPath(trackBrush, trackPath);
        }

        if (_progress > 0.001)
        {
            var fillWidth = Math.Max(ToPx(4), (int)Math.Round(track.Width * _progress));
            var filled = new Rectangle(track.X, track.Y, Math.Min(fillWidth, track.Width), track.Height);
            using var fillPath = RoundedRectangle(filled, ToPx(3));
            using var fillBrush = new SolidBrush(accent);
            graphics.FillPath(fillBrush, fillPath);
        }
    }

    protected override void OnMouseDown(MouseEventArgs e)
    {
        base.OnMouseDown(e);
        if (e.Button != MouseButtons.Left)
        {
            return;
        }

        if (CloseButtonRect().Contains(e.Location))
        {
            Log.Info("迷你窗口关闭");
            CloseRequested?.Invoke();
            return;
        }

        if (OpenButtonRect().Contains(e.Location))
        {
            OpenRequested?.Invoke();
            return;
        }

        _dragging = true;
        _moved = false;
        _dragStart = Cursor.Position;
        _dragOrigin = Location;
    }

    protected override void OnMouseMove(MouseEventArgs e)
    {
        base.OnMouseMove(e);
        Cursor = CloseButtonRect().Contains(e.Location) || OpenButtonRect().Contains(e.Location)
            ? Cursors.Hand
            : Cursors.SizeAll;

        if (!_dragging)
        {
            return;
        }

        var delta = new Point(Cursor.Position.X - _dragStart.X, Cursor.Position.Y - _dragStart.Y);
        if (!_moved && Math.Abs(delta.X) + Math.Abs(delta.Y) > ToPx(3))
        {
            _moved = true;
        }

        if (_moved)
        {
            Location = new Point(_dragOrigin.X + delta.X, _dragOrigin.Y + delta.Y);
        }
    }

    protected override void OnMouseUp(MouseEventArgs e)
    {
        base.OnMouseUp(e);
        if (!_dragging)
        {
            return;
        }

        _dragging = false;
        if (_moved)
        {
            SavePosition();
        }
        else
        {
            OpenRequested?.Invoke();
        }
    }

    protected override void OnFormClosing(FormClosingEventArgs e)
    {
        if (e.CloseReason == CloseReason.UserClosing)
        {
            e.Cancel = true;
            CloseRequested?.Invoke();
            return;
        }

        base.OnFormClosing(e);
    }

    private int ToPx(int value) => (int)Math.Round(value * DeviceDpi / 96f);

    private Rectangle OpenButtonRect() => new(Width - ToPx(58), ToPx(10), ToPx(24), ToPx(24));

    private Rectangle CloseButtonRect() => new(Width - ToPx(32), ToPx(10), ToPx(24), ToPx(24));

    private void ApplyRegion()
    {
        if (Width <= 0 || Height <= 0)
        {
            return;
        }

        using var path = RoundedRectangle(new Rectangle(0, 0, Width, Height), ToPx(14));
        var previous = Region;
        Region = new Region(path);
        previous?.Dispose();
    }

    private void RestorePosition()
    {
        if (_preferences.MiniX is int x && _preferences.MiniY is int y)
        {
            var candidate = new Rectangle(new Point(x, y), Size);
            if (Screen.AllScreens.Any(screen => screen.WorkingArea.IntersectsWith(candidate)))
            {
                Location = candidate.Location;
                return;
            }
        }

        var workArea = Screen.PrimaryScreen?.WorkingArea ?? new Rectangle(0, 0, 1280, 720);
        Location = new Point(workArea.Right - Width - ToPx(18), workArea.Bottom - Height - ToPx(18));
    }

    private void EnsureOnScreen()
    {
        var visible = Screen.AllScreens.Any(screen => screen.WorkingArea.IntersectsWith(new Rectangle(Location, Size)));
        if (!visible)
        {
            RestorePosition();
        }
    }

    private void SavePosition()
    {
        _preferences.MiniX = Location.X;
        _preferences.MiniY = Location.Y;
        _preferences.Save();
    }


    private static GraphicsPath RoundedRectangle(Rectangle bounds, int radius)
    {
        var path = new GraphicsPath();
        radius = Math.Max(0, Math.Min(radius, Math.Min(bounds.Width, bounds.Height) / 2));
        if (radius <= 0)
        {
            path.AddRectangle(bounds);
            return path;
        }

        var diameter = radius * 2;
        path.AddArc(bounds.X, bounds.Y, diameter, diameter, 180, 90);
        path.AddArc(bounds.Right - diameter, bounds.Y, diameter, diameter, 270, 90);
        path.AddArc(bounds.Right - diameter, bounds.Bottom - diameter, diameter, diameter, 0, 90);
        path.AddArc(bounds.X, bounds.Bottom - diameter, diameter, diameter, 90, 90);
        path.CloseFigure();
        return path;
    }
}
