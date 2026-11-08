/**
 * A short, human label for a signed-in device, e.g. "Chrome on Windows".
 *
 * Only this label is stored (decision 28), never the full User-Agent string or
 * the IP address: enough to recognise your own devices, not to track anyone.
 */
export function deviceLabel(
  userAgent: string | undefined | null,
  mobileApp = false,
): string {
  if (mobileApp) return 'IdeaBloom mobile app';
  const ua = userAgent ?? '';

  // Order matters: Edge and Opera also say "Chrome"; Chrome also says "Safari".
  const browser = /Edg\//.test(ua)
    ? 'Edge'
    : /OPR\/|Opera/.test(ua)
      ? 'Opera'
      : /Firefox\/|FxiOS/.test(ua)
        ? 'Firefox'
        : /Chrome\/|CriOS/.test(ua)
          ? 'Chrome'
          : /Safari\//.test(ua)
            ? 'Safari'
            : null;

  const system = /Android/.test(ua)
    ? 'Android'
    : /iPhone|iPad|iPod/.test(ua)
      ? 'iOS'
      : /CrOS/.test(ua)
        ? 'ChromeOS'
        : /Windows/.test(ua)
          ? 'Windows'
          : /Mac OS X|Macintosh/.test(ua)
            ? 'macOS'
            : /Linux/.test(ua)
              ? 'Linux'
              : null;

  if (browser && system) return `${browser} on ${system}`;
  return browser ?? system ?? 'Unknown device';
}
