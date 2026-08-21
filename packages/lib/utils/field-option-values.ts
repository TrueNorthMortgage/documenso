export type TFieldOptionValue = {
  id?: number;
  value?: string;
};

export const getFieldOptionId = (option: TFieldOptionValue, fallbackIndex: number): number => {
  return option.id ?? fallbackIndex + 1;
};

export const getNextFieldOptionId = (options: TFieldOptionValue[]): number => {
  return options.reduce((nextId, option, index) => Math.max(nextId, getFieldOptionId(option, index)), 0) + 1;
};

export const getFieldOptionValue = (option: TFieldOptionValue, fallbackIndex: number): string => {
  const value = option.value?.trim();

  return value || `Option ${option.id ?? fallbackIndex + 1}`;
};
