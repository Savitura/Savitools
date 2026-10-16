/**
 * Path-payment slippage lab (Savitura/Savitools#351): the four UI states the
 * issue calls for, the input validation that runs before the API is touched,
 * and the exact payload the lab sends.
 */
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { PathPaymentLabTool } from '@/components/tools/path-payment-lab-tool';
import { runPathPaymentLab } from '@/lib/api';
import type { PathPaymentLabResult } from '@/lib/api';

jest.mock('@/lib/api', () => ({
  runPathPaymentLab: jest.fn(),
}));

const runLabMock = runPathPaymentLab as jest.MockedFunction<typeof runPathPaymentLab>;

function scenario(overrides: Record<string, unknown> = {}) {
  return {
    slippagePercent: 0.5,
    guarantee: '97.5100000',
    adverseAmount: '97.0000000',
    headroom: '0.5100000',
    headroomPercent: 0.52,
    tolerableMovePercent: 0.5,
    verdict: 'pass' as const,
    ...overrides,
  };
}

const RESULT: PathPaymentLabResult = {
  network: 'testnet',
  direction: 'strict_send',
  sourceAsset: 'XLM',
  destinationAsset: 'USDC:GA5ZSEJYB37JRC5AVCIA5MOP4RHT3VM35KCEIWI6VH5XY4O2Y5JV3CJQ',
  routeCount: 2,
  route: {
    index: 0,
    pathLength: 1,
    sourceAmount: '100.0000000',
    destinationAmount: '98.0000000',
    exchangeRate: '0.98',
    fixedAmount: '100.0000000',
    variableAmount: '98.0000000',
    hops: [
      {
        assetType: 'credit_alphanum4',
        assetCode: 'USDC',
        assetIssuer: 'GA5ZSEJYB37JRC5AVCIA5MOP4RHT3VM35KCEIWI6VH5XY4O2Y5JV3CJQ',
      },
    ],
  },
  comparison: {
    direction: 'strict_send',
    guaranteeField: 'destinationMin',
    fixedAmount: '100.0000000',
    quotedVariableAmount: '98.0000000',
    adverseMovePercent: 2,
    adverseVariableAmount: '96.0000000',
    scenarios: [
      scenario({
        slippagePercent: 0.5,
        guarantee: '97.5100000',
        adverseAmount: '96.0000000',
        headroom: '1.5100000',
        headroomPercent: 1.54,
        verdict: 'pass',
      }),
      scenario({
        slippagePercent: 1,
        guarantee: '97.0200000',
        adverseAmount: '96.0000000',
        headroom: '1.0200000',
        headroomPercent: 1.04,
        verdict: 'pass',
      }),
    ],
    tightestSlippagePercent: 0.5,
    widestSlippagePercent: 1,
    recommendedSlippagePercent: 0.5,
    recommendedHeadroomPercent: 0.5,
    exceededByEveryScenario: false,
    routeDispersionPercent: null,
  },
};

async function run() {
  await userEvent.click(screen.getByRole('button', { name: /run the lab/i }));
}

