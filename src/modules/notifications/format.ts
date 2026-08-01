// Matches Python's f"{amount:,.2f}" — comma-grouped, 2 decimal places.
export function formatNaira(amount: number): string {
  return amount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
