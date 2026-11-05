using System.Globalization;
using System.Net;
using System.Net.Http;
using System.Net.Http.Headers;
using System.Text.Json;

namespace WorkEncourager;

internal sealed record UpdateResult(
    bool Ok,
    string Message,
    bool? UpdateAvailable = null,
    string? LatestVersion = null,
    string? Url = null,
    string? CurrentVersion = null);

/// <summary>
/// Manual update check against the project's GitHub releases — a port of the
/// checkUpdates/searchPublicReleasePage/version-comparison logic in MenuBarMain.swift.
/// </summary>
internal sealed class UpdateChecker
{
    private const string ApiUrl = "https://api.github.com/repos/caseclose/work-encourager-open/releases/latest";
    private const string LatestPageUrl = "https://github.com/caseclose/work-encourager-open/releases/latest";
    private const string ReleaseTagPrefix = "/caseclose/work-encourager-open/releases/tag/";

    private static readonly HttpClient ApiClient = CreateClient(automaticRedirect: true);
    private static readonly HttpClient PageClient = CreateClient(automaticRedirect: true);

    private readonly string _version;

    public UpdateChecker(string version)
    {
        _version = version;
    }

    public bool Busy { get; private set; }

    public async Task<UpdateResult> CheckAsync()
    {
        if (Busy)
        {
            return new UpdateResult(false, "正在检查更新，请稍候。");
        }

        Busy = true;
        try
        {
            return await CheckCoreAsync().ConfigureAwait(false);
        }
        finally
        {
            Busy = false;
        }
    }

    private async Task<UpdateResult> CheckCoreAsync()
    {
        try
        {
            using var timeout = new CancellationTokenSource(TimeSpan.FromSeconds(15));
            using var request = new HttpRequestMessage(HttpMethod.Get, ApiUrl);
            request.Headers.Accept.Add(new MediaTypeWithQualityHeaderValue("application/vnd.github+json"));
            request.Headers.TryAddWithoutValidation("User-Agent", $"WorkEncourager/{_version}");

            using var response = await ApiClient
                .SendAsync(request, HttpCompletionOption.ResponseContentRead, timeout.Token)
                .ConfigureAwait(false);

            if (response.StatusCode is HttpStatusCode.Forbidden or HttpStatusCode.TooManyRequests)
            {
                // The unauthenticated API can be rate limited while the public release page stays up.
                return await CheckPublicReleasePageAsync((int)response.StatusCode).ConfigureAwait(false);
            }

            if (response.StatusCode == HttpStatusCode.NotFound)
            {
                return new UpdateResult(true, "项目尚未发布可下载版本。", false, CurrentVersion: _version);
            }

            if (response.StatusCode != HttpStatusCode.OK)
            {
                return new UpdateResult(false, $"无法读取版本信息（HTTP {(int)response.StatusCode}）。");
            }

            var body = await response.Content.ReadAsStringAsync(timeout.Token).ConfigureAwait(false);
            using var document = JsonDocument.Parse(body);
            var root = document.RootElement;
            var tag = root.TryGetProperty("tag_name", out var tagElement) && tagElement.ValueKind == JsonValueKind.String
                ? tagElement.GetString()
                : null;
            var htmlUrl = root.TryGetProperty("html_url", out var urlElement) && urlElement.ValueKind == JsonValueKind.String
                ? urlElement.GetString()
                : null;

            if (string.IsNullOrWhiteSpace(tag) || NumericVersion(tag) is not { Length: 3 } || string.IsNullOrWhiteSpace(htmlUrl))
            {
                return new UpdateResult(false, $"无法读取版本信息（HTTP {(int)response.StatusCode}）。");
            }

            return ReportVersion(tag, htmlUrl);
        }
        catch (OperationCanceledException)
        {
            return new UpdateResult(false, "检查失败：请求 GitHub 超时。");
        }
        catch (Exception ex)
        {
            Log.Error("检查更新失败", ex);
            return new UpdateResult(false, $"检查失败：{ex.Message}");
        }
    }

