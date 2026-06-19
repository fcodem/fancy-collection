"""
Workspace launcher — run from the project root:

    python app.py

Starts the Flask app in the fancynew folder on http://localhost:5000
"""
import os
import runpy
import sys

ROOT = os.path.dirname(os.path.abspath(__file__))
APP_DIR = os.path.join(ROOT, "fancynew")

if not os.path.isdir(APP_DIR):
    print("Error: fancynew folder not found.")
    print("Expected:", APP_DIR)
    sys.exit(1)

os.chdir(APP_DIR)
sys.path.insert(0, APP_DIR)

runpy.run_path(os.path.join(APP_DIR, "app.py"), run_name="__main__")
