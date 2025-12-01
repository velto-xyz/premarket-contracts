import { useState } from 'react';
import { useAccount, useReadContract, useWriteContract, useWaitForTransactionReceipt } from 'wagmi';
import { ConnectButton } from '@rainbow-me/rainbowkit';
import { parseUnits, formatUnits } from 'viem';
import { useMarketStore } from '../store/marketStore';
import { ABIS } from '../contract-api';

const USDC_ADDRESS = import.meta.env.VITE_USDC_ADDRESS as `0x${string}`;

export function DepositWithdraw() {
  const { address, isConnected } = useAccount();
  const { selectedMarket } = useMarketStore();
  const [amount, setAmount] = useState('');
  const [isDeposit, setIsDeposit] = useState(true);
  const [status, setStatus] = useState('');

  const { data: usdcBalance } = useReadContract({
    address: USDC_ADDRESS,
    abi: ABIS.MockUSDC,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
  });

  const { data: allowance } = useReadContract({
    address: USDC_ADDRESS,
    abi: ABIS.MockUSDC,
    functionName: 'allowance',
    args: address && selectedMarket ? [address, selectedMarket as `0x${string}`] : undefined,
  });

  const { data: walletBalance } = useReadContract({
    address: selectedMarket as `0x${string}`,
    abi: ABIS.PerpEngine,
    functionName: 'getWalletBalance',
    args: address ? [address] : undefined,
  });

  const { writeContract, data: txHash } = useWriteContract();
  const { isLoading: isTxPending } = useWaitForTransactionReceipt({ hash: txHash });

  const handleDeposit = async () => {
    if (!amount || !selectedMarket || !address) return;

    try {
      const usdcAmount = parseUnits(amount, 6); // USDC has 6 decimals

      // Check if approval is needed
      const currentAllowance = allowance || 0n;
      if (currentAllowance < usdcAmount) {
        setStatus('Approving USDC...');
        await new Promise<void>((resolve, reject) => {
          writeContract(
            {
              address: USDC_ADDRESS,
              abi: ABIS.MockUSDC,
              functionName: 'approve',
              args: [selectedMarket as `0x${string}`, usdcAmount],
            },
            {
              onSuccess: () => {
                setStatus('Approval confirmed, depositing...');
                setTimeout(() => resolve(), 2000); // Wait for approval to be mined
              },
              onError: (error) => {
                setStatus(`Approval failed: ${error.message}`);
                reject(error);
              },
            }
          );
        });
      }

      // Now deposit
      setStatus('Depositing...');
      writeContract(
        {
          address: selectedMarket as `0x${string}`,
          abi: ABIS.PerpEngine,
          functionName: 'deposit',
          args: [usdcAmount],
        },
        {
          onSuccess: () => {
            setStatus('Deposit successful!');
            setAmount('');
            setTimeout(() => setStatus(''), 3000);
          },
          onError: (error) => {
            setStatus(`Deposit failed: ${error.message}`);
          },
        }
      );
    } catch (error: any) {
      console.error('Deposit flow error:', error);
      setStatus('');
    }
  };

  const handleWithdraw = () => {
    if (!amount || !selectedMarket) return;
    setStatus('Withdrawing...');
    const internalAmount = parseUnits(amount, 18); // Internal uses 18 decimals
    writeContract(
      {
        address: selectedMarket as `0x${string}`,
        abi: ABIS.PerpEngine,
        functionName: 'withdraw',
        args: [internalAmount],
      },
      {
        onSuccess: () => {
          setStatus('Withdrawal successful!');
          setAmount('');
          setTimeout(() => setStatus(''), 3000);
        },
        onError: (error) => {
          setStatus(`Withdrawal failed: ${error.message}`);
        },
      }
    );
  };

  if (!selectedMarket) {
    return <div className="deposit-withdraw">Select a market first</div>;
  }

  if (!isConnected) {
    return (
      <div className="deposit-withdraw">
        <h2>Wallet</h2>
        <div className="connect-prompt">
          <p>Connect your wallet to deposit or withdraw</p>
          <ConnectButton />
        </div>
      </div>
    );
  }

  return (
    <div className="deposit-withdraw">
      <h2>Wallet</h2>

      <div className="balances">
        <p>USDC Balance: {usdcBalance ? formatUnits(usdcBalance, 6) : '0'} USDC</p>
        <p>Engine Balance: {walletBalance ? formatUnits(walletBalance, 18) : '0'} USDC</p>
      </div>

      <div className="deposit-withdraw-form">
        <div className="tabs">
          <button
            className={isDeposit ? 'active' : ''}
            onClick={() => setIsDeposit(true)}
          >
            Deposit
          </button>
          <button
            className={!isDeposit ? 'active' : ''}
            onClick={() => setIsDeposit(false)}
          >
            Withdraw
          </button>
        </div>

        <input
          type="number"
          placeholder="Amount (USDC)"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          step="0.01"
        />

        {status && <div className="status-message">{status}</div>}

        {isDeposit ? (
          <button onClick={handleDeposit} disabled={isTxPending || !amount}>
            {isTxPending ? 'Processing...' : 'Deposit'}
          </button>
        ) : (
          <button onClick={handleWithdraw} disabled={isTxPending || !amount}>
            {isTxPending ? 'Processing...' : 'Withdraw'}
          </button>
        )}
      </div>
    </div>
  );
}
