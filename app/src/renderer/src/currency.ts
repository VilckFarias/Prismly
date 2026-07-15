import type { CurrencySettings } from '../../shared/types';

export function formatCost(usdAmount: number, currency: CurrencySettings): string {
  if (currency.selected === 'brl' && currency.rate !== null) {
    return `R$ ${(usdAmount * currency.rate).toFixed(2)}`;
  }
  return `US$ ${usdAmount.toFixed(2)}`;
}
