import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { FluxaAuthPage } from './fluxa-auth';
import { markStepComplete } from '@/lib/onboarding';

const mockPush = jest.fn();
const mockSearchParamGet = jest.fn();

jest.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockPush,
  }),
  useSearchParams: () => ({
    get: mockSearchParamGet,
  }),
}));

jest.mock('@/lib/onboarding', () => ({
  markStepComplete: jest.fn(),
}));

describe('FluxaAuthPage Component', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSearchParamGet.mockReturnValue(null);
  });

  it('renders the auth page correctly', () => {
    render(<FluxaAuthPage />);
    expect(
      screen.getByText(/Connect your Fluxa account to use your API keys/i),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /Connect with Fluxa/i }),
    ).toBeInTheDocument();
  });

  it('marks step complete on connect click', () => {
    render(<FluxaAuthPage />);
    const button = screen.getByRole('button', { name: /Connect with Fluxa/i });
    fireEvent.click(button);
    expect(markStepComplete).toHaveBeenCalledWith('fluxa');
  });

  it('renders external link and home link correctly', () => {
    render(<FluxaAuthPage />);
    const learnLink = screen.getByRole('link', { name: /Learn about Fluxa/i });
    expect(learnLink).toHaveAttribute('href', 'https://github.com/Savitura/Fluxa');
    expect(learnLink).toHaveAttribute('target', '_blank');

    const backLink = screen.getByRole('link', { name: /Back to home/i });
    expect(backLink).toHaveAttribute('href', '/');
  });

  it('handles OAuth callback state and redirect handling', async () => {
    mockSearchParamGet.mockImplementation((param) => {
      if (param === 'code') return 'mock-oauth-code';
      return null;
    });

    render(<FluxaAuthPage />);

    expect(screen.getByText(/Authenticating with Fluxa/i)).toBeInTheDocument();

    await waitFor(() => {
      expect(markStepComplete).toHaveBeenCalledWith('fluxa');
      expect(mockPush).toHaveBeenCalledWith('/');
    });
  });

  it('handles and displays error state when OAuth returns an error', () => {
    mockSearchParamGet.mockImplementation((param) => {
      if (param === 'error') return 'access_denied';
      return null;
    });

    render(<FluxaAuthPage />);

    expect(screen.getByText(/Authentication Failed/i)).toBeInTheDocument();
    expect(screen.getByText(/access_denied/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Try Again/i })).toBeInTheDocument();
  });
});
