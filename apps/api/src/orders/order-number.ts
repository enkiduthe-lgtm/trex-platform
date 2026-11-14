import type { PoolClient } from 'pg';

export async function nextOrderNumber(client: Pick<PoolClient, 'query'>) {
  const { rows } = await client.query<{ value: string }>(`SELECT to_char(now() AT TIME ZONE 'Europe/Istanbul','YYYYMMDD')
    || '-' || lpad(sequence_number, GREATEST(6,length(sequence_number)), '0') AS value
    FROM (SELECT nextval('order_number_seq')::text AS sequence_number) sequence`);
  return rows[0].value;
}
