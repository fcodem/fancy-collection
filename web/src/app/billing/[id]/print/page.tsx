import type { Metadata } from "next";
import { redirect, notFound } from "next/navigation";
import prisma from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { BRAND_FULL_NAME } from "@/lib/branding";
import BillingPrintActions from "./PrintActions";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const invoice = await prisma.invoice.findUnique({
    where: { id: parseInt(id, 10) },
    select: { invoiceNumber: true },
  });
  if (!invoice) return { title: "Print Invoice" };
  return { title: `Invoice ${invoice.invoiceNumber}` };
}

export default async function BillingPrintPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const { id } = await params;
  const invoice = await prisma.invoice.findUnique({
    where: { id: parseInt(id, 10) },
    include: { rental: { include: { customer: true } } },
  });
  if (!invoice) notFound();

  return (
    <>
      <BillingPrintActions />
      <h1>👑 {BRAND_FULL_NAME}</h1>
      <h2>Invoice {invoice.invoiceNumber}</h2>
      <p>{invoice.rental.customer.name}</p>
      <p>Total: ₹{invoice.total.toLocaleString()}</p>
      <p>Paid: ₹{invoice.amountPaid.toLocaleString()}</p>
    </>
  );
}
