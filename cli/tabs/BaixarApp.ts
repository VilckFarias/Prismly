import React from 'react';
import { Box, Text } from 'ink';

export function BaixarApp(): React.ReactElement {
  return React.createElement(
    Box,
    { flexDirection: 'column' },
    React.createElement(Text, null, 'Prefere uma interface gráfica?'),
    React.createElement(Text, { color: 'cyan' }, 'https://github.com/VilckFarias/Prismly/releases'),
  );
}
