from datetime import datetime, date
from flask_sqlalchemy import SQLAlchemy
from sqlalchemy import Index
from werkzeug.security import generate_password_hash, check_password_hash

db = SQLAlchemy()


class User(db.Model):
    __tablename__ = "users"

    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(80), unique=True, nullable=False)
    password_hash = db.Column(db.String(256), nullable=False)
    role = db.Column(db.String(20), nullable=False, default="staff")  # owner, staff
    staff_id = db.Column(db.Integer, db.ForeignKey("staff.id"), nullable=True)
    active = db.Column(db.Boolean, default=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    staff = db.relationship("Staff", foreign_keys=[staff_id], backref="user_account")

    def set_password(self, password):
        self.password_hash = generate_password_hash(password)

    def check_password(self, password):
        return check_password_hash(self.password_hash, password)

    def __repr__(self):
        return f"<User {self.username} ({self.role})>"


class StaffLoginRequest(db.Model):
    """Staff must be approved by owner before session is granted."""
    __tablename__ = "staff_login_requests"

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False)
    token = db.Column(db.String(64), unique=True, nullable=False, index=True)
    status = db.Column(db.String(20), default="pending")  # pending, approved, rejected, expired
    requested_at = db.Column(db.DateTime, default=datetime.utcnow)
    resolved_at = db.Column(db.DateTime, nullable=True)
    resolved_by_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=True)

    user = db.relationship("User", foreign_keys=[user_id], backref="login_requests")
    resolved_by = db.relationship("User", foreign_keys=[resolved_by_id])

    def __repr__(self):
        return f"<StaffLoginRequest {self.id} {self.status}>"


class UserSession(db.Model):
    """Server-side active login tracking (allows owner to see & force-logout staff)."""
    __tablename__ = "user_sessions"

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False)
    session_id = db.Column(db.String(64), unique=True, nullable=False, index=True)
    active = db.Column(db.Boolean, default=True)
    login_at = db.Column(db.DateTime, default=datetime.utcnow)
    last_seen = db.Column(db.DateTime, default=datetime.utcnow)
    ended_at = db.Column(db.DateTime, nullable=True)
    ended_by_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=True)

    user = db.relationship("User", foreign_keys=[user_id], backref="sessions")
    ended_by = db.relationship("User", foreign_keys=[ended_by_id])

    def __repr__(self):
        return f"<UserSession {self.id} user={self.user_id} active={self.active}>"


class Customer(db.Model):
    __tablename__ = "customers"

    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(120), nullable=False)
    phone = db.Column(db.String(20), nullable=False)
    email = db.Column(db.String(120))
    address = db.Column(db.Text)
    id_proof = db.Column(db.String(50))
    notes = db.Column(db.Text)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    def __repr__(self):
        return f"<Customer {self.name}>"


class ClothingItem(db.Model):
    __tablename__ = "clothing_items"

    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(120), nullable=False)
    sku = db.Column(db.String(50), unique=True, nullable=False)
    category = db.Column(db.String(50), nullable=False)
    size = db.Column(db.String(200))
    color = db.Column(db.String(50))
    daily_rate = db.Column(db.Float, nullable=False, default=0)
    deposit = db.Column(db.Float, nullable=False, default=0)
    status = db.Column(db.String(20), default="available")  # available, rented, maintenance
    item_type = db.Column(db.String(20), default="clothing")  # clothing, jewellery, accessory
    photo = db.Column(db.String(255))  # filename of the uploaded photo
    condition_notes = db.Column(db.Text)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    sub_category = db.Column(db.String(20))  # Premium, Normal, Cheap

    __table_args__ = (
        Index("idx_clothing_items_status", "status"),
        Index("idx_clothing_items_name", "name"),
    )

    def __repr__(self):
        return f"<ClothingItem {self.sku}>"


