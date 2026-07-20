import prisma from "../prisma";
import { phoneMatchKey, aisensyCsvPhone } from "../phone";
import { memoryCachedQuery } from "../perfCache";
import { getFreshShopRevision } from "../realtime/revision";

export type CustomerListRow = {
  id: number;
  name: string;
  phone: string;
  whatsapp: string;
  email: string | null;
  address: string | null;
};

type BookingRow = {
  customerName: string;
  contact1: string;
  contact2: string | null;
  whatsappNo: string | null;
  customerAddress: string;
  createdAt: Date;
};

const customerListSelect = {
  id: true,
  name: true,
  phone: true,
  email: true,
  address: true,
} as const;

/** Union phone keys that belong to the same person (shared contact / WhatsApp). */
class PhoneUnionFind {
  private parent = new Map<string, string>();

  touch(key: string): void {
    if (!this.parent.has(key)) this.parent.set(key, key);
  }

  find(key: string): string {
    this.touch(key);
    const p = this.parent.get(key)!;
    if (p !== key) {
      const root = this.find(p);
      this.parent.set(key, root);
      return root;
    }
    return key;
  }

  union(a: string, b: string): void {
    if (a.length < 10 || b.length < 10 || a === b) return;
    const ra = this.find(a);
    const rb = this.find(b);
    if (ra !== rb) this.parent.set(ra, rb);
  }

  unionAll(keys: string[]): void {
    const valid = keys.filter((k) => k.length >= 10);
    for (let i = 1; i < valid.length; i++) this.union(valid[0], valid[i]);
  }

  components(): Map<string, Set<string>> {
    const groups = new Map<string, Set<string>>();
    for (const key of this.parent.keys()) {
      const root = this.find(key);
      if (!groups.has(root)) groups.set(root, new Set());
      groups.get(root)!.add(key);
    }
    return groups;
  }
}

function phoneKeysFromParts(...parts: (string | null | undefined)[]): string[] {
  const keys = new Set<string>();
  for (const raw of parts) {
    const k = phoneMatchKey(raw || "");
    if (k.length >= 10) keys.add(k);
  }
  return [...keys];
}

function bookingPhoneKeys(b: BookingRow): string[] {
  return phoneKeysFromParts(b.contact1, b.whatsappNo, b.contact2);
}

function matchesQuery(row: CustomerListRow, q: string): boolean {
  if (!q.trim()) return true;
  const needle = q.trim().toLowerCase();
  return (
    row.name.toLowerCase().includes(needle) ||
    row.phone.includes(needle) ||
    row.whatsapp.includes(needle) ||
    (row.email || "").toLowerCase().includes(needle)
  );
}

function bookingMatchesComponent(b: BookingRow, component: Set<string>): boolean {
  return bookingPhoneKeys(b).some((k) => component.has(k));
}

function pickWhatsAppDisplay(
  component: Set<string>,
  primaryContactKey: string,
  bookings: BookingRow[],
): string {
  for (const b of bookings) {
    if (!bookingMatchesComponent(b, component)) continue;
    const wa = (b.whatsappNo || "").trim();
    const contactKey = phoneMatchKey(b.contact1);
    if (wa && phoneMatchKey(wa) !== contactKey) return wa;
  }
  for (const altKey of component) {
    if (altKey === primaryContactKey) continue;
    for (const b of bookings) {
      if (!bookingMatchesComponent(b, component)) continue;
      if (phoneMatchKey(b.contact1) === altKey) return b.contact1.trim();
      const wa = (b.whatsappNo || "").trim();
      if (wa && phoneMatchKey(wa) === altKey) return wa;
      const c2 = (b.contact2 || "").trim();
      if (c2 && phoneMatchKey(c2) === altKey) return c2;
    }
  }
  return "";
}

