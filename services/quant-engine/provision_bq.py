"""
One-shot BigQuery table provisioner script.
Run locally: python provision_bq.py
Requires: google-cloud-bigquery, Application Default Credentials
"""

import sys
import os

# Allow running from repo root
sys.path.insert(0, os.path.join(os.path.dirname(__file__)))

from app.core.config import settings
from app.bigquery.provisioner import provision_all_tables
from app.bigquery.client import check_connectivity

print(f"=== Deplyze Quant V3 — BigQuery Provisioner ===")
print(f"Project: {settings.GCP_PROJECT_ID}")
print(f"Location: {settings.BIGQUERY_LOCATION}")
print()

# Check connectivity first
print("Checking BigQuery connectivity...")
status = check_connectivity()
if not status.get("connected"):
    print(f"ERROR: Cannot connect to BigQuery: {status.get('error')}")
    sys.exit(1)

print(f"Connected OK  Datasets found: {status['datasets']}")
print()
print("Provisioning tables (idempotent — safe to run multiple times)...")
print()

results = provision_all_tables()

print(f"Created:         {len(results['created'])}")
print(f"Already existed: {len(results['exists'])}")
print(f"Errors:          {len(results['errors'])}")

if results["created"]:
    print("\nNewly created tables:")
    for t in results["created"]:
        print(f"  + {t}")

if results["errors"]:
    print("\nErrors:")
    for e in results["errors"]:
        print(f"  X {e}")
    sys.exit(1)

print("\n=== Provisioning complete ===")
