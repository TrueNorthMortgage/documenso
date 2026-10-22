import { describe, expect, it, vi } from 'vitest';

import { createInitialsSession } from './initials-session';

describe('signing initials confirmation', () => {
  it('prompts even with a full name and reuses the override across fields', async () => {
    const prompt = vi.fn().mockResolvedValue('TW');
    const { requestInitials } = createInitialsSession(prompt);

    expect(await requestInitials(1, 'Tom')).toBe('TW');
    expect(await requestInitials(1, 'Tom Williams')).toBe('TW');
    expect(prompt).toHaveBeenCalledExactlyOnceWith('T');
  });

  it('prefills all name initials and supports an empty name', async () => {
    const prompt = vi.fn().mockResolvedValue('CUSTOM');
    const { requestInitials } = createInitialsSession(prompt);

    await requestInitials(1, 'John Ronald Reuel Tolkien');
    await requestInitials(2, '');

    expect(prompt.mock.calls).toEqual([['JRRT'], ['']]);
  });

  it('prompts again after cancellation', async () => {
    const prompt = vi.fn().mockResolvedValueOnce(null).mockResolvedValueOnce('TW');
    const { requestInitials } = createInitialsSession(prompt);

    expect(await requestInitials(1, 'Tom')).toBeNull();
    expect(await requestInitials(1, 'Tom')).toBe('TW');
    expect(prompt).toHaveBeenCalledTimes(2);
  });

  it('keeps assistant targets and signing sessions separate', async () => {
    const prompt = vi.fn().mockResolvedValueOnce('TW').mockResolvedValueOnce('JS').mockResolvedValueOnce('TA');
    const { requestInitials } = createInitialsSession(prompt);

    expect(await requestInitials(1, 'Tom')).toBe('TW');
    expect(await requestInitials(2, 'Jane')).toBe('JS');
    expect(await requestInitials(1, 'Tom')).toBe('TW');
    expect(await createInitialsSession(prompt).requestInitials(1, 'Tom')).toBe('TA');
    expect(prompt).toHaveBeenCalledTimes(3);
  });

  it('shares a pending confirmation across rapid field clicks', async () => {
    let confirm: (value: string) => void = () => {};
    const prompt = vi.fn(
      () =>
        new Promise<string>((resolve) => {
          confirm = resolve;
        }),
    );
    const { requestInitials } = createInitialsSession(prompt);

    const first = requestInitials(1, 'Tom');
    const second = requestInitials(1, 'Tom');
    expect(second).toBe(first);
    confirm('TW');

    expect(await Promise.all([first, second])).toEqual(['TW', 'TW']);
    expect(prompt).toHaveBeenCalledTimes(1);
  });

  it('allows retry after a failed dialog', async () => {
    const prompt = vi.fn().mockRejectedValueOnce(new Error('Dialog failed')).mockResolvedValueOnce('TW');
    const { requestInitials } = createInitialsSession(prompt);

    await expect(requestInitials(1, 'Tom')).rejects.toThrow('Dialog failed');
    expect(await requestInitials(1, 'Tom')).toBe('TW');
  });
  it('reuses corrected initials without opening the first-field dialog again', async () => {
    const prompt = vi.fn().mockResolvedValue('T');
    const onChange = vi.fn();
    const { requestInitials, setInitials } = createInitialsSession(prompt, onChange);

    await requestInitials(1, 'Tom');
    setInitials(1, 'TW');

    expect(await requestInitials(1, 'Tom')).toBe('TW');
    expect(prompt).toHaveBeenCalledTimes(1);
    expect(onChange.mock.calls).toEqual([
      [1, 'T'],
      [1, 'TW'],
    ]);
  });

  it('keeps a correction separate from another assistant target', async () => {
    const prompt = vi.fn().mockResolvedValue('JS');
    const { requestInitials, setInitials } = createInitialsSession(prompt);

    setInitials(1, 'TW');

    expect(await requestInitials(2, 'Jane Smith')).toBe('JS');
    expect(await requestInitials(1, 'Tom')).toBe('TW');
    expect(prompt).toHaveBeenCalledExactlyOnceWith('JS');
  });
});
