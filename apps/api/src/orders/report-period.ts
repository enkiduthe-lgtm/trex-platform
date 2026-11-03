import { BadRequestException } from '@nestjs/common';

export function reportPeriod(days = 30, dateFrom?: string, dateTo?: string, currency = 'TRY') {
  const span = Math.min(Math.max(Number.isFinite(days) ? Math.floor(days) : 30, 1), 365);
  const today = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Istanbul', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  for (const value of [dateFrom, dateTo]) if (value && (!/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString().slice(0, 10) !== value)) throw new BadRequestException('Geçerli Bir Tarih Seçin.');
  const to = dateTo || today;
  const from = dateFrom || new Date(Date.parse(`${to}T00:00:00Z`) - (span - 1) * 86400000).toISOString().slice(0, 10);
  for (const value of [dateFrom, dateTo, from, to]) if (value && (!/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString().slice(0, 10) !== value)) throw new BadRequestException('Geçerli Bir Tarih Seçin.');
  if (from > to) throw new BadRequestException('Başlangıç Tarihi Bitiş Tarihinden Sonra Olamaz.');
  if ((Date.parse(to) - Date.parse(from)) / 86400000 > 3660) throw new BadRequestException('Tek Raporda En Fazla On Yıllık Tarih Aralığı Seçin.');
  if (!['TRY', 'USD', 'EUR'].includes(currency)) throw new BadRequestException('Geçerli Bir Para Birimi Seçin.');
  return { days: span, dateFrom: from, dateTo: to, currency };
}
