import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockAddItem } = vi.hoisted(() => ({
  mockAddItem: vi.fn().mockResolvedValue({ ok: true, data: { itemId: 1 } }),
}));

vi.mock('@/server/actions/menu', () => ({ addItemAction: mockAddItem }));

import { AddItemDialog } from '@/app/admin/menu/_components/add-item-dialog';

beforeEach(() => vi.clearAllMocks());

async function openDialog() {
  fireEvent.click(screen.getByRole('button', { name: /agregar plato/i }));
  await screen.findByRole('dialog');
}

describe('AddItemDialog', () => {
  it('renders trigger button and no dialog initially', () => {
    render(<AddItemDialog dailyMenuId={1} />);
    expect(screen.getByRole('button', { name: /agregar plato/i })).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('opens dialog when trigger is clicked', async () => {
    render(<AddItemDialog dailyMenuId={1} />);
    await openDialog();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByLabelText(/nombre/i)).toBeInTheDocument();
  });

  it('shows validation error when submitting with empty name', async () => {
    render(<AddItemDialog dailyMenuId={1} />);
    await openDialog();
    // fireEvent.submit bypasses HTML5 required validation so React handler fires
    fireEvent.submit(document.querySelector('form')!);
    await waitFor(() =>
      expect(screen.getByText(/el nombre es requerido/i)).toBeInTheDocument(),
    );
    expect(mockAddItem).not.toHaveBeenCalled();
  });

  it('shows validation error when name exceeds 80 chars', async () => {
    render(<AddItemDialog dailyMenuId={1} />);
    await openDialog();
    const nameInput = screen.getByLabelText(/nombre/i);
    // fireEvent.change bypasses maxLength attribute so we can set 81 chars
    fireEvent.change(nameInput, { target: { value: 'a'.repeat(81) } });
    fireEvent.submit(document.querySelector('form')!);
    await waitFor(() =>
      expect(screen.getByText(/80 caracteres/i)).toBeInTheDocument(),
    );
    expect(mockAddItem).not.toHaveBeenCalled();
  });

  it('calls addItemAction with correct args on valid submit', async () => {
    render(<AddItemDialog dailyMenuId={5} defaultCategory="main" />);
    await openDialog();
    await userEvent.type(screen.getByLabelText(/nombre/i), 'Pollo a la brasa');
    fireEvent.click(screen.getByRole('button', { name: /guardar/i }));
    await waitFor(() => expect(mockAddItem).toHaveBeenCalledOnce());
    expect(mockAddItem).toHaveBeenCalledWith(
      expect.objectContaining({
        dailyMenuId: 5,
        name: 'Pollo a la brasa',
        category: 'main',
      }),
    );
  });

  it('closes dialog after successful submit', async () => {
    render(<AddItemDialog dailyMenuId={1} />);
    await openDialog();
    await userEvent.type(screen.getByLabelText(/nombre/i), 'Chicha morada');
    fireEvent.click(screen.getByRole('button', { name: /guardar/i }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('shows error message returned by action', async () => {
    mockAddItem.mockResolvedValue({
      ok: false,
      error: { code: 'VALIDATION_ERROR', message: 'Nombre muy largo' },
    });
    render(<AddItemDialog dailyMenuId={1} />);
    await openDialog();
    await userEvent.type(screen.getByLabelText(/nombre/i), 'Válido');
    fireEvent.click(screen.getByRole('button', { name: /guardar/i }));
    await waitFor(() =>
      expect(screen.getByText(/nombre muy largo/i)).toBeInTheDocument(),
    );
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('closes dialog when Cancelar is clicked', async () => {
    render(<AddItemDialog dailyMenuId={1} />);
    await openDialog();
    fireEvent.click(screen.getByRole('button', { name: /cancelar/i }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });
});
