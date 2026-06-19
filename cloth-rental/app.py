import os
import uuid
from datetime import date, datetime, timedelta
from flask import Flask, render_template, request, redirect, url_for, flash, jsonify
from werkzeug.utils import secure_filename

from models import db, Customer, ClothingItem, Rental, RentalItem, Invoice, Payment, Booking

app = Flask(__name__)
app.config["SECRET_KEY"] = os.environ.get("SECRET_KEY", "cloth-rental-dev-key-change-in-production")
app.config["SQLALCHEMY_DATABASE_URI"] = "sqlite:///" + os.path.join(
    os.path.dirname(os.path.abspath(__file__)), "cloth_rental.db"
)
app.config["SQLALCHEMY_TRACK_MODIFICATIONS"] = False

UPLOAD_FOLDER = os.path.join(os.path.dirname(os.path.abspath(__file__)), "static", "uploads")
os.makedirs(UPLOAD_FOLDER, exist_ok=True)
app.config["UPLOAD_FOLDER"] = UPLOAD_FOLDER
ALLOWED_EXTENSIONS = {"png", "jpg", "jpeg", "webp", "gif"}


def allowed_file(filename):
    return "." in filename and filename.rsplit(".", 1)[1].lower() in ALLOWED_EXTENSIONS


db.init_app(app)


@app.context_processor
def inject_now():
    from datetime import datetime
    return {"now": datetime.utcnow()}

CATEGORIES = [
    # Clothing
    "Saree", "Lehenga", "Sherwani", "Indowestern", "Jodhpuri", "Coat Suit",
    "Suit", "Gown", "Kurta", "Blazer",
    # Jewellery
    "Jewellery", "Necklace", "Bangles", "Earrings", "Maang Tikka", "Haath Phool",
    "Anklet", "Nose Ring", "Matha Patti",
    # Accessories
    "Accessory", "Dupatta", "Belt", "Clutch", "Crown/Tiara",
    "Other"
]
SIZES = ["XS", "S", "M", "L", "XL", "XXL", "Free Size", "Custom"]
PAYMENT_METHODS = ["cash", "card", "upi", "bank"]


def generate_number(prefix, model, field):
    today = date.today().strftime("%Y%m%d")
    count = model.query.filter(getattr(model, field).like(f"{prefix}-{today}-%")).count() + 1
    return f"{prefix}-{today}-{count:03d}"


def generate_item_sku():
    count = ClothingItem.query.count() + 1
    return f"ITM-{count:04d}"


def seed_database():
    if Customer.query.first():
        return

    customers = [
        Customer(name="Priya Sharma", phone="9876543210", email="priya@email.com", address="Mumbai"),
        Customer(name="Rahul Mehta", phone="9123456780", email="rahul@email.com", address="Delhi"),
        Customer(name="Anita Desai", phone="9988776655", email="anita@email.com", address="Pune"),
    ]
    db.session.add_all(customers)

    items = [
        ClothingItem(name="Red Bridal Lehenga", sku="LRG-001", category="Lehenga", item_type="clothing", size="M", color="Red", daily_rate=2500, deposit=10000),
        ClothingItem(name="Royal Blue Sherwani", sku="SHR-001", category="Sherwani", item_type="clothing", size="L", color="Blue", daily_rate=1800, deposit=8000),
        ClothingItem(name="Silk Wedding Saree", sku="SAR-001", category="Saree", item_type="clothing", size="Free Size", color="Gold", daily_rate=1200, deposit=5000),
        ClothingItem(name="Black Tuxedo Suit", sku="SUT-001", category="Suit", item_type="clothing", size="L", color="Black", daily_rate=1500, deposit=6000),
        ClothingItem(name="Evening Gown", sku="GWN-001", category="Gown", item_type="clothing", size="S", color="Navy", daily_rate=2000, deposit=7000),
        ClothingItem(name="Designer Kurta Set", sku="KRT-001", category="Kurta", item_type="clothing", size="M", color="Cream", daily_rate=800, deposit=3000),
        ClothingItem(name="Velvet Blazer", sku="BLZ-001", category="Blazer", item_type="clothing", size="L", color="Maroon", daily_rate=600, deposit=2500),
        ClothingItem(name="Pearl Necklace Bridal Set", sku="JWL-001", category="Necklace", item_type="jewellery", size="Free Size", color="White/Gold", daily_rate=500, deposit=3000),
        ClothingItem(name="Kundan Maang Tikka", sku="JWL-002", category="Maang Tikka", item_type="jewellery", size="Free Size", color="Gold/Red", daily_rate=300, deposit=1500),
        ClothingItem(name="Gold Bangles Set (12pc)", sku="JWL-003", category="Bangles", item_type="jewellery", size="2.6", color="Gold", daily_rate=400, deposit=2000),
        ClothingItem(name="Diamond Choker Set", sku="JWL-004", category="Jewellery", item_type="jewellery", size="Free Size", color="Silver/White", daily_rate=800, deposit=5000),
    ]
    db.session.add_all(items)
    db.session.commit()


