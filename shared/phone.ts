import { parsePhoneNumberFromString, type CountryCode } from 'libphonenumber-js'

export interface ParsedPhone {
  e164: string
  country: string
  callingCode: string
  last4: string
}

export function parsePhone(input: string, defaultCountry?: string): ParsedPhone | null {
  const p = parsePhoneNumberFromString(input.trim(), defaultCountry as CountryCode | undefined)
  if (!p || !p.isValid()) return null
  return {
    e164: p.number,
    country: p.country ?? defaultCountry ?? '',
    callingCode: p.countryCallingCode,
    last4: p.nationalNumber.slice(-4),
  }
}

/** "+234 ••• ••• 4521" */
export function maskPhone(callingCodeOrE164: string, last4: string): string {
  let cc = callingCodeOrE164
  if (cc.startsWith('+') && cc.length > 5) {
    const p = parsePhoneNumberFromString(cc)
    cc = p ? p.countryCallingCode : cc.slice(1, 4)
  }
  cc = cc.replace(/^\+/, '')
  return `+${cc} ••• ••• ${last4}`
}
