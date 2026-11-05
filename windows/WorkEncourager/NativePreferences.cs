using System.Text;
using System.Text.Json;
using System.Text.Json.Serialization;

namespace WorkEncourager;

/// <summary>
/// Native-shell preferences, the Windows counterpart of the macOS app's UserDefaults.
/// Web-layer preferences (salary, schedule, goals) live in the WebView2 profile's localStorage,
/// exactly like the macOS app keeps them separate from its native defaults.
/// </summary>
internal sealed class NativePreferences
{
    private static readonly object Gate = new();
    private static readonly UTF8Encoding Utf8 = new(encoderShouldEmitUTF8Identifier: false);

    public bool MiniEnabled { get; set; }

    public bool MiniPinned { get; set; } = true;

    public double MiniOpacity { get; set; } = 1.0;

    /// <summary>"none" | "cmdShiftE" | "ctrlAltE" — the same vocabulary the web settings page uses.</summary>
    public string Hotkey { get; set; } = "none";

    public int? MiniX { get; set; }

    public int? MiniY { get; set; }

    /// <summary>
    /// Last popup position. Hotkey and second-launch opens reuse it so the panel behaves like a
    /// popover anchored to the notification area instead of chasing the mouse pointer.
    /// </summary>
    public int? PanelX { get; set; }

    public int? PanelY { get; set; }

    [JsonIgnore]
    public double ClampedOpacity => Math.Clamp(double.IsFinite(MiniOpacity) ? MiniOpacity : 1.0, 0.35, 1.0);

    public static string NormalizeHotkey(string? value)
        => value is "none" or "cmdShiftE" or "ctrlAltE" ? value : "none";

    public static NativePreferences Load()
    {
        try
        {
            if (File.Exists(AppPaths.PreferencesFile))
            {
                var text = File.ReadAllText(AppPaths.PreferencesFile, Encoding.UTF8);
                var loaded = JsonSerializer.Deserialize<NativePreferences>(text, BridgeJson.ReadOptions);
                if (loaded is not null)
                {
                    loaded.Hotkey = NormalizeHotkey(loaded.Hotkey);
                    return loaded;
                }
            }
        }
        catch (Exception ex)
        {
            Log.Error("读取原生偏好失败，改用默认值", ex);
        }

        return new NativePreferences();
    }

    public void Save()
    {
        try
        {
            lock (Gate)
            {
                Directory.CreateDirectory(AppPaths.LocalRoot);
                var json = JsonSerializer.Serialize(this, new JsonSerializerOptions(BridgeJson.Options) { WriteIndented = true });
                var temporary = AppPaths.PreferencesFile + ".tmp";
                File.WriteAllText(temporary, json, Utf8);
                File.Move(temporary, AppPaths.PreferencesFile, overwrite: true);
            }
        }
        catch (Exception ex)
        {
            Log.Error("保存原生偏好失败", ex);
        }
    }
}
