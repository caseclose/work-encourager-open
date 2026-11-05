using System.Text.RegularExpressions;
using Microsoft.Win32;

namespace WorkEncourager;

/// <summary>
/// System notifications through the tray balloon — the Windows counterpart of
/// UNUserNotificationCenter. The macOS shell refuses to display amounts in system
/// notifications; the same guard is enforced here on the native side.
/// </summary>
internal sealed class NotificationService
{
    private static readonly Regex SensitiveText = new(
        @"[¥￥$€£]|(?:月薪|工资|收入|已挣|到账).{0,12}[0-9]",
        RegexOptions.CultureInvariant | RegexOptions.Compiled);

    private readonly Action<string, string> _showBalloon;

    public NotificationService(Action<string, string> showBalloon)
    {
        _showBalloon = showBalloon;
        Status = DetectStatus();
    }

    /// <summary>"authorized" | "denied" | "notDetermined" — the vocabulary the web settings page maps to text.</summary>
    public string Status { get; private set; }

    public string RefreshStatus()
    {
        Status = DetectStatus();
        return Status;
    }

    /// <summary>Returns null when the shell should stay silent (empty payload), matching the macOS guard.</summary>
    public (bool Ok, string Message)? Notify(string? title, string? body, bool sound)
    {
        if (string.IsNullOrWhiteSpace(title) || string.IsNullOrWhiteSpace(body))
        {
            return null;
        }

        if (SensitiveText.IsMatch(title + " " + body))
        {
            return (false, "提醒中包含金额，已阻止发送。");
        }

        if (Status is not ("authorized" or "provisional"))
        {
            return (false, "系统通知未授权。");
        }

        var safeTitle = TextUtil.Truncate(title, 63);
        var safeBody = TextUtil.Truncate(body, 255);
        _showBalloon(safeTitle, safeBody);
        Log.Info($"发送系统提醒：{safeTitle}");
        // Windows plays the default notification sound; the web layer's "sound" flag only
        // exists because macOS allows per-notification sound suppression.
        _ = sound;
        return (true, "提醒已发送。");
    }

    public (bool Ok, string Message) RequestAuthorization()
    {
        RefreshStatus();
        return Status is "authorized" or "provisional"
            ? (true, "系统提醒已允许。")
            : (false, "系统提醒未允许，可在 设置 → 系统 → 通知 中修改。");
    }

    private static string DetectStatus()
    {
        try
        {
            // Toasts are on for the user unless they turned all notifications off.
            using var key = Registry.CurrentUser.OpenSubKey(
                @"Software\Microsoft\Windows\CurrentVersion\Notifications\Settings");
            if (key?.GetValue("NOC_GLOBAL_SETTING_TOASTS_ENABLED") is int enabled)
            {
                return enabled != 0 ? "authorized" : "denied";
            }
        }
        catch (Exception ex)
        {
            Log.Error("读取通知设置失败", ex);
        }

        return "authorized";
    }

}
