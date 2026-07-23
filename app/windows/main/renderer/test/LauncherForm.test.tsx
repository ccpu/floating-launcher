import type { Launcher } from '@internal/ipc';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { LauncherForm } from '../src/components/LauncherForm';

describe('launcherForm', () => {
  it('disables save until a command is entered', async () => {
    render(<LauncherForm onSave={vi.fn()} onCancel={vi.fn()} />);

    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();

    await userEvent.type(screen.getByPlaceholderText(/chrome\.exe/u), 'notepad.exe');

    expect(screen.getByRole('button', { name: 'Save' })).toBeEnabled();
  });

  it('calls onSave with the trimmed label and command on submit', async () => {
    const onSave = vi.fn();
    render(<LauncherForm onSave={onSave} onCancel={vi.fn()} />);

    await userEvent.type(screen.getByPlaceholderText(/GitHub/u), '  GitHub  ');
    await userEvent.type(screen.getByPlaceholderText(/chrome\.exe/u), '  notepad.exe  ');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(onSave).toHaveBeenCalledWith({
      label: 'GitHub',
      command: 'notepad.exe',
      icon: undefined,
    });
  });

  it('calls onCancel when cancel is clicked', async () => {
    const onCancel = vi.fn();
    render(<LauncherForm onSave={vi.fn()} onCancel={onCancel} />);

    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('shows a delete button pre-filled with the launcher being edited, and calls onDelete', async () => {
    const onDelete = vi.fn();
    const launcher: Launcher = { id: '1', label: 'GitHub', command: 'chrome.exe' };
    render(
      <LauncherForm
        initial={launcher}
        onSave={vi.fn()}
        onCancel={vi.fn()}
        onDelete={onDelete}
      />,
    );

    expect(screen.getByDisplayValue('GitHub')).toBeInTheDocument();
    expect(screen.getByDisplayValue('chrome.exe')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Delete' }));

    expect(onDelete).toHaveBeenCalledTimes(1);
  });
});
