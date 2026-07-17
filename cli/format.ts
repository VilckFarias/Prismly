export function formatNumber(n: number): string {
  return n.toLocaleString('pt-BR');
}

export function formatCost(n: number): string {
  return `US$ ${n.toFixed(2)}`;
}

export function formatDuration(ms: number): string {
  const totalMinutes = Math.floor(Math.max(0, ms) / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours === 0) return `${minutes}min`;
  return `${hours}h ${minutes}min`;
}
