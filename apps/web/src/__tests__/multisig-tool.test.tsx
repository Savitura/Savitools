/**
 * Multisig signer-weight and threshold simulator (Savitura/Savitools#352):
 * weight arithmetic is the API's job, so these cover the four UI states, the
 * form validation that mirrors the API's own bounds, and the exact payload.
 */
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { MultisigTool } from '@/components/tools/multisig-tool';
import { getMultisigLimits, simulateMultisig } from '@/lib/api';
import type { MultisigLimits, MultisigSimulationResult } from '@/lib/api';

jest.mock('@/lib/api', () => ({
  getMultisigLimits: jest.fn(),
  simulateMultisig: jest.fn(),
}));

const limitsMock = getMultisigLimits as jest.MockedFunction<typeof getMultisigLimits>;
const simulateMock = simulateMultisig as jest.MockedFunction<typeof simulateMultisig>;

const A = 'GA5ZSEJYB37JRC5AVCIA5MOP4RHT3VM35KCEIWI6VH5XY4O2Y5JV3CJQ';
const B = 'GBRPYHIL2CI3FNQ4BXLFMNDLFJUNPU2HY3ZMFSHONUCEOASW7QC7OX2H';
const C = 'GBRPYHIL3CI3FNQ4BXNFMNDLFJUNSU2HY3ZMFSLONUCEOASW7QC7OX2H';

const LIMITS: MultisigLimits = {
  maxSigners: 21,
  maxSignerWeight: 255,
  maxThreshold: 255,
  operationThresholds: [
    { kind: 'low', gates: 'Trustline and offer operations' },
    { kind: 'medium', gates: 'Payments and path payments' },
    { kind: 'high', gates: 'Account settings and clawbacks' },
  ],
};

const RESULT: MultisigSimulationResult = {
  threshold: 2,
  lowThreshold: 2,
  mediumThreshold: 2,
  highThreshold: 2,
  totalWeight: 4,
  signedWeight: 1,
  deficit: 1,
  surplus: 0,
  progressPercent: 50,
  satisfied: false,
  canSubmit: false,
  signers: [
    {
      key: A,
      weight: 2,
      signed: true,
      required: false,
      shareOfTotalPercent: 50,
      shareOfThresholdPercent: 100,
      controlsAccount: true,
      indispensable: true,
      redundant: false,
    },
    {
      key: B,
      weight: 1,
      signed: false,
      required: false,
      shareOfTotalPercent: 25,
      shareOfThresholdPercent: 50,
      controlsAccount: false,
      indispensable: false,
      redundant: true,
    },
  ],
  operationThresholds: [
    { kind: 'low', requiredWeight: 2, collectedWeight: 1, deficit: 1, cleared: false },
    { kind: 'medium', requiredWeight: 2, collectedWeight: 1, deficit: 1, cleared: false },
    { kind: 'high', requiredWeight: 2, collectedWeight: 1, deficit: 1, cleared: false },
  ],
  outstandingRequiredSigners: [],
  minimumSignersNeeded: [B],
  minimumSetWeight: 1,
  duplicateSigners: [],
  risks: [
    {
      code: 'SINGLE_SIGNER_CONTROLS',
      severity: 'warning',
      message: 'Signer weight 2 alone reaches the threshold of 2.',
      signers: [A],
    },
  ],
  timeBounds: {
    minTime: null,
    maxTime: null,
    notYetActive: false,
    expired: false,
    invalid: false,
  },
};

async function simulate() {
  await userEvent.click(screen.getByRole('button', { name: /^simulate$/i }));
}

/**
 * Sets a controlled field in one step. Typing into these inputs after a
 * `clear` interleaves with the shared `userEvent` queue, which makes the
 * assertions flaky; a single change event is both faster and deterministic.
 */
function setValue(input: HTMLElement, value: string) {
  fireEvent.change(input, { target: { value } });
}