# ── Dashboard ──────────────────────────────────────────────────────────────

@app.route("/")
def dashboard():
    today = date.today()
    total_items = ClothingItem.query.count()
    available_items = ClothingItem.query.filter_by(status="available").count()
    rented_items = ClothingItem.query.filter_by(status="rented").count()
    total_customers = Customer.query.count()
    active_rentals = Rental.query.filter(Rental.status.in_(["active", "overdue"])).count()
    overdue_rentals = Rental.query.filter(
        Rental.status == "active", Rental.end_date < today
    ).count()

    month_start = today.replace(day=1)
    monthly_revenue = db.session.query(db.func.sum(Payment.amount)).filter(
        Payment.paid_at >= datetime.combine(month_start, datetime.min.time())
    ).scalar() or 0

    outstanding = db.session.query(db.func.sum(Invoice.total - Invoice.amount_paid)).filter(
        Invoice.status.in_(["unpaid", "partial"])
    ).scalar() or 0

    recent_rentals = Rental.query.order_by(Rental.created_at.desc()).limit(5).all()
    upcoming_returns = Rental.query.filter(
        Rental.status == "active",
        Rental.end_date >= today,
        Rental.end_date <= today + timedelta(days=3),
    ).order_by(Rental.end_date).limit(5).all()

    overdue_list = Rental.query.filter(
        Rental.status == "active", Rental.end_date < today
    ).order_by(Rental.end_date).limit(5).all()

    inventory_items = ClothingItem.query.order_by(ClothingItem.category, ClothingItem.name).all()

    return render_template(
        "dashboard.html",
        stats={
            "total_items": total_items,
            "available_items": available_items,
            "rented_items": rented_items,
            "total_customers": total_customers,
            "active_rentals": active_rentals,
            "overdue_rentals": overdue_rentals,
            "monthly_revenue": monthly_revenue,
            "outstanding": outstanding,
        },
        recent_rentals=recent_rentals,
        upcoming_returns=upcoming_returns,
        overdue_list=overdue_list,
        inventory_items=inventory_items,
        categories=CATEGORIES,
        today=today,
    )


# ── Inventory ──────────────────────────────────────────────────────────────

@app.route("/inventory")
def inventory_list():
    category = request.args.get("category", "")
    status = request.args.get("status", "")
    search = request.args.get("q", "")

    query = ClothingItem.query
    if category:
        query = query.filter_by(category=category)
    if status:
        query = query.filter_by(status=status)
    if search:
        query = query.filter(
            db.or_(
                ClothingItem.name.ilike(f"%{search}%"),
                ClothingItem.sku.ilike(f"%{search}%"),
            )
        )
    items = query.order_by(ClothingItem.name).all()
    return render_template(
        "inventory/list.html",
        items=items,
        categories=CATEGORIES,
        current_category=category,
        current_status=status,
        search=search,
    )


