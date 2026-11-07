import { act, render, screen } from '@testing-library/react';

import { AsyncStatusAnnouncer, type AsyncStatusAnnouncement } from '@/components/ui/live-region';

describe('AsyncStatusAnnouncer', () => {
  it('keeps empty live regions mounted with polite and assertive semantics', () => {
    render(<AsyncStatusAnnouncer />);

    const polite = screen.getByTestId('async-status-polite');
    const assertive = screen.getByTestId('async-status-assertive');

    expect(polite).toHaveAttribute('role', 'status');
    expect(polite).toHaveAttribute('aria-live', 'polite');
    expect(polite).toHaveAttribute('aria-atomic', 'true');
    expect(assertive).toHaveAttribute('role', 'alert');
    expect(assertive).toHaveAttribute('aria-live', 'assertive');
    expect(assertive).toHaveAttribute('aria-atomic', 'true');
    expect(polite).toBeEmptyDOMElement();
    expect(assertive).toBeEmptyDOMElement();
  });

  it('announces loading and success once, then failures assertively', () => {
    const loading: AsyncStatusAnnouncement = {
      tone: 'loading',
      message: 'Finding payment paths…',
      key: 'paths-search',
    };
    const { rerender } = render(<AsyncStatusAnnouncer status={loading} />);

    const polite = screen.getByTestId('async-status-polite');
    const assertive = screen.getByTestId('async-status-assertive');
    expect(polite).toHaveTextContent('Finding payment paths…');

    rerender(
      <AsyncStatusAnnouncer
        status={{ tone: 'success', message: '3 payment routes found.', key: 'paths-result' }}
      />,
    );
    expect(polite).toHaveTextContent('3 payment routes found.');
    expect(assertive).toBeEmptyDOMElement();

    rerender(
      <AsyncStatusAnnouncer
        status={{ tone: 'error', message: 'Path search failed: timeout', key: 'paths-error' }}
      />,
    );
    expect(assertive).toHaveTextContent('Path search failed: timeout');
    expect(polite).toBeEmptyDOMElement();
  });

  it('does not re-announce a repeated polling result with the same key', async () => {
    const polling: AsyncStatusAnnouncement = {
      tone: 'loading',
      message: 'Refreshing watch status…',
      key: 'watch-poll',
    };
    const { rerender } = render(<AsyncStatusAnnouncer status={polling} />);
    const polite = screen.getByTestId('async-status-polite');

    expect(polite).toHaveTextContent('Refreshing watch status…');

    const mutations: MutationRecord[] = [];
    const observer = new MutationObserver((records) => mutations.push(...records));
    observer.observe(polite, { childList: true, characterData: true, subtree: true });

    rerender(<AsyncStatusAnnouncer status={{ ...polling }} />);
    await act(async () => {
      await Promise.resolve();
    });

    expect(mutations).toHaveLength(0);
    expect(polite).toHaveTextContent('Refreshing watch status…');
    observer.disconnect();
  });
});
