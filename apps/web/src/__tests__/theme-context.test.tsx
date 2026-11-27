import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { ThemeProvider, useTheme } from '@/lib/theme-context';

function ThemeProbe() {
  const { theme, setTheme, toggleTheme } = useTheme();
  return (
    <div>
      <div data-testid="theme">{theme}</div>
      <button type="button" onClick={() => setTheme('dark')}>
        Set Dark
      </button>
      <button type="button" onClick={() => setTheme('light')}>
        Set Light
      </button>
      <button type="button" onClick={toggleTheme}>
        Toggle
      </button>
    </div>
  );
}

describe('ThemeProvider & useTheme', () => {
  beforeAll(() => {
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: jest.fn().mockImplementation((query) => ({
        matches: false,
        media: query,
        onchange: null,
        addListener: jest.fn(), // deprecated
        removeListener: jest.fn(), // deprecated
        addEventListener: jest.fn(),
        removeEventListener: jest.fn(),
        dispatchEvent: jest.fn(),
      })),
    });
  });
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.className = '';
  });

  it('defaults to light theme when storage is empty', () => {
    render(
      ThemeProvider ? (
        <ThemeProvider>
          <ThemeProbe />
        </ThemeProvider>
      ) : null,
    );

    expect(screen.getByTestId('theme').textContent).toBe('light');
  });

  it('allows explicit theme setting and toggling', () => {
    render(
      <ThemeProvider>
        <ThemeProbe />
      </ThemeProvider>,
    );

    expect(screen.getByTestId('theme').textContent).toBe('light');

    fireEvent.click(screen.getByRole('button', { name: 'Set Dark' }));
    expect(screen.getByTestId('theme').textContent).toBe('dark');

    fireEvent.click(screen.getByRole('button', { name: 'Toggle' }));
    expect(screen.getByTestId('theme').textContent).toBe('light');

    fireEvent.click(screen.getByRole('button', { name: 'Set Light' }));
    expect(screen.getByTestId('theme').textContent).toBe('light');
  });

  it('loads theme from localStorage if present', () => {
    localStorage.setItem('theme', 'dark');
    render(
      <ThemeProvider>
        <ThemeProbe />
      </ThemeProvider>,
    );
    expect(screen.getByTestId('theme').textContent).toBe('dark');
  });

  it('respects defaultTheme prop', () => {
    render(
      <ThemeProvider defaultTheme="dark">
        <ThemeProbe />
      </ThemeProvider>,
    );
    expect(screen.getByTestId('theme').textContent).toBe('dark');
  });

  it('throws an error when useTheme is used outside of ThemeProvider', () => {
    const ConsoleError = console.error;
    console.error = jest.fn();

    expect(() => render(<ThemeProbe />)).toThrow();

    console.error = ConsoleError;
  });
});
