-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "users" (
    "id" SERIAL NOT NULL,
    "username" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'staff',
    "staff_id" INTEGER,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "staff_login_requests" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "token" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "requested_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolved_at" TIMESTAMP(3),
    "resolved_by_id" INTEGER,

    CONSTRAINT "staff_login_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_sessions" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "session_id" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "login_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_seen" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ended_at" TIMESTAMP(3),
    "ended_by_id" INTEGER,

    CONSTRAINT "user_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customers" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "email" TEXT,
    "address" TEXT,
    "id_proof" TEXT,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "customers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "clothing_items" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "size" TEXT,
    "color" TEXT,
    "daily_rate" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "deposit" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'available',
    "item_type" TEXT NOT NULL DEFAULT 'clothing',
    "photo" TEXT,
    "condition_notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sub_category" TEXT,

    CONSTRAINT "clothing_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rentals" (
    "id" SERIAL NOT NULL,
    "rental_number" TEXT NOT NULL,
    "customer_id" INTEGER NOT NULL,
    "start_date" TIMESTAMP(3) NOT NULL,
    "end_date" TIMESTAMP(3) NOT NULL,
    "actual_return_date" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'active',
    "subtotal" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "deposit_total" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "late_fee" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "damage_fee" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "discount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "total_amount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "rentals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rental_items" (
    "id" SERIAL NOT NULL,
    "rental_id" INTEGER NOT NULL,
    "item_id" INTEGER NOT NULL,
    "daily_rate" DOUBLE PRECISION NOT NULL,
    "deposit" DOUBLE PRECISION NOT NULL DEFAULT 0,

    CONSTRAINT "rental_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invoices" (
    "id" SERIAL NOT NULL,
    "invoice_number" TEXT NOT NULL,
    "rental_id" INTEGER NOT NULL,
    "issue_date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "due_date" TIMESTAMP(3),
    "subtotal" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "tax_rate" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "tax_amount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "total" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "amount_paid" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'unpaid',
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "invoices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payments" (
    "id" SERIAL NOT NULL,
    "invoice_id" INTEGER NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "method" TEXT NOT NULL DEFAULT 'cash',
    "reference" TEXT,
    "notes" TEXT,
    "paid_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bookings" (
    "id" SERIAL NOT NULL,
    "booking_number" TEXT NOT NULL,
    "monthly_serial" INTEGER NOT NULL DEFAULT 0,
    "customer_name" TEXT NOT NULL,
    "customer_address" TEXT NOT NULL,
    "contact_1" TEXT NOT NULL,
    "whatsapp_no" TEXT,
    "delivery_date" TIMESTAMP(3) NOT NULL,
    "delivery_time" TEXT NOT NULL,
    "return_date" TIMESTAMP(3) NOT NULL,
    "return_time" TEXT NOT NULL,
    "venue" TEXT,
    "security_deposit" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "total_price" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "total_advance" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "total_remaining" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "common_notes" TEXT,
    "staff_names" TEXT,
    "status" TEXT NOT NULL DEFAULT 'booked',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "delivery_notes" TEXT,
    "remaining_collected" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "security_collected" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "delivered_at" TIMESTAMP(3),
    "returned_at" TIMESTAMP(3),
    "incomplete_notes" TEXT,
    "incomplete_photo" TEXT,
    "id_photo_1" TEXT,
    "id_photo_2" TEXT,
    "security_held" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "item_id" INTEGER,
    "dress_name" TEXT,
    "price" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "advance" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "remaining" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "notes" TEXT,
    "contact_2" TEXT,
    "qr_token" TEXT,
    "refund_amount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "refunded_at" TIMESTAMP(3),

    CONSTRAINT "bookings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "booking_items" (
    "id" SERIAL NOT NULL,
    "booking_id" INTEGER NOT NULL,
    "item_id" INTEGER NOT NULL,
    "dress_name" TEXT NOT NULL,
    "category" TEXT,
    "price" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "advance" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "remaining" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "size" TEXT,
    "notes" TEXT,
    "prepared_by" TEXT,
    "checked_by" TEXT,
    "is_packed_ready" BOOLEAN NOT NULL DEFAULT false,
    "packing_note" TEXT,
    "is_delivered" BOOLEAN NOT NULL DEFAULT false,
    "delivered_at" TIMESTAMP(3),
    "item_remaining_collected" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "item_security_collected" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "item_delivery_notes" TEXT,
    "is_returned" BOOLEAN NOT NULL DEFAULT false,
    "is_incomplete_return" BOOLEAN NOT NULL DEFAULT false,
    "item_incomplete_notes" TEXT,
    "item_incomplete_photo" TEXT,
    "item_security_held" DOUBLE PRECISION NOT NULL DEFAULT 0,

    CONSTRAINT "booking_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "custom_categories" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "group" TEXT NOT NULL DEFAULT 'other',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "custom_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "staff" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "staff_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "staff_attendance" (
    "id" SERIAL NOT NULL,
    "staff_id" INTEGER NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'present',

    CONSTRAINT "staff_attendance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "suppliers" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "address" TEXT,
    "gst_no" TEXT,
    "account_details" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "suppliers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "supplier_purchases" (
    "id" SERIAL NOT NULL,
    "supplier_id" INTEGER NOT NULL,
    "item_description" TEXT NOT NULL,
    "category" TEXT,
    "amount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "gst_amount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "gst_percent" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "transaction_type" TEXT NOT NULL DEFAULT 'purchase',
    "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "notes" TEXT,

    CONSTRAINT "supplier_purchases_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "prospect_leads" (
    "id" SERIAL NOT NULL,
    "customer_name" TEXT NOT NULL,
    "customer_address" TEXT,
    "contact_1" TEXT,
    "whatsapp_no" TEXT,
    "venue" TEXT,
    "notes" TEXT,
    "staff_names" TEXT,
    "delivery_date" TIMESTAMP(3) NOT NULL,
    "delivery_time" TEXT,
    "return_date" TIMESTAMP(3) NOT NULL,
    "return_time" TEXT,
    "last_reminder_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "prospect_leads_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "prospect_lead_items" (
    "id" SERIAL NOT NULL,
    "prospect_lead_id" INTEGER NOT NULL,
    "item_id" INTEGER NOT NULL,
    "rent" DOUBLE PRECISION NOT NULL DEFAULT 0,

    CONSTRAINT "prospect_lead_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shop_enquiries" (
    "id" SERIAL NOT NULL,
    "customer_name" TEXT NOT NULL,
    "customer_address" TEXT,
    "contact_1" TEXT,
    "whatsapp_no" TEXT,
    "enquiry_notes" TEXT,
    "staff_names" TEXT,
    "visit_date" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "shop_enquiries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "activity_logs" (
    "id" SERIAL NOT NULL,
    "username" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "entity" TEXT NOT NULL,
    "entity_id" INTEGER,
    "label" TEXT,
    "data_before" TEXT,
    "data_after" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "activity_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "login_attempts" (
    "id" SERIAL NOT NULL,
    "ip" TEXT NOT NULL,
    "success" BOOLEAN NOT NULL DEFAULT false,
    "username" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "login_attempts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_username_key" ON "users"("username");

-- CreateIndex
CREATE UNIQUE INDEX "staff_login_requests_token_key" ON "staff_login_requests"("token");

-- CreateIndex
CREATE INDEX "staff_login_requests_token_idx" ON "staff_login_requests"("token");

-- CreateIndex
CREATE UNIQUE INDEX "user_sessions_session_id_key" ON "user_sessions"("session_id");

-- CreateIndex
CREATE INDEX "user_sessions_session_id_idx" ON "user_sessions"("session_id");

-- CreateIndex
CREATE UNIQUE INDEX "clothing_items_sku_key" ON "clothing_items"("sku");

-- CreateIndex
CREATE UNIQUE INDEX "rentals_rental_number_key" ON "rentals"("rental_number");

-- CreateIndex
CREATE UNIQUE INDEX "invoices_invoice_number_key" ON "invoices"("invoice_number");

-- CreateIndex
CREATE UNIQUE INDEX "bookings_booking_number_key" ON "bookings"("booking_number");

-- CreateIndex
CREATE UNIQUE INDEX "bookings_qr_token_key" ON "bookings"("qr_token");

-- CreateIndex
CREATE INDEX "bookings_delivery_date_status_idx" ON "bookings"("delivery_date", "status");

-- CreateIndex
CREATE INDEX "bookings_return_date_status_idx" ON "bookings"("return_date", "status");

-- CreateIndex
CREATE INDEX "bookings_monthly_serial_idx" ON "bookings"("monthly_serial");

-- CreateIndex
CREATE INDEX "bookings_customer_name_idx" ON "bookings"("customer_name");

-- CreateIndex
CREATE INDEX "bookings_contact_1_idx" ON "bookings"("contact_1");

-- CreateIndex
CREATE INDEX "bookings_whatsapp_no_idx" ON "bookings"("whatsapp_no");

-- CreateIndex
CREATE INDEX "booking_items_item_id_idx" ON "booking_items"("item_id");

-- CreateIndex
CREATE INDEX "booking_items_dress_name_idx" ON "booking_items"("dress_name");

-- CreateIndex
CREATE INDEX "booking_items_category_idx" ON "booking_items"("category");

-- CreateIndex
CREATE INDEX "booking_items_booking_id_idx" ON "booking_items"("booking_id");

-- CreateIndex
CREATE UNIQUE INDEX "custom_categories_name_key" ON "custom_categories"("name");

-- CreateIndex
CREATE UNIQUE INDEX "staff_attendance_staff_id_date_key" ON "staff_attendance"("staff_id", "date");

-- CreateIndex
CREATE INDEX "activity_logs_entity_entity_id_idx" ON "activity_logs"("entity", "entity_id");

-- CreateIndex
CREATE INDEX "activity_logs_username_idx" ON "activity_logs"("username");

-- CreateIndex
CREATE INDEX "activity_logs_created_at_idx" ON "activity_logs"("created_at");

-- CreateIndex
CREATE INDEX "login_attempts_ip_created_at_idx" ON "login_attempts"("ip", "created_at");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_staff_id_fkey" FOREIGN KEY ("staff_id") REFERENCES "staff"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff_login_requests" ADD CONSTRAINT "staff_login_requests_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff_login_requests" ADD CONSTRAINT "staff_login_requests_resolved_by_id_fkey" FOREIGN KEY ("resolved_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_sessions" ADD CONSTRAINT "user_sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_sessions" ADD CONSTRAINT "user_sessions_ended_by_id_fkey" FOREIGN KEY ("ended_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rentals" ADD CONSTRAINT "rentals_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rental_items" ADD CONSTRAINT "rental_items_rental_id_fkey" FOREIGN KEY ("rental_id") REFERENCES "rentals"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rental_items" ADD CONSTRAINT "rental_items_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "clothing_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_rental_id_fkey" FOREIGN KEY ("rental_id") REFERENCES "rentals"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "invoices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "clothing_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "booking_items" ADD CONSTRAINT "booking_items_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "bookings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "booking_items" ADD CONSTRAINT "booking_items_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "clothing_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff_attendance" ADD CONSTRAINT "staff_attendance_staff_id_fkey" FOREIGN KEY ("staff_id") REFERENCES "staff"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_purchases" ADD CONSTRAINT "supplier_purchases_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "suppliers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "prospect_lead_items" ADD CONSTRAINT "prospect_lead_items_prospect_lead_id_fkey" FOREIGN KEY ("prospect_lead_id") REFERENCES "prospect_leads"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "prospect_lead_items" ADD CONSTRAINT "prospect_lead_items_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "clothing_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
