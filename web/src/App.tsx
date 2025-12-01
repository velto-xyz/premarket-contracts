import { ConnectButton } from '@rainbow-me/rainbowkit';
import { useAccount } from 'wagmi';
import { useState } from 'react';
import { MarketSelector } from './components/MarketSelector';
import { CreateMarket } from './components/CreateMarket';
import { DepositWithdraw } from './components/DepositWithdraw';
import { OpenPosition } from './components/OpenPosition';
import { PositionList } from './components/PositionList';
import { LiquidationPanel } from './components/LiquidationPanel';
import { MarketCharts } from './components/MarketCharts';
import { SimulationControls } from './components/simulation/SimulationControls';
import { TradeFeed } from './components/TradeFeed';
import './App.css';

function App() {
  const { isConnected } = useAccount();
  const [sidebarTab, setSidebarTab] = useState<'simulation' | 'trading' | 'liquidations'>('simulation');

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
            <button
              className={sidebarTab === 'simulation' ? 'active' : ''}
              onClick={() => setSidebarTab('simulation')}
              title="Trading Simulation"
            >
              🤖 Simulation
            </button>
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
            {sidebarTab === 'simulation' && <SimulationControls />}

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
