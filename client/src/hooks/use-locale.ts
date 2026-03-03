import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';

const RTL_LANGUAGES = ['ar', 'he', 'fa', 'ur'];

export function useDirectionality() {
  const { i18n } = useTranslation();
  
  useEffect(() => {
    const isRtl = RTL_LANGUAGES.includes(i18n.language);
    document.documentElement.dir = isRtl ? 'rtl' : 'ltr';
    document.documentElement.lang = i18n.language;
  }, [i18n.language]);
}

// 날짜 포맷 (로케일 기반)
export function formatLocalDate(date: Date | string, locale?: string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  const lang = locale || document.documentElement.lang || 'ko';
  return d.toLocaleDateString(lang, { year: 'numeric', month: 'long', day: 'numeric' });
}

export function formatLocalDateTime(date: Date | string, locale?: string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  const lang = locale || document.documentElement.lang || 'ko';
  return d.toLocaleString(lang, { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

// 통화 포맷
export function formatCurrency(amount: number, currency: string = 'KRW', locale?: string): string {
  const lang = locale || document.documentElement.lang || 'ko';
  return new Intl.NumberFormat(lang, { style: 'currency', currency }).format(amount);
}