@app.route("/inventory/add", methods=["GET", "POST"])
def inventory_add():
    if request.method == "POST":
        photo_filename = ""
        if "photo" in request.files:
            file = request.files["photo"]
            if file and file.filename and allowed_file(file.filename):
                ext = file.filename.rsplit(".", 1)[1].lower()
                photo_filename = f"{uuid.uuid4().hex}.{ext}"
                file.save(os.path.join(app.config["UPLOAD_FOLDER"], photo_filename))

        category = request.form["category"]
        item_type = "clothing"
        jewellery_cats = ["Jewellery", "Necklace", "Bangles", "Earrings", "Maang Tikka",
                          "Haath Phool", "Anklet", "Nose Ring", "Matha Patti"]
        accessory_cats = ["Accessory", "Dupatta", "Belt", "Clutch", "Crown/Tiara"]
        if category in jewellery_cats:
            item_type = "jewellery"
        elif category in accessory_cats:
            item_type = "accessory"

        item = ClothingItem(
            name=request.form["name"].strip(),
            sku=generate_item_sku(),
            category=category,
            size=request.form.get("size", ""),
            color=request.form.get("color", ""),
            daily_rate=float(request.form.get("daily_rate", 0)),
            deposit=float(request.form.get("deposit", 0)),
            condition_notes=request.form.get("condition_notes", ""),
            item_type=item_type,
            photo=photo_filename,
        )
        db.session.add(item)
        db.session.commit()
        flash(f"Item '{item.name}' added successfully.", "success")
        return redirect(url_for("inventory_list"))

    return render_template("inventory/form.html", item=None, categories=CATEGORIES, sizes=SIZES)


@app.route("/inventory/<int:id>/edit", methods=["GET", "POST"])
def inventory_edit(id):
    item = ClothingItem.query.get_or_404(id)
    if request.method == "POST":
        item.name = request.form["name"].strip()
        item.category = request.form["category"]
        item.size = request.form.get("size", "")
        item.color = request.form.get("color", "")
        item.daily_rate = float(request.form.get("daily_rate", 0))
        item.deposit = float(request.form.get("deposit", 0))
        item.status = request.form.get("status", item.status)
        item.condition_notes = request.form.get("condition_notes", "")

        category = item.category
        jewellery_cats = ["Jewellery", "Necklace", "Bangles", "Earrings", "Maang Tikka",
                          "Haath Phool", "Anklet", "Nose Ring", "Matha Patti"]
        accessory_cats = ["Accessory", "Dupatta", "Belt", "Clutch", "Crown/Tiara"]
        if category in jewellery_cats:
            item.item_type = "jewellery"
        elif category in accessory_cats:
            item.item_type = "accessory"
        else:
            item.item_type = "clothing"

        if "photo" in request.files:
            file = request.files["photo"]
            if file and file.filename and allowed_file(file.filename):
                if item.photo:
                    old_path = os.path.join(app.config["UPLOAD_FOLDER"], item.photo)
                    if os.path.exists(old_path):
                        os.remove(old_path)
                ext = file.filename.rsplit(".", 1)[1].lower()
                photo_filename = f"{uuid.uuid4().hex}.{ext}"
                file.save(os.path.join(app.config["UPLOAD_FOLDER"], photo_filename))
                item.photo = photo_filename

        db.session.commit()
        flash("Item updated successfully.", "success")
        return redirect(url_for("inventory_list"))

    return render_template("inventory/form.html", item=item, categories=CATEGORIES, sizes=SIZES)


@app.route("/inventory/<int:id>/delete", methods=["POST"])
def inventory_delete(id):
    item = ClothingItem.query.get_or_404(id)
    if item.status == "rented":
        flash("Cannot delete an item that is currently rented.", "error")
        return redirect(url_for("inventory_list"))
    db.session.delete(item)
    db.session.commit()
    flash("Item deleted.", "success")
    return redirect(url_for("inventory_list"))


# ── Customers ──────────────────────────────────────────────────────────────

@app.route("/customers")
def customers_list():
    search = request.args.get("q", "")
    query = Customer.query
    if search:
        query = query.filter(
            db.or_(
                Customer.name.ilike(f"%{search}%"),
                Customer.phone.ilike(f"%{search}%"),
            )
        )
    customers = query.order_by(Customer.name).all()
    return render_template("customers/list.html", customers=customers, search=search)


