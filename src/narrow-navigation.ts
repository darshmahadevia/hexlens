export type NarrowTab = 'structures' | 'bytes' | 'fields' | 'info';

export function renderNarrowTabs(activeTab: NarrowTab): string {
  const tabs: Array<{ id: NarrowTab; label: string }> = [
    { id: 'structures', label: 'Structures' }, { id: 'bytes', label: 'Bytes' }, { id: 'fields', label: 'Fields' }, { id: 'info', label: 'Info' },
  ];
  return `<div class="narrow-inspector-tabs" role="tablist" aria-label="Sample views" data-testid="narrow-tabs">${tabs.map((tab) => `<button class="narrow-inspector-tab${tab.id === activeTab ? ' is-active' : ''}" type="button" role="tab" id="narrow-tab-${tab.id}" data-testid="narrow-tab-${tab.id}" data-narrow-tab="${tab.id}" aria-controls="narrow-panel-${tab.id}" aria-selected="${tab.id === activeTab}" tabindex="${tab.id === activeTab ? '0' : '-1'}">${tab.label}</button>`).join('')}</div>`;
}

/** Apply the tablist roving-tabindex and panel visibility contract. */
export function activateNarrowTab(mount: HTMLElement, target: { narrowTab?: NarrowTab }, nextTab: NarrowTab, focusTab = true): void {
  target.narrowTab = nextTab;
  const tabs = Array.from(mount.querySelectorAll<HTMLButtonElement>('[data-narrow-tab]'));
  tabs.forEach((tab) => { const active = tab.dataset.narrowTab === nextTab; tab.classList.toggle('is-active', active); tab.setAttribute('aria-selected', String(active)); tab.tabIndex = active ? 0 : -1; });
  mount.querySelectorAll<HTMLElement>('[data-narrow-panel]').forEach((panel) => { const active = panel.dataset.narrowPanel === nextTab; panel.hidden = !active; panel.classList.toggle('is-active', active); });
  if (focusTab) tabs.find((tab) => tab.dataset.narrowTab === nextTab)?.focus({ preventScroll: true });
}
