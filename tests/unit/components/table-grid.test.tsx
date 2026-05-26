import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { TableGrid } from '@/components/floor/table-grid';
import type { TableWithState } from '@/server/services/table';

afterEach(cleanup);

function makeTable(overrides: Partial<TableWithState> = {}): TableWithState {
  return {
    id: 1,
    code: 'M01',
    capacity: 1,
    positionX: 0,
    positionY: 0,
    isActive: true,
    state: 'free',
    activeGroupId: null,
    activeOrderId: null,
    ...overrides,
  };
}

describe('TableGrid', () => {
  it('renderiza todas las mesas recibidas', () => {
    const tables = [
      makeTable({ id: 1, code: 'M01', positionX: 0, positionY: 0 }),
      makeTable({ id: 2, code: 'M02', positionX: 1, positionY: 0 }),
    ];
    render(<TableGrid tables={tables} variant="admin" />);
    expect(screen.getByLabelText(/Mesa M01/)).toBeTruthy();
    expect(screen.getByLabelText(/Mesa M02/)).toBeTruthy();
  });

  it('aplica color verde para estado free', () => {
    render(<TableGrid tables={[makeTable({ state: 'free' })]} variant="admin" />);
    expect(screen.getByRole('button').className).toContain('bg-success-50');
  });

  it('aplica color amber para estado tentative', () => {
    render(<TableGrid tables={[makeTable({ state: 'tentative' })]} variant="admin" />);
    expect(screen.getByRole('button').className).toContain('bg-warning-50');
  });

  it('aplica color rojo para estado occupied', () => {
    render(<TableGrid tables={[makeTable({ state: 'occupied' })]} variant="admin" />);
    expect(screen.getByRole('button').className).toContain('bg-danger-50');
  });

  it('aplica color info para estado in_active_group', () => {
    render(<TableGrid tables={[makeTable({ state: 'in_active_group' })]} variant="admin" />);
    expect(screen.getByRole('button').className).toContain('bg-info-50');
  });

  it('aplica color neutral para estado inactive', () => {
    render(<TableGrid tables={[makeTable({ state: 'inactive', isActive: false })]} variant="admin" />);
    expect(screen.getByRole('button').className).toContain('bg-neutral-100');
  });

  it('llama onTableClick al hacer click en una mesa seleccionable', () => {
    const onClick = vi.fn();
    render(
      <TableGrid
        tables={[makeTable({ id: 5, state: 'free' })]}
        variant="admin"
        selectableStates={['free']}
        onTableClick={onClick}
      />,
    );
    fireEvent.click(screen.getByRole('button'));
    expect(onClick).toHaveBeenCalledWith(5);
  });

  it('NO llama onTableClick en estados no seleccionables y el botón está disabled', () => {
    const onClick = vi.fn();
    render(
      <TableGrid
        tables={[makeTable({ state: 'occupied' })]}
        variant="waiter"
        selectableStates={['free']}
        onTableClick={onClick}
      />,
    );
    const btn = screen.getByRole('button') as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
    fireEvent.click(btn);
    expect(onClick).not.toHaveBeenCalled();
  });

  it('muestra el anillo de selección en mesas seleccionadas (aria-pressed=true)', () => {
    render(
      <TableGrid
        tables={[makeTable({ id: 3, state: 'free' })]}
        variant="waiter"
        selectedTableIds={[3]}
      />,
    );
    const btn = screen.getByRole('button');
    expect(btn.getAttribute('aria-pressed')).toBe('true');
    expect(btn.className).toContain('ring-2');
  });

  it('renderiza celdas vacías para posiciones sin mesa', () => {
    // Mesa en posición (1,0) → celda (0,0) queda vacía
    const tables = [makeTable({ id: 1, positionX: 1, positionY: 0 })];
    const { container } = render(<TableGrid tables={tables} variant="admin" />);
    const buttons = container.querySelectorAll('button');
    expect(buttons).toHaveLength(1);
  });

  it('oculta el código cuando showCode=false', () => {
    render(<TableGrid tables={[makeTable({ code: 'M07' })]} variant="admin" showCode={false} />);
    expect(screen.queryByText('M07')).toBeNull();
  });

  it('variant customer solo permite seleccionar mesas libres por defecto', () => {
    const onClick = vi.fn();
    const tables = [
      makeTable({ id: 1, state: 'free', positionX: 0, positionY: 0 }),
      makeTable({ id: 2, state: 'occupied', positionX: 1, positionY: 0 }),
    ];
    render(<TableGrid tables={tables} variant="customer" onTableClick={onClick} />);
    const buttons = screen.getAllByRole('button') as HTMLButtonElement[];
    const freeBtn = buttons.find((b) => !b.disabled);
    const occupiedBtn = buttons.find((b) => b.disabled);
    expect(freeBtn).toBeTruthy();
    expect(occupiedBtn).toBeTruthy();
    fireEvent.click(freeBtn!);
    expect(onClick).toHaveBeenCalledWith(1);
    fireEvent.click(occupiedBtn!);
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});