@app.route("/customers/add", methods=["GET", "POST"])
def customers_add():
    if request.method == "POST":
        customer = Customer(
            name=request.form["name"].strip(),
            phone=request.form["phone"].strip(),
            email=request.form.get("email", "").strip(),
            address=request.form.get("address", "").strip(),
            id_proof=request.form.get("id_proof", "").strip(),
            notes=request.form.get("notes", "").strip(),
        )
        db.session.add(customer)
        db.session.commit()
        flash(f"Customer '{customer.name}' added.", "success")
        return redirect(url_for("customers_list"))

    return render_template("customers/form.html", customer=None)


@app.route("/customers/<int:id>")
def customers_view(id):
    customer = Customer.query.get_or_404(id)
    rentals = customer.rentals.order_by(Rental.created_at.desc()).all()
    return render_template("customers/view.html", customer=customer, rentals=rentals)


@app.route("/customers/<int:id>/edit", methods=["GET", "POST"])
def customers_edit(id):
    customer = Customer.query.get_or_404(id)
    if request.method == "POST":
        customer.name = request.form["name"].strip()
        customer.phone = request.form["phone"].strip()
        customer.email = request.form.get("email", "").strip()
        customer.address = request.form.get("address", "").strip()
        customer.id_proof = request.form.get("id_proof", "").strip()
        customer.notes = request.form.get("notes", "").strip()
        db.session.commit()
        flash("Customer updated.", "success")
        return redirect(url_for("customers_view", id=id))

    return render_template("customers/form.html", customer=customer)


@app.route("/customers/<int:id>/delete", methods=["POST"])
def customers_delete(id):
    customer = Customer.query.get_or_404(id)
    if customer.rentals.count() > 0:
        flash("Cannot delete customer with rental history.", "error")
        return redirect(url_for("customers_view", id=id))
    db.session.delete(customer)
    db.session.commit()
    flash("Customer deleted.", "success")
    return redirect(url_for("customers_list"))


# ── Rentals ──────────────────────────────────────────────────────────────

@app.route("/rentals")
def rentals_list():
    status = request.args.get("status", "")
    query = Rental.query
    if status:
        query = query.filter_by(status=status)
    rentals = query.order_by(Rental.created_at.desc()).all()

    for rental in rentals:
        if rental.status == "active" and rental.is_overdue:
            rental.status = "overdue"
    db.session.commit()

    return render_template("rentals/list.html", rentals=rentals, current_status=status)


@app.route("/rentals/add", methods=["GET", "POST"])
def rentals_add():
    if request.method == "POST":
        customer_id = int(request.form["customer_id"])
        start_date = date.fromisoformat(request.form["start_date"])
        end_date = date.fromisoformat(request.form["end_date"])
        item_ids = request.form.getlist("item_ids")

        if end_date < start_date:
            flash("End date must be after start date.", "error")
            return redirect(url_for("rentals_add"))
        if not item_ids:
            flash("Select at least one item.", "error")
            return redirect(url_for("rentals_add"))

        rental = Rental(
            rental_number=generate_number("RNT", Rental, "rental_number"),
            customer_id=customer_id,
            start_date=start_date,
            end_date=end_date,
            discount=float(request.form.get("discount", 0)),
            notes=request.form.get("notes", ""),
        )
        db.session.add(rental)
        db.session.flush()

        for item_id in item_ids:
            item = ClothingItem.query.get(int(item_id))
            if not item or item.status != "available":
                db.session.rollback()
                flash(f"Item '{item.name if item else item_id}' is not available.", "error")
                return redirect(url_for("rentals_add"))

            ri = RentalItem(
                rental_id=rental.id,
                item_id=item.id,
                daily_rate=item.daily_rate,
                deposit=item.deposit,
            )
            db.session.add(ri)
            item.status = "rented"

        rental.recalculate_totals()
        db.session.commit()

        invoice = Invoice(
            invoice_number=generate_number("INV", Invoice, "invoice_number"),
            rental_id=rental.id,
            due_date=end_date,
            subtotal=rental.total_amount,
            total=rental.total_amount,
        )
        db.session.add(invoice)
        db.session.commit()

        flash(f"Rental {rental.rental_number} created with invoice {invoice.invoice_number}.", "success")
        return redirect(url_for("rentals_view", id=rental.id))

    customers = Customer.query.order_by(Customer.name).all()
    available_items = ClothingItem.query.filter_by(status="available").order_by(ClothingItem.name).all()
    return render_template(
        "rentals/form.html",
        rental=None,
        customers=customers,
        available_items=available_items,
        today=date.today().isoformat(),
    )


