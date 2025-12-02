import { useEffect, useRef } from 'react';
import { createChart, LineSeries, type LineData, type IChartApi } from 'lightweight-charts';

interface LineChartProps {
  data: LineData[];
  title: string;
  color?: string;
  height?: number;
}

export function LineChart({ data, title, color = '#2563eb', height = 200 }: LineChartProps) {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<any>(null);

  useEffect(() => {
    if (!chartContainerRef.current) return;

    // Create chart
    const chart = createChart(chartContainerRef.current, {
      width: chartContainerRef.current.clientWidth,
      height,
      layout: {
        background: { color: '#000' },
        textColor: '#888',
      },
      grid: {
        vertLines: { color: '#1a1a1a' },
        horzLines: { color: '#1a1a1a' },
      },
      timeScale: {
        timeVisible: true,
        secondsVisible: false,
        borderColor: '#333',
      },
      rightPriceScale: {
        borderColor: '#333',
      },
    });

    // Create line series
    const series = chart.addSeries(LineSeries, {
      color,
      lineWidth: 2,
    });

    chartRef.current = chart;
    seriesRef.current = series;

    // Handle resize
    const handleResize = () => {
      if (chartContainerRef.current && chartRef.current) {
        chartRef.current.applyOptions({
          width: chartContainerRef.current.clientWidth,
        });
      }
    };

    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      chart.remove();
    };
  }, [color, height]);

  // Update data
  useEffect(() => {
    if (!seriesRef.current || !chartRef.current || data.length === 0) return;
    
    try {
      seriesRef.current.setData(data);
      chartRef.current.timeScale().fitContent();
      
      // Force a resize to ensure the chart updates
      const resizeObserver = new ResizeObserver(() => {
        if (chartRef.current && chartContainerRef.current) {
          chartRef.current.applyOptions({
            width: chartContainerRef.current.clientWidth,
          });
        }
      });
      
      if (chartContainerRef.current) {
        resizeObserver.observe(chartContainerRef.current);
      }
      
      return () => {
        resizeObserver.disconnect();
      };
    } catch (error) {
      console.error('Error updating chart data:', error);
    }
  }, [data]);

  return (
    <div className="line-chart" style={{ width: '100%', height: '100%' }}>
      <h4 className="chart-title">{title}</h4>
      <div 
        ref={chartContainerRef} 
        className="chart-container" 
        style={{ 
          width: '100%', 
          height: `${height}px`,
          position: 'relative'
        }} 
      />
    </div>
  );
}
