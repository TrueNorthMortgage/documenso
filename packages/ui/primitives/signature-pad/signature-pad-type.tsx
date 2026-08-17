import {
  getSignatureFontFamily,
  isSignatureFontFamily,
  SIGNATURE_FONT_FAMILIES,
  type SignatureFontFamily,
} from '@documenso/lib/constants/signatures';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@documenso/ui/primitives/select';

import { useLingui } from '@lingui/react/macro';
import { useEffect, useRef } from 'react';

import { cn } from '../../lib/utils';

export type SignaturePadTypeProps = {
  className?: string;
  value?: string;
  defaultValue?: string;
  fontFamily: SignatureFontFamily;
  onChange: (_value: string) => void;
  onFontFamilyChange: (_value: SignatureFontFamily) => void;
};

export const SignaturePadType = ({
  className,
  value,
  defaultValue,
  fontFamily,
  onChange,
  onFontFamilyChange,
}: SignaturePadTypeProps) => {
  const { t } = useLingui();

  const $isDirty = useRef(false);
  // Colors don't actually work for text.

  useEffect(() => {
    if (!$isDirty.current && !value && defaultValue) {
      $isDirty.current = true;
      onChange(defaultValue);
    }
  }, [defaultValue, value, onChange]);

  return (
    <div className={cn('relative flex h-full w-full items-center justify-center', className)}>
      <Select
        value={fontFamily}
        onValueChange={(selectedFont) => {
          if (isSignatureFontFamily(selectedFont)) {
            onFontFamilyChange(selectedFont);
          }
        }}
      >
        <SelectTrigger className="absolute top-3 right-3 z-10 w-auto min-w-36 bg-background px-3">
          <SelectValue />
        </SelectTrigger>
        <SelectContent position="popper">
          {Object.entries(SIGNATURE_FONT_FAMILIES).map(([value, font]) => (
            <SelectItem key={value} value={value} style={{ fontFamily: font.cssFamily }}>
              {font.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <input
        data-testid="signature-pad-type-input"
        placeholder={t`Type your signature`}
        className="w-full bg-transparent px-4 text-center text-7xl text-black placeholder:text-4xl focus-visible:outline-none focus-visible:ring-0 focus-visible:ring-offset-0 dark:text-white"
        style={{ fontFamily: getSignatureFontFamily(fontFamily).cssFamily }}
        // style={{ color: selectedColor }}
        value={value}
        onChange={(event) => {
          onChange(event.target.value.trimStart());
          $isDirty.current = true;
        }}
        autoComplete="off"
        autoCorrect="off"
        autoCapitalize="off"
        spellCheck={false}
      />

      {/* <SignaturePadColorPicker selectedColor={selectedColor} setSelectedColor={setSelectedColor} /> */}
    </div>
  );
};
