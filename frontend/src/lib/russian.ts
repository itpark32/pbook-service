export function plural(value: number, one: string, few: string, many: string) {
  const remainder100 = Math.abs(value) % 100;
  const remainder10 = remainder100 % 10;
  if (remainder100 >= 11 && remainder100 <= 14) return many;
  if (remainder10 === 1) return one;
  if (remainder10 >= 2 && remainder10 <= 4) return few;
  return many;
}

export const withCount = (value: number, forms: [string, string, string]) => `${value} ${plural(value, ...forms)}`;
