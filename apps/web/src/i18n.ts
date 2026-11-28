import { notFound } from 'next/navigation';
import { getRequestConfig } from 'next-intl/server';

// Can be imported from a shared config
export const locales = ['en', 'es'] as const;
export type Locale = (typeof locales)[number];

export default getRequestConfig(async ({ locale, requestLocale }) => {
  let resolvedLocale = locale ?? (await requestLocale);

  if (!resolvedLocale || !locales.includes(resolvedLocale as Locale)) {
    resolvedLocale = 'en';
  }

  return {
    locale: resolvedLocale as Locale,
    messages: (await import(`../messages/${resolvedLocale}.json`)).default,
  };
});
