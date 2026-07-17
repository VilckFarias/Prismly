import React from 'react';
import { Box, Text } from 'ink';
import { LOGO, LOGO_SPECTRUM_START_ROW } from './logo.ts';

const SPECTRUM_COLORS = ['magenta', 'red', 'yellow', 'green', 'cyan', 'blue'] as const;

function renderSpectrumLine(line: string, key: number): React.ReactElement {
  const chars = [...line];
  const chunkSize = Math.ceil(chars.length / SPECTRUM_COLORS.length);
  const segments = SPECTRUM_COLORS.map((color, index) =>
    React.createElement(
      Text,
      { key: color, color },
      chars.slice(index * chunkSize, (index + 1) * chunkSize).join(''),
    ),
  );
  return React.createElement(Text, { key }, ...segments);
}

export function LogoView(): React.ReactElement {
  const lines = LOGO.split('\n');
  return React.createElement(
    Box,
    { flexDirection: 'column' },
    ...lines.map((line, index) =>
      index >= LOGO_SPECTRUM_START_ROW
        ? renderSpectrumLine(line, index)
        : React.createElement(Text, { key: index }, line),
    ),
  );
}