    private async Task<UpdateResult> CheckPublicReleasePageAsync(int apiStatus)
    {
        try
        {
            using var timeout = new CancellationTokenSource(TimeSpan.FromSeconds(15));
            using var request = new HttpRequestMessage(HttpMethod.Head, LatestPageUrl);
            request.Headers.TryAddWithoutValidation("User-Agent", $"WorkEncourager/{_version}");

            using var response = await PageClient
                .SendAsync(request, HttpCompletionOption.ResponseHeadersRead, timeout.Token)
                .ConfigureAwait(false);

            var finalUri = response.RequestMessage?.RequestUri;
            if (response.StatusCode != HttpStatusCode.OK
                || finalUri is null
                || finalUri.Scheme != Uri.UriSchemeHttps
                || !string.Equals(finalUri.Host, "github.com", StringComparison.OrdinalIgnoreCase)
                || finalUri.Query.Length > 0
                || finalUri.Fragment.Length > 0
                || !finalUri.AbsolutePath.StartsWith(ReleaseTagPrefix, StringComparison.Ordinal))
            {
                return new UpdateResult(false, $"无法读取版本信息（API HTTP {apiStatus}，发布页查询也未成功）。");
            }

            var tag = finalUri.AbsolutePath[ReleaseTagPrefix.Length..];
            if (tag.Contains('/') || NumericVersion(tag) is null)
            {
                return new UpdateResult(false, $"无法读取版本信息（API HTTP {apiStatus}，发布页版本号无效）。");
            }

            return ReportVersion(tag, finalUri.AbsoluteUri);
        }
        catch (Exception ex)
        {
            Log.Error("读取发布页失败", ex);
            return new UpdateResult(false, $"无法读取版本信息（API HTTP {apiStatus}，发布页查询也未成功）。");
        }
    }

    private UpdateResult ReportVersion(string latest, string url)
    {
        var latestParts = NumericVersion(latest);
        var currentParts = NumericVersion(_version);
        if (latestParts is not { Length: 3 } || currentParts is not { Length: 3 })
        {
            return new UpdateResult(false, "版本号格式无效，无法比较更新。");
        }

        var newer = currentParts.SequenceCompareTo(latestParts) < 0;
        var message = newer
            ? $"发现新版本 {latest}。"
            : currentParts.SequenceEqual(latestParts)
                ? "当前已是最新版本。"
                : $"当前版本 {_version} 高于 GitHub 正式版 {latest}。";

        return new UpdateResult(true, message, newer, latest, url, _version);
    }

    /// <summary>
    /// Strict semantic version parser ported from MenuBarMain.swift. Returns null for anything
    /// that is not a three-part numeric version with optional, well-formed prerelease/build parts.
    /// </summary>
    internal static int[]? NumericVersion(string value)
    {
        var normalized = value.StartsWith('v') ? value[1..] : value;
        var buildParts = normalized.Split('+');
        if (buildParts.Length > 2)
        {
            return null;
        }

        static bool ValidIdentifiers(string part, bool isPrerelease)
        {
            foreach (var identifier in part.Split('.'))
            {
                if (identifier.Length == 0)
                {
                    return false;
                }

                foreach (var character in identifier)
                {
                    if (!(character is >= 'a' and <= 'z'
                          || character is >= 'A' and <= 'Z'
                          || character is >= '0' and <= '9'
                          || character == '-'))
                    {
                        return false;
                    }
                }

                var numeric = identifier.All(character => character is >= '0' and <= '9');
                if (isPrerelease && numeric && identifier.Length > 1 && identifier[0] == '0')
                {
                    return false;
                }
            }

            return true;
        }

        if (buildParts.Length == 2 && !ValidIdentifiers(buildParts[1], isPrerelease: false))
        {
            return null;
        }

        var prereleaseParts = buildParts[0].Split('-', 2);
        if (prereleaseParts.Length == 2 && !ValidIdentifiers(prereleaseParts[1], isPrerelease: true))
        {
            return null;
        }

        var components = prereleaseParts[0].Split('.');
        if (components.Length != 3)
        {
            return null;
        }

        var version = new int[3];
        for (var index = 0; index < 3; index++)
        {
            var component = components[index];
            if (component.Length == 0
                || component.Any(character => character is < '0' or > '9')
                || (component.Length > 1 && component[0] == '0')
                || !int.TryParse(component, NumberStyles.None, CultureInfo.InvariantCulture, out version[index]))
            {
                return null;
            }
        }

        return version;
    }

    private static HttpClient CreateClient(bool automaticRedirect)
    {
        var handler = new HttpClientHandler
        {
            AllowAutoRedirect = automaticRedirect,
            UseCookies = false,
            AutomaticDecompression = DecompressionMethods.GZip | DecompressionMethods.Deflate,
        };
        return new HttpClient(handler) { Timeout = Timeout.InfiniteTimeSpan };
    }
}
