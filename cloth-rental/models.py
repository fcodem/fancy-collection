from datetime import datetime, date
from flask_sqlalchemy import SQLAlchemy

db = SQLAlchemy()


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

    rentals = db.relationship("Rental", back_populates="customer", lazy="dynamic")

    def __repr__(self):
        return f"<Customer {self.name}>"


class ClothingItem(db.Model):
    __tablename__ = "clothing_items"

    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(120), nullable=False)
    sku = db.Column(db.String(50), unique=True, nullable=False)
    category = db.Column(db.String(50), nullable=False)
    size = db.Column(db.String(20))
    color = db.Column(db.String(50))
    daily_rate = db.Column(db.Float, nullable=False, default=0)
    deposit = db.Column(db.Float, nullable=False, default=0)
    status = db.Column(db.String(20), default="available")  # available, rented, maintenance
    item_type = db.Column(db.String(20), default="clothing")  # clothing, jewellery, accessory
    photo = db.Column(db.String(255))  # filename of the uploaded photo
    condition_notes = db.Column(db.Text)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    rental_items = db.relationship("RentalItem", back_populates="item", lazy="dynamic")

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

    customer = db.relationship("Customer", back_populates="rentals")
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
    item = db.relationship("ClothingItem", back_populates="rental_items")


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
    contact_2 = db.Column(db.String(20))
    delivery_date = db.Column(db.Date, nullable=False)
    delivery_time = db.Column(db.String(10), nullable=False)
    return_date = db.Column(db.Date, nullable=False)
    return_time = db.Column(db.String(10), nullable=False)
    item_id = db.Column(db.Integer, db.ForeignKey("clothing_items.id"), nullable=False)
    dress_name = db.Column(db.String(150), nullable=False)
    price = db.Column(db.Float, nullable=False, default=0)
    advance = db.Column(db.Float, nullable=False, default=0)
    remaining = db.Column(db.Float, nullable=False, default=0)
    status = db.Column(db.String(20), default="booked")  # booked, delivered, returned, cancelled
    notes = db.Column(db.Text)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    item = db.relationship("ClothingItem")

    @property
    def is_delivery_today(self):
        return self.delivery_date == date.today()

    @property
    def is_return_today(self):
        return self.return_date == date.today()

    def __repr__(self):
        return f"<Booking {self.booking_number}>"
