import type { Launcher } from '@internal/ipc';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { LauncherIconButton } from '../src/components/LauncherIcon';

const launcher: Launcher = {
  id: '1',
  label: 'GitHub',
  command: 'chrome.exe https://github.com',
};

describe('launcherIcon', () => {
  it('shows the label text when display is "label"', () => {
    render(
      <LauncherIconButton
        launcher={launcher}
        size="md"
        display="label"
        onClick={vi.fn()}
        onContextMenu={vi.fn()}
      />,
    );

    expect(screen.getByText('GitHub')).toBeInTheDocument();
  });

  it('falls back to the first letter of the label when there is no icon', () => {
    render(
      <LauncherIconButton
        launcher={launcher}
        size="md"
        display="icon"
        onClick={vi.fn()}
        onContextMenu={vi.fn()}
      />,
    );

    expect(screen.getByText('G')).toBeInTheDocument();
  });

  it('renders the icon image when one is configured', () => {
    render(
      <LauncherIconButton
        launcher={{ ...launcher, icon: 'data:image/png;base64,abc' }}
        size="md"
        display="icon"
        onClick={vi.fn()}
        onContextMenu={vi.fn()}
      />,
    );

    expect(screen.getByRole('img')).toHaveAttribute('src', 'data:image/png;base64,abc');
  });

  it('overlays the label initial as a badge when display is "icon-initial"', () => {
    render(
      <LauncherIconButton
        launcher={{ ...launcher, icon: 'data:image/png;base64,abc' }}
        size="md"
        display="icon-initial"
        onClick={vi.fn()}
        onContextMenu={vi.fn()}
      />,
    );

    expect(screen.getByRole('img')).toBeInTheDocument();
    expect(screen.getByText('G')).toBeInTheDocument();
  });

  it('calls onClick when clicked', async () => {
    const onClick = vi.fn();
    render(
      <LauncherIconButton
        launcher={launcher}
        size="md"
        display="icon"
        onClick={onClick}
        onContextMenu={vi.fn()}
      />,
    );

    await userEvent.click(screen.getByRole('button'));

    expect(onClick).toHaveBeenCalledTimes(1);
  });
});
