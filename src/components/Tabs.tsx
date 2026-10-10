import { useId, useRef, useState } from 'react';
import type { KeyboardEvent, ReactNode } from 'react';
import './Tabs.css';

export interface TabItem {
  id: string;
  label: ReactNode;
  content: ReactNode;
}

interface TabsProps {
  tabs: readonly TabItem[];
  /** initially selected tab; defaults to the first one */
  defaultTabId?: string;
  onTabChange?: (id: string) => void;
}

/**
 * WAI-ARIA tabs with automatic activation: Arrow keys (and Home/End) move
 * the selection and the focus together, roving tabindex keeps a single tab
 * in the page tab order.
 */
export function Tabs({ tabs, defaultTabId, onTabChange }: TabsProps) {
  const baseId = useId();
  const [selectedId, setSelectedId] = useState(() => defaultTabId ?? tabs[0]?.id ?? '');
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);

  const activeIndex = Math.max(
    0,
    tabs.findIndex((tab) => tab.id === selectedId),
  );

  const select = (index: number) => {
    setSelectedId(tabs[index].id);
    onTabChange?.(tabs[index].id);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const next =
      event.key === 'ArrowRight'
        ? (activeIndex + 1) % tabs.length
        : event.key === 'ArrowLeft'
          ? (activeIndex - 1 + tabs.length) % tabs.length
          : event.key === 'Home'
            ? 0
            : event.key === 'End'
              ? tabs.length - 1
              : null;
    if (next === null) return;
    event.preventDefault();
    select(next);
    tabRefs.current[next]?.focus(); // selection and focus travel together
  };

  return (
    <div className="tabs">
      <div role="tablist" aria-label="Sections" className="tabs__list" onKeyDown={onKeyDown}>
        {tabs.map((tab, index) => (
          <button
            key={tab.id}
            ref={(element) => {
              tabRefs.current[index] = element;
            }}
            type="button"
            role="tab"
            id={`${baseId}-tab-${tab.id}`}
            aria-selected={index === activeIndex}
            aria-controls={`${baseId}-panel-${tab.id}`}
            tabIndex={index === activeIndex ? 0 : -1}
            className="tabs__tab"
            onClick={() => select(index)}
          >
            {tab.label}
          </button>
        ))}
      </div>
      {tabs.map((tab, index) => (
        <div
          key={tab.id}
          role="tabpanel"
          id={`${baseId}-panel-${tab.id}`}
          aria-labelledby={`${baseId}-tab-${tab.id}`}
          hidden={index !== activeIndex}
          className="tabs__panel"
        >
          {tab.content}
        </div>
      ))}
    </div>
  );
}

export default Tabs;
