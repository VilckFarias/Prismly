import React from 'react';
import { Text, useStdout } from 'ink';
import { LOGO_SOURCE } from './logoSource.ts';
import { renderLogo } from './logoRender.ts';

const MIN_COLS = 20;
const MAX_COLS = 99;

export function LogoView(): React.ReactElement {
  const { stdout } = useStdout();
  const [columns, setColumns] = React.useState(stdout.columns);

  React.useEffect(() => {
    const onResize = (): void => setColumns(stdout.columns);
    stdout.on('resize', onResize);
    return () => {
      stdout.off('resize', onResize);
    };
  }, [stdout]);

  const targetCols = Math.max(0, Math.min(MAX_COLS, (columns ?? 80) - 2));

  const logo = React.useMemo(
    () => (targetCols >= MIN_COLS ? renderLogo(LOGO_SOURCE, targetCols) : null),
    [targetCols],
  );

  if (!logo) {
    return React.createElement(Text, { color: 'cyan', bold: true }, 'Prismly');
  }

  return React.createElement(Text, { color: 'cyan' }, logo);
}
