import { Prisma, PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
  bookingSchemaSig?: string;
};

const REQUIRED_DELEGATES = ["prospectLead", "shopEnquiry"] as const;

function bookingSchemaSignature() {
  const booking = Prisma.dmmf.datamodel.models.find((m) => m.name === "Booking");
  return booking?.fields.map((f) => f.name).sort().join(",") ?? "";
}

function hasRequiredDelegates(client: PrismaClient): boolean {
  return REQUIRED_DELEGATES.every(
    (key) =>
      typeof (client as unknown as Record<string, { findMany?: unknown }>)[key]
        ?.findMany === "function",
  );
}

function hasBookingQrTokenField(): boolean {
  const booking = Prisma.dmmf.datamodel.models.find((m) => m.name === "Booking");
  return booking?.fields.some((f) => f.name === "qrToken") ?? false;
}

function createPrismaClient() {
  return new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });
}

function getPrismaClient(): PrismaClient {
  let client = globalForPrisma.prisma;
  const sig = bookingSchemaSignature();
  const schemaOk =
    hasRequiredDelegates(client ?? ({} as PrismaClient)) &&
    hasBookingQrTokenField() &&
    globalForPrisma.bookingSchemaSig === sig;

  if (!client || !schemaOk) {
    void client?.$disconnect().catch(() => {});
    client = createPrismaClient();
    globalForPrisma.bookingSchemaSig = sig;
    if (process.env.NODE_ENV !== "production") {
      globalForPrisma.prisma = client;
    }
  }
  return client;
}

/** Lazy proxy so dev hot-reload never keeps a stale PrismaClient instance. */
const prisma = new Proxy({} as PrismaClient, {
  get(_target, prop) {
    if (prop === "then") return undefined;
    const client = getPrismaClient();
    const value = Reflect.get(client, prop, client) as unknown;
    return typeof value === "function"
      ? (value as (...args: unknown[]) => unknown).bind(client)
      : value;
  },
});

export { prisma };
export default prisma;
