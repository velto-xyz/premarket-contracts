/**
 * Format a number with commas and specified decimals
 */
export function formatNumber(value: number | string, decimals: number = 2): string {
  const num = typeof value === 'string' ? parseFloat(value) : value;

  if (isNaN(num)) return '0.00';

  return num.toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

/**
 * Format a BigInt value with decimals
 */
export function formatBigInt(value: bigint, decimals: number = 18, displayDecimals: number = 2): string {
  const divisor = 10n ** BigInt(decimals);
  const wholePart = value / divisor;
  const fractionalPart = value % divisor;

  // Convert to number for formatting
  const num = Number(wholePart) + Number(fractionalPart) / Number(divisor);

  return formatNumber(num, displayDecimals);
}

/**
 * Format USD value
 */
export function formatUSD(value: number | string, decimals: number = 2): string {
  return `$${formatNumber(value, decimals)}`;
}

/**
 * Format percentage
 */
export function formatPercent(value: number, decimals: number = 2): string {
  return `${formatNumber(value, decimals)}%`;
}

/**
 * Compact number format (1.2K, 3.5M, etc)
 */
export function formatCompact(value: number): string {
  if (Math.abs(value) >= 1e9) {
    return `${formatNumber(value / 1e9, 2)}B`;
  }
  if (Math.abs(value) >= 1e6) {
    return `${formatNumber(value / 1e6, 2)}M`;
  }
  if (Math.abs(value) >= 1e3) {
    return `${formatNumber(value / 1e3, 2)}K`;
  }
  return formatNumber(value, 2);
}
