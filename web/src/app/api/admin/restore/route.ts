import { NextRequest } from "next/server";
import prisma from "@/lib/prisma";
import { requireOwner, isResponse, jsonOk, jsonError } from "@/lib/api";
import { establishUserLogin } from "@/lib/auth";
import type { Prisma } from "@prisma/client";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

function d(v: string | null | undefined): Date | null {
  if (!v) return null;
  const parsed = new Date(v);
  return isNaN(parsed.getTime()) ? null : parsed;
}

function dReq(v: string | null | undefined): Date {
  return d(v) ?? new Date();
}

function boolInt(v: unknown, defaultVal = true): number {
  const b = v === undefined || v === null ? defaultVal : Boolean(v);
  return b ? 1 : 0;
}

type Tx = Omit<
  Prisma.TransactionClient,
  "$connect" | "$disconnect" | "$on" | "$transaction" | "$use" | "$extends"
>;

async function resetSqliteSequence(tx: Tx, table: string) {
  await tx.$executeRawUnsafe(
    `INSERT OR REPLACE INTO sqlite_sequence (name, seq) VALUES (?, COALESCE((SELECT MAX(id) FROM "${table}"), 0))`,
    table,
  );
}

interface BackupData {
  meta?: {
    app?: string;
    version?: string;
    record_counts?: Record<string, number>;
  };
  bookings?: Array<Record<string, unknown>>;
  inventory?: Array<Record<string, unknown>>;
  customers?: Array<Record<string, unknown>>;
  staff?: Array<Record<string, unknown>>;
  users?: Array<Record<string, unknown>>;
  custom_categories?: Array<Record<string, unknown>>;
  attendance?: Array<Record<string, unknown>>;
  suppliers?: Array<Record<string, unknown>>;
  supplier_purchases?: Array<Record<string, unknown>>;
  prospect_leads?: Array<Record<string, unknown>>;
  shop_enquiries?: Array<Record<string, unknown>>;
}