@app.route("/rentals/<int:id>")
def rentals_view(id):
    rental = Rental.query.get_or_404(id)
    invoice = rental.invoices.first()
    return render_template("rentals/view.html", rental=rental, invoice=invoice, today=date.today())


@app.route("/rentals/<int:id>/return", methods=["POST"])
def rentals_return(id):
    rental = Rental.query.get_or_404(id)
    if rental.status in ("returned", "cancelled"):
        flash("Rental already closed.", "error")
        return redirect(url_for("rentals_view", id=id))

    return_date = date.fromisoformat(request.form.get("return_date", date.today().isoformat()))
    rental.actual_return_date = return_date
    rental.damage_fee = float(request.form.get("damage_fee", 0))
    rental.late_fee = float(request.form.get("late_fee", 0))

    if return_date > rental.end_date:
        extra_days = (return_date - rental.end_date).days
        daily_total = sum(ri.daily_rate for ri in rental.items)
        if rental.late_fee == 0:
            rental.late_fee = extra_days * daily_total * 0.5

    rental.recalculate_totals()
    rental.status = "returned"

    for ri in rental.items:
        ri.item.status = "available"

    invoice = rental.invoices.first()
    if invoice:
        invoice.subtotal = rental.total_amount
        invoice.total = rental.total_amount + invoice.tax_amount
        invoice.update_status()

    db.session.commit()
    flash(f"Rental {rental.rental_number} marked as returned.", "success")
    return redirect(url_for("rentals_view", id=id))


@app.route("/rentals/<int:id>/cancel", methods=["POST"])
def rentals_cancel(id):
    rental = Rental.query.get_or_404(id)
    if rental.status != "active":
        flash("Only active rentals can be cancelled.", "error")
        return redirect(url_for("rentals_view", id=id))

    for ri in rental.items:
        ri.item.status = "available"
    rental.status = "cancelled"
    db.session.commit()
    flash("Rental cancelled.", "success")
    return redirect(url_for("rentals_list"))


# ── Invoices & Billing ──────────────────────────────────────────────────────

@app.route("/billing")
def billing_list():
    status = request.args.get("status", "")
    query = Invoice.query
    if status:
        query = query.filter_by(status=status)
    invoices = query.order_by(Invoice.created_at.desc()).all()
    total_outstanding = sum(inv.balance_due for inv in invoices if inv.status != "paid")
    return render_template(
        "billing/list.html",
        invoices=invoices,
        current_status=status,
        total_outstanding=total_outstanding,
    )


@app.route("/billing/<int:id>")
def billing_view(id):
    invoice = Invoice.query.get_or_404(id)
    return render_template("billing/view.html", invoice=invoice, payment_methods=PAYMENT_METHODS)


@app.route("/billing/<int:id>/pay", methods=["POST"])
def billing_pay(id):
    invoice = Invoice.query.get_or_404(id)
    amount = float(request.form["amount"])
    if amount <= 0:
        flash("Payment amount must be positive.", "error")
        return redirect(url_for("billing_view", id=id))

    payment = Payment(
        invoice_id=invoice.id,
        amount=amount,
        method=request.form.get("method", "cash"),
        reference=request.form.get("reference", ""),
        notes=request.form.get("notes", ""),
    )
    db.session.add(payment)
    invoice.amount_paid += amount
    invoice.update_status()
    db.session.commit()
    flash(f"Payment of ₹{amount:,.2f} recorded.", "success")
    return redirect(url_for("billing_view", id=id))


@app.route("/billing/<int:id>/print")
def billing_print(id):
    invoice = Invoice.query.get_or_404(id)
    return render_template("billing/print.html", invoice=invoice)


# ── Reports ──────────────────────────────────────────────────────────────

