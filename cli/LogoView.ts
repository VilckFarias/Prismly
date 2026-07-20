import React from 'react';
import { Text } from 'ink';
import { LOGO } from './logo.ts';

export function LogoView(): React.ReactElement {
  return React.createElement(Text, { color: 'cyan' }, LOGO);
}
