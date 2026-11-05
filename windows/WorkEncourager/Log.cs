using System.Text;

namespace WorkEncourager;

/// <summary>Minimal append-only log. Logging must never throw into application logic.</summary>
internal static class Log
{
    private const long MaxBytes = 512 * 1024;
    private static readonly object Gate = new();
    private static readonly UTF8Encoding Utf8 = new(encoderShouldEmitUTF8Identifier: false);

    public static void Info(string message) => Write("INFO", message, null);

    public static void Error(string message, Exception? exception = null) => Write("ERROR", message, exception);

    private static void Write(string level, string message, Exception? exception)
    {
        try
        {
            lock (Gate)
            {
                var path = AppPaths.LogFile;
                var directory = Path.GetDirectoryName(path);
                if (!string.IsNullOrEmpty(directory))
                {
                    Directory.CreateDirectory(directory);
                }

                var info = new FileInfo(path);
                if (info.Exists && info.Length > MaxBytes)
                {
                    info.MoveTo(path + ".1", overwrite: true);
                }

                var line = new StringBuilder()
                    .Append(DateTime.Now.ToString("yyyy-MM-dd HH:mm:ss.fff"))
                    .Append(" [").Append(level).Append("] ")
                    .Append(message);
                if (exception is not null)
                {
                    line.AppendLine().Append(exception);
                }

                File.AppendAllText(path, line.AppendLine().ToString(), Utf8);
            }
        }
        catch
        {
            // Swallowed by design: diagnostics must not break the app.
        }
    }
}
