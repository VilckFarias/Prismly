import electron from 'electron';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { CurrencySettings } from '../shared/types';

const DEFAULT_CURRENCY: CurrencySettings = {
  selected: 'usd',
  rate: null,
  fetchedAt: null,
};

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

function getCurrencyFilePath(): string {
  return join(electron.app.getPath('userData'), 'currency.json');
}

export function saveCurrencySettings(settings: CurrencySettings): void {
  writeFileSync(getCurrencyFilePath(), JSON.stringify(settings));
}

export function loadCurrencySettings(): CurrencySettings {
  const filePath = getCurrencyFilePath();
  if (!existsSync(filePath)) return DEFAULT_CURRENCY;

  try {
    const parsed = JSON.parse(readFileSync(filePath, 'utf-8')) as CurrencySettings;
    if (
      (parsed.selected !== 'usd' && parsed.selected !== 'brl') ||
      (typeof parsed.rate !== 'number' && parsed.rate !== null) ||
      (typeof parsed.fetchedAt !== 'string' && parsed.fetchedAt !== null)
    ) {
      return DEFAULT_CURRENCY;
    }
    return parsed;
  } catch {
    return DEFAULT_CURRENCY;
  }
}

export function shouldFetchExchangeRate(current: CurrencySettings, now: number = Date.now()): boolean {
  return (
    current.rate === null ||
    current.fetchedAt === null ||
    Number.isNaN(Date.parse(current.fetchedAt)) ||
    now - new Date(current.fetchedAt).getTime() > ONE_DAY_MS
  );
}

export async function refreshExchangeRateIfNeeded(): Promise<void> {
  const current = loadCurrencySettings();
  if (!shouldFetchExchangeRate(current)) return;

  try {
    const response = await fetch('https://economia.awesomeapi.com.br/json/last/USD-BRL');
    const data = (await response.json()) as { USDBRL: { bid: string } };
    const rate = Number(data.USDBRL.bid);
    if (!Number.isFinite(rate)) return;
    saveCurrencySettings({ ...current, rate, fetchedAt: new Date().toISOString() });
  } catch {
    // Sem internet ou API fora do ar -- mantém o que já tinha salvo, nunca trava o app.
  }
}