function buildMergedCustomers(
  bookings: BookingRow[],
  customers: Array<{
    id: number;
    name: string;
    phone: string;
    email: string | null;
    address: string | null;
  }>,
): CustomerListRow[] {
  const uf = new PhoneUnionFind();

  for (const b of bookings) {
    uf.unionAll(bookingPhoneKeys(b));
  }
  for (const c of customers) {
    const k = phoneMatchKey(c.phone);
    if (k.length >= 10) uf.touch(k);
  }
  // Link customer table phones to booking keys when any number matches
  for (const c of customers) {
    const ck = phoneMatchKey(c.phone);
    if (ck.length < 10) continue;
    for (const b of bookings) {
      const bk = bookingPhoneKeys(b);
      if (bk.includes(ck)) uf.unionAll([ck, ...bk]);
    }
  }

  const components = uf.components();
  const bookingsDesc = [...bookings].sort(
    (a, b) => b.createdAt.getTime() - a.createdAt.getTime(),
  );

  const rows: CustomerListRow[] = [];

  for (const component of components.values()) {
    let id = -1;
    let email: string | null = null;
    let address: string | null = null;
    let name = "";
    let phone = "";
    let primaryKey = "";

    for (const c of customers) {
      const ck = phoneMatchKey(c.phone);
      if (ck.length < 10 || !component.has(ck)) continue;
      id = c.id;
      email = c.email;
      address = c.address;
      if (!name) name = c.name;
      if (!phone) {
        phone = c.phone.trim();
        primaryKey = ck;
      }
    }

    for (const b of bookingsDesc) {
      if (!bookingMatchesComponent(b, component)) continue;
      if (!name) name = b.customerName;
      if (!phone) {
        phone = b.contact1.trim();
        primaryKey = phoneMatchKey(b.contact1);
      }
      if (!address && b.customerAddress) address = b.customerAddress;
    }

    if (!primaryKey && component.size) {
      primaryKey = [...component][0];
    }
    if (!phone) {
      for (const b of bookingsDesc) {
        if (!bookingMatchesComponent(b, component)) continue;
        if (phoneMatchKey(b.contact1) === primaryKey) {
          phone = b.contact1.trim();
          break;
        }
        const wa = (b.whatsappNo || "").trim();
        if (wa && phoneMatchKey(wa) === primaryKey) {
          phone = wa;
          break;
        }
      }
    }

    if (!name && !phone) continue;

    const displayName = name || "Customer";
    const displayPhone = phone || primaryKey;

    rows.push({
      id,
      name: displayName,
      phone: displayPhone,
      whatsapp: "",
      email,
      address,
    });

    const primaryPhoneKey = phoneMatchKey(displayPhone);
    const seen = new Set<string>([primaryPhoneKey]);

    for (const altKey of component) {
      if (seen.has(altKey)) continue;
      seen.add(altKey);
      let altPhone = "";
      for (const b of bookingsDesc) {
        if (!bookingMatchesComponent(b, component)) continue;
        if (phoneMatchKey(b.contact1) === altKey) { altPhone = b.contact1.trim(); break; }
        const wa = (b.whatsappNo || "").trim();
        if (wa && phoneMatchKey(wa) === altKey) { altPhone = wa; break; }
        const c2 = (b.contact2 || "").trim();
        if (c2 && phoneMatchKey(c2) === altKey) { altPhone = c2; break; }
      }
      if (altPhone) {
        rows.push({
          id,
          name: displayName,
          phone: altPhone,
          whatsapp: "",
          email,
          address,
        });
      }
    }
  }

  return rows.sort((a, b) => a.name.localeCompare(b.name));
}

async function listCustomersUncached(category: string): Promise<CustomerListRow[]> {
  if (category) {
    const [customers, bookingsWithItems] = await Promise.all([
      prisma.customer.findMany({ orderBy: { id: "desc" }, select: customerListSelect }),
      prisma.booking.findMany({
        orderBy: { createdAt: "desc" },
        select: {
          customerName: true, contact1: true, contact2: true, whatsappNo: true,
          customerAddress: true, createdAt: true,
          bookingItems: { select: { category: true } },
        },
      }),
    ]);
    const bookings = bookingsWithItems.map(({ bookingItems: _bi, ...b }) => b);
    let rows = buildMergedCustomers(bookings, customers);

    const uf = new PhoneUnionFind();
    for (const b of bookingsWithItems) uf.unionAll(bookingPhoneKeys(b));
    const components = uf.components();

    rows = rows.filter((row) => {
      const rowKeys = phoneKeysFromParts(row.phone, row.whatsapp);
      let component: Set<string> | null = null;
      for (const keys of components.values()) {
        if (rowKeys.some((k) => keys.has(k))) {
          component = keys;
          break;
        }
      }
      if (!component) return false;
      return bookingsWithItems.some(
        (b) =>
          bookingMatchesComponent(b, component!) &&
          b.bookingItems.some((bi) => bi.category === category),
      );
    });

    return rows;
  }

  const [customers, bookings] = await Promise.all([
    prisma.customer.findMany({ orderBy: { id: "desc" }, select: customerListSelect }),
    prisma.booking.findMany({
      orderBy: { createdAt: "desc" },
      select: {
        customerName: true, contact1: true, contact2: true, whatsappNo: true,
        customerAddress: true, createdAt: true,
      },
    }),
  ]);

  return buildMergedCustomers(bookings, customers);
}

export async function listCustomers(q = "", category = ""): Promise<CustomerListRow[]> {
  const revision = await getFreshShopRevision();
  const allRows = await memoryCachedQuery(
    ["customer-list", revision, category || "__all"],
    () => listCustomersUncached(category),
    30,
  );
  return q.trim() ? allRows.filter((r) => matchesQuery(r, q)) : allRows;
}

