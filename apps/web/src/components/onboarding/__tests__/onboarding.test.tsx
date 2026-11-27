import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { EcosystemStrip } from '../ecosystem-strip';
import { QuickstartChecklist } from '../quickstart-checklist';
import { QuickstartWidget } from '../quickstart-widget';

describe('Onboarding components tests', () => {
  it('renders EcosystemStrip with ecosystem links', () => {
    render(<EcosystemStrip />);
    const links = screen.getAllByRole('link');
    expect(links.length).toBeGreaterThan(0);
    links.forEach((link) => {
      expect(link).toHaveAttribute('href');
    });
  });

  it('verifies checklist step completion', () => {
    const onToggleStep = jest.fn();
    const steps = [
      { id: '1', title: 'Step One', completed: false, href: '/step-1' },
      { id: '2', title: 'Step Two', completed: true, href: '/step-2' },
    ];

    render(<QuickstartChecklist steps={steps} onToggleStep={onToggleStep} />);
    expect(screen.getByText('Step One')).toBeInTheDocument();
    expect(screen.getByText('Step Two')).toBeInTheDocument();

    const checkboxes = screen.getAllByRole('checkbox');
    expect(checkboxes[0]).not.toBeChecked();
    expect(checkboxes[1]).toBeChecked();

    fireEvent.click(checkboxes[0]);
    expect(onToggleStep).toHaveBeenCalledWith('1');
  });

  it('verifies dismissal state in QuickstartWidget', () => {
    const onDismiss = jest.fn();
    const { container, rerender } = render(
      <QuickstartWidget dismissed={false} onDismiss={onDismiss} steps={[]} />
    );
    expect(container.firstChild).not.toBeNull();

    const dismissButton = screen.queryByRole('button', { name: /dismiss|close|hide/i }) || screen.getByTestId('dismiss-quickstart');
    if (dismissButton) {
      fireEvent.click(dismissButton);
      expect(onDismiss).toHaveBeenCalled();
    }

    rerender(<QuickstartWidget dismissed={true} onDismiss={onDismiss} steps={[]} />);
    // When dismissed, the widget should either not render or render null/hidden state
    expect(screen.queryByText(/quickstart/i)).not.toBeInTheDocument();
  });
});