describe('MultisigTool', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    limitsMock.mockResolvedValue(LIMITS);
    simulateMock.mockResolvedValue(RESULT);
  });

  it('shows an empty state before anything has been simulated', async () => {
    render(<MultisigTool />);

    expect(screen.getByRole('status')).toHaveTextContent('No simulation run yet');
    // The published bounds are fetched on mount without blocking the form.
    await waitFor(() => expect(limitsMock).toHaveBeenCalled());
  });

  it('keeps working when the published limits cannot be fetched', async () => {
    limitsMock.mockRejectedValue(new Error('API is down'));
    simulateMock.mockResolvedValue(RESULT);

    render(<MultisigTool />);

    await waitFor(() =>
      expect(screen.getByText(/could not load the published limits/i)).toBeInTheDocument(),
    );

    await simulate();
    await waitFor(() => expect(simulateMock).toHaveBeenCalled());
  });

  it('simulates the loaded 2-of-3 example and renders the findings', async () => {
    render(<MultisigTool />);

    await simulate();

    await waitFor(() => expect(simulateMock).toHaveBeenCalledTimes(1));
    expect(simulateMock).toHaveBeenCalledWith({
      threshold: 2,
      lowThreshold: undefined,
      highThreshold: undefined,
      signers: [
        { key: A, weight: 2, signed: true, required: false },
        { key: B, weight: 1, signed: true, required: false },
        { key: C, weight: 1, signed: false, required: false },
      ],
    });

    expect(screen.getByRole('table')).toHaveTextContent('50%');
    expect(screen.getByText(/Signer weight 2 alone reaches the threshold/)).toBeInTheDocument();
  });

  it('names the smallest set of signers that would close the gap', async () => {
    render(<MultisigTool />);
    await simulate();

    await waitFor(() =>
      expect(
        screen.getByText(/The smallest set that closes it/),
      ).toBeInTheDocument(),
    );
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '1');
  });

  it('says the operation is authorised once the weight clears the threshold', async () => {
    simulateMock.mockResolvedValue({
      ...RESULT,
      satisfied: true,
      canSubmit: true,
      signedWeight: 2,
      deficit: 0,
      progressPercent: 100,
      minimumSignersNeeded: [],
      risks: [],
    });

    render(<MultisigTool />);
    await simulate();

    expect(await screen.findByText(/The operation is authorised/)).toBeInTheDocument();
  });

  it('reports when no combination of the remaining signers is enough', async () => {
    simulateMock.mockResolvedValue({
      ...RESULT,
      totalWeight: 1,
      minimumSignersNeeded: null,
      risks: [
        {
          code: 'THRESHOLD_ABOVE_TOTAL_WEIGHT',
          severity: 'critical',
          message: 'Total weight 1 is below the threshold of 2.',
        },
      ],
    });

    render(<MultisigTool />);
    await simulate();

    expect(
      await screen.findByText(/No combination of the remaining signers/),
    ).toBeInTheDocument();
    expect(screen.getByText(/Total weight 1 is below the threshold/)).toBeInTheDocument();
  });

  it('shows a loading state while the quorum is being evaluated', async () => {
    let release: (value: MultisigSimulationResult) => void = () => {};
    simulateMock.mockReturnValue(
      new Promise<MultisigSimulationResult>((resolve) => {
        release = resolve;
      }),
    );

    render(<MultisigTool />);
    await simulate();

    expect(await screen.findByText(/evaluating the quorum/i)).toBeInTheDocument();

    release(RESULT);
    await waitFor(() => expect(screen.getByRole('table')).toBeInTheDocument());
  });

  it('surfaces a rejected configuration with a retry', async () => {
    simulateMock.mockRejectedValueOnce(
      new Error('signer GA5ZSEJYB37JRC5AVCIA5MOP4RHT3VM35KCEIWI6VH5XY4O2Y5JV3CJQ is required and must have weight 0'),
    );

    render(<MultisigTool />);
    await simulate();

    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent(
        'is required and must have weight 0',
      ),
    );

    await userEvent.click(screen.getByRole('button', { name: /try again/i }));
    await waitFor(() => expect(simulateMock).toHaveBeenCalledTimes(2));
  });

  it('rejects a public key that is not a Stellar account id', async () => {
    render(<MultisigTool />);

    const [first] = screen.getAllByLabelText(/^public key$/i);
    setValue(first, 'not-a-key');
    await simulate();

    expect(simulateMock).not.toHaveBeenCalled();
    expect(
      screen.getByText('Not a Stellar account id (G…)'),
    ).toBeInTheDocument();
  });

  it('rejects a required signer that also carries weight', async () => {
    render(<MultisigTool />);

    const [first] = screen.getAllByLabelText(/^public key$/i);
    setValue(first, A);
    await userEvent.click(screen.getAllByLabelText(/^required$/i)[0]);
    await simulate();

    expect(simulateMock).not.toHaveBeenCalled();
    expect(screen.getByText('A required signer has weight 0')).toBeInTheDocument();
  });

  it('rejects a weight above the published maximum', async () => {
    render(<MultisigTool />);

    const [first] = screen.getAllByLabelText(/^weight$/i);
    setValue(first, '256');
    await simulate();

    expect(simulateMock).not.toHaveBeenCalled();
    expect(screen.getByText('0–255')).toBeInTheDocument();
  });

  it('rejects a duplicated key, because Stellar would count it once', async () => {
    render(<MultisigTool />);

    const [, second] = screen.getAllByLabelText(/^public key$/i);
    setValue(second, A);
    await simulate();

    expect(simulateMock).not.toHaveBeenCalled();
    expect(
      screen.getByText(/The same key appears twice/),
    ).toBeInTheDocument();
  });

  it('adds and removes signers, refusing to remove the last one', async () => {
    render(<MultisigTool />);

    const before = screen.getAllByLabelText(/^public key$/i).length;
    await userEvent.click(screen.getByRole('button', { name: /add signer/i }));
    expect(screen.getAllByLabelText(/^public key$/i)).toHaveLength(before + 1);

    for (const label of screen.getAllByLabelText(/^remove signer/i)) {
      await userEvent.click(label);
    }
    expect(screen.getAllByLabelText(/^public key$/i)).toHaveLength(1);
    expect(screen.getByRole('button', { name: /^remove signer$/i })).toBeDisabled();
  });

  it('toggles a signature and sends the updated set of collected signatures', async () => {
    render(<MultisigTool />);

    // The example arrives with A and B already signed, so C is the one to tick.
    const boxes = screen.getAllByLabelText(/^signed$/i);
    await userEvent.click(boxes[2]);
    await simulate();

    await waitFor(() => expect(simulateMock).toHaveBeenCalled());
    expect(simulateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        signers: [
          expect.objectContaining({ key: A, signed: true }),
          expect.objectContaining({ key: B, signed: true }),
          expect.objectContaining({ key: C, signed: true }),
        ],
      }),
    );
  });
});
