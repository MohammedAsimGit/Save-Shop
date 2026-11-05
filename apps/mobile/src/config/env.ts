/**
 * Mobile runtime configuration.
 *
 * `EXPO_PUBLIC_*` variables are inlined into the JS bundle, so they are public.
 * The app therefore knows only the platform API URL - never a marketplace key,
 * database URL or service-account credential.
 */

const ANDROID_EMULATOR_FALLBACK = 'http://10.0.2.2:4000/api/v1';

const isHttpUrl = (value: string): boolean => {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
};

function resolveApiBaseUrl(): string {
  const raw = process.env.EXPO_PUBLIC_API_BASE_URL?.trim();
  const value = raw && raw.length > 0 ? raw : __DEV__ ? ANDROID_EMULATOR_FALLBACK : '';

  if (!isHttpUrl(value)) {
    throw new Error(
      'EXPO_PUBLIC_API_BASE_URL is missing or not an absolute http(s) URL. Copy apps/mobile/.env.example to apps/mobile/.env.',
    );
  }

  return value.replace(/\/+$/, '');
}

export const mobileEnv = Object.freeze({
  apiBaseUrl: resolveApiBaseUrl(),
});