describe('PathPaymentLabTool', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    runLabMock.mockResolvedValue(RESULT);
  });

  it('shows an empty state before anything has been simulated', () => {
    render(<PathPaymentLabTool />);

    expect(screen.getByRole('status')).toHaveTextContent('No simulation run yet');
  });

  it('runs with the example values and renders the comparison table', async () => {
    render(<PathPaymentLabTool />);

    await run();

    await waitFor(() => expect(runLabMock).toHaveBeenCalledTimes(1));
    const table = await screen.findByRole('table');
    // The example pair is XLM → testnet USDC, 100 XLM, tolerances 0.1/0.5/1/5.
    expect(runLabMock).toHaveBeenCalledWith(
      expect.objectContaining({
        direction: 'strict_send',
        sourceAsset: 'XLM',
        amount: '100',
        adverseMovePercent: 2,
        routeIndex: 0,
        network: 'testnet',
        slippageScenarios: [0.1, 0.5, 1, 5],
      }),
    );

    expect(within(table).getByText('97.5100000')).toBeInTheDocument();
    expect(within(table).getByText('Destination minimum')).toBeInTheDocument();
    expect(screen.getByText('Route 1 of 2')).toBeInTheDocument();
  });

  it('reports a strict receive comparison as a send maximum, not a floor', async () => {
    runLabMock.mockResolvedValue({
      ...RESULT,
      direction: 'strict_receive',
      comparison: { ...RESULT.comparison, direction: 'strict_receive', guaranteeField: 'sendMax' },
    });

    render(<PathPaymentLabTool />);
    await userEvent.selectOptions(screen.getByLabelText(/direction/i), 'strict_receive');
    await run();

    await waitFor(() => expect(runLabMock).toHaveBeenCalled());
    expect(runLabMock).toHaveBeenCalledWith(
      expect.objectContaining({ direction: 'strict_receive' }),
    );
    expect(await screen.findByText('Send maximum')).toBeInTheDocument();
  });

  it('says so plainly when every tolerance is narrower than the adverse move', async () => {
    runLabMock.mockResolvedValue({
      ...RESULT,
      comparison: {
        ...RESULT.comparison,
        recommendedSlippagePercent: null,
        recommendedHeadroomPercent: null,
        exceededByEveryScenario: true,
      },
    });

    render(<PathPaymentLabTool />);
    await run();

    expect(
      await screen.findByText(/exceeds every tolerance compared/i),
    ).toBeInTheDocument();
  });

  it('shows a loading state while the routes are being read', async () => {
    let release: (value: PathPaymentLabResult) => void = () => {};
    runLabMock.mockReturnValue(new Promise<PathPaymentLabResult>((resolve) => {
      release = resolve;
    }));

    render(<PathPaymentLabTool />);
    await run();

    expect(
      await screen.findByText(/reading live routes from horizon/i),
    ).toBeInTheDocument();

    release(RESULT);
    await waitFor(() => expect(screen.getByRole('table')).toBeInTheDocument());
  });

  it('surfaces a failure with a retry that calls the API again', async () => {
    runLabMock.mockRejectedValueOnce(new Error('No path found from XLM to USDC on testnet'));

    render(<PathPaymentLabTool />);
    await run();

    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent(
        'No path found from XLM to USDC on testnet',
      ),
    );

    await userEvent.click(screen.getByRole('button', { name: /try again/i }));
    await waitFor(() => expect(runLabMock).toHaveBeenCalledTimes(2));
  });

  it('validates the amount before spending a request on it', async () => {
    render(<PathPaymentLabTool />);

    const amount = screen.getByLabelText(/send amount/i);
    await userEvent.clear(amount);
    await userEvent.type(amount, 'abc');
    await run();

    expect(runLabMock).not.toHaveBeenCalled();
    expect(
      screen.getByText('A positive decimal with at most 7 decimals'),
    ).toBeInTheDocument();
  });

  it('rejects an asset that is neither XLM nor CODE:ISSUER', async () => {
    render(<PathPaymentLabTool />);

    const source = screen.getByLabelText(/source asset/i);
    await userEvent.clear(source);
    await userEvent.type(source, 'USDC');
    await run();

    expect(runLabMock).not.toHaveBeenCalled();
    expect(screen.getByText('Use "XLM" or "CODE:ISSUER"')).toBeInTheDocument();
  });

  it('rejects a tolerance below the 0.01% floor the API enforces', async () => {
    render(<PathPaymentLabTool />);

    const [first] = screen.getAllByLabelText(/slippage tolerance percent/i);
    await userEvent.clear(first);
    await userEvent.type(first, '0.001');
    await run();

    expect(runLabMock).not.toHaveBeenCalled();
    expect(screen.getByText('Must be at least 0.01%')).toBeInTheDocument();
  });

  it('rejects an adverse move outside 0–100%', async () => {
    render(<PathPaymentLabTool />);

    const move = screen.getByLabelText(/adverse rate move/i);
    await userEvent.clear(move);
    await userEvent.type(move, '250');
    await run();

    expect(runLabMock).not.toHaveBeenCalled();
    expect(screen.getByText('A percentage between 0 and 100')).toBeInTheDocument();
  });

  it('adds and removes tolerance inputs', async () => {
    render(<PathPaymentLabTool />);

    const before = screen.getAllByLabelText(/slippage tolerance percent/i).length;
    await userEvent.click(screen.getByRole('button', { name: /add tolerance/i }));
    expect(screen.getAllByLabelText(/slippage tolerance percent/i)).toHaveLength(before + 1);

    await userEvent.click(
      screen.getByRole('button', { name: /remove tolerance 5/i }),
    );
    expect(screen.getAllByLabelText(/slippage tolerance percent/i)).toHaveLength(before);
  });

  it('treats an emptied move as no move at all', async () => {
    render(<PathPaymentLabTool />);

    const move = screen.getByLabelText(/adverse rate move/i);
    await userEvent.clear(move);
    await run();

    await waitFor(() => expect(runLabMock).toHaveBeenCalled());
    expect(runLabMock).toHaveBeenCalledWith(
      expect.objectContaining({ adverseMovePercent: 0 }),
    );
  });

  it('resets the form to the example values', async () => {
    render(<PathPaymentLabTool />);

    const amount = screen.getByLabelText(/send amount/i);
    await userEvent.clear(amount);
    await userEvent.type(amount, '7');
    await userEvent.click(screen.getByRole('button', { name: /load example/i }));

    expect(screen.getByLabelText(/send amount/i)).toHaveValue('100');
  });
});