export async function shouldSkipCustomerCreate(contact: string, whatsapp?: string): Promise<boolean> {
  const newKeys = phoneKeysFromParts(contact, whatsapp);
  if (!newKeys.length) return false;

  const searchTails = [...new Set(newKeys.filter((k) => k.length >= 10).map((k) => k.slice(-10)))];
  if (!searchTails.length) return false;

  // Match last-10 digits without full-table LIKE %x% mid-string scans.
  const [bookings, customers] = await Promise.all([
    prisma.booking.findMany({
      where: {
        OR: searchTails.flatMap((t) => [
          { contact1: { endsWith: t } },
          { contact2: { endsWith: t } },
          { whatsappNo: { endsWith: t } },
        ]),
      },
      select: { contact1: true, contact2: true, whatsappNo: true },
      take: 40,
    }),
    prisma.customer.findMany({
      where: { OR: searchTails.map((t) => ({ phone: { endsWith: t } })) },
      select: { phone: true },
      take: 40,
    }),
  ]);

  if (!customers.length) return false;

  const uf = new PhoneUnionFind();
  for (const b of bookings) uf.unionAll(bookingPhoneKeys(b as BookingRow));
  uf.unionAll(newKeys);

  for (const c of customers) {
    const ck = phoneMatchKey(c.phone);
    if (ck.length < 10) continue;
    const root = uf.find(ck);
    for (const nk of newKeys) {
      if (uf.find(nk) === root) return true;
    }
  }
  return false;
}

export async function getCustomer(id: number) {
  return prisma.customer.findUnique({
    where: { id },
    include: { rentals: { orderBy: { createdAt: "desc" }, take: 20 } },
  });
}

export async function findExistingCustomerByPhone(phone: string): Promise<number | null> {
  const key = phoneMatchKey(phone);
  if (key.length < 10) return null;

  const newKeys = phoneKeysFromParts(phone);
  const searchTails = [...new Set(newKeys.filter((k) => k.length >= 10).map((k) => k.slice(-10)))];
  if (!searchTails.length) return null;

  const [bookings, customers] = await Promise.all([
    prisma.booking.findMany({
      where: {
        OR: searchTails.flatMap((t) => [
          { contact1: { endsWith: t } },
          { contact2: { endsWith: t } },
          { whatsappNo: { endsWith: t } },
        ]),
      },
      select: { id: true, contact1: true, contact2: true, whatsappNo: true },
      take: 40,
    }),
    prisma.customer.findMany({
      where: { OR: searchTails.map((t) => ({ phone: { endsWith: t } })) },
      select: { id: true, phone: true },
      take: 40,
    }),
  ]);

  for (const c of customers) {
    const ck = phoneMatchKey(c.phone);
    if (ck.length < 10) continue;
    if (newKeys.includes(ck) || searchTails.some((t) => ck.endsWith(t))) {
      return c.id;
    }
  }

  if (bookings.length > 0) {
    const uf = new PhoneUnionFind();
    for (const b of bookings) uf.unionAll(bookingPhoneKeys(b as unknown as BookingRow));
    uf.unionAll(newKeys);
    for (const c of customers) {
      const ck = phoneMatchKey(c.phone);
      if (ck.length >= 10 && newKeys.some((nk) => uf.find(nk) === uf.find(ck))) {
        return c.id;
      }
    }
  }

  return null;
}

export async function createCustomer(data: {
  name: string;
  phone: string;
  email?: string;
  address?: string;
  id_proof?: string;
  notes?: string;
}) {
  const existingId = await findExistingCustomerByPhone(data.phone);
  if (existingId) {
    throw new Error("A customer with this contact number (or linked WhatsApp) already exists.");
  }
  return prisma.customer.create({
    data: {
      name: data.name.trim(),
      phone: data.phone.trim(),
      email: data.email?.trim() || null,
      address: data.address?.trim() || null,
      idProof: data.id_proof?.trim() || null,
      notes: data.notes?.trim() || null,
    },
  });
}

export async function updateCustomer(
  id: number,
  data: {
    name: string;
    phone: string;
    email?: string;
    address?: string;
    id_proof?: string;
    notes?: string;
  }
) {
  const key = phoneMatchKey(data.phone);
  const newKeys = phoneKeysFromParts(data.phone);
  const searchTails = [...new Set(newKeys.filter((k) => k.length >= 10).map((k) => k.slice(-10)))];
  if (searchTails.length) {
    const rows = await prisma.customer.findMany({
      where: { OR: searchTails.map((t) => ({ phone: { endsWith: t } })) },
      select: { id: true, phone: true },
      take: 40,
    });
    for (const row of rows) {
      if (row.id === id) continue;
      const rowKeys = phoneKeysFromParts(row.phone);
      if (newKeys.some((k) => rowKeys.includes(k)) || (key.length >= 10 && rowKeys.includes(key))) {
        throw new Error("Another customer already uses this contact or linked WhatsApp number.");
      }
    }
  }
  return prisma.customer.update({
    where: { id },
    data: {
      name: data.name.trim(),
      phone: data.phone.trim(),
      email: data.email?.trim() || null,
      address: data.address?.trim() || null,
      idProof: data.id_proof?.trim() || null,
      notes: data.notes?.trim() || null,
    },
  });
}

