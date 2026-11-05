using System.Diagnostics;
using System.Runtime.InteropServices;
using Microsoft.Win32;

namespace WorkEncourager;

/// <summary>
/// Launch-at-login through Task Scheduler with the highest run level. Because the app now runs
/// elevated (requireAdministrator), a plain Run-key entry would trigger a UAC prompt at every
/// logon; a highest-privilege scheduled task starts silently instead — the Windows equivalent of
/// the macOS login item. Older versions stored the entry in HKCU\...\Run; that is migrated once
/// on startup so upgrading users keep working without a logon prompt.
/// </summary>
internal static class LaunchAtLogin
{
    private const string TaskName = "WorkEncourager";
    private const string RunKey = @"Software\Microsoft\Windows\CurrentVersion\Run";
    private const string ValueName = "WorkEncourager";

    /// <summary>Login launches pass --tray so the app stays quiet in the notification area.</summary>
    public static string Command => $"\"{Environment.ProcessPath ?? Application.ExecutablePath}\" --tray";

    public static bool IsEnabled => TaskExists();

    /// <summary>"enabled" | "notRegistered" — the status vocabulary the web settings page maps to text.</summary>
    public static string Status => IsEnabled ? "enabled" : "notRegistered";

    /// <summary>Replaces the legacy Run-key entry (if any) with a silent, elevated scheduled task.</summary>
    public static void MigrateLegacyRegistryEntry()
    {
        try
        {
            if (ReadRunValue() is null)
            {
                return;
            }

            if (!TaskExists())
            {
                var (ok, output) = CreateTask();
                if (!ok)
                {
                    Log.Error($"迁移开机启动到计划任务失败：{output}");
                    return;
                }
            }

            RemoveRunValue();
            Log.Info("已将旧的注册表开机启动项迁移为计划任务");
        }
        catch (Exception ex)
        {
            Log.Error("迁移开机启动设置失败", ex);
        }
    }

    public static (bool Ok, string Message) Set(bool enabled)
    {
        try
        {
            if (enabled)
            {
                var (ok, output) = CreateTask();
                if (ok)
                {
                    RemoveRunValue();
                    return (true, "已开启开机启动。");
                }

                // Fall back to the Run key when Task Scheduler is unavailable. The app is elevated,
                // so Windows will ask for elevation at logon in this fallback path.
                if (WriteRunValue())
                {
                    Log.Error($"创建计划任务失败，已回退到注册表启动项：{output}");
                    return (true, "已开启开机启动。");
                }

                return (false, $"开机启动设置失败：{output}");
            }

            DeleteTask();
            RemoveRunValue();
            return IsEnabled
                ? (false, "开机启动设置未生效，请检查任务计划程序。")
                : (true, "已关闭开机启动。");
        }
        catch (Exception ex)
        {
            Log.Error("写入开机启动设置失败", ex);
            return (false, $"开机启动设置失败：{ex.Message}");
        }
    }

    private static bool TaskExists()
    {
        var (exitCode, _) = RunSchtasks("/Query", "/TN", TaskName);
        return exitCode == 0;
    }

    private static (bool Ok, string Output) CreateTask()
    {
        var (exitCode, output) = RunSchtasks(
            "/Create",
            "/TN", TaskName,
            "/TR", Command,
            "/SC", "ONLOGON",
            "/RL", "HIGHEST",
            "/F");
        return (exitCode == 0, output);
    }

    private static void DeleteTask() => RunSchtasks("/Delete", "/TN", TaskName, "/F");

    private static (int ExitCode, string Output) RunSchtasks(params string[] arguments)
    {
        try
        {
            var info = new ProcessStartInfo("schtasks.exe")
            {
                UseShellExecute = false,
                CreateNoWindow = true,
                RedirectStandardOutput = true,
                RedirectStandardError = true,
            };
            foreach (var argument in arguments)
            {
                info.ArgumentList.Add(argument);
            }

            using var process = Process.Start(info);
            if (process is null)
            {
                return (-1, "无法启动 schtasks.exe。");
            }

            var stdout = process.StandardOutput.ReadToEnd();
            var stderr = process.StandardError.ReadToEnd();
            if (!process.WaitForExit(15000))
            {
                try { process.Kill(); } catch (Exception) { /* best effort */ }
                return (-1, "schtasks.exe 超时。");
            }

            return (process.ExitCode, (stdout + Environment.NewLine + stderr).Trim());
        }
        catch (Exception ex)
        {
            return (-1, ex.Message);
        }
    }

    private static string? ReadRunValue()
    {
        try
        {
            using var key = Registry.CurrentUser.OpenSubKey(RunKey);
            return key?.GetValue(ValueName) as string;
        }
        catch (Exception ex)
        {
            Log.Error("读取开机启动注册表项失败", ex);
            return null;
        }
    }

    private static bool WriteRunValue()
    {
        try
        {
            using var key = Registry.CurrentUser.CreateSubKey(RunKey, writable: true);
            if (key is null)
            {
                return false;
            }

            key.SetValue(ValueName, Command, RegistryValueKind.String);
            return true;
        }
        catch (Exception ex)
        {
            Log.Error("写入注册表启动项失败", ex);
            return false;
        }
    }

    private static void RemoveRunValue()
    {
        try
        {
            using var key = Registry.CurrentUser.OpenSubKey(RunKey, writable: true);
            key?.DeleteValue(ValueName, throwOnMissingValue: false);
        }
        catch (Exception ex)
        {
            Log.Error("删除注册表启动项失败", ex);
        }
    }
}