class Rental(db.Model):
    __tablename__ = "rentals"

    id = db.Column(db.Integer, primary_key=True)
    rental_number = db.Column(db.String(20), unique=True, nullable=False)
    customer_id = db.Column(db.Integer, db.ForeignKey("customers.id"), nullable=False)
    start_date = db.Column(db.Date, nullable=False)
    end_date = db.Column(db.Date, nullable=False)
    actual_return_date = db.Column(db.Date)
    status = db.Column(db.String(20), default="active")  # active, returned, overdue, cancelled
    subtotal = db.Column(db.Float, default=0)
    deposit_total = db.Column(db.Float, default=0)
    late_fee = db.Column(db.Float, default=0)
    damage_fee = db.Column(db.Float, default=0)
    discount = db.Column(db.Float, default=0)
    total_amount = db.Column(db.Float, default=0)
    notes = db.Column(db.Text)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    customer = db.relationship("Customer", backref="rentals")
    items = db.relationship("RentalItem", back_populates="rental", cascade="all, delete-orphan")
    invoices = db.relationship("Invoice", back_populates="rental", lazy="dynamic")

    @property
    def rental_days(self):
        return (self.end_date - self.start_date).days + 1

    @property
    def is_overdue(self):
        if self.status in ("returned", "cancelled"):
            return False
        return date.today() > self.end_date

    def recalculate_totals(self):
        days = self.rental_days
        subtotal = sum(ri.daily_rate * days for ri in self.items)
        deposit = sum(ri.deposit for ri in self.items)
        self.subtotal = subtotal
        self.deposit_total = deposit
        self.total_amount = subtotal + self.late_fee + self.damage_fee - self.discount
        return self

    def __repr__(self):
        return f"<Rental {self.rental_number}>"


class RentalItem(db.Model):
    __tablename__ = "rental_items"

    id = db.Column(db.Integer, primary_key=True)
    rental_id = db.Column(db.Integer, db.ForeignKey("rentals.id"), nullable=False)
    item_id = db.Column(db.Integer, db.ForeignKey("clothing_items.id"), nullable=False)
    daily_rate = db.Column(db.Float, nullable=False)
    deposit = db.Column(db.Float, nullable=False, default=0)

    rental = db.relationship("Rental", back_populates="items")
    item = db.relationship("ClothingItem", backref="rental_items")


class Invoice(db.Model):
    __tablename__ = "invoices"

    id = db.Column(db.Integer, primary_key=True)
    invoice_number = db.Column(db.String(20), unique=True, nullable=False)
    rental_id = db.Column(db.Integer, db.ForeignKey("rentals.id"), nullable=False)
    issue_date = db.Column(db.Date, default=date.today)
    due_date = db.Column(db.Date)
    subtotal = db.Column(db.Float, default=0)
    tax_rate = db.Column(db.Float, default=0)
    tax_amount = db.Column(db.Float, default=0)
    total = db.Column(db.Float, default=0)
    amount_paid = db.Column(db.Float, default=0)
    status = db.Column(db.String(20), default="unpaid")  # unpaid, partial, paid
    notes = db.Column(db.Text)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    rental = db.relationship("Rental", back_populates="invoices")
    payments = db.relationship("Payment", back_populates="invoice", cascade="all, delete-orphan")

    @property
    def balance_due(self):
        return max(0, self.total - self.amount_paid)

    def update_status(self):
        if self.amount_paid >= self.total:
            self.status = "paid"
        elif self.amount_paid > 0:
            self.status = "partial"
        else:
            self.status = "unpaid"

    def __repr__(self):
        return f"<Invoice {self.invoice_number}>"


class Payment(db.Model):
    __tablename__ = "payments"

    id = db.Column(db.Integer, primary_key=True)
    invoice_id = db.Column(db.Integer, db.ForeignKey("invoices.id"), nullable=False)
    amount = db.Column(db.Float, nullable=False)
    method = db.Column(db.String(30), default="cash")  # cash, card, upi, bank
    reference = db.Column(db.String(100))
    notes = db.Column(db.Text)
    paid_at = db.Column(db.DateTime, default=datetime.utcnow)

    invoice = db.relationship("Invoice", back_populates="payments")


