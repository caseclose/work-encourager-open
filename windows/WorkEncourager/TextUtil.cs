namespace WorkEncourager;

/// <summary>Small text helpers shared by the native chrome.</summary>
internal static class TextUtil
{
    /// <summary>
    /// Truncates to a maximum number of UTF-16 code units without splitting a surrogate pair.
    /// The macOS shell uses Swift's <c>prefix(n)</c>, which counts Characters, so naive
    /// <c>Substring</c> would cut emoji in half and render a replacement glyph.
    /// </summary>
    public static string Truncate(string? value, int maxCodeUnits)
    {
        if (string.IsNullOrEmpty(value) || value.Length <= maxCodeUnits)
        {
            return value ?? string.Empty;
        }

        var length = Math.Max(0, maxCodeUnits);
        if (length > 0 && length < value.Length && char.IsHighSurrogate(value[length - 1]))
        {
            length -= 1;
        }

        return value[..length];
    }

    /// <summary>Truncates and appends an ellipsis, keeping the combined length within the limit.</summary>
    public static string TruncateWithEllipsis(string? value, int maxCodeUnits)
    {
        if (string.IsNullOrEmpty(value) || value.Length <= maxCodeUnits)
        {
            return value ?? string.Empty;
        }

        return Truncate(value, Math.Max(0, maxCodeUnits - 1)) + "…";
    }

}
