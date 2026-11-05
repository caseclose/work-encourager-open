using System.Threading;
using System.Windows.Forms;

namespace WorkEncourager;

internal static class Program
{
    private const string MutexName = @"Local\WorkEncourager.Windows.SingleInstance";
    internal const string ShowEventName = @"Local\WorkEncourager.Windows.ShowPanel";

    /// <summary>True when Windows started the app at login: stay in the tray, do not pop the panel.</summary>
    public static bool LaunchInTrayOnly { get; private set; }

    public static bool DevToolsEnabled { get; private set; }

    [STAThread]
    private static void Main(string[] args)
    {
        LaunchInTrayOnly = args.Any(argument => string.Equals(argument, "--tray", StringComparison.OrdinalIgnoreCase));
        DevToolsEnabled = args.Any(argument => string.Equals(argument, "--devtools", StringComparison.OrdinalIgnoreCase));

        // The wake-up event exists before the single-instance check, so a second launch can always
        // reach the running copy even during its first second of startup.
        using var showEvent = new EventWaitHandle(initialState: false, EventResetMode.AutoReset, ShowEventName);

        using var mutex = new Mutex(initiallyOwned: true, MutexName, out var isFirstInstance);
        if (!isFirstInstance)
        {
            SignalExistingInstance(showEvent);
            return;
        }

        ApplicationConfiguration.Initialize();
        Application.SetUnhandledExceptionMode(UnhandledExceptionMode.CatchException);
        Application.ThreadException += (_, eventArgs) => Log.Error("界面线程异常", eventArgs.Exception);
        AppDomain.CurrentDomain.UnhandledException += (_, eventArgs) => Log.Error("未处理异常", eventArgs.ExceptionObject as Exception);

        try
        {
            using var host = new AppHost(showEvent);
            Application.Run(host);
        }
        catch (Exception ex)
        {
            Log.Error("应用启动失败", ex);
            MessageBox.Show(
                $"上班鼓励器启动失败：{ex.Message}{Environment.NewLine}{Environment.NewLine}日志：{AppPaths.LogFile}",
                AppInfo.ProductName,
                MessageBoxButtons.OK,
                MessageBoxIcon.Error);
        }
    }

    private static void SignalExistingInstance(EventWaitHandle showEvent)
    {
        try
        {
            showEvent.Set();
        }
        catch (Exception ex)
        {
            Log.Error("唤醒已运行的实例失败", ex);
        }
    }
}