@app.route("/reports")
def reports():
    today = date.today()
    month_start = today.replace(day=1)

    monthly_payments = Payment.query.filter(
        Payment.paid_at >= datetime.combine(month_start, datetime.min.time())
    ).all()
    monthly_revenue = sum(p.amount for p in monthly_payments)

    total_rentals = Rental.query.count()
    completed_rentals = Rental.query.filter_by(status="returned").count()

    popular = (
        db.session.query(ClothingItem.name, db.func.count(RentalItem.id).label("times"))
        .join(RentalItem, RentalItem.item_id == ClothingItem.id)
        .group_by(ClothingItem.id)
        .order_by(db.desc("times"))
        .limit(5)
        .all()
    )

    revenue_by_method = (
        db.session.query(Payment.method, db.func.sum(Payment.amount))
        .filter(Payment.paid_at >= datetime.combine(month_start, datetime.min.time()))
        .group_by(Payment.method)
        .all()
    )

    return render_template(
        "reports.html",
        monthly_revenue=monthly_revenue,
        total_rentals=total_rentals,
        completed_rentals=completed_rentals,
        popular=popular,
        revenue_by_method=revenue_by_method,
        month_name=month_start.strftime("%B %Y"),
    )


# ── Booking Panel ──────────────────────────────────────────────────────────────

@app.route("/booking")
def booking_panel():
    bookings = Booking.query.order_by(Booking.created_at.desc()).all()
    return render_template("booking/panel.html", bookings=bookings, today=date.today())


@app.route("/booking/new", methods=["GET", "POST"])
def booking_new():
    if request.method == "POST":
        customer_name = request.form["customer_name"].strip()
        customer_address = request.form["customer_address"].strip()
        contact_1 = request.form["contact_1"].strip()
        contact_2 = request.form.get("contact_2", "").strip()
        delivery_date = date.fromisoformat(request.form["delivery_date"])
        delivery_time = request.form["delivery_time"].strip()
        return_date = date.fromisoformat(request.form["return_date"])
        return_time = request.form["return_time"].strip()
        item_id = int(request.form["item_id"])
        dress_name = request.form["dress_name"].strip()
        price = float(request.form["price"])
        advance = float(request.form.get("advance", 0))
        remaining = price - advance
        notes = request.form.get("notes", "").strip()

        if return_date < delivery_date:
            flash("Return date must be after delivery date.", "error")
            return redirect(url_for("booking_new"))

        item = ClothingItem.query.get(item_id)
        if not item:
            flash("Selected dress not found.", "error")
            return redirect(url_for("booking_new"))

        booking_number = generate_number("BKG", Booking, "booking_number")

        # Calculate monthly serial number (resets each month)
        today_date = date.today()
        month_start = today_date.replace(day=1)
        month_booking_count = Booking.query.filter(
            Booking.created_at >= datetime.combine(month_start, datetime.min.time())
        ).count()
        monthly_serial = month_booking_count + 1

        booking = Booking(
            booking_number=booking_number,
            monthly_serial=monthly_serial,
            customer_name=customer_name,
            customer_address=customer_address,
            contact_1=contact_1,
            contact_2=contact_2,
            delivery_date=delivery_date,
            delivery_time=delivery_time,
            return_date=return_date,
            return_time=return_time,
            item_id=item_id,
            dress_name=dress_name,
            price=price,
            advance=advance,
            remaining=remaining,
            notes=notes,
        )
        db.session.add(booking)
        item.status = "rented"
        db.session.commit()

        flash(f"Booking {booking_number} created successfully! Remaining: ₹{remaining:,.0f}", "success")
        return redirect(url_for("booking_view", id=booking.id))

    return render_template("booking/form.html", today=date.today().isoformat())


@app.route("/booking/<int:id>")
def booking_view(id):
    booking = Booking.query.get_or_404(id)
    return render_template("booking/view.html", booking=booking, today=date.today())


@app.route("/booking/<int:id>/deliver", methods=["POST"])
def booking_deliver(id):
    booking = Booking.query.get_or_404(id)
    if booking.status != "booked":
        flash("Booking is not in 'booked' status.", "error")
        return redirect(url_for("booking_view", id=id))
    booking.status = "delivered"
    db.session.commit()
    flash(f"Booking {booking.booking_number} marked as delivered.", "success")
    return redirect(url_for("booking_view", id=id))


