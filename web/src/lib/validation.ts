import { z } from "zod";

export const BookingItemSchema = z.object({
  item_id:    z.number().int().positive(),
  dress_name: z.string().min(1).max(200),
  price:      z.number().nonnegative(),
  advance:    z.number().nonnegative(),
  notes:      z.string().max(500).optional(),
});

export const BookingFormSchema = z.object({
  customer_name:    z.string().min(1).max(150),
  customer_address: z.string().max(300).default(""),
  contact_1:        z.string().min(1).max(20),
  whatsapp_no:      z.string().max(20).default(""),
  delivery_date:    z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid delivery date"),
  delivery_time:    z.string().min(1),
  return_date:      z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid return date"),
  return_time:      z.string().min(1),
  venue:            z.string().max(200).optional(),
  security_deposit: z.number().nonnegative().optional(),
  common_notes:     z.string().max(1000).optional(),
  staff_names:      z.array(z.string()).optional(),
  items:            z.array(BookingItemSchema).min(1, "At least one item required"),
});

export const InventoryItemSchema = z.object({
  name:       z.string().min(1).max(200),
  sku:        z.string().min(1).max(50),
  category:   z.string().min(1).max(100),
  size:       z.string().max(20).optional(),
  color:      z.string().max(50).optional(),
  dailyRate:  z.number().nonnegative().optional(),
  deposit:    z.number().nonnegative().optional(),
});
