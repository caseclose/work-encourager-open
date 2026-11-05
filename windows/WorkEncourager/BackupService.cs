using System.Text;
using System.Text.Json;

namespace WorkEncourager;

internal sealed record BackupResult(bool Ok, string Message, bool Cancelled = false);

/// <summary>
/// Backup export/import through the Windows file dialogs — the counterpart of
/// NSSavePanel/NSOpenPanel in the macOS shell. Validation and size limits match the
/// macOS implementation exactly (valid JSON, no more than 15 MB).
/// </summary>
internal sealed class BackupService
{
    private const int MaxBackupBytes = 15 * 1024 * 1024;
    private static readonly UTF8Encoding Utf8 = new(encoderShouldEmitUTF8Identifier: false);
    private static readonly UTF8Encoding StrictUtf8 = new(encoderShouldEmitUTF8Identifier: false, throwOnInvalidBytes: true);

    public BackupResult Export(string? text, string? filename, IWin32Window? owner)
    {
        if (string.IsNullOrEmpty(text))
        {
            return new BackupResult(false, "备份需要为有效 JSON，且不超过 15 MB。");
        }

        if (Utf8.GetByteCount(text) > MaxBackupBytes || !IsValidJson(text))
        {
            return new BackupResult(false, "备份需要为有效 JSON，且不超过 15 MB。");
        }

        using var dialog = new SaveFileDialog
        {
            Title = "导出上班鼓励器备份",
            Filter = "JSON 备份 (*.json)|*.json|所有文件 (*.*)|*.*",
            DefaultExt = "json",
            AddExtension = true,
            OverwritePrompt = true,
            RestoreDirectory = true,
            FileName = SafeFileName(filename),
            CheckPathExists = true,
        };

        if (dialog.ShowDialog(owner) != DialogResult.OK)
        {
            return new BackupResult(false, "已取消导出。", Cancelled: true);
        }

        try
        {
            // Atomic replace, like NSData.write(options: .atomic): a failed write must not
            // destroy an existing backup at the chosen path.
            var temporary = dialog.FileName + ".tmp";
            File.WriteAllText(temporary, text, Utf8);
            File.Move(temporary, dialog.FileName, overwrite: true);
            Log.Info($"已导出备份：{dialog.FileName}");
            return new BackupResult(true, "备份已导出。");
        }
        catch (Exception ex)
        {
            Log.Error("导出备份失败", ex);
            return new BackupResult(false, $"导出失败：{ex.Message}");
        }
    }

    /// <summary>Returns the validated backup text to hand to the web layer, or null when cancelled.</summary>
    public (BackupResult Result, string? Text) Import(IWin32Window? owner)
    {
        using var dialog = new OpenFileDialog
        {
            Title = "导入上班鼓励器备份",
            Filter = "JSON 备份 (*.json)|*.json|所有文件 (*.*)|*.*",
            CheckFileExists = true,
            Multiselect = false,
            RestoreDirectory = true,
        };

        if (dialog.ShowDialog(owner) != DialogResult.OK)
        {
            return (new BackupResult(false, "已取消导入。", Cancelled: true), null);
        }

        try
        {
            var info = new FileInfo(dialog.FileName);
            if (!info.Exists)
            {
                return (new BackupResult(false, "读取失败：文件不存在。"), null);
            }

            if (info.Length > MaxBackupBytes)
            {
                return (new BackupResult(false, "备份文件不能超过 15 MB。"), null);
            }

            var text = File.ReadAllText(dialog.FileName, StrictUtf8);
            Log.Info($"已读取备份：{dialog.FileName}");
            return (new BackupResult(true, "已读取备份文件。"), text);
        }
        catch (Exception ex)
        {
            Log.Error("读取备份失败", ex);
            return (new BackupResult(false, $"读取失败：{ex.Message}"), null);
        }
    }

    private static bool IsValidJson(string text)
    {
        try
        {
            using var document = JsonDocument.Parse(text);
            // JSONSerialization.isValidJSONObject on macOS only accepts objects and arrays; a bare
            // scalar would parse here but is not a restorable backup.
            return document.RootElement.ValueKind is JsonValueKind.Object or JsonValueKind.Array;
        }
        catch (JsonException)
        {
            return false;
        }
    }

    private static string SafeFileName(string? filename)
    {
        const string fallback = "work-encourager-backup.json";
        if (string.IsNullOrWhiteSpace(filename))
        {
            return fallback;
        }

        var leaf = Path.GetFileName(filename.Trim());
        if (string.IsNullOrWhiteSpace(leaf))
        {
            return fallback;
        }

        if (leaf.Length > 120)
        {
            leaf = TextUtil.Truncate(leaf, 120);
        }

        foreach (var invalid in Path.GetInvalidFileNameChars())
        {
            leaf = leaf.Replace(invalid, '_');
        }

        return string.IsNullOrWhiteSpace(leaf) ? fallback : leaf;
    }
}
