"use client";

import { FormEvent, Suspense, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { AdminNav } from "../components/admin-nav";
import { api } from "../lib/api";

type Ticket = {
  id: string;
  ticket_number: string;
  status: string;
  priority: string;
  contact_name: string;
  contact_email: string | null;
  contact_phone: string | null;
  subject: string;
  order_number: string | null;
  assigned_email: string | null;
  created_at: string;
  updated_at: string;
  due_at: string;
};
type Detail = Ticket & {
  assigned_to: string | null;
  messages: {
    id: string;
    body: string;
    is_internal: boolean;
    created_at: string;
    created_by_email: string | null;
  }[];
  activity: {
    id: string;
    action: string;
    created_at: string;
    actor_email: string | null;
  }[];
};
type Customer = {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  phone: string | null;
};
type OrderOption = {
  id: string;
  order_number: string;
  customer_name: string | null;
  status: string;
};
type Assignee = { id: string; email: string; role: string };
type Workload = { email: string; open_count: number; overdue_count: number };
const statuses: Record<string, string> = {
  OPEN: "Açık",
  IN_PROGRESS: "İşlemde",
  WAITING_CUSTOMER: "Müşteri bekleniyor",
  RESOLVED: "Çözüldü",
  CLOSED: "Kapandı",
};
const priorities: Record<string, string> = {
  LOW: "Düşük",
  NORMAL: "Normal",
  HIGH: "Yüksek",
  URGENT: "Acil",
};
const empty = {
  customerId: "",
  orderId: "",
  contactName: "",
  contactEmail: "",
  contactPhone: "",
  subject: "",
  message: "",
  priority: "NORMAL",
};

function SupportPageContent() {
  const searchParams = useSearchParams();
  const [rows, setRows] = useState<Ticket[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [orders, setOrders] = useState<OrderOption[]>([]);
  const [assignees, setAssignees] = useState<Assignee[]>([]);
  const [workload, setWorkload] = useState<Workload[]>([]);
  const [selected, setSelected] = useState<Detail | null>(null);
  const [form, setForm] = useState(empty);
  const [reply, setReply] = useState("");
  const [internal, setInternal] = useState(false);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("");
  const [priorityFilter, setPriorityFilter] = useState("");
  const [overdueOnly, setOverdueOnly] = useState(false);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const openedTicketId = useRef<string | null>(null);
  async function load() {
    try {
      const [tickets, customerRows, orderRows, staffRows, workloadRows] =
        await Promise.all([
          api<Ticket[]>(
            `/admin/support-tickets${status ? `?status=${encodeURIComponent(status)}` : ""}`,
          ),
          api<Customer[]>("/admin/customers"),
          api<OrderOption[]>("/admin/orders"),
          api<Assignee[]>("/admin/support-tickets/assignees"),
          api<Workload[]>("/admin/support-tickets/workload"),
        ]);
      setRows(tickets);
      setCustomers(customerRows);
      setOrders(orderRows);
      setAssignees(staffRows);
      setWorkload(workloadRows);
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Talepler yüklenemedi.",
      );
    }
  }
  useEffect(() => {
    void load();
  }, [status]);
  useEffect(() => {
    const orderId = searchParams.get("order");
    if (orderId && orders.some((order) => order.id === orderId)) {
      setForm((value) => ({ ...value, orderId }));
    }
  }, [orders, searchParams]);
  async function open(id: string) {
    setBusy(true);
    try {
      setSelected(await api<Detail>(`/admin/support-tickets/${id}`));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Talep açılamadı.");
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    const ticketId = searchParams.get("ticket");
    if (
      !ticketId ||
      openedTicketId.current === ticketId ||
      !rows.some((ticket) => ticket.id === ticketId)
    ) {
      return;
    }
    openedTicketId.current = ticketId;
    void open(ticketId);
  }, [rows, searchParams]);
  async function create(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      const ticket = await api<{ id: string }>("/admin/support-tickets", {
        method: "POST",
        body: JSON.stringify({
          ...form,
          customerId: form.customerId || undefined,
          orderId: form.orderId || undefined,
          contactEmail: form.contactEmail || undefined,
          contactPhone: form.contactPhone || undefined,
        }),
      });
      setForm(empty);
      setMessage("Destek talebi oluşturuldu.");
      await load();
      await open(ticket.id);
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Talep oluşturulamadı.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function update(change: Record<string, string | null>) {
    if (!selected) return;
    setBusy(true);
    try {
      await api(`/admin/support-tickets/${selected.id}`, {
        method: "PATCH",
        body: JSON.stringify(change),
      });
      await open(selected.id);
      await load();
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Talep güncellenemedi.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function send(event: FormEvent) {
    event.preventDefault();
    if (!selected || !reply.trim()) return;
    setBusy(true);
    try {
      await api(`/admin/support-tickets/${selected.id}/messages`, {
        method: "POST",
        body: JSON.stringify({ body: reply, isInternal: internal }),
      });
      setReply("");
      setInternal(false);
      await open(selected.id);
      await load();
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Mesaj kaydedilemedi.",
      );
    } finally {
      setBusy(false);
    }
  }
  function chooseCustomer(id: string) {
    const customer = customers.find((item) => item.id === id);
    setForm((value) => ({
      ...value,
      customerId: id,
      contactName: customer
        ? `${customer.first_name} ${customer.last_name}`.trim()
        : value.contactName,
      contactEmail: customer?.email ?? value.contactEmail,
      contactPhone: customer?.phone ?? value.contactPhone,
    }));
  }
  const shown = rows.filter((row) => {
    const matchesQuery =
      `${row.ticket_number} ${row.contact_name} ${row.contact_email ?? ""} ${row.contact_phone ?? ""} ${row.subject}`
        .toLocaleLowerCase("tr-TR")
        .includes(query.toLocaleLowerCase("tr-TR"));
    const isOverdue =
      !["RESOLVED", "CLOSED"].includes(row.status) &&
      new Date(row.due_at).getTime() < Date.now();
    return (
      matchesQuery &&
      (!priorityFilter || row.priority === priorityFilter) &&
      (!overdueOnly || isOverdue)
    );
  });
  const deadline = (ticket: Ticket) => {
    const overdue =
      !["RESOLVED", "CLOSED"].includes(ticket.status) &&
      new Date(ticket.due_at).getTime() < Date.now();
    return `${overdue ? "GECİKTİ · " : "Yanıt hedefi: "}${new Date(ticket.due_at).toLocaleString("tr-TR")}`;
  };
  return (
    <main>
      <AdminNav />
      <section>
        <p>MÜŞTERİLER / DESTEK</p>
        <h1>Müşteri talepleri</h1>
        <p>Talep, mesaj, sorumlu ve yanıt hedefini tek ekrandan yönetin.</p>
        {message && <p role="status">{message}</p>}
        {workload.length > 0 && (
          <div className="cards">
            {workload.map((item) => (
              <article key={item.email}>
                <p>{item.email}</p>
                <h2>{item.open_count}</h2>
                <p>
                  {item.overdue_count
                    ? `${item.overdue_count} geciken talep`
                    : "Gecikme yok"}
                </p>
              </article>
            ))}
          </div>
        )}
        <div className="two-columns">
          <form className="form-card" onSubmit={create}>
            <h2>Yeni destek talebi</h2>
            <label>
              Kayıtlı müşteri
              <select
                value={form.customerId}
                onChange={(event) => chooseCustomer(event.target.value)}
              >
                <option value="">Misafir / listede olmayan müşteri</option>
                {customers.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.first_name} {item.last_name} · {item.email}
                  </option>
                ))}
              </select>
            </label>
            <label>
              İlgili sipariş
              <select
                value={form.orderId}
                onChange={(event) =>
                  setForm((value) => ({
                    ...value,
                    orderId: event.target.value,
                  }))
                }
              >
                <option value="">Siparişe bağlı değil</option>
                {orders.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.order_number} ·{" "}
                    {item.customer_name ?? "Misafir müşteri"} · {item.status}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Ad soyad
              <input
                required
                value={form.contactName}
                onChange={(event) =>
                  setForm((value) => ({
                    ...value,
                    contactName: event.target.value,
                  }))
                }
              />
            </label>
            <label>
              E-posta
              <input
                type="email"
                value={form.contactEmail}
                onChange={(event) =>
                  setForm((value) => ({
                    ...value,
                    contactEmail: event.target.value,
                  }))
                }
              />
            </label>
            <label>
              Telefon
              <input
                value={form.contactPhone}
                onChange={(event) =>
                  setForm((value) => ({
                    ...value,
                    contactPhone: event.target.value,
                  }))
                }
              />
            </label>
            <label>
              Konu
              <input
                required
                value={form.subject}
                onChange={(event) =>
                  setForm((value) => ({
                    ...value,
                    subject: event.target.value,
                  }))
                }
              />
            </label>
            <label>
              Öncelik
              <select
                value={form.priority}
                onChange={(event) =>
                  setForm((value) => ({
                    ...value,
                    priority: event.target.value,
                  }))
                }
              >
                {Object.entries(priorities).map(([key, label]) => (
                  <option key={key} value={key}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              İlk mesaj
              <textarea
                required
                value={form.message}
                onChange={(event) =>
                  setForm((value) => ({
                    ...value,
                    message: event.target.value,
                  }))
                }
              />
            </label>
            <button disabled={busy}>Talebi kaydet</button>
          </form>
          <div>
            <div className="period-toolbar">
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Talep, müşteri veya iletişim ara"
              />
              <label>
                Durum
                <select
                  value={status}
                  onChange={(event) => setStatus(event.target.value)}
                >
                  <option value="">Tümü</option>
                  {Object.entries(statuses).map(([key, label]) => (
                    <option key={key} value={key}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Öncelik
                <select
                  value={priorityFilter}
                  onChange={(event) => setPriorityFilter(event.target.value)}
                >
                  <option value="">Tümü</option>
                  {Object.entries(priorities).map(([key, label]) => (
                    <option key={key} value={key}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={overdueOnly}
                  onChange={(event) => setOverdueOnly(event.target.checked)}
                />{" "}
                Yalnız gecikenler
              </label>
            </div>
            <div className="cards">
              {shown.length ? (
                shown.map((row) => (
                  <button
                    type="button"
                    className="form-card"
                    key={row.id}
                    onClick={() => void open(row.id)}
                  >
                    <p>
                      {row.ticket_number} · {priorities[row.priority]}
                    </p>
                    <h2>{row.subject}</h2>
                    <p>
                      {row.contact_name} · {statuses[row.status]}
                    </p>
                    {row.order_number && <p>Sipariş: {row.order_number}</p>}
                    <p>{deadline(row)}</p>
                  </button>
                ))
              ) : (
                <p>Bu filtrede destek talebi yok.</p>
              )}
            </div>
          </div>
        </div>
        {selected && (
          <section className="form-card">
            <div className="button-row">
              <button
                type="button"
                className="secondary"
                onClick={() => setSelected(null)}
              >
                Kapat
              </button>
              <h2>
                {selected.ticket_number} · {selected.subject}
              </h2>
            </div>
            <p>
              {selected.contact_name} ·{" "}
              {selected.contact_email ??
                selected.contact_phone ??
                "İletişim bilgisi yok"}
            </p>
            <p>
              <strong>{deadline(selected)}</strong>
            </p>
            <div className="two-columns">
              <label>
                Sorumlu
                <select
                  disabled={busy}
                  value={selected.assigned_to ?? ""}
                  onChange={(event) =>
                    void update({ assignedTo: event.target.value || null })
                  }
                >
                  <option value="">Sorumlu atanmamış</option>
                  {assignees.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.email} · {item.role}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Durum
                <select
                  disabled={busy}
                  value={selected.status}
                  onChange={(event) =>
                    void update({ status: event.target.value })
                  }
                >
                  {Object.entries(statuses).map(([key, label]) => (
                    <option key={key} value={key}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Öncelik
                <select
                  disabled={busy}
                  value={selected.priority}
                  onChange={(event) =>
                    void update({ priority: event.target.value })
                  }
                >
                  {Object.entries(priorities).map(([key, label]) => (
                    <option key={key} value={key}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <h3>Mesaj geçmişi</h3>
            {selected.messages.map((item) => (
              <article key={item.id}>
                <p>
                  <strong>{item.is_internal ? "İÇ NOT" : "MESAJ"}</strong> ·{" "}
                  {item.created_by_email ?? "Sistem"} ·{" "}
                  {new Date(item.created_at).toLocaleString("tr-TR")}
                </p>
                <p>{item.body}</p>
              </article>
            ))}
            <form onSubmit={send}>
              <label>
                Yeni mesaj
                <textarea
                  required
                  value={reply}
                  onChange={(event) => setReply(event.target.value)}
                />
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={internal}
                  onChange={(event) => setInternal(event.target.checked)}
                />{" "}
                Bu yalnızca personelin göreceği iç nottur
              </label>
              <button disabled={busy}>Mesajı kaydet</button>
            </form>
            <h3>İşlem geçmişi</h3>
            {selected.activity.length ? (
              selected.activity.map((item) => (
                <p key={item.id}>
                  <strong>{item.action}</strong> ·{" "}
                  {item.actor_email ?? "Sistem"} ·{" "}
                  {new Date(item.created_at).toLocaleString("tr-TR")}
                </p>
              ))
            ) : (
              <p>Bu talep için ek işlem kaydı yok.</p>
            )}
          </section>
        )}
      </section>
    </main>
  );
}

export default function SupportPage() {
  return (
    <Suspense fallback={<main><AdminNav /><p>Destek ekranı yükleniyor...</p></main>}>
      <SupportPageContent />
    </Suspense>
  );
}
