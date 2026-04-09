'use client';

import React, { useEffect, useRef, useState } from 'react';
import mermaid from 'mermaid';

interface MermaidProps {
  chart: string;
  variant?: 'light' | 'dark';
}

// Default variables for the "light" (brand) theme
const lightThemeVariables = {
  primaryColor: '#e0f2f1',
  primaryTextColor: '#004d40',
  primaryBorderColor: '#80cbc4',
  lineColor: '#00796b',
  secondaryColor: '#f1f8e9',
  tertiaryColor: '#ffffff',
};

// Variables for the "dark" (admin) theme
const darkThemeVariables = {
  darkMode: true,
  background: 'transparent',
  primaryColor: '#1e293b',
  primaryTextColor: '#f8fafc',
  primaryBorderColor: '#475569',
  lineColor: '#ffffff',
  secondaryColor: '#334155',
  tertiaryColor: '#0f172a',
  nodeBorder: '#ffffff',
  arrowheadColor: '#ffffff',
  mainBkg: '#1e293b',
  textColor: '#f8fafc',
};

export const Mermaid: React.FC<MermaidProps> = ({ chart, variant = 'light' }) => {
  const [svg, setSvg] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const idRef = useRef(`mermaid-${Math.floor(Math.random() * 1000000)}`);

  useEffect(() => {
    const renderChart = async () => {
      if (!chart) return;
      
      try {
        // Initialize mermaid with base settings
        mermaid.initialize({
          startOnLoad: false,
          theme: 'base',
          securityLevel: 'loose',
          fontFamily: 'inherit',
          sequence: {
            showSequenceNumbers: false,
          }
        });

        // Use inline configuration (directives) to avoid global state conflicts
        const themeVars = variant === 'dark' ? darkThemeVariables : lightThemeVariables;
        const configDirective = `%%{init: { 'theme': 'base', 'themeVariables': ${JSON.stringify(themeVars)} } }%%\n`;
        const fullChart = configDirective + chart;

        const { svg } = await mermaid.render(idRef.current, fullChart);
        setSvg(svg);
        setError(null);
      } catch (err) {
        // console.error('Mermaid rendering failed:', err);
        setError('Failed to render diagram. Please check the syntax.');
      }
    };

    renderChart();
  }, [chart, variant]);

  if (error) {
    return (
      <div className="p-4 my-4 bg-red-50 border border-red-200 rounded text-red-600 text-sm">
        {error}
        <pre className="mt-2 p-2 bg-red-100 rounded text-xs overflow-auto">{chart}</pre>
      </div>
    );
  }

  return (
    <div className="flex justify-center my-8 w-full overflow-x-auto">
      <div 
        ref={containerRef} 
        className="mermaid-container transition-opacity duration-300 w-full flex justify-center"
        dangerouslySetInnerHTML={{ __html: svg }}
        style={{ opacity: svg ? 1 : 0 }}
      />
    </div>
  );
};
