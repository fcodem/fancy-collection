import sys
import os

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app import app, db

app.config["SQLALCHEMY_DATABASE_URI"] = "sqlite:////tmp/cloth_rental.db"

with app.app_context():
    db.create_all()

# Vercel expects the WSGI app to be named 'app'