class Booking(db.Model):
    __tablename__ = "bookings"

    id = db.Column(db.Integer, primary_key=True)
    booking_number = db.Column(db.String(30), unique=True, nullable=False)
    monthly_serial = db.Column(db.Integer, default=0)
    customer_name = db.Column(db.String(150), nullable=False)
    customer_address = db.Column(db.Text, nullable=False)
    contact_1 = db.Column(db.String(20), nullable=False)
    whatsapp_no = db.Column(db.String(20))
    delivery_date = db.Column(db.Date, nullable=False)
    delivery_time = db.Column(db.String(10), nullable=False)
    return_date = db.Column(db.Date, nullable=False)
    return_time = db.Column(db.String(10), nullable=False)
    venue = db.Column(db.String(250))
    security_deposit = db.Column(db.Float, nullable=False, default=0)
    total_price = db.Column(db.Float, nullable=False, default=0)
    total_advance = db.Column(db.Float, nullable=False, default=0)
    total_remaining = db.Column(db.Float, nullable=False, default=0)
    common_notes = db.Column(db.Text)
    staff_names = db.Column(db.String(500))
    status = db.Column(db.String(20), default="booked")  # booked, delivered, returned, cancelled, incomplete_return
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    # Delivery panel fields
    delivery_notes = db.Column(db.Text)
    remaining_collected = db.Column(db.Float, default=0)
    security_collected = db.Column(db.Float, default=0)
    delivered_at = db.Column(db.DateTime)
    returned_at = db.Column(db.DateTime)

    # Incomplete return
    incomplete_notes = db.Column(db.Text)
    security_held = db.Column(db.Float, default=0)

    # Legacy single-item fields (kept for old bookings)
    item_id = db.Column(db.Integer, db.ForeignKey("clothing_items.id"), nullable=True)
    dress_name = db.Column(db.String(150))
    price = db.Column(db.Float, nullable=False, default=0)
    advance = db.Column(db.Float, nullable=False, default=0)
    remaining = db.Column(db.Float, nullable=False, default=0)
    notes = db.Column(db.Text)
    contact_2 = db.Column(db.String(20))

    item = db.relationship("ClothingItem", foreign_keys=[item_id])
    booking_items = db.relationship("BookingItem", back_populates="booking", cascade="all, delete-orphan")

    __table_args__ = (
        Index("idx_bookings_delivery_date", "delivery_date"),
        Index("idx_bookings_status", "status"),
        Index("idx_bookings_customer_name", "customer_name"),
        Index("idx_bookings_return_date", "return_date"),
    )

    @property
    def is_delivery_today(self):
        return self.delivery_date == date.today()

    @property
    def is_return_today(self):
        return self.return_date == date.today()

    @property
    def all_item_ids(self):
        if self.booking_items:
            return [bi.item_id for bi in self.booking_items]
        elif self.item_id:
            return [self.item_id]
        return []

    def __repr__(self):
        return f"<Booking {self.booking_number}>"


class BookingItem(db.Model):
    __tablename__ = "booking_items"

    id = db.Column(db.Integer, primary_key=True)
    booking_id = db.Column(db.Integer, db.ForeignKey("bookings.id"), nullable=False)
    item_id = db.Column(db.Integer, db.ForeignKey("clothing_items.id"), nullable=False)
    dress_name = db.Column(db.String(150), nullable=False)
    category = db.Column(db.String(50))
    price = db.Column(db.Float, nullable=False, default=0)
    advance = db.Column(db.Float, nullable=False, default=0)
    remaining = db.Column(db.Float, nullable=False, default=0)
    size = db.Column(db.String(20))  # specific size booked for men's items
    notes = db.Column(db.Text)

    prepared_by = db.Column(db.String(120))
    checked_by = db.Column(db.String(120))
    is_packed_ready = db.Column(db.Boolean, default=False)  # manually marked ready
    packing_note = db.Column(db.Text)          # staff comment during packing

    booking = db.relationship("Booking", back_populates="booking_items")
    item = db.relationship("ClothingItem")


class CustomCategory(db.Model):
    __tablename__ = "custom_categories"

    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(100), unique=True, nullable=False)
    group = db.Column(db.String(30), nullable=False, default="other")  # mens, womens, jewellery, accessory, other
    active = db.Column(db.Boolean, default=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    def __repr__(self):
        return f"<CustomCategory {self.name}>"


class Staff(db.Model):
    __tablename__ = "staff"

    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(120), nullable=False)
    phone = db.Column(db.String(20))
    active = db.Column(db.Boolean, default=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)


class StaffAttendance(db.Model):
    __tablename__ = "staff_attendance"

    id = db.Column(db.Integer, primary_key=True)
    staff_id = db.Column(db.Integer, db.ForeignKey("staff.id"), nullable=False)
    date = db.Column(db.Date, nullable=False)
    status = db.Column(db.String(20), default="present")  # present, absent, half_day

    staff = db.relationship("Staff", backref="attendances")


class Supplier(db.Model):
    __tablename__ = "suppliers"

    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(150), nullable=False)
    phone = db.Column(db.String(20))
    address = db.Column(db.Text)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)


class SupplierPurchase(db.Model):
    __tablename__ = "supplier_purchases"

    id = db.Column(db.Integer, primary_key=True)
    supplier_id = db.Column(db.Integer, db.ForeignKey("suppliers.id"), nullable=False)
    item_description = db.Column(db.String(250), nullable=False)
    category = db.Column(db.String(50))
    amount = db.Column(db.Float, nullable=False, default=0)
    gst_amount = db.Column(db.Float, default=0)          # GST paid on this transaction
    transaction_type = db.Column(db.String(20), default="purchase")  # purchase | return | gst
    date = db.Column(db.Date, default=date.today)
    notes = db.Column(db.Text)

    supplier = db.relationship("Supplier", backref="purchases")
