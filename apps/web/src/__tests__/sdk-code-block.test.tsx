/**
 * SDK code block rendering and copy feedback (Savitura/Savitools#694).
 */
import { act, fireEvent, render, screen } from '@testing-library/react';

import { SdkCodeBlock } from '@/components/SdkCodeBlock';

const writeText = jest.fn().mockResolvedValue(undefined);

beforeAll(() => {
  Object.defineProperty(navigator, 'clipboard', {
    value: { writeText },
    configurable: true,
  });
});

beforeEach(() => {
  writeText.mockClear();
});

afterEach(() => {
  jest.useRealTimers();
});

describe('SdkCodeBlock', () => {
  it('renders the provided code inside a syntax-highlighted block', () => {
    const { container } = render(
      <SdkCodeBlock code="const answer = 42;" language="typescript" />,
    );

    const block = container.querySelector('code');
    expect(block).not.toBeNull();
    expect(block).toHaveTextContent('const answer = 42;');
    expect(block).toHaveClass('language-typescript');
  });

  it.each([
    ['javascript', 'language-typescript'],
    ['typescript', 'language-typescript'],
    ['TypeScript', 'language-typescript'],
    ['python', 'language-python'],
    ['go', 'language-go'],
    ['curl', 'language-bash'],
    ['unknown-language', 'language-typescript'],
  ])('maps the %s label to the %s Prism grammar', (language, expectedClass) => {
    const { container } = render(<SdkCodeBlock code="echo hi" language={language} />);

    expect(container.querySelector('code')).toHaveClass(expectedClass);
  });

  it('copies the raw code to the clipboard and shows confirmation', async () => {
    const { container } = render(<SdkCodeBlock code="stellar tx" language="go" />);

    expect(container.querySelector('.lucide-copy')).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByTitle('Copy code'));
    });

    expect(writeText).toHaveBeenCalledWith('stellar tx');
    expect(container.querySelector('.lucide-check')).toBeInTheDocument();
    expect(container.querySelector('.lucide-copy')).not.toBeInTheDocument();
  });

  it('reverts the copy confirmation after two seconds', async () => {
    jest.useFakeTimers();
    const { container } = render(<SdkCodeBlock code="stellar tx" language="go" />);

    await act(async () => {
      fireEvent.click(screen.getByTitle('Copy code'));
    });
    expect(container.querySelector('.lucide-check')).toBeInTheDocument();

    await act(async () => {
      jest.advanceTimersByTime(2000);
    });

    expect(container.querySelector('.lucide-check')).not.toBeInTheDocument();
    expect(container.querySelector('.lucide-copy')).toBeInTheDocument();
  });

  it('copies the current code after the code prop changes', async () => {
    const { rerender } = render(<SdkCodeBlock code="first version" language="curl" />);

    rerender(<SdkCodeBlock code="second version" language="curl" />);

    await act(async () => {
      fireEvent.click(screen.getByTitle('Copy code'));
    });

    expect(writeText).toHaveBeenCalledWith('second version');
  });
});
