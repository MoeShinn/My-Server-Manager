// Search helpers for the "Download more languages" window.
// A person can type a language id (en, vi, ru, jp...), a native name (Tiếng Việt, Русский), an English name
// (Vietnamese, Japanese) or a country name (Vietnam, Việt Nam, viet nam). Case, accents and spaces are ignored.

import type { LanguageInfo } from '@shared/types'

/** Country most people think of for a language. Used so "vietnam", "jp", "japan"... find the right language. */
const REGION_BY_LANGUAGE: Record<string, string> = {
  en: 'US', vi: 'VN', ja: 'JP', ko: 'KR', zh: 'CN', ru: 'RU', de: 'DE', es: 'ES', pt: 'PT', fr: 'FR', it: 'IT',
  id: 'ID', th: 'TH', hi: 'IN', tr: 'TR', pl: 'PL', nl: 'NL', ar: 'SA', uk: 'UA', cs: 'CZ', sv: 'SE', ms: 'MY',
  fil: 'PH', tl: 'PH', el: 'GR', he: 'IL', hu: 'HU', ro: 'RO', da: 'DK', fi: 'FI', no: 'NO', nb: 'NO', bg: 'BG',
  km: 'KH', lo: 'LA', my: 'MM', bn: 'BD', fa: 'IR', sk: 'SK', hr: 'HR', sr: 'RS', lt: 'LT', lv: 'LV', et: 'EE',
}

/** Short ids and nicknames that cannot be derived from the data above. */
const EXTRA_ALIASES: Record<string, string[]> = {
  en: ['uk', 'gb', 'england', 'britain', 'america', 'tieng anh'],
  zh: ['tw', 'hk', 'trung quoc', 'tieng trung'],
  ja: ['jp', 'nhat ban', 'tieng nhat'],
  ko: ['kr', 'han quoc', 'tieng han'],
  vi: ['vn', 'tieng viet'],
}

/** "Tiếng Việt" -> "tiengviet", "Việt Nam" -> "vietnam": lowercase, no accents, only letters and digits. */
export function normalizeSearch(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/[^\p{L}\p{N}]+/gu, '')
}

const displayNamesCache = new Map<string, Intl.DisplayNames | null>()

function displayNames(locale: string, type: 'language' | 'region'): Intl.DisplayNames | null {
  const key = `${type}:${locale}`
  if (displayNamesCache.has(key)) return displayNamesCache.get(key) ?? null
  let instance: Intl.DisplayNames | null = null
  try {
    instance = new Intl.DisplayNames([locale], { type, fallback: 'none' })
  } catch {
    instance = null
  }
  displayNamesCache.set(key, instance)
  return instance
}

function safeName(locale: string, type: 'language' | 'region', code: string): string | undefined {
  try {
    return displayNames(locale, type)?.of(code) ?? undefined
  } catch {
    return undefined
  }
}

/** Splits a code into the languages it contains: "vi" -> [vi], "zh-CN" -> [zh] + region CN, "vi-en" -> [vi, en]. */
function parseCode(code: string): { languages: string[]; region?: string } {
  const [first, second] = code.split('-')
  const language = first.toLowerCase()
  if (!second) return { languages: [language] }
  if (/^[a-z]{2,3}$/.test(second)) return { languages: [language, second] } // bilingual pack like vi-en
  if (/^[A-Za-z]{2}$/.test(second)) return { languages: [language], region: second.toUpperCase() }
  return { languages: [language] }
}

const keywordCache = new Map<string, string[]>()

/** All normalized search words of a language. Index 0 is always the id, so an exact id match can rank first. */
function keywordsOf(item: Pick<LanguageInfo, 'code' | 'name'>): string[] {
  const cacheKey = `${item.code}\u0000${item.name}`
  const cached = keywordCache.get(cacheKey)
  if (cached) return cached

  const { languages, region } = parseCode(item.code)
  const raw: string[] = [item.code, ...languages, item.name]
  for (const language of languages) {
    raw.push(safeName('en', 'language', language) ?? '')
    raw.push(safeName('vi', 'language', language) ?? '')
    raw.push(safeName(language, 'language', language) ?? '')
    raw.push(...(EXTRA_ALIASES[language] ?? []))
    const countries = [region, REGION_BY_LANGUAGE[language]].filter((r): r is string => Boolean(r))
    for (const country of countries) {
      raw.push(country)
      raw.push(safeName('en', 'region', country) ?? '')
      raw.push(safeName('vi', 'region', country) ?? '')
    }
  }

  const seen = new Set<string>()
  const result: string[] = []
  for (const word of raw) {
    const normalized = normalizeSearch(word)
    if (normalized && !seen.has(normalized)) {
      seen.add(normalized)
      result.push(normalized)
    }
  }
  keywordCache.set(cacheKey, result)
  return result
}

/**
 * Filters and ranks languages for a search text. An empty text returns the list unchanged.
 * Ranking: exact id, then exact word, then a word that starts with the text, then a word that contains it.
 * Texts of 1 to 2 characters only match the start of a word, so "id" or "vi" do not match random names.
 */
export function filterLanguages<T extends Pick<LanguageInfo, 'code' | 'name'>>(items: T[], query: string): T[] {
  const q = normalizeSearch(query)
  if (!q) return items
  const ranked: { item: T; index: number; score: number }[] = []
  items.forEach((item, index) => {
    const words = keywordsOf(item)
    const idWord = normalizeSearch(item.code)
    let best = Number.POSITIVE_INFINITY
    for (const word of words) {
      let score = Number.POSITIVE_INFINITY
      if (word === q) score = word === idWord ? 0 : 1
      else if (word.startsWith(q)) score = 2
      else if (q.length > 2 && word.includes(q)) score = 3
      if (score < best) best = score
    }
    if (best !== Number.POSITIVE_INFINITY) ranked.push({ item, index, score: best })
  })
  ranked.sort((a, b) => a.score - b.score || a.index - b.index)
  return ranked.map((r) => r.item)
}