export async function deleteCustomer(id: number) {
  const rentals = await prisma.rental.count({ where: { customerId: id } });
  if (rentals > 0) throw new Error("Cannot delete customer with rental history.");
  await prisma.customer.delete({ where: { id } });
}

/** AiSensy bulk upload: Name + Phone (91XXXXXXXXXX). One row per number; contact and WhatsApp both when different. */
export async function exportCustomersWhatsapp(category = "") {
  const customers = await listCustomers("", category);
  const header = "Name,Phone,Address\n";
  const rows: string[] = [];

  for (const c of customers) {
    const contact = aisensyCsvPhone(c.phone);
    const whatsapp = c.whatsapp ? aisensyCsvPhone(c.whatsapp) : null;
    const esc = (s: string) => `"${s.replace(/"/g, '""')}"`;
    const addr = esc(c.address || "");

    if (contact) {
      rows.push(`${esc(c.name)},${contact},${addr}`);
    }
    if (whatsapp && whatsapp !== contact) {
      rows.push(`${esc(c.name)},${whatsapp},${addr}`);
    }
  }

  return header + rows.join("\n");
}

type ImportedRow = { name: string; phone: string };

function parseExcelBuffer(buffer: Buffer): ImportedRow[] {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const XLSX = require("xlsx");
  const workbook = XLSX.read(buffer, { type: "buffer" });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const json: Record<string, unknown>[] = XLSX.utils.sheet_to_json(sheet, { defval: "" });

  const rows: ImportedRow[] = [];
  for (const row of json) {
    const values = Object.values(row).map((v) => String(v ?? "").trim());
    const keys = Object.keys(row).map((k) => k.toLowerCase());

    let name = "";
    let phone = "";

    const nameIdx = keys.findIndex((k) => k.includes("name") || k.includes("customer"));
    const phoneIdx = keys.findIndex((k) =>
      k.includes("phone") || k.includes("contact") || k.includes("mobile") || k.includes("number") || k.includes("whatsapp"),
    );

    if (nameIdx >= 0) name = values[nameIdx];
    if (phoneIdx >= 0) phone = values[phoneIdx];

    if (!name && !phone && values.length >= 2) {
      const likelyPhone = values.find((v) => /\d{10}/.test(v.replace(/\D/g, "")));
      const likelyName = values.find((v) => v && v !== likelyPhone && !/^\d+$/.test(v));
      name = likelyName || "";
      phone = likelyPhone || "";
    }

    if (name && phone) rows.push({ name, phone });
  }
  return rows;
}

async function parsePdfBuffer(buffer: Buffer): Promise<ImportedRow[]> {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const pdfParse = require("pdf-parse");
  const data = await pdfParse(buffer);
  const text: string = data.text || "";

  const rows: ImportedRow[] = [];
  const lines = text.split(/\n/).map((l: string) => l.trim()).filter(Boolean);

  for (const line of lines) {
    const phoneMatch = line.match(/(\+?\d[\d\s\-]{8,}\d)/);
    if (!phoneMatch) continue;
    const phone = phoneMatch[1].replace(/[\s\-]/g, "");
    const name = line.replace(phoneMatch[0], "").replace(/[,|;\t]+/g, " ").trim();
    if (name && phone.replace(/\D/g, "").length >= 10) {
      rows.push({ name, phone });
    }
  }
  return rows;
}

export async function bulkImportCustomers(
  buffer: Buffer,
  fileName: string,
  _username: string,
): Promise<{ created: number; merged: number; skipped: number }> {
  const ext = fileName.toLowerCase().split(".").pop() || "";

  let parsed: ImportedRow[];
  if (ext === "pdf") {
    parsed = await parsePdfBuffer(buffer);
  } else {
    parsed = parseExcelBuffer(buffer);
  }

  let created = 0;
  let merged = 0;
  let skipped = 0;

  for (const row of parsed) {
    const key = phoneMatchKey(row.phone);
    if (key.length < 10) {
      skipped++;
      continue;
    }

    const existingId = await findExistingCustomerByPhone(row.phone);
    if (existingId) {
      merged++;
      continue;
    }

    try {
      await prisma.customer.create({
        data: {
          name: row.name.trim(),
          phone: row.phone.trim(),
        },
      });
      created++;
    } catch {
      skipped++;
    }
  }

  return { created, merged, skipped };
}
