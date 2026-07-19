import { z } from "zod";
import type { ZodError } from "zod";

function upper(s: string) {
  return s.toUpperCase();
}

function optionalString(val: unknown): string {
  if (val == null) return "";
  return String(val);
}

function optionalNonNegativeNumber(val: unknown): number | undefined {
  if (val == null || val === "") return undefined;
  const n = typeof val === "number" ? val : Number(val);
  if (!Number.isFinite(n) || Number.isNaN(n)) return undefined;
  return n >= 0 ? n : undefined;
}

function positiveInt(val: unknown): unknown {
  if (val == null) return val;
  if (typeof val === "number") return val;
  const n = Number(val);
  return Number.isFinite(n) ? n : val;
}

function dropBlankOrders(orders: unknown): unknown {
  if (!Array.isArray(orders)) return orders;
  return orders.filter((o) => {
    if (!o || typeof o !== "object") return false;
    const desc = String((o as { description?: string }).description ?? "").trim();
    return desc.length > 0;
  });
}

const FIELD_LABELS: Record<string, string> = {
  customer_name: "Customer name",
  customer_address: "Address",
  contact_1: "Contact number",
  whatsapp_no: "WhatsApp number",
  payment_mode: "Payment mode",
  delivery_date: "Delivery date",
  delivery_time: "Delivery time",
  return_date: "Return date",
  return_time: "Return time",
  venue: "Venue",
  security_deposit: "Security deposit",
  common_notes: "Notes",
  item_id: "Dress",
  dress_name: "Dress name",
  price: "Rental price",
  advance: "Advance",
  notes: "Dress notes",
  description: "Order description",
  cost: "Order cost",
};

function pathLabel(path: PropertyKey[]): string {
  const parts: string[] = [];
  let inOrder = false;
  for (let i = 0; i < path.length; i++) {
    const key = path[i];
    if (key === "items" && typeof path[i + 1] === "number") {
      parts.push(`Dress (row ${Number(path[i + 1]) + 1})`);
      i++;
      continue;
    }
    if (key === "orders" && typeof path[i + 1] === "number") {
      parts.push(`Order (row ${Number(path[i + 1]) + 1})`);
      inOrder = true;
      i++;
      continue;
    }
    if (typeof key === "string") {
      if (inOrder && key === "delivery_date") {
        parts.push("Order delivery date");
      } else if (inOrder && key === "delivery_time") {
        parts.push("Order delivery time");
      } else if (FIELD_LABELS[key]) {
        parts.push(FIELD_LABELS[key]);
      }
    }
  }
  return parts.length ? parts.join(" · ") : "Input";
}

/** Turn Zod failures into a single user-facing message with field context. */
export function formatZodValidationError(error: ZodError): string {
  const issue = error.issues[0];
  if (!issue) return "Invalid input";
  const label = pathLabel(issue.path);
  const msg = issue.message?.trim() || "Invalid value";
  if (label === "Input") return msg;
  if (msg.toLowerCase().startsWith("invalid input")) {
    return `${label}: ${msg}`;
  }
  return `${label}: ${msg}`;
}

export const BookingItemSchema = z.object({
  item_id: z.preprocess(positiveInt, z.number().int().positive()),
  dress_name: z.string().min(1).max(200).transform(upper),
  price: z.preprocess(optionalNonNegativeNumber, z.number().nonnegative()),
  advance: z.preprocess(optionalNonNegativeNumber, z.number().nonnegative()),
  notes: z
    .preprocess(optionalString, z.string().max(500))
    .optional()
    .transform((s) => (s ? upper(s) : s)),
}).refine(
  (data) => data.advance <= data.price,
  {
    message: "Advance amount cannot exceed the total rental price",
    path: ["advance"],
  },
);

export const BookingOrderSchema = z.object({
  id: z.number().int().positive().optional(),
  description: z.string().min(1).max(1000).transform(upper),
  cost: z.preprocess(optionalNonNegativeNumber, z.number().nonnegative()),
  advance: z.preprocess(optionalNonNegativeNumber, z.number().nonnegative()),
  advance_payment_mode: z.enum(["cash", "online"]).optional(),
  photo: z.string().max(300).optional(),
  delivery_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid order delivery date"),
  delivery_time: z.string().min(1),
}).refine(
  (data) => data.advance <= data.cost || data.cost === 0,
  {
    message: "Advance amount cannot exceed the order cost",
    path: ["advance"],
  },
);

export const BookingFormSchema = z.preprocess(
  (raw) => {
    if (!raw || typeof raw !== "object") return raw;
    const body = { ...(raw as Record<string, unknown>) };
    body.orders = dropBlankOrders(body.orders);
    return body;
  },
  z.object({
    customer_name: z.string().min(1).max(150).transform(upper),
    customer_address: z.preprocess(optionalString, z.string().max(300).default("").transform(upper)),
    contact_1: z.string().min(1).max(25),
    whatsapp_no: z.preprocess(optionalString, z.string().max(25).default("")),
    payment_mode: z.enum(["cash", "online"]).default("cash"),
    delivery_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid delivery date"),
    delivery_time: z.string().min(1),
    return_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid return date"),
    return_time: z.string().min(1),
    venue: z
      .preprocess(optionalString, z.string().max(200))
      .optional()
      .transform((s) => (s ? upper(s) : undefined)),
    security_deposit: z.preprocess(optionalNonNegativeNumber, z.number().nonnegative().optional()),
    common_notes: z
      .preprocess(optionalString, z.string().max(1000))
      .optional()
      .transform((s) => (s ? upper(s) : undefined)),
    staff_names: z.array(z.string().transform(upper)).optional(),
    items: z.array(BookingItemSchema).min(1, "At least one item required"),
    orders: z.array(BookingOrderSchema).optional(),
    /** Client UUID for create-once semantics (double-submit / network retry). */
    client_request_id: z.string().uuid().optional(),
  }),
);

export const InventoryItemSchema = z.object({
  name: z.string().min(1).max(200).transform(upper),
  sku: z.string().min(1).max(50).transform(upper),
  category: z.string().min(1).max(100).transform(upper),
  size: z.string().max(20).optional().transform((s) => (s ? upper(s) : s)),
  color: z.string().max(50).optional().transform((s) => (s ? upper(s) : s)),
  dailyRate: z.number().nonnegative().optional(),
  deposit: z.number().nonnegative().optional(),
});
