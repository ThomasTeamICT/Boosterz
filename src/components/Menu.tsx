import React, { useEffect, useId, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import type { LucideIcon } from 'lucide-react';

export interface MenuItem {
  label: string;
  /** Korte uitleg onder het label. */
  hint?: string;
  Icon?: LucideIcon;
  /** Link binnen de app; anders is `onSelect` verplicht. */
  to?: string;
  onSelect?: () => void;
  danger?: boolean;
  /** Menu blijft open na kiezen (bv. een schakelaar zoals het thema). */
  keepOpen?: boolean;
  /** Scheidingslijn boven dit item. */
  separator?: boolean;
}

/**
 * Knop met een uitklapmenu, volgens het ARIA-menupatroon: pijltjes, Home en
 * End bewegen, Escape sluit en zet de focus terug op de knop, Tab en een klik
 * ernaast sluiten het menu.
 */
export function MenuButton({
  items,
  label,
  Icon,
  ariaLabel,
  className = 'btn btn-ghost',
  align = 'end',
  labelClassName,
}: {
  items: MenuItem[];
  /** Zichtbare tekst op de knop. Laat weg voor een icoonknop (dan is `ariaLabel` verplicht). */
  label?: string;
  Icon?: LucideIcon;
  ariaLabel?: string;
  className?: string;
  align?: 'start' | 'end';
  /** Klasse voor de zichtbare tekst, bv. om ze op smalle schermen te verbergen. */
  labelClassName?: string;
}) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const menuId = useId();

  const itemEls = () => Array.from(menuRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? []);

  const close = (focusButton: boolean) => {
    setOpen(false);
    if (focusButton) btnRef.current?.focus();
  };

  useEffect(() => {
    if (!open) return;
    itemEls()[0]?.focus();
    const onDown = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  const onMenuKey = (e: React.KeyboardEvent) => {
    const els = itemEls();
    const i = els.indexOf(document.activeElement as HTMLElement);
    const move = (to: number) => { e.preventDefault(); els[(to + els.length) % els.length]?.focus(); };
    if (e.key === 'ArrowDown') move(i + 1);
    else if (e.key === 'ArrowUp') move(i - 1);
    else if (e.key === 'Home') move(0);
    else if (e.key === 'End') move(els.length - 1);
    else if (e.key === 'Escape') { e.preventDefault(); close(true); }
    else if (e.key === 'Tab') setOpen(false);
  };

  const choose = (item: MenuItem) => {
    item.onSelect?.();
    if (!item.keepOpen) close(!item.to);
  };

  return (
    <div className="menu-wrap" ref={wrapRef}>
      <button
        ref={btnRef}
        type="button"
        className={className}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        aria-label={ariaLabel}
        onClick={() => setOpen((o) => !o)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown' && !open) { e.preventDefault(); setOpen(true); }
        }}
      >
        {Icon && <Icon size={18} />}
        {label && <span className={labelClassName}>{label}</span>}
      </button>
      {open && (
        <div
          ref={menuRef}
          id={menuId}
          role="menu"
          aria-label={ariaLabel ?? label}
          className={`menu menu-${align}`}
          onKeyDown={onMenuKey}
        >
          {items.map((item, i) => {
            const body = (
              <>
                {item.Icon ? <item.Icon size={18} /> : <span className="menu-icon-gap" />}
                <span className="menu-text">
                  <span>{item.label}</span>
                  {item.hint && <small>{item.hint}</small>}
                </span>
              </>
            );
            const cls = `menu-item${item.danger ? ' menu-item-danger' : ''}`;
            return (
              <React.Fragment key={i}>
                {item.separator && <div className="menu-sep" role="separator" />}
                {item.to ? (
                  <Link to={item.to} role="menuitem" tabIndex={-1} className={cls} onClick={() => choose(item)}>
                    {body}
                  </Link>
                ) : (
                  <button type="button" role="menuitem" tabIndex={-1} className={cls} onClick={() => choose(item)}>
                    {body}
                  </button>
                )}
              </React.Fragment>
            );
          })}
        </div>
      )}
    </div>
  );
}
