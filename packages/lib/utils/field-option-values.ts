export type TFieldOptionValue = {
  id?: number;
  value?: string;
};

export const getFieldOptionValue = (option: TFieldOptionValue, fallbackIndex: number): string => {
  const value = option.value?.trim();

  return value || `Option ${option.id ?? fallbackIndex + 1}`;
};
