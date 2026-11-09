export function mergeOrderNotes(current:Record<string,string>, rows:{id:string;admin_note?:string|null}[], dirty:ReadonlySet<string>) {
  const next = {...current};
  for(const row of rows) if(!dirty.has(row.id)) next[row.id] = row.admin_note ?? '';
  return next;
}
