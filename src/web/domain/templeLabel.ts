import { templeRoster } from './templeRoster';

export function templeLabelColor(name: string): string | undefined {
  const sect = templeRoster.find((temple) => temple.name === name.trim())?.details[2];
  if (sect === '格鲁派') return '#d32f2f';
  if (sect === '噶举派') return '#7b1fa2';
  return undefined;
}