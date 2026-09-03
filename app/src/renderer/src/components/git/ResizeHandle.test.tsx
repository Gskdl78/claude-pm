import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { DEFAULT_LOG_HEIGHT, LOG_HEIGHT_KEY, ResizeHandle, useLogHeight } from './ResizeHandle';

/** 用 useLogHeight 驅動的最小面板，行為與 GitPanel 相同。 */
function Host() {
  const [height, setHeight] = useLogHeight();
  return (
    <div className="git-panel">
      <ResizeHandle height={height} onHeight={setHeight} />
      <div data-testid="log" style={{ height }} />
    </div>
  );
}

const handle = () => screen.getByRole('separator');
const logHeight = () => screen.getByTestId('log').style.height;
const drag = (fromY: number, toY: number) => {
  fireEvent.pointerDown(handle(), { pointerId: 1, button: 0, clientY: fromY });
  fireEvent.pointerMove(handle(), { pointerId: 1, clientY: toY });
  fireEvent.pointerUp(handle(), { pointerId: 1, clientY: toY });
};

beforeEach(() => { window.localStorage.clear(); });
afterEach(() => { vi.restoreAllMocks(); });

describe('ResizeHandle', () => {
  it('exposes separator semantics and the default height', () => {
    render(<Host />);
    expect(handle()).toHaveAttribute('aria-orientation', 'horizontal');
    expect(handle()).toHaveAttribute('aria-valuenow', String(DEFAULT_LOG_HEIGHT));
    expect(logHeight()).toBe(`${DEFAULT_LOG_HEIGHT}px`);
  });

  it('grows the log when dragged up and shrinks it when dragged down', () => {
    render(<Host />);
    drag(300, 260);
    expect(logHeight()).toBe(`${DEFAULT_LOG_HEIGHT + 40}px`);
    drag(300, 330);
    expect(logHeight()).toBe(`${DEFAULT_LOG_HEIGHT + 10}px`);
  });

  it('clamps the dragged height between 60px and 60% of the panel', () => {
    render(<Host />);
    drag(300, 900);
    expect(logHeight()).toBe('60px');
    drag(300, -5000);
    const max = Math.round(window.innerHeight * 0.6);
    expect(logHeight()).toBe(`${max}px`);
    expect(handle()).toHaveAttribute('aria-valuenow', String(max));
  });

  it('captures the pointer so dragging survives leaving the bar', () => {
    render(<Host />);
    const capture = vi.fn();
    Object.assign(handle(), { setPointerCapture: capture, releasePointerCapture: vi.fn() });
    drag(300, 280);
    expect(capture).toHaveBeenCalledWith(1);
    expect(logHeight()).toBe(`${DEFAULT_LOG_HEIGHT + 20}px`);
  });

  it('resets to the default height on double click', () => {
    render(<Host />);
    drag(300, 200);
    expect(logHeight()).not.toBe(`${DEFAULT_LOG_HEIGHT}px`);
    fireEvent.doubleClick(handle());
    expect(logHeight()).toBe(`${DEFAULT_LOG_HEIGHT}px`);
  });

  it('adjusts by 16px with ArrowUp / ArrowDown', () => {
    render(<Host />);
    handle().focus();
    fireEvent.keyDown(handle(), { key: 'ArrowUp' });
    expect(logHeight()).toBe(`${DEFAULT_LOG_HEIGHT + 16}px`);
    fireEvent.keyDown(handle(), { key: 'ArrowDown' });
    fireEvent.keyDown(handle(), { key: 'ArrowDown' });
    expect(logHeight()).toBe(`${DEFAULT_LOG_HEIGHT - 16}px`);
    fireEvent.keyDown(handle(), { key: 'ArrowLeft' });
    expect(logHeight()).toBe(`${DEFAULT_LOG_HEIGHT - 16}px`);
  });

  it('persists the height and restores it on the next mount', () => {
    const { unmount } = render(<Host />);
    fireEvent.keyDown(handle(), { key: 'ArrowUp' });
    expect(window.localStorage.getItem(LOG_HEIGHT_KEY)).toBe(String(DEFAULT_LOG_HEIGHT + 16));
    unmount();
    render(<Host />);
    expect(logHeight()).toBe(`${DEFAULT_LOG_HEIGHT + 16}px`);
  });

  it('falls back to the default for junk stored values', () => {
    window.localStorage.setItem(LOG_HEIGHT_KEY, 'nope');
    render(<Host />);
    expect(logHeight()).toBe(`${DEFAULT_LOG_HEIGHT}px`);
  });

  it('does not throw when localStorage reads and writes fail', () => {
    const boom = () => { throw new Error('storage disabled'); };
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(boom);
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(boom);
    expect(() => {
      render(<Host />);
      fireEvent.keyDown(handle(), { key: 'ArrowUp' });
    }).not.toThrow();
    expect(logHeight()).toBe(`${DEFAULT_LOG_HEIGHT + 16}px`);
  });
});
