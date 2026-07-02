import { z } from "zod";

function upper(s: string) {
  return s.toUpperCase();
}

export const BookingItemSchema = z.object({
  item_id:    z.number().int().positive(),
  dress_name: z.string().min(1).max(200).transform(upper),
  price:      z.number().nonnegative(),
  advance:    z.number().nonnegative(),
  notes:      z.string().max(500).optional().transform((s) => (s ? upper(s) : s)),
}).refine(
  (data) => data.advance <= data.price,
  {
    message: "Advance amount cannot exceed the total rental price",
    path: ["advance"],
  },
);

export const BookingOrderSchema = z.object({
  id:            z.number().int().positive().optional(),
  description:   z.string().min(1).max(1000).transform(upper),
  cost:          z.number().nonnegative(),
  advance:       z.number().nonnegative(),
  advance_payment_mode: z.enum(["cash", "online"]).optional(),
  photo:         z.string().max(300).optional(),
  delivery_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid order delivery date"),
  delivery_time: z.string().min(1),
}).refine(
  (data) => data.advance <= data.cost || data.cost === 0,
  {
    message: "Advance amount cannot exceed the order cost",
    path: ["advance"],
  },
);

export const BookingFormSchema = z.object({
  customer_name:    z.string().min(1).max(150).transform(upper),
  customer_address: z.string().max(300).default("").transform(upper),
  contact_1:        z.string().min(1).max(25),
  whatsapp_no:      z.string().max(25).default(""),
  payment_mode:     z.enum(["cash", "online"]).default("cash"),
  delivery_date:    z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid delivery date"),
  delivery_time:    z.string().min(1),
  return_date:      z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid return date"),
  return_time:      z.string().min(1),
  venue:            z.string().max(200).optional().transform((s) => (s ? upper(s) : s)),
  security_deposit: z.number().nonnegative().optional(),
  common_notes:     z.string().max(1000).optional().transform((s) => (s ? upper(s) : s)),
  staff_names:      z.array(z.string().transform(upper)).optional(),
  items:            z.array(BookingItemSchema).min(1, "At least one item required"),
  orders:           z.array(BookingOrderSchema).optional(),
});

export const InventoryItemSchema = z.object({
  name:       z.string().min(1).max(200).transform(upper),
  sku:        z.string().min(1).max(50).transform(upper),
  category:   z.string().min(1).max(100).transform(upper),
  size:       z.string().max(20).optional().transform((s) => (s ? upper(s) : s)),
  color:      z.string().max(50).optional().transform((s) => (s ? upper(s) : s)),
  dailyRate:  z.number().nonnegative().optional(),
  deposit:    z.number().nonnegative().optional(),
});
