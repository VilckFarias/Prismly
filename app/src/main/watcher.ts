import { watch } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

const PROJECTS_DIR = join(homedir(), '.claude', 'projects');
const DEBOUNCE_MS = 1000;

export function startWatcher(onChange: () => void): void {
  let timer: NodeJS.Timeout | null = null;

  const scheduleUpdate = (): void => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(onChange, DEBOUNCE_MS);
  };

  try {
    watch(PROJECTS_DIR, { recursive: true }, scheduleUpdate);
  } catch (error) {
    console.error('Não foi possível observar os logs em', PROJECTS_DIR, error);
  }
}
