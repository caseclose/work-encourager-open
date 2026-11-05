using System.Reflection;

namespace WorkEncourager;

/// <summary>Static application facts shared by the native shell.</summary>
internal static class AppInfo
{
    public const string ProductName = "上班鼓励器";

    /// <summary>Semantic version reported to the web layer and to the update checker.</summary>
    public static string Version { get; } = ReadVersion();

    private static string ReadVersion()
    {
        var informational = typeof(AppInfo).Assembly
            .GetCustomAttribute<AssemblyInformationalVersionAttribute>()?.InformationalVersion;
        if (string.IsNullOrWhiteSpace(informational))
        {
            return "1.4.1";
        }

        var plus = informational.IndexOf('+');
        return plus >= 0 ? informational[..plus] : informational;
    }
}

/// <summary>Well-known filesystem locations. Everything lives under %LOCALAPPDATA%\WorkEncourager.</summary>
internal static class AppPaths
{
    public static string LocalRoot { get; } = Path.Combine(
        Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
        "WorkEncourager");

    public static string PreferencesFile => Path.Combine(LocalRoot, "native-preferences.json");

    /// <summary>WebView2 profile (local storage, cookies, cache) — the web layer's own settings store.</summary>
    public static string WebView2Data => Path.Combine(LocalRoot, "WebView2");

    public static string LogFile => Path.Combine(LocalRoot, "logs", "work-encourager.log");

    /// <summary>Web assets copied next to the executable at build time.</summary>
    public static string WebRoot => Path.Combine(AppContext.BaseDirectory, "web");

    public static string AssetsRoot => Path.Combine(AppContext.BaseDirectory, "assets");

    public static void EnsureDirectories()
    {
        try
        {
            Directory.CreateDirectory(LocalRoot);
            Directory.CreateDirectory(WebView2Data);
            var logDirectory = Path.GetDirectoryName(LogFile);
            if (!string.IsNullOrEmpty(logDirectory))
            {
                Directory.CreateDirectory(logDirectory);
            }
        }
        catch (Exception ex)
        {
            // Never fail startup because a directory could not be created; individual features
            // report their own failures to the web layer.
            Log.Error("创建数据目录失败", ex);
        }
    }
}
