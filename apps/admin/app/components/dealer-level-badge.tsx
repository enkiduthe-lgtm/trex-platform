export function DealerLevelBadge({name}:{name:string|null|undefined}) {
 return <span className="dealer-level-badge"><svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M12 3 4 6v6c0 4 4 7 8 9 4-2 8-5 8-9V6l-8-3Z"/><path d="m8 12 3 3 5-6"/></svg><span><small>Bayi Seviyesi</small><strong>{name||'Seviye Atanmamış'}</strong></span></span>;
}
