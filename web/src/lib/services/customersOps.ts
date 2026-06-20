import prisma from "../prisma";

export async function listCustomers(q = "", category = "") {
  const customers = await prisma.customer.findMany({
    where: q
      ? {
          OR: [
            { name: { contains: q } },
            { phone: { contains: q } },
            { email: { contains: q } },
          ],
        }
      : undefined,
    orderBy: { name: "asc" },
    take: 500,
  });

  if (!category) return customers;

  const filtered = [];
  for (const c of customers) {
    const booking = await prisma.booking.findFirst({
      where: {
        contact1: c.phone,
        bookingItems: { some: { category } },
      },
    });
    if (booking) filtered.push(c);
  }
  return filtered;
}

export async function getCustomer(id: number) {
  return prisma.customer.findUnique({
    where: { id },
    include: { rentals: { orderBy: { createdAt: "desc" }, take: 20 } },
  });
}

export async function createCustomer(data: {
  name: string;
  phone: string;
  email?: string;
  address?: string;
  id_proof?: string;
  notes?: string;
}) {
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

export async function exportCustomersWhatsapp(category = "") {
  const customers = await listCustomers("", category);
  const header = "Name,Phone,Address\n";
  const rows = customers.map((c) =>
    `"${c.name.replace(/"/g, '""')}","${c.phone}","${(c.address || "").replace(/"/g, '""')}"`
  );
  return header + rows.join("\n");
}
