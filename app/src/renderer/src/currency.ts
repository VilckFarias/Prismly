import type { CurrencySettings } from '../../shared/types';

export function formatCost(usdAmount: number, currency: CurrencySettings): string {
  if (currency.selected === 'brl' && currency.rate !== null) {
    const brlAmount = (usdAmount * currency.rate).toLocaleString('pt-BR', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
    return `R$ ${brlAmount}`;
  }
  return `US$ ${usdAmount.toFixed(2)}`;
}
