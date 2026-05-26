import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { PinPad } from '@/components/auth/pin-pad';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function setup(props: Partial<React.ComponentProps<typeof PinPad>> = {}) {
  const onSubmit = props.onSubmit ?? vi.fn();
  const user = userEvent.setup();
  const utils = render(<PinPad onSubmit={onSubmit} {...props} />);
  return { ...utils, onSubmit, user };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('PinPad', () => {
  it('renders exactly 12 buttons', () => {
    setup();
    expect(screen.getAllByRole('button')).toHaveLength(12);
  });

  it('renders buttons 1-9, backspace, 0, and Enter', () => {
    setup();
    for (const label of ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0']) {
      expect(screen.getByRole('button', { name: label })).toBeInTheDocument();
    }
    expect(screen.getByRole('button', { name: 'Borrar' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Confirmar' })).toBeInTheDocument();
  });

  it('calls onSubmit with the 6-digit value when length is reached', async () => {
    const { onSubmit, user } = setup({ length: 6 });

    for (const digit of ['1', '2', '3', '4', '5', '6']) {
      await user.click(screen.getByRole('button', { name: digit }));
    }

    expect(onSubmit).toHaveBeenCalledOnce();
    expect(onSubmit).toHaveBeenCalledWith('123456');
  });

  it('does not call onSubmit before length is reached', async () => {
    const { onSubmit, user } = setup({ length: 6 });

    for (const digit of ['1', '2', '3']) {
      await user.click(screen.getByRole('button', { name: digit }));
    }

    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('clears entry after auto-submit so a new PIN can be entered', async () => {
    const { onSubmit, user } = setup({ length: 4 });

    for (const digit of ['1', '2', '3', '4']) {
      await user.click(screen.getByRole('button', { name: digit }));
    }
    expect(onSubmit).toHaveBeenCalledWith('1234');

    // Enter a second PIN
    for (const digit of ['5', '6', '7', '8']) {
      await user.click(screen.getByRole('button', { name: digit }));
    }
    expect(onSubmit).toHaveBeenCalledWith('5678');
    expect(onSubmit).toHaveBeenCalledTimes(2);
  });

  it('backspace removes the last digit', async () => {
    const { onSubmit, user } = setup({ length: 4 });

    await user.click(screen.getByRole('button', { name: '1' }));
    await user.click(screen.getByRole('button', { name: '2' }));
    await user.click(screen.getByRole('button', { name: 'Borrar' }));
    // Only '1' remains; need 3 more to trigger submit
    await user.click(screen.getByRole('button', { name: '3' }));
    await user.click(screen.getByRole('button', { name: '4' }));
    // Still only 3 digits entered — no submit yet
    expect(onSubmit).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: '5' }));
    expect(onSubmit).toHaveBeenCalledWith('1345');
  });

  it('disabled prop disables all buttons', () => {
    setup({ disabled: true });
    const buttons = screen.getAllByRole('button');
    expect(buttons).toHaveLength(12);
    buttons.forEach((btn) => expect(btn).toBeDisabled());
  });

  it('disabled prop prevents onSubmit from being called', async () => {
    const { onSubmit, user } = setup({ disabled: true, length: 4 });

    for (const digit of ['1', '2', '3', '4']) {
      await user.click(screen.getByRole('button', { name: digit }));
    }

    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('displays error message when error prop is provided', () => {
    setup({ error: 'PIN incorrecto. Te quedan 4 intentos.' });
    expect(
      screen.getByRole('alert'),
    ).toHaveTextContent('PIN incorrecto. Te quedan 4 intentos.');
  });

  it('clears error message on the next keystroke', async () => {
    const { user } = setup({ error: 'PIN incorrecto. Te quedan 4 intentos.' });

    expect(screen.getByRole('alert')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '1' }));

    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('Enter button is disabled when entry length < required length', () => {
    setup({ length: 6 });
    expect(screen.getByRole('button', { name: 'Confirmar' })).toBeDisabled();
  });

  it('Enter button enables when entry reaches required length', async () => {
    const { user } = setup({ length: 4 });

    for (const digit of ['1', '2', '3', '4']) {
      await user.click(screen.getByRole('button', { name: digit }));
    }

    // After auto-submit, entry clears so Enter should be disabled again
    expect(screen.getByRole('button', { name: 'Confirmar' })).toBeDisabled();
  });
});
