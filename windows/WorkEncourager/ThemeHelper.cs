using Microsoft.Win32;

namespace WorkEncourager;

/// <summary>Reads the Windows app theme (the equivalent of NSApp.effectiveAppearance).</summary>
internal static class ThemeHelper
{
    public const string Dark = "dark";
    public const string Light = "light";

    private const string PersonalizeKey = @"Software\Microsoft\Windows\CurrentVersion\Themes\Personalize";

    public static string CurrentSystemTheme()
    {
        try
        {
            using var key = Registry.CurrentUser.OpenSubKey(PersonalizeKey);
            if (key?.GetValue("AppsUseLightTheme") is int useLightTheme)
            {
                return useLightTheme == 0 ? Dark : Light;
            }
        }
        catch (Exception ex)
        {
            Log.Error("读取系统主题失败", ex);
        }

        // Windows defaults to the dark visual style for system chrome; the web layer resolves
        // "auto" again from prefers-color-scheme if this is wrong.
        return Dark;
    }

    public static bool IsDark(string? theme) => theme != Light;
}
