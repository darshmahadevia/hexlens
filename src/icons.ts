export function arrowIcon(direction: 'left' | 'right'): string {
  const path = direction === 'left'
    ? 'M11 4 5 10l6 6M5 10h14'
    : 'm13 4 6 6-6 6M5 10h14';
  return `<svg class="icon icon-arrow" viewBox="0 0 24 20" aria-hidden="true" focusable="false"><path d="${path}" /></svg>`;
}
