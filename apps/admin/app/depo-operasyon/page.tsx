import { redirect } from 'next/navigation';

export default function LegacyWarehouseOperationsPage() {
  redirect('/siparisler?durum=PROCESSING');
}
