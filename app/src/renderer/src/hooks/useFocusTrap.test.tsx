import { describe, it, expect } from 'vitest';
import { useRef } from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { useFocusTrap } from './useFocusTrap';

function Trap({ active }: { active: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  useFocusTrap(ref, active);
  return (
    <div>
      <button>外面</button>
      <div ref={ref} data-testid="box">
        <button>一</button>
        <button>二</button>
        <button>三</button>
      </div>
    </div>
  );
}

describe('useFocusTrap', () => {
  it('wraps Tab from the last element to the first and Shift+Tab from the first to the last', () => {
    render(<Trap active />);
    const box = screen.getByTestId('box');
    const [first, , last] = screen.getAllByRole('button').slice(1);
    last!.focus();
    fireEvent.keyDown(box, { key: 'Tab' });
    expect(first).toHaveFocus();
    fireEvent.keyDown(box, { key: 'Tab', shiftKey: true });
    expect(last).toHaveFocus();
  });

  it('moves focus into the container when it opens with focus outside', () => {
    render(<Trap active />);
    expect(screen.getByRole('button', { name: '一' })).toHaveFocus();
  });

  it('does nothing while inactive', () => {
    render(<Trap active={false} />);
    const outside = screen.getByRole('button', { name: '外面' });
    outside.focus();
    expect(outside).toHaveFocus();
    const last = screen.getByRole('button', { name: '三' });
    last.focus();
    fireEvent.keyDown(screen.getByTestId('box'), { key: 'Tab' });
    expect(last).toHaveFocus();
  });
});
