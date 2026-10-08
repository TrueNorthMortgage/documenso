import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { SignatureRender } from './signature-render';

const { canvas, context, effects } = vi.hoisted(() => {
  const context = {
    clearRect: vi.fn(),
    drawImage: vi.fn(),
    fillText: vi.fn(),
    measureText: vi.fn(() => ({ width: 100 })),
    getImageData: vi.fn(() => {
      throw new DOMException('The source width is 0.', 'IndexSizeError');
    }),
  };

  return {
    context,
    canvas: { clientWidth: 0, clientHeight: 0, width: 300, height: 150, getContext: () => context },
    effects: [] as Array<() => (() => void) | undefined>,
  };
});

// Exercise the component's canvas lifecycle without requiring a browser DOM.
vi.mock('react', async (importOriginal) => ({
  ...(await importOriginal<typeof import('react')>()),
  useRef: () => ({ current: canvas }),
  useEffect: (effect: () => (() => void) | undefined) => effects.push(effect),
}));

type TestImage = { width: number; height: number; src: string; onload: (() => void) | null };
const images: TestImage[] = [];
let onResize: () => void;
const disconnect = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  effects.length = 0;
  images.length = 0;
  Object.assign(canvas, { clientWidth: 0, clientHeight: 0, width: 300, height: 150 });

  vi.stubGlobal(
    'Image',
    // biome-ignore lint/complexity/useArrowFunction: Vitest constructor mocks must be constructible.
    vi.fn(function () {
      const image: TestImage = { width: 80, height: 40, src: '', onload: null };
      images.push(image);
      return image;
    }),
  );
  vi.stubGlobal(
    'ResizeObserver',
    // biome-ignore lint/complexity/useArrowFunction: Vitest constructor mocks must be constructible.
    vi.fn(function (callback: () => void) {
      onResize = callback;
      return { observe: vi.fn(), disconnect };
    }),
  );
});

afterEach(() => vi.unstubAllGlobals());

const mount = (value = 'data:image/png;base64,test') => {
  SignatureRender({ value });
  return effects[0]();
};

describe('signature preview canvas lifecycle', () => {
  it('waits for a hidden preview to become visible before loading and drawing', () => {
    mount();
    expect(images).toHaveLength(0);

    Object.assign(canvas, { clientWidth: 320, clientHeight: 160 });
    onResize();
    images[0].onload?.();

    expect(canvas.width).toBe(640);
    expect(canvas.height).toBe(320);
    expect(context.drawImage).toHaveBeenCalledWith(images[0], 0, 0, 640, 320);
    expect(context.getImageData).not.toHaveBeenCalled();
  });

  it.each([
    { clientWidth: 0, clientHeight: 160 },
    { clientWidth: 320, clientHeight: 0 },
  ])('does not load an image when either canvas dimension is zero: %o', (dimensions) => {
    Object.assign(canvas, dimensions);
    mount();
    expect(images).toHaveLength(0);
    expect(context.drawImage).not.toHaveBeenCalled();
  });

  it('redraws at the new size and cancels stale image callbacks', () => {
    Object.assign(canvas, { clientWidth: 320, clientHeight: 160 });
    mount();
    const oldImage = images[0];

    canvas.clientWidth = 160;
    onResize();
    images[1].onload?.();

    expect(oldImage.onload).toBeNull();
    expect(canvas.width).toBe(320);
    expect(context.drawImage).toHaveBeenCalledWith(images[1], 0, 80, 320, 160);
  });

  it('renders typed signatures after the preview becomes visible', () => {
    mount('Test Signature');
    expect(context.fillText).not.toHaveBeenCalled();

    Object.assign(canvas, { clientWidth: 320, clientHeight: 160 });
    onResize();

    expect(context.fillText).toHaveBeenCalledWith('Test Signature', 320, 160);
    expect(images).toHaveLength(0);
  });

  it('disconnects the resize observer and cancels image loading on unmount', () => {
    Object.assign(canvas, { clientWidth: 320, clientHeight: 160 });
    const cleanup = mount();
    cleanup?.();

    expect(disconnect).toHaveBeenCalledOnce();
    expect(images[0].onload).toBeNull();
  });
});
