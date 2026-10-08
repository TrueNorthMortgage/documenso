import {
  DEFAULT_SIGNATURE_FONT_FAMILY,
  getSignatureFontFamily,
  isBase64Image,
  SIGNATURE_CANVAS_DPI,
  type SignatureFontFamily,
} from '@documenso/lib/constants/signatures';
import { useEffect, useRef } from 'react';

import { cn } from '../../lib/utils';

export type SignatureRenderProps = {
  className?: string;
  value: string;
  signatureFont?: SignatureFontFamily;
};

/**
 * Renders a typed, uploaded or drawn signature.
 */
export const SignatureRender = ({
  className,
  value,
  signatureFont = DEFAULT_SIGNATURE_FONT_FAMILY,
}: SignatureRenderProps) => {
  const $el = useRef<HTMLCanvasElement>(null);

  const renderTypedSignature = () => {
    if (!$el.current) {
      return;
    }

    const ctx = $el.current.getContext('2d');

    if (!ctx) {
      return;
    }

    ctx.clearRect(0, 0, $el.current.width, $el.current.height);

    const canvasWidth = $el.current.width;
    const canvasHeight = $el.current.height;
    const fontFamily = getSignatureFontFamily(signatureFont).cssFamily;

    ctx.clearRect(0, 0, canvasWidth, canvasHeight);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    // ctx.fillStyle = selectedColor; // Todo: Color not implemented...

    // Calculate the desired width (25ch)
    const desiredWidth = canvasWidth * 0.85; // 85% of canvas width

    // Start with a base font size
    let fontSize = 18;
    ctx.font = `${fontSize}px ${fontFamily}`;

    // Measure 10 characters and calculate scale factor
    const characterWidth = ctx.measureText('m'.repeat(10)).width;
    const scaleFactor = desiredWidth / characterWidth;

    // Apply scale factor to font size
    fontSize = fontSize * scaleFactor;

    // Adjust font size if it exceeds canvas width
    ctx.font = `${fontSize}px ${fontFamily}`;

    const textWidth = ctx.measureText(value).width;

    if (textWidth > desiredWidth) {
      fontSize = fontSize * (desiredWidth / textWidth);
    }

    // Set final font and render text
    ctx.font = `${fontSize}px ${fontFamily}`;
    ctx.fillText(value, canvasWidth / 2, canvasHeight / 2);
  };

  const renderImageSignature = () => {
    if (!$el.current || typeof value !== 'string') {
      return;
    }

    const ctx = $el.current.getContext('2d');

    if (!ctx) {
      return;
    }

    ctx.clearRect(0, 0, $el.current.width, $el.current.height);

    const { width, height } = $el.current;

    const img = new Image();

    img.onload = () => {
      if (!img.width || !img.height) {
        return;
      }

      // Calculate the scaled dimensions while maintaining aspect ratio
      const scale = Math.min(width / img.width, height / img.height);
      const scaledWidth = img.width * scale;
      const scaledHeight = img.height * scale;

      // Calculate center position
      const x = (width - scaledWidth) / 2;
      const y = (height - scaledHeight) / 2;

      ctx?.drawImage(img, x, y, scaledWidth, scaledHeight);
    };

    img.src = value;

    return () => {
      img.onload = null;
    };
  };

  useEffect(() => {
    const canvas = $el.current;

    if (!canvas) {
      return;
    }

    let cancelImageLoad: (() => void) | undefined;

    const renderSignature = () => {
      cancelImageLoad?.();

      const width = canvas.clientWidth * SIGNATURE_CANVAS_DPI;
      const height = canvas.clientHeight * SIGNATURE_CANVAS_DPI;

      // Hidden previews have no drawable area. Render when layout becomes visible.
      if (!width || !height) {
        return;
      }

      canvas.width = width;
      canvas.height = height;

      if (isBase64Image(value)) {
        cancelImageLoad = renderImageSignature();
      } else {
        renderTypedSignature();
      }
    };

    renderSignature();

    const observer = new ResizeObserver(renderSignature);
    observer.observe(canvas);

    return () => {
      observer.disconnect();
      cancelImageLoad?.();
    };
  }, [signatureFont, value]);

  return (
    <canvas
      ref={$el}
      className={cn('h-full w-full dark:hue-rotate-180 dark:invert', className)}
      style={{ touchAction: 'none' }}
    />
  );
};