export async function POST(req: NextRequest) {
  const user = await requireOwner();
  if (isResponse(user)) return user;

  const ownerRecord = await prisma.user.findUnique({ where: { id: user.id } });
  if (!ownerRecord) return jsonError("Owner account not found.", 403);

  let backup: BackupData;
  try {
    backup = await req.json();
  } catch {
    return jsonError("Invalid JSON file.", 400);
  }

  if (!backup.meta) {
    return jsonError("This does not appear to be a valid backup file (missing meta).", 400);
  }

  const log: string[] = [];
  const counts: Record<string, number> = {};

  try {
    await prisma.$transaction(async (tx) => {
      log.push("Clearing existing data...");

      await tx.$executeRawUnsafe(`DELETE FROM "activity_logs"`);
      await tx.$executeRawUnsafe(`DELETE FROM "prospect_lead_items"`);
      await tx.$executeRawUnsafe(`DELETE FROM "booking_items"`);
      await tx.$executeRawUnsafe(`DELETE FROM "rental_items"`);
      await tx.$executeRawUnsafe(`DELETE FROM "payments"`);
      await tx.$executeRawUnsafe(`DELETE FROM "invoices"`);
      await tx.$executeRawUnsafe(`DELETE FROM "rentals"`);
      await tx.$executeRawUnsafe(`DELETE FROM "supplier_purchases"`);
      await tx.$executeRawUnsafe(`DELETE FROM "staff_attendance"`);
      await tx.$executeRawUnsafe(`DELETE FROM "user_sessions"`);
      await tx.$executeRawUnsafe(`DELETE FROM "staff_login_requests"`);
      await tx.$executeRawUnsafe(`DELETE FROM "shop_enquiries"`);
      await tx.$executeRawUnsafe(`DELETE FROM "prospect_leads"`);
      await tx.$executeRawUnsafe(`DELETE FROM "bookings"`);
      await tx.$executeRawUnsafe(`DELETE FROM "users"`);
      await tx.$executeRawUnsafe(`DELETE FROM "staff"`);
      await tx.$executeRawUnsafe(`DELETE FROM "suppliers"`);
      await tx.$executeRawUnsafe(`DELETE FROM "customers"`);
      await tx.$executeRawUnsafe(`DELETE FROM "clothing_items"`);
      await tx.$executeRawUnsafe(`DELETE FROM "custom_categories"`);

      log.push("Existing data cleared.");

      if (backup.custom_categories?.length) {
        for (const c of backup.custom_categories) {
          await tx.$executeRawUnsafe(
            `INSERT INTO "custom_categories" ("id","name","group","active","created_at") VALUES (?,?,?,?,?)`,
            c.id, c.name, c.group ?? "other", boolInt(c.active),
            dReq(c.createdAt as string).toISOString(),
          );
        }
        counts.custom_categories = backup.custom_categories.length;
        log.push(`Restored ${backup.custom_categories.length} custom categories`);
      }

      if (backup.staff?.length) {
        for (const s of backup.staff) {
          await tx.$executeRawUnsafe(
            `INSERT INTO "staff" ("id","name","phone","active","created_at") VALUES (?,?,?,?,?)`,
            s.id, s.name, s.phone ?? null, boolInt(s.active),
            dReq(s.createdAt as string).toISOString(),
          );
        }
        counts.staff = backup.staff.length;
        log.push(`Restored ${backup.staff.length} staff members`);
      }

      if (backup.users?.length) {
        for (const u of backup.users) {
          const hash = String(u.passwordHash ?? u.password_hash ?? "");
          await tx.$executeRawUnsafe(
            `INSERT INTO "users" ("id","username","password_hash","role","staff_id","active","created_at") VALUES (?,?,?,?,?,?,?)`,
            u.id, u.username, hash,
            u.role ?? "staff", u.staffId ?? u.staff_id ?? null,
            boolInt(u.active),
            dReq(u.createdAt as string).toISOString(),
          );
        }
        counts.users = backup.users.length;
        log.push(`Restored ${backup.users.length} users`);
      }

      if (backup.customers?.length) {
        for (const c of backup.customers) {
          await tx.$executeRawUnsafe(
            `INSERT INTO "customers" ("id","name","phone","email","address","id_proof","notes","created_at") VALUES (?,?,?,?,?,?,?,?)`,
            c.id, c.name, c.phone, c.email ?? null, c.address ?? null,
            c.idProof ?? c.id_proof ?? null, c.notes ?? null,
            dReq(c.createdAt as string).toISOString(),
          );
        }
        counts.customers = backup.customers.length;
        log.push(`Restored ${backup.customers.length} customers`);
      }

      if (backup.inventory?.length) {
        for (const i of backup.inventory) {
          await tx.$executeRawUnsafe(
            `INSERT INTO "clothing_items" ("id","name","sku","category","size","color","daily_rate","deposit","status","item_type","photo","condition_notes","created_at","sub_category") VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
            i.id, i.name, i.sku, i.category, i.size ?? null, i.color ?? null,
            i.dailyRate ?? i.daily_rate ?? 0, i.deposit ?? 0,
            i.status ?? "available", i.itemType ?? i.item_type ?? "clothing",
            i.photo ?? null, i.conditionNotes ?? i.condition_notes ?? null,
            dReq(i.createdAt as string).toISOString(),
            i.subCategory ?? i.sub_category ?? null,
          );
        }
        counts.inventory = backup.inventory.length;
        log.push(`Restored ${backup.inventory.length} inventory items`);
      }

      if (backup.suppliers?.length) {
        for (const s of backup.suppliers) {
          await tx.$executeRawUnsafe(
            `INSERT INTO "suppliers" ("id","name","phone","address","gst_no","account_details","created_at") VALUES (?,?,?,?,?,?,?)`,
            s.id, s.name, s.phone ?? null, s.address ?? null,
            s.gstNo ?? s.gst_no ?? null,
            s.accountDetails ?? s.account_details ?? null,
            dReq(s.createdAt as string).toISOString(),
          );
        }
        counts.suppliers = backup.suppliers.length;
        log.push(`Restored ${backup.suppliers.length} suppliers`);
      }

      if (backup.supplier_purchases?.length) {
        for (const p of backup.supplier_purchases) {
          await tx.$executeRawUnsafe(
            `INSERT INTO "supplier_purchases" ("id","supplier_id","item_description","category","amount","gst_amount","gst_percent","transaction_type","date","notes") VALUES (?,?,?,?,?,?,?,?,?,?)`,
            p.id, p.supplierId ?? p.supplier_id,
            p.itemDescription ?? p.item_description, p.category ?? null,
            p.amount ?? 0, p.gstAmount ?? p.gst_amount ?? 0,
            p.gstPercent ?? p.gst_percent ?? 0,
            p.transactionType ?? p.transaction_type ?? "purchase",
            dReq(p.date as string).toISOString(),
            p.notes ?? null,
          );
        }
        counts.supplier_purchases = backup.supplier_purchases.length;
        log.push(`Restored ${backup.supplier_purchases.length} supplier purchases`);
      }

      if (backup.attendance?.length) {
        for (const a of backup.attendance) {
          await tx.$executeRawUnsafe(
            `INSERT INTO "staff_attendance" ("id","staff_id","date","status") VALUES (?,?,?,?)`,
            a.id, a.staffId ?? a.staff_id,
            dReq(a.date as string).toISOString(),
            a.status ?? "present",
          );
        }
        counts.attendance = backup.attendance.length;
        log.push(`Restored ${backup.attendance.length} attendance records`);
      }

      if (backup.bookings?.length) {
        let itemCount = 0;
        for (const b of backup.bookings) {
          await tx.$executeRawUnsafe(
            `INSERT INTO "bookings" ("id","booking_number","monthly_serial","customer_name","customer_address","contact_1","whatsapp_no","delivery_date","delivery_time","return_date","return_time","venue","security_deposit","total_price","total_advance","total_remaining","common_notes","staff_names","status","created_at","delivery_notes","remaining_collected","security_collected","delivered_at","returned_at","incomplete_notes","incomplete_photo","id_photo_1","id_photo_2","security_held","item_id","dress_name","price","advance","remaining","notes","contact_2","qr_token","refund_amount","refunded_at") VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
            b.id,
            b.bookingNumber ?? b.booking_number,
            b.monthlySerial ?? b.monthly_serial ?? 0,
            b.customerName ?? b.customer_name,
            b.customerAddress ?? b.customer_address ?? "",
            b.contact1 ?? b.contact_1 ?? "",
            b.whatsappNo ?? b.whatsapp_no ?? null,
            dReq((b.deliveryDate ?? b.delivery_date) as string).toISOString(),
            b.deliveryTime ?? b.delivery_time ?? "",
            dReq((b.returnDate ?? b.return_date) as string).toISOString(),
            b.returnTime ?? b.return_time ?? "",
            b.venue ?? null,
            b.securityDeposit ?? b.security_deposit ?? 0,
            b.totalPrice ?? b.total_price ?? 0,
            b.totalAdvance ?? b.total_advance ?? 0,
            b.totalRemaining ?? b.total_remaining ?? 0,
            b.commonNotes ?? b.common_notes ?? null,
            b.staffNames ?? b.staff_names ?? null,
            b.status ?? "booked",
            dReq((b.createdAt ?? b.created_at) as string).toISOString(),
            b.deliveryNotes ?? b.delivery_notes ?? null,
            b.remainingCollected ?? b.remaining_collected ?? 0,
            b.securityCollected ?? b.security_collected ?? 0,
            d((b.deliveredAt ?? b.delivered_at) as string)?.toISOString() ?? null,
            d((b.returnedAt ?? b.returned_at) as string)?.toISOString() ?? null,
            b.incompleteNotes ?? b.incomplete_notes ?? null,
            b.incompletePhoto ?? b.incomplete_photo ?? null,
            b.idPhoto1 ?? b.id_photo_1 ?? null,
            b.idPhoto2 ?? b.id_photo_2 ?? null,
            b.securityHeld ?? b.security_held ?? 0,
            b.itemId ?? b.item_id ?? null,
            b.dressName ?? b.dress_name ?? null,
            b.price ?? 0,
            b.advance ?? 0,
            b.remaining ?? 0,
            b.notes ?? null,
            b.contact2 ?? b.contact_2 ?? null,
            b.qrToken ?? b.qr_token ?? null,
            b.refundAmount ?? b.refund_amount ?? 0,
            d((b.refundedAt ?? b.refunded_at) as string)?.toISOString() ?? null,
          );

          const items = (b.bookingItems ?? b.booking_items ?? []) as Array<Record<string, unknown>>;
          for (const bi of items) {
            await tx.$executeRawUnsafe(
              `INSERT INTO "booking_items" ("id","booking_id","item_id","dress_name","category","price","advance","remaining","size","notes","prepared_by","checked_by","is_packed_ready","packing_note","is_delivered","delivered_at","item_remaining_collected","item_security_collected","item_delivery_notes","is_returned") VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
              bi.id,
              bi.bookingId ?? bi.booking_id ?? b.id,
              bi.itemId ?? bi.item_id,
              bi.dressName ?? bi.dress_name,
              bi.category ?? null,
              bi.price ?? 0,
              bi.advance ?? 0,
              bi.remaining ?? 0,
              bi.size ?? null,
              bi.notes ?? null,
              bi.preparedBy ?? bi.prepared_by ?? null,
              bi.checkedBy ?? bi.checked_by ?? null,
              boolInt(bi.isPackedReady ?? bi.is_packed_ready, false),
              bi.packingNote ?? bi.packing_note ?? null,
              boolInt(bi.isDelivered ?? bi.is_delivered, false),
              d((bi.deliveredAt ?? bi.delivered_at) as string)?.toISOString() ?? null,
              bi.itemRemainingCollected ?? bi.item_remaining_collected ?? 0,
              bi.itemSecurityCollected ?? bi.item_security_collected ?? 0,
              bi.itemDeliveryNotes ?? bi.item_delivery_notes ?? null,
              boolInt(bi.isReturned ?? bi.is_returned, false),
            );
            itemCount++;
          }
        }
        counts.bookings = backup.bookings.length;
        counts.booking_items = itemCount;
        log.push(`Restored ${backup.bookings.length} bookings with ${itemCount} items`);
      }

      if (backup.prospect_leads?.length) {
        let plItemCount = 0;
        for (const pl of backup.prospect_leads) {
          await tx.$executeRawUnsafe(
            `INSERT INTO "prospect_leads" ("id","customer_name","customer_address","contact_1","whatsapp_no","venue","notes","staff_names","delivery_date","delivery_time","return_date","return_time","last_reminder_at","created_at") VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
            pl.id,
            pl.customerName ?? pl.customer_name,
            pl.customerAddress ?? pl.customer_address ?? null,
            pl.contact1 ?? pl.contact_1 ?? null,
            pl.whatsappNo ?? pl.whatsapp_no ?? null,
            pl.venue ?? null,
            pl.notes ?? null,
            pl.staffNames ?? pl.staff_names ?? null,
            dReq((pl.deliveryDate ?? pl.delivery_date) as string).toISOString(),
            pl.deliveryTime ?? pl.delivery_time ?? null,
            dReq((pl.returnDate ?? pl.return_date) as string).toISOString(),
            pl.returnTime ?? pl.return_time ?? null,
            d((pl.lastReminderAt ?? pl.last_reminder_at) as string)?.toISOString() ?? null,
            dReq((pl.createdAt ?? pl.created_at) as string).toISOString(),
          );

          const plItems = (pl.items ?? []) as Array<Record<string, unknown>>;
          for (const pli of plItems) {
            await tx.$executeRawUnsafe(
              `INSERT INTO "prospect_lead_items" ("id","prospect_lead_id","item_id","rent") VALUES (?,?,?,?)`,
              pli.id, pli.prospectLeadId ?? pli.prospect_lead_id ?? pl.id,
              pli.itemId ?? pli.item_id, pli.rent ?? 0,
            );
            plItemCount++;
          }
        }
        counts.prospect_leads = backup.prospect_leads.length;
        counts.prospect_lead_items = plItemCount;
        log.push(`Restored ${backup.prospect_leads.length} prospect leads with ${plItemCount} items`);
      }

      if (backup.shop_enquiries?.length) {
        for (const e of backup.shop_enquiries) {
          await tx.$executeRawUnsafe(
            `INSERT INTO "shop_enquiries" ("id","customer_name","customer_address","contact_1","whatsapp_no","enquiry_notes","staff_names","visit_date","created_at") VALUES (?,?,?,?,?,?,?,?,?)`,
            e.id,
            e.customerName ?? e.customer_name,
            e.customerAddress ?? e.customer_address ?? null,
            e.contact1 ?? e.contact_1 ?? null,
            e.whatsappNo ?? e.whatsapp_no ?? null,
            e.enquiryNotes ?? e.enquiry_notes ?? null,
            e.staffNames ?? e.staff_names ?? null,
            dReq((e.visitDate ?? e.visit_date) as string).toISOString(),
            dReq((e.createdAt ?? e.created_at) as string).toISOString(),
          );
        }
        counts.shop_enquiries = backup.shop_enquiries.length;
        log.push(`Restored ${backup.shop_enquiries.length} shop enquiries`);
      }

      const seqTables = [
        "custom_categories", "staff", "users", "customers", "clothing_items",
        "suppliers", "supplier_purchases", "staff_attendance", "bookings",
        "booking_items", "prospect_leads", "prospect_lead_items", "shop_enquiries",
        "activity_logs",
      ];
      for (const t of seqTables) {
        await resetSqliteSequence(tx, t);
      }
      log.push("Autoincrement sequences reset.");
    }, { timeout: 120_000 });

    // Ensure the restoring owner can still log in (preserve password if backup lacked it)
    let loginUser = await prisma.user.findUnique({ where: { username: ownerRecord.username } });
    if (!loginUser) {
      loginUser = await prisma.user.create({
        data: {
          username: ownerRecord.username,
          passwordHash: ownerRecord.passwordHash,
          role: "owner",
          active: true,
        },
      });
      log.push(`Re-created owner account "${ownerRecord.username}" (was missing from backup).`);
    } else if (!loginUser.passwordHash) {
      await prisma.user.update({
        where: { id: loginUser.id },
        data: { passwordHash: ownerRecord.passwordHash, role: "owner", active: true },
      });
      loginUser = await prisma.user.findUnique({ where: { id: loginUser.id } });
      log.push(`Restored password for owner "${ownerRecord.username}".`);
    }

    if (loginUser) {
      await establishUserLogin(loginUser.id);
      log.push(`Session re-established for "${loginUser.username}".`);
    }

    const totalRestored = Object.values(counts).reduce((s, n) => s + n, 0);

    return jsonOk({
      success: true,
      message: totalRestored > 0
        ? "Database restored successfully. You remain logged in."
        : "Restore completed but backup file contained no data records. You remain logged in.",
      counts,
      log,
      sessionRestored: !!loginUser,
      restored_by: user.username,
      restored_at: new Date().toISOString(),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[RESTORE ERROR]", msg);
    return jsonError(`Restore failed — all changes have been rolled back.\n\nError: ${msg}`, 500);
  }
}
