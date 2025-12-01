import { useState } from 'react';
import { useSimulationStore } from '../../simulation/store/simulationStore';
import { SCENARIOS, type ScenarioType } from '../../simulation/scenarios';
import { SimulationEngine } from '../../simulation/core/SimulationEngine';
import { useMarketStore } from '../../store/marketStore';
import { formatUnits } from 'viem';
import { ABIS } from '../../contract-api';

/**
 * SimulationControls: UI panel for controlling bot trading simulation
 * - Start/Pause/Stop/Reset buttons
 * - Scenario selector
 * - Bot count and speed controls
 * - Live stats display
 */
export function SimulationControls() {
  const {
    status,
    config,
    stats,
    start,
    pause,
    stop,
    reset,
    setConfig,
  } = useSimulationStore();

  const { selectedMarket } = useMarketStore();
  const [isExpanded, setIsExpanded] = useState(true);
  const [engine, setEngine] = useState<SimulationEngine | null>(null);

  const handleStart = async () => {
    if (status === 'stopped' && selectedMarket) {
      // Get contract addresses from env
      const usdcAddress = import.meta.env.VITE_USDC_ADDRESS as `0x${string}`;

      if (!selectedMarket || !usdcAddress) {
        console.error('Missing contract addresses');
        return;
      }

      console.log('🎮 Initializing simulation engine...');
      console.log('  Market:', selectedMarket);
      console.log('  USDC:', usdcAddress);

      // Create new engine instance
      const newEngine = new SimulationEngine(
        selectedMarket as `0x${string}`,
        usdcAddress,
        ABIS.PerpEngine,
        ABIS.MockUSDC
      );

      const initialized = await newEngine.initialize();
      if (initialized) {
        setEngine(newEngine);
        newEngine.start();
        start();
        console.log('✅ Simulation started successfully');
      } else {
        console.error('❌ Failed to initialize simulation engine');
      }
    } else if (status === 'paused' && engine) {
      engine.start();
      start();
    }
  };

  const handlePause = () => {
    if (engine) {
      engine.pause();
      pause();
    }
  };

  const handleStop = async () => {
    if (engine) {
      await engine.stop();
      setEngine(null);
      stop();
    }
  };

  const handleReset = async () => {
    await handleStop();
    reset();
  };

  const handleScenarioChange = (scenario: ScenarioType) => {
    if (status === 'stopped') {
      const scenarioConfig = SCENARIOS[scenario];
      setConfig({
        scenario,
        botCount: scenarioConfig.botCount,
      });
    }
  };

  const handleBotCountChange = (count: number) => {
    if (status === 'stopped') {
      setConfig({ botCount: count });
    }
  };

  const handleSpeedChange = (speed: number) => {
    setConfig({ speedMultiplier: speed });
    // If running, restart with new speed
    if (status === 'running' && engine) {
      engine.pause();
      engine.start();
    }
  };

  const formatVolume = (volume: bigint): string => {
    const num = Number(formatUnits(volume, 18));
    if (num >= 1_000_000) return `$${(num / 1_000_000).toFixed(2)}M`;
    if (num >= 1_000) return `$${(num / 1_000).toFixed(2)}K`;
    return `$${num.toFixed(2)}`;
  };

  const formatPnL = (pnl: bigint): string => {
    const num = Number(formatUnits(pnl, 18));
    const sign = num >= 0 ? '+' : '';

    if (Math.abs(num) >= 1_000_000) {
      return `${sign}$${(num / 1_000_000).toFixed(2)}M`;
    }
    if (Math.abs(num) >= 1_000) {
      return `${sign}$${(num / 1_000).toFixed(2)}K`;
    }
    return `${sign}$${num.toFixed(2)}`;
  };

  const getUptime = (): string => {
    if (!stats.startTime) return '0s';
    const elapsed = Math.floor((Date.now() - stats.startTime) / 1000);
    const minutes = Math.floor(elapsed / 60);
    const seconds = elapsed % 60;
    if (minutes > 0) return `${minutes}m ${seconds}s`;
    return `${seconds}s`;
  };

  const selectedScenario = SCENARIOS[config.scenario];

  return (
    <div className="simulation-controls">
      <div className="simulation-header" onClick={() => setIsExpanded(!isExpanded)}>
        <div className="simulation-title">
          <span className="simulation-icon">🤖</span>
          <h3>Trading Simulation</h3>
          <span className={`simulation-status status-${status}`}>
            {status === 'running' ? '● RUNNING' : status === 'paused' ? '❚❚ PAUSED' : '○ STOPPED'}
          </span>
        </div>
        <button className="expand-toggle">
          {isExpanded ? '▼' : '▶'}
        </button>
      </div>

      {isExpanded && (
        <div className="simulation-content">
          {/* Control Buttons */}
          <div className="control-buttons">
            <button
              onClick={handleStart}
              disabled={status === 'running'}
              className="btn-start"
            >
              {status === 'paused' ? 'Resume' : 'Start'}
            </button>
            <button
              onClick={handlePause}
              disabled={status !== 'running'}
              className="btn-pause"
            >
              Pause
            </button>
            <button
              onClick={handleStop}
              disabled={status === 'stopped'}
              className="btn-stop"
            >
              Stop
            </button>
            <button
              onClick={handleReset}
              disabled={status === 'running'}
              className="btn-reset"
            >
              Reset
            </button>
          </div>

          {/* Configuration Panel */}
          <div className="config-panel">
            <div className="config-row">
              <label>Scenario:</label>
              <select
                value={config.scenario}
                onChange={(e) => handleScenarioChange(e.target.value as ScenarioType)}
                disabled={status !== 'stopped'}
                className="scenario-select"
              >
                {Object.entries(SCENARIOS).map(([key, scenario]) => (
                  <option key={key} value={key}>
                    {scenario.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="config-row">
              <label>Bot Count: {config.botCount}</label>
              <input
                type="range"
                min="1"
                max="5"
                value={config.botCount}
                onChange={(e) => handleBotCountChange(Number(e.target.value))}
                disabled={status !== 'stopped'}
                className="slider"
              />
            </div>

            <div className="config-row">
              <label>Speed: {config.speedMultiplier}x</label>
              <input
                type="range"
                min="1"
                max="10"
                value={config.speedMultiplier}
                onChange={(e) => handleSpeedChange(Number(e.target.value))}
                className="slider"
              />
            </div>
          </div>

          {/* Scenario Info */}
          <div className="scenario-info">
            <h4>{selectedScenario.name}</h4>
            <p className="scenario-description">{selectedScenario.description}</p>
            <div className="scenario-params">
              <span>Leverage: {selectedScenario.leverage[0]}-{selectedScenario.leverage[1]}x</span>
              <span>Position: ${selectedScenario.positionSize[0]}-${selectedScenario.positionSize[1]}</span>
              <span>Blocks/tick: {selectedScenario.blockAdvanceRate}</span>
            </div>
          </div>

          {/* Stats Display */}
          <div className="stats-grid">
            <div className="stat-card">
              <div className="stat-label">Trades Executed</div>
              <div className="stat-value">{stats.tradesExecuted}</div>
            </div>

            <div className="stat-card">
              <div className="stat-label">Liquidations</div>
              <div className="stat-value">{stats.liquidationsTriggered}</div>
            </div>

            <div className="stat-card">
              <div className="stat-label">Total Volume</div>
              <div className="stat-value">{formatVolume(stats.totalVolume)}</div>
            </div>

            <div className="stat-card">
              <div className="stat-label">Net PnL</div>
              <div className={`stat-value ${Number(stats.netPnL) >= 0 ? 'positive' : 'negative'}`}>
                {formatPnL(stats.netPnL)}
              </div>
            </div>

            <div className="stat-card">
              <div className="stat-label">Blocks Simulated</div>
              <div className="stat-value">{stats.blocksSimulated}</div>
            </div>

            <div className="stat-card">
              <div className="stat-label">Uptime</div>
              <div className="stat-value">{getUptime()}</div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