@app.route("/booking/<int:id>/return", methods=["POST"])
def booking_return(id):
    booking = Booking.query.get_or_404(id)
    if booking.status not in ("booked", "delivered"):
        flash("Cannot return this booking.", "error")
        return redirect(url_for("booking_view", id=id))
    booking.status = "returned"
    booking.item.status = "available"
    db.session.commit()
    flash(f"Booking {booking.booking_number} marked as returned. Dress is now available.", "success")
    return redirect(url_for("booking_view", id=id))


@app.route("/booking/<int:id>/cancel", methods=["POST"])
def booking_cancel(id):
    booking = Booking.query.get_or_404(id)
    if booking.status in ("returned", "cancelled"):
        flash("Cannot cancel this booking.", "error")
        return redirect(url_for("booking_view", id=id))
    booking.status = "cancelled"
    booking.item.status = "available"
    db.session.commit()
    flash(f"Booking {booking.booking_number} cancelled.", "success")
    return redirect(url_for("booking_panel"))


@app.route("/api/booking/available-items")
def api_booking_available_items():
    """Get items that are FREE (available) between delivery_date and return_date."""
    delivery_date_str = request.args.get("delivery_date", "")
    return_date_str = request.args.get("return_date", "")

    if not delivery_date_str or not return_date_str:
        return jsonify({"free_items": [], "returning_items": []})

    try:
        d_date = date.fromisoformat(delivery_date_str)
        r_date = date.fromisoformat(return_date_str)
    except ValueError:
        return jsonify({"free_items": [], "returning_items": []})

    # Items currently available (not rented/booked)
    all_items = ClothingItem.query.filter(
        ClothingItem.status != "maintenance"
    ).all()

    # Get IDs of items that have active bookings overlapping with the requested period
    overlapping_bookings = Booking.query.filter(
        Booking.status.in_(["booked", "delivered"]),
        Booking.delivery_date <= r_date,
        Booking.return_date >= d_date,
    ).all()
    booked_item_ids = {b.item_id for b in overlapping_bookings}

    # Get IDs of items in active rentals overlapping
    overlapping_rentals = Rental.query.filter(
        Rental.status.in_(["active", "overdue"]),
        Rental.start_date <= r_date,
        Rental.end_date >= d_date,
    ).all()
    rented_item_ids = set()
    for rental in overlapping_rentals:
        for ri in rental.items:
            rented_item_ids.add(ri.item_id)

    busy_ids = booked_item_ids | rented_item_ids

    free_items = [
        {"id": i.id, "name": i.name, "sku": i.sku, "category": i.category,
         "color": i.color, "size": i.size, "item_type": i.item_type}
        for i in all_items if i.id not in busy_ids
    ]

    # Items returning ON the delivery date (might become available)
    returning_on_delivery = Booking.query.filter(
        Booking.status.in_(["booked", "delivered"]),
        Booking.return_date == d_date,
    ).all()

    # Also check rentals ending on delivery date
    rentals_ending = Rental.query.filter(
        Rental.status.in_(["active", "overdue"]),
        Rental.end_date == d_date,
    ).all()

    returning_items = []
    seen_ids = set()
    for b in returning_on_delivery:
        if b.item_id not in seen_ids:
            returning_items.append({
                "id": b.item_id,
                "name": b.dress_name,
                "return_time": b.return_time,
                "customer": b.customer_name,
                "type": "booking",
            })
            seen_ids.add(b.item_id)

    for rental in rentals_ending:
        for ri in rental.items:
            if ri.item_id not in seen_ids:
                returning_items.append({
                    "id": ri.item_id,
                    "name": ri.item.name,
                    "return_time": "—",
                    "customer": rental.customer.name,
                    "type": "rental",
                })
                seen_ids.add(ri.item_id)

    return jsonify({"free_items": free_items, "returning_items": returning_items})


# ── API helpers ──────────────────────────────────────────────────────────────

@app.route("/api/items/available")
def api_available_items():
    items = ClothingItem.query.filter_by(status="available").all()
    return jsonify([
        {"id": i.id, "name": i.name, "sku": i.sku, "daily_rate": i.daily_rate, "deposit": i.deposit}
        for i in items
    ])


if __name__ == "__main__":
    with app.app_context():
        db.create_all()
        seed_database()
    app.run(debug=True, port=5000)
