"use client";

import { FormEvent, Suspense, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { AdminNav } from "../components/admin-nav";
import { api } from "../lib/api";
import { useOrderPermissions } from '../lib/use-order-permissions';
import { useFinanceSubmission } from '../lib/use-finance-submission';
import { createActionLock, createRequestGate } from '../lib/async-controls';
import { downloadXlsx } from '../lib/xlsx';
import styles from './support.module.css';

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
  order_id: string | null;
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
type Summary = { open_count: string; urgent_count: string; overdue_count: string };
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
const staffRoles:Record<string,string>={SUPER_ADMIN:'Müdür',ADMIN:'Yönetici',WAREHOUSE:'Depo',FINANCE:'Finans'};
const orderStatuses:Record<string,string>={PENDING_PAYMENT:'Ödeme bekliyor',PAID:'Onaylandı',PROCESSING:'Hazırlanıyor',SHIPPED:'Kargoda',DELIVERED:'Teslim edildi',CANCELLED:'İptal edildi',REFUNDED:'İade edildi'};
const activityNames:Record<string,string>={'support_ticket.created':'Talep oluşturuldu','support_ticket.updated':'Talep güncellendi','support_ticket.message_added':'Yeni mesaj kaydedildi'};
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
  const {permissions,loading:accessLoading,error:accessError,refresh:refreshPermissions}=useOrderPermissions();
  const [rows, setRows] = useState<Ticket[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [orders, setOrders] = useState<OrderOption[]>([]);
  const [assignees, setAssignees] = useState<Assignee[]>([]);
  const [workload, setWorkload] = useState<Workload[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [selected, setSelected] = useState<Detail | null>(null);
  const [form, setForm] = useState(empty);
  const [reply, setReply] = useState("");
  const [internal, setInternal] = useState(false);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("");
  const [priorityFilter, setPriorityFilter] = useState("");
  const [assigneeFilter, setAssigneeFilter] = useState("");
  const [overdueOnly, setOverdueOnly] = useState(false);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [listLoading,setListLoading]=useState(true),[listReady,setListReady]=useState(false),[listError,setListError]=useState(''),[auxError,setAuxError]=useState('');
  const [customerReady,setCustomerReady]=useState(false),[orderReady,setOrderReady]=useState(false),[loadedStatus,setLoadedStatus]=useState<string|null>(null);
  const [detailLoading,setDetailLoading]=useState(false),[detailReady,setDetailReady]=useState(false),[detailError,setDetailError]=useState('');
  const ticketSubmission=useFinanceSubmission('/admin/support-tickets/idempotent','id','Destek talebi');
  const messageSubmission=useFinanceSubmission(`/admin/support-tickets/${selected?.id??'unselected'}/messages/idempotent`,'id','Destek mesajı');
  const alive=useRef(true),listGate=useRef(createRequestGate()),detailGate=useRef(createRequestGate()),actionLock=useRef(createActionLock());
  const listReadyRef=useRef(false),detailReadyRef=useRef(false),selectedId=useRef<string|null>(null),messageTarget=useRef<string|null>(null);
  const drafts=useRef<Record<string,{reply:string;internal:boolean}>>({});
  const detailHeading=useRef<HTMLHeadingElement>(null);
  const appliedCustomer=useRef<string|null>(null),appliedOrder=useRef<string|null>(null);
  const pending=Boolean(ticketSubmission.pending||messageSubmission.pending);
  const blocked=busy||ticketSubmission.busy||messageSubmission.busy||pending;
  const openedTicketId = useRef<string | null>(null);
  async function load(afterWrite=false) {
    if(actionLock.current.isLocked()&&!afterWrite)return false;
    const ticket=listGate.current.begin();listReadyRef.current=false;setListReady(false);setListLoading(true);setListError('');setAuxError('');
    const mayCustomers=!accessLoading&&permissions.supportCreate&&permissions.viewCustomer;
    const mayOrders=!accessLoading&&permissions.supportCreate&&permissions.viewOrders;
    try {
      const [tickets, customerRows, orderRows, staffRows, workloadRows, summaryRow] =
        await Promise.allSettled([
          api<Ticket[]>(
            `/admin/support-tickets${status ? `?status=${encodeURIComponent(status)}` : ""}`,
          ),
          mayCustomers?api<Customer[]>("/admin/customers"):Promise.resolve([] as Customer[]),
          mayOrders?api<OrderOption[]>("/admin/orders"):Promise.resolve([] as OrderOption[]),
          api<Assignee[]>("/admin/support-tickets/assignees"),
          api<Workload[]>("/admin/support-tickets/workload"),
          api<Summary>("/admin/support-tickets/summary"),
        ]);
      if(!alive.current||!listGate.current.isCurrent(ticket))return false;
      const coreOk=tickets.status==='fulfilled'&&Array.isArray(tickets.value);
      if(tickets.status==='fulfilled'&&Array.isArray(tickets.value)){setRows(tickets.value);setLoadedStatus(status);setListReady(true);listReadyRef.current=true;}
      else setListError(tickets.status==='rejected'&&tickets.reason instanceof Error?tickets.reason.message:'Destek talepleri doğrulanamadı.');
      const customersOk=mayCustomers&&customerRows.status==='fulfilled'&&Array.isArray(customerRows.value);
      const ordersOk=mayOrders&&orderRows.status==='fulfilled'&&Array.isArray(orderRows.value);
      setCustomers(customersOk&&customerRows.status==='fulfilled'?customerRows.value:[]);setCustomerReady(customersOk);
      setOrders(ordersOk&&orderRows.status==='fulfilled'?orderRows.value:[]);setOrderReady(ordersOk);
      setAssignees(staffRows.status==='fulfilled'&&Array.isArray(staffRows.value)?staffRows.value:[]);
      setWorkload(workloadRows.status==='fulfilled'&&Array.isArray(workloadRows.value)?workloadRows.value:[]);
      setSummary(summaryRow.status==='fulfilled'?summaryRow.value:null);
      setForm(value=>({...value,customerId:mayCustomers?value.customerId:'',orderId:mayOrders?value.orderId:''}));
      const warnings=[mayCustomers&&!customersOk?'Müşteri seçenekleri alınamadı.': '',mayOrders&&!ordersOk?'Sipariş seçenekleri alınamadı.':'',staffRows.status==='rejected'?'Sorumlu seçenekleri alınamadı.':'',workloadRows.status==='rejected'?'İş yükü özeti alınamadı.':'',summaryRow.status==='rejected'?'Talep özeti alınamadı.':''].filter(Boolean);
      setAuxError(warnings.join(' '));return coreOk;
    } catch (error) {
      if(alive.current&&listGate.current.isCurrent(ticket))setListError(error instanceof Error?error.message:'Talepler yüklenemedi.');return false;
    }finally{if(alive.current&&listGate.current.isCurrent(ticket))setListLoading(false);}
  }
  useEffect(()=>{alive.current=true;return()=>{alive.current=false;listReadyRef.current=false;detailReadyRef.current=false;listGate.current.invalidate();detailGate.current.invalidate();};},[]);
  useEffect(() => {
    void load();
    return()=>{listGate.current.invalidate();listReadyRef.current=false;};
  }, [status,accessLoading,permissions.supportCreate,permissions.viewCustomer,permissions.viewOrders]);
  useEffect(() => {
    if (searchParams.get("overdue") === "true") setOverdueOnly(true);
  }, [searchParams]);
  useEffect(() => {
    const orderId = searchParams.get("order");
    if(!orderId)appliedOrder.current=null;
    if (orderId && appliedOrder.current!==orderId&&!blocked&&orders.some((order) => order.id === orderId)) {
      appliedOrder.current=orderId;
      setForm((value) => ({ ...value, orderId }));
    }
  }, [orders, searchParams,blocked]);
  async function open(id: string,afterWrite=false) {
    if(actionLock.current.isLocked()&&!afterWrite||pending&&!afterWrite)return false;
    if(id!==selectedId.current){
      if(selectedId.current)drafts.current[selectedId.current]={reply,internal};
      const draft=drafts.current[id];setReply(draft?.reply??'');setInternal(draft?.internal??false);
    }
    const ticket=detailGate.current.begin();selectedId.current=id;detailReadyRef.current=false;
    setDetailReady(false);setDetailLoading(true);setDetailError('');setSelected(null);
    try {
      const result=await api<Detail>(`/admin/support-tickets/${id}`);
      if(!alive.current||!detailGate.current.isCurrent(ticket)||selectedId.current!==id)return false;
      if(!result||result.id!==id||!Array.isArray(result.messages)||!Array.isArray(result.activity))throw new Error('Destek talebi doğrulanamadı.');
      setSelected(result);setDetailReady(true);detailReadyRef.current=true;return true;
    } catch (error) {
      if(alive.current&&detailGate.current.isCurrent(ticket))setDetailError(error instanceof Error?error.message:'Talep açılamadı.');return false;
    } finally {
      if(alive.current&&detailGate.current.isCurrent(ticket))setDetailLoading(false);
    }
  }
  function close(){
    if(actionLock.current.isLocked()||pending)return;
    if(selectedId.current)drafts.current[selectedId.current]={reply,internal};
    detailGate.current.invalidate();selectedId.current=null;detailReadyRef.current=false;setSelected(null);setDetailReady(false);setDetailLoading(false);setDetailError('');setReply('');setInternal(false);
  }
  useEffect(()=>{if(selected){detailHeading.current?.focus({preventScroll:true});detailHeading.current?.scrollIntoView({behavior:'smooth',block:'start'});}},[selected?.id]);
  useEffect(() => {
    const ticketId = searchParams.get("ticket");
    if (
      blocked || !ticketId ||
      openedTicketId.current === ticketId ||
      !rows.some((ticket) => ticket.id === ticketId)
    ) {
      return;
    }
    openedTicketId.current = ticketId;
    void open(ticketId);
  }, [rows, searchParams,blocked]);
  async function createRecord(retry=false) {
    if(!alive.current||accessLoading||!permissions.supportCreate||actionLock.current.isLocked()||messageSubmission.pending)return;
    if(!retry){
      if(!listReadyRef.current||ticketSubmission.pending)return;
      if(form.contactName.trim().length<2||form.subject.trim().length<3||form.message.trim().length<2){setMessage('Ad, konu ve mesaj alanlarını doldurun.');return;}
      if(form.customerId&&(!customerReady||!permissions.viewCustomer||!customers.some(item=>item.id===form.customerId))||form.orderId&&(!orderReady||!permissions.viewOrders||!orders.some(item=>item.id===form.orderId))){setMessage('Seçilen müşteri veya sipariş doğrulanamadı. Seçenekleri yenileyin ya da bağlantıyı kaldırın.');return;}
    }
    if(!actionLock.current.acquire())return;
    listGate.current.invalidate();setListLoading(false);setBusy(true);setMessage('');
    try {
      const ticket=retry?await ticketSubmission.retry():await ticketSubmission.send(JSON.stringify({...form,contactName:form.contactName.trim(),subject:form.subject.trim(),message:form.message.trim(),customerId:form.customerId||undefined,orderId:form.orderId||undefined,contactEmail:form.contactEmail.trim()||undefined,contactPhone:form.contactPhone.trim()||undefined}));
      if(!alive.current)return;
      setForm({...empty});setMessage(ticket.replayed?'Mevcut destek talebi doğrulandı. İkinci kayıt oluşturulmadı.':'Destek talebi oluşturuldu.');
      await Promise.all([load(true),open(ticket.id!,true)]);
    } catch (error) {
      if(alive.current)setMessage(
        error instanceof Error ? error.message : "Talep oluşturulamadı.",
      );
    } finally {
      actionLock.current.release();if(alive.current)setBusy(false);
    }
  }
  async function create(event:FormEvent){event.preventDefault();await createRecord();}
  async function update(change: Record<string, string | null>) {
    if(!alive.current||accessLoading||!permissions.supportEdit||!selected||!detailReadyRef.current||selectedId.current!==selected.id||pending||actionLock.current.isLocked())return;
    if(change.assignedTo&&!assignees.some(item=>item.id===change.assignedTo)){setMessage('Sorumlu seçenekleri doğrulanamadı. Listeyi yenileyin.');return;}
    if(!actionLock.current.acquire())return;
    const target=selected.id;listGate.current.invalidate();setListLoading(false);setBusy(true);setMessage('');
    try {
      await api(`/admin/support-tickets/${target}`, {
        method: "PATCH",
        body: JSON.stringify(change),
      });
      if(!alive.current)return;
      setMessage('Talep değişikliği kaydedildi.');await Promise.all([open(target,true),load(true)]);
    } catch (error) {
      if(alive.current){detailReadyRef.current=false;setDetailReady(false);setDetailError('Yeni değişiklik yapmadan önce talebi yenileyin.');setMessage(error instanceof Error?error.message:'Değişiklik sonucu doğrulanamadı.');}
    } finally {
      actionLock.current.release();if(alive.current)setBusy(false);
    }
  }
  async function sendRecord(retry=false) {
    if(!alive.current||accessLoading||!permissions.supportMessage||actionLock.current.isLocked()||ticketSubmission.pending)return;
    if(!retry&&(!selected||!detailReadyRef.current||selectedId.current!==selected.id||messageSubmission.pending))return;
    if(!retry&&reply.trim().length<2){setMessage('Mesaj en az iki karakter olmalıdır.');return;}
    const target=retry?messageTarget.current:selected?.id;if(!target)return;
    if(!actionLock.current.acquire())return;
    messageTarget.current=target;listGate.current.invalidate();setListLoading(false);setBusy(true);setMessage('');
    try {
      const result=retry?await messageSubmission.retry():await messageSubmission.send(JSON.stringify({body:reply.trim(),isInternal:internal}));
      if(!alive.current)return;
      delete drafts.current[target];setReply('');setInternal(false);setMessage(result.replayed?'Mevcut destek mesajı doğrulandı. İkinci mesaj oluşturulmadı.':'Destek mesajı kaydedildi.');
      await Promise.all([open(target,true),load(true)]);
    } catch (error) {
      if(alive.current)setMessage(
        error instanceof Error ? error.message : "Mesaj kaydedilemedi.",
      );
    } finally {
      actionLock.current.release();if(alive.current)setBusy(false);
    }
  }
  async function send(event:FormEvent){event.preventDefault();await sendRecord();}
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
  useEffect(() => {
    const customerId = searchParams.get("customer");
    if(!customerId)appliedCustomer.current=null;
    if (customerId && appliedCustomer.current!==customerId&&!blocked&&customers.some((customer) => customer.id === customerId)) {
      appliedCustomer.current=customerId;
      chooseCustomer(customerId);
    }
  }, [customers, searchParams,blocked]);
  const shown = rows.filter((row) => {
    const matchesQuery =
      `${row.ticket_number} ${row.contact_name} ${row.contact_email ?? ""} ${row.contact_phone ?? ""} ${row.subject}`
        .toLocaleLowerCase("tr-TR")
        .includes(query.trim().toLocaleLowerCase("tr-TR"));
    const isOverdue =
      !["RESOLVED", "CLOSED"].includes(row.status) &&
      new Date(row.due_at).getTime() < Date.now();
    return (
      matchesQuery &&
      (!priorityFilter || row.priority === priorityFilter) &&
      (!assigneeFilter ||
        (assigneeFilter === "UNASSIGNED"
          ? !row.assigned_email
          : row.assigned_email === assigneeFilter)) &&
      (!overdueOnly || isOverdue)
    );
  });
  const deadline = (ticket: Ticket) => {
    const overdue =
      !["RESOLVED", "CLOSED"].includes(ticket.status) &&
      new Date(ticket.due_at).getTime() < Date.now();
    return `${overdue ? "GECİKTİ · " : "Yanıt hedefi: "}${new Date(ticket.due_at).toLocaleString("tr-TR",{timeZone:'Europe/Istanbul'})}`;
  };
  function exportTickets() {
    if(!listReady||listLoading||loadedStatus!==status||blocked||!shown.length)return;
    downloadXlsx('trex-destek-talepleri.xlsx','Destek Talepleri',[
      ['Durum Filtresi',statuses[status]??'Tümü'],['Arama',query.trim()],['Öncelik',priorities[priorityFilter]??'Tümü'],['Sorumlu',assigneeFilter||'Tümü'],['Yalnız Gecikenler',overdueOnly?'Evet':'Hayır'],[],
      ['Talep No','Müşteri','E-posta','Telefon','Konu','Durum','Öncelik','Sipariş','Sorumlu','Oluşturulma','Yanıt Hedefi'],
      ...shown.map(ticket=>[ticket.ticket_number,ticket.contact_name,ticket.contact_email,ticket.contact_phone,ticket.subject,statuses[ticket.status]??ticket.status,priorities[ticket.priority]??ticket.priority,ticket.order_number,ticket.assigned_email,new Date(ticket.created_at).toLocaleString('tr-TR',{timeZone:'Europe/Istanbul'}),new Date(ticket.due_at).toLocaleString('tr-TR',{timeZone:'Europe/Istanbul'})])
    ]);
  }
  return (
    <main>
      <AdminNav />
      <section className={styles.workspace}>
        <p>MÜŞTERİLER / DESTEK</p>
        <header className={styles.header}><h1>Müşteri Talepleri</h1><button type="button" className="secondary" disabled={blocked||listLoading} onClick={()=>void load()}>{listLoading?'Yükleniyor…':'Talepleri Yenile'}</button></header>
        <p>Talep, mesaj, sorumlu ve yanıt hedefini tek ekrandan yönetin.</p>
        <p>Özetler tüm talepleri; liste ve Excel seçili filtreleri gösterir.</p>
        {accessError&&<div role="alert"><p>{accessError}</p><button type="button" onClick={()=>void refreshPermissions()}>Yetkileri Yenile</button></div>}
        {listError&&<p className="notice" role="alert">{listError} Talep listesini yeniden yükleyin.</p>}
        {auxError&&<p className="notice" role="alert">{auxError} Alınabilen talep bilgileri gösteriliyor.</p>}
        {message && <p role="status">{message}</p>}
        {ticketSubmission.pending&&<section className="form-card"><h2>Destek Talebini Kontrol Edin</h2><p>İşlemin sonucu doğrulanamadı. Yeni talep oluşturmadan aynı isteği kontrol edin. Sayfayı kapatırsanız önce talep geçmişini inceleyin.</p><button type="button" disabled={busy||accessLoading||!permissions.supportCreate} onClick={()=>void createRecord(true)}>Talebi Doğrula / Yeniden Dene</button></section>}
        {messageSubmission.pending&&<section className="form-card"><h2>Destek Mesajını Kontrol Edin</h2><p>Mesajın sonucu doğrulanamadı. Aynı mesajı tekrar yazmadan asıl isteği kontrol edin. Sayfayı kapatırsanız önce mesaj geçmişini inceleyin.</p><button type="button" disabled={busy||accessLoading||!permissions.supportMessage} onClick={()=>void sendRecord(true)}>Mesajı Doğrula / Yeniden Dene</button></section>}
        {detailLoading&&<div role="status">Destek talebi açılıyor… <button type="button" className="secondary" disabled={blocked} onClick={close}>Açmayı İptal Et</button></div>}
        {detailError&&<section className="notice" role="alert"><p>{detailError}</p><button type="button" disabled={blocked||detailLoading} onClick={()=>{if(selectedId.current)void open(selectedId.current);}}>Talebi Yenile</button></section>}
        {summary && (
          <div className="cards">
            <article>
              <p>Açık talep</p>
              <h2>{summary.open_count}</h2>
            </article>
            <article>
              <p>Yüksek / acil</p>
              <h2>{summary.urgent_count}</h2>
            </article>
            <article>
              <p>Geciken</p>
              <h2>{summary.overdue_count}</h2>
            </article>
          </div>
        )}
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
        <div className={permissions.supportCreate?'two-columns':undefined}>
          {permissions.supportCreate&&<form className="form-card" onSubmit={create}>
            <h2>Yeni destek talebi</h2>
            <fieldset className={styles.fields} disabled={blocked||accessLoading||!listReady||listLoading}>
            <label>
              Kayıtlı müşteri
              <select
                disabled={!customerReady||!permissions.viewCustomer}
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
              {!permissions.viewCustomer&&<small>Müşteri listesi yetkiniz kapalı. İletişim alanlarıyla talep oluşturabilirsiniz.</small>}
              {permissions.viewCustomer&&!customerReady&&<small>Müşteri seçenekleri alınamadı; mevcut bağlantıyı kaldırabilir veya listeyi yenileyebilirsiniz.</small>}
              {form.customerId&&!customerReady&&<button type="button" className="secondary" onClick={()=>setForm(value=>({...value,customerId:''}))}>Müşteri Bağlantısını Kaldır</button>}
            </label>
            <label>
              İlgili sipariş
              <select
                disabled={!orderReady||!permissions.viewOrders}
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
                    {item.customer_name ?? "Misafir müşteri"} · {orderStatuses[item.status]??'Durum bilgisi yok'}
                  </option>
                ))}
              </select>
              {!permissions.viewOrders&&<small>Sipariş listesi yetkiniz kapalı. Siparişe bağlamadan talep oluşturabilirsiniz.</small>}
              {permissions.viewOrders&&!orderReady&&<small>Sipariş seçenekleri alınamadı; bağlantıyı kaldırabilir veya listeyi yenileyebilirsiniz.</small>}
              {form.orderId&&!orderReady&&<button type="button" className="secondary" onClick={()=>setForm(value=>({...value,orderId:''}))}>Sipariş Bağlantısını Kaldır</button>}
            </label>
            <label>
              Ad soyad
              <input
                required
                minLength={2} maxLength={160}
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
                minLength={3} maxLength={200}
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
                minLength={2} maxLength={5000}
                value={form.message}
                onChange={(event) =>
                  setForm((value) => ({
                    ...value,
                    message: event.target.value,
                  }))
                }
              />
            </label>
            <button disabled={blocked||!listReady||listLoading}>Talebi Kaydet</button>
            </fieldset>
          </form>}
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
                  disabled={blocked}
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
                Sorumlu
                <select
                  value={assigneeFilter}
                  onChange={(event) => setAssigneeFilter(event.target.value)}
                >
                  <option value="">Tümü</option>
                  {assignees.map((item) => (
                    <option key={item.id} value={item.email}>
                      {item.email}
                    </option>
                  ))}
                  <option value="UNASSIGNED">Atanmamış</option>
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
              <button type="button" className="secondary" disabled={!listReady||listLoading||loadedStatus!==status||blocked||!shown.length} onClick={exportTickets}>
                Excel&apos;e Aktar
              </button>
            </div>
            <div className="cards">
              {listReady&&loadedStatus===status&&shown.length ? (
                shown.map((row) => (
                  <button
                    type="button"
                    className={`form-card ${styles.ticket}`}
                    disabled={blocked}
                    aria-pressed={selected?.id===row.id}
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
                    <p>
                      {row.assigned_email
                        ? `Sorumlu: ${row.assigned_email}`
                        : "Sorumlu atanmamış"}
                      {row.contact_phone
                        ? ` · ${row.contact_phone}`
                        : row.contact_email
                          ? ` · ${row.contact_email}`
                          : ""}
                    </p>
                    {row.order_number && <p>Sipariş: {row.order_number}</p>}
                    <p>{deadline(row)}</p>
                  </button>
                ))
              ) : (
                <p role="status">{listLoading?'Destek talepleri yükleniyor…':!listReady||loadedStatus!==status?'Talep listesi doğrulanamadı. Talepleri Yenile düğmesini kullanın.':'Bu filtrede destek talebi yok.'}</p>
              )}
            </div>
          </div>
        </div>
        {selected && (
          <section id="support-detail" className={`form-card ${styles.detail}`}>
            <div className="button-row">
              <button
                type="button"
                className="secondary"
                disabled={blocked}
                onClick={close}
              >
                Kapat
              </button>
              <h2 ref={detailHeading} tabIndex={-1}>
                {selected.ticket_number} · {selected.subject}
              </h2>
            </div>
            <p>
              {selected.contact_name} ·{" "}
              {selected.contact_email ??
                selected.contact_phone ??
                "İletişim bilgisi yok"}
            </p>
            {selected.order_id && permissions.viewOrders && (
              <p>
                <Link href={`/siparisler/${selected.order_id}`}>
                  İlgili siparişi aç
                </Link>
              </p>
            )}
            <p>
              <strong>{deadline(selected)}</strong>
            </p>
            <div className="two-columns">
              <label>
                Sorumlu
                <select
                  disabled={blocked||accessLoading||!permissions.supportEdit||!detailReady}
                  value={selected.assigned_to ?? ""}
                  onChange={(event) =>
                    void update({ assignedTo: event.target.value || null })
                  }
                >
                  <option value="">Sorumlu atanmamış</option>
                  {selected.assigned_to&&!assignees.some(item=>item.id===selected.assigned_to)&&<option value={selected.assigned_to}>{selected.assigned_email??'Mevcut sorumlu'}</option>}
                  {assignees.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.email} · {staffRoles[item.role]??'Personel'}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Durum
                <select
                  disabled={blocked||accessLoading||!permissions.supportEdit||!detailReady}
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
                  disabled={blocked||accessLoading||!permissions.supportEdit||!detailReady}
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
              <article className={`${styles.message} ${item.is_internal?styles.internal:''}`} key={item.id}>
                <p>
                  <strong>{item.is_internal ? "İÇ NOT" : "MESAJ"}</strong> ·{" "}
                  {item.created_by_email ?? "Sistem"} ·{" "}
                  {new Date(item.created_at).toLocaleString("tr-TR",{timeZone:'Europe/Istanbul'})}
                </p>
                <p className={styles.messageBody}>{item.body}</p>
              </article>
            ))}
            {permissions.supportMessage&&<form onSubmit={send}>
              <fieldset className={styles.fields} disabled={blocked||accessLoading||!detailReady}>
              <label>
                Yeni mesaj
                <textarea
                  required
                  minLength={2} maxLength={5000}
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
              <button disabled={blocked||!detailReady}>Mesajı Kaydet</button>
              </fieldset>
            </form>}
            <h3>İşlem geçmişi</h3>
            {selected.activity.length ? (
              selected.activity.map((item) => (
                <p key={item.id}>
                  <strong>{activityNames[item.action]??'Talep işlemi'}</strong> ·{" "}
                  {item.actor_email ?? "Sistem"} ·{" "}
                  {new Date(item.created_at).toLocaleString("tr-TR",{timeZone:'Europe/Istanbul'})}
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
