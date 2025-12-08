import { ConnectButton } from '@rainbow-me/rainbowkit';
import { useAccount, useChainId } from 'wagmi';
import { useState, useEffect } from 'react';
import { MarketSelector } from './components/MarketSelector';
import { CreateMarket } from './components/CreateMarket';
import { DepositWithdraw } from './components/DepositWithdraw';
import { OpenPosition } from './components/OpenPosition';
import { PositionList } from './components/PositionList';
import { LiquidationPanel } from './components/LiquidationPanel';
import { MarketCharts } from './components/MarketCharts';
import { SimulationControls } from './components/simulation/SimulationControls';
import { TradeFeed } from './components/TradeFeed';
import { usePositionSync } from './hooks/usePositionSync';
import './App.css';

const ANVIL_CHAIN_ID = 31337;

function App() {
  const { isConnected } = useAccount();
  const chainId = useChainId();
  const isAnvil = chainId === ANVIL_CHAIN_ID;

  const [sidebarTab, setSidebarTab] = useState<'simulation' | 'trading' | 'liquidations'>(
    isAnvil ? 'simulation' : 'trading'
  );

  // Switch to trading tab when switching away from Anvil
  useEffect(() => {
    if (!isAnvil && sidebarTab === 'simulation') {
      setSidebarTab('trading');
    }
  }, [isAnvil, sidebarTab]);

  // Centralized position/trade sync - called once at app level
  usePositionSync();

  return (
    <div className="app">
      <header className="app-header">
        <div className="header-left">
          <h1>Perp DEX</h1>
          <MarketSelector />
          <CreateMarket />
        </div>
        <ConnectButton />
      </header>

      <main className="app-main">
        {/* Main Content - Full Width Charts, Stats, Trades */}
        <div className="main-content">
          <div className="content-grid">
            {/* Charts Section */}
            <div className="charts-section">
              <MarketCharts />
            </div>

            {/* Stats & Activity Section */}
            <div className="activity-section">
              <TradeFeed />
              <PositionList />
            </div>
          </div>
        </div>

        {/* Right Sidebar - Tabbed Tools */}
        <aside className="sidebar">
          <div className="sidebar-tabs">
            {isAnvil && (
              <button
                className={sidebarTab === 'simulation' ? 'active' : ''}
                onClick={() => setSidebarTab('simulation')}
                title="Trading Simulation (Anvil only)"
              >
                🤖 Simulation
              </button>
            )}
            <button
              className={sidebarTab === 'trading' ? 'active' : ''}
              onClick={() => setSidebarTab('trading')}
              title="Open Positions"
            >
              📈 Trading
            </button>
            <button
              className={sidebarTab === 'liquidations' ? 'active' : ''}
              onClick={() => setSidebarTab('liquidations')}
              title="Liquidation Bot"
            >
              ⚠️ Liquidations
            </button>
          </div>

          <div className="sidebar-content">
            {isAnvil && sidebarTab === 'simulation' && <SimulationControls />}

            {sidebarTab === 'trading' && (
              <div className="trading-panel">
                <DepositWithdraw />
                <OpenPosition />
              </div>
            )}

            {sidebarTab === 'liquidations' && <LiquidationPanel />}
          </div>
        </aside>
      </main>
    </div>
  );
}

export default App;
